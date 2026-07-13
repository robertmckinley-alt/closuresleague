/* ============================================================================
 * apiAdapter.jsx — Closures League · Final Definition rev 3 (2026-07-13)
 *
 * Client-side re-derivation of closures from upstream closures.json.
 *
 * The upstream file contains BOTH first-time placements AND weekly top-sellers
 * for every store — over half the rows are repeats of a (store, skuGroup) pair
 * that already appeared on an earlier date. It also mis-labels some rows as
 * `cat-new` when the category was already selling at that store.
 *
 * Fix:
 *   1) Walk rows in chronological order.
 *   2) Dedup by (clientName, skuGroup) — keep the earliest ts, discard the rest
 *      (this removes ALL weekly-top-seller repeats).
 *   3) Retag closureKind from scratch:
 *        - 'cat-new'  if this is ALSO the earliest (clientName, category) seen
 *        - 'top-sku'  if the category was already sold at that store earlier
 *                     (a new SKU group inside an already-active category)
 *   Upstream `closureKind` values (including their meaning of "top-sku" as
 *   a weekly top-seller) are ignored — we re-derive from scratch.
 * ============================================================================ */
(function () {
  const C = window.BclCore;
  const CLOSURES_LOCAL  = './data/closures.json';
  const CLOSURES_DIRECT = 'https://bamboo-sku-intelligence.vercel.app/data/closures.json';

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

  // Category overrides — patch upstream mis-categorizations.
  // Rules run in order; first match wins.
  const CATEGORY_OVERRIDES = [
    // "Live Resin ___" as an infused-EDIBLE line (gummies, chocolates, caramels
    // etc.) — upstream tags these as Concentrates because the name contains
    // "Live Resin", but they're eaten, not dabbed.
    { match: /live\s*resin.*(gumm|chocolat|caramel|brownie|cookie|candy|mint|hard\s*candy|lozeng|taff|choc)/i, category: 'Edibles' },
    { match: /\bLR\s*(gumm|chocolat|caramel|brownie|cookie|candy|edible)/i, category: 'Edibles' },
  ];

  function applyCategoryOverride(rawCat, skuName, skuGroup) {
    const src = (skuName || '') + ' | ' + (skuGroup || '');
    for (const rule of CATEGORY_OVERRIDES) {
      if (rule.match.test(src)) return rule.category;
    }
    return rawCat;
  }

  function normalizeRow(r) {
    const ts = (typeof r.ts === 'string') ? r.ts.slice(0, 10) : (C && C.ymd ? C.ymd(r.ts) : '');
    const skuName  = String(r.skuName    || r.sku    || r.product || '').trim();
    const skuGroup = String(r.skuGroup   || r.sku_group || r.skuName || '').trim();
    const rawCat   = String(r.category   || r.cat || 'Other').trim();
    return {
      ts,
      clientName: String(r.clientName || r.client || r.store || '').trim(),
      skuName,
      skuGroup,
      category:   applyCategoryOverride(rawCat, skuName, skuGroup),
      rev:        Number(r.rev || r.revenue || 0),
      units:      Number(r.units || r.u || 0),
      sr:         String(r.sr || r.salesRep || r.rep || 'Unassigned').trim(),
      vr:         String(r.vr || r.vmiRep || 'Unassigned').trim(),
      type:       String(r.type || 'group').trim().toLowerCase(),
      closureKind: String(r.closureKind || '').trim(),
    };
  }

  // Backwards-compat alias — some callers use normalizeClosure().
  function normalizeClosure(r) { return normalizeRow(r); }

  // Chronological dedup + retag.
  function deriveClosures(allRows) {
    const sorted = allRows.slice().sort((a, b) => {
      if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
      return (a.skuName || '') < (b.skuName || '') ? -1 : 1;
    });

    // 1) Dedup by (clientName, skuGroup) — earliest wins.
    const seenGroup = new Set();
    const deduped = [];
    for (const c of sorted) {
      if (!c.clientName || !c.skuGroup) continue;
      const k = c.clientName + '||' + c.skuGroup;
      if (seenGroup.has(k)) continue;
      seenGroup.add(k);
      deduped.push(c);
    }

    // 2) Retag closureKind chronologically over the deduped set.
    //    cat-new = first appearance of (client, category) among deduped.
    //    top-sku = new SKU group inside an already-active category.
    //    (Label preserved so UI's existing filter pills keep working.)
    const seenCat = new Set();
    const closures = deduped.map(c => {
      const catKey = c.clientName + '||' + c.category;
      const isCatNew = !seenCat.has(catKey);
      if (isCatNew) seenCat.add(catKey);
      return Object.assign({}, c, { closureKind: isCatNew ? 'cat-new' : 'top-sku' });
    });

    return {
      closures,
      validCount: deduped.length,
      groupBaselineSize: seenGroup.size,
      categoryBaselineSize: seenCat.size,
    };
  }

  async function fetchClosures() {
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

  async function fetchHistoricalClosures() { return fetchClosures(); }

  async function loadWithFallback() {
    try {
      const fetched = await fetchClosures();
      const raw = unpackClosures(fetched.data);
      const allRows = raw.map(normalizeRow)
        .filter(c => c.ts && c.clientName && c.skuName);
      const derived = deriveClosures(allRows);
      return {
        closures: derived.closures,
        source: fetched.source,
        sourceError: null,
        rawCount: allRows.length,
        validCount: derived.validCount,
        dedupedCount: derived.closures.length,
        groupBaselineSize: derived.groupBaselineSize,
        categoryBaselineSize: derived.categoryBaselineSize,
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
      const b = buckets[k] || (buckets[k] = {
        category: k, rev: 0, units: 0, count: 0, newGroupCount: 0, newCatCount: 0
      });
      b.rev   += Number(c.rev) || 0;
      b.units += Number(c.units) || 0;
      b.count += 1;
      if (c.closureKind === 'cat-new') b.newCatCount += 1;
      if (c.closureKind === 'cat-new' || c.closureKind === 'top-sku') b.newGroupCount += 1;
    }
    return Object.values(buckets).sort((a, b) => b.rev - a.rev);
  }

  window.BclApi = {
    loadWithFallback,
    fetchClosures,
    fetchHistoricalClosures,
    unpackClosures,
    normalizeRow,
    normalizeClosure,
    deriveClosures,
    aggregateByCategory,
    CLOSURES_LOCAL, CLOSURES_DIRECT,
  };
})();
