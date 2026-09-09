import React,{useEffect,useRef,useState} from 'react';
import {itemBox,moveItem,resizeItem,rotateItem} from '../server/direct-transform.mjs';
export default function DirectManipulation({state,clock,selected,onSelect,onDraft,onCommit,busy}){
 const ref=useRef(null),drag=useRef(null),[time,setTime]=useState(clock.time),[guides,setGuides]=useState(false),[snap,setSnap]=useState({});
 useEffect(()=>clock.subscribe(()=>{if(!drag.current&&!clock.playing)setTime(clock.time);}),[clock]);
 const entries=[...state.clips.filter(c=>c.track==='video').sort((a,b)=>(a.lane||0)-(b.lane||0)).map(item=>({item,kind:'clip'})),...state.graphics.filter(g=>g.type!=='null').map(item=>({item,kind:'graphic'})),...state.captions.map(item=>({item,kind:'caption'}))].filter(({item})=>!item.muted&&item.start<=time&&time<item.start+item.duration);
 const chosen=entries.find(e=>e.item.id===selected?.id);
 const save=(entry,fields)=>onCommit(entry.kind,entry.item.id,fields);
 const cancel=()=>{drag.current=null;onDraft(null);setSnap({});};
 useEffect(()=>{const key=e=>{if(e.key==='Escape'&&drag.current){e.preventDefault();cancel();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 function begin(e,entry,mode='move'){
  if(busy||e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.focus({preventScroll:true});clock.pause();onSelect({type:entry.kind,id:entry.item.id});e.currentTarget.setPointerCapture(e.pointerId);
  const rect=ref.current.getBoundingClientRect(),box=itemBox(entry.item,entry.kind,state,clock.time);
  drag.current={entry,mode,rect,box,x:e.clientX,y:e.clientY,fields:null,pointer:e.pointerId};
 }
 function move(e){
  const d=drag.current;if(!d||e.pointerId!==d.pointer)return;const dx=(e.clientX-d.x)/d.rect.width*100,dy=(e.clientY-d.y)/d.rect.height*100;
  let fields;
  if(d.mode==='resize'){const cx=d.rect.left+d.box.x/100*d.rect.width,cy=d.rect.top+d.box.y/100*d.rect.height;fields=resizeItem(d.entry.item,d.entry.kind,Math.hypot(e.clientX-cx,e.clientY-cy)/Math.max(1,Math.hypot(d.x-cx,d.y-cy)));}
  else if(d.mode==='rotate'){const cx=d.rect.left+d.box.x/100*d.rect.width,cy=d.rect.top+d.box.y/100*d.rect.height;let angle=(Math.atan2(e.clientY-cy,e.clientX-cx)-Math.atan2(d.y-cy,d.x-cx))*180/Math.PI;if(e.shiftKey)angle=Math.round(angle/15)*15;fields=rotateItem(d.entry.item,d.entry.kind,angle);}
  else {let x=dx,y=dy;const sx=!e.altKey&&Math.abs(d.box.x+dx-50)<.8,sy=!e.altKey&&Math.abs(d.box.y+dy-50)<.8;if(sx)x=50-d.box.x;if(sy)y=50-d.box.y;if(e.shiftKey){if(Math.abs(x)>Math.abs(y))y=0;else x=0;}setSnap({x:sx,y:sy});fields=moveItem(d.entry.item,d.entry.kind,x,y,state,time);}
  d.fields=fields;onDraft({kind:d.entry.kind,id:d.entry.item.id,fields});
 }
 async function end(e){const d=drag.current;if(!d)return;drag.current=null;setSnap({});if(d.fields){await save(d.entry,d.fields);}onDraft(null);}
 function key(e,entry){if(busy)return;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const step=e.shiftKey?10:1;save(entry,moveItem(entry.item,entry.kind,(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0)/state.width*100,(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)/state.height*100,state,time));}
 return <div ref={ref} className="direct-layer" style={{visibility:clock.playing?'hidden':'visible'}} onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}>
  {guides&&<div className="safe-area"/>}{snap.x&&<div className="snap-line vertical"/>}{snap.y&&<div className="snap-line horizontal"/>}
  {entries.map(entry=>{const b=itemBox(entry.item,entry.kind,state,time),active=selected?.id===entry.item.id;return <div key={entry.item.id} className={`direct-box ${active?'chosen':''}`} style={{left:b.x+'%',top:b.y+'%',width:b.width+'%',height:b.height+'%',transform:`translate(-50%,-50%) rotate(${b.rotation}deg)`}}><button type="button" className="direct-hit" aria-label={`ドラッグして移動: ${entry.item.text||entry.item.type||'映像'}`} onPointerDown={e=>begin(e,entry)} onKeyDown={e=>key(e,entry)} onClick={e=>e.stopPropagation()}/>{active&&<><button type="button" className="direct-handle resize" aria-label="拡大・縮小" onPointerDown={e=>begin(e,entry,'resize')}/>{entry.kind!=='caption'&&<button type="button" className="direct-handle rotate" aria-label="回転（Shiftで15度刻み）" onPointerDown={e=>begin(e,entry,'rotate')}/>}</>}</div>;})}
  <div className="direct-toolbar"><button onClick={()=>setGuides(!guides)} aria-pressed={guides}>セーフエリア</button>{chosen&&<><button disabled={busy} onClick={()=>save(chosen,moveItem(chosen.item,chosen.kind,50-itemBox(chosen.item,chosen.kind,state,time).x,0,state,time))}>左右中央</button><button disabled={busy} onClick={()=>save(chosen,moveItem(chosen.item,chosen.kind,0,50-itemBox(chosen.item,chosen.kind,state,time).y,state,time))}>上下中央</button></>}</div>
 </div>;
}
