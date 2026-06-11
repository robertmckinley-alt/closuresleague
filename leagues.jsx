/* ============================================================================
 * leagues.jsx — REPS LEAGUE / VMI LEAGUE / TEAM LEAGUE views.
 * ============================================================================ */
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  const C = window.BclCore;
  const U = window.BclUI;
  const E = window.BclEngines;

  // --------------------------- Shared: Player row in leaderboard ---------------------------
  function LeaderboardRow({ p, idx, division, onPick, prevFirst, flashFirstName }) {
    const goal = division === 'vmi' ? C.WEEKLY_VMI_GOAL : C.WEEKLY_REP_GOAL;
    const pct = goal > 0 ? Math.min(1.5, p.revenue / goal) * 100 : 0;
    const isFirst = p.rank === 1;
    const rowCls = isFirst ? 'throne cursor-pointer' : 'cursor-pointer';
    const flash = flashFirstName && p.name === flashFirstName ? 'flash-leader' : '';
    return (
      <tr className={`${rowCls} ${flash}`.trim()} onClick={() => onPick(p)}>
        <td className="text-right tabular-nums font-mono text-slate-500 w-10">
          {isFirst ? <span className="crown-glow inline-block">👑</span> : p.rank}
        </td>
        <td>
          <div className="flex items-center gap-2">
            <U.Avatar name={p.name} size={28} />
            <div className="leading-tight min-w-0">
              <div className="font-display text-[13px] font-semibold tracking-tight truncate" title={p.name}>{p.name}</div>
              <div className="text-[9px] font-mono text-slate-500 small-caps">
                {p.storeCount} stores · {p.closures} closures · avg {C.fmt$(p.averageDeal)}
              </div>
            </div>
          </div>
        </td>
        <td className="text-right tabular-nums font-mono font-semibold text-emerald-700">{C.fmt$(p.revenue)}</td>
        <td className="text-right tabular-nums font-mono text-slate-700 hide-sm">{C.fmtN(p.closures)}</td>
        <td className="text-right tabular-nums font-mono text-slate-700 hide-sm">{C.fmt$(p.averageDeal)}</td>
        <td className="hide-sm">
          <U.StreakChip days={p.streak} best={p.bestStreak} />
        </td>
        <td className="w-40">
          <U.GoalBar pct={pct} paceFrac={C.weekPaceFraction(new Date())} showLabel />
        </td>
        <td>
          {p.paceTag && <U.Tag tag={p.paceTag} label={p.paceTag} />}
        </td>
        <td className="hide-sm">
          <U.RankDelta change={p.rankChange} isNew={p.isNew} />
        </td>
        <td className="text-center text-slate-400">›</td>
      </tr>
    );
  }

  function LeagueTable({ players, division, onPickPlayer, flashFirstName }) {
    const [sort, setSort] = useState({ key: 'revenue', dir: 'desc' });
    const sorted = useMemo(() => {
      const arr = players.slice();
      arr.sort((a, b) => {
        const aV = a[sort.key]; const bV = b[sort.key];
        if (aV == null) return 1; if (bV == null) return -1;
        return (sort.dir === 'asc' ? 1 : -1) * (aV > bV ? 1 : aV < bV ? -1 : 0);
      });
      return arr;
    }, [players, sort]);
    if (!players.length) {
      return <U.Empty title="No closures this period" sub="advance the period · widen the date range · or wait for data" />;
    }
    return (
      <div className="bcard overflow-hidden">
        <div style={{ maxHeight: 'calc(100vh - 320px)', overflow: 'auto' }}>
          <table className="dt">
            <thead>
              <tr>
                <U.Th k="rank" sort={sort} setSort={setSort} label="#" align="right" w={48} />
                <U.Th k="name" sort={sort} setSort={setSort} label="Player" />
                <U.Th k="revenue" sort={sort} setSort={setSort} label="Revenue" align="right" />
                <U.Th k="closures" sort={sort} setSort={setSort} label="Closures" align="right" />
                <U.Th k="averageDeal" sort={sort} setSort={setSort} label="Avg Deal" align="right" />
                <U.Th k="streak" sort={sort} setSort={setSort} label="Streak" />
                <U.Th k="goalPct" sort={sort} setSort={setSort} label="Goal" />
                <U.Th k="paceTag" sort={sort} setSort={setSort} label="Pace" />
                <U.Th k="rankChange" sort={sort} setSort={setSort} label="Δ Rank" />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => (
                <LeaderboardRow
                  key={p.name}
                  p={p}
                  idx={i}
                  division={division}
                  onPick={onPickPlayer}
                  flashFirstName={flashFirstName}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // --------------------------- Reps League ---------------------------
  function RepsLeague({ state, onPickPlayer, flashFirstName }) {
    const players = state.reps;
    const top = players[0];
    const totalRev = players.reduce((s, p) => s + p.revenue, 0);
    const goalSum = players.length * C.WEEKLY_REP_GOAL;
    const hitGoal = players.filter(p => p.revenue >= C.WEEKLY_REP_GOAL).length;
    return (
      <div className="p-4 space-y-4">
        <U.H2
          title="Reps League"
          accent="individual sales reps"
          sub={`${players.length} players · ${state.periodLabel} · weekly goal ${C.fmt$(C.WEEKLY_REP_GOAL)}`}
        />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <U.Kpi label="Players" value={C.fmtN(players.length)} sub="active in period" />
          <U.Kpi label="Total Revenue" value={C.fmt$(totalRev)} tone="pos" />
          <U.Kpi label="Hit Weekly Goal" value={`${hitGoal}/${players.length}`} sub={`goal ${C.fmt$(C.WEEKLY_REP_GOAL)}`} />
          <U.Kpi label="Top Rep" value={top ? top.name.split(' ')[0] : '—'} sub={top ? C.fmt$(top.revenue) : ''} tone="pos" accent />
          <U.Kpi label="Field Coverage" value={C.fmtPct(goalSum > 0 ? totalRev / goalSum : 0, 0)} sub="vs collective goal" />
        </div>
        <LeagueTable players={players} division="reps" onPickPlayer={onPickPlayer} flashFirstName={flashFirstName} />
      </div>
    );
  }

  // --------------------------- VMI League ---------------------------
  function VmiLeague({ state, onPickPlayer, flashFirstName }) {
    const players = state.vmi;
    const top = players[0];
    const totalRev = players.reduce((s, p) => s + p.revenue, 0);
    const hitGoal = players.filter(p => p.revenue >= C.WEEKLY_VMI_GOAL).length;
    return (
      <div className="p-4 space-y-4">
        <U.H2
          title="VMI League"
          accent="vendor-managed inventory reps"
          sub={`${players.length} players · ${state.periodLabel} · weekly goal ${C.fmt$(C.WEEKLY_VMI_GOAL)}`}
          right={
            <span className="text-[10px] font-mono text-slate-500 small-caps">
              vmi tokens: {C.VMI_REP_TOKENS.join(' · ')}
            </span>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <U.Kpi label="Players" value={C.fmtN(players.length)} sub="active in period" />
          <U.Kpi label="VMI Revenue" value={C.fmt$(totalRev)} tone="pos" />
          <U.Kpi label="Hit Weekly Goal" value={`${hitGoal}/${players.length}`} sub={`goal ${C.fmt$(C.WEEKLY_VMI_GOAL)}`} />
          <U.Kpi label="VMI Leader" value={top ? top.name.split(' ')[0] : '—'} sub={top ? C.fmt$(top.revenue) : ''} tone="pos" accent />
          <U.Kpi label="Avg Deal" value={top ? C.fmt$(players.reduce((s,p)=>s+p.averageDeal,0)/Math.max(1,players.length)) : '—'} />
        </div>
        <LeagueTable players={players} division="vmi" onPickPlayer={onPickPlayer} flashFirstName={flashFirstName} />
      </div>
    );
  }

  // --------------------------- Team League ---------------------------
  function TeamLeague({ state, weekHistory }) {
    const t = state.team;
    const pct = t.pct * 100;
    const projPct = t.target > 0 ? (t.projection / t.target) * 100 : 0;
    const paceTag = pct >= t.paceFrac * 100 * 0.98 ? 'AHEAD'
                  : pct >= t.paceFrac * 100 * 0.85 ? 'PACE'
                  : 'BEHIND';
    const projTone = t.projection >= t.target ? 'pos' : t.projection >= t.target * 0.85 ? 'warn' : 'neg';
    // Weekly history mini-chart
    const histVals = weekHistory.map(w => w.total);
    return (
      <div className="p-4 space-y-4">
        <U.H2
          title="Team League"
          accent="entire organization · weekly thermometer"
          sub={`weekly goal ${C.fmt$(C.WEEKLY_TEAM_GOAL)} · ${C.weekLabel(new Date())}`}
          right={<U.Tag tag={paceTag} label={paceTag} size="lg" />}
        />

        {/* Thermometer */}
        <div className="bcard p-5">
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Current Team Progress</div>
              <div className="font-mono tabular-nums text-[34px] font-semibold text-slate-900 leading-none mt-1 num-up" key={Math.round(t.total)}>
                {C.fmt$(t.total)}
                <span className="text-slate-400 text-[18px]"> / {C.fmt$(t.target)}</span>
              </div>
              <div className="text-[10px] font-mono text-slate-500 small-caps mt-1">
                {pct.toFixed(1)}% of goal · pace line at {(t.paceFrac * 100).toFixed(0)}% · {t.daysLeft} day{t.daysLeft === 1 ? '' : 's'} remaining
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Projected Finish</div>
              <div className={`font-mono tabular-nums text-[22px] font-semibold ${projTone === 'pos' ? 'text-emerald-700' : projTone === 'warn' ? 'text-amber-700' : 'text-rose-700'}`}>
                {C.fmt$(t.projection)}
              </div>
              <div className="text-[10px] font-mono text-slate-500 small-caps">{projPct.toFixed(0)}% of goal</div>
            </div>
          </div>
          <U.GoalBar pct={Math.min(100, pct)} paceFrac={t.paceFrac} height={18} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <U.Kpi label="Remaining" value={C.fmt$(t.remaining)} sub="to hit goal" />
            <U.Kpi label="Daily Need" value={C.fmt$(t.dailyNeed)} sub={`avg over ${t.daysLeft || 0} day${t.daysLeft===1?'':'s'}`} />
            <U.Kpi label="Pace Now" value={`${(t.paceFrac*100).toFixed(0)}%`} sub="of the week elapsed" />
            <U.Kpi label="Tracking" value={paceTag} tone={paceTag === 'AHEAD' ? 'pos' : paceTag === 'BEHIND' ? 'neg' : 'warn'} accent />
          </div>
        </div>

        {/* Weekly History */}
        <div className="bcard">
          <div className="bcard-header flex items-center justify-between">
            <div>
              <div className="font-display text-[14px] font-semibold tracking-tight">Weekly Performance</div>
              <div className="text-[10px] font-mono text-slate-500 small-caps">last 10 weeks · goal {C.fmt$(C.WEEKLY_TEAM_GOAL)}</div>
            </div>
            <U.Sparkline values={histVals.length ? histVals : [0]} w={120} h={24} color="#047857" />
          </div>
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            <table className="dt">
              <thead>
                <tr>
                  <th>Week</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">vs Goal</th>
                  <th className="text-right">Closures</th>
                  <th className="text-right">Top Rep</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {weekHistory
                  // Only show weeks where data could exist (ledger starts 6/1).
                  // Pre-ledger weeks would always read $0 / BEHIND and clutter
                  // the table with noise.
                  .filter(w => w.weekEnd >= C.MIN_CLOSURE_DATE)
                  .map(w => {
                    const todayS = C.ymd(new Date());
                    const isCurrent = w.weekStart <= todayS && todayS <= w.weekEnd;
                    const isFuture  = w.weekStart > todayS;
                    const wpct = w.total / C.WEEKLY_TEAM_GOAL;
                    let status, tone;
                    if (isFuture) {
                      status = '—'; tone = 'MONITOR';
                    } else if (isCurrent) {
                      // In-flight — use pace-adjusted thresholds so this row
                      // agrees with the thermometer at the top of the page.
                      const paceFrac = C.weekPaceFraction(new Date());
                      if (wpct >= paceFrac * 0.98)      { status = 'AHEAD';  tone = 'AHEAD'; }
                      else if (wpct >= paceFrac * 0.85) { status = 'PACE';   tone = 'PACE'; }
                      else                              { status = 'BEHIND'; tone = 'BEHIND'; }
                    } else {
                      // Completed week — final tally vs goal. Use HIT / CLOSE
                      // / MISSED so it's clear this is a finished result, not
                      // an in-progress pace.
                      if (wpct >= 1)         { status = 'HIT';    tone = 'AHEAD'; }
                      else if (wpct >= 0.85) { status = 'CLOSE';  tone = 'PACE'; }
                      else                   { status = 'MISSED'; tone = 'BEHIND'; }
                    }
                    return (
                      <tr key={w.weekStart}>
                        <td className="font-mono tabular-nums text-slate-700">{C.weekLabel(w.weekStart)}</td>
                        <td className="text-right font-mono tabular-nums font-semibold text-emerald-700">{C.fmt$(w.total)}</td>
                        <td className={`text-right font-mono tabular-nums ${wpct >= 1 ? 'text-emerald-700' : wpct >= 0.85 ? 'text-amber-700' : 'text-rose-700'}`}>{(wpct * 100).toFixed(0)}%</td>
                        <td className="text-right font-mono tabular-nums text-slate-600">{C.fmtN(w.count)}</td>
                        <td className="text-right text-slate-700 truncate max-w-[180px]" title={w.topRep}>{w.topRep || '—'}</td>
                        <td><U.Tag tag={tone} label={status} /></td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Helper to compute the last N weeks of team history from full closures list
  function computeWeekHistory(allClosures, asOf, n = 10) {
    const now = C.toDate(asOf) || new Date();
    const cur = C.startOfWeek(now);
    const out = [];
    for (let i = 0; i < n; i++) {
      const ws = C.addDays(cur, -7 * i);
      const we = C.addDays(ws, 6);
      const wsS = C.ymd(ws), weS = C.ymd(we);
      const inWeek = allClosures.filter(c => c.ts >= wsS && c.ts <= weS);
      const total = inWeek.reduce((s, c) => s + c.rev, 0);
      const count = inWeek.length;
      // Top rep this week
      const m = new Map();
      inWeek.forEach(c => { m.set(c.sr, (m.get(c.sr) || 0) + c.rev); });
      let topRep = '', topVal = 0;
      m.forEach((v, k) => { if (v > topVal) { topVal = v; topRep = k; } });
      out.push({ weekStart: wsS, weekEnd: weS, total, count, topRep });
    }
    return out.reverse(); // chronological
  }

  window.BclLeagues = { RepsLeague, VmiLeague, TeamLeague, computeWeekHistory };
})();
