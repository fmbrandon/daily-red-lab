import {sha256} from './hash.mjs';
import {legalActions, createBattle, applyAction} from './game.mjs';

export const EVALUATOR_VERSION = 'v3.1';

export function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export function fingerprint(obj) {
  return sha256(stableStringify(obj));
}

function battleSet(p){return{name:p.name,species:p.species??p.name,level:p.level??100,gender:p.gender??'M',item:p.item??'',ability:p.ability??'',nature:p.nature??'Serious',ivs:p.ivs,evs:p.evs,statModel:p.statModel??null,moves:(p.moves??[]).map(m=>typeof m==='string'?{name:m}:{name:m.name,pp:m.pp??null,max:m.max??null})};}
export function teamFingerprint(team){return fingerprint(team.map(battleSet));}
export function opponentFingerprint(opponent){return fingerprint({id:opponent.id,trainer:opponent.upper??opponent.trainer??opponent.name,statModel:opponent.statModel??'standard',team:(opponent.team??[]).map(battleSet)});}

export function deriveSyntheticSeed({teamFp, opponentFp, oppFp, evaluatorVersion = EVALUATOR_VERSION, trialIndex, namespace = 'audit', protocolFp = ''}) {
  if (!Number.isInteger(trialIndex) || trialIndex < 0) {
    throw new Error('Trial index must be a non-negative integer.');
  }
  const oFp = opponentFp ?? oppFp;
  if (!teamFp || !oFp) {
    throw new Error('Both teamFp and opponentFp are required for seed derivation.');
  }
  return `eval:${namespace}:${evaluatorVersion}:${teamFp}:${oFp}:${protocolFp}:${trialIndex}`;
}

function offensiveScore(sim, p, r) {
  const slots = p.moveSlots.filter(m => m.pp > 0 && !m.disabled);
  if (!slots.length) return 0;
  return Math.max(0, ...slots.map(m => sim.score(p, r, m.id).score));
}

// 1. Offensive policy: Prioritizes immediate highest expected damage / KO; switches only when forced.
export function policyOffensive(sim) {
  const s = sim.state();
  const all = legalActions(s);
  const moves = all.filter(a => a.type === 'move');
  if (moves.length === 1 && all.length === 1) return moves[0];

  const p = sim.battle.p1.active[0];
  const r = sim.battle.p2.active[0];

  if (moves.length > 0) {
    const scoredMoves = moves.map(a => {
      const moveId = a.idx < 0 ? 'struggle' : s.p[s.pa].moves[a.idx].name;
      const move = sim.battle.dex.moves.get(moveId);
      const score = sim.score(p, r, move.id);
      return {action: a, score: score.score, ko: score.ko};
    });
    scoredMoves.sort((a, b) => Number(b.ko) - Number(a.ko) || b.score - a.score || a.action.idx - b.action.idx);
    return scoredMoves[0].action;
  }

  // Forced switch
  const switches = all.filter(a => a.type === 'switch').map(a => {
    const mon = sim.original[0][a.idx];
    return {action: a, value: offensiveScore(sim, mon, r) / (r.hp || 1) - offensiveScore(sim, r, mon) / (mon.hp || 1)};
  });
  switches.sort((a, b) => b.value - a.value || a.action.idx - b.action.idx);
  return switches[0]?.action ?? all[0];
}

// 2. Switch-aware policy: Evaluates switches when active Pokémon is at severe disadvantage or threatened with KO.
export function policySwitch(sim) {
  const s = sim.state();
  const all = legalActions(s);
  const moves = all.filter(a => a.type === 'move');
  const switches = all.filter(a => a.type === 'switch');
  if (all.length === 1) return all[0];

  const p = sim.battle.p1.active[0];
  const r = sim.battle.p2.active[0];

  const scoredMoves = moves.map(a => {
    const moveId = a.idx < 0 ? 'struggle' : s.p[s.pa].moves[a.idx].name;
    const move = sim.battle.dex.moves.get(moveId);
    const score = sim.score(p, r, move.id);
    return {action: a, score: score.score, ko: score.ko};
  });
  scoredMoves.sort((a, b) => Number(b.ko) - Number(a.ko) || b.score - a.score || a.action.idx - b.action.idx);
  const bestMove = scoredMoves[0];

  // If we can KO the opponent right now with an attack, always attack!
  if (bestMove?.ko) {
    return bestMove.action;
  }

  // Check incoming threat from opponent
  const incomingThreat = offensiveScore(sim, r, p);
  const playerCurrentHp = p.hp || 1;
  const threatFraction = incomingThreat / playerCurrentHp;
  const playerDmgFraction = (bestMove?.score || 0) / (r.maxhp || 1);

  // If heavily threatened (threat >= 0.55 of current HP) and our current attack does modest damage (< 0.40):
  if (switches.length > 0 && threatFraction >= 0.55 && playerDmgFraction < 0.40) {
    const scoredSwitches = switches.map(a => {
      const mon = sim.original[0][a.idx];
      const monHp = mon.hp || 1;
      const incomingOnMon = offensiveScore(sim, r, mon);
      const outgoingFromMon = offensiveScore(sim, mon, r);
      // Value safety: teammate must not be KO'd on entry and should counter-pressure
      const safety = 1 - (incomingOnMon / monHp);
      const offensivePotential = outgoingFromMon / (r.hp || 1);
      const score = safety * 2.0 + offensivePotential * 1.5;
      return {action: a, score, safe: incomingOnMon < monHp};
    });
    scoredSwitches.sort((a, b) => Number(b.safe) - Number(a.safe) || b.score - a.score || a.action.idx - b.action.idx);

    if (scoredSwitches[0] && scoredSwitches[0].safe && scoredSwitches[0].score > 1.8) {
      return scoredSwitches[0].action;
    }
  }

  if (bestMove) return bestMove.action;
  if (switches.length) {
    const fallbackSwitches = switches.map(a => {
      const mon = sim.original[0][a.idx];
      return {action: a, value: offensiveScore(sim, mon, r) / (r.hp || 1) - offensiveScore(sim, r, mon) / (mon.hp || 1)};
    });
    fallbackSwitches.sort((a, b) => b.value - a.value || a.action.idx - b.action.idx);
    return fallbackSwitches[0]?.action;
  }
  return all[0];
}

// 3. Setup, status, and recovery policy: Prioritizes sleep, recovery, and stat boosts when conditions are right.
export function policySetup(sim) {
  const s = sim.state();
  const all = legalActions(s);
  const moves = all.filter(a => a.type === 'move');
  if (moves.length === 1 && all.length === 1) return moves[0];

  const p = sim.battle.p1.active[0];
  const r = sim.battle.p2.active[0];

  if (moves.length > 0) {
    const scoredMoves = moves.map(a => {
      const moveId = a.idx < 0 ? 'struggle' : s.p[s.pa].moves[a.idx].name;
      const move = sim.battle.dex.moves.get(moveId);
      const score = sim.score(p, r, move.id);
      let value = score.score / (r.maxhp || 1);

      // Status awareness
      if (['spore', 'sleeppowder', 'hypnosis', 'lovelykiss', 'yawn'].includes(move.id) && !r.status && !['insomnia', 'vitalspirit'].includes(r.ability)) {
        value = 0.75 * (move.accuracy === true ? 1 : move.accuracy / 100);
      }
      if (['recover', 'softboiled', 'milkdrink', 'slackoff', 'synthesis', 'moonlight', 'morningsun', 'wish'].includes(move.id) && p.hp / p.maxhp < 0.50) {
        value = 0.70;
      }
      if (['swordsdance', 'dragondance', 'bulkup', 'calmmind', 'growth', 'curse', 'tailglow', 'bellydrum'].includes(move.id) && p.hp / p.maxhp > 0.65 && Math.max(p.boosts.atk || 0, p.boosts.spa || 0) < 2) {
        value = 0.55;
      }
      if (['thunderwave', 'glare', 'stunspore'].includes(move.id) && !r.status && !r.types.includes('Ground') && r.ability !== 'limber') {
        value = 0.45;
      }
      if (['willowisp'].includes(move.id) && !r.status && !r.types.includes('Fire') && r.ability !== 'waterveil') {
        value = 0.48;
      }
      if (move.id === 'sleeptalk' && p.status === 'slp') value = 0.95;
      if (move.id === 'snore' && p.status !== 'slp') value = -1;

      return {action: a, value, ko: score.ko};
    });

    scoredMoves.sort((a, b) => Number(b.ko) - Number(a.ko) || b.value - a.value || a.action.idx - b.action.idx);
    return scoredMoves[0].action;
  }

  // Forced switch
  const switches = all.filter(a => a.type === 'switch').map(a => {
    const mon = sim.original[0][a.idx];
    return {action: a, value: offensiveScore(sim, mon, r) / (r.hp || 1) - offensiveScore(sim, r, mon) / (mon.hp || 1)};
  });
  switches.sort((a, b) => b.value - a.value || a.action.idx - b.action.idx);
  return switches[0]?.action ?? all[0];
}

// Optional heuristic rescue scorer; this does not simulate future states.
export function policyRescueHeuristic(sim, {nodeBudget = 150} = {}) {
  // If quick decisive action is available, use policySwitch
  const s = sim.state();
  const all = legalActions(s);
  if (all.length <= 1) return all[0];

  // Run a bounded beam search
  let nodesEvaluated = 0;

  const p = sim.battle.p1.active[0];
  const r = sim.battle.p2.active[0];

  // Try legal actions and evaluate 1-ply simulation
  const candidates = [];
  for (const a of all) {
    if (nodesEvaluated >= nodeBudget) break;
    nodesEvaluated++;
    // Use policySwitch as primary choice
    if (a.type === 'move') {
      const moveId = a.idx < 0 ? 'struggle' : s.p[s.pa].moves[a.idx].name;
      const score = sim.score(p, r, moveId);
      candidates.push({action: a, score: score.score + (score.ko ? 500 : 0)});
    } else {
      const mon = sim.original[0][a.idx];
      const diff = offensiveScore(sim, mon, r) - offensiveScore(sim, r, mon);
      candidates.push({action: a, score: diff});
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.action ?? policySwitch(sim);
}

export const REFERENCE_POLICIES = {
  offensive: policyOffensive,
  switch: policySwitch,
  setup: policySetup
};

export function runPolicyGame(engine, config, policyFn, {maxDecisions = 96} = {}) {
  const sim = createBattle(engine, config);
  const actions = [];
  let capped = false;
  let error = null;

  try {
    while (!sim.state().outcome && actions.length < maxDecisions) {
      const a = policyFn(sim);
      if (!a) break;
      applyAction(sim, a);
      actions.push(a);
    }
    const s = sim.state();
    if (!s.outcome && actions.length >= maxDecisions) {
      capped = true;
    }
    const won = s.outcome === 'won' && sim.battle.winner === 'Player';
    return {
      won,
      survivors: s.p.filter(mon => mon.hp > 0).length,
      completedTurns: s.completedTurns,
      enemyDefeated: s.r.filter(mon => mon.hp <= 0).length,
      enemyProgress: s.r.reduce((n, mon) => n + 1 - mon.hp / mon.max, 0),
      capped,
      actions,
      state: s,
      error: null
    };
  } catch (err) {
    return {
      won: false,
      survivors: 0,
      completedTurns: actions.length,
      enemyDefeated: 0,
      enemyProgress: 0,
      capped: false,
      actions,
      state: null,
      error: err.message
    };
  } finally {
    sim.destroy();
  }
}

// Deterministic lead selector for bundle: returns [lead0, lead1]
export function selectBundleLeads(team, opponentFirstMon, dex) {
  // Lead 0: First slot (default recommended lead)
  const lead0 = 0;

  // Lead 1: Alternate lead that has best typing/speed against opponent's first mon
  let bestAltLead = 1;
  let bestScore = -1e9;
  for (let i = 1; i < team.length; i++) {
    const mon = team[i];
    let score = 0;
    // Check resistance to opponent lead types
    for (const t of opponentFirstMon.types ?? []) {
      const mult = dex.getEffectiveness(t, mon.types);
      if (mult < 0) score += 2; // Resistance
      if (mult > 0) score -= 2; // Weakness
    }
    if (score > bestScore) {
      bestScore = score;
      bestAltLead = i;
    }
  }
  return [lead0, bestAltLead];
}

// Run an independent seed bundle across the reference policy suite
export function runSeedBundle(engine, baseConfig, trialIndex, {
  evaluatorVersion = EVALUATOR_VERSION,
  namespace = 'audit',
  policies = ['offensive', 'switch', 'setup'],
  leads = null,
  protocolFp = '',
  maxDecisions = 96
} = {}) {
  const teamFp = teamFingerprint(baseConfig.team);
  const oppFp = opponentFingerprint(baseConfig.opponent ?? {id: 'red-original', team: engine.pool.red});
  const bundleSeed = deriveSyntheticSeed({teamFp, opponentFp: oppFp, evaluatorVersion, trialIndex, namespace, protocolFp});

  // Determine leads
  let chosenLeads = leads;
  if (!chosenLeads) {
    const probe = createBattle(engine, {...baseConfig, seed: bundleSeed});
    const dex = probe.battle.dex;
    const oppFirst = probe.state().r[0];
    probe.destroy();
    chosenLeads = selectBundleLeads(baseConfig.team, oppFirst, dex);
  }

  const runs = [];
  let bundleWon = false;
  let bestRun = null;

  for (const policyName of policies) {
    const policyFn = REFERENCE_POLICIES[policyName] ?? policyOffensive;
    for (const lead of chosenLeads) {
      const trialConfig = {
        ...baseConfig,
        lead,
        seed: bundleSeed
      };
      const result = runPolicyGame(engine, trialConfig, policyFn, {maxDecisions});
      const runRecord = {
        policy: policyName,
        lead,
        won: result.won,
        survivors: result.survivors,
        turns: result.completedTurns,
        enemyProgress: result.enemyProgress,
        capped: result.capped,
        error: result.error
      };
      runs.push(runRecord);

      if (result.won) {
        bundleWon = true;
        if (!bestRun || result.survivors > bestRun.survivors) {
          bestRun = {
            policy: policyName,
            lead,
            won: true,
            survivors: result.survivors,
            turns: result.completedTurns,
            actions: result.actions,
            state: result.state
          };
        }
      } else if (!bestRun || (!bestRun.won && result.enemyProgress > bestRun.enemyProgress)) {
        bestRun = {
          policy: policyName,
          lead,
          won: false,
          survivors: result.survivors,
          turns: result.completedTurns,
          enemyProgress: result.enemyProgress,
          actions: result.actions,
          state: result.state
        };
      }
    }
  }

  return {
    trialIndex,
    seed: bundleSeed,
    won: bundleWon,
    valid: runs.every(r => !r.error),
    errors: runs.filter(r=>r.error).length,
    capped: runs.filter(r=>r.capped).length,
    bestRun,
    runs
  };
}

export const policyRescueSearch=policyRescueHeuristic; // Deprecated compatibility name; no beam-search claim.
