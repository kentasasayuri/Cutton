import React,{useEffect,useRef} from 'react';
import {Field} from './ui';
import {vectorSvg} from '../server/vector.mjs';
export function VectorPreview({state,clock}){
  const ref=useRef(null);
  useEffect(()=>{let previous=-1;const update=()=>{const frame=Math.floor(clock.time*Math.min(state.fps,30));if(frame===previous&&clock.playing)return;previous=frame;if(ref.current)ref.current.innerHTML=vectorSvg(state,clock.time);};update();return clock.subscribe(update);},[state.graphics,state.width,state.height,clock]);
  return <div ref={ref} className="vector-preview" aria-hidden="true"/>;
}
export const vectorDefaults={shape:'rect',mask:'none',repeat:'none',stroke:0,radius:0,shadow:0,glow:0,tracking:0,fontWeight:700,wiggle:0,frequency:1,gradient:false,gradientColor:'#182a58',strokeColor:'#ffffff',textColor:'#ffffff',parentId:null,matteId:null};
export function VectorFields({draft,set,state}){
  const v={...vectorDefaults,...draft};
  return <><div className="inspector-section-title">シェイプ・合成</div><div className="effect-fields">{[['shape','形状',['rect','ellipse','line','text'],['長方形','楕円','線','テキストのみ']],['mask','マスク',['none','rect','ellipse'],['なし','長方形','楕円']],['repeat','繰り返し',['none','loop','pingpong'],['なし','ループ','往復']]].map(([key,label,values,labels])=><Field label={label} key={key}><select value={v[key]} onChange={e=>set(key,e.target.value)}>{values.map((value,i)=><option key={value} value={value}>{labels[i]}</option>)}</select></Field>)}{[['parentId','親レイヤー'],['matteId','アルファマット']].map(([key,label])=><Field key={key} label={label}><select value={v[key]||''} onChange={e=>set(key,e.target.value||null)}><option value="">なし</option>{state.graphics.filter(g=>g.id!==draft.id&&['vector','null'].includes(g.type)).map(g=><option key={g.id} value={g.id}>{g.text||g.type} · {g.id.slice(-5)}</option>)}</select></Field>)}</div><label className="checkbox-field"><input type="checkbox" checked={v.gradient} onChange={e=>set('gradient',e.target.checked)}/>グラデーション</label><div className="effect-fields">{[['gradientColor','終点の色'],['strokeColor','線の色'],['textColor','文字色']].map(([key,label])=><Field label={label} key={key}><input type="color" value={v[key]} onChange={e=>set(key,e.target.value)}/></Field>)}{[['stroke','線幅',0,100],['radius','角丸',0,500],['shadow','シャドウ',0,60],['glow','グロー',0,60],['tracking','文字間隔',-20,100],['fontWeight','文字の太さ',100,900],['wiggle','揺れ幅 (%)',0,20],['frequency','揺れ速度',.1,20]].map(([key,label,min,max])=><Field label={label} key={key}><input type="number" min={min} max={max} step=".1" value={v[key]} onChange={e=>set(key,Number(e.target.value))}/></Field>)}</div></>;
}
export function CurveEditor({frame,onChange}){
  const c=frame.bezier||[.25,.1,.25,1];
  return <div className="curve-editor"><svg viewBox="0 0 140 100" aria-label="時間に対する変化量のカーブ"><path d="M 20 10 V 80 H 130" fill="none" stroke="#555"/><path d={`M 20 80 C ${20+c[0]*110} ${80-c[1]*70}, ${20+c[2]*110} ${80-c[3]*70},130 10`} fill="none" stroke="#63c9cf" strokeWidth="2"/></svg><div className="effect-fields">{c.map((value,i)=><Field label={['X1','Y1','X2','Y2'][i]} key={i}><input type="number" step=".05" min={i%2?-2:0} max={i%2?3:1} value={value} onChange={e=>onChange(c.map((x,j)=>j===i?Number(e.target.value):x))}/></Field>)}</div></div>;
}
