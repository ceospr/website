/* Pinned, dated publication-status fallback only. This module cannot return baskets or investment returns. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ResearchStatus = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const SCREEN_HASH = "5063bf3ee85a0ecca1ebb10923836f2addf4cb39f615ba4bef75085114824317";
  const CODE_HASH = "7a7065671674b2ede5a7bda69a25fe8dac4bf2ac6b1cb5d1ba69763fd8dcdf73";
  const PUBLISHED_AT = "2026-09-08T03:39:07Z";
  const COLLECTION_AT = "2026-09-07T04:00:23.495505+00:00";
  const SCREEN_STATUS = "PARTIAL_COLLECTION";
  const CATALOG_INVENTORY_SHA256 = "7bcd7408deb0e56907520734132e26d870e9a5e03e36182253022d49982c6651";
  const SCREEN_MONTH = "2026-09";
  const QUOTE_DATES = ["2026-09-04"];
  const SCREEN_COUNTS = {"universe_count":503,"requested_count":503,"collected_count":503,"source_verified_count":130,"report_replays_verified":503,"scored_count":85,"valuation_available_count":363,"published_long_count":0,"published_short_count":0,"error_count":0,"coverage_ratio":0.16898608349900596,"collection_coverage_ratio":1.0,"complete_risk_score_count":454};
  const SCREEN_GATES = {"coverage_gate_passed":false,"candidate_gate_passed":false,"evidence_gate_passed":true,"current_review_gate_passed":true,"report_binding_gate_passed":true};
  // Exact, already verified bytes: Git's LF blob and Windows' CRLF checkout.
  // These two files contain identical JSON. Do not accept arbitrary normalization or new publications.
  const ALLOWED_SHA256 = new Set([
    "43255b7666321deefa5c8708c0e90c8a72cf13e1e338cae17d9ab90dc2a899ad",
    "05cec0cfdd75a3453348f851008fe9cfa4ec2f0be51b023f3c7ca851d9a5c0b3"
  ]);
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  const quoteDatesMatch = value => Array.isArray(value) && JSON.stringify(value) === JSON.stringify(QUOTE_DATES);

  function statusText(tracker, index, now) {
    const current = now instanceof Date ? now.getTime() : Date.parse(now);
    if (!Number.isFinite(current) || Date.parse(PUBLISHED_AT) > current || !object(tracker) || !object(index)) return null;
    const publication = tracker.publication_status;
    const screen = publication && publication.screen;
    if (tracker.schema_version !== "spinoza.atlas_pulse_tracker.v2" || tracker.research_only !== true || tracker.execution_enabled !== false ||
        tracker.generated_at_utc !== PUBLISHED_AT || tracker.current_month !== SCREEN_MONTH || tracker.status !== "NO_PUBLISHABLE_BASKET" ||
        !Array.isArray(tracker.months) || tracker.months.length !== 0 || !object(publication) || !object(screen) ||
        !["PARTIAL_COLLECTION", "INSUFFICIENT_ELIGIBLE_CANDIDATES"].includes(SCREEN_STATUS) ||
        publication.status !== "UNAVAILABLE" || publication.reason !== SCREEN_STATUS || publication.updated_at_utc !== PUBLISHED_AT ||
        screen.status !== SCREEN_STATUS || screen.generated_at_utc !== PUBLISHED_AT || screen.decision_at_utc !== PUBLISHED_AT ||
        screen.screen_month !== SCREEN_MONTH || screen.artifact_sha256 !== SCREEN_HASH || screen.atlas_code_hash !== CODE_HASH ||
        screen.source_collection_completed_at_utc !== COLLECTION_AT || screen.analysis_mode !== "CAPTURED_INPUT_REBUILD" ||
        screen.research_only !== true || screen.execution_enabled !== false || screen.paid_services_enabled !== false ||
        (screen.coverage_gate_passed === true && screen.candidate_gate_passed === true) || screen.evidence_gate_passed !== true ||
        screen.current_review_gate_passed !== true || screen.report_binding_gate_passed !== true || !quoteDatesMatch(screen.quote_dates)) return null;
    if (!Object.entries(SCREEN_COUNTS).every(([key, expected]) => screen[key] === expected) ||
        !Object.entries(SCREEN_GATES).every(([key, expected]) => screen[key] === expected) ||
        screen.published_long_count !== 0 || screen.published_short_count !== 0 || screen.error_count !== 0) return null;
    const count = SCREEN_COUNTS.universe_count;
    if (screen.collection_coverage_ratio !== 1 || index.schema_version !== "spinoza.equity_valuation.v1" ||
        index.mode !== "published_analysis" || index.source_screen_sha256 !== SCREEN_HASH || index.decision_at !== PUBLISHED_AT ||
        index.source_collection_completed_at !== COLLECTION_AT || index.company_count !== count || index.intrinsic_count !== screen.valuation_available_count ||
        index.report_replays_verified !== count || !quoteDatesMatch(index.quote_dates) || !Array.isArray(index.companies) || index.companies.length !== count ||
        index.companies.filter(company => company.intrinsic_available === true).length !== index.intrinsic_count ||
        index.companies.filter(company => company.relative_available === true).length !== index.relative_count) return null;
    const symbols = index.companies.map(company => object(company) ? company.symbol : null);
    if (symbols.some(symbol => typeof symbol !== "string" || !/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol)) || new Set(symbols).size !== count) return null;
    return Object.freeze({
      text: "Not yet published",
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
      if (!object(index) || !Array.isArray(index.companies)) return null;
      const inventory = index.companies.map(company => [company.symbol, company.name, company.file, company.sha256, company.intrinsic_available, company.relative_available]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
      const catalogDigest = await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(inventory)));
      const catalogHash = Array.from(new Uint8Array(catalogDigest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (catalogHash !== CATALOG_INVENTORY_SHA256) return null;
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
