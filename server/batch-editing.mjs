import {uid,requireItem,numberValue} from './util.mjs';import {clipControls} from './clip-effects.mjs';import {createOverlay} from './overlays.mjs';
const fields={clip:'clips',caption:'captions',graphic:'graphics'};
export function batchEdit(s,{items,action,rate=1,ripple=false,at}){
 if(!Array.isArray(items)||!items.length||items.length>500||new Set(items.map(i=>i.id)).size!==items.length)throw Error('重複のない要素を1〜500個選択してください。');
 const selected=items.map(i=>{if(!fields[i.type])throw Error('選択の種類が不正です。');return {type:i.type,item:requireItem(s[fields[i.type]],i.id,'選択要素')};}),ids=new Set(items.map(i=>i.id));
 const lo=Math.min(...selected.map(x=>x.item.start)),hi=Math.max(...selected.map(x=>x.item.start+x.item.duration)),frame=t=>Math.round(t*s.fps)/s.fps;
 if(action==='remove'){for(const f of Object.values(fields))s[f]=s[f].filter(c=>!ids.has(c.id));for(const g of s.graphics){if(ids.has(g.parentId))g.parentId=null;if(ids.has(g.matteId))g.matteId=null;}return {count:ids.size};}
 if(action==='duplicate'){
  const offset=frame(numberValue(at,'複製先',{fallback:hi}))-lo,map=new Map(items.map(i=>[i.id,uid(i.type)])),created=[];
  for(const {type,item} of selected){const copy=structuredClone(item);copy.id=map.get(item.id);copy.start=frame(copy.start+offset);if(copy.parentId&&map.has(copy.parentId))copy.parentId=map.get(copy.parentId);if(copy.matteId&&map.has(copy.matteId))copy.matteId=map.get(copy.matteId);s[fields[type]].push(copy);created.push({type,id:copy.id});}return {items:created};
 }
 if(action!=='retime')throw Error('一括編集の操作が不正です。');numberValue(rate,'速度倍率',{min:.25,max:4});if(typeof ripple!=='boolean')throw Error('rippleは真偽値です。');
 const delta=frame((hi-lo)/rate)-(hi-lo);
 if(ripple){for(const c of [...s.clips,...s.captions,...s.graphics])if(!ids.has(c.id)){if(c.start<hi-.00001&&c.start+c.duration>lo+.00001)throw Error('選択範囲に重なる他の要素も選択してください。');if(c.start>=hi-.00001)c.start=frame(c.start+delta);}for(const m of s.markers){if(m.time>=lo&&m.time<hi)m.time=frame(lo+(m.time-lo)/rate);else if(m.time>=hi)m.time=frame(m.time+delta);}}
 for(const {type,item:c} of selected){const oldDuration=c.duration;c.start=frame(lo+(c.start-lo)/rate);c.duration=Math.max(1/s.fps,Math.floor((oldDuration/rate+1e-8)*s.fps)/s.fps);if(type==='clip'){c.speed=(c.speed||1)*rate;clipControls(c);c.fadeIn=Math.min(c.duration,(c.fadeIn||0)/rate);c.fadeOut=Math.min(c.duration,(c.fadeOut||0)/rate);}else{const ratio=c.duration/oldDuration;for(const k of ['enterDuration','exitDuration','animationDuration'])if(c[k]!==undefined)c[k]=Math.max(.05,Math.min(10,c[k]*ratio));if(c.stagger!==undefined)c.stagger=Math.min(1,c.stagger*ratio);if(c.words)c.words=c.words.map(w=>({...w,start:w.start*ratio,end:w.end*ratio}));if(c.keyframes)c.keyframes=c.keyframes.map(k=>({...k,time:k.time*ratio}));Object.assign(c,createOverlay(type==='caption'?'caption':'graphics',c,c.id));}}
 return {count:selected.length,rate,note:'選択範囲の開始を基準に、間隔と長さをまとめて変更しました。'};
}
