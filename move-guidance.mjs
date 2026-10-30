// Read-only menu hints; legality and damage remain owned by the original engine.
export function typeHint(dex,move,source,target,weather=''){
 if(move.category==='Status')return{label:'Status move',tone:'neutral'};
 if(move.id==='struggle')return{label:'Typeless damage',tone:'neutral'};
 let type=move.id==='hiddenpower'?source.hpType:move.type;
 if(move.id==='weatherball')type={sunnyday:'Fire',raindance:'Water',sandstorm:'Rock',hail:'Ice'}[weather]??'Normal';
 if(!dex.getImmunity(type,target))return{label:'No effect',tone:'immune',type};
 if(move.damage||move.damageCallback)return{label:'Special damage rule',tone:'neutral',type};
 const multiplier=2**dex.getEffectiveness(type,target);
 return{label:multiplier>1?'Super effective':multiplier<1?'Not very effective':'Normal damage',tone:multiplier>1?'super':multiplier<1?'resisted':'neutral',multiplier,type};
}
export function moveGuidance(sim){
 const state=sim.state(),p=sim.battle.p1.active[0],target=sim.battle.p2.active[0],dex=sim.battle.dex;
 const locked=p.volatiles.choicelock?.move;let restriction='';
 if(p.volatiles.mustrecharge)restriction='Recharging: this Pokémon must rest this turn.';
 else if(p.hasItem('choiceband')&&locked)restriction=`Choice Band: locked into ${dex.moves.get(locked).name}. Switch out to choose another move.`;
 else if(p.volatiles.lockedmove)restriction='This multi-turn attack must continue until its effect ends.';
 else if(p.volatiles.twoturnmove)restriction='This two-turn move is in progress.';
 else if(p.volatiles.encore)restriction=`Encore: must repeat ${dex.moves.get(p.volatiles.encore.move).name} until Encore ends or this Pokémon switches out.`;
 else if(state.p[state.pa].struggle)restriction='No usable moves remain. Struggle is available.';
 if(restriction&&!state.canSwitch&&!p.volatiles.mustrecharge)restriction+=' Switching is currently blocked.';
 return{restriction,note:'Type matchup only; abilities and other battle effects can change the result.',moves:(state.p[state.pa].struggle?[{name:'Struggle',pp:1,disabled:false}]:state.p[state.pa].moves).map(m=>{const move=dex.moves.get(m.name),slot=p.moveSlots.find(s=>s.id===move.id);let reason=m.pp<=0?'No PP remaining':m.disabled?(slot?.disabledSource?`Unavailable: ${slot.disabledSource}`:'Unavailable due to a battle effect'):'';if(m.disabled&&locked&&p.hasItem('choiceband'))reason=`Choice Band locks you into ${dex.moves.get(locked).name}`;const shortReason=reason?(m.pp<=0?'No PP':locked&&p.hasItem('choiceband')?'Choice Band lock':slot?.disabledSource||'Unavailable'):'';return{name:m.name,shortReason,...typeHint(dex,move,p,target,sim.battle.field.weather),reason};})};
}
