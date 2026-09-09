import React,{useState} from 'react';
import {Field,Button} from './ui';
import {MOTION_PRESETS,motionFrames} from '../server/motion-presets.mjs';
export default function MotionFields({draft,set}){
 const [preset,select]=useState('rise'),[amount,setAmount]=useState(8),[cycles,setCycles]=useState(1),[error,setError]=useState('');
 const single=['rise','bounce','spin'].includes(preset);
 const apply=()=>{try{set('keyframes',motionFrames(preset,draft,{amount,cycles:single?1:cycles}));setError('');}catch(e){setError(e.message);}};
 return <details className="motion-presets"><summary>モーションを組み立てる</summary><div className="effect-fields"><Field label="動き"><select value={preset} onChange={e=>select(e.target.value)}>{MOTION_PRESETS.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field><Field label="動きの幅"><input type="number" min="0" max="40" value={amount} onChange={e=>setAmount(Number(e.target.value))}/></Field><Field label="回数"><input type="number" min="1" max="8" step="1" disabled={single} value={single?1:cycles} onChange={e=>setCycles(Number(e.target.value))}/></Field></div><Button onClick={apply}>キーフレームに展開</Button>{error&&<p className="inline-error">{error}</p>}<p className="muted-copy">適用後は各キーフレーム・ベジェ曲線を個別に調整できます。保存すると反映します。</p></details>;
}
