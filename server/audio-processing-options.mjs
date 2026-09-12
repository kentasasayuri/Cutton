// Serializable controls shared by the inspector and the offline renderer.
export const PROCESS_DEFAULTS={pitch:0,formant:true,denoise:0,noiseFloor:-50,gate:false,gateDb:-45,gateRelease:180,deess:0,highpass:0,warmth:0,presence:0,compress:false,threshold:-20,ratio:3,makeup:0,room:0,delay:0,delayMs:160,output:0};
export const PROCESS_PRESETS={clean:{name:'クリアなナレーション',values:{denoise:10,highpass:80,deess:.25,compress:true,threshold:-20,ratio:3,makeup:2,presence:2}},studio:{name:'スタジオ・ボイス',values:{denoise:12,highpass:75,gate:true,gateDb:-48,deess:.35,warmth:2,presence:3,compress:true,threshold:-22,ratio:3.5,makeup:3,room:.08}},warm:{name:'温かいラジオ音声',values:{highpass:65,warmth:5,presence:1,compress:true,ratio:4,makeup:3}},room:{name:'小さなルーム',values:{room:.25}},telephone:{name:'電話・無線',values:{highpass:400,presence:6,compress:true,ratio:6}},reset:{name:'処理をリセット',values:{}}};
export function processOptions(args={}){
 const result={...PROCESS_DEFAULTS};for(const [key,min,max] of [['pitch',-12,12],['denoise',0,30],['noiseFloor',-80,-20],['gateDb',-70,-10],['gateRelease',20,1000],['deess',0,1],['highpass',0,1000],['warmth',-12,12],['presence',-12,12],['threshold',-50,0],['ratio',1,12],['makeup',0,12],['room',0,.6],['delay',0,.6],['delayMs',20,1000],['output',-24,12]]){const v=args[key]??result[key];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`${key}: ${min}〜${max}で指定してください。`);result[key]=v;}
 for(const key of ['formant','gate','compress']){result[key]=args[key]??result[key];if(typeof result[key]!=='boolean')throw Error(`${key} は真偽値です。`);}return result;
}
export function processingFilters(args){
 const o=processOptions(args),f=['aresample=48000'];
 if(o.denoise)f.push(`afftdn=nr=${o.denoise}:nf=${o.noiseFloor}:tn=0`);
 if(o.highpass)f.push(`highpass=f=${o.highpass}`);
 if(o.gate)f.push(`agate=threshold=${10**(o.gateDb/20)}:ratio=3:attack=8:release=${o.gateRelease}`);
 if(o.pitch)f.push(`rubberband=pitch=${2**(o.pitch/12)}:formant=${o.formant?'preserved':'shifted'}:pitchq=quality`);
 if(o.warmth)f.push(`equalizer=f=180:t=q:w=.7:g=${o.warmth}`);
 if(o.presence)f.push(`equalizer=f=3200:t=q:w=.8:g=${o.presence}`);
 if(o.deess)f.push(`deesser=i=${o.deess}:m=.5:f=.5`);
 if(o.compress)f.push(`acompressor=threshold=${10**(o.threshold/20)}:ratio=${o.ratio}:attack=10:release=180:makeup=${10**(o.makeup/20)}`);
 // Short, quiet reflections keep the direct voice prominent. Trim the tail to the clip.
 if(o.room)f.push(`aecho=1:1:19|37|61|89:${[.6,.4,.28,.18].map(v=>v*o.room).join('|')}`);
 if(o.delay)f.push(`aecho=1:1:${o.delayMs}:${o.delay}`);
 f.push(`volume=${o.output}dB`,'alimiter=limit=.97:level=0:latency=1');return f.join(',');
}
