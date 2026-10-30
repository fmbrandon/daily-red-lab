// Values copied from the supplied Daily Red frontend's event queue.
export const TEXT_SPEEDS={normal:{event:900,quiet:300},fast:{event:320,quiet:90}};
export function eventDelay(kind,speed='normal'){if(kind==='turn')return 0;return TEXT_SPEEDS[speed==='fast'?'fast':'normal'][kind==='quiet'?'quiet':'event'];}
export function frameState(base,snap){if(!snap)return structuredClone(base);return{...structuredClone(base),...snap,p:base.p.map((p,i)=>({...structuredClone(p),...snap.p[i]})),r:base.r.map((p,i)=>({...structuredClone(p),...snap.r[i]})),outcome:null,needSwitch:false};}
export async function playEvents(events,{speed=()=> 'normal',onEvent,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),outcome=false}={}){for(const event of events){onEvent(event);const ms=eventDelay(event.kind,speed());if(ms)await wait(ms);}if(outcome)await wait(1200);}
