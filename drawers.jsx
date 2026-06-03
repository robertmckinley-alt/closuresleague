/* ============================================================================
 * drawers.jsx — Player Card drawer + Global Search.
 * ============================================================================ */
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  const C = window.BclCore;
  const U = window.BclUI;
  const E = window.BclEngines;

  // --------------------------- Player Card Drawer ---------------------------
  function PlayerCardDrawer({ player, division, allClosures, onClose }) {
    if (!player) return null;
    const now = new Date();
    const rollups = useMemo(
      () => E.aggregatePlayerRollups(allClosures, player.name, division, now),
      [player.name, division, allClosures]
    );
    const goal = division === 'vmi' ? C.WEEKLY_VMI_GOAL : C.WEEKLY_REP_GOAL;
    const weekPct = goal > 0 ? rollups.week / goal : 0;
    const paceFrac = C.weekPaceFraction(now);

    const personalClosures = useMemo(() => {
      const keyField = division === 'vmi' ? 'vr' : 'sr';
      return allClosures.filter(c => c[keyField] === player.name);
    }, [allClosures, player.name, division]);

    const badges = useMemo(
      () => E.evaluateBadges(player, [player], allClosures, division, now),
      [player, allClosures, division]
    );
    const earnedCount = badges.filter(b => b.earned).length;

    const recent = useMemo(() => personalClosures.slice(-30).reverse(), [personalClosures]);
    // 14-day sparkline
    const sparkVals = useMemo(() => {
      const map = new Map();
      personalClosures.forEach(c => map.set(c.ts, (map.get(c.ts) || 0) + c.rev));
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = C.addDays(now, -i);
        days.push(map.get(C.ymd(d)) || 0);
      }
      return days;
    }, [personalClosures]);

    return (
      <U.Drawer onClose={onClose} width={920}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-start gap-4 bg-slate-50">
          <U.Avatar name={player.name} size={56} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h2 className="font-display text-[22px] font-semibold tracking-tight">{player.name}</h2>
              <U.Tag tag={division === 'vmi' ? 'NEW' : 'AHEAD'} label={division.toUpperCase()} />
              {player.rank === 1 && <U.Tag tag="LEADER" label="#1 KING OF CLOSURES" size="lg" />}
            </div>
            <div className="text-[11px] font-mono text-slate-500 small-caps mt-0.5">
              rank {player.rank} · {player.storeCount} stores · {C.fmtN(player.closures)} closures · {earnedCount}/{badges.length} badges
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <U.RankDelta change={player.rankChange} isNew={player.isNew} />
              <U.StreakChip days={player.streak} best={player.bestStreak} />
              {player.paceTag && <U.Tag tag={player.paceTag} label={player.paceTag} />}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>× Close</button>
        </div>

        {/* Goal progress */}
        <div className="px-5 py-4 bg-white border-b border-slate-200">
          <div className="flex items-end justify-between mb-1">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Weekly Goal Progress</div>
              <div className="font-mono tabular-nums text-[22px] font-semibold text-slate-900 mt-0.5">
                {C.fmt$(rollups.week)} <span className="text-slate-400 text-[14px]">/ {C.fmt$(goal)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Projected Finish</div>
              <div className={`font-mono tabular-nums text-[16px] font-semibold ${paceFrac > 0 && (rollups.week / paceFrac) >= goal ? 'text-emerald-700' : 'text-amber-700'}`}>
                {C.fmt$(paceFrac > 0 ? rollups.week / paceFrac : 0)}
              </div>
            </div>
          </div>
          <U.GoalBar pct={Math.min(150, weekPct * 100)} paceFrac={paceFrac} height={14} />
        </div>

        {/* KPI strip */}
        <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-3 bg-white">
          <U.Kpi label="This Week" value={C.fmt$(rollups.week)} tone="pos" />
          <U.Kpi label="This Month" value={C.fmt$(rollups.month)} />
          <U.Kpi label="This Quarter" value={C.fmt$(rollups.quarter)} />
          <U.Kpi label="Lifetime" value={C.fmt$(rollups.lifetime)} sub={`${rollups.lifetimeCount} closures`} />
          <U.Kpi label="Avg Deal" value={C.fmt$(player.averageDeal)} />
          <U.Kpi label="Best Week" value={C.fmt$(rollups.best.revenue)} sub={rollups.best.label} />
          <U.Kpi label="Current Streak" value={`${player.streak}d`} sub={`best ${player.bestStreak}d`} />
          <U.Kpi label="Stores" value={C.fmtN(player.storeCount)} sub="touched this period" />
        </div>

        {/* Sparkline */}
        <div className="px-5 py-3 border-t border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">14-Day Revenue Trail</div>
            <span className="text-[10px] font-mono text-slate-500 small-caps">total {C.fmt$(sparkVals.reduce((s, v) => s + v, 0))}</span>
          </div>
          <U.Sparkline values={sparkVals} w={860} h={36} color="#047857" />
        </div>

        {/* Badges */}
        <div className="px-5 py-4 border-b border-slate-200 bg-white">
          <U.H2 title="Achievements" accent={`${earnedCount} of ${badges.length} unlocked`} />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2">
            {badges.map(b => (
              <div key={b.id} className={`bcard p-3 flex items-center gap-3 ${b.earned ? '' : 'opacity-70'}`}>
                <div
                  className={`badge-tile ${b.earned ? '' : 'locked'} ${b.tone === 'gold' ? 'gold-grad' : b.tone === 'fire' ? 'fire-grad' : b.tone === 'plat' ? 'plat-grad' : b.tone === 'emerald' ? 'emerald-grad' : 'ink-grad'}`}
                >
                  <span>{b.emoji}</span>
                </div>
                <div className="min-w-0">
                  <div className="font-display text-[13px] font-semibold tracking-tight">{b.title}</div>
                  <div className="text-[10px] font-mono text-slate-500 mt-0.5">{b.desc}</div>
                  {b.earned && <div className="text-[9px] font-mono text-emerald-700 small-caps mt-0.5">unlocked</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent closures */}
        <div className="px-5 py-4">
          <U.H2 title="Recent Closures" sub={`last ${Math.min(30, recent.length)} of ${C.fmtN(personalClosures.length)}`} />
          <div className="bcard overflow-hidden mt-2">
            <table className="dt">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c, i) => (
                  <tr key={i}>
                    <td className="font-mono tabular-nums text-[10px] text-slate-600">{c.ts}</td>
                    <td className="truncate max-w-[200px]" title={c.clientName}>{c.clientName}</td>
                    <td className="truncate max-w-[180px]" title={c.skuName}>{c.skuName}</td>
                    <td><U.Tag tag="MONITOR" label={c.category} /></td>
                    <td className="text-right font-mono tabular-nums font-semibold text-emerald-700">{C.fmt$(c.rev)}</td>
                    <td className="text-right font-mono tabular-nums text-slate-700">{C.fmtN(c.units)}</td>
                  </tr>
                ))}
                {!recent.length && (
                  <tr><td colSpan={6} className="text-center text-slate-400">no closures yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </U.Drawer>
    );
  }

  // --------------------------- Global Search ---------------------------
  function GlobalSearch({ closures, repsBoard, vmiBoard, onClose, onPickPlayer }) {
    const [q, setQ] = useState('');
    const inputRef = useRef(null);
    useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);

    const results = useMemo(() => {
      if (!q.trim()) return { players: [], accounts: [], skus: [], recent: closures.slice(-12).reverse() };
      const Q = q.toLowerCase();
      const allPlayers = [...repsBoard, ...vmiBoard];
      const players = allPlayers.filter(p => p.name.toLowerCase().includes(Q)).slice(0, 12);
      const accSet = new Map();
      const skuSet = new Map();
      const recent = [];
      closures.forEach(c => {
        if (c.clientName.toLowerCase().includes(Q)) {
          const cur = accSet.get(c.clientName) || { name: c.clientName, count: 0, rev: 0, ts: c.ts };
          cur.count += 1; cur.rev += c.rev; if (c.ts > cur.ts) cur.ts = c.ts;
          accSet.set(c.clientName, cur);
        }
        if (c.skuName.toLowerCase().includes(Q)) {
          const cur = skuSet.get(c.skuName) || { name: c.skuName, count: 0, rev: 0, category: c.category };
          cur.count += 1; cur.rev += c.rev;
          skuSet.set(c.skuName, cur);
        }
        if (c.clientName.toLowerCase().includes(Q) || c.skuName.toLowerCase().includes(Q) || c.sr.toLowerCase().includes(Q) || c.vr.toLowerCase().includes(Q)) {
          recent.push(c);
        }
      });
      const accounts = Array.from(accSet.values()).sort((a, b) => b.rev - a.rev).slice(0, 10);
      const skus = Array.from(skuSet.values()).sort((a, b) => b.rev - a.rev).slice(0, 10);
      return { players, accounts, skus, recent: recent.slice(-12).reverse() };
    }, [q, closures, repsBoard, vmiBoard]);

    return (
      <U.Drawer onClose={onClose} width={760}>
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
          <span className="text-[16px]">⌕</span>
          <input
            ref={inputRef}
            type="search"
            placeholder="Search reps, accounts, SKUs, territories…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="flex-1"
            style={{ fontSize: 14 }}
          />
          <button className="btn btn-ghost" onClick={onClose}>esc</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Players */}
          {results.players.length > 0 && (
            <Section title="Players" count={results.players.length}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {results.players.map(p => (
                  <button
                    key={p.division + '_' + p.name}
                    onClick={() => { onPickPlayer(p); onClose(); }}
                    className="bcard p-2 flex items-center gap-2 text-left hover:border-emerald-400 transition"
                  >
                    <U.Avatar name={p.name} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="font-display text-[13px] font-semibold tracking-tight truncate">{p.name}</div>
                      <div className="text-[10px] font-mono text-slate-500">{p.division.toUpperCase()} · rank {p.rank} · {C.fmt$(p.revenue)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* Accounts */}
          {results.accounts.length > 0 && (
            <Section title="Accounts" count={results.accounts.length}>
              <table className="dt">
                <thead><tr><th>Account</th><th className="text-right">Revenue</th><th className="text-right">Closures</th><th>Last</th></tr></thead>
                <tbody>
                  {results.accounts.map(a => (
                    <tr key={a.name}>
                      <td className="truncate max-w-[280px]" title={a.name}>{a.name}</td>
                      <td className="text-right font-mono tabular-nums text-emerald-700 font-semibold">{C.fmt$(a.rev)}</td>
                      <td className="text-right font-mono tabular-nums">{a.count}</td>
                      <td className="font-mono tabular-nums text-[10px] text-slate-500">{a.ts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* SKUs */}
          {results.skus.length > 0 && (
            <Section title="SKUs" count={results.skus.length}>
              <table className="dt">
                <thead><tr><th>SKU</th><th>Category</th><th className="text-right">Revenue</th><th className="text-right">Placements</th></tr></thead>
                <tbody>
                  {results.skus.map(s => (
                    <tr key={s.name}>
                      <td className="truncate max-w-[240px]" title={s.name}>{s.name}</td>
                      <td><U.Tag tag="MONITOR" label={s.category} /></td>
                      <td className="text-right font-mono tabular-nums text-emerald-700 font-semibold">{C.fmt$(s.rev)}</td>
                      <td className="text-right font-mono tabular-nums">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Recent rows */}
          {results.recent.length > 0 && (
            <Section title={q ? "Matching Closures" : "Recent Closures"} count={results.recent.length}>
              <table className="dt">
                <thead><tr><th>Date</th><th>Rep</th><th>Account</th><th>SKU</th><th className="text-right">Rev</th></tr></thead>
                <tbody>
                  {results.recent.map((c, i) => (
                    <tr key={i}>
                      <td className="font-mono tabular-nums text-[10px] text-slate-600">{c.ts}</td>
                      <td className="truncate max-w-[140px]">{c.sr}</td>
                      <td className="truncate max-w-[180px]">{c.clientName}</td>
                      <td className="truncate max-w-[180px]">{c.skuName}</td>
                      <td className="text-right font-mono tabular-nums text-emerald-700 font-semibold">{C.fmt$(c.rev)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {!q && (
            <div className="text-[10px] font-mono text-slate-400 small-caps">
              tip: type a rep name, account, or sku · press esc to close · data since {C.MIN_CLOSURE_DATE}
            </div>
          )}
        </div>
      </U.Drawer>
    );
  }

  function Section({ title, count, children }) {
    return (
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <div className="font-display text-[14px] font-semibold tracking-tight">{title}</div>
          <div className="text-[10px] font-mono text-slate-500 small-caps">{count} result{count === 1 ? '' : 's'}</div>
        </div>
        <div className="bcard overflow-hidden">{children}</div>
      </div>
    );
  }

  window.BclDrawers = { PlayerCardDrawer, GlobalSearch };
})();
