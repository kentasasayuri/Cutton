import React,{useState} from 'react';
import {Scissors,ArrowUpRight,Power,RefreshCw} from 'lucide-react';

export function Startup({onConnect,waiting=false,detail=''}){
 const [launched,setLaunched]=useState(false);
 return <main className="startup"><section className="startup-card"><div className="startup-brand"><Scissors size={25}/><span>Cutton</span></div>
  <h1>{waiting?'編集エンジンを待っています':'編集をはじめる'}</h1>
  <p>このPCの素材とプロジェクトを開きます。</p>
  <a className="button primary startup-primary" href="cutton://open" onClick={()=>setLaunched(true)}><Power size={17}/>Cuttonを起動</a>
  {launched&&<p role="status">確認が出たら「開く」を選んでください。準備ができるとプロジェクト選択画面が開きます。</p>}
  <a className="button startup-secondary" href="http://127.0.0.1:4318/?launch=projects" rel="noreferrer"><ArrowUpRight size={16}/>起動済みのCuttonを開く</a>
  <details><summary>別の開き方</summary><p>起動ボタンが反応しない場合は、デスクトップの「Cutton」を開いてください。</p>{onConnect&&<button type="button" className="button" onClick={onConnect}><RefreshCw size={14}/>この画面で接続する</button>}<p>この画面で編集する場合のみ、ブラウザのローカルネットワーク接続許可が必要です。</p>{detail&&<p className="startup-detail">{detail}</p>}</details>
 </section></main>;
}
