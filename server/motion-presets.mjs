export const MOTION_PRESETS=[['rise','滑らかに登場'],['bounce','弾んで登場'],['float','浮遊'],['orbit','周回'],['spin','回転'],['pulse','呼吸する拡縮']];
export function motionFrames(name,item,{amount=8,cycles=1}={}){
 if(!MOTION_PRESETS.some(p=>p[0]===name))throw new Error('未対応のモーションです。');
 if(!Number.isFinite(amount)||amount<0||amount>40||!Number.isInteger(cycles)||cycles<1||cycles>8)throw new Error('モーションの値が不正です。');
 const clamp=v=>Math.max(0,Math.min(100,v)),duration=Number(item.duration),x=Number(item.x),y=Number(item.y);
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(x)||!Number.isFinite(y))throw new Error('位置と長さを先に指定してください。');
 const frame=(u,dx=0,dy=0,scale=1,rotation=0,opacity=1)=>({time:u*duration,x:clamp(x+dx),y:clamp(y+dy),scale,rotation,opacity,easing:'bezier',bezier:[.22,.61,.36,1]});
 if(name==='rise')return [frame(0,0,amount,.96,0,0),frame(Math.min(.8,.7/duration)),frame(1)];
 if(name==='bounce')return [frame(0,0,amount,.65,0,0),frame(.2,0,-amount*.25,1.08),frame(.4,0,amount*.1,.97),frame(.6),frame(1)];
 const frames=[];for(let i=0;i<=cycles*4;i++){const u=i/(cycles*4),angle=u*cycles*Math.PI*2;let f=frame(u);
  if(name==='float')f=frame(u,0,Math.sin(angle)*amount);
  if(name==='orbit')f=frame(u,Math.cos(angle)*amount,Math.sin(angle)*amount);
  if(name==='pulse')f=frame(u,0,0,1+Math.sin(angle)*amount/100);
  if(name==='spin')f=frame(u,0,0,1,u*360);
  f.easing=name==='spin'?'linear':'ease-in-out';frames.push(f);
 }return frames;
}
