import {randomUUID} from 'node:crypto';
const id=()=>`clip_${randomUUID().replaceAll('-','').slice(0,16)}`;
const frame=(t,fps)=>Math.round(t*fps)/fps;
const collection=type=>({clip:'clips',caption:'captions',graphic:'graphics'}[type]);
export function alignItems(state,{items,mode='start',at=0,gap=0}){
 if(!Array.isArray(items)||items.length<1||items.length>500)throw new Error('1〜500要素を選択してください。');
 if(!['start','end','playhead','offset','sequence'].includes(mode)||!Number.isFinite(at)||!Number.isFinite(gap)||gap<0)throw new Error('タイミング指定が不正です。');
 const seen=new Set(),selected=items.map(({type,id})=>{if(seen.has(id))throw new Error('選択が重複しています。');seen.add(id);const item=state[collection(type)]?.find(i=>i.id===id);if(!item)throw new Error('選択した要素が見つかりません。');return item;});
 const start=Math.min(...selected.map(i=>i.start)),end=Math.max(...selected.map(i=>i.start+i.duration));let cursor=start;
 const order=mode==='sequence'?[...selected].sort((a,b)=>a.start-b.start):selected;
 for(const item of order){item.start=frame(mode==='start'?start:mode==='end'?end-item.duration:mode==='playhead'?at:mode==='offset'?item.start+at:cursor,state.fps);if(item.start<0||item.start+item.duration>86400)throw new Error('配置範囲を超えています。');cursor=item.start+item.duration+gap;}
 return {updated:items.length};
}
export function cutRanges(state,{ranges},makeId=id){
 if(!Array.isArray(ranges)||!ranges.length||ranges.length>500)throw new Error('カット範囲は1〜500件で指定してください。');
 const sorted=ranges.map(r=>{if(!r||!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.start<0||r.end>86400||r.end<=r.start)throw new Error('カット範囲が不正です。');return {start:frame(r.start,state.fps),end:frame(r.end,state.fps)};}).sort((a,b)=>a.start-b.start),cuts=[];
 for(const r of sorted){if(r.end<=r.start)continue;const previous=cuts.at(-1);if(previous&&r.start<=previous.end)previous.end=Math.max(previous.end,r.end);else cuts.push({...r});}
 if(!cuts.length)throw new Error('1フレーム以上の範囲を指定してください。');
 const map=t=>t-cuts.reduce((sum,c)=>sum+Math.max(0,Math.min(t,c.end)-c.start),0);
 const pieces=(start,end)=>{let cursor=start,result=[];for(const c of cuts){if(c.end<=cursor||c.start>=end)continue;if(c.start>cursor)result.push([cursor,Math.min(end,c.start)]);cursor=Math.max(cursor,c.end);if(cursor>=end)break;}if(cursor<end)result.push([cursor,end]);return result;};
 state.clips=state.clips.flatMap(clip=>pieces(clip.start,clip.start+clip.duration).map(([lo,hi],index)=>({...clip,id:index?makeId():clip.id,start:map(lo),duration:hi-lo,in:state.assets.find(a=>a.id===clip.assetId)?.kind==='image'?0:clip.in+(lo-clip.start)*(clip.speed||1),fadeIn:Math.min(clip.fadeIn||0,hi-lo),fadeOut:Math.min(clip.fadeOut||0,hi-lo)})));
 for(const key of ['captions','graphics'])state[key]=(state[key]||[]).flatMap(item=>{const duration=map(item.start+item.duration)-map(item.start);if(duration<.5/state.fps)return [];const start=map(item.start),next={...item,start,duration};
  if(item.keyframes?.length){const frames=new Map();for(const f of item.keyframes){const time=Math.max(0,Math.min(duration,map(item.start+f.time)-start));frames.set(time,{...f,time});}next.keyframes=[...frames.values()].sort((a,b)=>a.time-b.time);}
  if(item.words?.length){next.words=item.words.map(w=>({...w,start:map(item.start+w.start)-start,end:map(item.start+w.end)-start})).filter(w=>w.end>w.start);next.text=next.words.map(w=>w.text).join('');if(!next.text)return [];}
  return [next];});
 const ids=new Set(state.graphics.map(g=>g.id));for(const g of state.graphics){if(g.parentId&&!ids.has(g.parentId))g.parentId=null;if(g.matteId&&!ids.has(g.matteId))g.matteId=null;}
 state.markers=(state.markers||[]).map(m=>({...m,time:map(m.time)}));let cursor=0;
 state.storyboard=(state.storyboard||[]).map(scene=>{const duration=Math.max(1/state.fps,map(cursor+scene.duration)-map(cursor));cursor+=scene.duration;return {...scene,duration};});
 return {ranges:cuts,removedSeconds:cuts.reduce((s,c)=>s+c.end-c.start,0)};
}
