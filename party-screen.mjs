import{assessEvidence,evidenceIdentity,cacheRecord}from'./party-evidence.mjs';
import {assessComposition} from './party-composition.mjs';
import {prepareConfig, createBattle, applyAction, legalActions} from './game.mjs';
import {computeTeamMatchupFeatures, shouldTriageCandidate} from './matchup-features.mjs';
import {runSeedBundle, runPolicyGame, policySwitch, policySetup, policyOffensive, teamFingerprint, opponentFingerprint} from './evaluation-protocol.mjs';
import {classifySequentialStage, DEFAULT_STAGES, DEFAULT_THRESHOLDS} from './party-statistics.mjs';

// A bounded deterministic test policy, not an optimal player or proof of impossibility.
function offensiveScore(sim, p, r) {
  return Math.max(0, ...p.moveSlots.filter(m => m.pp > 0 && !m.disabled).map(m => sim.score(p, r, m.id).score));
}

export function screeningAction(sim) {
  const s = sim.state(), p = sim.battle.p1.active[0], r = sim.battle.p2.active[0], all = legalActions(s);
  if (all.filter(a => a.type === 'move').length === 1) return all.find(a => a.type === 'move');
  const moves = all.filter(a => a.type === 'move').map(a => {
    const move = sim.battle.dex.moves.get(a.idx < 0 ? 'struggle' : s.p[s.pa].moves[a.idx].name), score = sim.score(p, r, move.id);
    let value = score.score / r.maxhp;
    // Modest support awareness, bounded by actual HP, status and stages.
    if (['spore', 'sleeppowder', 'hypnosis', 'lovelykiss'].includes(move.id) && !r.status && !['insomnia', 'vitalspirit'].includes(r.ability)) value = .6 * (move.accuracy === true ? 1 : move.accuracy / 100);
    if (['recover', 'softboiled', 'milkdrink', 'slackoff', 'synthesis', 'moonlight', 'morningsun'].includes(move.id) && p.hp / p.maxhp < .45) value = .65;
    if (['swordsdance', 'dragondance', 'bulkup', 'calmmind', 'growth', 'curse'].includes(move.id) && p.hp / p.maxhp > .7 && Math.max(p.boosts.atk, p.boosts.spa) < 2) value = .45;
    if (move.id === 'sleeptalk' && p.status === 'slp') value = .9;
    if (move.id === 'snore' && p.status !== 'slp') value = -1;
    return {action: a, value, ko: score.ko};
  });
  moves.sort((a, b) => Number(b.ko) - Number(a.ko) || b.value - a.value || a.action.idx - b.action.idx);
  if (moves.length) return moves[0].action;
  const switches = all.filter(a => a.type === 'switch').map(a => {
    const mon = sim.original[0][a.idx];
    return {action: a, value: offensiveScore(sim, mon, r) / r.hp - offensiveScore(sim, r, mon) / mon.hp};
  });
  switches.sort((a, b) => b.value - a.value || a.action.idx - b.action.idx);
  return switches[0]?.action;
}

export function trialParty(engine, config, {maxDecisions = 96} = {}) {
  const sim = createBattle(engine, config), actions = [];
  try {
    while (!sim.state().outcome && actions.length < maxDecisions) {
      const a = screeningAction(sim);
      if (!a) break;
      applyAction(sim, a);
      actions.push(a);
    }
    const s = sim.state(), won = s.outcome === 'won' && sim.battle.winner === 'Player';
    return {won, survivors: s.p.filter(p => p.hp > 0).length, turns: s.completedTurns, enemyDefeated: s.r.filter(p => p.hp <= 0).length, enemyProgress: s.r.reduce((n, p) => n + 1 - p.hp / p.max, 0), actions, state: s};
  } finally {
    sim.destroy();
  }
}

export function verifyTrial(engine, config, trial) {
  const sim = createBattle(engine, config);
  try {
    for (const a of trial.actions) applyAction(sim, a);
    if (sim.battle.winner !== 'Player' || JSON.stringify(sim.state()) !== JSON.stringify(trial.state)) {
      throw Error('Party screening replay did not match.');
    }
  } finally {
    sim.destroy();
  }
}

export function findDailyWitness(engine,config,maxDecisions=96,work={remaining:Infinity}){for(let lead=0;lead<6;lead++)for(const policy of[policySwitch,policySetup,policyOffensive]){if(work.remaining<1)return null;work.remaining--;const res=runPolicyGame(engine,{...config,lead},policy,{maxDecisions});if(res.won)return{won:true,lead,survivors:res.survivors,turns:res.completedTurns,actions:res.actions,state:res.state};}return null;}
export function screenPartyV3(engine,content,settings,{maxCandidates=192,maxDecisions=96,maxBattleCandidates=3,maxGames=216,stages=DEFAULT_STAGES,thresholds=DEFAULT_THRESHOLDS,explorationInterval=4,cache=null}={}){
 if(![maxCandidates,maxDecisions,maxBattleCandidates,maxGames].every(n=>Number.isInteger(n)&&n>0))throw Error('Invalid screening budget');
 const probe=createBattle(engine,prepareConfig(engine,content,settings)),dex=probe.battle.dex,opponent=probe.state().r;probe.destroy();const work={remaining:maxGames};let draws=0,eligibleCandidates=0,battleCandidates=0,surrogateSkips=0,actualGames=0,fallback=null;
 for(let attempt=0;attempt<maxCandidates;attempt++){
  draws++;const config=prepareConfig(engine,content,settings,0,attempt),composition=assessComposition(dex,config.team,opponent);if(!composition.eligible)continue;eligibleCandidates++;
  const features=computeTeamMatchupFeatures(dex,config.team,opponent);if(!shouldTriageCandidate(attempt,features,{explorationInterval}).pass){surrogateSkips++;continue;}
  if(battleCandidates>=maxBattleCandidates||work.remaining<1)break;battleCandidates++;
  // Reserve witness work first so a limited-testing fallback can still be verified.
  const witness=findDailyWitness(engine,config,maxDecisions,work);if(!witness)continue;verifyTrial(engine,{...config,lead:witness.lead},witness);
  const opts={stages,thresholds,maxDecisions,namespace:'screen'},identity=evidenceIdentity(engine,config,opts),record=cacheRecord(cache,identity),assessment=assessEvidence(engine,config,{...opts,record,work});actualGames+=assessment.actualGames;
  const {record:unused,...statisticalDetails}=assessment;
  const candidate={config:{...config,lead:witness?.lead??0},screening:{policy:settings.partyPolicy,verified:!!witness,statisticallyAssessed:assessment.n>0,statisticallyAccepted:assessment.classification==='statistically-balanced',statisticalDetails,limitedTesting:assessment.classification!=='statistically-balanced',fallback:assessment.classification!=='statistically-balanced',composition,features,candidates:draws,eligibleCandidates,battleCandidates,surrogateSkips,trials:maxGames-work.remaining,actualStatisticalGames:actualGames,maxGames,lead:witness?.lead??0,survivors:witness?.survivors,turns:witness?.turns}};
  if(['statistically-weak','statistically-dominant','evaluation-error'].includes(assessment.classification))continue;
  if(witness&&assessment.classification==='statistically-balanced')return candidate;
  if(!fallback||(!fallback.screening.verified&&witness))fallback=candidate;
 }
 if(fallback){Object.assign(fallback.screening,{candidates:draws,eligibleCandidates,battleCandidates,surrogateSkips,trials:maxGames-work.remaining,maxGames});return fallback;}
 throw Error('No party met this statistical check within its budget. Choose Quick balanced or Unrestricted random.');
}

// Unified screenParty dispatcher
export function screenParty(engine, content, settings, options = {}) {
  if (settings.partyPolicy === 'balanced-v3') {
    return screenPartyV3(engine, content, settings, options);
  }

  // Legacy balanced-v1 / balanced-v2 paths
  const maxCandidates = options.maxCandidates ?? (settings.partyPolicy === 'balanced-v2' ? 192 : 12);
  const maxDecisions = options.maxDecisions ?? 96;
  const maxBattleCandidates = options.maxBattleCandidates ?? 12;

  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || !Number.isInteger(maxDecisions) || maxDecisions < 0) {
    throw Error('Invalid party screening bounds.');
  }

  const diverse = settings.partyPolicy === 'balanced-v2';
  const probe = createBattle(engine, prepareConfig(engine, content, settings));
  const dex = probe.battle.dex;
  const opponent = probe.state().r;
  probe.destroy();

  let best = null, trials = 0, eligibleCandidates = 0, draws = 0;
  for (let attempt = 0; attempt < maxCandidates; attempt++) {
    draws++;
    const config = prepareConfig(engine, content, settings, 0, attempt);
    const composition = diverse ? assessComposition(dex, config.team, opponent) : null;
    if (composition && !composition.eligible) continue;
    eligibleCandidates++;

    for (let lead = 0; lead < 6; lead++) {
      const c = {...config, lead};
      const trial = trialParty(engine, c, {maxDecisions});
      trials++;
      const rank = trial.enemyProgress * 10 + trial.survivors * .1;
      if (!best || rank > best.rank) best = {config: c, trial, rank, composition};
      if (trial.won) {
        verifyTrial(engine, c, trial);
        return {
          config: c,
          screening: {
            policy: settings.partyPolicy,
            verified: true,
            candidates: draws,
            eligibleCandidates,
            trials,
            lead,
            survivors: trial.survivors,
            turns: trial.turns,
            maxCandidates,
            maxDecisions,
            composition
          }
        };
      }
    }
    if (diverse && eligibleCandidates >= maxBattleCandidates) break;
  }

  if (!best) {
    throw Error('No varied party met the balance rules within this check. Try another practice party or choose Unrestricted random.');
  }

  return {
    config: best.config,
    screening: {
      policy: settings.partyPolicy,
      verified: false,
      candidates: draws,
      eligibleCandidates,
      trials,
      lead: best.config.lead,
      maxCandidates,
      maxDecisions,
      composition: best.composition
    }
  };
}
