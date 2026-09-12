import {uid,requireItem,numberValue,choice} from './util.mjs';
import {clipControls} from './clip-effects.mjs';
const end=c=>c.start+c.duration, lane=c=>c.lane||0, near=(a,b)=>Math.abs(a-b)<1e-6;
const quant=(s,t)=>Math.round(t*s.fps)/s.fps;
const num=(v,label,min=-86400,max=86400)=>numberValue(v,label,{min,max});
const sourceStep=(s,c,t)=>s.assets.find(a=>a.id===c.assetId)?.kind==='image'?0:t*(c.speed||1);
export function clipSlice(s,c,lo,hi){const result={...c,start:lo,duration:hi-lo,in:c.in+sourceStep(s,c,lo-c.start),fadeIn:near(lo,c.start)?Math.min(c.fadeIn||0,hi-lo):0,fadeOut:near(hi,end(c))?Math.min(c.fadeOut||0,hi-lo):0};return result;}
function neighbours(s,c){const row=s.clips.filter(x=>x.track===c.track&&lane(x)===lane(c)).sort((a,b)=>a.start-b.start),i=row.findIndex(x=>x.id===c.id);return [row[i-1],row[i+1]];}
export function trimEdit(s,{id,mode='roll',edge='out',frames=1}){
 const c=requireItem(s.clips,id,'クリップ'),d=num(frames,'フレーム数',-100000,100000)/s.fps; if(!Number.isInteger(frames)||!frames)throw Error('0以外の整数フレームを指定してください。');
 choice(mode,['roll','ripple','slide','slip'],'トリム');choice(edge,['in','out'],'編集点');const [prev,next]=neighbours(s,c),at=edge==='out'?end(c):c.start;
 if(mode==='slip')c.in+=sourceStep(s,c,d);
 if(mode==='roll'){
  const left=edge==='out'?c:prev,right=edge==='out'?next:c;if(!left||!right||!near(end(left),right.start))throw Error('ロールには隣り合う2つのクリップが必要です。');
  left.duration+=d;right.start+=d;right.in+=sourceStep(s,right,d);right.duration-=d;
 }
 if(mode==='slide'){
  if(!prev||!next||!near(end(prev),c.start)||!near(end(c),next.start))throw Error('スライドには前後に隙間のないクリップが必要です。');
  prev.duration+=d;c.start+=d;next.start+=d;next.in+=sourceStep(s,next,d);next.duration-=d;
 }
 if(mode==='ripple'){
  // Track-local trim is deliberately explicit in the UI. Global removal uses cutRanges.
  if(edge==='out'){c.duration+=d;for(const x of s.clips)if(x.id!==c.id&&x.track===c.track&&lane(x)===lane(c)&&x.start>=at-1e-6)x.start+=d;}
  else{c.in+=sourceStep(s,c,d);c.duration-=d;for(const x of s.clips)if(x.id!==c.id&&x.track===c.track&&lane(x)===lane(c)&&x.start>=end(c)+d-1e-6)x.start-=d;}
 }
 for(const x of s.clips){if(x.duration<1/s.fps-1e-6)throw Error('1フレーム以上残してください。');x.fadeIn=Math.min(x.fadeIn||0,x.duration);x.fadeOut=Math.min(x.fadeOut||0,x.duration);}
 return {id,mode,frames};
}
export function placeClip(s,args,makeClip){
 const mode=choice(args.mode,['insert','overwrite','top'],'配置方法','top'),start=quant(s,num(args.start??0,'配置時刻',0)),track=choice(args.track,['video','audio'],'トラック','video'),target=clipControls({lane:args.lane}).lane;
 // Validate source handles before touching the timeline. Collision is handled by the operation.
 const clip=makeClip({...s,clips:[]},{...args,start,track,lane:target});const stop=end(clip);
 if(mode==='insert'){
  s.clips=s.clips.flatMap(c=>{if(end(c)<=start+1e-6)return [c];if(c.start>=start-1e-6)return [{...c,start:c.start+clip.duration}];const left=clipSlice(s,c,c.start,start),right=clipSlice(s,c,start,end(c));right.id=uid('clip');right.start+=clip.duration;return [left,right];});
  // A title spanning the insertion stays onscreen; its word/keyframe times shift with the cut.
  for(const key of ['captions','graphics'])for(const o of s[key]){if(o.start>=start)o.start+=clip.duration;else if(end(o)>start){const local=start-o.start;o.duration+=clip.duration;if(o.keyframes)o.keyframes=o.keyframes.map(k=>({...k,time:k.time>=local?k.time+clip.duration:k.time}));if(o.words)o.words=o.words.map(w=>({...w,start:w.start>=local?w.start+clip.duration:w.start,end:w.end>local?w.end+clip.duration:w.end}));}}
  for(const m of s.markers)if(m.time>=start)m.time+=clip.duration;
 }else if(mode==='overwrite'){
  s.clips=s.clips.flatMap(c=>{if(c.track!==track||lane(c)!==target||c.start>=stop-1e-6||end(c)<=start+1e-6)return [c];const pieces=[];if(c.start<start-1e-6)pieces.push(clipSlice(s,c,c.start,start));if(end(c)>stop+1e-6){const right=clipSlice(s,c,stop,end(c));if(pieces.length)right.id=uid('clip');pieces.push(right);}return pieces;});
 }else{
  const overlapping=s.clips.filter(c=>c.track===track&&c.start<stop-1e-6&&end(c)>start+1e-6),top=Math.max(target-1,...overlapping.map(lane));clip.lane=top+1;if(clip.lane>7)throw Error('上に重ねる空きトラックがありません。');
 }
 s.clips.push(clip);return clip;
}
export function mergeContinuous(s,{ids}){
 if(!Array.isArray(ids)||ids.length<2||ids.length>500||new Set(ids).size!==ids.length)throw Error('結合するクリップを2つ以上選択してください。');
 const clips=ids.map(id=>requireItem(s.clips,id,'クリップ')).sort((a,b)=>a.start-b.start),first=clips[0];
 const settings=c=>JSON.stringify({...clipControls(c),fadeIn:0,fadeOut:0,gain:c.gain,muted:c.muted,sceneId:c.sceneId});
 for(let i=1;i<clips.length;i++){const a=clips[i-1],b=clips[i];if(a.assetId!==b.assetId||a.track!==b.track||lane(a)!==lane(b)||!near(end(a),b.start)||!near(a.in+sourceStep(s,a,a.duration),b.in)||settings(a)!==settings(b)||a.fadeOut||b.fadeIn)throw Error('同じ素材・同じ設定で連続する部分だけ結合できます。内部のフェードは先に外してください。');}
 first.duration=end(clips.at(-1))-first.start;first.fadeOut=clips.at(-1).fadeOut||0;s.clips=s.clips.filter(c=>c.id===first.id||!ids.includes(c.id));return first;
}
export function layerEdit(s,{ids,action}){
 if(!Array.isArray(ids)||!ids.length||ids.length>500||new Set(ids).size!==ids.length)throw Error('レイヤーを選択してください。');
 const clips=ids.map(id=>requireItem(s.clips,id,'クリップ'));choice(action,['up','down','mute','unmute'],'レイヤー操作');
 for(const c of clips){if(action==='mute'||action==='unmute')c.muted=action==='mute';else c.lane=lane(c)+(action==='up'?1:-1);}return {ids,action};
}
export function syncPoints(s,{referenceId,targetId,referencePoint=0,targetPoint=0}){
 if(referenceId===targetId)throw Error('異なる2クリップを選んでください。');const reference=requireItem(s.clips,referenceId,'基準'),target=requireItem(s.clips,targetId,'同期対象');
 num(referencePoint,'基準のクリップ内時刻',0,reference.duration);num(targetPoint,'対象のクリップ内時刻',0,target.duration);
 target.start=quant(s,reference.start+referencePoint-targetPoint);return {id:target.id,start:target.start};
}
export function crossfade(s,{leftId,rightId,duration=.4,curve='equalPower'}){
 const a=requireItem(s.clips,leftId,'左の音声'),b=requireItem(s.clips,rightId,'右の音声');if(a.id===b.id||a.track!=='audio'||b.track!=='audio'||!near(end(a),b.start))throw Error('隣り合う2つの音声クリップを選んでください。');
 const d=quant(s,num(duration,'クロスフェードの長さ',1/s.fps,10)),half=Math.round(d*s.fps/2)/s.fps,tail=d-half;
 if(d>Math.min(a.duration,b.duration))throw Error('クロスフェードは両方のクリップの長さ以内にしてください。');choice(curve,['linear','equalPower'],'フェードカーブ');
 const start=b.start-half,stop=end(b),free=Array.from({length:8},(_,i)=>i).find(i=>i!==lane(a)&&!s.clips.some(c=>c.id!==b.id&&c.track==='audio'&&lane(c)===i&&c.start<stop&&end(c)>start));if(free===undefined)throw Error('クロスフェード用の空き音声トラックがありません。');
 // Preserve the mix when moving B to the otherwise unused overlapping lane.
 if(JSON.stringify(s.audioMixer.tracks[free])!==JSON.stringify(s.audioMixer.tracks[lane(b)]))throw Error('空きトラックのミキサー設定を対象音声と同じにしてから適用してください。');
 a.duration+=tail;a.fadeOut=d;a.fadeCurve=curve;b.start-=half;b.in-=sourceStep(s,b,half);b.duration+=half;b.fadeIn=d;b.fadeCurve=curve;b.lane=free;
 return {leftId,rightId,lane:free,duration:d};
}
