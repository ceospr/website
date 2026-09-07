"use strict";

/* Public, read-only published analysis. All data requests are same-origin,
   allowlisted files; no private research endpoints or runtime credentials. */
const EquityValuation = (() => {
  const SCHEMA = "spinoza.equity_valuation.v1";
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const normalize = value => String(value || "").trim().toUpperCase().replace(/[.-]([ABC])$/, ".$1");
  const available = value => value && ["ok", "estimated"].includes(value.status) && finite(value.value);
  const intrinsicAvailable = report => ["operating_dcf", "financial_residual_income", "reit_nav"].includes(report.valuation.basis) && report.valuation.review_required === false && !report.valuation.model_disagreement && available(report.valuation.intrinsic);
  const basisLabel = basis => ({operating_dcf: "Operating cash-flow model", financial_residual_income: "Financial-company model", reit_nav: "Property valuation model", relative_only: "Relative comparison only"}[basis] || "Estimate unavailable");
  const money = (value, currency = "USD") => !finite(value) ? "Unavailable" : !/^[A-Z]{3}$/.test(currency) ? `${value.toFixed(2)} (currency unavailable)` : new Intl.NumberFormat("en-US", {style: "currency", currency, maximumFractionDigits: 2}).format(value);
  const pct = value => finite(value) ? `${(value * 100).toFixed(1)}%` : "Unavailable";
  const day = value => /^\d{4}-\d{2}-\d{2}/.test(String(value || "")) ? String(value).slice(0, 10) : "Not recorded";
  const label = value => String(value || "").replace(/blended_fair_value/g, "intrinsic_estimate").replace(/blended_margin_of_safety/g, "estimated_upside_to_intrinsic_value").replace(/_/g, " ").replace(/\./g, " · ");
  function filter(companies, query, sector = "", basis = "") {
    const q = String(query || "").trim().toLowerCase();
    return companies.filter(c => (!q || normalize(c.symbol).includes(normalize(q)) || c.name.toLowerCase().includes(q)) &&
      (!sector || c.sector === sector) && (!basis || (basis === "intrinsic" && c.intrinsic_available) ||
      (basis === "relative" && c.relative_available) || (basis === "unavailable" && !c.intrinsic_available && !c.relative_available)));
  }
  function validateReport(report, entry) {
    if (report.schema_version !== SCHEMA || report.symbol !== entry.symbol || !report.valuation || !report.evidence || report.evidence.replay_verified !== true || !Array.isArray(report.annual_history)) throw new Error("Published report does not match the selected company.");
    return report;
  }
  function newestRequest() {
    let sequence = 0;
    return {next: () => ++sequence, current: token => token === sequence};
  }
  return {SCHEMA, finite, normalize, available, intrinsicAvailable, basisLabel, money, pct, day, label, filter, validateReport, newestRequest};
})();
if (typeof module !== "undefined" && module.exports) module.exports = EquityValuation;

if (typeof document !== "undefined") (async () => {
  const E = EquityValuation;
  const $ = id => document.getElementById(id);
  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  };
  const para = (parent, content, className = "ev-caption") => parent.appendChild(el("p", className, content));
  const section = title => { const node = el("section", "ev-card"); node.appendChild(el("h2", "", title)); return node; };
  const link = (text, href, className = "ev-source-link") => {
    const node = el("a", className, text); node.href = href;
    if (href.startsWith("https://")) {node.target = "_blank"; node.rel = "noopener noreferrer";}
    return node;
  };
  const details = (parent, title, lines) => {
    if (!lines.length) return;
    const node = el("details", "ev-details"); node.appendChild(el("summary", "", title));
    const list = el("ul", "ev-small-list"); lines.forEach(line => list.appendChild(el("li", "", line)));
    node.appendChild(list); parent.appendChild(node);
  };
  let index, selected, activeController, shown = 30;
  const sequence = E.newestRequest();
  const cache = new Map();
  const reportPanel = $("report-panel");
  const params = new URLSearchParams(location.search);
  $("company-search").value = (params.get("q") || params.get("symbol") || "").slice(0, 100);
  $("year").textContent = String(new Date().getFullYear());

  function renderResults() {
    if (!index) return [];
    const results = E.filter(index.companies, $("company-search").value, $("sector-filter").value, $("basis-filter").value);
    $("search-status").textContent = `${results.length} ${results.length === 1 ? "company" : "companies"} found`;
    const list = $("company-results"); list.replaceChildren();
    results.slice(0, shown).forEach(company => {
      const li = el("li"); const button = el("button", "ev-company-button"); button.type = "button";
      button.setAttribute("aria-current", company.symbol === selected ? "true" : "false");
      button.appendChild(el("span", "ev-company-symbol", company.symbol)); button.appendChild(el("span", "ev-company-name", company.name));
      button.appendChild(el("span", "ev-company-status", E.basisLabel(company.basis)));
      button.addEventListener("click", () => selectCompany(company, true)); li.appendChild(button); list.appendChild(li);
    });
    $("more-results").hidden = results.length <= shown;
    if (!results.length) para(list, "No company matches these filters. Try a ticker, company name or another sector.");
    return results;
  }

  function renderReport(report, entry) {
    const fragment = document.createDocumentFragment();
    const head = el("section", "ev-report-heading");
    const top = el("div", "ev-symbol-line"); top.appendChild(el("span", "ev-symbol", report.symbol)); top.appendChild(el("span", "", report.sector));
    top.appendChild(el("span", "ev-status", E.basisLabel(report.valuation.basis))); head.appendChild(top);
    head.appendChild(el("h2", "", report.name)); para(head, report.industry);
    const supported = E.intrinsicAvailable(report);
    const values = el("dl", "ev-kpis");
    function kpi(title, value, note, missing = false) {
      const item = el("div", "ev-kpi"); item.appendChild(el("dt", "", title)); item.appendChild(el("dd", missing ? "ev-unavailable" : "", value)); item.appendChild(el("small", "", note)); values.appendChild(item);
    }
    kpi("Recorded closing price", E.money(report.quote.value, report.currency), `${report.currency} · ${E.day(report.quote.date)} · not live`, !E.finite(report.quote.value));
    kpi("Intrinsic estimate per share", supported ? E.money(report.valuation.intrinsic.value, report.currency) : "Unavailable", "Conditional model estimate", !supported);
    kpi("Intrinsic scenario range", supported && E.finite(report.valuation.low) && E.finite(report.valuation.high) ? `${E.money(report.valuation.low, report.currency)} – ${E.money(report.valuation.high, report.currency)}` : "Unavailable", "Sensitivity range; not a confidence interval", !(supported && E.finite(report.valuation.low) && E.finite(report.valuation.high)));
    const relative = E.available(report.valuation.relative);
    kpi("Relative-multiple estimate", relative ? E.money(report.valuation.relative.value, report.currency) : "Unavailable", "Comparison with historical / peer pricing", !relative);
    head.appendChild(values);
    const actions = el("div", "ev-actions");
    actions.appendChild(link("View SEC filings ↗", report.evidence.sec_filings_url, "ev-action"));
    const download = link("Download this summary", `data/${entry.file}`, "ev-action"); download.download = entry.file; actions.appendChild(download);
    const print = el("button", "ev-action", "Print report"); print.type = "button"; print.addEventListener("click", () => window.print()); actions.appendChild(print); head.appendChild(actions);
    fragment.appendChild(head);

    const conclusion = section(supported ? "Understanding the estimate" : "Why no intrinsic estimate is shown");
    para(conclusion, supported ? "The estimate depends on the archived operating assumptions, financing adjustments and source classifications. It is not a target date, probability or recommendation." : "The published analysis does not contain a supported intrinsic estimate for this company. The recorded stock price and any relative comparison remain separate observations.");
    if (report.valuation.review_required) para(conclusion, "A model review or reconciliation remains required.", "ev-notice");
    if (report.valuation.reasons.length) { const box = el("div", "ev-gap-box"); const list = el("ul"); report.valuation.reasons.forEach(reason => list.appendChild(el("li", "", reason))); box.appendChild(list); conclusion.appendChild(box); }
    else if (!supported) para(conclusion, "Required financial history, financing or ownership evidence is incomplete, or the applicable model is not supported by the captured inputs. Review the missing fields and recorded assumptions below.", "ev-gap-box");
    if (relative) para(conclusion, "The relative-multiple estimate is a pricing comparison. It does not establish that the shares are intrinsically undervalued or overvalued.");
    details(conclusion, `Unavailable inputs and calculations (${report.missing_fields.length})`, report.missing_fields.map(E.label));
    details(conclusion, "Recorded model assumptions", report.valuation.assumptions);
    details(conclusion, "Model limitations and warnings", report.valuation.warnings);
    fragment.appendChild(conclusion);

    const fundamentals = section("Financial measures");
    para(fundamentals, `Latest annual financial period: ${E.day(report.financial_period_end)}. Provider ratios and financial-statement calculations can use different periods. Open the calculation notes for each measure's basis.`);
    const grid = el("dl", "ev-fundamentals");
    Object.values(report.fundamentals).forEach(item => {
      const row = el("div", "ev-fundamental"); row.appendChild(el("dt", "", item.label));
      const display = E.available(item) ? (item.unit === "percent" ? E.pct(item.value) : `${item.value.toFixed(2)}×`) : (item.status === "not_applicable" ? "Not applicable" : "Unavailable");
      row.appendChild(el("dd", "", display)); grid.appendChild(row);
    }); fundamentals.appendChild(grid);
    details(fundamentals, "Calculation notes and data origin", Object.values(report.fundamentals).map(item => `${item.label} — ${item.origin}. ${item.note || "No additional basis recorded."}${item.status === "estimated" ? " This measure is estimated." : ""}`));
    fragment.appendChild(fundamentals);

    const annual = section("Annual operating history");
    para(annual, "Amounts in millions of each column's stated currency. A dash means unavailable, not zero. These are reported or reconciled inputs, not a forecast. Debt may have incomplete financing scope, and cash capital expenditure can exclude financed asset additions needed by the full model. Inspect the source notes before using these balances in a valuation.");
    if (!report.annual_history.length) para(annual, "No sourced annual operating panel is available in this published report.");
    else {
      const fields = new Map(); report.annual_history.forEach(year => Object.entries(year.fields).forEach(([key, value]) => fields.set(key, value.label)));
      const wrap = el("div", "ev-table-wrap"); const table = el("table", "ev-table"); const thead = el("thead"); const titles = el("tr"); titles.appendChild(el("th", "", "Financial input"));
      report.annual_history.forEach(year => {const th = el("th", "ev-number", E.day(year.period_end)); th.appendChild(el("small", "", year.currency)); titles.appendChild(th);}); thead.appendChild(titles); table.appendChild(thead);
      const body = el("tbody"); fields.forEach((name, key) => {const tr = el("tr"); const th = el("th", "", name); th.scope = "row"; tr.appendChild(th); report.annual_history.forEach(year => {const item = year.fields[key]; tr.appendChild(el("td", "ev-number", item && E.finite(item.value) ? (item.value / 1e6).toLocaleString("en-US", {maximumFractionDigits: 1}) : "—"));}); body.appendChild(tr);}); table.appendChild(body); wrap.appendChild(table); annual.appendChild(wrap);
      const sourceDetails = el("details", "ev-details"); sourceDetails.appendChild(el("summary", "", "Inspect the filing behind an annual input"));
      const sourceLabel = el("label", "ev-caption", "Annual period"); sourceLabel.htmlFor = "source-year"; const yearSelect = el("select", "ev-source-year"); yearSelect.id = "source-year";
      report.annual_history.forEach((year, i) => {const option = el("option", "", E.day(year.period_end)); option.value = String(i); yearSelect.appendChild(option);}); yearSelect.value = String(report.annual_history.length - 1); sourceLabel.appendChild(yearSelect); sourceDetails.appendChild(sourceLabel);
      const sourceTable = el("div", "ev-table-wrap"); sourceDetails.appendChild(sourceTable);
      function showSources() {
        sourceTable.replaceChildren();
        const year = report.annual_history[Number(yearSelect.value)];
        para(sourceTable, `Annual record available by ${E.day(year.available_at)}. Individual source filings below may have different dates; older periods can be restated in later filings.`);
        const table = el("table", "ev-table"); const tr = el("tr");
        ["Input / taxonomy concept", "Filed", "Filing"].forEach(title => tr.appendChild(el("th", "", title)));
        const thead = el("thead"); thead.appendChild(tr); table.appendChild(thead);
        const tbody = el("tbody");
        Object.values(year.fields).forEach(field => {
          const row = el("tr"); const cell = el("td", "", field.label);
          if (field.concept) cell.appendChild(el("div", "ev-caption", field.concept));
          if (field.label === "Reported debt balance") cell.appendChild(el("div", "ev-caption", `Financing scope: ${E.label(field.financing_scope) || "not established"}.`));
          row.appendChild(cell); row.appendChild(el("td", "", E.day(field.filed_at)));
          const source = el("td");
          if (field.filing_url && field.filing_url.startsWith("https://www.sec.gov/")) source.appendChild(link("SEC filing ↗", field.filing_url));
          else source.textContent = "Reconciled input; see issuer filings";
          row.appendChild(source); tbody.appendChild(row);
        });
        table.appendChild(tbody); sourceTable.appendChild(table);
      }
      yearSelect.addEventListener("change", showSources); showSources(); annual.appendChild(sourceDetails);
    } fragment.appendChild(annual);

    const risk = section("Risk evidence");
    para(risk, E.finite(report.risk.score) ? `Recorded model risk score: ${report.risk.score.toFixed(1)} / 100. This is a scoring rule, not a probability of loss.` : "Composite risk score unavailable. Missing adverse information is not treated as zero risk.");
    if (report.risk.missing.length) para(risk, `Required components unavailable: ${report.risk.missing.map(E.label).join(", ")}.`);
    details(risk, "Component evidence", report.risk.components.map(item => `${item.label}: ${E.finite(item.score) ? `${item.score.toFixed(1)} / 100` : item.status === "not_applicable" ? "not applicable" : "unavailable"}. ${item.explanation}`));
    fragment.appendChild(risk);

    const evidence = section("Dates and source record"); evidence.classList.add("ev-evidence");
    const dates = el("dl");
    [["Price observation", report.quote.date], ["Annual financial period", report.financial_period_end], ["Original collection (UTC)", report.collected_at], ["Screen decision (UTC)", index.decision_at], ["Report hash (SHA-256)", report.evidence.report_sha256]].forEach(([key, val]) => {dates.appendChild(el("dt", "", key)); dates.appendChild(el("dd", key.includes("SHA") ? "ev-hash" : "", val || "Not recorded"));}); evidence.appendChild(dates);
    para(evidence, "This is a compact public summary. Raw provider payloads and private research working files are not included. Its report hash identifies the complete archived calculation used for verification.");
    const market = report.market_inputs;
    details(evidence, "Archived market assumptions", [`Risk-free rate: ${E.pct(market.risk_free_rate)} (${market.risk_free_source || "source unavailable"}).`, `Equity risk premium: ${E.pct(market.equity_risk_premium)} (${market.erp_source || "source unavailable"}).`, `Market-assumption capture: ${market.as_of || "not recorded"}. A configured fallback is a policy assumption, not an observed market fact.`]);
    fragment.appendChild(evidence);
    reportPanel.replaceChildren(fragment);
  }

  async function selectCompany(entry, updateUrl) {
    selected = entry.symbol; const ticket = sequence.next();
    activeController?.abort(); activeController = new AbortController();
    renderResults(); reportPanel.setAttribute("aria-busy", "true");
    const loading = el("div", "ev-empty"); loading.appendChild(el("h2", "", `Loading ${entry.symbol}`)); para(loading, "Opening the published company report…"); reportPanel.replaceChildren(loading);
    if (updateUrl) {const url = new URL(location.href); url.searchParams.set("q", entry.symbol); url.searchParams.delete("symbol"); history.replaceState({}, "", url);}
    try {
      let report = cache.get(entry.symbol);
      if (!report) {
        if (!/^valuation-[A-Z0-9][A-Z0-9.-]{0,14}\.json$/.test(entry.file) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("Invalid published report reference.");
        const response = await fetch(`data/${entry.file}`, {signal: activeController.signal, cache: "no-cache"});
        if (!response.ok) throw new Error("The published report could not be loaded.");
        const bytes = await response.arrayBuffer();
        if (!globalThis.crypto?.subtle) throw new Error("A secure connection is required to verify this published report.");
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
        if (hash !== entry.sha256) throw new Error("This report does not match the published index. Reload the page to obtain the current release.");
        report = E.validateReport(JSON.parse(new TextDecoder().decode(bytes)), entry); cache.set(entry.symbol, report);
      }
      if (!sequence.current(ticket)) return;
      renderReport(report, entry); document.title = `${entry.symbol} — Equity Valuation | Spinoza Research`;
    } catch (error) {
      if (!sequence.current(ticket) || error.name === "AbortError") return;
      const empty = el("div", "ev-empty"); empty.appendChild(el("h2", "", "Report unavailable")); para(empty, error.message); const retry = el("button", "ev-action", "Try again"); retry.type = "button"; retry.addEventListener("click", () => selectCompany(entry, false)); empty.appendChild(retry); reportPanel.replaceChildren(empty);
    } finally {if (sequence.current(ticket)) reportPanel.setAttribute("aria-busy", "false");}
  }
  $("search-form").addEventListener("submit", event => {event.preventDefault(); shown = 30; const results = renderResults(); const exact = results.find(item => E.normalize(item.symbol) === E.normalize($("company-search").value)); if (exact || results.length === 1) selectCompany(exact || results[0], true);});
  $("company-search").addEventListener("input", () => {shown = 30; renderResults();});
  ["sector-filter", "basis-filter"].forEach(id => $(id).addEventListener("change", () => {shown = 30; renderResults();}));
  $("more-results").addEventListener("click", () => {shown += 30; renderResults();});
  try {
    const response = await fetch("data/valuation-index.json", {cache: "no-cache"});
    if (!response.ok) throw new Error("Published company index could not be loaded.");
    index = await response.json();
    if (index.schema_version !== E.SCHEMA || !Array.isArray(index.companies) || index.company_count !== index.companies.length) throw new Error("Published company index is incomplete.");
    $("release-summary").replaceChildren(el("span", "", `${index.company_count} companies`), el("span", "", `Price observations: ${index.quote_dates.join(", ")}`), el("span", "", `Published analysis: ${E.day(index.decision_at)}`));
    [...new Set(index.companies.map(item => item.sector))].filter(Boolean).sort().forEach(sector => {const option = el("option", "", sector); option.value = sector; $("sector-filter").appendChild(option);});
    const results = renderResults(); const query = $("company-search").value;
    const exact = results.find(item => E.normalize(item.symbol) === E.normalize(query));
    const initial = exact || (results.length === 1 ? results[0] : !query ? index.companies.find(item => item.symbol === "AAPL") || index.companies[0] : null);
    if (initial) await selectCompany(initial, false); else reportPanel.setAttribute("aria-busy", "false");
  } catch (error) {$("release-summary").textContent = "Published company data is temporarily unavailable."; $("search-status").textContent = "Please reload to try again."; reportPanel.replaceChildren(el("div", "ev-empty", error.message)); reportPanel.setAttribute("aria-busy", "false");}
})();
