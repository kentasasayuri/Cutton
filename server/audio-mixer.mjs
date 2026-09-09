export const trackDefaults={volumeDb:0,balance:0,mute:false,solo:false,lowDb:0,midDb:0,highDb:0};
const numeric=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
export function trackSettings(value={}){
 const t={...trackDefaults,...value};
 for(const k of ['volumeDb','lowDb','midDb','highDb','balance'])if(!numeric(t[k],k==='volumeDb'?-60:k==='balance'?-1:-12,k==='volumeDb'?12:k==='balance'?1:12))throw new Error(`Invalid mixer ${k}`);
 for(const k of ['mute','solo'])if(typeof t[k]!=='boolean')throw new Error(`Invalid mixer ${k}`);
 return Object.fromEntries(Object.keys(trackDefaults).map(k=>[k,t[k]]));
}
export function mixerSettings(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid audio mixer');
 const masterDb=value.masterDb??0;if(!numeric(masterDb,-60,12))throw new Error('Invalid masterDb');
 if(value.tracks!==undefined&&(!Array.isArray(value.tracks)||value.tracks.length!==8))throw new Error('Mixer needs 8 tracks');
 return {masterDb,tracks:Array.from({length:8},(_,i)=>trackSettings(value.tracks?.[i]))};
}
export const dbGain=db=>10**(db/20);
export function trackGain(mixer,lane){const t=mixer.tracks[lane];return t.mute||(mixer.tracks.some(t=>t.solo)&&!t.solo)?0:dbGain(t.volumeDb);}
export const balanceGains=balance=>[1-Math.max(0,balance),1+Math.min(0,balance)];
export function mixerFilters(mixer,lane){const t=mixer.tracks[lane],[l,r]=balanceGains(t.balance);return `aformat=channel_layouts=stereo,bass=g=${t.lowDb}:f=200:width_type=s:width=1,equalizer=f=1000:t=q:w=1:g=${t.midDb},treble=g=${t.highDb}:f=4000:width_type=s:width=1,pan=stereo|c0=${l}*c0|c1=${r}*c1,volume=${trackGain(mixer,lane)}`;}
export function mixerChanged(value){const m=mixerSettings(value);return m.masterDb!==0||m.tracks.some(t=>Object.keys(trackDefaults).some(k=>t[k]!==trackDefaults[k]));}
