/* Account reporting only. No broker, trading, or network operations. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MonthlyPerformance = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const METHOD = "RETURN_ON_NET_CONTRIBUTIONS";
  const calendar = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit"
  });
  const NOTE = "Return on net contributions: P&L divided by opening equity plus net external cash flow. " +
    "P&L includes realized and unrealized account changes after deposits and withdrawals. " +
    "These monthly returns are not chainable time-weighted returns. " +
    "Maximum drawdown uses a cash-flow-neutral index of recorded observations, including documented pre-flow valuations; intraday extremes are not measured. " +
    "Dates follow the New York market calendar. A dash means the required records are unavailable.";

  function number(value) {
    if (typeof value !== "number" && typeof value !== "string") return null;
    if (typeof value === "string" && !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }
  function timestamp(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
    // The public equity producer writes naive UTC timestamps. Do not parse them in the browser's local zone.
    const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : value + "Z";
    const result = Date.parse(normalized);
    if (!Number.isFinite(result)) return null;
    // Date.parse normalizes impossible calendar dates (e.g. February 30).
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
    return result;
  }
  function dayAt(value) {
    const parts = Object.fromEntries(calendar.formatToParts(new Date(value)).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function monthAt(value) { return dayAt(value).slice(0, 7); }
  function label(month) {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" })
      .format(new Date(month + "-15T12:00:00Z"));
  }
  function shortDate(value) {
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })
      .format(new Date(value));
  }
  function nextMonth(month) {
    const [y, m] = month.split("-").map(Number);
    return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  }
  function lastWeekday(month) {
    const [y, m] = month.split("-").map(Number);
    const date = new Date(Date.UTC(y, m, 0));
    while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }
  function sameMoney(a, b) { return Math.abs(a - b) <= 0.011; }
  function unavailable(reason) {
    return { rows: [], note: reason + " " + NOTE, method: METHOD, asOf: null, issues: [reason] };
  }
  function selectView(dashboard, accountKey) {
    const views = dashboard.account_views;
    if (views && typeof views === "object" && !Array.isArray(views)) {
      if (accountKey) return views[accountKey] || null;
      const entries = Object.values(views).filter(v => v && typeof v === "object" && v.account);
      return entries.length === 1 ? entries[0] : null;
    }
    return dashboard.account ? dashboard : null;
  }
  function ledgerFor(account, asOf, inception) {
    const events = account.external_cash_flows;
    if (account.cash_flow_ledger_schema_version !== 1 || account.cash_flow_ledger_policy !== "APPEND_ONLY" || !Array.isArray(events)) {
      return { error: "A complete versioned external cash-flow ledger is required." };
    }
    const seen = new Set();
    const flows = [];
    for (const event of events) {
      if (!event || typeof event !== "object") return { error: "The cash-flow ledger contains an invalid event." };
      const time = timestamp(event.effective_at_utc);
      const known = timestamp(event.first_observed_at_utc);
      const amount = number(event.amount);
      const id = event.event_id;
      if (typeof id !== "string" || !id.trim() || seen.has(id) || time === null || known === null || amount === null || amount === 0 ||
          event.performance_treatment !== "EXTERNAL_CASH_FLOW" || typeof event.provenance !== "string" || !event.provenance.trim() ||
          !((event.kind === "DEPOSIT" && amount > 0) || (event.kind === "WITHDRAWAL" && amount < 0))) {
        return { error: "The cash-flow ledger has duplicate, missing, or inconsistent event data." };
      }
      seen.add(id);
      if (time > asOf) continue;
      if (time <= inception || known > asOf) return { error: "Cash-flow timing cannot be reconciled to the account period." };
      flows.push({ time, amount, pre: number(event.pre_flow_equity), id });
    }
    flows.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
    const net = flows.reduce((sum, flow) => sum + flow.amount, 0);
    if (account.cash_flow_event_count !== flows.length || number(account.net_external_cash_flow) === null ||
        !sameMoney(number(account.net_external_cash_flow), net)) return { error: "Cash-flow ledger totals do not reconcile to the account." };
    return { flows };
  }
  function tradeCounts(view, inception, asOf) {
    if (!Array.isArray(view.trade_history)) return null;
    const trades = new Map();
    for (const trade of view.trade_history) {
      if (trade.event !== "EXIT") continue;
      const time = timestamp(trade.ts_utc);
      if (time === null || typeof trade.trade_id !== "string" || !trade.trade_id.trim()) return null;
      if (time <= inception || time > asOf) continue;
      if (view.profile && trade.broker_profile !== view.profile) return null;
      if (trades.has(trade.trade_id) && trades.get(trade.trade_id) !== time) return null;
      trades.set(trade.trade_id, time);
    }
    const expected = number(view.performance && view.performance.closed_trades_count);
    if (expected === null || !Number.isInteger(expected) || expected !== trades.size) return null;
    return Array.from(trades.values());
  }
  function observedDrawdown(start, observations, flows) {
    if (!(start.value > 0)) return null;
    let anchor = start.value, factor = 1, peak = 1, worst = 0;
    const events = [
      ...observations.map(point => ({ time: point.time, point })),
      ...flows.map(flow => ({ time: flow.time, flow }))
    ].sort((a, b) => a.time - b.time || (a.flow ? -1 : 1));
    let previousFlowTime = null;
    for (const event of events) {
      let nav;
      if (event.flow) {
        const flow = event.flow;
        // Multiple flows with the same timestamp have no dependable economic ordering.
        if (flow.time === previousFlowTime || !(flow.pre > 0) || !(flow.pre + flow.amount > 0)) return null;
        factor *= flow.pre / anchor;
        anchor = flow.pre + flow.amount;
        previousFlowTime = flow.time;
        nav = factor;
      } else {
        nav = factor * event.point.value / anchor;
      }
      if (!Number.isFinite(nav) || nav < 0) return null;
      peak = Math.max(peak, nav);
      worst = Math.min(worst, nav / peak - 1);
    }
    return worst * 100;
  }

  function build(dashboard, options = {}) {
    if (!dashboard || typeof dashboard !== "object") return unavailable("Account performance records are unavailable.");
    const view = selectView(dashboard, options.accountKey);
    if (!view) return unavailable("Select one account with its own equity and cash-flow history.");
    const account = view.account || {};
    const inception = timestamp(view.public_reset_start || account.public_reset_start || dashboard.public_reset_start);
    const asOf = timestamp(account.asof);
    const now = options.now === undefined ? Date.now() : (options.now instanceof Date ? options.now.getTime() : timestamp(options.now));
    const initial = number(account.inception_equity);
    const current = number(account.equity);
    if (inception === null || asOf === null || now === null || !Number.isFinite(now) || asOf > now || asOf < inception ||
        !(initial > 0) || current === null || current < 0) return unavailable("Dated inception and current account equity are required.");
    if (account.performance_method !== METHOD) return unavailable("The account return method is not supported by this monthly view.");
    if (!Array.isArray(view.equity_curve)) return unavailable("Recorded account equity history is unavailable.");
    const issues = [];
    const points = new Map();
    points.set(inception, { time: inception, value: initial });
    for (const point of view.equity_curve) {
      const time = timestamp(point.ts);
      const value = number(point.raw_equity === undefined ? point.equity : point.raw_equity);
      if (time === null || value === null || value < 0) return unavailable("An equity observation has an invalid timestamp or balance.");
      if (time < inception || time > asOf) continue;
      if (points.has(time) && !sameMoney(points.get(time).value, value)) return unavailable("Conflicting account balances share the same timestamp.");
      points.set(time, { time, value });
    }
    if (points.has(asOf) && !sameMoney(points.get(asOf).value, current)) return unavailable("The current equity and its recorded observation disagree.");
    points.set(asOf, { time: asOf, value: current });
    const ordered = Array.from(points.values()).sort((a, b) => a.time - b.time);
    const ledger = ledgerFor(account, asOf, inception);
    if (ledger.error) issues.push(ledger.error);
    const closed = tradeCounts(view, inception, asOf);
    if (closed === null) issues.push("Closed-trade records do not establish a complete count.");
    const rows = [];
    const firstMonth = monthAt(inception), lastMonth = monthAt(asOf), currentMonth = monthAt(now);
    // A corrupt decades-long inception date must not create an unbounded browser loop.
    if (Number(lastMonth.slice(0, 4)) - Number(firstMonth.slice(0, 4)) > 100) return unavailable("The account period is outside the supported reporting range.");
    let opening = { time: inception, value: initial };
    for (let month = firstMonth; month <= lastMonth; month = nextMonth(month)) {
      const observations = ordered.filter(point => monthAt(point.time) === month && point.time > (opening ? opening.time : -Infinity));
      const ending = observations.length ? observations[observations.length - 1] : null;
      const notes = [];
      const isMtd = month === currentMonth;
      // Without an exchange-holiday calendar, an earlier final observation does not prove month-end coverage.
      const hasClose = ending && dayAt(ending.time) === lastWeekday(month);
      const uncoveredFlow = !ledger.error && ending && ledger.flows.some(flow => monthAt(flow.time) === month && flow.time > ending.time);
      const availablePeriod = opening && ending && (isMtd || hasClose);
      let pnl = null, returnPct = null, drawdown = null;
      if (!opening) notes.push("The preceding month-end account balance is unavailable.");
      if (!ending) notes.push("No dated equity observation is available for this month.");
      else if (!isMtd && !hasClose) notes.push("Month-end coverage is unverified; the last observation is " + dayAt(ending.time) + ".");
      if (ledger.error) notes.push(ledger.error);
      if (availablePeriod && !ledger.error) {
        const flows = ledger.flows.filter(flow => flow.time > opening.time && flow.time <= ending.time);
        if (uncoveredFlow) notes.push("A recorded cash flow occurs after this month's final equity observation.");
        else {
          const net = flows.reduce((sum, flow) => sum + flow.amount, 0);
          pnl = ending.value - opening.value - net;
          const denominator = opening.value + net;
          if (denominator > 0) returnPct = 100 * pnl / denominator;
          else notes.push("Net contributed capital is not positive, so the monthly return is undefined.");
          drawdown = observedDrawdown(opening, observations, flows);
          if (drawdown === null) notes.push("Cash-flow valuations do not support a comparable drawdown series.");
        }
      }
      const periodLabel = isMtd ? `MTD · through ${shortDate(ending ? ending.time : asOf)}` :
        (month === firstMonth ? `Since ${shortDate(inception)}` : (hasClose ? "Recorded month end" : "Incomplete records"));
      rows.push({
        month, month_label: label(month), period_label: periodLabel,
        return_pct: returnPct, net_pnl: pnl, max_dd_pct: drawdown,
        trades: closed === null ? null : closed.filter(time => monthAt(time) === month).length,
        period_start: opening ? new Date(opening.time).toISOString() : null,
        period_end: ending ? new Date(ending.time).toISOString() : null,
        status: returnPct === null ? "unavailable" : (isMtd ? "month_to_date" : "recorded"), notes
      });
      // Do not bridge an unobserved month and mislabel the combined change as a single month's return.
      opening = hasClose && !uncoveredFlow ? ending : null;
    }
    return { rows, note: NOTE + (issues.length ? " " + issues.join(" ") : ""), method: METHOD,
      asOf: new Date(asOf).toISOString(), issues };
  }
  return { build };
});
