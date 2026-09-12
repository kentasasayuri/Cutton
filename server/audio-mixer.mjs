export const trackDefaults={volumeDb:0,balance:0,mute:false,solo:false,lowDb:0,midDb:0,highDb:0,lowHz:200,midHz:1000,highHz:4000,midQ:1,highpass:false,highpassHz:80,lowpass:false,lowpassHz:16000,compressor:false,thresholdDb:-18,ratio:3,kneeDb:6,attackMs:10,releaseMs:180,makeupDb:0};
const numeric=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
export function trackSettings(value={}){
 const t={...trackDefaults,...value};
 for(const k of ['volumeDb','lowDb','midDb','highDb','balance'])if(!numeric(t[k],k==='volumeDb'?-60:k==='balance'?-1:-12,k==='volumeDb'?12:k==='balance'?1:12))throw new Error(`Invalid mixer ${k}`);
 for(const [k,min,max] of [['lowHz',20,2000],['midHz',100,16000],['highHz',1000,20000],['midQ',.1,12],['highpassHz',20,2000],['lowpassHz',1000,20000]])if(!numeric(t[k],min,max))throw new Error(`Invalid mixer ${k}`);
 for(const [k,min,max] of [['thresholdDb',-60,0],['ratio',1,20],['kneeDb',0,18],['attackMs',.1,200],['releaseMs',10,1000],['makeupDb',0,12]])if(!numeric(t[k],min,max))throw Error(`Invalid mixer ${k}`);
 for(const k of ['mute','solo','highpass','lowpass','compressor'])if(typeof t[k]!=='boolean')throw new Error(`Invalid mixer ${k}`);
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
export function mixerFilters(mixer,lane){const t=trackSettings(mixer.tracks[lane]),[l,r]=balanceGains(t.balance);return `aformat=channel_layouts=stereo,${t.highpass?`highpass=f=${t.highpassHz}:t=q:w=0.70710678,`:''}${t.lowpass?`lowpass=f=${t.lowpassHz}:t=q:w=0.70710678,`:''}bass=g=${t.lowDb}:f=${t.lowHz}:width_type=s:width=1,equalizer=f=${t.midHz}:t=q:w=${t.midQ}:g=${t.midDb},treble=g=${t.highDb}:f=${t.highHz}:width_type=s:width=1,${t.compressor?`acompressor=threshold=${Math.max(.000976,dbGain(t.thresholdDb))}:ratio=${t.ratio}:knee=${dbGain(t.kneeDb)}:attack=${t.attackMs}:release=${t.releaseMs}:makeup=${dbGain(t.makeupDb)}:detection=peak,`:''}pan=stereo|c0=${l}*c0|c1=${r}*c1,volume=${trackGain(mixer,lane)}`;}
export const AUDIO_PRESETS={dialogue:{name:'会話を整える',settings:{highpass:true,highpassHz:80,lowDb:-2,midDb:2,midHz:2500,midQ:.8,compressor:true,thresholdDb:-20,ratio:3,kneeDb:6,attackMs:10,releaseMs:180,makeupDb:2}},gentle:{name:'穏やかな音圧',settings:{compressor:true,thresholdDb:-16,ratio:2,kneeDb:8,attackMs:30,releaseMs:250,makeupDb:1}},punch:{name:'効果音の強弱を抑える',settings:{compressor:true,thresholdDb:-12,ratio:5,kneeDb:3,attackMs:3,releaseMs:100,makeupDb:0}},flat:{name:'EQ・圧縮をリセット',settings:Object.fromEntries(Object.entries(trackDefaults).filter(([k])=>!['volumeDb','balance','mute','solo'].includes(k)))}};
export function mixerChanged(value){const m=mixerSettings(value);return m.masterDb!==0||m.tracks.some(t=>Object.keys(trackDefaults).some(k=>t[k]!==trackDefaults[k]));}
