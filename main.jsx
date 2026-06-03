/* ============================================================================
 * main.jsx — App shell · polling · event orchestration · routing.
 * ============================================================================ */
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  const C  = window.BclCore;
  const U  = window.BclUI;
  const Ef = window.BclEffects;
  const Api = window.BclApi;
  const E  = window.BclEngines;
  const L  = window.BclLeagues;
  const X  = window.BclExec;
  const D  = window.BclDrawers;

  const TABS = [
    { id: 'exec',  label: 'Executive' },
    { id: 'reps',  label: 'Reps League' },
    { id: 'vmi',   label: 'VMI League' },
    { id: 'team',  label: 'Team League' },
  ];

  function App() {
    // ----- persisted state -----
    const [tab, setTab]               = C.useUrlState('tab', 'exec');
    const [period, setPeriod]         = C.useUrlState('period', 'week');
    const [customRange, setCustomRange] = C.useUrlState('range', { from: '', to: '' });
    const [muted, setMutedState]      = useState(() => C.Audio.muted());

    // ----- data state -----
    const [data, setData]   = useState({ closures: [], isDemo: false, source: null });
    const [fetchedAt, setFetchedAt] = useState(null);
    const [isLive, setIsLive]       = useState(false);

    // ----- engine state (for animations) -----
    const priorRanksRef   = useRef(null);              // { reps: Map, vmi: Map }
    const priorBadgesRef  = useRef({ reps: new Map(), vmi: new Map() });
    const priorTeamPctRef = useRef(0);
    const emitterRef      = useRef(C.createEmitter());

    // ----- transient UI state -----
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [searchOpen, setSearchOpen]         = useState(false);
    const [flashFirstName, setFlashFirstName] = useState({ reps: null, vmi: null });

    // ----- mute toggle -----
    function setMuted(v) { C.Audio.setMuted(v); setMutedState(v); }

    // ----- Polling -----
    async function refresh() {
      try {
        const res = await Api.loadWithFallback();
        setData(res);
        setFetchedAt(res.fetchedAt);
        setIsLive(!res.isDemo);
      } catch (e) {
        console.error('refresh failed', e);
      }
    }
    useEffect(() => { refresh(); }, []);
    C.usePolling(refresh, C.POLL_MS);

    // ----- Compute league state -----
    const leagueState = useMemo(() => {
      return E.buildLeagueState({
        closures: data.closures,
        period,
        customRange,
        asOf: new Date(),
        priorRanks: priorRanksRef.current,
      });
    }, [data.closures, period, customRange, fetchedAt]);

    const weekHistory = useMemo(
      () => L.computeWeekHistory(data.closures, new Date(), 10),
      [data.closures]
    );

    // ----- Event detection on each new state -----
    useEffect(() => {
      const prev = priorRanksRef.current;
      // ---- New leader detection ----
      ['reps', 'vmi'].forEach(div => {
        const board = leagueState[div];
        const top = board[0];
        if (!top) return;
        const prevMap = prev ? prev[div] : null;
        // Did the #1 name change?
        let prevLeaderName = null;
        if (prevMap) {
          for (const [name, rank] of prevMap.entries()) if (rank === 1) prevLeaderName = name;
        }
        if (prevLeaderName && prevLeaderName !== top.name) {
          // Trigger new-leader event
          emitterRef.current.emit({
            kind: 'newLeader',
            title: `🔥 ${top.name.toUpperCase()} JUST TOOK FIRST PLACE`,
            subtitle: `${div.toUpperCase()} League · ${C.fmt$(top.revenue)} this period`,
            icon: '👑',
            palette: 'gold',
            confetti: true,
          });
          setFlashFirstName(f => ({ ...f, [div]: top.name }));
          setTimeout(() => setFlashFirstName(f => ({ ...f, [div]: null })), 1800);
        }
      });
      // ---- Badge detection ----
      const repsDiff = E.diffEarnedBadges(priorBadgesRef.current.reps, leagueState.reps, data.closures, 'reps', new Date());
      const vmiDiff  = E.diffEarnedBadges(priorBadgesRef.current.vmi,  leagueState.vmi,  data.closures, 'vmi',  new Date());
      priorBadgesRef.current = { reps: repsDiff.newMap, vmi: vmiDiff.newMap };
      const wasInitial = !prev;
      if (!wasInitial) {
        [...repsDiff.events, ...vmiDiff.events].slice(0, 4).forEach(evt => {
          emitterRef.current.emit({
            kind: 'badge',
            title: `🏅 ${evt.player} UNLOCKED “${evt.badge.title}”`,
            subtitle: evt.badge.desc,
            icon: evt.badge.emoji,
            palette: evt.badge.tone === 'gold' ? 'gold' : evt.badge.tone === 'fire' ? 'fire' : evt.badge.tone === 'plat' ? 'plat' : 'emerald',
            confetti: ['legend', 'closer_king', 'gold_jacket'].includes(evt.badge.id),
          });
        });
      }
      // ---- Team goal hit detection ----
      const prevTeamPct = priorTeamPctRef.current;
      const curTeamPct  = leagueState.team.pct;
      if (prevTeamPct < 1.0 && curTeamPct >= 1.0) {
        emitterRef.current.emit({
          kind: 'teamHit',
          title: `🚀 TEAM HIT WEEKLY GOAL ${C.fmt$(leagueState.team.target)}`,
          subtitle: `Total: ${C.fmt$(leagueState.team.total)}`,
          icon: '🎉',
          palette: 'emerald',
          confetti: true,
        });
      } else if (prevTeamPct < 0.75 && curTeamPct >= 0.75) {
        emitterRef.current.emit({
          kind: 'goalHit',
          title: `📈 TEAM CROSSED 75% OF WEEKLY GOAL`,
          subtitle: `${C.fmt$(leagueState.team.total)} of ${C.fmt$(leagueState.team.target)}`,
          icon: '📈',
          palette: 'emerald',
          confetti: false,
        });
      } else if (prevTeamPct < 0.5 && curTeamPct >= 0.5) {
        emitterRef.current.emit({
          kind: 'goalHit',
          title: `🎯 TEAM CROSSED 50% OF WEEKLY GOAL`,
          subtitle: `${C.fmt$(leagueState.team.total)} of ${C.fmt$(leagueState.team.target)}`,
          icon: '🎯',
          palette: 'emerald',
          confetti: false,
        });
      }
      priorTeamPctRef.current = curTeamPct;
      // ---- Update prior ranks ----
      priorRanksRef.current = leagueState.newRankMaps;
    }, [leagueState]);

    // ----- Keyboard shortcuts -----
    useEffect(() => {
      function onKey(e) {
        if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (e.key === '/') { e.preventDefault(); setSearchOpen(true); }
        else if (e.key === '1') setTab('exec');
        else if (e.key === '2') setTab('reps');
        else if (e.key === '3') setTab('vmi');
        else if (e.key === '4') setTab('team');
        else if (e.key === 'Escape') { setSelectedPlayer(null); setSearchOpen(false); }
      }
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ----- Header counts -----
    const repsCount = leagueState.reps.length;
    const vmiCount  = leagueState.vmi.length;

    return (
      <div className="h-screen flex flex-col canvas-grain">
        <U.AppBar
          tabs={TABS} tab={tab} setTab={setTab}
          muted={muted} setMuted={setMuted}
          lastFetch={fetchedAt} isLive={isLive}
          repsCount={repsCount} vmiCount={vmiCount}
          onSearch={() => setSearchOpen(true)}
        />

        {/* Period strip */}
        <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-3 flex-wrap no-print">
          <div className="text-[10px] font-mono text-slate-500 small-caps">period</div>
          <U.PeriodPicker period={period} setPeriod={setPeriod} customRange={customRange} setCustomRange={setCustomRange} />
          <span className="text-[10px] font-mono text-slate-500 small-caps ml-auto">
            {leagueState.periodLabel} · {data.closures.length} closures since {C.MIN_CLOSURE_DATE}
            {data.isDemo && <span className="text-amber-700 ml-2">· DEMO DATA (api unreachable)</span>}
          </span>
        </div>

        <div className="flex-1 flex min-h-0 main-stack">
          <main className="flex-1 overflow-auto min-w-0">
            {tab === 'exec' && (
              <X.ExecutiveMode state={leagueState} weekHistory={weekHistory} onPickPlayer={setSelectedPlayer} />
            )}
            {tab === 'reps' && (
              <L.RepsLeague state={leagueState} onPickPlayer={setSelectedPlayer} flashFirstName={flashFirstName.reps} />
            )}
            {tab === 'vmi' && (
              <L.VmiLeague state={leagueState} onPickPlayer={setSelectedPlayer} flashFirstName={flashFirstName.vmi} />
            )}
            {tab === 'team' && (
              <L.TeamLeague state={leagueState} weekHistory={weekHistory} />
            )}
          </main>

          <X.ActivityFeed
            feed={leagueState.feed}
            team={leagueState.team}
            repsCount={repsCount} vmiCount={vmiCount}
            lastUpdate={fetchedAt}
          />
        </div>

        {/* Drawers */}
        {selectedPlayer && (
          <D.PlayerCardDrawer
            player={selectedPlayer}
            division={selectedPlayer.division}
            allClosures={data.closures}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
        {searchOpen && (
          <D.GlobalSearch
            closures={data.closures}
            repsBoard={leagueState.reps}
            vmiBoard={leagueState.vmi}
            onPickPlayer={(p) => setSelectedPlayer(p)}
            onClose={() => setSearchOpen(false)}
          />
        )}

        {/* Effects host */}
        <Ef.EffectsHost emitter={emitterRef.current} />
      </div>
    );
  }

  // ---------- Boot ----------
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
})();
