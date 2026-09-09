export function motionLayout({preset='compare',texts,start=0,duration=6,y=18,fontSize=32}){
 const count=preset==='compare'?2:preset==='steps'?3:0;
 if(!count||!Array.isArray(texts)||texts.length!==count||texts.some(s=>typeof s!=='string'||!s.trim()||s.length>60))throw Error('比較は2項目、段階表示は3項目のテキストを指定してください。');
 for(const [v,min,max] of [[start,0,86400],[duration,2,60],[y,10,90],[fontSize,8,100]])if(!Number.isFinite(v)||v<min||v>max)throw Error('モーションの時間・位置・文字サイズが不正です。');
 if(start+duration>86400)throw Error('24時間以内に配置してください。');
 return texts.map((text,i)=>{const x=count===2?[27,73][i]:[20,50,80][i],offset=count===2?i*.2:i*Math.min(.8,duration/5),d=duration-offset,dx=count===2?(i===0?-8:8):0,dy=count===3?4:0;
  const frame=(time,xx,yy,opacity,easing='linear')=>({time,x:xx,y:yy,scale:1,rotation:0,opacity,easing,bezier:[.16,1,.3,1]});
  return {type:'vector',shape:'rect',text,start:start+offset,duration:d,x,y,width:count===2?40:27,height:10,fontSize,fontFamily:'Source Han Sans JP',fontWeight:700,color:['#173b39','#152b42','#35283a'][i],textColor:'#ffffff',stroke:1,strokeColor:'#72c9d1',keyframes:[frame(0,x+dx,y+dy,0,'bezier'),frame(.45,x,y,1),frame(d-.3,x,y,1,'bezier'),frame(d,x,y-1,0)]};
 });
}
export function moveGraphicDraft(previous,key,value){
 if(!['x','y','duration'].includes(key)||!previous.keyframes?.length)return {...previous,[key]:value};
 if(value===''||!Number.isFinite(Number(value))||key==='duration'&&Number(value)<=0)return previous;
 const next=Number(value),old=Number(previous[key]);
 return {...previous,[key]:next,keyframes:previous.keyframes.map(k=>key==='duration'?{...k,time:k.time*next/old}:{...k,[key]:Number(k[key])+next-old})};
}
