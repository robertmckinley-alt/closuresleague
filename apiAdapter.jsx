/* ============================================================================
 * apiAdapter.jsx — Closures League · Final Definition (2026-06-08 rev 2)
 *
 * The ONLY definition of a closure:
 *
 *   A closure is a row in data/closures.json with ts >= 2026-06-01 where EITHER
 *     (a) the (clientName, skuGroup)  pair did NOT appear in any row dated
 *         on or before 2026-05-31  — first sale of an entire SKU group at
 *         this store, OR
 *     (b) the (clientName, category) pair did NOT appear in any row dated
 *         on or before 2026-05-31  — first sale in this category at this
 *         store.
 *
 *   Individual product variants within an already-active SKU group at a
 *   store do NOT count (those are line extensions, not closures).
 *
 *   After validation, dedup to the EARLIEST surviving row per
 *   (clientName, skuGroup). This deduped array is the entire dataset.
 *
 * Tagging:
 *   closureKind: 'group' | 'both'
 *     'both'  = first group AND first category placement at this store
 *     'group' = category already sold here, but this is a brand-new
 *               SKU group for this store
 * ============================================================================ */
(function () {
  const C = window.BclCore;
  const CLOSURES_LOCAL  = './data/closures.json';
  const CLOSURES_DIRECT = 'https://bamboo-sku-intelligence.vercel.app/data/closures.json';

  const BASELINE_CUTOFF = '2026-05-31';
  const CLOSURE_START   = '2026-06-01';

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
      skuName:    String(r.skuName    || r.sku    || r.product || '').trim(),
      skuGroup:   String(r.skuGroup   || r.sku_group || r.skuName || '').trim(),
      category:   String(r.category   || r.cat || 'Other').trim(),
      rev:        Number(r.rev || r.revenue || 0),
      units:      Number(r.units || r.u || 0),
      sr:         String(r.sr || r.salesRep || r.rep || 'Unassigned').trim(),
      vr:         String(r.vr || r.vmiRep || 'Unassigned').trim(),
      type:       String(r.type || 'group').trim().toLowerCase(),
    };
  }

  // Pure: takes a normalized row array, returns the deduped closure set.
  function deriveClosures(allRows) {
    const GROUP_BASELINE = new Set();
    const CATEGORY_BASELINE = new Set();
    for (const c of allRows) {
      if (c.ts <= BASELINE_CUTOFF) {
        GROUP_BASELINE.add(c.clientName + '||' + c.skuGroup);
        CATEGORY_BASELINE.add(c.clientName + '||' + c.category);
      }
    }

    const valid = [];
    for (const c of allRows) {
      if (c.ts < CLOSURE_START) continue;
      const isNewGroup = !GROUP_BASELINE.has(c.clientName + '||' + c.skuGroup);
      const isNewCat   = !CATEGORY_BASELINE.has(c.clientName + '||' + c.category);
      if (!isNewGroup && !isNewCat) continue;
      const closureKind = (isNewGroup && isNewCat) ? 'both' : 'group';
      valid.push(Object.assign({}, c, { closureKind }));
    }

    // Dedup: earliest row per (clientName, skuGroup)
    const firstByPair = new Map();
    for (const c of valid) {
      const key = c.clientName + '||' + c.skuGroup;
      const cur = firstByPair.get(key);
      if (!cur || c.ts < cur.ts) firstByPair.set(key, c);
    }
    const closures = Array.from(firstByPair.values());
    closures.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
    return { closures, GROUP_BASELINE, CATEGORY_BASELINE, validCount: valid.length };
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
        groupBaselineSize: derived.GROUP_BASELINE.size,
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
        groupBaselineSize: 0, categoryBaselineSize: 0,
        fetchedAt: Date.now(),
        isDemo: false,
        generatedAt: null, range: null,
      };
    }
  }

  function aggregateByCategory(closures) {
    const buckets = {};
    for (const c of closures) {
      const k = c.category || 'Other';
      const b = buckets[k] || (buckets[k] = { category: k, rev: 0, units: 0, count: 0, newGroupCount: 0, newCatCount: 0 });
      b.rev   += Number(c.rev) || 0;
      b.units += Number(c.units) || 0;
      b.count += 1;
      if (c.closureKind === 'both') b.newCatCount += 1;
      if (c.closureKind === 'group' || c.closureKind === 'both') b.newGroupCount += 1;
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
