// Browser and export share timing, layout and SVG. No per-frame React state.
import {BUNDLED_FONTS,validFontFamily} from './font-catalog.mjs';
export const CAPTION_FONTS=['Meiryo','Yu Gothic','Yu Mincho','Arial',...BUNDLED_FONTS.map(f=>f.family)];
export const CAPTION_TRANSITIONS=[['none','なし'],['fade','フェード'],['up','下から / 上へ'],['down','上から / 下へ'],['left','左から / 左へ'],['right','右から / 右へ'],['zoom','ズーム'],['pop','ポップ'],['tilt','傾き'],['spin','回転']];
export const captionDefaults={enterAnimation:'none',exitAnimation:'none',enterDuration:.35,exitDuration:.25,outerOutline:0,outerOutlineColor:'#ffffff',fontFamily:'Meiryo',fontWeight:700,outline:2,outlineColor:'#101820',opacity:1,gradient:false,gradientColor:'#53e0ed',gradientAngle:90,tracking:0,lineHeight:1.3,shadow:1,background:false,backgroundColor:'#101820',backgroundOpacity:.65,padding:16,cornerRadius:8,textAnimation:'none',animationDuration:.6,stagger:.05,karaoke:'none',highlightColor:'#ffdb58',words:[]};
const segmenter=new Intl.Segmenter('ja',{granularity:'grapheme'});
export const graphemes=value=>Array.from(segmenter.segment(String(value)),s=>s.segment);
// Projects are immutable snapshots. Cache only per-caption layout/timing, never video frames.
const timingCache=new WeakMap(),renderCache=new WeakMap();
const finite=(v,min,max,key)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`${key}: ${min}〜${max}で指定してください。`);return v;};
const hex=v=>{if(typeof v!=='string'||!/^#[a-f0-9]{6}$/i.test(v))throw new Error('色は#rrggbbで指定してください。');return v;};
export function captionStyle(args,duration,text){
 const v={...captionDefaults,...args};const result={};
 if(!validFontFamily(v.fontFamily))throw new Error('フォント名が不正です。');result.fontFamily=v.fontFamily;
 for(const [key,min,max] of [['enterDuration',.05,10],['exitDuration',.05,10],['outerOutline',0,30],['fontWeight',100,900],['outline',0,30],['opacity',0,1],['gradientAngle',-360,360],['tracking',-10,40],['lineHeight',.8,3],['shadow',0,30],['backgroundOpacity',0,1],['padding',0,100],['cornerRadius',0,100],['animationDuration',.05,10],['stagger',0,1]])result[key]=finite(v[key],min,max,key);
 for(const key of ['outerOutlineColor','outlineColor','gradientColor','backgroundColor','highlightColor'])result[key]=hex(v[key]);
 for(const key of ['gradient','background']){if(typeof v[key]!=='boolean')throw new Error(`${key} must be boolean`);result[key]=v[key];}
 for(const [key,choices] of [['enterAnimation',CAPTION_TRANSITIONS.map(([id])=>id)],['exitAnimation',CAPTION_TRANSITIONS.map(([id])=>id)],['textAnimation',['none','typewriter','fade-letters','rise-letters','pop-letters','wave']],['karaoke',['none','sweep','words']]]){if(!choices.includes(v[key]))throw new Error(`Invalid ${key}`);result[key]=v[key];}
 if(!Array.isArray(v.words)||v.words.length>500)throw new Error('単語タイミングは500件までです。');
 let previous=0;
 result.words=v.words.map(word=>{if(!word||typeof word.text!=='string'||!word.text||word.text.length>200)throw new Error('タイミングの文字列が不正です。');const start=finite(word.start,0,duration,'word.start'),end=finite(word.end,0,duration,'word.end');if(end<=start||start<previous)throw new Error('単語タイミングは重複させず、開始順に指定してください。');previous=end;return {text:word.text,start,end};});
 if(result.words.length&&result.words.map(w=>w.text).join('')!==text)throw new Error('単語タイミングの文字列を連結した結果が字幕と一致しません。');
 return result;
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const unit=s=>/^\s+$/.test(s)?.36:/[\u2e80-\uffff]|\p{Extended_Pictographic}/u.test(s)?1:/[il.,!'|]/.test(s)?.32:/[MW]/.test(s)?.9:.65;
export function captionLayout(item,width){
 const glyphs=graphemes(item.text),font=item.fontSize,spacing=item.tracking??0,limit=width*.9;let lines=[[]],lineWidth=0;
 glyphs.forEach((text,index)=>{if(text==='\n'){lines.push([]);lineWidth=0;return;}const advance=Math.max(font*.15,unit(text)*font+spacing);if(lineWidth+advance>limit&&lines.at(-1).length){lines.push([]);lineWidth=0;}lines.at(-1).push({text,index,advance});lineWidth+=advance;});
 return lines.map((line,row)=>{const lineWidth=line.reduce((s,g)=>s+g.advance,0);let x=-lineWidth/2;return line.map(g=>{const glyph={...g,x:x+g.advance/2,y:(row-(lines.length-1)/2)*font*(item.lineHeight??1.3)};x+=g.advance;return glyph;});});
}
export function wordTiming(item,index){
 let timings=timingCache.get(item);
 if(!timings){const count=Math.max(1,graphemes(item.text).length);timings=item.words?.length?item.words.flatMap(word=>{const letters=graphemes(word.text);return letters.map((_,i)=>({start:word.start+(word.end-word.start)*i/letters.length,end:word.start+(word.end-word.start)*(i+1)/letters.length,wordStart:word.start}));}):Array.from({length:count},(_,i)=>({start:i/count*item.duration,end:(i+1)/count*item.duration}));timingCache.set(item,timings);}
 return timings[index]||{start:0,end:item.duration};
}
export function captionGlyphState(item,index,time){
 const v={...captionDefaults,...item},t=wordTiming(item,index);let progress=Math.max(0,Math.min(1,(time-t.start)/(t.end-t.start))),opacity=1,scale=1,y=0;
 const delay=index*v.stagger,u=Math.max(0,Math.min(1,(time-delay)/v.animationDuration));
 if(v.textAnimation==='typewriter')opacity=time>=delay?1:0;
 if(v.textAnimation==='fade-letters')opacity=u;
 if(v.textAnimation==='rise-letters'){opacity=u;y=(1-u)*v.fontSize*.65;}
 if(v.textAnimation==='pop-letters'){opacity=u;scale=.5+.5*u+Math.sin(u*Math.PI)*.22;}
 if(v.textAnimation==='wave')y=Math.sin(time*6-index*.6)*v.fontSize*.13;
 return {progress:v.karaoke==='words'?(time>=(t.wordStart??t.start)?1:0):progress,opacity:opacity*v.opacity,scale,y};
}
export function captionTransition(item,time){
 const v={...captionDefaults,...item},enter=Math.min(v.enterDuration,v.duration/2),exit=Math.min(v.exitDuration,v.duration/2);let x=0,y=0,scale=1,rotation=0,opacity=1;
 for(const [name,raw,out] of [[v.enterAnimation,Math.max(0,Math.min(1,time/enter)),false],[v.exitAnimation,Math.max(0,Math.min(1,(v.duration-time)/exit)),true]]){if(name==='none')continue;const u=1-(1-raw)**3,rest=1-u,amount=v.fontSize*.8;opacity*=raw;if(name==='up')y+=(out?-1:1)*amount*rest;if(name==='down')y+=(out?1:-1)*amount*rest;if(name==='left')x-=amount*rest;if(name==='right')x+=amount*rest;if(name==='zoom')scale*=.4+.6*u;if(name==='pop')scale*=.5+.5*u+Math.sin(u*Math.PI)*.16;if(name==='tilt'){rotation+=(out?1:-1)*15*rest;y+=amount*rest;}if(name==='spin'){rotation+=(out?1:-1)*90*rest;scale*=.5+.5*u;}}
 return {x,y,scale,rotation,opacity};
}
export function captionsSvg(state,time){
 const {width,height}=state;let content='';
 for(const original of state.captions||[]){if(time<original.start||time>=original.start+original.duration)continue;
 let prepared=renderCache.get(original);if(!prepared||prepared.width!==width){const v={...captionDefaults,...original};prepared={width,v,lines:captionLayout(v,width)};renderCache.set(original,prepared);}
 const {v,lines}=prepared,t=time-v.start,glyphs=lines.flat(),id='c'+Array.from(v.id).map(c=>c.codePointAt(0).toString(16)).join('_');
 const transition=captionTransition(v,t);
 const angle=v.gradientAngle*Math.PI/180,gx=Math.cos(angle)*.5,gy=Math.sin(angle)*.5;
 const boxWidth=Math.min(width*.94,Math.max(0,...lines.map(line=>line.reduce((n,g)=>n+g.advance,0)))+v.padding*2),boxHeight=lines.length*v.fontSize*v.lineHeight+v.padding*2;
 content+=`<defs><filter id="${id}s" x="-50%" y="-100%" width="200%" height="300%"><feDropShadow dx="0" dy="${v.shadow}" stdDeviation="${v.shadow/2}" flood-opacity=".65"/></filter></defs><g data-caption-id="${esc(v.id)}" transform="translate(${width*v.x/100+transition.x} ${height*v.y/100+transition.y}) rotate(${transition.rotation}) scale(${transition.scale})" opacity="${transition.opacity}">`;
 if(v.background)content+=`<rect x="${-boxWidth/2}" y="${-boxHeight/2}" width="${boxWidth}" height="${boxHeight}" rx="${v.cornerRadius}" fill="${v.backgroundColor}" opacity="${v.backgroundOpacity*v.opacity}"/>`;
 for(const g of glyphs){const a=captionGlyphState(v,g.index,t),key=id+'_'+g.index,attrs=`x="0" y="${v.fontSize*.36}" text-anchor="middle" font-family="${esc(v.fontFamily)}" font-weight="${v.fontWeight}" font-size="${v.fontSize}"`;
 if(v.gradient)content+=`<defs><linearGradient id="${key}g" gradientUnits="userSpaceOnUse" x1="${-gx*(boxWidth-v.padding*2)-g.x}" y1="${-gy*(boxHeight-v.padding*2)-g.y}" x2="${gx*(boxWidth-v.padding*2)-g.x}" y2="${gy*(boxHeight-v.padding*2)-g.y}"><stop stop-color="${v.color}"/><stop offset="1" stop-color="${v.gradientColor}"/></linearGradient></defs>`;
 content+=`<g transform="translate(${g.x} ${g.y+a.y}) scale(${a.scale})" opacity="${a.opacity}"${v.shadow?` filter="url(#${id}s)"`:''}>`;
 if(v.outerOutline)content+=`<text ${attrs} fill="none" stroke="${v.outerOutlineColor}" stroke-width="${(v.outline+v.outerOutline)*2}" stroke-linejoin="round">${esc(g.text)}</text>`;
 if(v.outline)content+=`<text ${attrs} fill="none" stroke="${v.outlineColor}" stroke-width="${v.outline*2}" stroke-linejoin="round">${esc(g.text)}</text>`;
 content+=`<text ${attrs} fill="${v.gradient?`url(#${key}g)`:v.color}">${esc(g.text)}</text>`;
 if(v.karaoke!=='none'&&a.progress>0){const clipWidth=(g.advance+v.fontSize*.4)*a.progress;content+=`<defs><clipPath id="${key}"><rect x="${-g.advance/2-v.fontSize*.2}" y="${-v.fontSize}" width="${clipWidth}" height="${v.fontSize*2}"/></clipPath></defs><text ${attrs} fill="${v.highlightColor}" clip-path="url(#${key})">${esc(g.text)}</text>`;}
 content+='</g>';}
 content+='</g>';
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`;
}
