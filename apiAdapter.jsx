/* ============================================================================
 * apiAdapter.jsx — Data fetching for Closures League.
 *
 * Source of truth: ./data/closures.json
 *
 * This is identical to what Bamboo SKU Intelligence's "Void Closures" tab
 * reads. The file is produced by scripts/diff_closures.py upstream and
 * contains REAL day-over-day closure events — one row per (store × SKU)
 * pair that went from $0 yesterday to >$0 today:
 *
 *   { ts, clientName, skuName, category, rev, units, sr, vr }
 *
 * Our .github/workflows/sync-closures.yml mirrors the upstream file into
 * this repo every 5 minutes. The app reads it same-origin (no CORS) and
 * displays each closure on its true day. We do NOT touch /api/reports —
 * that endpoint returns cumulative totals over the report range, which
 * cannot be sliced into weekly buckets accurately.
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
    return {
      ts: (typeof r.ts === 'string') ? r.ts.slice(0, 10) : C.ymd(r.ts),
      clientName: String(r.clientName || r.client || r.store || '').trim(),
      skuName: String(r.skuName || r.sku || r.product || '').trim(),
      category: String(r.category || r.cat || 'Other').trim(),
      rev: Number(r.rev || r.revenue || 0),
      units: Number(r.units || r.u || 0),
      sr: String(r.sr || r.salesRep || r.rep || 'Unassigned').trim(),
      vr: String(r.vr || r.vmiRep || 'Unassigned').trim(),
    };
  }

  async function fetchClosures() {
    // Same-origin first (always succeeds — sync workflow writes the file every 5 min).
    // Cross-origin direct fallback only for local file:// preview without vercel.
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
      // No demo fallback. We surface an empty dataset and a clear error so
      // the user can see something is wrong instead of looking at fake numbers.
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
