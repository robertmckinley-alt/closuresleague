/* ============================================================================
 * core.jsx — Bamboo Closures League · Utilities
 * Number/date formatters, week math, useUrlState, sound manager primitives.
 * ============================================================================ */
(function () {
  const { useState, useEffect, useRef, useMemo, useCallback } = React;

  // ---------- Constants ----------
  // Ledger boundary: rows with ts <= 2026-05-31 form the baseline (SKU and
  // ordered before that was already on the books; from 5/28 forward any new
  // (store × SKU) appearance is a genuine first-time placement = a real closure.
  const MIN_CLOSURE_DATE = '2026-06-01';  // Ledger floor — 5/31 EOD is the baseline cutoff
  const WEEKLY_REP_GOAL = 15000;
  const WEEKLY_VMI_GOAL = 10000;
  const WEEKLY_TEAM_GOAL = 80000;
  // VMI reps per user spec: Josh, Koen, Curtis (matched as whole words).
  const VMI_REP_TOKENS = ['josh', 'koen', 'curtis'];
  const POLL_MS = 60000;

  // ---------- Number formatters ----------
  const _money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const _moneyD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  const _num   = new Intl.NumberFormat('en-US');
  const fmt$   = (v) => isFinite(v) ? _money0.format(Math.round(v || 0)) : '—';
  const fmt$d  = (v) => isFinite(v) ? _moneyD.format(v || 0) : '—';
  const fmtN   = (v) => isFinite(v) ? _num.format(Math.round(v || 0)) : '—';
  const fmtNum = (v, d = 0) => isFinite(v) ? _num.format(Number((v || 0).toFixed(d))) : '—';
  const fmtPct = (v, d = 1) => isFinite(v) ? ((v * 100).toFixed(d) + '%') : '—';
  const fmtK   = (v) => {
    if (!isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return _num.format(Math.round(v));
  };

  // ---------- Date helpers ----------
  function toDate(s) {
    if (s instanceof Date) return s;
    if (!s) return null;
    if (typeof s === 'string') {
      const d = new Date(s.length === 10 ? s + 'T00:00:00Z' : s.replace(' ', 'T'));
      return isNaN(d) ? null : d;
    }
    return null;
  }
  function ymd(d) {
    if (!d) return '';
    const dt = (d instanceof Date) ? d : toDate(d);
    if (!dt || isNaN(dt)) return '';
    return dt.toISOString().slice(0, 10);
  }
  function addDays(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
  function startOfWeek(d) {
    const x = toDate(d) || new Date();
    const dow = x.getUTCDay();
    const offsetToMon = (dow === 0) ? -6 : (1 - dow);
    const wk = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
    wk.setUTCDate(wk.getUTCDate() + offsetToMon);
    return wk;
  }
  function endOfWeek(d) { return addDays(startOfWeek(d), 6); }
  function startOfMonth(d) { const x = toDate(d) || new Date(); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1)); }
  function endOfMonth(d) { const x = toDate(d) || new Date(); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)); }
  function startOfQuarter(d) {
    const x = toDate(d) || new Date();
    const qStart = Math.floor(x.getUTCMonth() / 3) * 3;
    return new Date(Date.UTC(x.getUTCFullYear(), qStart, 1));
  }
  function endOfQuarter(d) {
    const x = toDate(d) || new Date();
    const qStart = Math.floor(x.getUTCMonth() / 3) * 3;
    return new Date(Date.UTC(x.getUTCFullYear(), qStart + 3, 0));
  }
  function withinRange(dateStr, from, to) {
    const d = ymd(dateStr);
    if (!d) return false;
    if (from && d < ymd(from)) return false;
    if (to && d > ymd(to)) return false;
    return true;
  }
  function weekLabel(d) {
    const s = startOfWeek(d);
    return 'Wk of ' + s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function relTime(iso) {
    if (!iso) return '';
    const t = (typeof iso === 'string') ? new Date(iso).getTime() : iso;
    if (!isFinite(t)) return '';
    const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return s + 's ago';
    const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24); return d + 'd ago';
  }
  function daysRemainingInWeek(asOf) {
    const x = toDate(asOf) || new Date();
    const e = endOfWeek(x);
    return Math.max(0, Math.ceil((e.getTime() - x.getTime()) / (24 * 3600 * 1000)));
  }
  function weekPaceFraction(asOf) {
    const x = toDate(asOf) || new Date();
    const s = startOfWeek(x);
    const elapsed = (x.getTime() - s.getTime()) / (7 * 24 * 3600 * 1000);
    return Math.max(0, Math.min(1, elapsed));
  }

  // ---------- VMI classifier ----------
  // Word-level match. "Josh Novak" → VMI ✓ · "Joshua Smith" → not VMI ✗
  function isVmiRep(name) {
    if (!name || typeof name !== 'string') return false;
    const n = name.toLowerCase().trim();
    if (n === 'unassigned' || n === '—' || n === '-' || n === '') return false;
    const words = n.split(/\s+/);
    return words.some(w => VMI_REP_TOKENS.includes(w));
  }

  // ---------- URL/localStorage state ----------
  function useUrlState(key, defaultValue) {
    const [val, setVal] = useState(() => {
      try {
        const sp = new URLSearchParams(location.hash.slice(1));
        const raw = sp.get(key);
        if (raw != null) return JSON.parse(decodeURIComponent(raw));
        const ls = localStorage.getItem('bcl_' + key);
        if (ls != null) return JSON.parse(ls);
      } catch (e) {}
      return defaultValue;
    });
    useEffect(() => {
      try {
        const sp = new URLSearchParams(location.hash.slice(1));
        sp.set(key, encodeURIComponent(JSON.stringify(val)));
        history.replaceState(null, '', '#' + sp.toString());
        localStorage.setItem('bcl_' + key, JSON.stringify(val));
      } catch (e) {}
    }, [key, val]);
    return [val, setVal];
  }

  // ---------- Polling ----------
  function usePolling(fn, ms) {
    const ref = useRef(fn);
    useEffect(() => { ref.current = fn; }, [fn]);
    useEffect(() => {
      let alive = true;
      const tick = async () => { if (!alive) return; try { await ref.current(); } catch (e) {} };
      tick();
      const id = setInterval(tick, ms);
      return () => { alive = false; clearInterval(id); };
    }, [ms]);
  }

  // ---------- Audio Manager ----------
  const Audio = (() => {
    let ctx = null;
    function ensure() {
      if (typeof window === 'undefined') return null;
      if (!ctx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        try { ctx = new Ctor(); } catch (e) { return null; }
      }
      return ctx;
    }
    function muted() {
      try { return JSON.parse(localStorage.getItem('bcl_muted') || 'true'); } catch (e) { return true; }
    }
    function setMuted(v) { localStorage.setItem('bcl_muted', JSON.stringify(!!v)); }
    function blip({ freq = 720, dur = 0.12, type = 'sine', vol = 0.06, slide = 0 }) {
      if (muted()) return;
      const c = ensure(); if (!c) return;
      const t0 = c.currentTime;
      const o = c.createOscillator(); o.type = type;
      const g = c.createGain();
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(60, freq + slide), t0 + dur);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
    function chord(notes, opts = {}) {
      notes.forEach((f, i) => setTimeout(() => blip({ ...opts, freq: f }), i * 60));
    }
    return {
      muted, setMuted,
      newLeader:   () => chord([784, 988, 1175], { dur: 0.18, vol: 0.05 }),
      goalHit:     () => chord([523, 659, 784, 1047], { dur: 0.22, vol: 0.06 }),
      badgeEarned: () => chord([1175, 1568], { dur: 0.15, vol: 0.05 }),
      teamHit:     () => chord([523, 659, 784, 1047, 1318], { dur: 0.24, vol: 0.07 }),
      rankUp:      () => blip({ freq: 1320, dur: 0.10, vol: 0.04, slide: 220 }),
      rankDown:    () => blip({ freq: 440, dur: 0.10, vol: 0.03, slide: -120 }),
      tick:        () => blip({ freq: 1800, dur: 0.04, vol: 0.02 }),
    };
  })();

  // ---------- CSV download ----------
  function downloadCsv(rows, filename = 'export.csv') {
    if (!rows || !rows.length) return;
    const cols = Object.keys(rows[0]);
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // ---------- Avatar initials + stable color ----------
  function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase();
  }
  function avatarColor(name) {
    const palette = ['#10b981','#0ea5e9','#f59e0b','#a78bfa','#ef4444','#06b6d4','#84cc16','#f43f5e','#8b5cf6','#22c55e'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }

  // ---------- Emitter ----------
  function createEmitter() {
    const subs = new Set();
    return {
      on(fn) { subs.add(fn); return () => subs.delete(fn); },
      emit(...args) { subs.forEach(fn => { try { fn(...args); } catch (e) {} }); },
    };
  }

  // ---------- Expose ----------
  window.BclCore = {
    MIN_CLOSURE_DATE, WEEKLY_REP_GOAL, WEEKLY_VMI_GOAL, WEEKLY_TEAM_GOAL, VMI_REP_TOKENS, POLL_MS,
    fmt$, fmt$d, fmtN, fmtNum, fmtPct, fmtK,
    toDate, ymd, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
    withinRange, weekLabel, relTime, daysRemainingInWeek, weekPaceFraction,
    isVmiRep, initials, avatarColor,
    useUrlState, usePolling,
    Audio, downloadCsv, createEmitter,
  };
})();
