import {normalizeCustomParty,buildCustomTeam,customFingerprint} from './custom-party.mjs';
// Browser/Node shared adapter. The imported battle engine and AI are unchanged.
export function legalActions(s){if(s.outcome)return[];const actions=[];if(!s.needSwitch){if(s.p[s.pa].struggle)actions.push({type:'move',idx:-1});else s.p[s.pa].moves.forEach((m,idx)=>{if(m.pp>0&&!m.disabled)actions.push({type:'move',idx});});}return[...actions,...s.switches.map(idx=>({type:'switch',idx}))];}
export function normalizeSettings(s,content){
 const opponent=content.opponents.find(p=>p.id===(s.opponent??'red-original'));if(!opponent)throw Error('Choose a listed opponent.');
 const date=s.date;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Choose a valid date.');
 const pool=s.pool??'natural';if(!['natural','primary','official','custom'].includes(pool))throw Error('Choose a listed player pool.');
 const mode=s.mode==='practice'?'practice':'daily';if(mode==='practice'&&(typeof s.practiceSeed!=='string'||!s.practiceSeed||s.practiceSeed.length>150))throw Error('A practice seed is required.');
 if(s.partyPolicy&&!['balanced-v1','balanced-v2','balanced-v3','random'].includes(s.partyPolicy))throw Error('Choose a listed party selection.');
 if(pool==='custom'&&s.partyPolicy&&s.partyPolicy!=='random')throw Error('Custom parties do not use random-party screening.');
 if(s.evaluationVersion&&s.evaluationVersion!=='v3.1')throw Error('Unsupported evaluation revision');
 return{opponent:opponent.id,date,pool,mode,...(pool==='custom'?{customParty:normalizeCustomParty(s.customParty,content)}:{}),...(s.partyPolicy==='balanced-v3'&&s.evaluationVersion?{evaluationVersion:s.evaluationVersion}:{}),...(['balanced-v1','balanced-v2','balanced-v3'].includes(s.partyPolicy)?{partyPolicy:s.partyPolicy}:{}),...(mode==='practice'?{practiceSeed:s.practiceSeed}:{})};
}
export function prepareConfig(engine,content,settings,lead=0,candidate=0){
 const s=normalizeSettings(settings,content),enemy=content.opponents.find(p=>p.id===s.opponent);let team;
 if(s.pool==='custom'&&s.partyPolicy)throw Error('Custom parties do not use random-party screening.');
 const baseRosterSeed=s.mode==='practice'?`${s.date}:practice:${s.practiceSeed}`:`${s.date}:natural-pool:v2`;
 const rosterSeed=baseRosterSeed+(s.partyPolicy?`:${s.partyPolicy}:${s.opponent}:${candidate}`:'');
 if(s.pool==='official'&&s.partyPolicy)throw Error('Opponent-balanced parties use the expanded pool.');
 if(s.pool==='custom'){team=buildCustomTeam(s.customParty,content);}
 else if(s.pool==='official'){
  team=structuredClone(s.mode==='practice'?content.originalPool:engine.roster(s.date));if(s.mode==='practice'){const random=engine.rng(engine.hash(rosterSeed));for(let i=team.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[team[i],team[j]]=[team[j],team[i]];}team=team.slice(0,6);}
 }else{
  const species=structuredClone(content.species),random=engine.rng(engine.hash(rosterSeed));for(let i=species.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[species[i],species[j]]=[species[j],species[i]];}
  // Draw species first. Variant count never changes species odds.
  team=species.slice(0,6).map(sp=>s.pool==='primary'?sp.variants.find(v=>v.id===sp.primaryId):sp.variants[Math.floor(random()*sp.variants.length)]);
 }
 team=team.map((p,i)=>({...p,slotId:`player:${i}`}));
 if(!Number.isInteger(lead)||lead<0||lead>=6)throw Error('Choose a player lead.');
 const originalDaily=s.opponent==='red-original'&&s.pool==='official'&&s.mode==='daily'&&!s.partyPolicy;
 const seed=originalDaily?s.date:`${s.date}:local-v2:${s.opponent}:${s.pool}:${s.mode}${['balanced-v1','balanced-v2','balanced-v3'].includes(s.partyPolicy)?':'+s.partyPolicy:''}${s.mode==='practice'?':'+s.practiceSeed:''}`;
 const config={team,champion:'red',lead,seed:s.pool==='custom'?seed+':team-'+customFingerprint(s.customParty):seed,bundle:content.bundle,contentHash:content.hash,rulesVersion:2,settings:s};if(!enemy.original)config.opponent=structuredClone(enemy);
 return config;
}
export function createBattle(engine,config){
 if(!Array.isArray(config.team)||config.team.length!==6||new Set(config.team.map(p=>p.name)).size!==6)throw Error('Player party must have six distinct species.');
 const sim=new engine.Sim({...config,champion:config.opponent?'red':config.champion,actions:undefined});
 if(config.rulesVersion===2)for(const [i,p]of sim.original[0].entries()){p.gender=config.team[i].gender??p.gender;p.set.gender=p.gender;}
 if(config.opponent){
  const enemy=structuredClone(config.opponent),seed=sim.battle.prngSeed,player=sim.battle.p1.pokemon.map(p=>p.set);sim.battle.destroy();sim.champion=enemy;sim.templates=[structuredClone(config.team),enemy.team];
  const names=enemy.team.map((p,i)=>enemy.team.filter(x=>x.name===p.name).length>1?`${p.name} ${i+1}`:p.name),keys=['hp','atk','def','spa','spd','spe'];
  sim.battle=new engine.Battle({formatid:'gen3customgame',seed,p1:{name:'Player',team:player},p2:{name:enemy.upper,team:enemy.team.map((p,i)=>({name:names[i],species:p.name,level:100,gender:p.gender??'M',ability:p.ability,item:p.item,nature:p.nature??'Serious',moves:p.moves.map(m=>m.name),evs:Object.fromEntries(keys.map((k,j)=>[k,p.evs[j]])),ivs:Object.fromEntries(keys.map((k,j)=>[k,p.ivs[j]]))}))}});
  sim.original=[config.team.map(p=>sim.battle.p1.pokemon.find(x=>x.name===p.name)),names.map(n=>sim.battle.p2.pokemon.find(x=>x.name===n))];
  if(enemy.statModel==='canonical-v1'){for(const[i,p]of sim.original[1].entries())if(enemy.team[i].statModel==='canonical-v1')for(const slots of[p.moveSlots,p.baseMoveSlots])for(const m of slots)m.pp=m.maxpp=sim.battle.dex.moves.get(m.id).pp;sim.battle.makeRequest('move');}
  sim.events=[{text:enemy.opening,kind:'msg',snap:structuredClone(sim.state())}];
 }
 return sim;
}
export function applyAction(sim,a){if(!a||!legalActions(sim.state()).some(x=>x.type===a.type&&x.idx===a.idx))throw Error('That action is not currently available.');const r=sim.choose({type:a.type,idx:a.idx});if(r.error)throw Error(r.error);return r;}
export function restoreJournal(engine,content,journal){
 if(journal?.version!==2||journal.config?.bundle!==content.bundle||!Array.isArray(journal.actions)||journal.actions.length>3000)throw Error('This saved battle is incompatible with the current engine.');
 const sim=createBattle(engine,journal.config);try{for(const a of journal.actions)applyAction(sim,a);if(journal.state&&JSON.stringify(sim.state())!==JSON.stringify(journal.state))throw Error('Saved battle replay did not match.');return sim;}catch(e){sim.destroy();throw e;}
}
export function journalKey(s){return`dailyred-local:v2:${s.opponent}:${s.pool}:${s.mode}:${s.date}${['balanced-v1','balanced-v2','balanced-v3'].includes(s.partyPolicy)?':'+s.partyPolicy:''}${s.mode==='practice'?':'+s.practiceSeed:''}${s.partyPolicy==='balanced-v3'&&s.evaluationVersion?':eval-'+s.evaluationVersion:''}${s.pool==='custom'?':team-'+customFingerprint(s.customParty):''}`;}
