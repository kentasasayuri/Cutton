import {createOverlay,updateOverlay} from './overlays.mjs';
import {requireItem,numberValue,choice,textValue} from './util.mjs';
import {COMPOSITIONS} from './motion-catalog.mjs';
export function createComposition(s,{preset='chapter',title='ここに見出し',subtitle='伝えたいポイント',start=0,duration=6,color='#45d5ca'}){
 choice(preset,COMPOSITIONS.map(p=>p[0]),'モーション構成');textValue(title,'見出し',{max:80});textValue(subtitle,'補足',{max:120,empty:true});numberValue(start,'開始');numberValue(duration,'長さ',{min:2,max:60});if(start+duration>86400||!/^#[0-9a-f]{6}$/i.test(color))throw Error('時間またはカラーが不正です。');
 const items=[],unit=s.width/1920,make=(shape,text,x,y,width,height,font,delay=0,opts={})=>{
  const d=duration-delay,move=shape==='line'?0:3,easing='bezier',f=(time,yy,scale,opacity)=>({time,x,y:yy,scale,rotation:0,opacity,easing,bezier:[.16,1,.3,1]});
  const item=createOverlay('graphics',{type:'vector',shape,text,start:start+delay,duration:d,x,y,width,height,fontSize:Math.min(300,Math.max(8,font*unit)),fontFamily:'Source Han Sans JP',fontWeight:700,color:shape==='text'?'#ffffff':'#142333',textColor:'#ffffff',strokeColor:color,stroke:shape==='line'?3*unit:0,fillOpacity:1,radius:0,keyframes:[f(0,y+move,.96,0),f(.5,y,1,1),f(d-.35,y,1,1),f(d,y-1,1,0)],...opts});items.push(item);return item;
 };
 if(preset==='chapter'){make('rect','',50,46,78,34,20,0,{fillOpacity:.94});make('line','',50,30,72,1,20,.1);make('text',title,50,43,70,10,78,.15);make('text',subtitle,50,55,68,6,30,.3,{textColor:color});}
 if(preset==='lower'){make('rect','',29,79,48,17,20);make('rect','',5.6,79,.7,17,20,.05,{color});make('text',title,29,76.5,42,7,50,.12);make('text',subtitle,29,83,42,5,26,.25,{textColor:color});}
 if(preset==='quote'){make('rect','',50,47,76,35,20,0,{fillOpacity:.93});make('text','“',16,37,8,8,120,.05,{textColor:color});make('text',title,52,45,60,12,55,.2);make('line','',50,56,61,1,20,.3);make('text',subtitle,50,62,60,4,25,.4);}
 if(preset==='callout'){make('ellipse','',22,50,4,7,20,0,{color,fillOpacity:.2,stroke:3*unit});make('line','',38,50,27,1,20,.1);make('rect','',66,50,32,20,20,.2);make('text',title,66,47,29,7,42,.3);make('text',subtitle,66,55,29,4,25,.4,{textColor:color});}
 if(preset==='versus'){make('rect','',27,50,40,25,20);make('rect','',73,50,40,25,20,.15,{color:'#263443'});make('text',title,27,50,36,10,58,.25);make('text',subtitle,73,50,36,10,58,.4);make('rect','',50,50,.4,29,20,.1,{color});}
 if(preset==='steps'){const labels=(title+'／'+subtitle).split(/[／/\n]/).filter(Boolean).slice(0,3);while(labels.length<3)labels.push(`ステップ ${labels.length+1}`);[20,50,80].forEach((x,i)=>{make('rect','',x,51,25,29,20,i*.25);make('text',String(i+1).padStart(2,'0'),x,43,21,8,60,i*.25+.1,{textColor:color});make('text',labels[i],x,55,21,9,36,i*.25+.25);});}
 if(preset==='headline'){make('rect','',50,18,88,17,20,0,{fillOpacity:.94});make('line','',50,26,88,1,20,.1);make('text',title,50,16.5,81,8,54,.12);make('text',subtitle,50,23,81,4,24,.22,{textColor:color});}
 if(preset==='focus'){make('rect','',50,49,73,62,20,0,{fillOpacity:0,stroke:2*unit,strokeColor:color});make('rect','',50,78,55,11,20,.1);make('text',title,50,77,51,6,44,.2);make('text',subtitle,50,86,66,5,27,.3);}
 if(s.graphics.length+items.length>5000)throw Error('グラフィックの上限です。');s.graphics.push(...items);return {items};
}
export function motionBatch(s,{ids,action,duration=6,protect=.5,gap=.15}){
 if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length)throw Error('グラフィックを1〜100個選んでください。');const items=ids.map(id=>requireItem(s.graphics,id,'グラフィック'));
 choice(action,['reverse','stagger','duration','front','back'],'モーション編集');
 if(action==='front'||action==='back'){if(items.some(g=>!['vector','null'].includes(g.type)))throw Error('重なり順の変更はベクターレイヤーを選択してください。');const rest=s.graphics.filter(g=>!ids.includes(g.id));s.graphics=action==='front'?[...rest,...items]:[...items,...rest];}
 if(action==='reverse'&&items.some(g=>g.keyframes?.some(k=>k.easing==='hold')))throw Error('ホールドのキーフレームはカーブを変更してから逆再生してください。');
 if(action==='stagger'){numberValue(gap,'時間差',{min:0,max:10});const start=Math.min(...items.map(g=>g.start));items.forEach((g,i)=>Object.assign(g,updateOverlay('graphics',g,{start:start+i*gap})));}
 if(action==='reverse')for(const g of items){if(!g.keyframes?.length)continue;const old=[...g.keyframes];const frames=old.map((k,i)=>{const easing=old[i-1]?.easing||'linear',b=old[i-1]?.bezier;return {...k,time:g.duration-k.time,easing:easing==='ease-in'?'ease-out':easing==='ease-out'?'ease-in':easing,...(b?{bezier:[1-b[2],1-b[3],1-b[0],1-b[1]]}:{})};}).reverse();Object.assign(g,updateOverlay('graphics',g,{keyframes:frames}));}
 if(action==='duration'){numberValue(duration,'長さ',{min:.1,max:3600});numberValue(protect,'入退場の保護秒',{min:0,max:10});for(const g of items){const p=Math.min(protect,g.duration/2);if(duration<p*2)throw Error('入退場の保護区間より長い尺を指定してください。');const middle=g.duration-2*p;const frames=(g.keyframes||[]).map(k=>({...k,time:k.time<=p?k.time:k.time>=g.duration-p?duration-(g.duration-k.time):p+(k.time-p)*(duration-2*p)/middle}));const unique=[...new Map(frames.map(f=>[f.time,f])).values()];Object.assign(g,updateOverlay('graphics',g,{duration,keyframes:unique}));}}
 return {updated:items.length};
}
