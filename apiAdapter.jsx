/* ============================================================================
 * apiAdapter.jsx — Data fetching + normalization for Closures League.
 *
 * Sources (tried in order, first that works wins):
 *   1. Same-origin proxy:    /data/closures.json
 *      (vercel.json rewrites this to https://bamboo-sku-intelligence.vercel.app/data/closures.json
 *      to avoid CORS; in local dev without vercel, drop a closures.json into /data/)
 *   2. Same-origin proxy:    /api/reports
 *      (vercel.json rewrites this to https://api-intelligence.getbamboo.com/api/reports)
 *      used as a supplemental "right now" snapshot
 *
 * Every closure is filtered to ts >= MIN_CLOSURE_DATE (2026-05-13).
 * ============================================================================ */
(function () {
  const C = window.BclCore;
  const CLOSURES_LOCAL   = './data/closures.json';                                   // same-origin (vercel rewrite)
  const CLOSURES_DIRECT  = 'https://bamboo-sku-intelligence.vercel.app/data/closures.json'; // direct (may fail CORS)
  const REPORTS_API      = './api/reports';                                          // same-origin (vercel rewrite)
  const REPORTS_DIRECT   = 'https://api-intelligence.getbamboo.com/api/reports';     // direct fallback

  function safeJson(resp) { return resp.ok ? resp.json() : Promise.reject(new Error('HTTP ' + resp.status)); }

  // ---------- Closures loader ----------
  // Accepts either:
  //   • Array of objects {ts, clientName, skuName, category, rev, units, sr, vr}
  //   • Columnar {cols: [...], rows: [[...], ...]}
  async function loadClosuresRaw() {
    const urls = [CLOSURES_LOCAL, CLOSURES_DIRECT];
    let lastErr;
    for (const url of urls) {
      try {
        const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status + ' @ ' + url); continue; }
        const data = await res.json();
        return { data, source: url };
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('No closures source reachable');
  }

  function unpackClosures(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows) && Array.isArray(data.cols)) {
      const cols = data.cols;
      return data.rows.map(r => {
        const o = {}; cols.forEach((c, i) => { o[c] = r[i]; }); return o;
      });
    }
    if (data && Array.isArray(data.closures)) return data.closures;
    return [];
  }

  // Normalize a closure row defensively.
  function normalizeClosure(r) {
    const ts = typeof r.ts === 'string' ? r.ts.slice(0, 10) : C.ymd(r.ts);
    return {
      ts,
      clientName: String(r.clientName || r.client || r.store || '').trim(),
      skuName: String(r.skuName || r.sku || r.product || '').trim(),
      category: String(r.category || r.cat || 'Other').trim(),
      rev: Number(r.rev || r.revenue || 0),
      units: Number(r.units || r.u || 0),
      sr: String(r.sr || r.salesRep || r.rep || 'Unassigned').trim(),
      vr: String(r.vr || r.vmiRep || 'Unassigned').trim(),
    };
  }

  // ---------- Live snapshot (supplemental) ----------
  async function loadLiveSnapshot() {
    for (const url of [REPORTS_API, REPORTS_DIRECT]) {
      try {
        const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
        if (!res.ok) continue;
        const data = await res.json();
        return {
          generatedAt: data.generated_at || null,
          range: data.range || null,
          // We don't normalize the full thing; only expose what we need for the executive bar.
          raw: data,
        };
      } catch (e) { /* try next */ }
    }
    return null;
  }

  // ---------- Master loader ----------
  async function load() {
    const [closuresPack, live] = await Promise.all([
      loadClosuresRaw().catch(e => ({ data: [], source: null, error: String(e) })),
      loadLiveSnapshot(),
    ]);
    const raw = unpackClosures(closuresPack.data);
    const closures = raw
      .map(normalizeClosure)
      .filter(c => c.ts && c.ts >= C.MIN_CLOSURE_DATE && c.rev > 0 && c.clientName);
    closures.sort((a, b) => a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);
    return {
      closures,
      source: closuresPack.source,
      sourceError: closuresPack.error || null,
      live,
      fetchedAt: Date.now(),
    };
  }

  // ---------- Demo fallback (used when both sources unreachable) ----------
  // Allows the app to render with the design intact while the user wires up data.
  function demoClosures() {
    const today = new Date();
    const start = new Date('2026-05-13T00:00:00Z');
    const SR = ['Ashlea Underwood', 'Caitlin Stoner', 'Danny Thoren', 'Jeremy Schmidt', 'Nancy Drinkard WA', 'Scotland Schieber', 'Tyler Brooks', 'Sarah Lin', 'Marco Reyes'];
    const VR = ['Josh Novak', 'Koen McKinley', 'Curtis Green'];
    const STORES = ['Greenlight - 1WT', 'Hashtag - VMI', 'Uncle Ikes - Capitol Hill', 'Have a Heart - Skyway', 'Cannabis & Glass - Spokane', 'World of Weed - Tacoma', 'Starbuds - Bellingham', 'Mr. Doobees', 'Lux Pot Shop', '[HPTM] Happy Time'];
    const SKUS = [['Panda Pen 1g','Vapes'],['Firecracker IJ','Prerolls'],['Dabstract Live Resin','Concentrates'],['Hot Shot 5pk','Edibles'],['Sungaze Sparkling','Beverage'],['Bong Buddies 3.5g','Flower'],['Soft Strain Tincture','Tinctures']];
    const rows = [];
    const dayCount = Math.max(1, Math.round((today - start) / 86400000));
    for (let d = 0; d < dayCount; d++) {
      const date = new Date(start.getTime() + d * 86400000);
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue; // skip weekends, lighter
      const n = 4 + Math.floor(Math.random() * 18);
      for (let i = 0; i < n; i++) {
        const sk = SKUS[Math.floor(Math.random() * SKUS.length)];
        const sr = SR[Math.floor(Math.random() * SR.length)];
        const vr = Math.random() < 0.4 ? VR[Math.floor(Math.random() * VR.length)] : 'Unassigned';
        rows.push({
          ts: date.toISOString().slice(0, 10),
          clientName: STORES[Math.floor(Math.random() * STORES.length)] + (Math.random() < 0.3 ? ' - VMI - 1WT' : ' - 1WT'),
          skuName: sk[0],
          category: sk[1],
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
      const res = await load();
      if (res.closures.length > 0) return res;
      // empty but no error → still return
      return { ...res, isDemo: false };
    } catch (e) {
      const demo = demoClosures().map(normalizeClosure);
      return { closures: demo, source: 'demo', sourceError: String(e), live: null, fetchedAt: Date.now(), isDemo: true };
    }
  }

  window.BclApi = { load, loadWithFallback, normalizeClosure, REPORTS_API, CLOSURES_LOCAL, REPORTS_DIRECT, CLOSURES_DIRECT };
})();
