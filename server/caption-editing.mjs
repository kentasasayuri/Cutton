import {captionLayout,graphemes} from './caption-style.mjs';
import {createOverlay,updateOverlay} from './overlays.mjs';

const ending=/^(?:した|しました|ました|ます|です|でした|ございます|ございました|けど|けれど|ということ|ことですね)[。！？、\s]*$/u;
export function captionIssues(state){
 const caps=[...(state.captions||[])].sort((a,b)=>a.start-b.start),issues=[];
 for(let i=0;i<caps.length;i++){
  const c=caps[i],text=c.text.replace(/\s/g,''),reasons=[];
  if(ending.test(text)||/^[、。！？…]+$/u.test(text))reasons.push('語尾・句読点だけの字幕');
  if(c.duration<1)reasons.push('表示が1秒未満');
  if(graphemes(text).length/c.duration>10)reasons.push('読む速さが毎秒10文字を超える');
  if(i&&c.start<caps[i-1].start+caps[i-1].duration-.001)reasons.push('前の字幕と重なる');
  if(captionLayout(c,state.width).length>2)reasons.push('3行以上になる');
  if(reasons.length)issues.push({id:c.id,text:c.text,start:c.start,reasons,previousId:caps[i-1]?.id,nextId:caps[i+1]?.id});
 }
 return issues;
}
export function mergeCaptions(state,ids){
 if(!Array.isArray(ids)||ids.length<2||ids.length>20||new Set(ids).size!==ids.length)throw Error('結合する字幕を2〜20個指定してください。');
 const sorted=[...state.captions].sort((a,b)=>a.start-b.start),selected=sorted.filter(c=>ids.includes(c.id));
 if(selected.length!==ids.length)throw Error('字幕が見つかりません。');
 const offset=sorted.indexOf(selected[0]);if(selected.some((c,i)=>sorted[offset+i]!==c))throw Error('隣り合う字幕を選択してください。');
 if(selected.some((c,i)=>i&&c.start<selected[i-1].start+selected[i-1].duration-.001))throw Error('重なりを解消してから結合してください。');
 const first=selected[0],duration=selected.at(-1).start+selected.at(-1).duration-first.start;
 const words=selected.every(c=>c.words?.length)?selected.flatMap(c=>c.words.map(w=>({...w,start:w.start+c.start-first.start,end:w.end+c.start-first.start}))):[];
 const merged=updateOverlay('caption',first,{text:selected.map(c=>c.text).join(''),duration,words});
 state.captions=state.captions.filter(c=>!ids.includes(c.id)||c.id===first.id).map(c=>c.id===first.id?merged:c);
 return merged;
}
export function splitCaption(state,{id,index,at}){
 const c=state.captions.find(c=>c.id===id);if(!c)throw Error('字幕が見つかりません。');
 if(!Number.isInteger(index)||index<=0||index>=c.text.length||!c.text.slice(0,index).trim()||!c.text.slice(index).trim()||/[\uD800-\uDBFF]$/.test(c.text.slice(0,index)))throw Error('文字と文字の間に分割位置を置いてください。');
 let cursor=0;const left=[],right=[];let inferred;
 for(const w of c.words||[]){const n=w.text.length,k=Math.max(0,Math.min(n,index-cursor)),t=w.start+(w.end-w.start)*k/n;
  if(k)left.push({...w,text:w.text.slice(0,k),end:t});if(k<n)right.push({...w,text:w.text.slice(k),start:t});
  if(cursor<=index&&cursor+n>=index)inferred=t;cursor+=n;
 }
 let boundary=at===undefined?c.start+inferred:at;
 if(!Number.isFinite(boundary))throw Error('単語時刻がない字幕は、再生ヘッドを分割する時刻へ移動してください。');
 boundary=Math.round(boundary*state.fps)/state.fps;const relative=boundary-c.start;
 if(relative<1/state.fps||c.duration-relative<1/state.fps)throw Error('分割時刻は字幕の内側にしてください。');
 if((left.at(-1)?.end??0)>relative+.5/state.fps+1e-6||(right[0]?.start??c.duration)<relative-.5/state.fps-1e-6)throw Error('分割時刻が単語の時刻と合いません。単語の時刻に合わせて分割してください。');
 // Changing an explicitly chosen split time must not leave words outside either caption.
 const fit=(words,from,to)=>words.map(w=>{const a=Math.max(from,w.start),b=Math.min(to,w.end);return {...w,start:a-from,end:b-from};});
 let lw=fit(left,0,relative),rw=fit(right,relative,c.duration);
 if([...lw,...rw].some(w=>w.end<=w.start))throw Error('分割時刻が単語の時刻と合いません。単語の時刻に合わせて分割してください。');
 const first=updateOverlay('caption',c,{text:c.text.slice(0,index),duration:relative,words:lw});
 const second=createOverlay('caption',{...c,text:c.text.slice(index),start:boundary,duration:c.duration-relative,words:rw});
 state.captions=state.captions.flatMap(item=>item.id===id?[first,second]:[item]);return {captions:[first,second]};
}
export const captionLooks={
 calm:{name:'通常・読みやすく',enterAnimation:'none',exitAnimation:'none',textAnimation:'none',karaoke:'none',color:'#ffffff',outline:2.5,outlineColor:'#142334',outerOutline:0,shadow:0},
 emphasis:{name:'キーワードを強調',enterAnimation:'up',exitAnimation:'fade',enterDuration:.22,exitDuration:.12,textAnimation:'none',karaoke:'none',color:'#ffe299',outline:2.5,outlineColor:'#142334',outerOutline:0,shadow:0},
};
export function applyCaptionLook(state,{ids,preset}){
 const look=captionLooks[preset];if(!look)throw Error('字幕のスタイルが見つかりません。');
 if(!Array.isArray(ids)||!ids.length||ids.length>5000||new Set(ids).size!==ids.length||ids.some(id=>!state.captions.some(c=>c.id===id)))throw Error('対象の字幕を指定してください。');
 const {name,...style}=look;state.captions=state.captions.map(c=>ids.includes(c.id)?updateOverlay('caption',c,style):c);return {count:ids.length};
}
