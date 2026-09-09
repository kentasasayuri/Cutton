import React,{useState,useEffect} from 'react';
import Waveform from './waveform';
export default function WaveformInspector({asset,clip,clock,fps=30}){
 const [zoom,setZoom]=useState(1),[offset,setOffset]=useState(0);useEffect(()=>{setZoom(1);setOffset(0);},[asset?.id,clip?.id]);
 if(!asset||(asset.kind!=='audio'&&!asset.hasAudio))return null;
 const length=clip?.duration||asset.audioDuration||asset.duration,speed=clip?.speed||1,span=length/zoom,start=Math.min(offset,Math.max(0,length-span));
 const view={in:(clip?.in||0)+start*speed,duration:span,speed};
 return <section className="waveform-inspector"><h3>音声の波形</h3><p className="muted-copy">{clip?'波形をクリックすると、その位置へ再生ヘッドを移動します。':'元音声を試聴できます。'} ズーム {zoom}×</p><div role={clip?'slider':undefined} aria-label="波形から再生位置を選択" aria-valuemin={clip?.start} aria-valuemax={clip?clip.start+length:undefined} aria-valuenow={clip?Math.min(clip.start+length,Math.max(clip.start,clock.time)):undefined} tabIndex={clip?0:undefined} onClick={e=>{if(clip){const r=e.currentTarget.getBoundingClientRect();clock.seek(clip.start+start+Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*span);}}} onKeyDown={e=>{if(clip&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();clock.seek(Math.max(clip.start,Math.min(clip.start+length,clock.time+(e.key==='ArrowLeft'?-1:1)/fps)));}}}><Waveform asset={asset} clip={view}/></div><label>波形のズーム<input type="range" min="1" max="32" step="1" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label>{zoom>1&&<label>表示開始 · {start.toFixed(2)}秒<input type="range" min="0" max={length-span} step=".01" value={start} onChange={e=>setOffset(Number(e.target.value))}/></label>}{!clip&&<audio controls preload="none" src={asset.url}/>}</section>;
}
