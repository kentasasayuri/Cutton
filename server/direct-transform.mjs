import {evaluateOverlayTransform} from './overlays.mjs';
import {vectorTransform} from './vector.mjs';
import {captionLayout,captionDefaults} from './caption-style.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function itemBox(item,kind,state,time){
 const t=kind==='graphic'?(item.type==='vector'?vectorTransform(item,time,state.graphics):evaluateOverlayTransform(item,time-item.start)):{x:item.x??50,y:item.y??50,scale:item.scale??1,rotation:item.rotation??0};
 let width=kind==='clip'?100:item.width||60,height=kind==='clip'?100:item.height||14;
 if(kind==='caption'){const lines=captionLayout({...captionDefaults,...item},state.width);width=Math.max(12,...lines.map(l=>l.reduce((s,g)=>s+g.advance,0)/state.width*100));height=lines.length*item.fontSize*(item.lineHeight||1.3)/state.height*100;}
 return {x:t.x,y:t.y,width:width*t.scale,height:height*t.scale,rotation:t.rotation||0};
}
export function moveItem(item,kind,dx,dy,state,time){
 if(![dx,dy].every(Number.isFinite))throw new Error('Invalid movement');
 if(kind==='graphic'&&item.parentId){const parent=state.graphics.find(g=>g.id===item.parentId);if(parent){const t=vectorTransform(parent,time,state.graphics),a=-t.rotation*Math.PI/180;[dx,dy]=[(dx*Math.cos(a)-dy*Math.sin(a))/t.scale,(dx*Math.sin(a)+dy*Math.cos(a))/t.scale];}}
 const lo=kind==='clip'?-100:0,hi=kind==='clip'?200:100,frames=kind==='graphic'?item.keyframes||[]:[];
 dx=clamp(dx,Math.max(...[item,...frames].map(f=>lo-(f.x??50))),Math.min(...[item,...frames].map(f=>hi-(f.x??50))));
 dy=clamp(dy,Math.max(...[item,...frames].map(f=>lo-(f.y??50))),Math.min(...[item,...frames].map(f=>hi-(f.y??50))));
 return {x:(item.x??50)+dx,y:(item.y??50)+dy,...(frames.length?{keyframes:frames.map(f=>({...f,x:f.x+dx,y:f.y+dy}))}:{})};
}
export function resizeItem(item,kind,ratio){
 ratio=clamp(ratio,.1,10);
 if(kind==='caption')return {fontSize:clamp(item.fontSize*ratio,8,300)};
 if(kind==='clip')return {scale:clamp((item.scale??1)*ratio,.05,4)};
 if(item.keyframes?.length){ratio=clamp(ratio,Math.max(...item.keyframes.map(f=>.1/f.scale)),Math.min(...item.keyframes.map(f=>4/f.scale)));return {keyframes:item.keyframes.map(f=>({...f,scale:f.scale*ratio}))};}
 ratio=clamp(ratio,Math.max(.1/item.width,.1/item.height,8/item.fontSize),Math.min(100/item.width,100/item.height,300/item.fontSize));return {width:item.width*ratio,height:item.height*ratio,fontSize:item.fontSize*ratio};
}
export function rotateItem(item,kind,degrees){
 const frames=kind==='graphic'?item.keyframes||[]:[];
 if(frames.length){degrees=clamp(degrees,Math.max(...frames.map(f=>-360-f.rotation)),Math.min(...frames.map(f=>360-f.rotation)));return {keyframes:frames.map(f=>({...f,rotation:f.rotation+degrees}))};}
 return {rotation:clamp((item.rotation||0)+degrees,-360,360)};
}
