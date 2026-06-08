/* ============================================================================
 * apiAdapter.jsx — Closures League · Final Definition (2026-06-08)
 *
 * The ONLY definition of a closure (no alternates exist in this app):
 *
 *   A closure is a row in data/closures.json with ts >= 2026-06-01 where EITHER
 *     (a) the (clientName, skuName) pair did NOT appear in any row dated
 *         on or before 2026-05-31, OR
 *     (b) the (clientName, category) pair did NOT appear in any row dated
 *         on or before 2026-05-31.
 *
 *   After validation we keep only the EARLIEST surviving row per
 *   (clientName, skuName) pair. The resulting array is the dataset every
 *   engine, leaderboard, KPI, chart and drawer consumes. There is no other
 *   source of closures; /api/reports is intentionally not touched here.
 *
 * Tagging — each surviving row is annotated with:
 *   closureKind: 'sku'  | 'both'
 *     'both' = first-ever placement of any SKU in this category at this store
 *     'sku'  = store already had something else in this category but this is
 *              the first time selling this specific SKU
 *   (No 'category' alone: every "new category" event is also a "new SKU".)
 * ============================================================================ */
(function () {
  const C = window.BclCore;
  const CLOSURES_LOCAL  = './data/closures.json';
  const CLOSURES_DIRECT = 'https://bamboo-sku-intelligence.vercel.app/data/closures.json';

  const BASELINE_CUTOFF = '2026-05-31';     // inclusive — baseline state at EOD 5/31 UTC
  const CLOSURE_START   = '2026-06-01';     // inclusive — closures count from 6/1 forward

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

  function normalizeClosure(r) {
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
      type: String(r.type || 'group').trim().toLowerCase(),
    };
  }

  // Pure: takes a normalized row array, returns the deduped closure set.
  // Exposed for unit testing.
  function deriveClosures(allRows) {
    const SKU_BASELINE = new Set();
    const CATEGORY_BASELINE = new Set();
    for (const c of allRows) {
      if (c.ts <= BASELINE_CUTOFF) {
        SKU_BASELINE.add(c.clientName + '||' + c.skuName);
        CATEGORY_BASELINE.add(c.clientName + '||' + c.category);
      }
    }

    const valid = [];
    for (const c of allRows) {
      if (c.ts < CLOSURE_START) continue;
      const isNewSku = !SKU_BASELINE.has(c.clientName + '||' + c.skuName);
      const isNewCat = !CATEGORY_BASELINE.has(c.clientName + '||' + c.category);
      if (!isNewSku && !isNewCat) continue;
      const closureKind = (isNewSku && isNewCat) ? 'both' : (isNewSku ? 'sku' : 'category');
      valid.push(Object.assign({}, c, { closureKind }));
    }

    // Dedup: earliest row per (clientName, skuName)
    const firstByPair = new Map();
    for (const c of valid) {
      const key = c.clientName + '||' + c.skuName;
      const cur = firstByPair.get(key);
      if (!cur || c.ts < cur.ts) firstByPair.set(key, c);
    }
    const closures = Array.from(firstByPair.values());
    closures.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
    return { closures, SKU_BASELINE, CATEGORY_BASELINE, validCount: valid.length };
  }

  async function fetchHistoricalClosures() {
    let lastErr = null;
    for (const url of [CLOSURES_LOCAL, CLOSURES_DIRECT]) {
      try {
        const res = await fetch(url, { credentials: 'omit' });
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
      const raw = unpackClosures(fetched.data);
      const allRows = raw.map(normalizeClosure)
        .filter(c => c.ts && c.rev > 0 && c.clientName && c.skuName);
      const derived = deriveClosures(allRows);
      return {
        closures: derived.closures,
        source: fetched.source,
        sourceError: null,
        rawCount: allRows.length,
        validCount: derived.validCount,
        dedupedCount: derived.closures.length,
        skuBaselineSize: derived.SKU_BASELINE.size,
        categoryBaselineSize: derived.CATEGORY_BASELINE.size,
        fetchedAt: Date.now(),
        isDemo: false,
        generatedAt: null, range: null,
      };
    } catch (e) {
      return {
        closures: [],
        source: 'error',
        sourceError: String(e),
        rawCount: 0, validCount: 0, dedupedCount: 0,
        skuBaselineSize: 0, categoryBaselineSize: 0,
        fetchedAt: Date.now(),
        isDemo: false,
        generatedAt: null, range: null,
      };
    }
  }

  // Helper used by every category-by view across the app. Iterates the deduped
  // closures array directly — never the parent's pre-aggregated chips.
  function aggregateByCategory(closures) {
    const buckets = {};
    for (const c of closures) {
      const k = c.category || 'Other';
      const b = buckets[k] || (buckets[k] = { category: k, rev: 0, units: 0, count: 0, newSkuCount: 0, newCatCount: 0 });
      b.rev   += Number(c.rev) || 0;
      b.units += Number(c.units) || 0;
      b.count += 1;
      if (c.closureKind === 'both') b.newCatCount += 1;
      if (c.closureKind === 'sku' || c.closureKind === 'both') b.newSkuCount += 1;
    }
    return Object.values(buckets).sort((a, b) => b.rev - a.rev);
  }

  window.BclApi = {
    loadWithFallback,
    fetchHistoricalClosures,
    unpackClosures,
    normalizeClosure,
    deriveClosures,
    aggregateByCategory,
    BASELINE_CUTOFF, CLOSURE_START,
    CLOSURES_LOCAL, CLOSURES_DIRECT,
  };
})();
