/* ============================================================================
 * apiAdapter.jsx — Data fetching for Closures League.
 *
 * Source of truth: ./data/closures.json   (mirrored from Bamboo SKU
 * Intelligence by .github/workflows/sync-closures.yml every 5 minutes).
 *
 * Schema as of 2026-06-03:
 *   { ts, clientName, skuName, category, rev, units, sr, vr, type, skuGroup }
 *
 *   type === 'group'   → first time this (store × SKU group) ever sold
 *   type === 'product' → new product within an existing SKU group at the store
 *
 * The parent app's "Void Closures" tab counts BOTH types; defaulting to 'All'
 * here keeps the numbers aligned with what you see at
 * https://bamboo-sku-intelligence.vercel.app/.
 *
 * Filter: ts >= MIN_CLOSURE_DATE (2026-05-13).
 * ============================================================================ */
(function () {
  const C = window.BclCore;
  const CLOSURES_LOCAL  = './data/closures.json';
  const CLOSURES_DIRECT = 'https://bamboo-sku-intelligence.vercel.app/data/closures.json';

  // Accepts either array-of-objects or columnar {cols, rows} format.
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
    // 'type' may be missing on legacy rows — treat as 'group' to match parent's default behavior.
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

  // No cache-buster — let HTTP caching + ETags do their job. File is ~8MB raw / <1MB gzipped.
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

  async function loadWithFallback() {
    try {
      const { data, source } = await fetchClosures();
      const raw = unpackClosures(data);
      const closures = raw
        .map(normalizeClosure)
        .filter(c => c.ts && c.ts >= C.MIN_CLOSURE_DATE && c.rev > 0 && c.clientName);
      closures.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
      return {
        closures, source, sourceError: null,
        generatedAt: null, range: null,
        fetchedAt: Date.now(), isDemo: false,
      };
    } catch (e) {
      return {
        closures: [], source: 'error', sourceError: String(e),
        generatedAt: null, range: null,
        fetchedAt: Date.now(), isDemo: false,
      };
    }
  }

  window.BclApi = {
    loadWithFallback, fetchClosures, unpackClosures, normalizeClosure,
    CLOSURES_LOCAL, CLOSURES_DIRECT,
  };
})();
