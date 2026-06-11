/* ============================================================================
 * apiAdapter.jsx — Data fetching for Closures League.
 *
 * Source of truth: ./data/closures.json (mirrored from Bamboo SKU Intelligence
 * by .github/workflows/sync-closures.yml every 5 minutes). The parent repo
 * implements the closure spec (see its data/tracker_meta.json -> spec_version
 * 2026-06-08-c): top-20 priority retail-categories track their top-10 SKUs at
 * SKU level, every other category (including all of Dabstract) collapses to
 * one closure per (store, retail_category) per wave of new SKUs. The league
 * just consumes the file — no re-validation here.
 *
 * Schema each row arrives with:
 *   { ts, clientName, skuName, category, rev, units, sr, vr, type, skuGroup, closureKind }
 *
 * type / closureKind values: "top-sku" | "cat-new" | "cat-expansion"
 * ============================================================================ */
(function () {
  const C = window.BclCore;
  const CLOSURES_LOCAL  = './data/closures.json';
  // The Vercel app is behind a password gate, so it can't be a direct
  // fallback from the league. Use raw.githubusercontent.com instead.
  const CLOSURES_DIRECT = 'https://raw.githubusercontent.com/robertmckinley-alt/bamboo-sku-intelligence/main/data/closures.json';

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
    const kind = String(r.closureKind || r.type || 'top-sku').trim().toLowerCase();
    return {
      ts,
      clientName: String(r.clientName || r.client || '').trim(),
      skuName: String(r.skuName || r.sku || '').trim(),
      skuGroup: String(r.skuGroup || r.sku_group || r.skuName || '').trim(),
      category: String(r.category || r.cat || 'Other').trim(),
      rev: Number(r.rev || r.revenue || 0),
      units: Number(r.units || r.u || 0),
      sr: String(r.sr || r.salesRep || r.rep || 'Unassigned').trim(),
      vr: String(r.vr || r.vmiRep || 'Unassigned').trim(),
      type: kind,
      closureKind: kind,
    };
  }

  async function fetchClosures() {
    let lastErr = null;
    for (const url of [CLOSURES_LOCAL, CLOSURES_DIRECT]) {
      try {
        const res = await fetch(url + '?t=' + Date.now(), { credentials: 'omit', cache: 'no-store' });
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status + ' @ ' + url); continue; }
        const data = await res.json();
        return { data, source: url };
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('closures.json unreachable');
  }

  async function loadWithFallback() {
    try {
      const fetched = await fetchClosures();
      const raw = unpackClosures(fetched.data).map(normalizeRow);
      // Light filter: ts on or after 2026-06-01, non-zero rev, non-empty store/sku.
      const closures = raw.filter(c =>
        c.ts && c.ts >= C.MIN_CLOSURE_DATE && c.clientName && c.skuName
      );
      closures.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
      return {
        closures, source: fetched.source, sourceError: null,
        rawCount: raw.length, dedupedCount: closures.length,
        generatedAt: null, range: null,
        fetchedAt: Date.now(), isDemo: false,
      };
    } catch (e) {
      return {
        closures: [], source: 'error', sourceError: String(e),
        rawCount: 0, dedupedCount: 0,
        generatedAt: null, range: null,
        fetchedAt: Date.now(), isDemo: false,
      };
    }
  }

  window.BclApi = {
    loadWithFallback, fetchClosures, unpackClosures, normalizeRow,
    CLOSURES_LOCAL, CLOSURES_DIRECT,
  };
})();
