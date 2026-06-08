/* ============================================================================
 * engines.jsx — Leaderboard / Achievement / Goal / Momentum / Activity engines.
 *
 * Pure functions over the normalized closures array. The React layer calls
 * buildLeagueState(closures, asOf) and gets back everything it needs to render.
 *
 *  Closure shape: { ts, clientName, skuName, category, rev, units, sr, vr }
 * ============================================================================ */
(function () {
  const C = window.BclCore;

  // -------------------------- Date / period filters --------------------------
  function filterByPeriod(closures, period, asOf, customRange) {
    const now = C.toDate(asOf) || new Date();
    let from = null, to = null;
    if (period === 'week') { from = C.startOfWeek(now); to = C.endOfWeek(now); }
    else if (period === 'lastweek') { const lw = C.addDays(C.startOfWeek(now), -7); from = lw; to = C.addDays(lw, 6); }
    else if (period === 'month') { from = C.startOfMonth(now); to = C.endOfMonth(now); }
    else if (period === 'quarter') { from = C.startOfQuarter(now); to = C.endOfQuarter(now); }
    else if (period === 'all') { /* no bounds */ }
    else if (period === 'custom') {
      from = customRange && customRange.from ? C.toDate(customRange.from) : null;
      to = customRange && customRange.to ? C.toDate(customRange.to) : null;
    }
    const fromS = from ? C.ymd(from) : null;
    const toS = to ? C.ymd(to) : null;
    const out = closures.filter(c => {
      if (fromS && c.ts < fromS) return false;
      if (toS && c.ts > toS) return false;
      return true;
    });
    return { closures: out, from: fromS, to: toS };
  }

  // -------------------------- Player aggregation --------------------------
  // Build a leaderboard for the chosen division.
  //   division: 'reps' | 'vmi'
  //   keyField: 'sr' (for reps) or 'vr' (for vmi)
  // VMI rule:
  //   • REPS LEAGUE excludes anyone classified as VMI (isVmiRep on rep name).
  //     Also excludes 'Unassigned'.
  //   • VMI LEAGUE only includes reps that ARE VMI (isVmiRep on vr name).
  //     Excludes 'Unassigned'.
  function buildLeaderboard(closures, division, asOf) {
    const isVmi = (name) => C.isVmiRep(name);
    const keyField = division === 'vmi' ? 'vr' : 'sr';
    // Pre-filter closures based on division rules
    const div = closures.filter(c => {
      const name = c[keyField];
      if (!name || name === 'Unassigned' || name === '—' || name === '-') return false;
      if (division === 'vmi' && !isVmi(name)) return false;
      if (division === 'reps' && isVmi(name)) return false;
      return true;
    });
    // Aggregate per rep
    const byName = new Map();
    div.forEach(c => {
      const name = c[keyField];
      let p = byName.get(name);
      if (!p) {
        p = { name, division,
              closures: 0, revenue: 0, units: 0,
              days: new Set(), stores: new Set(),
              largestClosure: 0, largestAccount: '',
              perDay: new Map(),
              rows: [],
            };
        byName.set(name, p);
      }
      p.closures += 1;
      p.revenue += c.rev;
      p.units += c.units;
      p.days.add(c.ts);
      p.stores.add(c.clientName);
      if (c.rev > p.largestClosure) { p.largestClosure = c.rev; p.largestAccount = c.clientName; }
      const d = p.perDay.get(c.ts) || { count: 0, rev: 0 };
      d.count += 1; d.rev += c.rev;
      p.perDay.set(c.ts, d);
      p.rows.push(c);
    });
    // Compute derived
    const players = Array.from(byName.values()).map(p => {
      const avg = p.closures > 0 ? p.revenue / p.closures : 0;
      const dayCount = p.days.size;
      const streak = computeStreak(p.perDay, asOf);
      return {
        ...p,
        days: dayCount,
        storeCount: p.stores.size,
        stores: Array.from(p.stores),
        averageDeal: avg,
        streak: streak.current,
        bestStreak: streak.best,
      };
    });
    // Sort by revenue desc
    players.sort((a, b) => b.revenue - a.revenue);
    players.forEach((p, i) => { p.rank = i + 1; });
    return players;
  }

  // Streak: number of consecutive days (counting backwards from asOf) with closures.
  function computeStreak(perDay, asOf) {
    const days = Array.from(perDay.keys()).sort();
    if (!days.length) return { current: 0, best: 0 };
    // Best streak (any window)
    let best = 1, run = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i-1] + 'T00:00:00Z');
      const cur = new Date(days[i] + 'T00:00:00Z');
      const diff = (cur - prev) / 86400000;
      if (diff === 1) run += 1;
      else if (diff > 1) { best = Math.max(best, run); run = 1; }
    }
    best = Math.max(best, run);
    // Current: walk back from asOf and count
    const today = C.ymd(asOf || new Date());
    const set = new Set(days);
    let cur = 0;
    let cursor = today;
    while (set.has(cursor)) {
      cur += 1;
      const d = new Date(cursor + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      cursor = C.ymd(d);
    }
    return { current: cur, best };
  }

  // -------------------------- Player history (best week ever) --------------------------
  function bestWeekEver(closuresForPlayer) {
    if (!closuresForPlayer || !closuresForPlayer.length) return { revenue: 0, label: '' };
    const buckets = new Map();
    closuresForPlayer.forEach(c => {
      const wkStart = C.ymd(C.startOfWeek(c.ts));
      const cur = buckets.get(wkStart) || 0;
      buckets.set(wkStart, cur + c.rev);
    });
    let bestRev = 0, bestKey = '';
    buckets.forEach((v, k) => { if (v > bestRev) { bestRev = v; bestKey = k; } });
    return { revenue: bestRev, label: bestKey ? C.weekLabel(bestKey) : '' };
  }

  // -------------------------- Aggregate roll-ups by period --------------------------
  function aggregatePlayerRollups(allClosures, name, division, asOf) {
    const keyField = division === 'vmi' ? 'vr' : 'sr';
    const mine = allClosures.filter(c => c[keyField] === name);
    const now = C.toDate(asOf) || new Date();
    const sumOver = (from, to) => mine
      .filter(c => c.ts >= C.ymd(from) && c.ts <= C.ymd(to))
      .reduce((s, c) => s + c.rev, 0);
    return {
      lifetime: mine.reduce((s, c) => s + c.rev, 0),
      lifetimeCount: mine.length,
      week: sumOver(C.startOfWeek(now), C.endOfWeek(now)),
      month: sumOver(C.startOfMonth(now), C.endOfMonth(now)),
      quarter: sumOver(C.startOfQuarter(now), C.endOfQuarter(now)),
      best: bestWeekEver(mine),
    };
  }

  // -------------------------- Team progress --------------------------
  function buildTeamProgress(weekClosures, asOf, goal) {
    const total = weekClosures.reduce((s, c) => s + c.rev, 0);
    const target = goal || C.WEEKLY_TEAM_GOAL;
    const paceFrac = C.weekPaceFraction(asOf);
    const expectedNow = paceFrac * target;
    const projection = paceFrac > 0 ? total / paceFrac : 0;
    const remaining = Math.max(0, target - total);
    const daysLeft = C.daysRemainingInWeek(asOf);
    const dailyNeed = daysLeft > 0 ? remaining / daysLeft : remaining;
    return { total, target, paceFrac, expectedNow, projection, remaining, daysLeft, dailyNeed, pct: target > 0 ? total / target : 0 };
  }

  // -------------------------- Achievements --------------------------
  const BADGES = [
    { id: 'first_blood',  title: 'First Blood',  emoji: '🩸', tone: 'fire',  desc: 'Your first closure.' },
    { id: 'closer',       title: 'Closer',       emoji: '💼', tone: 'emerald', desc: '$5k in a single week.' },
    { id: 'rainmaker',    title: 'Rainmaker',    emoji: '🌧️', tone: 'plat', desc: '$10k in a single week.' },
    { id: 'assassin',     title: 'Assassin',     emoji: '🗡️', tone: 'fire',  desc: '5 closures in a single day.' },
    { id: 'machine',      title: 'Machine',      emoji: '⚙️', tone: 'ink',   desc: '10-day closure streak.' },
    { id: 'legend',       title: 'Legend',       emoji: '🏆', tone: 'gold',  desc: '$100k lifetime closures.' },
    { id: 'whale_hunter', title: 'Whale Hunter', emoji: '🐋', tone: 'plat',  desc: 'Largest single closure of the month.' },
    { id: 'closer_king',  title: 'Closer King',  emoji: '👑', tone: 'gold',  desc: '#1 finish in the weekly leaderboard.' },
    { id: 'gold_jacket',  title: 'Gold Jacket',  emoji: '🥇', tone: 'gold',  desc: '$15k week (hit your goal).' },
    { id: 'iron_will',    title: 'Iron Will',    emoji: '🛡️', tone: 'ink',   desc: '20-day closure streak.' },
  ];
  function evaluateBadges(player, allPlayers, allClosures, division, asOf) {
    const earned = new Set();
    if (player.closures >= 1) earned.add('first_blood');
    if (player.revenue >= 5000) earned.add('closer');
    if (player.revenue >= 10000) earned.add('rainmaker');
    if (player.revenue >= (division === 'vmi' ? C.WEEKLY_VMI_GOAL : C.WEEKLY_REP_GOAL)) earned.add('gold_jacket');
    // Assassin: 5 closures in a single day
    for (const [, d] of player.perDay) { if (d.count >= 5) { earned.add('assassin'); break; } }
    if (player.bestStreak >= 10) earned.add('machine');
    if (player.bestStreak >= 20) earned.add('iron_will');
    // Lifetime — needs allClosures
    const keyField = division === 'vmi' ? 'vr' : 'sr';
    const lifetimeRev = allClosures.filter(c => c[keyField] === player.name).reduce((s, c) => s + c.rev, 0);
    if (lifetimeRev >= 100000) earned.add('legend');
    // Whale hunter — largest single closure of the current month
    const monthFrom = C.ymd(C.startOfMonth(asOf || new Date()));
    const monthTo = C.ymd(C.endOfMonth(asOf || new Date()));
    let monthBest = { rev: 0, who: '' };
    allClosures.forEach(c => {
      if (c.ts < monthFrom || c.ts > monthTo) return;
      if (c.rev > monthBest.rev) { monthBest = { rev: c.rev, who: c[keyField] }; }
    });
    if (monthBest.who === player.name) earned.add('whale_hunter');
    // Closer King — #1 in current week (if division was the basis)
    if (player.rank === 1) earned.add('closer_king');
    return BADGES.map(b => ({ ...b, earned: earned.has(b.id) }));
  }

  // -------------------------- Activity feed --------------------------
  function buildActivityFeed(closures, asOf, max = 60) {
    // Sort recent first
    const arr = closures.slice().sort((a, b) => a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0);
    const out = [];
    for (let i = 0; i < Math.min(arr.length, max); i++) {
      const c = arr[i];
      out.push({
        id: `${c.ts}:${c.clientName}:${c.skuName}:${i}`,
        kind: c.rev >= 1000 ? 'fire' : 'closure',
        ts: c.ts,
        message: `${c.sr} closed ${C.fmt$(c.rev)} — ${c.skuName} @ ${c.clientName}`,
      });
    }
    return out;
  }

  // -------------------------- Rank deltas (vs prior snapshot) --------------------------
  // Pure: pass priorPlayers (Map name->rank). Returns array with change and isNew.
  function applyRankDeltas(players, priorRankMap) {
    if (!priorRankMap) return players.map(p => ({ ...p, rankChange: 0, isNew: true }));
    return players.map(p => {
      const prior = priorRankMap.get(p.name);
      if (prior == null) return { ...p, rankChange: 0, isNew: true };
      return { ...p, rankChange: prior - p.rank, isNew: false };
    });
  }
  function rankMap(players) {
    const m = new Map();
    players.forEach(p => m.set(p.name, p.rank));
    return m;
  }

  // -------------------------- Master orchestrator --------------------------
  // Build full state for the app given closures + period + asOf.
  function buildLeagueState({ closures, period, customRange, asOf, priorRanks }) {
    const now = C.toDate(asOf) || new Date();
    // Period-filtered subsets
    const pf = filterByPeriod(closures, period, now, customRange);
    // Leaderboards per division
    const repsBoardRaw = buildLeaderboard(pf.closures, 'reps', now);
    const vmiBoardRaw  = buildLeaderboard(pf.closures, 'vmi', now);
    // Goals per player
    const goalReps = C.WEEKLY_REP_GOAL;
    const goalVmi = C.WEEKLY_VMI_GOAL;
    const decoratePlayers = (players, goal) => players.map(p => {
      const paceFrac = C.weekPaceFraction(now);
      const pct = goal > 0 ? p.revenue / goal : 0;
      const projected = paceFrac > 0 ? p.revenue / paceFrac : 0;
      let paceTag = 'PACE';
      if (period === 'week') {
        if (p.revenue >= goal) paceTag = 'AHEAD';
        else if (projected >= goal * 0.98) paceTag = 'AHEAD';
        else if (projected >= goal * 0.85) paceTag = 'PACE';
        else paceTag = 'BEHIND';
      }
      return { ...p, goal, goalPct: pct, projected, paceTag };
    });
    const reps = decoratePlayers(repsBoardRaw, goalReps);
    const vmi  = decoratePlayers(vmiBoardRaw, goalVmi);
    // Rank deltas
    const repsWithDelta = applyRankDeltas(reps, priorRanks ? priorRanks.reps : null);
    const vmiWithDelta  = applyRankDeltas(vmi,  priorRanks ? priorRanks.vmi  : null);
    // Team thermometer follows the user's selected period so the numbers
    // can't disagree with the page's other KPIs (Top Rep / MVP / Top 5 Reps
    // are all period-scoped too). For non-'week' periods, the projection /
    // daily-need math still runs but reads as 'this many dollars per day to
    // hit goal across the selected window' — interpretable from context.
    const team = buildTeamProgress(pf.closures, now, C.WEEKLY_TEAM_GOAL);
    // Activity feed (period scope)
    const feed = buildActivityFeed(pf.closures, now);
    // Executive highlights
    const exec = buildExecHighlights({
      periodClosures: pf.closures,
      allClosures: closures,
      repsBoard: repsWithDelta,
      vmiBoard: vmiWithDelta,
      team,
      now,
    });
    return {
      periodLabel: prettyPeriodLabel(period, pf.from, pf.to, now),
      period, from: pf.from, to: pf.to,
      closures: pf.closures,
      reps: repsWithDelta, vmi: vmiWithDelta,
      team,
      feed,
      exec,
      newRankMaps: { reps: rankMap(reps), vmi: rankMap(vmi) },
    };
  }

  function prettyPeriodLabel(period, from, to, now) {
    if (period === 'week') return 'This Week · ' + C.weekLabel(now);
    if (period === 'lastweek') return 'Last Week · ' + C.weekLabel(C.addDays(C.startOfWeek(now), -7));
    if (period === 'month') return 'This Month';
    if (period === 'quarter') return 'This Quarter';
    if (period === 'all') return 'All-Time · since ' + C.MIN_CLOSURE_DATE;
    if (period === 'custom') return `${from || '…'} → ${to || '…'}`;
    return '';
  }

  function buildExecHighlights({ periodClosures, allClosures, repsBoard, vmiBoard, team, now }) {
    const totalRev = periodClosures.reduce((s, c) => s + c.rev, 0);
    const totalCount = periodClosures.length;
    const topRep = repsBoard[0];
    const topVmi = vmiBoard[0];
    // Largest closure
    let largest = { rev: 0, who: '', client: '', sku: '' };
    periodClosures.forEach(c => {
      if (c.rev > largest.rev) largest = { rev: c.rev, who: c.sr, client: c.clientName, sku: c.skuName };
    });
    // Largest account (by aggregate revenue)
    const acctMap = new Map();
    periodClosures.forEach(c => acctMap.set(c.clientName, (acctMap.get(c.clientName) || 0) + c.rev));
    let largestAcct = { name: '', rev: 0 };
    acctMap.forEach((v, k) => { if (v > largestAcct.rev) largestAcct = { name: k, rev: v }; });
    // Fastest rising — best positive rankChange across both leagues
    const all = [...repsBoard, ...vmiBoard];
    let riser = null;
    all.forEach(p => {
      if (p.rankChange > 0 && (!riser || p.rankChange > riser.rankChange)) riser = p;
    });
    // MVP — biggest revenue this period (any division)
    let mvp = topRep && topVmi ? (topRep.revenue >= topVmi.revenue ? topRep : topVmi) : (topRep || topVmi);
    return { totalRev, totalCount, topRep, topVmi, largest, largestAcct, riser, mvp };
  }

  // -------------------------- Newly earned diff (for banner triggers) --------------------------
  function diffEarnedBadges(prevMap, currentBoard, allClosures, division, asOf) {
    // currentBoard: [{name, badges?}, ...]; we evaluate fresh.
    const events = [];
    currentBoard.forEach(p => {
      const badges = evaluateBadges(p, currentBoard, allClosures, division, asOf);
      p.badges = badges;
      const earnedNow = new Set(badges.filter(b => b.earned).map(b => b.id));
      const earnedPrev = prevMap && prevMap.get(p.name) ? prevMap.get(p.name) : new Set();
      const newly = [...earnedNow].filter(id => !earnedPrev.has(id));
      newly.forEach(id => {
        const b = BADGES.find(x => x.id === id);
        if (b) events.push({ kind: 'badge', player: p.name, badge: b });
      });
    });
    // Build new map for caller
    const newMap = new Map();
    currentBoard.forEach(p => {
      const earned = new Set((p.badges || []).filter(b => b.earned).map(b => b.id));
      newMap.set(p.name, earned);
    });
    return { events, newMap };
  }

  // -------------------------- Exposed API --------------------------
  window.BclEngines = {
    BADGES,
    filterByPeriod,
    buildLeaderboard,
    buildTeamProgress,
    buildLeagueState,
    aggregatePlayerRollups,
    bestWeekEver,
    evaluateBadges,
    diffEarnedBadges,
    buildActivityFeed,
    applyRankDeltas,
    rankMap,
    computeStreak,
  };
})();
