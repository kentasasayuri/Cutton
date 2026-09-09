import React, {memo,useEffect,useRef,useState} from 'react';
import {usePreviewMedia} from './preview-media';
import {syncMediaElement} from './playback';
import {clipStyle} from '../server/clip-effects.mjs';

const MediaLayer=memo(function MediaLayer({clip,asset,clock,width,onError}){
  const ref=useRef(null),lastSeek=useRef(-1);
  const preview=usePreviewMedia(clip.track==='video'?asset:null,clock);
  useEffect(()=>{
    const update=()=>{
      const element=ref.current;if(!element)return;
      if(clip.track==='video'){
        const style=clipStyle(clip,clock.time);
        const ratio=element.parentElement.clientWidth/width;
        style.filter=style.filter.replace(/blur\(([^p]+)px\)/,(_,v)=>`blur(${Number(v)*ratio}px)`);
        Object.assign(element.style,style);
      }
      if(asset.kind!=='image')syncMediaElement({element,clip,asset,clock,explicitSeek:lastSeek.current!==clock.seekVersion,silent:clip.track==='video',onError});
      lastSeek.current=clock.seekVersion;
    };update();const off=clock.subscribe(update);return()=>{off();ref.current?.pause?.();};
  },[clip,asset,clock,width,preview.url]);
  const props={ref,'data-asset':asset.id,preload:'metadata',onCanPlay:()=>clock.notify(),onError:()=>onError('素材のプレビューに失敗しました。'),className:'media-layer'};
  if(clip.track==='audio')return <audio {...props} src={asset.url}/>;
  if(asset.kind==='image')return <img {...props} src={asset.url} alt={asset.name} style={clipStyle(clip,clock.time)}/>;
  if(!preview.url)return <span className="layer-loading">{preview.proxy?.error||'プレビューを準備中…'}</span>;
  return <video {...props} src={preview.url} muted playsInline style={clipStyle(clip,clock.time)}/>;
});
export default function MediaLayers({state,clock,onError}){
  const [ids,setIds]=useState([]),last=useRef('');
  useEffect(()=>{const update=()=>{const active=state.clips.filter(c=>!c.muted&&c.start<=clock.time&&c.start+c.duration>clock.time).sort((a,b)=>(a.lane||0)-(b.lane||0));const key=active.map(c=>c.id).join('|');if(last.current!==key){last.current=key;setIds(active.map(c=>c.id));}};update();return clock.subscribe(update);},[state.clips,clock]);
  return <div className="media-layers">{ids.map(id=>{const clip=state.clips.find(c=>c.id===id),asset=clip&&state.assets.find(a=>a.id===clip.assetId);return asset&&<MediaLayer key={id} clip={clip} asset={asset} clock={clock} width={state.width} onError={onError}/>;})}</div>;
}
