/* ============================================================================
 * apiAdapter.jsx — Data fetching for Closures League.
 *
 * Single source of truth for what counts as a closure (spec 2026-06-08):
 *
 *  Step 1 — Baseline (rows with ts <= 2026-05-31):
 *    walk every row in closures.json with ts <= 2026-05-31 and build two
 *    reference sets in memory —
 *      SKU_BASELINE      = Set of (clientName, skuName)    pairs
 *      CATEGORY_BASELINE = Set of (clientName, category)   pairs
 *    Both sets are EXCLUSION lists. They are never shown to the user.
 *
 *  Step 2 — Closure validation (rows with ts >= 2026-06-01):
 *    a row is a valid closure iff at least one of the following is TRUE:
 *      (clientName, skuName)    NOT in SKU_BASELINE      -> closureKind='sku'
 *      (clientName, category)   NOT in CATEGORY_BASELINE -> closureKind='category'
 *    when BOTH are simultaneously new -> closureKind='both'.
 *    every other row is dropped.
 *
 *  Step 3 — Dedup:
 *    across the validated rows, keep the EARLIEST row per (clientName, skuName)
 *    so the same closure can never be double-counted on multiple days.
 *
 * Output: a single closures[] array consumed by every engine, leaderboard,
 * KPI, chart, and aggregation in the app. No /api/reports synthesis. No
 * demo fallback — if the file fails to load we surface the error.
 * ============================================================================ */
(function () {
  const C = window.BclCore;
  const CLOSURES_LOCAL  = './data/closures.json';
  const CLOSURES_DIRECT = 'https://bamboo-sku-intelligence.vercel.app/data/closures.json';

  // ledger boundary
  const BASELINE_LAST_DAY = '2026-05-31';   // last day of baseline window
  const CLOSURE_FIRST_DAY = '2026-06-01';   // first day a closure can land

  function unpackClosures(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows) && Array.isArray(data.cols)) {
      const cols = data.cols;
      return data.rows.map(r => {
        const o = {}; for (let i = 0; i < cols.length; i++) o[cols[i]] = r[i]; return o;
      });
    }
    if (data && Array.isArray(data.closures)) return data.closures;
    return [];
  }

  function normalizeRow(r) {
    const ts = (typeof r.ts === 'string') ? r.ts.slice(0, 10) : C.ymd(r.ts);
    return {
      ts,
      clientName: String(r.clientName || r.client || r.store || '').trim(),
      skuName: String(r.skuName || r.sku || r.product || '').trim(),
      skuGroup: String(r.skuGroup || r.sku_group || r.skuName || '').trim(),
      category: String(r.category || r.cat || 'Other').trim(),
      rev: Number(r.rev || r.revenue || 0),
      units: Number(r.units || r.u || 0),
      sr: String(r.sr || r.salesRep || r.rep || 'Unassigned').trim(),
      vr: String(r.vr || r.vmiRep || 'Unassigned').trim(),
    };
  }

  function pairKey(a, b) { return a + '||' + b; }

  /**
   * The whole pipeline in one place.
   *  - rows ts <= 5/31 -> seed SKU_BASELINE + CATEGORY_BASELINE
   *  - rows ts >= 6/1  -> validate against the baselines, tag closureKind
   *  - dedup -> keep earliest per (clientName, skuName)
   */
  function pipeline(rawRows) {
    const SKU_BASELINE      = new Set();   // (clientName, skuName)
    const CATEGORY_BASELINE = new Set();   // (clientName, category)

    // Pass 1 — seed baselines from anything on or before 5/31. We don't care
    // about rev/units; presence in closures.json with ts <= 5/31 means "this
    // store already sold this SKU / category before the tracker started".
    for (const r of rawRows) {
      if (!r.ts || r.ts > BASELINE_LAST_DAY) continue;
      if (!r.clientName || !r.skuName) continue;
      SKU_BASELINE.add(pairKey(r.clientName, r.skuName));
      CATEGORY_BASELINE.add(pairKey(r.clientName, r.category));
    }

    // Pass 2 — validate ts >= 6/1 rows against the baselines.
    const validated = [];
    for (const r of rawRows) {
      if (!r.ts || r.ts < CLOSURE_FIRST_DAY) continue;
      if (!r.clientName || !r.skuName) continue;
      if (!(r.rev > 0)) continue;   // ignore zero-rev rows
      const skuNew = !SKU_BASELINE.has(pairKey(r.clientName, r.skuName));
      const catNew = !CATEGORY_BASELINE.has(pairKey(r.clientName, r.category));
      if (!skuNew && !catNew) continue;   // already placed before — not a closure
      let closureKind;
      if (skuNew && catNew)      closureKind = 'both';
      else if (catNew)           closureKind = 'category';
      else                       closureKind = 'sku';
      validated.push(Object.assign({}, r, { closureKind }));
    }

    // Pass 3 — dedup: earliest row per (clientName, skuName) wins. We sort
    // ascending so the FIRST occurrence is the one we keep.
    validated.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
    const seen = new Set();
    const dedup = [];
    for (const r of validated) {
      const k = pairKey(r.clientName, r.skuName);
      if (seen.has(k)) continue;
      seen.add(k);
      dedup.push(r);
    }

    return {
      closures: dedup,
      baselineCounts: { sku: SKU_BASELINE.size, category: CATEGORY_BASELINE.size },
      rawCount: rawRows.length,
      validatedCount: validated.length,
      dedupedCount: dedup.length,
    };
  }

  async function fetchHistoricalClosures() {
    let lastErr = null;
    for (const url of [CLOSURES_LOCAL, CLOSURES_DIRECT]) {
      try {
        const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status + ' @ ' + url); continue; }
        const data = await res.json();
        return { data, source: url };
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('closures.json unreachable');
  }

  async function loadWithFallback() {
    try {
      const fetched = await fetchHistoricalClosures();
      const raw = unpackClosures(fetched.data).map(normalizeRow);
      const result = pipeline(raw);
      return Object.assign({}, result, {
        source: fetched.source,
        sourceError: null,
        generatedAt: null, range: null,
        fetchedAt: Date.now(),
        isDemo: false,
      });
    } catch (e) {
      // No demo fallback — surface the error.
      return {
        closures: [],
        baselineCounts: { sku: 0, category: 0 },
        rawCount: 0, validatedCount: 0, dedupedCount: 0,
        source: 'error',
        sourceError: String(e),
        generatedAt: null, range: null,
        fetchedAt: Date.now(),
        isDemo: false,
      };
    }
  }

  window.BclApi = {
    loadWithFallback,
    fetchHistoricalClosures,
    unpackClosures,
    normalizeRow,
    pipeline,
    BASELINE_LAST_DAY,
    CLOSURE_FIRST_DAY,
    CLOSURES_LOCAL,
    CLOSURES_DIRECT,
  };
})();
