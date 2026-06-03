/* ============================================================================
 * ui.jsx — Bamboo Closures League · Shared UI primitives
 * Strictly matches Bamboo SKU Intelligence aesthetic.
 * ============================================================================ */
(function () {
  const { useState, useEffect, useRef, useMemo, useCallback } = React;
  const C = window.BclCore;

  // ---------- Tag / pill ----------
  const TAG_STYLES = {
    ONFIRE:     { bg: 'linear-gradient(135deg,#fb923c,#dc2626)', fg: '#fff', bd: '#dc2626', dot: '#fff7ed', shadow: true },
    LEADER:     { bg: 'linear-gradient(135deg,#fbbf24,#b45309)', fg: '#fff', bd: '#b45309', dot: '#fef3c7', shadow: true },
    AHEAD:      { bg: 'rgba(16,185,129,.10)', fg: '#047857', bd: '#a7f3d0', dot: '#10b981' },
    PACE:       { bg: 'rgba(37,99,235,.10)', fg: '#1d4ed8', bd: '#bfdbfe', dot: '#2563eb' },
    BEHIND:     { bg: 'rgba(220,38,38,.10)', fg: '#b91c1c', bd: '#fecaca', dot: '#dc2626' },
    NEW:        { bg: 'rgba(167,139,250,.12)', fg: '#6d28d9', bd: '#ddd6fe', dot: '#a78bfa' },
    MONITOR:    { bg: 'rgba(11,18,32,.04)', fg: '#374151', bd: '#e5e7eb', dot: '#9ca3af' },
    UP:         { bg: 'rgba(16,185,129,.10)', fg: '#047857', bd: '#a7f3d0', dot: '#10b981' },
    DOWN:       { bg: 'rgba(220,38,38,.10)', fg: '#b91c1c', bd: '#fecaca', dot: '#dc2626' },
  };
  function Tag({ tag, label, dot = true, size = 'sm', style = {} }) {
    const s = TAG_STYLES[tag] || TAG_STYLES.MONITOR;
    const sty = {
      background: s.bg, color: s.fg, borderColor: s.bd,
      boxShadow: s.shadow
        ? '0 1px 2px rgba(4,120,87,.25), inset 0 1px 0 rgba(255,255,255,.18)'
        : 'inset 0 1px 0 rgba(255,255,255,.45)',
      ...style,
    };
    return (
      <span className={`pill ${size === 'lg' ? 'pill-lg' : ''}`} style={sty}>
        {dot && <span className="dot" style={{ background: s.dot }}></span>}
        {label || tag}
      </span>
    );
  }

  // ---------- Sortable Th ----------
  function Th({ k, sort, setSort, label, align = 'left', hint, w }) {
    const active = sort && sort.key === k;
    return (
      <th
        className={`sortable ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
        title={hint}
        style={w ? { width: w } : undefined}
        onClick={() => setSort(s => ({ key: k, dir: s && s.key === k && s.dir === 'desc' ? 'asc' : 'desc' }))}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={`text-[8px] ${active ? 'text-slate-700' : 'text-slate-300'}`}>
            {active ? (sort.dir === 'asc' ? '▲' : '▼') : '▴▾'}
          </span>
        </span>
      </th>
    );
  }

  // ---------- ScoreBar / GoalBar ----------
  function GoalBar({ pct, paceFrac = null, height = 8, showLabel = false, value, label }) {
    const p = Math.max(0, Math.min(100, pct));
    // Color by behind/on/ahead pace
    let cls = 'score-grad-mid';
    if (paceFrac != null) {
      const needed = paceFrac * 100;
      if (p >= needed * 0.98) cls = 'score-grad-high';
      else if (p >= needed * 0.85) cls = 'score-grad-mid';
      else cls = 'score-grad-low';
    } else {
      if (p >= 75) cls = 'score-grad-high';
      else if (p >= 40) cls = 'score-grad-mid';
      else cls = 'score-grad-low';
    }
    return (
      <div className="flex items-center gap-2">
        <div className={`goalbar ${height >= 14 ? 'tall' : ''} flex-1`} style={height ? { height } : undefined}>
          <div className={cls} style={{ width: Math.max(2, p) + '%' }}></div>
          {paceFrac != null && (
            <span
              className="absolute top-0 bottom-0 w-px bg-slate-900/40"
              style={{ left: (Math.max(0, Math.min(1, paceFrac)) * 100) + '%' }}
              title="Pace line"
            ></span>
          )}
        </div>
        {showLabel && (
          <span className="font-mono tabular-nums text-slate-700 w-12 text-right text-[11px]">{p.toFixed(0)}%</span>
        )}
      </div>
    );
  }

  // ---------- Sparkline (SVG, hand-rolled) ----------
  function Sparkline({ values, w = 64, h = 18, color = '#059669', fill = true }) {
    if (!values || values.length === 0) return null;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const stepX = w / Math.max(1, values.length - 1);
    const pts = values.map((v, i) => [i * stepX, h - ((v - min) / range) * (h - 2) - 1]);
    const path = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
    const area = `${path} L${pts[pts.length - 1][0]},${h} L0,${h} Z`;
    return (
      <svg className="spark" width={w} height={h} style={{ display: 'block' }}>
        {fill && <path d={area} fill={color} opacity="0.12" />}
        <path d={path} fill="none" stroke={color} strokeWidth="1.4" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="1.6" fill={color} />
      </svg>
    );
  }

  // ---------- Avatar ----------
  function Avatar({ name, size = 32 }) {
    const bg = C.avatarColor(name);
    const init = C.initials(name);
    return (
      <div
        className="rounded-md text-white font-display font-semibold flex items-center justify-center flex-shrink-0"
        style={{
          width: size, height: size, background: bg, fontSize: Math.round(size * 0.42),
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,.25), 0 1px 2px rgba(15,23,42,.10)',
        }}
        title={name}
      >
        {init}
      </div>
    );
  }

  // ---------- Rank delta indicator ----------
  function RankDelta({ change, isNew }) {
    if (isNew) return <span className="pill" style={{ background: 'rgba(167,139,250,.12)', color: '#6d28d9', borderColor: '#ddd6fe' }}>NEW</span>;
    if (change == null || change === 0) {
      return <span className="font-mono tabular-nums text-[10px] text-slate-400">—</span>;
    }
    if (change > 0) {
      return <span className="font-mono tabular-nums text-[10px] text-emerald-700 font-semibold">▲ +{change}</span>;
    }
    return <span className="font-mono tabular-nums text-[10px] text-rose-700 font-semibold">▼ {change}</span>;
  }

  // ---------- KPI Card (executive strip) ----------
  function Kpi({ label, value, sub, tone = 'default', icon, accent = false }) {
    const toneClass = tone === 'pos' ? 'text-emerald-700' : tone === 'neg' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-900';
    return (
      <div className={`bcard px-4 py-3 ${accent ? 'ring-1 ring-emerald-300' : ''}`}>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
          {icon && <span>{icon}</span>}{label}
        </div>
        <div className={`font-mono tabular-nums text-[20px] font-semibold mt-0.5 ${toneClass}`}>{value}</div>
        {sub && <div className="text-[10px] font-mono text-slate-500 small-caps mt-0.5">{sub}</div>}
      </div>
    );
  }

  // ---------- Drawer ----------
  function Drawer({ onClose, width = 820, children }) {
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
      return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    }, [onClose]);
    return (
      <div
        className="drawer-overlay fixed inset-0 z-40 flex justify-end backdrop-anim"
        style={{
          background: 'rgba(15,23,42,0.32)',
          backdropFilter: 'blur(8px) saturate(120%)',
          WebkitBackdropFilter: 'blur(8px) saturate(120%)',
        }}
        onClick={onClose}
      >
        <div
          className="drawer-anim bg-white h-full overflow-auto flex flex-col"
          style={{ width: width + 'px', maxWidth: '95vw', boxShadow: '-12px 0 48px rgba(15,23,42,.20)' }}
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    );
  }

  // ---------- AppBar ----------
  function AppBar({ tabs, tab, setTab, mode, setMode, muted, setMuted, lastFetch, isLive, repsCount, vmiCount, onSearch }) {
    return (
      <header className="appbar flex items-center px-4 py-2.5 bg-white border-b border-slate-200 gap-3 no-print">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-md emerald-grad text-white flex items-center justify-center text-[13px] font-bold font-display"
            style={{ boxShadow: '0 1px 2px rgba(5,150,105,.25), inset 0 1px 0 rgba(255,255,255,.2)' }}
          >B</div>
          <div className="leading-tight">
            <h1 className="font-display text-[18px] font-semibold text-slate-900 tracking-tight">
              Bamboo <span className="italic text-emerald-700">Closures</span> League
            </h1>
            <div className="text-[9px] font-mono text-slate-400 small-caps -mt-0.5 flex items-center gap-1.5">
              <span className="live-dot"></span>
              <span>{isLive ? 'live' : 'idle'} · polls 15s · build {window.__BCL_BUILD}</span>
            </div>
          </div>
        </div>
        <div className="h-6 w-px bg-slate-200 mx-2 hide-sm"></div>
        <nav className="flex gap-1 flex-wrap hide-sm">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition ${tab === t.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
            >{t.label}</button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onSearch} className="btn btn-ghost" title="Global search ( / )">
            <span>⌕</span> Search
          </button>
          <button
            onClick={() => setMuted(!muted)}
            className={`btn ${muted ? 'btn-ghost' : 'btn-soft'}`}
            title={muted ? 'Sound OFF — click to enable' : 'Sound ON — click to mute'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          {lastFetch && (
            <span className="text-[10px] text-slate-400 font-mono hide-sm">
              upd {C.relTime(lastFetch)}
            </span>
          )}
        </div>
      </header>
    );
  }

  // ---------- Empty / Skeleton ----------
  function Empty({ title, sub, icon = '∅' }) {
    return (
      <div className="bcard p-8 text-center">
        <div className="w-12 h-12 rounded-full ink-grad text-white inline-flex items-center justify-center text-[18px] mb-3">{icon}</div>
        <div className="font-display text-[16px] font-semibold tracking-tight">{title}</div>
        {sub && <div className="text-[11px] font-mono text-slate-500 small-caps mt-1">{sub}</div>}
      </div>
    );
  }
  function Skeleton({ h = 14, w = '100%' }) {
    return <div className="shimmer" style={{ height: h, width: w }} />;
  }

  // ---------- Period picker ----------
  function PeriodPicker({ period, setPeriod, customRange, setCustomRange }) {
    const OPTS = [
      ['week', 'This Week'], ['lastweek', 'Last Week'],
      ['month', 'This Month'], ['quarter', 'Quarter'],
      ['all', 'All-Time'], ['custom', 'Custom'],
    ];
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-slate-100 rounded-md p-0.5 text-[10px] font-semibold">
          {OPTS.map(([k, l]) => (
            <button
              key={k} onClick={() => setPeriod(k)}
              className={`px-2 py-0.5 rounded ${period === k ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >{l}</button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="flex items-center gap-1.5">
            <input
              type="date" min={C.MIN_CLOSURE_DATE}
              value={customRange.from || ''}
              onChange={e => setCustomRange({ ...customRange, from: e.target.value })}
              className="text-[11px]"
            />
            <span className="text-[10px] text-slate-400">→</span>
            <input
              type="date" min={C.MIN_CLOSURE_DATE}
              value={customRange.to || ''}
              onChange={e => setCustomRange({ ...customRange, to: e.target.value })}
              className="text-[11px]"
            />
          </div>
        )}
      </div>
    );
  }

  // ---------- Section heading ----------
  function H2({ title, accent, sub, right }) {
    return (
      <div className="flex items-end justify-between gap-3 mb-2">
        <div>
          <h2 className="font-display text-[18px] font-semibold tracking-tight">
            {title}
            {accent && <span className="italic text-emerald-700"> — {accent}</span>}
          </h2>
          {sub && <div className="text-[10px] font-mono text-slate-500 small-caps">{sub}</div>}
        </div>
        {right}
      </div>
    );
  }

  // ---------- Streak chip ----------
  function StreakChip({ days, best }) {
    if (!days || days <= 0) return <span className="text-[10px] font-mono text-slate-400">—</span>;
    const hot = days >= 5;
    return (
      <span
        className="pill"
        style={{
          background: hot ? 'linear-gradient(135deg,#fb923c,#dc2626)' : 'rgba(234,179,8,.15)',
          color: hot ? '#fff' : '#92400e',
          borderColor: hot ? '#dc2626' : '#fde68a',
          boxShadow: hot ? '0 1px 2px rgba(220,38,38,.30), inset 0 1px 0 rgba(255,255,255,.18)' : undefined,
        }}
        title={best ? `Best streak: ${best} days` : undefined}
      >
        <span className={hot ? 'flicker' : ''}>🔥</span>
        {days}d
      </span>
    );
  }

  // ---------- Expose ----------
  window.BclUI = {
    TAG_STYLES, Tag, Th, GoalBar, Sparkline, Avatar, RankDelta, Kpi, Drawer, AppBar, Empty, Skeleton,
    PeriodPicker, H2, StreakChip,
  };
})();
