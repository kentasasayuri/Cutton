export const MOTION_GROUPS=[['登場',[['rise','滑らかに登場'],['bounce','弾んで登場'],['fade-in','フェードイン'],['slide-left','左から登場'],['slide-right','右から登場'],['drop','上から登場'],['zoom-in','ズームイン'],['zoom-out','引いて登場'],['tilt-in','傾いて登場'],['spin-in','回転して登場'],['diagonal-in','斜めから登場'],['snap-in','瞬時に登場']]],['退場',[['fade-out','フェードアウト'],['exit-left','左へ退場'],['exit-right','右へ退場'],['exit-up','上へ退場'],['exit-down','下へ退場'],['shrink-out','縮んで退場'],['zoom-away','拡大して退場'],['tilt-out','傾いて退場']]],['強調',[['punch','パンチズーム'],['nod','うなずき'],['shake','左右シェイク'],['wobble','揺れて強調'],['heartbeat','二段パルス'],['dip','沈んで戻る'],['flash','点滅で強調'],['swing','振り子']]],['繰り返し',[['float','浮遊'],['orbit','周回'],['spin','回転'],['pulse','呼吸する拡縮'],['drift-x','横に漂う'],['figure-eight','8の字'],['rock','ゆったり傾く'],['breathe-fade','明滅']]]];
export const MOTION_PRESETS=MOTION_GROUPS.flatMap(([,items])=>items);
export const isLoopMotion=name=>MOTION_GROUPS[3][1].some(([id])=>id===name)&&name!=='spin';
export function motionFrames(name,item,{amount=8,cycles=1}={}){
 if(!MOTION_PRESETS.some(p=>p[0]===name))throw new Error('未対応のモーションです。');
 if(!Number.isFinite(amount)||amount<0||amount>40||!Number.isInteger(cycles)||cycles<1||cycles>8)throw new Error('モーションの値が不正です。');
 const clamp=v=>Math.max(0,Math.min(100,v)),duration=Number(item.duration),x=Number(item.x),y=Number(item.y);
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(x)||!Number.isFinite(y))throw new Error('位置と長さを先に指定してください。');
 const frame=(u,dx=0,dy=0,scale=1,rotation=0,opacity=1)=>({time:u*duration,x:clamp(x+dx),y:clamp(y+dy),scale,rotation,opacity,easing:'bezier',bezier:[.22,.61,.36,1]});
 const enter=Math.min(.8,.7/duration),exit=1-enter,a=amount,s=amount/100;
 const opening={'fade-in':[0,0,1,0,0],'slide-left':[-a,0,1,0,0],'slide-right':[a,0,1,0,0],drop:[0,-a,1,0,0],'zoom-in':[0,0,.4,0,0],'zoom-out':[0,0,1.5,0,0],'tilt-in':[0,a,.85,-a,0],'spin-in':[0,0,.5,-180,0],'diagonal-in':[-a,a,.9,0,0],'snap-in':[0,0,1,0,0]};
 if(opening[name]){const f=frame(0,...opening[name]);if(name==='snap-in')f.easing='hold';return [f,frame(name==='snap-in'?Math.min(.05,.05/duration):enter),frame(1)];}
 const closing={'fade-out':[0,0,1,0,0],'exit-left':[-a,0,1,0,0],'exit-right':[a,0,1,0,0],'exit-up':[0,-a,1,0,0],'exit-down':[0,a,1,0,0],'shrink-out':[0,0,.1,0,0],'zoom-away':[0,0,1.8,0,0],'tilt-out':[a,a,.75,a,0]};
 if(closing[name])return [frame(0),frame(exit),frame(1,...closing[name])];
 const e=Math.min(.9,.9/duration),beat=(u,...v)=>frame(u*e,...v);
 const accents={punch:[beat(0),beat(.3,0,0,1+s),beat(.65,0,0,1-s*.25),beat(1)],nod:[beat(0),beat(.4,0,a*.5),beat(.7,0,-a*.15),beat(1)],shake:[beat(0),beat(.2,-a),beat(.4,a),beat(.6,-a*.5),beat(.8,a*.2),beat(1)],wobble:[beat(0),beat(.25,0,0,1+s,-a),beat(.5,0,0,1-s*.2,a*.6),beat(.75,0,0,1,-a*.2),beat(1)],heartbeat:[beat(0),beat(.2,0,0,1+s),beat(.35),beat(.55,0,0,1+s*.7),beat(1)],dip:[beat(0),beat(.35,0,a,1-s),beat(1)],flash:[beat(0),beat(.25,0,0,1,0,.2),beat(.5),beat(.75,0,0,1,0,.2),beat(1)],swing:[beat(0),beat(.25,0,0,1,-a),beat(.75,0,0,1,a),beat(1)]};
 if(accents[name])return [...accents[name],frame(1)];
 if(name==='rise')return [frame(0,0,amount,.96,0,0),frame(Math.min(.8,.7/duration)),frame(1)];
 if(name==='bounce')return [frame(0,0,amount,.65,0,0),frame(.2,0,-amount*.25,1.08),frame(.4,0,amount*.1,.97),frame(.6),frame(1)];
 const frames=[];for(let i=0;i<=cycles*4;i++){const u=i/(cycles*4),angle=u*cycles*Math.PI*2;let f=frame(u);
  if(name==='float')f=frame(u,0,Math.sin(angle)*amount);
  if(name==='orbit')f=frame(u,Math.cos(angle)*amount,Math.sin(angle)*amount);
  if(name==='pulse')f=frame(u,0,0,1+Math.sin(angle)*amount/100);
  if(name==='spin')f=frame(u,0,0,1,u*360);
  if(name==='drift-x')f=frame(u,Math.sin(angle)*a);
  if(name==='figure-eight')f=frame(u,Math.sin(angle)*a,Math.sin(angle*2+Math.PI/4)*a/2);
  if(name==='rock')f=frame(u,0,0,1,Math.sin(angle)*a);
  if(name==='breathe-fade')f=frame(u,0,0,1,0,1-(1-Math.cos(angle))*.35);
  f.easing=name==='spin'?'linear':'ease-in-out';frames.push(f);
 }return frames;
}
