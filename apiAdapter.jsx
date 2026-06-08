/* ============================================================================
 * apiAdapter.jsx — Data fetching for Closures League.
 *
 * Definition of a closure (per user, 2026-06-08):
 *   The FIRST appearance of a (store × SKU) pair on or after 2026-05-28.
 *   SKU data was added to the upstream API on 2026-05-27 21:15 UTC, so 5/28
 *   is the earliest date at which "first time we've ever seen this pair"
 *   becomes meaningful. Any later appearance of the same pair is a recurring
 *   sale, NOT a new closure.
 *
 * Source:
 *   ./data/closures.json (mirrored from Bamboo SKU Intelligence by
 *   .github/workflows/sync-closures.yml). Each row tells us a (clientName,
 *   skuName, ts) where the pair sold. We sort by date and keep only the
 *   first row per pair.
 *
 *   We deliberately do NOT bolt /api/reports onto the dataset anymore —
 *   that endpoint exposes cumulative revenue per pair, which over-attributes
 *   to the last-touch date and distorts weekly buckets.
 *
 * Output schema:
 *   { ts, clientName, skuName, skuGroup, category, rev, units, sr, vr, type }
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

  function normalizeClosure(r) {
    const ts = (typeof r.ts === 'string') ? r.ts.slice(0, 10) : C.ymd(r.ts);
    const type = String(r.type || 'group').trim().toLowerCase();
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
      type,
    };
  }

  // Reduce every row to ONE per (clientName, skuName), keeping the earliest ts.
  // Each surviving row represents the actual first-ever closure of that pair.
  function firstAppearanceDedupe(rows) {
    const first = new Map();
    for (const c of rows) {
      const key = c.clientName + '||' + c.skuName;
      const cur = first.get(key);
      if (!cur || c.ts < cur.ts) first.set(key, c);
    }
    return Array.from(first.values());
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
      const all = raw.map(normalizeClosure)
        .filter(c => c.ts && c.ts >= C.MIN_CLOSURE_DATE && c.rev > 0 && c.clientName && c.skuName);
      // Dedup to first-ever appearance per (clientName, skuName)
      const closures = firstAppearanceDedupe(all);
      closures.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
      return {
        closures,
        source: fetched.source,
        sourceError: null,
        rawCount: all.length,
        dedupedCount: closures.length,
        generatedAt: null, range: null,
        fetchedAt: Date.now(),
        isDemo: false,
      };
    } catch (e) {
      return {
        closures: [],
        source: 'error',
        sourceError: String(e),
        rawCount: 0, dedupedCount: 0,
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
    normalizeClosure,
    firstAppearanceDedupe,
    CLOSURES_LOCAL,
    CLOSURES_DIRECT,
  };
})();
