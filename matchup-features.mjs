// Interpretable matchup features and cheap heuristic triage.
import {defensiveMultiplier} from './party-composition.mjs';

const matchupCache = new Map();

// Evaluates a single player build vs a single opponent slot
export function evaluateMonSlotMatchup(dex, mon, oppMon) {
  const cacheKey = `${mon.id ?? mon.name}::${oppMon.slotId ?? oppMon.name}`;
  if (matchupCache.has(cacheKey)) {
    return matchupCache.get(cacheKey);
  }

  // 1. Speed comparison
  const monSpe = mon.stats?.spe ?? mon.bs?.[5] ?? 100;
  const oppSpe = oppMon.stats?.spe ?? oppMon.bs?.[5] ?? 100;
  const outspeeds = monSpe > oppSpe;

  // 2. Incoming threat evaluation (how badly oppMon hurts mon)
  let maxIncomingThreat = 0;
  for (const m of oppMon.moves ?? []) {
    const move = dex.moves.get(m.name ?? m);
    if (!move || move.category === 'Status') continue;
    const moveType = move.type;
    const mult = defensiveMultiplier(dex, moveType, mon);
    const stab = (oppMon.types ?? []).includes(moveType) ? 1.5 : 1.0;
    const power = (move.basePower || 60) * stab * mult;
    if (power > maxIncomingThreat) {
      maxIncomingThreat = power;
    }
  }

  // 3. Outgoing offensive pressure (how well mon hurts oppMon)
  let maxOutgoingPressure = 0;
  for (const m of mon.moves ?? []) {
    const move = dex.moves.get(m.name ?? m);
    if (!move || move.category === 'Status') continue;
    const moveType = move.id === 'hiddenpower'
      ? dex.getHiddenPower(Object.fromEntries(['hp','atk','def','spa','spd','spe'].map((k,i)=>[k,mon.ivs?.[i]??31]))).type
      : move.type;
    const mult = defensiveMultiplier(dex, moveType, oppMon);
    const stab = (mon.types ?? []).includes(moveType) ? 1.5 : 1.0;
    const power = (move.basePower || 60) * stab * mult;
    if (power > maxOutgoingPressure) {
      maxOutgoingPressure = power;
    }
  }

  // 4. Utility / Status bonuses
  let utilityScore = 0;
  for (const m of mon.moves ?? []) {
    const moveId = (m.name ?? m).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (['spore', 'sleeppowder', 'hypnosis', 'lovelykiss'].includes(moveId) && !['insomnia', 'vitalspirit'].includes((oppMon.ability ?? '').toLowerCase())) {
      utilityScore += 30;
    }
    if (['recover', 'softboiled', 'slackoff', 'synthesis', 'moonlight', 'morningsun', 'milkdrink'].includes(moveId)) {
      utilityScore += 20;
    }
    if (['swordsdance', 'dragondance', 'calmmind', 'bulkup'].includes(moveId)) {
      utilityScore += 15;
    }
  }

  const netRating = (maxOutgoingPressure + utilityScore) - maxIncomingThreat;
  const result = {
    outspeeds,
    maxIncomingThreat,
    maxOutgoingPressure,
    utilityScore,
    netRating
  };

  matchupCache.set(cacheKey, result);
  return result;
}

// Compute aggregate team matchup features vs opponent team
export function computeTeamMatchupFeatures(dex, team, opponentTeam) {
  let totalSpeedWins = 0;
  let totalNetRating = 0;
  const comparisons = team.length * opponentTeam.length;

  const opponentCoverage = Array(opponentTeam.length).fill(0);

  for (let i = 0; i < team.length; i++) {
    const mon = team[i];
    for (let j = 0; j < opponentTeam.length; j++) {
      const oppMon = opponentTeam[j];
      const match = evaluateMonSlotMatchup(dex, mon, oppMon);

      if (match.outspeeds) totalSpeedWins++;
      totalNetRating += match.netRating;

      if (match.netRating > 0) {
        opponentCoverage[j]++;
      }
    }
  }

  const speedControl = comparisons > 0 ? totalSpeedWins / comparisons : 0.5;
  const averageNetRating = comparisons > 0 ? totalNetRating / comparisons : 0;
  const uncoveredThreats = opponentCoverage.map((count, idx) => ({idx, oppName: opponentTeam[idx].name, counters: count})).filter(x => x.counters === 0);

  // Composite score: scaled roughly between -100 and +100
  const compositeScore = (speedControl - 0.5) * 50 + averageNetRating * 0.5 - uncoveredThreats.length * 15;
  const isFavorable = compositeScore >= -20 && uncoveredThreats.length <= 1;

  return {
    speedControl,
    averageNetRating,
    uncoveredThreats,
    compositeScore,
    isFavorable
  };
}

// Deterministic exploration triage: 1 in every N candidates bypasses heuristic filter
export function shouldTriageCandidate(candidateIndex, features, {explorationInterval = 4} = {}) {
  // Exploration slot
  if (candidateIndex % explorationInterval === 0) {
    return {
      pass: true,
      isExploration: true,
      reason: `Exploration slot (attempt #${candidateIndex})`
    };
  }

  // Favorable evaluation
  if (features.isFavorable) {
    return {
      pass: true,
      isExploration: false,
      reason: `Favorable matchup score (${features.compositeScore.toFixed(1)}), ${features.uncoveredThreats.length} uncovered threats`
    };
  }

  // Unfavorable surrogate skip
  return {
    pass: false,
    isExploration: false,
    reason: `Unfavorable matchup score (${features.compositeScore.toFixed(1)}) with ${features.uncoveredThreats.length} uncovered threats`
  };
}

export function clearMatchupCache() {
  matchupCache.clear();
}
