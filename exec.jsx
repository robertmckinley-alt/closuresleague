/* ============================================================================
 * exec.jsx — Executive Mode dashboard + Live Activity Feed (right rail).
 * ============================================================================ */
(function () {
  const { useState, useEffect, useMemo } = React;
  const C = window.BclCore;
  const U = window.BclUI;
  const E = window.BclEngines;

  // --------------------------- Executive Mode ---------------------------
  function ExecutiveMode({ state, weekHistory, onPickPlayer }) {
    const ex = state.exec;
    const t = state.team;
    return (
      <div className="p-4 space-y-4">
        <U.H2
          title="Executive Mode"
          accent="organization scoreboard"
          sub={`${state.periodLabel} · all divisions`}
          right={
            <div className="flex items-center gap-1.5">
              <span className="live-dot"></span>
              <span className="text-[10px] font-mono text-slate-500 small-caps">live · updates every 15s</span>
            </div>
          }
        />

        {/* Top KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <U.Kpi label="Total Closures" value={C.fmtN(ex.totalCount)} icon="📈" />
          <U.Kpi label="Total Revenue" value={C.fmt$(ex.totalRev)} tone="pos" accent icon="💵" />
          <U.Kpi label="Weekly Goal" value={`${(t.pct * 100).toFixed(0)}%`} sub={`${C.fmt$(t.total)} / ${C.fmt$(t.target)}`} />
          <U.Kpi label="Projected" value={C.fmt$(t.projection)} tone={t.projection >= t.target ? 'pos' : 'warn'} sub={`vs ${C.fmt$(t.target)}`} />
          <U.Kpi label="Top Rep" value={ex.topRep ? ex.topRep.name.split(' ')[0] : '—'} sub={ex.topRep ? C.fmt$(ex.topRep.revenue) : ''} />
          <U.Kpi label="Top VMI" value={ex.topVmi ? ex.topVmi.name.split(' ')[0] : '—'} sub={ex.topVmi ? C.fmt$(ex.topVmi.revenue) : ''} />
          <U.Kpi label="League MVP" value={ex.mvp ? ex.mvp.name.split(' ')[0] : '—'} sub={ex.mvp ? `${ex.mvp.division.toUpperCase()} · ${C.fmt$(ex.mvp.revenue)}` : ''} tone="pos" accent icon="🏆" />
        </div>

        {/* Highlights row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <HighlightCard
            label="Largest Closure"
            primary={C.fmt$(ex.largest.rev)}
            sub={ex.largest.who ? `${ex.largest.who} · ${ex.largest.sku}` : '—'}
            footer={ex.largest.client || ''}
            icon="🐋"
            tone="plat"
          />
          <HighlightCard
            label="Largest Account Won"
            primary={ex.largestAcct.name || '—'}
            sub={ex.largestAcct.rev ? C.fmt$(ex.largestAcct.rev) : ''}
            footer="aggregate this period"
            icon="🏢"
            tone="ink"
          />
          <HighlightCard
            label="Fastest Rising Rep"
            primary={ex.riser ? ex.riser.name : '—'}
            sub={ex.riser ? `▲ +${ex.riser.rankChange} rank` : ''}
            footer={ex.riser ? `${ex.riser.division.toUpperCase()} league · ${C.fmt$(ex.riser.revenue)}` : 'no movement yet'}
            icon="🚀"
            tone="emerald"
            onClick={ex.riser ? () => onPickPlayer(ex.riser) : null}
          />
        </div>

        {/* Goal thermometer + Mini standings */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          <div className="bcard p-5">
            <div className="flex items-end justify-between mb-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Team Thermometer <span className="text-slate-400 normal-case font-normal">— {state.periodLabel}</span></div>
                <div className="font-mono tabular-nums text-[28px] font-semibold text-slate-900 leading-none mt-1">
                  {C.fmt$(t.total)}<span className="text-slate-400 text-[16px]"> / {C.fmt$(t.target)}</span>
                </div>
                <div className="text-[10px] font-mono text-slate-500 small-caps mt-1">
                  daily need: {C.fmt$(t.dailyNeed)} · {t.daysLeft} day{t.daysLeft===1?'':'s'} left
                </div>
              </div>
              <U.Tag
                tag={t.pct >= t.paceFrac * 0.98 ? 'AHEAD' : t.pct >= t.paceFrac * 0.85 ? 'PACE' : 'BEHIND'}
                size="lg"
              />
            </div>
            <U.GoalBar pct={Math.min(100, t.pct * 100)} paceFrac={t.paceFrac} height={18} />
            <div className="mt-3">
              <U.Sparkline values={weekHistory.map(w => w.total)} w={Math.min(680, weekHistory.length * 36)} h={40} color="#047857" />
              <div className="flex justify-between mt-1 text-[9px] font-mono text-slate-400 small-caps">
                {weekHistory.map(w => <span key={w.weekStart}>{w.weekStart.slice(5)}</span>)}
              </div>
            </div>
          </div>

          <div className="bcard">
            <div className="bcard-header">
              <div className="font-display text-[14px] font-semibold tracking-tight">Top 5 · Reps</div>
              <div className="text-[10px] font-mono text-slate-500 small-caps">{state.periodLabel}</div>
            </div>
            <table className="dt">
              <thead><tr><th className="w-8 text-right">#</th><th>Rep</th><th className="text-right">Revenue</th><th>Goal</th></tr></thead>
              <tbody>
                {state.reps.slice(0, 5).map(p => (
                  <tr key={p.name} className={p.rank === 1 ? 'throne cursor-pointer' : 'cursor-pointer'} onClick={() => onPickPlayer(p)}>
                    <td className="text-right tabular-nums font-mono text-slate-500">{p.rank === 1 ? <span className="crown-glow">👑</span> : p.rank}</td>
                    <td className="truncate max-w-[180px]" title={p.name}>{p.name}</td>
                    <td className="text-right font-mono tabular-nums font-semibold text-emerald-700">{C.fmt$(p.revenue)}</td>
                    <td className="w-28"><U.GoalBar pct={Math.min(150, p.goalPct * 100)} /></td>
                  </tr>
                ))}
                {state.reps.length === 0 && <tr><td colSpan={4} className="text-center text-slate-400">no reps yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* VMI top */}
          <div className="bcard">
            <div className="bcard-header">
              <div className="font-display text-[14px] font-semibold tracking-tight">VMI · Standings</div>
              <div className="text-[10px] font-mono text-slate-500 small-caps">weekly goal {C.fmt$(C.WEEKLY_VMI_GOAL)}</div>
            </div>
            <table className="dt">
              <thead><tr><th className="w-8 text-right">#</th><th>Rep</th><th className="text-right">Revenue</th><th>Goal</th><th>Streak</th></tr></thead>
              <tbody>
                {state.vmi.map(p => (
                  <tr key={p.name} className={p.rank === 1 ? 'throne cursor-pointer' : 'cursor-pointer'} onClick={() => onPickPlayer(p)}>
                    <td className="text-right tabular-nums font-mono text-slate-500">{p.rank === 1 ? <span className="crown-glow">👑</span> : p.rank}</td>
                    <td>{p.name}</td>
                    <td className="text-right font-mono tabular-nums font-semibold text-emerald-700">{C.fmt$(p.revenue)}</td>
                    <td className="w-28"><U.GoalBar pct={Math.min(150, p.goalPct * 100)} /></td>
                    <td><U.StreakChip days={p.streak} best={p.bestStreak} /></td>
                  </tr>
                ))}
                {state.vmi.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400">no VMI activity yet</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Movers */}
          <div className="bcard">
            <div className="bcard-header">
              <div className="font-display text-[14px] font-semibold tracking-tight">Momentum · Movers</div>
              <div className="text-[10px] font-mono text-slate-500 small-caps">rank change vs previous snapshot</div>
            </div>
            <table className="dt">
              <thead><tr><th>Rep</th><th>League</th><th className="text-right">Rank</th><th className="text-right">Δ</th><th className="text-right">Revenue</th></tr></thead>
              <tbody>
                {[...state.reps, ...state.vmi]
                  .filter(p => p.rankChange != null && p.rankChange !== 0)
                  .sort((a, b) => Math.abs(b.rankChange) - Math.abs(a.rankChange))
                  .slice(0, 10)
                  .map(p => (
                    <tr key={p.division + '_' + p.name} className="cursor-pointer" onClick={() => onPickPlayer(p)}>
                      <td className="truncate max-w-[160px]">{p.name}</td>
                      <td className="text-slate-600">{p.division.toUpperCase()}</td>
                      <td className="text-right font-mono tabular-nums">{p.rank}</td>
                      <td className="text-right"><U.RankDelta change={p.rankChange} isNew={p.isNew} /></td>
                      <td className="text-right font-mono tabular-nums text-emerald-700">{C.fmt$(p.revenue)}</td>
                    </tr>
                  ))
                }
                {![...state.reps, ...state.vmi].some(p => p.rankChange) && (
                  <tr><td colSpan={5} className="text-center text-slate-400">no movement detected — first snapshot</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function HighlightCard({ label, primary, sub, footer, icon, tone, onClick }) {
    const grad = tone === 'gold' ? 'gold-grad' : tone === 'plat' ? 'plat-grad' : tone === 'emerald' ? 'emerald-grad' : 'ink-grad';
    return (
      <div className={`bcard p-4 ${onClick ? 'cursor-pointer hover:border-slate-300 transition' : ''}`} onClick={onClick || undefined}>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-lg ${grad} flex items-center justify-center text-white text-[18px]`}
               style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18)' }}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{label}</div>
            <div className="font-display text-[16px] font-semibold tracking-tight text-slate-900 mt-0.5 truncate">{primary}</div>
            {sub && <div className="text-[11px] font-mono text-slate-600 mt-0.5 truncate">{sub}</div>}
            {footer && <div className="text-[10px] font-mono text-slate-400 small-caps mt-1 truncate">{footer}</div>}
          </div>
        </div>
      </div>
    );
  }

  // --------------------------- Live Activity Feed (right rail) ---------------------------
  function ActivityFeed({ feed, team, vmiCount, repsCount, lastUpdate }) {
    const [auto, setAuto] = useState(true);
    return (
      <aside className="rail rail-stack w-72 border-l border-slate-200 bg-white flex-shrink-0 overflow-auto no-print" style={{ minHeight: 0 }}>
        <div className="bcard-header sticky top-0 z-10 bg-slate-50 flex items-center justify-between">
          <div>
            <div className="font-display text-[14px] font-semibold tracking-tight flex items-center gap-2">
              <span className="live-dot"></span>
              Activity Feed
            </div>
            <div className="text-[10px] font-mono text-slate-500 small-caps">bloomberg ticker · discord-style</div>
          </div>
          <button
            className={`btn ${auto ? 'btn-soft' : 'btn-ghost'}`}
            onClick={() => setAuto(!auto)}
            title="Pause / resume auto-scroll"
          >{auto ? '⏸' : '▶'}</button>
        </div>

        <div className="p-2 space-y-1">
          {/* Team progress chip */}
          <div className="feed-item feed-team">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-emerald-800">TEAM</span>
              <span className="font-mono tabular-nums text-[10px] text-slate-500">{(team.pct * 100).toFixed(0)}%</span>
            </div>
            <div className="font-mono tabular-nums text-[11px] text-slate-800 mt-0.5">
              {C.fmt$(team.total)} / {C.fmt$(team.target)}
            </div>
            <U.GoalBar pct={Math.min(100, team.pct * 100)} paceFrac={team.paceFrac} height={6} />
          </div>

          {feed.slice(0, 50).map(item => (
            <div key={item.id} className={`feed-item ${item.kind === 'fire' ? 'feed-fire' : ''}`}>
              <div className="flex items-baseline justify-between">
                <span className="font-mono tabular-nums text-[9px] text-slate-400">{item.ts}</span>
                {item.kind === 'fire' && <span className="text-[10px] text-rose-600 font-semibold">🔥 BIG</span>}
              </div>
              <div className="text-[11px] text-slate-800 mt-0.5">{item.message}</div>
            </div>
          ))}
          {!feed.length && (
            <div className="feed-item">
              <div className="text-[11px] text-slate-500">No closures in this period yet.</div>
            </div>
          )}
        </div>

        <div className="p-2 border-t border-slate-200 text-[10px] font-mono text-slate-400 small-caps">
          {repsCount} reps · {vmiCount} vmi · upd {lastUpdate ? C.relTime(lastUpdate) : '—'}
        </div>
      </aside>
    );
  }

  window.BclExec = { ExecutiveMode, ActivityFeed };
})();
