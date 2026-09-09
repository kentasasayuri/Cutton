import React,{useEffect,useState} from 'react';
import {ARTICLE_FONTS,BUNDLED_FONTS,FONT_ARTICLE} from '../server/font-catalog.mjs';
import {request} from './model';
import {engineUrl} from './engine';
const loaded=new Map();
export async function ensureFont(family,custom=[]){
 if(loaded.has(family))return loaded.get(family);
 const bundled=BUNDLED_FONTS.find(f=>f.family===family),local=custom.filter(f=>f.family===family);
 const sources=bundled?bundled.files.map((file,i)=>({url:'/fonts/'+file,weight:bundled.weights[i]})):local.map(f=>({url:engineUrl(f.url),weight:'100 900'}));
 if(!sources.length)return;
 const promise=Promise.all(sources.map(async s=>{const face=new FontFace(family,`url(${JSON.stringify(s.url)})`,{weight:String(s.weight)});await face.load();document.fonts.add(face);}));loaded.set(family,promise);try{await promise;}catch(e){loaded.delete(family);throw e;}
}
export function ProjectFonts({state}){const familyKey=JSON.stringify([...new Set([...(state.captions||[]),...(state.graphics||[])].map(c=>c.fontFamily).filter(Boolean))].sort());useEffect(()=>{let alive=true;request('/api/fonts').then(async result=>{for(const family of JSON.parse(familyKey)){if(!alive)return;await ensureFont(family,result.custom);}}).catch(()=>{});return()=>{alive=false;};},[state.id,familyKey]);return null;}
export default function FontPicker({value,onChange,text='伝えたい言葉を、読みやすく。'}){
 const [query,setQuery]=useState(''),[group,setGroup]=useState('すべて'),[custom,setCustom]=useState([]),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const refresh=()=>request('/api/fonts').then(r=>setCustom(r.custom));useEffect(()=>{refresh().catch(e=>setError(e.message));},[]);
 const available=[...['Meiryo','Yu Gothic','Yu Mincho','Arial'].map(family=>({family,label:family,group:'標準',ready:true})),...ARTICLE_FONTS.map(f=>({...f,ready:!!f.files.length||custom.some(c=>c.family===f.family)})),...custom.filter(f=>!ARTICLE_FONTS.some(a=>a.family===f.family)).map(f=>({...f,label:f.family,group:'取り込み',ready:true}))];
 const select=async family=>{setPending(true);try{await ensureFont(family,custom);onChange(family);setError('');}catch{setError('フォントを読み込めません。接続を確認して再選択してください。');}finally{setPending(false);}};
 return <details className="font-browser"><summary>フォントを選ぶ · {available.find(f=>f.family===value)?.label||value}</summary><input aria-label="フォント検索" placeholder="フォント名で検索" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="フォントの分類" value={group} onChange={e=>setGroup(e.target.value)}>{['すべて','標準','ゴシック','明朝','筆文字','デザイン','取り込み'].map(g=><option key={g}>{g}</option>)}</select><div className="font-sample" style={{fontFamily:value}}>{text.slice(0,60)}</div><div className="font-list">{available.filter(f=>(group==='すべて'||f.group===group)&&f.label.toLowerCase().includes(query.toLowerCase())).map(f=><div key={f.family}><button type="button" className={value===f.family?'active':''} disabled={pending||!f.ready} onClick={()=>select(f.family)}>{f.label}<small>{f.ready?'選択できます':'フォントファイルの取り込みが必要'}</small></button>{!f.ready&&<a href={FONT_ARTICLE} target="_blank" rel="noreferrer">紹介記事 ↗</a>}</div>)}</div><label className="button">TTF / OTFを取り込む<input type="file" accept=".ttf,.otf" disabled={pending} className="visually-hidden" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setPending(true);try{const data=new FormData();data.append('font',file);const r=await request('/api/fonts/import',{method:'POST',body:data});await refresh();await ensureFont(r.family,[r]);onChange(r.family);setError('');}catch(err){setError(err.message);}finally{setPending(false);}}}/></label><p className="muted-copy">Adobe Fontsなどは利用契約が必要です。利用できるフォントファイルを取り込んでください。</p>{error&&<p role="alert">{error}</p>}</details>;
}
