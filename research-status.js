/* Pinned, dated publication-status fallback only. This module cannot return baskets or investment returns. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ResearchStatus = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const SCREEN_HASH = "f7a4c91da3bebcc759a7659a6ad7605758049db4e45a753a941ebd14c5a84a33";
  const CODE_HASH = "e814277fcc8a1854ea91497e4a75880b52b3c87901c7e1470e15e43dae81dc11";
  const PUBLISHED_AT = "2026-09-07T04:01:31Z";
  const COLLECTION_AT = "2026-09-07T04:00:23.495505+00:00";
  // Exact, already verified bytes: Git's LF blob and Windows' CRLF checkout.
  // These two files contain identical JSON. Do not accept arbitrary normalization or new publications.
  const ALLOWED_SHA256 = new Set([
    "7ba176a5daa3ea7ac921a6df614693f3e6de65af100712430eae811ef81b93b5",
    "d973fa6d74aedb9d6627f76785482b0acc381940d55744cd415252ca63ab6f7f"
  ]);
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const quoteDatesMatch = value => Array.isArray(value) && value.length === 1 && value[0] === "2026-09-04";

  function statusText(tracker, index, now) {
    const current = now instanceof Date ? now.getTime() : Date.parse(now);
    if (!Number.isFinite(current) || Date.parse(PUBLISHED_AT) > current || !object(tracker) || !object(index)) return null;
    const publication = tracker.publication_status;
    const screen = publication && publication.screen;
    if (tracker.schema_version !== "spinoza.atlas_pulse_tracker.v2" || tracker.research_only !== true || tracker.execution_enabled !== false ||
        tracker.generated_at_utc !== PUBLISHED_AT || tracker.current_month !== "2026-09" || tracker.status !== "NO_PUBLISHABLE_BASKET" ||
        !Array.isArray(tracker.months) || tracker.months.length !== 0 || !object(publication) || !object(screen) ||
        publication.status !== "UNAVAILABLE" || publication.reason !== "PARTIAL_COLLECTION" || publication.updated_at_utc !== PUBLISHED_AT ||
        screen.status !== "PARTIAL_COLLECTION" || screen.generated_at_utc !== PUBLISHED_AT || screen.decision_at_utc !== PUBLISHED_AT ||
        screen.screen_month !== "2026-09" || screen.artifact_sha256 !== SCREEN_HASH || screen.atlas_code_hash !== CODE_HASH ||
        screen.source_collection_completed_at_utc !== COLLECTION_AT || screen.analysis_mode !== "CAPTURED_INPUT_REBUILD" ||
        screen.research_only !== true || screen.execution_enabled !== false || screen.paid_services_enabled !== false ||
        screen.coverage_gate_passed !== false || screen.candidate_gate_passed !== false || screen.evidence_gate_passed !== true ||
        screen.current_review_gate_passed !== true || screen.report_binding_gate_passed !== true || !quoteDatesMatch(screen.quote_dates)) return null;
    for (const key of ["universe_count", "requested_count", "collected_count", "source_verified_count", "report_replays_verified"]) {
      if (screen[key] !== 503) return null;
    }
    for (const key of ["scored_count", "valuation_available_count", "published_long_count", "published_short_count", "error_count", "coverage_ratio"]) {
      if (screen[key] !== 0) return null;
    }
    if (screen.collection_coverage_ratio !== 1 || index.schema_version !== "spinoza.equity_valuation.v1" ||
        index.mode !== "published_analysis" || index.source_screen_sha256 !== SCREEN_HASH || index.decision_at !== PUBLISHED_AT ||
        index.source_collection_completed_at !== COLLECTION_AT || index.company_count !== 503 || index.intrinsic_count !== 0 ||
        index.report_replays_verified !== 503 || !quoteDatesMatch(index.quote_dates) || !Array.isArray(index.companies) || index.companies.length !== 503) return null;
    const symbols = index.companies.map(company => object(company) ? company.symbol : null);
    if (symbols.some(symbol => typeof symbol !== "string" || !/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) || new Set(symbols).size !== 503) return null;
    return Object.freeze({
      text: "Published screen from September 7, 2026: 503/503 companies collected; 0/503 had complete ranking evidence. " +
        "No long or short research basket was published. Price observations: September 4, 2026. Current tracker refresh unavailable.",
      updatedAt: PUBLISHED_AT,
      screenHash: SCREEN_HASH
    });
  }

  async function fromBytes(bytes, index, now = new Date()) {
    try {
      if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) return null;
      if (!root.crypto || !root.crypto.subtle || bytes.byteLength > 100000) return null;
      const digest = await root.crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (!ALLOWED_SHA256.has(hash)) return null;
      return statusText(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), index, now);
    } catch (_) {
      return null;
    }
  }

  async function load({ fetchImpl = root.fetch, now = new Date() } = {}) {
    try {
      if (typeof fetchImpl !== "function") return null;
      const [tracker, index] = await Promise.all([
        fetchImpl("data/atlas_pulse_tracker.json", { cache: "no-cache" }),
        fetchImpl("data/valuation-index.json", { cache: "no-cache" })
      ]);
      if (!tracker.ok || !index.ok) return null;
      const [bytes, catalog] = await Promise.all([tracker.arrayBuffer(), index.json()]);
      return await fromBytes(bytes, catalog, now);
    } catch (_) {
      return null;
    }
  }
  return Object.freeze({ load, fromBytes });
});
