/* Research publication only. This module does not load trading baskets, returns or broker state. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ResearchCandidates = api;
  if (root.document) {
    const start = () => {
      api.refresh();
      root.setInterval(() => api.refresh(), 60000);
    };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start);
    else start();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  // The publication exporter replaces only this complete, marked literal.
  // BEGIN RESEARCH CANDIDATE PINS
  const RELEASE = Object.freeze({"atlas_code_hash":"f9c78de31b876ff7957dbec63cb8d136284fa6ee4debf5b3b960ac5caad66cdb","ranking_policy_sha256":"266053a575589d9031aa9c2a2d903189386d48d2ac27a0c6d3ff007d1f48fa01","sha256":["42db60c1f0c20e6a728f6f75953a794a6c633cc16aa81f199efe9e9c3bdcf6f1"],"source_screen_sha256":"5034d50e564b5665e39a77a3379d2338ef7fb7497dbad530fa4a3dbd99448e92"});
  // END RESEARCH CANDIDATE PINS
  const POLICY = Object.freeze({
    valuation_weight: 0.5, risk_weight: 0.3, evidence_weight: 0.2,
    maximum_share_price: 126, minimum_long_margin_of_safety: 0.15,
    maximum_short_margin_of_safety: -0.15, maximum_long_risk_score: 55,
    minimum_short_risk_score: 55, minimum_evidence_score: 70,
    maximum_per_sector: 2, maximum_candidates_per_side: 5,
    maximum_source_age_hours: 24, maximum_quote_age_days: 5
  });
  const TOP_KEYS = ["schema_version", "research_only", "execution_enabled", "actionable", "status", "screen_month", "generated_at_utc", "decision_at_utc", "qualified_at_utc", "valid_until_utc", "source_screen_sha256", "atlas_code_hash", "ranking_policy_sha256", "valuation_model_policy", "risk_model_policy", "eligibility_scope", "trading_basket_published", "source_screen_status", "counts", "ranking_policy", "comparison_scope", "margin_field_semantics", "limitations", "longs", "shorts"];
  const ROW_KEYS = ["rank", "symbol", "name", "sector", "side", "price", "currency", "price_date", "intrinsic_estimate", "margin_of_safety", "risk_score", "evidence_score", "ranking_score", "valuation_percentile", "risk_percentile", "evidence_percentile", "source_collected_at_utc", "report_sha256", "source_archive_sha256", "intrinsic_supported", "risk_complete", "report_replay_verified"];
  const verifiedViews = new WeakSet();
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  const cleanText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
  const timestamp = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value) ? Date.parse(value) : NaN;
  const day = value => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const parsed = Date.parse(value + "T00:00:00Z");
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : NaN;
  };
  const close = (a, b, tolerance = 0.000001) => finite(a) && finite(b) && Math.abs(a - b) <= tolerance;
  const marketMonth = value => {
    const parts = new Intl.DateTimeFormat("en-US", {timeZone:"America/New_York", year:"numeric", month:"2-digit"}).formatToParts(new Date(value));
    return parts.find(part => part.type === "year").value + "-" + parts.find(part => part.type === "month").value;
  };
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[character]));

  function rowOrder(left, right, side) {
    const direction = side === "LONG" ? 1 : -1;
    return right.ranking_score - left.ranking_score || direction * (right.margin_of_safety - left.margin_of_safety) ||
      direction * (left.risk_score - right.risk_score) || right.evidence_score - left.evidence_score ||
      (left.symbol < right.symbol ? -1 : left.symbol > right.symbol ? 1 : 0);
  }

  function validate(payload, now) {
    if (!exactKeys(payload, TOP_KEYS) || !Number.isFinite(now)) return null;
    if (payload.schema_version !== "spinoza.research_candidates.v1" || payload.research_only !== true ||
        payload.execution_enabled !== false || payload.actionable !== false || payload.trading_basket_published !== false ||
        payload.eligibility_scope !== "INDIVIDUALLY_QUALIFIED_RESEARCH" ||
        payload.valuation_model_policy !== "common_equity_distribution_v1" || payload.risk_model_policy !== "research_risk_indicator_v1" ||
        !hash(payload.source_screen_sha256) || payload.source_screen_sha256 !== RELEASE.source_screen_sha256 ||
        !hash(payload.atlas_code_hash) || payload.atlas_code_hash !== RELEASE.atlas_code_hash ||
        !hash(payload.ranking_policy_sha256) || payload.ranking_policy_sha256 !== RELEASE.ranking_policy_sha256 ||
        payload.screen_month !== marketMonth(now) ||
        !["READY", "PARTIAL_COLLECTION", "INSUFFICIENT_ELIGIBLE_CANDIDATES"].includes(payload.source_screen_status) ||
        payload.comparison_scope !== "All collected records with complete, source-fresh ranking evidence before individual direction and price filters" ||
        payload.margin_field_semantics !== "ESTIMATED_VALUE_DIVIDED_BY_RECORDED_PRICE_MINUS_ONE" ||
        !Array.isArray(payload.limitations) || payload.limitations.length < 1 || payload.limitations.length > 10 || !payload.limitations.every(value => cleanText(value, 500)) ||
        !exactKeys(payload.ranking_policy, Object.keys(POLICY)) || !Object.entries(POLICY).every(([key, value]) => payload.ranking_policy[key] === value)) return null;
    const generated = timestamp(payload.generated_at_utc);
    const decision = timestamp(payload.decision_at_utc);
    const qualified = timestamp(payload.qualified_at_utc);
    const until = timestamp(payload.valid_until_utc);
    if (![generated, decision, qualified, until].every(Number.isFinite) || decision > qualified || qualified > generated || generated > now ||
        until < qualified || until > qualified + POLICY.maximum_source_age_hours * 3600000 ||
        marketMonth(qualified) !== payload.screen_month) return null;
    const counts = payload.counts;
    if (!exactKeys(counts, ["universe", "requested", "collected", "collection_errors", "complete_ranking", "long_qualified", "short_qualified", "long_displayed", "short_displayed"]) ||
        !Object.values(counts).every(value => Number.isInteger(value) && value >= 0) || counts.universe < 1 ||
        counts.requested > counts.universe || counts.collected + counts.collection_errors !== counts.requested ||
        counts.complete_ranking > counts.collected || counts.long_qualified + counts.short_qualified > counts.complete_ranking ||
        !Array.isArray(payload.longs) || !Array.isArray(payload.shorts) || counts.long_displayed !== payload.longs.length || counts.short_displayed !== payload.shorts.length) return null;
    const symbols = new Set();
    for (const [side, rows, qualifiedCount] of [["LONG", payload.longs, counts.long_qualified], ["SHORT", payload.shorts, counts.short_qualified]]) {
      if (!Array.isArray(rows) || rows.length > POLICY.maximum_candidates_per_side || rows.length > qualifiedCount) return null;
      const sectors = new Map();
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (!exactKeys(row, ROW_KEYS) || row.rank !== index + 1 || row.side !== side ||
            typeof row.symbol !== "string" || !/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(row.symbol) || symbols.has(row.symbol) ||
            !cleanText(row.name, 200) || !cleanText(row.sector, 100) || row.currency !== "USD" ||
            row.intrinsic_supported !== true || row.risk_complete !== true || row.report_replay_verified !== true ||
            !hash(row.report_sha256) || !hash(row.source_archive_sha256)) return null;
        symbols.add(row.symbol);
        sectors.set(row.sector, (sectors.get(row.sector) || 0) + 1);
        if (sectors.get(row.sector) > POLICY.maximum_per_sector) return null;
        for (const field of ["price", "intrinsic_estimate", "margin_of_safety", "risk_score", "evidence_score", "ranking_score", "valuation_percentile", "risk_percentile", "evidence_percentile"]) {
          if (!finite(row[field])) return null;
        }
        if (row.price <= 0 || row.price > POLICY.maximum_share_price || row.intrinsic_estimate <= 0 ||
            row.risk_score < 0 || row.risk_score > 100 || row.evidence_score < POLICY.minimum_evidence_score || row.evidence_score > 100 ||
            row.ranking_score < 0 || row.ranking_score > 100 ||
            [row.valuation_percentile, row.risk_percentile, row.evidence_percentile].some(value => value < 0 || value > 1) ||
            !close(row.margin_of_safety, row.intrinsic_estimate / row.price - 1) ||
            !close(row.ranking_score, 100 * (POLICY.valuation_weight * row.valuation_percentile + POLICY.risk_weight * row.risk_percentile + POLICY.evidence_weight * row.evidence_percentile))) return null;
        if ((side === "LONG" && (row.margin_of_safety < POLICY.minimum_long_margin_of_safety || row.risk_score > POLICY.maximum_long_risk_score)) ||
            (side === "SHORT" && (row.margin_of_safety > POLICY.maximum_short_margin_of_safety || row.risk_score < POLICY.minimum_short_risk_score))) return null;
        const collected = timestamp(row.source_collected_at_utc);
        const quoted = day(row.price_date);
        if (!Number.isFinite(collected) || !Number.isFinite(quoted) || collected > qualified ||
            qualified - collected > POLICY.maximum_source_age_hours * 3600000 || quoted > qualified ||
            qualified - quoted > POLICY.maximum_quote_age_days * 86400000 || until > collected + POLICY.maximum_source_age_hours * 3600000 ||
            until > quoted + POLICY.maximum_quote_age_days * 86400000 ||
            (index > 0 && rowOrder(rows[index - 1], row, side) > 0)) return null;
      }
    }
    const total = payload.longs.length + payload.shorts.length;
    const expectedStatus = total === 0 ? "NO_QUALIFIED_CANDIDATES" : payload.longs.length === 5 && payload.shorts.length === 5 ? "COMPLETE_RESEARCH" : "PARTIAL_RESEARCH";
    if (payload.status !== expectedStatus) return null;
    const view = Object.freeze({
      state: now < until ? "CURRENT" : "ARCHIVED", month: payload.screen_month,
      asOf: payload.qualified_at_utc, expiresAt: payload.valid_until_utc,
      screenHash: payload.source_screen_sha256, completeRanking: counts.complete_ranking,
      universe: counts.universe, collected: counts.collected, collectionErrors: counts.collection_errors,
      longs: Object.freeze(payload.longs.map(row => Object.freeze({...row}))),
      shorts: Object.freeze(payload.shorts.map(row => Object.freeze({...row})))
    });
    verifiedViews.add(view);
    return view;
  }

  async function fromBytes(bytes, now = new Date()) {
    try {
      if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) return null;
      if (!root.crypto || !root.crypto.subtle || bytes.byteLength > 100000) return null;
      const digest = await root.crypto.subtle.digest("SHA-256", bytes);
      const value = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (!RELEASE.sha256.includes(value)) return null;
      return validate(JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(bytes)), now instanceof Date ? now.getTime() : Date.parse(now));
    } catch (_) { return null; }
  }

  async function load({fetchImpl = root.fetch, now = null} = {}) {
    try {
      if (typeof fetchImpl !== "function") return null;
      const response = await fetchImpl("data/research-candidates.json", {cache:"no-cache"});
      return response.ok ? await fromBytes(await response.arrayBuffer(), now || new Date()) : null;
    } catch (_) { return null; }
  }

  const formatDate = value => new Intl.DateTimeFormat("en-US", {dateStyle:"medium", timeStyle:"short", timeZone:"UTC"}).format(new Date(value)) + " UTC";
  const money = value => new Intl.NumberFormat("en-US", {style:"currency", currency:"USD", maximumFractionDigits:2}).format(value);
  function rowsMarkup(rows) {
    if (!rows.length) return '<tr><td colspan="7" class="empty">No candidates passed the applicable selection checks at this research date.</td></tr>';
    return rows.map(row => '<tr><td>' + row.rank + '</td><td><a class="atlas-ticker" href="valuation.html?q=' + encodeURIComponent(row.symbol) + '&amp;report_sha256=' + row.report_sha256 + '">' + escapeHtml(row.symbol) + '</a><span class="candidate-company">' + escapeHtml(row.name) + '</span><small class="atlas-sector">' + escapeHtml(row.sector) + '</small></td><td>' + money(row.price) + '<small class="candidate-observation">USD · ' + escapeHtml(row.price_date) + '</small></td><td>' + money(row.intrinsic_estimate) + '<small class="candidate-observation">Conditional estimate</small></td><td>' + (row.margin_of_safety >= 0 ? '+' : '') + (row.margin_of_safety * 100).toFixed(1) + '%</td><td>' + row.risk_score.toFixed(1) + ' / 100</td><td>' + row.evidence_score.toFixed(0) + ' / 100</td></tr>').join("");
  }

  function render(view, document = root.document, now = new Date()) {
    if (!document) return;
    const text = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    const body = (id, markup) => { const element = document.getElementById(id); if (element) element.innerHTML = markup; };
    const renderedAt = now instanceof Date ? now.getTime() : Date.parse(now);
    if (!view || !verifiedViews.has(view) || !Number.isFinite(renderedAt) ||
        marketMonth(renderedAt) !== view.month || renderedAt < timestamp(view.asOf)) {
      text("research_candidates_status", "Current research publication unavailable");
      text("research_candidates_date", "A verified monthly publication is required.");
      text("research_candidates_coverage", "");
      for (const side of ["long", "short"]) {
        text("research_candidates_" + side + "_count", "");
        body("research_candidates_" + side + "_body", '<tr><td colspan="7" class="empty">Verified research candidates are unavailable.</td></tr>');
      }
      return;
    }
    const archived = renderedAt >= timestamp(view.expiresAt);
    text("research_candidates_status", archived ? "Archived research — eligibility expired" : "Individually qualified research");
    text("research_candidates_date", "Research as of " + formatDate(view.asOf) + ". " + (archived ? "Eligibility expired " : "Eligibility valid until ") + formatDate(view.expiresAt) + ".");
    text("research_candidates_coverage", view.completeRanking + " / " + view.universe + " companies had complete ranking evidence at the research date; " + view.collected + " collected" + (view.collectionErrors ? ", " + view.collectionErrors + " collection errors" : "") + ". The displayed ranks apply within each qualified, diversified side.");
    for (const [side, rows] of [["long", view.longs], ["short", view.shorts]]) {
      text("research_candidates_" + side + "_count", rows.length + " shown");
      body("research_candidates_" + side + "_body", rowsMarkup(rows));
    }
  }

  let refreshSequence = 0;
  async function refresh(options = {}) {
    const sequence = ++refreshSequence;
    const view = await load(options);
    if (sequence === refreshSequence) render(view, options.document || root.document, options.now || new Date());
    return view;
  }
  return Object.freeze({fromBytes, load, render, refresh});
});
