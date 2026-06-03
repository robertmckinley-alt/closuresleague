/* ============================================================================
 * apiAdapter.jsx — Data fetching for Closures League.
 *
 * Primary source (live, real-time):
 *   https://api-intelligence.getbamboo.com/api/reports
 *   Same endpoint Bamboo SKU Intelligence uses. Walk
 *   facts.client_product_sales → one closure per (client × product) pair,
 *   attribute total revenue to the pair's last_ordered_at_utc date.
 *   Cross-origin: the API allows CORS so direct browser fetch works.
 *
 * Fallback (cached snapshot):
 *   ./data/closures.json
 *   Updated every 30 minutes by .github/workflows/sync-closures.yml
 *   which mirrors the parent app's diff_closures.py output.
 *
 * Last resort: synthetic demo dataset (only if BOTH fail).
 *
 * All sources filtered to ts >= MIN_CLOSURE_DATE (2026-05-13).
 * Trade-sample SKUs are dropped (parent app's TS regex).
 * ============================================================================ */
(function () {
  const C = window.BclCore;
  const REPORTS_URL    = 'https://api-intelligence.getbamboo.com/api/reports';
  const CLOSURES_LOCAL = './data/closures.json';

  const TS_RE = /(trade\s*sample)|(^|[^A-Za-z0-9])TS([^A-Za-z0-9]|$)/i;

  // -------- columnar dimension helpers --------
  function colIdx(dim, name) {
    if (!dim || !dim.columns) return -1;
    return dim.columns.indexOf(name);
  }
  function buildNameLookup(dim) {
    if (!dim || !Array.isArray(dim.rows)) return [];
    const i = colIdx(dim, 'name');
    return dim.rows.map(r => {
      if (!r) return '';
      const v = i >= 0 ? r[i] : r[1];
      return v != null ? String(v) : '';
    });
  }

  // Light inference fallback if no retail/perf category resolves.
  function inferCategory(name) {
    if (!name) return 'Other';
    const n = name.toLowerCase();
    if (n.match(/flower|bud|eighth|quarter|ounce|popcorn|smalls|3\.5g|7g|14g|28g/)) return 'Flower';
    if (n.match(/preroll|pre-roll|joint|infused|blunt|doobie|sparkler|banger/)) return 'Prerolls';
    if (n.match(/vape|cart|cartridge|disposable|dispo|pod|all.in.one|aio|battery|panda pen|micro bar|juice box/)) return 'Vapes';
    if (n.match(/edible|gummy|gummies|chocolate|cookie|brownie|hot shot|softgel|candies|caramel/)) return 'Edibles';
    if (n.match(/tincture|drops|sublingual/)) return 'Tinctures';
    if (n.match(/concentrate|dab|wax|shatter|rosin|resin|sauce|badder|crumble|sugar|icing|cake batter|gems/)) return 'Concentrates';
    if (n.match(/topical|balm|lotion|salve|patch|cream/)) return 'Topicals';
    if (n.match(/beverage|drink|seltzer|tonic|sungaze|soda|hot shotz/)) return 'Beverage';
    return 'Other';
  }

  // -------- /api/reports normalizer → closures[] --------
  function normalizeApiSnapshot(data) {
    if (!data || !data.dimensions || !data.facts) return { closures: [], generatedAt: null, range: null };
    const dims = data.dimensions;
    const facts = data.facts;
    const repNames = buildNameLookup(dims.reps);
    const clients = dims.clients;
    const products = dims.products;
    const retailCats = buildNameLookup(dims.retail_categories);
    const perfCats = buildNameLookup(dims.performance_categories);
    const cliNameI = colIdx(clients, 'name');
    const cliSrI = colIdx(clients, 'field_rep_idx');
    const cliVrI = colIdx(clients, 'vmi_rep_idx');
    const prodNameI = colIdx(products, 'name');
    const prodRetCatI = colIdx(products, 'retail_category_idx');
    const prodPerfCatI = colIdx(products, 'performance_category_idx');

    const N_CLI = clients && clients.rows ? clients.rows.length : 0;
    const clientName = new Array(N_CLI), clientSr = new Array(N_CLI), clientVr = new Array(N_CLI);
    for (let i = 0; i < N_CLI; i++) {
      const r = clients.rows[i]; if (!r) continue;
      clientName[i] = (cliNameI >= 0 ? r[cliNameI] : r[1]) || '';
      const srIdx = cliSrI >= 0 ? r[cliSrI] : r[2];
      const vrIdx = cliVrI >= 0 ? r[cliVrI] : r[3];
      clientSr[i] = (srIdx != null && repNames[srIdx]) ? repNames[srIdx] : 'Unassigned';
      clientVr[i] = (vrIdx != null && repNames[vrIdx]) ? repNames[vrIdx] : 'Unassigned';
    }
    const N_PRD = products && products.rows ? products.rows.length : 0;
    const productName = new Array(N_PRD), productCat = new Array(N_PRD), productIsTS = new Array(N_PRD);
    for (let i = 0; i < N_PRD; i++) {
      const r = products.rows[i]; if (!r) { productIsTS[i] = true; continue; }
      const name = (prodNameI >= 0 ? r[prodNameI] : r[1]) || '';
      productName[i] = name;
      productIsTS[i] = TS_RE.test(name);
      let cat = null;
      if (prodRetCatI >= 0) {
        const idx = r[prodRetCatI];
        if (idx != null && retailCats[idx]) cat = retailCats[idx];
      } else if (r[3] != null && retailCats[r[3]]) cat = retailCats[r[3]];
      if (!cat && prodPerfCatI >= 0) {
        const pIdx = r[prodPerfCatI];
        if (pIdx != null && perfCats[pIdx]) cat = perfCats[pIdx];
      }
      productCat[i] = cat || inferCategory(name);
    }

    const cps = facts.client_product_sales;
    const closures = [];
    if (cps && Array.isArray(cps.row) && Array.isArray(cps.col)) {
      const rows = cps.row, cols = cps.col;
      const revs = cps.revenue_cents || [];
      const units = cps.units || [];
      const ts = cps.last_ordered_at_utc || [];
      for (let i = 0; i < rows.length; i++) {
        const ci = rows[i], pi = cols[i];
        const cents = revs[i] || 0;
        if (cents <= 0) continue;
        if (productIsTS[pi]) continue;
        const raw = ts[i]; if (!raw) continue;
        const day = String(raw).slice(0, 10);
        if (day < C.MIN_CLOSURE_DATE) continue;
        const cName = clientName[ci]; if (!cName) continue;
        closures.push({
          ts: day,
          clientName: cName,
          skuName: productName[pi] || '',
          category: productCat[pi] || 'Other',
          rev: cents / 100,
          units: units[i] || 0,
          sr: clientSr[ci],
          vr: clientVr[ci],
        });
      }
    }
    closures.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
    return { closures, generatedAt: data.generated_at || null, range: data.range || null };
  }

  // -------- closures.json fallback (already-normalized day-diff rows) --------
  function unpackClosures(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows) && Array.isArray(data.cols)) {
      const cols = data.cols;
      return data.rows.map(r => { const o = {}; for (let i = 0; i < cols.length; i++) o[cols[i]] = r[i]; return o; });
    }
    if (data && Array.isArray(data.closures)) return data.closures;
    return [];
  }
  function normalizeClosure(r) {
    return {
      ts: (typeof r.ts === 'string') ? r.ts.slice(0, 10) : C.ymd(r.ts),
      clientName: String(r.clientName || r.client || '').trim(),
      skuName: String(r.skuName || r.sku || '').trim(),
      category: String(r.category || 'Other').trim(),
      rev: Number(r.rev || r.revenue || 0),
      units: Number(r.units || 0),
      sr: String(r.sr || 'Unassigned').trim(),
      vr: String(r.vr || 'Unassigned').trim(),
    };
  }

  // -------- demo (only if both sources fail) --------
  function demoClosures() {
    const today = new Date();
    const start = new Date('2026-05-13T00:00:00Z');
    const SR = ['Ashlea Underwood','Caitlin Stoner','Danny Thoren','Jeremy Schmidt','Nancy Drinkard WA','Scotland Schieber'];
    const VR = ['Josh Novak','Koen McKinley','Curtis Green'];
    const STORES = ['Greenlight - 1WT','Hashtag - VMI','Uncle Ikes - Capitol Hill','Have a Heart - Skyway','World of Weed - Tacoma'];
    const SKUS = [['Panda Pen 1g','Vapes'],['Firecracker IJ','Prerolls'],['Dabstract Live Resin','Concentrates']];
    const rows = [];
    const dayCount = Math.max(1, Math.round((today - start) / 86400000));
    for (let d = 0; d < dayCount; d++) {
      const date = new Date(start.getTime() + d * 86400000);
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
      const n = 4 + Math.floor(Math.random() * 18);
      for (let i = 0; i < n; i++) {
        const sk = SKUS[Math.floor(Math.random() * SKUS.length)];
        const sr = SR[Math.floor(Math.random() * SR.length)];
        const vr = Math.random() < 0.4 ? VR[Math.floor(Math.random() * VR.length)] : 'Unassigned';
        rows.push({
          ts: date.toISOString().slice(0, 10),
          clientName: STORES[Math.floor(Math.random() * STORES.length)],
          skuName: sk[0], category: sk[1],
          rev: Math.round(80 + Math.random() * 1400),
          units: Math.round(2 + Math.random() * 60),
          sr, vr,
        });
      }
    }
    return rows;
  }

  // -------- master loader: live API → snapshot file → demo --------
  async function loadWithFallback() {
    // 1. Live API (CORS-enabled by Bamboo)
    try {
      const res = await fetch(REPORTS_URL, { credentials: 'omit', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const norm = normalizeApiSnapshot(data);
        if (norm.closures.length > 0) {
          return {
            closures: norm.closures, source: REPORTS_URL, sourceError: null,
            generatedAt: norm.generatedAt, range: norm.range,
            fetchedAt: Date.now(), isDemo: false,
          };
        }
      }
    } catch (e) { /* fall through */ }

    // 2. Cached snapshot file
    try {
      const res = await fetch(CLOSURES_LOCAL, { credentials: 'omit', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const raw = unpackClosures(data);
        const closures = raw.map(normalizeClosure)
          .filter(c => c.ts && c.ts >= C.MIN_CLOSURE_DATE && c.rev > 0 && c.clientName);
        closures.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
        if (closures.length > 0) {
          return {
            closures, source: CLOSURES_LOCAL, sourceError: null,
            generatedAt: null, range: null,
            fetchedAt: Date.now(), isDemo: false,
          };
        }
      }
    } catch (e) { /* fall through */ }

    // 3. Demo
    const demo = demoClosures().map(normalizeClosure);
    return {
      closures: demo, source: 'demo', sourceError: 'live API + snapshot both unreachable',
      generatedAt: null, range: null,
      fetchedAt: Date.now(), isDemo: true,
    };
  }

  window.BclApi = {
    loadWithFallback, normalizeApiSnapshot, normalizeClosure, unpackClosures,
    REPORTS_URL, CLOSURES_LOCAL,
  };
})();
