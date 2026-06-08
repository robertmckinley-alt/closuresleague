/* ============================================================================
 * main.jsx — App shell · polling · brand & type toggles · silent bookkeeping.
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

  // Brand-hide pill
  function BrandToggle({ on, setOn, label }) {
    return (
      <button
        onClick={() => setOn(!on)}
        className={`text-[10px] px-2 py-1 rounded transition border ${on
          ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}
        title={on ? `${label} hidden — click to include` : `${label} included — click to hide`}
      >
        {on ? '✓ Hiding ' : ''}{label}
      </button>
    );
  }

  function App() {
    const [tab, setTab]               = C.useUrlState('tab', 'exec');
    const [period, setPeriod]         = C.useUrlState('period', 'week');
    const [customRange, setCustomRange] = C.useUrlState('range', { from: '', to: '' });
    const [muted, setMutedState]      = useState(() => C.Audio.muted());

    const [hidePicc,      setHidePicc]      = C.useUrlState('hidePicc',      false);
    const [hideMicrobar,  setHideMicrobar]  = C.useUrlState('hideMicrobar',  false);
    const [hideSungaze,   setHideSungaze]   = C.useUrlState('hideSungaze',   false);

    // Closure-type toggle (matches parent's All / Group / Product)
    //   group   = first time this (store × SKU group) sold
    //   product = new product within an existing SKU group
    const [closureType, setClosureType] = C.useUrlState('type', 'all');

    const [data, setData]   = useState({ closures: [], isDemo: false, source: null });
    const [fetchedAt, setFetchedAt] = useState(null);
    const [isLive, setIsLive]       = useState(false);

    const priorRanksRef   = useRef(null);
    const priorBadgesRef  = useRef({ reps: new Map(), vmi: new Map() });
    const priorTeamPctRef = useRef(0);
    const emitterRef      = useRef(C.createEmitter());

    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [searchOpen, setSearchOpen]         = useState(false);
    const [flashFirstName, setFlashFirstName] = useState({ reps: null, vmi: null });

    function setMuted(v) { C.Audio.setMuted(v); setMutedState(v); }

    async function refresh() {
      try {
        const res = await Api.loadWithFallback();
        setData(res);
        setFetchedAt(res.fetchedAt);
        setIsLive(!res.isDemo);
      } catch (e) { console.error('refresh failed', e); }
    }
    useEffect(() => { refresh(); }, []);
    C.usePolling(refresh, C.POLL_MS);

    const filteredClosures = useMemo(() => {
      const anyBrand = hidePicc || hideMicrobar || hideSungaze;
      const kindFilter = (closureType === 'top-sku' || closureType === 'cat-new' || closureType === 'cat-expansion');
      if (!anyBrand && !kindFilter) return data.closures;
      const PICC_RE     = /\bpicc\b/i;
      const MICROBAR_RE = /micro\s*bar/i;
      const SUNGAZE_RE  = /\bsungaze\b/i;
      return data.closures.filter(c => {
        if (kindFilter && c.closureKind !== closureType) return false;
        const n = c.skuName || '';
        if (hidePicc     && PICC_RE.test(n))     return false;
        if (hideMicrobar && MICROBAR_RE.test(n)) return false;
        if (hideSungaze  && SUNGAZE_RE.test(n))  return false;
        return true;
      });
    }, [data.closures, hidePicc, hideMicrobar, hideSungaze, closureType]);

    const typeCounts = useMemo(() => {
      const out = {'top-sku':0, 'cat-new':0, 'cat-expansion':0};
      for (const c of data.closures) {
        if (out[c.closureKind] !== undefined) out[c.closureKind]++;
      }
      out.all = out['top-sku'] + out['cat-new'] + out['cat-expansion'];
      return out;
    }, [data.closures]);

    const leagueState = useMemo(() => E.buildLeagueState({
      closures: filteredClosures,
      period, customRange,
      asOf: new Date(),
      priorRanks: priorRanksRef.current,
    }), [filteredClosures, period, customRange, fetchedAt]);

    const weekHistory = useMemo(
      () => L.computeWeekHistory(filteredClosures, new Date(), 10),
      [filteredClosures]
    );

    // Silent bookkeeping — row flash only, no popups
    useEffect(() => {
      const prev = priorRanksRef.current;
      ['reps', 'vmi'].forEach(div => {
        const board = leagueState[div];
        const top = board[0]; if (!top) return;
        const prevMap = prev ? prev[div] : null;
        let prevLeaderName = null;
        if (prevMap) for (const [name, rank] of prevMap.entries()) if (rank === 1) prevLeaderName = name;
        if (prevLeaderName && prevLeaderName !== top.name) {
          setFlashFirstName(f => ({ ...f, [div]: top.name }));
          setTimeout(() => setFlashFirstName(f => ({ ...f, [div]: null })), 1800);
        }
      });
      const repsDiff = E.diffEarnedBadges(priorBadgesRef.current.reps, leagueState.reps, filteredClosures, 'reps', new Date());
      const vmiDiff  = E.diffEarnedBadges(priorBadgesRef.current.vmi,  leagueState.vmi,  filteredClosures, 'vmi',  new Date());
      priorBadgesRef.current = { reps: repsDiff.newMap, vmi: vmiDiff.newMap };
      priorTeamPctRef.current = leagueState.team.pct;
      priorRanksRef.current = leagueState.newRankMaps;
    }, [leagueState]);

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

        {/* Period + Type + Brand toggles */}
        <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-3 flex-wrap no-print">
          <div className="text-[10px] font-mono text-slate-500 small-caps">period</div>
          <U.PeriodPicker period={period} setPeriod={setPeriod} customRange={customRange} setCustomRange={setCustomRange} />

          <div className="h-5 w-px bg-slate-200 mx-1 hide-sm"></div>
          <div className="text-[10px] font-mono text-slate-500 small-caps">type</div>
          <div className="flex bg-slate-100 rounded-md p-0.5 text-[10px] font-semibold">
            {[
              ['all',           'All',          typeCounts.all],
              ['top-sku',       'Top SKU',      typeCounts['top-sku']],
              ['cat-new',       'New Category', typeCounts['cat-new']],
              ['cat-expansion', 'Cat Expansion',typeCounts['cat-expansion']],
            ].map(([k, l, n]) => (
              <button
                key={k}
                onClick={() => setClosureType(k)}
                className={`px-2 py-0.5 rounded ${closureType === k ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                title={`${l}: ${n} closures`}
              >
                {l}<span className="font-mono opacity-60 ml-1">{n}</span>
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-slate-200 mx-1 hide-sm"></div>
          <div className="text-[10px] font-mono text-slate-500 small-caps">hide</div>
          <BrandToggle on={hidePicc}     setOn={setHidePicc}     label="PICC" />
          <BrandToggle on={hideMicrobar} setOn={setHideMicrobar} label="Micro Bar" />
          <BrandToggle on={hideSungaze}  setOn={setHideSungaze}  label="Sungaze" />

          <span className="text-[10px] font-mono text-slate-500 small-caps ml-auto">
            {leagueState.periodLabel} · {filteredClosures.length} of {data.closures.length} closures (spec v2026-06-08-c; ledger starts {C.MIN_CLOSURE_DATE})
            {data.sourceError && <span className="text-rose-700 ml-2">· LOAD ERROR: {String(data.sourceError)}</span>}
          </span>
        </div>

        <div className="flex-1 flex min-h-0 main-stack">
          <main className="flex-1 overflow-auto min-w-0">
            {tab === 'exec' && <X.ExecutiveMode state={leagueState} weekHistory={weekHistory} onPickPlayer={setSelectedPlayer} />}
            {tab === 'reps' && <L.RepsLeague state={leagueState} onPickPlayer={setSelectedPlayer} flashFirstName={flashFirstName.reps} />}
            {tab === 'vmi'  && <L.VmiLeague  state={leagueState} onPickPlayer={setSelectedPlayer} flashFirstName={flashFirstName.vmi} />}
            {tab === 'team' && <L.TeamLeague state={leagueState} weekHistory={weekHistory} />}
          </main>

          <X.ActivityFeed
            feed={leagueState.feed}
            team={leagueState.team}
            repsCount={repsCount} vmiCount={vmiCount}
            lastUpdate={fetchedAt}
          />
        </div>

        {selectedPlayer && (
          <D.PlayerCardDrawer
            player={selectedPlayer}
            division={selectedPlayer.division}
            allClosures={filteredClosures}
            onClose={() => setSelectedPlayer(null)}
          />
        )}
        {searchOpen && (
          <D.GlobalSearch
            closures={filteredClosures}
            repsBoard={leagueState.reps}
            vmiBoard={leagueState.vmi}
            onPickPlayer={(p) => setSelectedPlayer(p)}
            onClose={() => setSearchOpen(false)}
          />
        )}

        <Ef.EffectsHost emitter={emitterRef.current} />
      </div>
    );
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(<App />);
})();
