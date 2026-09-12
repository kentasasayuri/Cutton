import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {FFMPEG} from './media.mjs';
import {requireItem,numberValue} from './util.mjs';
const exec=promisify(execFile),hz=50;
export function correlateEnvelopes(a,b,{minLag=-1500,maxLag=1500}={}){
 const required=Math.max(100,Math.floor(Math.min(a.length,b.length)*.5)),scores=[];
 for(let lag=Math.ceil(minLag);lag<=Math.floor(maxLag);lag++){
  const lo=Math.max(0,lag),hi=Math.min(a.length,b.length+lag),n=hi-lo;if(n<required)continue;
  let x=0,y=0,xx=0,yy=0,xy=0;for(let i=lo;i<hi;i++){const p=a[i],q=b[i-lag];x+=p;y+=q;xx+=p*p;yy+=q*q;xy+=p*q;}
  const vx=xx-x*x/n,vy=yy-y*y/n;if(vx<1e-8||vy<1e-8)continue;const score=(xy-x*y/n)/Math.sqrt(vx*vy);scores.push({lag,score,overlap:n/hz});
 }
 scores.sort((a,b)=>b.score-a.score);const best=scores[0];if(!best)throw Error('変化のある音声が2秒以上必要です。');const alternative=scores.find(v=>Math.abs(v.lag-best.lag)>5);const margin=best.score-(alternative?.score??0);
 return {...best,seconds:best.lag/hz,margin,reliable:best.score>=.65&&margin>=.025};
}
async function envelope(s,c){
 const asset=requireItem(s.assets,c.assetId,'素材');if(!asset.hasAudio&&asset.kind!=='audio')throw Error('両方の素材に音声が必要です。');if((c.speed||1)!==1)throw Error('音声による同期は再生速度1倍で行ってください。');
 const {stdout}=await exec(FFMPEG,['-v','error','-nostdin','-threads','1','-ss',String(c.in),'-i',asset.path,'-t',String(Math.min(c.duration,60)),'-map','0:a:0','-vn','-ac','1','-ar','8000','-f','s16le','pipe:1'],{encoding:'buffer',maxBuffer:1024*1024*2,timeout:120000,windowsHide:true});
 const values=[];for(let i=0;i+320<=stdout.length;i+=320){let sum=0;for(let j=0;j<320;j+=2){const v=stdout.readInt16LE(i+j)/32768;sum+=v*v;}values.push(Math.sqrt(sum/160));}return values;
}
export async function analyzeAudioSync(s,{referenceId,targetId,maxShift=10}){
 numberValue(maxShift,'探索幅',{min:.1,max:30});if(referenceId===targetId)throw Error('別の2クリップを選んでください。');const ref=requireItem(s.clips,referenceId,'基準'),target=requireItem(s.clips,targetId,'同期対象');
 // Sequential decoding keeps CPU/RAM bounded on low-spec PCs.
 const a=await envelope(s,ref),b=await envelope(s,target),delta=target.start-ref.start;
 const result=correlateEnvelopes(a,b,{minLag:(delta-maxShift)*hz,maxLag:(delta+maxShift)*hz}),start=Math.round((ref.start+result.seconds)*s.fps)/s.fps;
 return {...result,start,offset:start-target.start,referenceId,targetId,projectId:s.id,updatedAt:s.updatedAt,reliable:result.reliable&&start>=0,note:'各クリップの先頭60秒までを20ms単位で比較し、配置をフレームに丸めます。共通音声がない場合は手動で合わせてください。'};
}
