/* ============================================================================
 * apiAdapter.jsx — Data fetching + normalization for Closures League.
 *
 * Source of truth (same as Bamboo SKU Intelligence):
 *   https://api-intelligence.getbamboo.com/api/reports   (no params, no auth)
 *
 * Local path: ./api/reports  — vercel.json rewrites this same-origin to the
 * upstream so CORS is never an issue. Direct cross-origin URL is the fallback.
 *
 * Each (client × product) row in facts.client_product_sales becomes one
 * "closure" event, attributed to:
 *   - sr: clients.field_rep_idx → reps[].name
 *   - vr: clients.vmi_rep_idx   → reps[].name | 'Unassigned'
 *   - ts: client_product_sales.last_ordered_at_utc[i].slice(0,10)
 *   - rev: revenue_cents / 100
 *   - sku name & category resolved from products + retail_categories
 *
 * Filtered to ts >= MIN_CLOSURE_DATE (2026-05-13).
 * Trade-sample SKUs are dropped (parent app's TS regex).
 * ============================================================================ */
(function () {
  const C = window.BclCore;
  const REPORTS_LOCAL  = './api/reports';
  const REPORTS_DIRECT = 'https://api-intelligence.getbamboo.com/api/reports';

  const TS_RE = /(trade\s*sample)|(^|[^A-Za-z0-9])TS([^A-Za-z0-9]|$)/i;

  function colIdx(dim, name) {
    if (!dim || !dim.columns) return -1;
    return dim.columns.indexOf(name);
  }

  function buildNameLookup(dim) {
    if (!dim || !Array.isArray(dim.rows)) return [];
    const nameI = colIdx(dim, 'name');
    if (nameI < 0) {
      return dim.rows.map(r => (r && r[1] != null) ? String(r[1]) : '');
    }
    return dim.rows.map(r => (r && r[nameI] != null) ? String(r[nameI]) : '');
  }

  function inferCategory(name) {
    if (!name) return 'Other';
    const n = name.toLowerCase();
    if (n.match(/flower|bud|eighth|quarter|ounce|popcorn|smalls|3\.5g|7g|14g|28g/)) return 'Flower';
    if (n.match(/preroll|pre-roll|joint|infused|blunt|doobie/)) return 'Prerolls';
    if (n.match(/vape|cart|cartridge|disposable|dispo|pod|all.in.one|aio|battery|panda pen/)) return 'Vapes';
    if (n.match(/edible|gummy|gummies|chocolate|cookie|brownie|hot shot|softgel/)) return 'Edibles';
    if (n.match(/tincture|drops|sublingual/)) return 'Tinctures';
    if (n.match(/concentrate|dab|wax|shatter|rosin|resin|sauce|badder|crumble|live/)) return 'Concentrates';
    if (n.match(/topical|balm|lotion|salve|patch/)) return 'Topicals';
    if (n.match(/beverage|drink|seltzer|tonic|sungaze|soda/)) return 'Beverage';
    return 'Other';
  }

  function normalizeApiSnapshot(data) {
    if (!data || !data.dimensions || !data.facts) {
      return { closures: [], generatedAt: null, range: null };
    }
    const dims = data.dimensions;
    const facts = data.facts;

    const repNames    = buildNameLookup(dims.reps);
    const clients     = dims.clients;
    const products    = dims.products;
    const retailCats  = buildNameLookup(dims.retail_categories);
    const perfCats    = buildNameLookup(dims.performance_categories);

    const cliNameI = colIdx(clients, 'name');
    const cliSrI   = colIdx(clients, 'field_rep_idx');
    const cliVrI   = colIdx(clients, 'vmi_rep_idx');

    const prodNameI    = colIdx(products, 'name');
    const prodRetCatI  = colIdx(products, 'retail_category_idx');
    const prodPerfCatI = colIdx(products, 'performance_category_idx');

    const N_CLIENTS = (clients && clients.rows) ? clients.rows.length : 0;
    const clientName = new Array(N_CLIENTS);
    const clientSr   = new Array(N_CLIENTS);
    const clientVr   = new Array(N_CLIENTS);
    for (let i = 0; i < N_CLIENTS; i++) {
      const r = clients.rows[i];
      if (!r) continue;
      clientName[i] = (cliNameI >= 0 ? r[cliNameI] : r[1]) || '';
      const srIdx = (cliSrI >= 0) ? r[cliSrI] : r[2];
      const vrIdx = (cliVrI >= 0) ? r[cliVrI] : r[3];
      clientSr[i] = (srIdx != null && repNames[srIdx]) ? repNames[srIdx] : 'Unassigned';
      clientVr[i] = (vrIdx != null && repNames[vrIdx]) ? repNames[vrIdx] : 'Unassigned';
    }

    const N_PRODUCTS = (products && products.rows) ? products.rows.length : 0;
    const productName = new Array(N_PRODUCTS);
    const productCat  = new Array(N_PRODUCTS);
    const productIsTS = new Array(N_PRODUCTS);
    for (let i = 0; i < N_PRODUCTS; i++) {
      const r = products.rows[i];
      if (!r) { productIsTS[i] = true; continue; }
      const name = (prodNameI >= 0 ? r[prodNameI] : r[1]) || '';
      productName[i] = name;
      productIsTS[i] = TS_RE.test(name);
      let cat = null;
      if (prodRetCatI >= 0) {
        const idx = r[prodRetCatI];
        if (idx != null && retailCats[idx]) cat = retailCats[idx];
      } else if (r[3] != null && retailCats[r[3]]) {
        cat = retailCats[r[3]];
      }
      if (!cat && prodPerfCatI >= 0) {
        const pIdx = r[prodPerfCatI];
        if (pIdx != null && perfCats[pIdx]) cat = perfCats[pIdx];
      }
      productCat[i] = cat || inferCategory(name);
    }

    const cps = facts.client_product_sales;
    const closures = [];
    if (cps && Array.isArray(cps.row) && Array.isArray(cps.col)) {
      const rows = cps.row;
      const cols = cps.col;
      const revs = cps.revenue_cents || [];
      const units = cps.units || [];
      const ts = cps.last_ordered_at_utc || [];
      const N = rows.length;
      for (let i = 0; i < N; i++) {
        const ci = rows[i], pi = cols[i];
        const cents = revs[i] || 0;
        if (cents <= 0) continue;
        if (productIsTS[pi]) continue;
        const rawTs = ts[i];
        if (!rawTs) continue;
        const day = String(rawTs).slice(0, 10);
        if (day < C.MIN_CLOSURE_DATE) continue;
        const cName = clientName[ci];
        if (!cName) continue;
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

  async function loadSnapshot() {
    let lastErr = null;
    for (const url of [REPORTS_LOCAL, REPORTS_DIRECT]) {
      try {
        const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status + ' @ ' + url); continue; }
        const data = await res.json();
        return { data, source: url };
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('No /api/reports source reachable');
  }

  function demoClosures() {
    const today = new Date();
    const start = new Date('2026-05-13T00:00:00Z');
    const SR = ['Ashlea Underwood','Caitlin Stoner','Danny Thoren','Jeremy Schmidt','Nancy Drinkard WA','Scotland Schieber','Tyler Brooks','Sarah Lin','Marco Reyes'];
    const VR = ['Josh Novak','Koen McKinley','Curtis Green'];
    const STORES = ['Greenlight - 1WT','Hashtag - VMI','Uncle Ikes - Capitol Hill','Have a Heart - Skyway','Cannabis & Glass - Spokane','World of Weed - Tacoma','Starbuds - Bellingham','Mr. Doobees','Lux Pot Shop','[HPTM] Happy Time'];
    const SKUS = [['Panda Pen 1g','Vapes'],['Firecracker IJ','Prerolls'],['Dabstract Live Resin','Concentrates'],['Hot Shot 5pk','Edibles'],['Sungaze Sparkling','Beverage'],['Bong Buddies 3.5g','Flower'],['Soft Strain Tincture','Tinctures']];
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
          clientName: STORES[Math.floor(Math.random() * STORES.length)] + (Math.random() < 0.3 ? ' - VMI - 1WT' : ' - 1WT'),
          skuName: sk[0], category: sk[1],
          rev: Math.round(80 + Math.random() * 1400),
          units: Math.round(2 + Math.random() * 60),
          sr, vr,
        });
      }
    }
    return rows;
  }

  async function loadWithFallback() {
    try {
      const { data, source } = await loadSnapshot();
      const norm = normalizeApiSnapshot(data);
      return {
        closures: norm.closures, source, sourceError: null,
        generatedAt: norm.generatedAt, range: norm.range,
        fetchedAt: Date.now(), isDemo: false,
      };
    } catch (e) {
      return {
        closures: demoClosures(), source: 'demo', sourceError: String(e),
        generatedAt: null, range: null,
        fetchedAt: Date.now(), isDemo: true,
      };
    }
  }

  function normalizeClosure(r) {
    return {
      ts: (typeof r.ts === 'string') ? r.ts.slice(0, 10) : C.ymd(r.ts),
      clientName: String(r.clientName || '').trim(),
      skuName: String(r.skuName || '').trim(),
      category: String(r.category || 'Other').trim(),
      rev: Number(r.rev || 0),
      units: Number(r.units || 0),
      sr: String(r.sr || 'Unassigned').trim(),
      vr: String(r.vr || 'Unassigned').trim(),
    };
  }

  window.BclApi = {
    loadWithFallback, loadSnapshot, normalizeApiSnapshot, normalizeClosure,
    REPORTS_LOCAL, REPORTS_DIRECT,
  };
})();
