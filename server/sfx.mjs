export const sfxPresets={whoosh:'ウーシュ',riser:'ライザー',impact:'インパクト',click:'クリック',chime:'チャイム'};
export function synthSound({preset='whoosh',duration=1,frequency=440,levelDb=-12,seed=1}={}){
 if(!Object.hasOwn(sfxPresets,preset))throw new Error('Unknown sound preset');
 for(const [key,v,lo,hi]of [['duration',duration,.1,8],['frequency',frequency,100,2000],['levelDb',levelDb,-60,0],['seed',seed,0,4294967295]])if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi||(key==='seed'&&!Number.isInteger(v)))throw new Error(`Invalid sound ${key}`);
 const rate=48000,samples=new Float32Array(Math.round(duration*rate));let random=seed||1,phase=0,low=0,peak=0;
 for(let i=0;i<samples.length;i++){
  random=(Math.imul(random,1664525)+1013904223)>>>0;const noise=random/2147483648-1,t=i/rate,p=i/(samples.length-1);low+=Math.min(.8,2*Math.PI*frequency/rate)*(noise-low);
  phase+=2*Math.PI*frequency*(preset==='riser'?.4+3*p:preset==='impact'?Math.exp(-9*p):1)/rate;
  let v=preset==='whoosh'?low*5*Math.sin(Math.PI*p)**2:preset==='riser'?(low*2+Math.sin(phase)*.25)*p**1.6:preset==='impact'?(Math.sin(phase)*.7+noise*.3)*Math.exp(-9*p):preset==='click'?noise*Math.exp(-60*p):(Math.sin(phase)+.35*Math.sin(phase*2.01)+.15*Math.sin(phase*3.98))*Math.exp(-4*p);
  v*=Math.min(1,t/.003,(duration-t)/.015);samples[i]=v;peak=Math.max(peak,Math.abs(v));
 }
 const gain=.9*10**(levelDb/20)/Math.max(peak,1e-6);for(let i=0;i<samples.length;i++)samples[i]*=gain;
 return {samples,rate};
}
export function soundWav(options){const {samples,rate}=synthSound(options),buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);const str=(at,s)=>[...s].forEach((c,i)=>view.setUint8(at+i,c.charCodeAt(0)));str(0,'RIFF');view.setUint32(4,36+samples.length*2,true);str(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,samples.length*2,true);samples.forEach((v,i)=>view.setInt16(44+i*2,Math.round(v*32767),true));return new Uint8Array(buffer);}
