/* ============================================================================
 * apiAdapter.jsx — Data fetching for Closures League.
 *
 * Source of truth: the parent app's daily closures diff.
 *   /data/closures.json       (same-origin · proxied by vercel.json to:
 *     https://bamboo-sku-intelligence.vercel.app/data/closures.json)
 *
 * That file is produced by scripts/diff_closures.py in bamboo-sku-intelligence
 * and contains one row per real day-over-day closure event:
 *   { ts, clientName, skuName, category, rev, units, sr, vr }
 *
 * We fall through to a direct fetch if the rewrite isn't in play (e.g. local
 * file:// preview), and finally to a synthetic demo dataset so the UI renders
 * cleanly while data is being wired up.
 *
 * Filtered to ts >= MIN_CLOSURE_DATE (2026-05-13).
 * ============================================================================ */
(function () {
  const C = window.BclCore;
  const CLOSURES_LOCAL  = './data/closures.json';                                       // vercel rewrite (preferred)
  const CLOSURES_DIRECT = 'https://bamboo-sku-intelligence.vercel.app/data/closures.json'; // direct cross-origin fallback

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

  async function loadClosuresRaw() {
    let lastErr = null;
    for (const url of [CLOSURES_LOCAL, CLOSURES_DIRECT]) {
      try {
        const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status + ' @ ' + url); continue; }
        const data = await res.json();
        return { data, source: url };
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('closures.json unreachable');
  }

  function demoClosures() {
    const today = new Date();
    const start = new Date('2026-05-13T00:00:00Z');
    const SR = ['Ashlea Underwood','Caitlin Stoner','Danny Thoren','Jeremy Schmidt','Nancy Drinkard WA','Scotland Schieber'];
    const VR = ['Josh Novak','Koen McKinley','Curtis Green'];
    const STORES = ['Greenlight - 1WT','Hashtag - VMI','Uncle Ikes - Capitol Hill','Have a Heart - Skyway','World of Weed - Tacoma','Starbuds - Bellingham','Mr. Doobees','Lux Pot Shop','[HPTM] Happy Time'];
    const SKUS = [['Panda Pen 1g','Vapes'],['Firecracker IJ','Prerolls'],['Dabstract Live Resin','Concentrates'],['Hot Shotz - THC','Edibles'],['Sungaze Sparkling','Beverage'],['Bong Buddies 3.5g','Flower']];
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
      const { data, source } = await loadClosuresRaw();
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
      const demo = demoClosures().map(normalizeClosure);
      return {
        closures: demo, source: 'demo', sourceError: String(e),
        generatedAt: null, range: null,
        fetchedAt: Date.now(), isDemo: true,
      };
    }
  }

  window.BclApi = {
    loadWithFallback, loadClosuresRaw, unpackClosures, normalizeClosure,
    CLOSURES_LOCAL, CLOSURES_DIRECT,
  };
})();
