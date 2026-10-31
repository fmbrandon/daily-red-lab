// Bag-style navigation uses the existing settings controls and battle generation path.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountSelectionMenus({content,image,attachFallbacks,onPocket=()=>{}}){
 const $=id=>document.getElementById(id), setup=document.querySelector('#options .setup'), fields=setup.querySelector('.fields');
 const pocket=document.createElement('div');pocket.className='bag-menu';
 pocket.innerHTML=`<aside class="bag-sidebar"><div class="bag-illustration" aria-hidden="true"><i></i></div><div class="bag-caption"><span id="bag-path">BATTLE BAG</span></div><p id="bag-help">Choose a pocket to prepare your next battle.</p></aside><div class="bag-window"><button id="bag-back" type="button" hidden>◀ BACK</button><div class="bag-pockets" role="tablist" aria-label="Battle menu" aria-orientation="vertical"><button id="pocket-opponents" role="tab" aria-controls="bag-opponents" aria-selected="false" tabindex="0">CURRENT OPPONENT</button><button id="pocket-party" role="tab" aria-controls="bag-party" aria-selected="false" tabindex="-1">POKéMON</button><button id="pocket-items" role="tab" aria-controls="bag-items" aria-selected="false" tabindex="-1">ITEMS</button><button id="pocket-rules" role="tab" aria-controls="bag-rules" aria-selected="false" tabindex="-1">OPTION</button></div><div id="bag-commands"><button id="menu-dex" type="button">POKéDEX</button><button id="bag-exit" type="button">EXIT</button></div><div id="bag-opponents" role="tabpanel" aria-labelledby="pocket-opponents" hidden><p class="menu-help">Choose a trainer.</p><div class="trainer-tree"></div></div><div id="bag-party" role="tabpanel" aria-labelledby="pocket-party" hidden><p class="menu-help">Your current party.</p><div id="pool-options" class="pool-options"></div><button id="open-dex" class="dex-link" type="button">▸ OPEN POKéDEX</button><div id="party-fields" class="fields"></div></div><div id="bag-items" role="tabpanel" aria-labelledby="pocket-items" hidden><p class="menu-help">No items yet.</p></div><div id="bag-rules" role="tabpanel" aria-labelledby="pocket-rules" hidden><p class="menu-help">Set the date and challenge mode.</p><div id="rule-fields" class="fields"></div></div></div><p id="bag-selection" class="bag-selection" aria-live="polite"></p>`;
 const dialog=document.createElement('dialog');dialog.id='pocket-dialog';dialog.setAttribute('aria-label','Battle pockets');dialog.innerHTML='<button id="pocket-close" type="button">CLOSE ✕</button>';dialog.append(pocket);document.body.append(dialog);
 const titlebar=document.createElement('div');titlebar.className='pocket-titlebar';
 titlebar.append($('bag-back'),$('bag-path'),$('pocket-close'));dialog.prepend(titlebar);
 $('bag-help').hidden=true;dialog.append($('bag-help'));pocket.querySelector('.bag-sidebar').remove();
 pocket.querySelector('.bag-pockets').prepend($('menu-dex'));
 for(const id of ['trainer','opponent','pool'])$(id).parentElement.hidden=true;
 $('party-fields').append($('party-policy').parentElement);
 $('bag-rules').prepend($('pool-options'),$('party-fields'));
 $('open-dex').hidden=true;$('bag-rules').append($('open-dex'));$('bag-party').replaceChildren();
 for(const id of ['date','mode'])$('rule-fields').append($(id).parentElement);
 fields.hidden=true;
 const tabs=[...pocket.querySelectorAll('[role="tab"]')];
 const help={items:'No items yet.',opponents:'Your opponent’s current party and matchup hints.',party:'Your current party. Choose a lead or switch during battle.',rules:'Choose your opponent, pool, party rules, date, and mode.'};
 let page=null;
 function activate(tab){page=tab?.id.replace('pocket-','')??null;for(const t of tabs){const active=t===tab;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;$(t.getAttribute('aria-controls')).hidden=!active;}$('pokedex').hidden=true;pocket.querySelector('.bag-pockets').hidden=Boolean(tab);$('bag-commands').hidden=Boolean(tab);$('bag-back').hidden=!tab;dialog.dataset.expanded=String(Boolean(tab)&&page!=='items');$('bag-path').textContent=tab?tab.textContent:'MENU';$('bag-help').textContent=tab?help[page]:'Choose a pocket.';onPocket(page);}
 function open(name){if(!dialog.open)dialog.showModal();activate(name?$('pocket-'+name):null);(name?$('bag-back'):$('menu-dex')).focus();}
 function close(){if(dialog.open)dialog.close();page=null;onPocket(null);}
 tabs.forEach(t=>t.onclick=()=>open(t.id.replace('pocket-','')));
 pocket.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key)||pocket.querySelector('.bag-pockets').hidden)return;const buttons=[...pocket.querySelectorAll('.bag-pockets button,#bag-commands button')];const i=buttons.indexOf(document.activeElement);if(i<0)return;e.preventDefault();e.stopPropagation();const n=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[n].focus();},true);
 $('bag-back').onclick=()=>{const previous=page==='dex'?$('menu-dex'):tabs.find(t=>t.id==='pocket-'+page)||tabs[0];activate(null);previous.tabIndex=0;previous.focus();};
 $('bag-exit').onclick=close;$('pocket-close').onclick=close;
 dialog.addEventListener('cancel',e=>{e.preventDefault();page?$('bag-back').click():close();});
 $('options').querySelector('summary').onclick=e=>{e.preventDefault();open();};
 // Keep all detailed information inside the closed-by-default pockets.
 $('bag-rules').prepend(pocket.querySelector('.trainer-tree'));
 $('bag-rules').append($('hero-description'),$('bag-selection'),$('challenge-note'),$('generate'));
 const oldPreview=$('enemy-preview').closest('details'),previewEnemy=document.createElement('section');previewEnemy.className='enemy-details enemy-roster';previewEnemy.setAttribute('aria-label','Opposing party');previewEnemy.append($('enemy-preview'));oldPreview.remove();
 const previewInfo=document.createElement('div');previewInfo.className='preview-opponent-info';previewInfo.append($('opponent-title').parentElement,previewEnemy,$('preview-matchups'));$('bag-opponents').replaceChildren(previewInfo);
 $('preview-matchups').open=true;
 const oldLive=$('enemy-party').closest('details'),liveEnemy=document.createElement('section');liveEnemy.className='enemy-details enemy-roster';const liveHeading=document.createElement('h2');liveHeading.id='enemy-summary';liveHeading.textContent='Opposing party';liveEnemy.append(liveHeading,$('enemy-party'));oldLive.remove();
 const liveInfo=document.createElement('div');liveInfo.className='live-opponent-info';$('battle-matchups').open=true;liveInfo.append(liveEnemy,$('battle-matchups'));$('bag-opponents').append(liveInfo);
 $('bag-rules').append(document.querySelector('.text-speed'),document.querySelector('.setup-actions'));liveInfo.append(document.querySelector('.log-panel'));
 $('bag-rules').append(document.querySelector('.lead-strip'),$('party-verification'));$('bag-party').append($('preview'),$('switch-panel'));$('preview').append($('team'));
 $('profile-size').hidden=true;
 // Options uses the same compact framed rows as the other pocket pages.
 const rules=$('bag-rules');
 function optionGroup(title,id,nodes){const section=document.createElement('fieldset');section.className='option-group';section.id=id;const legend=document.createElement('legend');legend.textContent=title;section.append(legend,...nodes);rules.append(section);return section;}
 const opponentControls=['trainer','opponent'].map(id=>{const label=$(id).parentElement;label.hidden=false;return label;});
 const poolLabel=$('pool').parentElement;poolLabel.hidden=false;
 const controls=document.createElement('div');controls.className='option-sections';rules.append(controls);
 controls.append(optionGroup('Opponent','option-opponent',opponentControls),optionGroup('Party','option-party',[poolLabel,$('party-fields'),$('challenge-note')]),optionGroup('Challenge','option-challenge',[$('rule-fields'),$('generate')]),optionGroup('Text speed','option-speed',[document.querySelector('.text-speed')]),optionGroup('Battle','option-battle',[document.querySelector('.setup-actions')]));
 for(const node of [...rules.children])if(node!==controls)node.hidden=true;

 const tree=pocket.querySelector('.trainer-tree');
 for(const trainer of [...new Set(content.opponents.map(p=>p.trainer))]){
  const profiles=content.opponents.filter(p=>p.trainer===trainer),d=document.createElement('details');d.dataset.trainer=trainer;
  d.innerHTML=`<summary>${esc(trainer)}<span>${profiles.length} ${profiles.length===1?'challenge':'challenges'}</span></summary><div class="trainer-variants">${profiles.map(p=>`<button type="button" data-profile="${esc(p.id)}" aria-pressed="false"><span>${esc(p.label)}</span><small>${p.team.length} PKMN · ${esc(p.sourceGame||p.region)}</small></button>`).join('')}</div>`;tree.append(d);
 }
 tree.addEventListener('click',e=>{const b=e.target.closest('[data-profile]');if(!b||$('opponent').disabled)return;const p=content.opponents.find(p=>p.id===b.dataset.profile);$('trainer').value=p.trainer; // Repopulate variants through the existing handler before selecting the requested variant.
 const select=$('opponent');select.replaceChildren(...content.opponents.filter(q=>q.trainer===p.trainer).map(q=>new Option(q.label,q.id)));select.value=p.id;select.dispatchEvent(new Event('change'));sync();});
 const labels={natural:['NATIONAL','214 species · all builds'],primary:['PREFERRED','214 species · preferred builds'],official:['ORIGINAL','30 species · Daily Red builds']};
 $('pool-options').innerHTML=[...$('pool').options].map(o=>`<button type="button" data-pool="${o.value}" aria-pressed="false"><strong>${labels[o.value][0]}</strong><small>${labels[o.value][1]}</small></button>`).join('');
 $('pool-options').onclick=e=>{const b=e.target.closest('[data-pool]');if(!b||$('pool').disabled)return;$('pool').value=b.dataset.pool;$('pool').dispatchEvent(new Event('change'));sync();renderDex();};
 const dex=$('pokedex');pocket.querySelector('.bag-window').append(dex);dex.innerHTML=`<div class="dex-heading"><h2>POKéDEX</h2><span id="dex-count"></span><button id="close-dex" type="button">CLOSE ✕</button></div><div class="dex-tools"><label>Search<input id="dex-search" type="search" placeholder="Name or No." autocomplete="off"></label><label>Region<select id="dex-region"><option value="all">All regions</option><option value="1">Kanto</option><option value="2">Johto</option><option value="3">Hoenn</option></select></label><label>Type<select id="dex-type"><option value="all">All types</option>${[...new Set(content.species.flatMap(s=>s.variants[0].types))].sort().map(t=>`<option>${esc(t)}</option>`).join('')}</select></label></div><div class="dex-layout"><div id="dex-list" class="dex-list" role="group" aria-label="Pokémon list"></div><article id="dex-entry" class="dex-entry" aria-label="Pokémon entry"></article></div><p class="dex-foot">Browse the current pool. Parties are drawn at random from these Pokémon.</p>`;
 let selectedDex=null,selectedBuild=0,visible=[];
 function poolEntries(){if($('pool').value==='official')return content.originalPool.map(p=>({name:p.name,dexno:p.dexno,variants:[p]}));return content.species.map(s=>({...s,variants:$('pool').value==='primary'?[s.variants.find(v=>v.id===s.primaryId)||s.variants[0]]:s.variants}));}
 function renderDex(){if(dex.hidden)return;const q=$('dex-search').value.trim().toLowerCase(),region=$('dex-region').value,type=$('dex-type').value;
  visible=poolEntries().filter(s=>(!q||s.name.toLowerCase().includes(q)||String(s.dexno).padStart(3,'0').includes(q))&&(region==='all'||(s.dexno<=151?1:s.dexno<=251?2:3)===Number(region))&&(type==='all'||s.variants[0].types.includes(type))).sort((a,b)=>a.dexno-b.dexno);
  if(!visible.some(s=>s.dexno===selectedDex)){selectedDex=visible[0]?.dexno;selectedBuild=0;}
  $('dex-count').textContent=`${visible.length} / ${poolEntries().length} PKMN`;
  $('dex-list').innerHTML=visible.map(s=>`<button type="button" data-dex="${s.dexno}" aria-pressed="${s.dexno===selectedDex}"><span>No.${String(s.dexno).padStart(3,'0')}</span> ${esc(s.name)}</button>`).join('')||'<p>No Pokémon found.</p>';renderEntry();
 }
 function renderEntry(){const s=visible.find(s=>s.dexno===selectedDex),entry=$('dex-entry');if(!s){entry.innerHTML='<p>Try another name, region, or type.</p>';return;}if(selectedBuild>=s.variants.length)selectedBuild=0;const p=s.variants[selectedBuild];entry.innerHTML=`<div class="dex-portrait">${image(p)}<div><small>No.${String(s.dexno).padStart(3,'0')}</small><h3>${esc(s.name)}</h3><p>${esc(p.types.join(' / '))} · Lv.100</p></div></div><label class="dex-build">Build<select id="dex-build">${s.variants.map((v,i)=>`<option value="${i}" ${i===selectedBuild?'selected':''}>${esc(v.variant||'Daily Red')}${s.variants.length>1?' · '+(i+1):''}</option>`).join('')}</select></label><dl class="dex-equipment"><div><dt>ABILITY</dt><dd>${esc(p.ability)}</dd></div><div><dt>ITEM</dt><dd>${esc(p.item||'None')}</dd></div><div><dt>NATURE</dt><dd>${esc(p.nature)}</dd></div></dl><div class="dex-stats">${Object.entries({hp:p.max,...p.stats}).map(([k,v])=>`<div><span>${esc({hp:'HP',atk:'ATTACK',def:'DEFENSE',spa:'SP. ATK',spd:'SP. DEF',spe:'SPEED'}[k])}</span><b>${v}</b></div>`).join('')}</div><h4>MOVES</h4><ul class="dex-moves">${p.moves.map(m=>`<li><strong>${esc(m.name)}</strong><small>${esc(m.type)} · ${esc(m.category)} · ${m.max??m.pp} PP</small></li>`).join('')}</ul>`;$('dex-build').onchange=e=>{selectedBuild=Number(e.target.value);renderEntry();};attachFallbacks();}
 $('dex-list').onkeydown=e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;const rows=[...$('dex-list').querySelectorAll('button')];if(!rows.length)return;e.preventDefault();const i=rows.indexOf(e.target),n=e.key==='Home'?0:e.key==='End'?rows.length-1:(Math.max(0,i)+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length;rows[n].focus();rows[n].click();};
 $('dex-list').onclick=e=>{const b=e.target.closest('[data-dex]');if(!b)return;selectedDex=Number(b.dataset.dex);selectedBuild=0;for(const row of $('dex-list').querySelectorAll('button'))row.setAttribute('aria-pressed',String(row===b));renderEntry();};
 for(const id of ['dex-search','dex-region','dex-type'])$(id).addEventListener(id==='dex-search'?'input':'change',renderDex);
 $('open-dex').onclick=()=>{if(!dialog.open)dialog.showModal();activate(null);page='dex';pocket.querySelector('.bag-pockets').hidden=true;$('bag-commands').hidden=true;$('bag-back').hidden=false;dialog.dataset.expanded='true';$('bag-path').textContent='POKéDEX';$('bag-help').textContent='Browse the Pokémon in the selected pool.';dex.hidden=false;renderDex();$('dex-search').focus();};
 $('menu-dex').onclick=()=>{$('open-dex').click();};
 $('close-dex').onclick=()=>{activate(null);$('menu-dex').focus();};
 function sync(){const current=content.opponents.find(p=>p.id===$('opponent').value);for(const b of tree.querySelectorAll('button')){b.disabled=$('opponent').disabled;b.setAttribute('aria-pressed',String(b.dataset.profile===current?.id));}for(const d of tree.querySelectorAll('details'))if(d.dataset.trainer===current?.trainer)d.open=true;for(const b of $('pool-options').querySelectorAll('button')){b.disabled=$('pool').disabled;b.setAttribute('aria-pressed',String(b.dataset.pool===$('pool').value));}$('bag-selection').textContent=`${current?.trainer||''} / ${current?.label||''} · ${labels[$('pool').value][0]}`;}
 for(const id of ['trainer','opponent','pool']){$(id).addEventListener('change',sync);new MutationObserver(sync).observe($(id),{attributes:true,attributeFilter:['disabled']});}sync();
 return {open,close,isOpen:()=>dialog.open};
}
