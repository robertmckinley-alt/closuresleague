/* ============================================================================
 * apiAdapter.jsx — Data fetching for Closures League.
 *
 * HYBRID source (per user request 2026-06-08):
 *   1. Historical baseline:  ./data/closures.json
 *      Mirrored from Bamboo SKU Intelligence by sync-closures.yml. Contains
 *      the parent's authoritative diff_closures.py output (one row per real
 *      day-over-day closure event).
 *
 *   2. Fresh delta (today+):  https://api-intelligence.getbamboo.com/api/reports
 *      Same live endpoint SKU Intelligence reads. For every (client × product)
 *      pair whose last_ordered_at_utc is AFTER the last date in closures.json,
 *      we emit a synthetic closure on that date. This closes the upstream lag
 *      so today's activity shows up immediately.
 *
 * Schema (post-normalize):
 *   { ts, clientName, skuName, skuGroup, category, rev, units, sr, vr, type }
 *   type ∈ { 'group', 'product', 'api' }   ('api' = synthesized from live API)
 *
 * Filter: ts >= MIN_CLOSURE_DATE (2026-05-13).
 * ============================================================================ */
(function () {
  const C = window.BclCore;
  const CLOSURES_LOCAL  = './data/closures.json';
  const CLOSURES_DIRECT = 'https://bamboo-sku-intelligence.vercel.app/data/closures.json';
  const REPORTS_URL     = 'https://api-intelligence.getbamboo.com/api/reports';

  // -------- closures.json unpack/normalize --------
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

  // -------- /api/reports normalize (dimension lookups + walk facts) --------
  function colIdx(dim, name) { return (dim && dim.columns) ? dim.columns.indexOf(name) : -1; }
  function nameLookup(dim) {
    if (!dim || !Array.isArray(dim.rows)) return [];
    const i = colIdx(dim, 'name');
    return dim.rows.map(r => {
      if (!r) return '';
      const v = i >= 0 ? r[i] : r[1];
      return v != null ? String(v) : '';
    });
  }
  function deriveLiveClosures(apiData, sinceDate) {
    if (!apiData || !apiData.dimensions || !apiData.facts) return [];
    const dims = apiData.dimensions, facts = apiData.facts;
    const reps = nameLookup(dims.reps);
    const retailCats = nameLookup(dims.retail_categories);
    const clients = dims.clients, products = dims.products;
    const cliName  = colIdx(clients, 'name');
    const cliSr    = colIdx(clients, 'field_rep_idx');
    const cliVr    = colIdx(clients, 'vmi_rep_idx');
    const prdName  = colIdx(products, 'name');
    const prdCat   = colIdx(products, 'retail_category_idx');

    const N_CLI = clients?.rows?.length || 0;
    const clientName = new Array(N_CLI), clientSr = new Array(N_CLI), clientVr = new Array(N_CLI);
    for (let i = 0; i < N_CLI; i++) {
      const r = clients.rows[i]; if (!r) continue;
      clientName[i] = (cliName >= 0 ? r[cliName] : r[1]) || '';
      const srI = cliSr >= 0 ? r[cliSr] : r[2];
      const vrI = cliVr >= 0 ? r[cliVr] : r[3];
      clientSr[i] = (srI != null && reps[srI]) ? reps[srI] : 'Unassigned';
      clientVr[i] = (vrI != null && reps[vrI]) ? reps[vrI] : 'Unassigned';
    }
    const N_PRD = products?.rows?.length || 0;
    const productName = new Array(N_PRD), productCat = new Array(N_PRD);
    for (let i = 0; i < N_PRD; i++) {
      const r = products.rows[i]; if (!r) continue;
      productName[i] = (prdName >= 0 ? r[prdName] : r[1]) || '';
      const ci = prdCat >= 0 ? r[prdCat] : r[3];
      productCat[i] = (ci != null && retailCats[ci]) ? retailCats[ci] : 'Other';
    }

    const cps = facts.client_product_sales;
    const out = [];
    if (cps && Array.isArray(cps.row) && Array.isArray(cps.col)) {
      const row = cps.row, col = cps.col;
      const revs = cps.revenue_cents || [];
      const units = cps.units || [];
      const ts = cps.last_ordered_at_utc || [];
      for (let i = 0; i < row.length; i++) {
        const ci = row[i], pi = col[i];
        const cents = revs[i] || 0; if (cents <= 0) continue;
        const raw = ts[i]; if (!raw) continue;
        const day = String(raw).slice(0, 10);
        if (day <= sinceDate) continue;            // already covered by closures.json
        if (day < C.MIN_CLOSURE_DATE) continue;
        const cName = clientName[ci]; if (!cName) continue;
        out.push({
          ts: day,
          clientName: cName,
          skuName: productName[pi] || '',
          skuGroup: productName[pi] || '',
          category: productCat[pi] || 'Other',
          rev: cents / 100,
          units: units[i] || 0,
          sr: clientSr[ci],
          vr: clientVr[ci],
          type: 'api',         // flag synthesized rows
        });
      }
    }
    return out;
  }

  // -------- fetchers --------
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
  async function fetchLiveSnapshot() {
    try {
      const res = await fetch(REPORTS_URL, { credentials: 'omit', cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  // -------- master loader --------
  async function loadWithFallback() {
    let baseline = [], baselineSource = null, baselineLastDate = '0000-00-00';
    try {
      const { data, source } = await fetchHistoricalClosures();
      const raw = unpackClosures(data);
      baseline = raw.map(normalizeClosure).filter(c =>
        c.ts && c.ts >= C.MIN_CLOSURE_DATE && c.rev > 0 && c.clientName
      );
      baselineSource = source;
      baseline.forEach(c => { if (c.ts > baselineLastDate) baselineLastDate = c.ts; });
    } catch (e) {
      console.warn('baseline load failed:', e);
    }

    let fresh = [], freshSource = null;
    try {
      const api = await fetchLiveSnapshot();
      if (api) {
        fresh = deriveLiveClosures(api, baselineLastDate);
        freshSource = REPORTS_URL;
      }
    } catch (e) {
      console.warn('live API load failed:', e);
    }

    // Merge — baseline (historical accurate) + fresh (today+)
    const closures = baseline.concat(fresh);
    closures.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);

    if (closures.length === 0) {
      return {
        closures: [], source: 'error',
        sourceError: 'Neither closures.json nor /api/reports reachable',
        baselineLastDate, freshCount: 0, baselineCount: 0,
        fetchedAt: Date.now(), isDemo: false,
      };
    }
    return {
      closures, source: baselineSource ? baselineSource + (freshSource ? ' + live' : '') : freshSource,
      sourceError: null,
      baselineCount: baseline.length, freshCount: fresh.length, baselineLastDate,
      generatedAt: null, range: null,
      fetchedAt: Date.now(), isDemo: false,
    };
  }

  window.BclApi = {
    loadWithFallback,
    fetchHistoricalClosures, fetchLiveSnapshot,
    deriveLiveClosures, unpackClosures, normalizeClosure,
    CLOSURES_LOCAL, CLOSURES_DIRECT, REPORTS_URL,
  };
})();
