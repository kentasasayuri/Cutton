import {encodeThreads,PERFORMANCE} from '../server/performance.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EFFECT_DEFAULTS } from '../server/clip-effects.mjs';

export const needsLayerRender = state => state.clips.some(c => c.lane>0 || (c.speed??1)!==1 || Object.entries(EFFECT_DEFAULTS).some(([k,v])=>(c[k]??v)!==v));
const n=v=>Number(v.toFixed(7));
// Split at edit boundaries. Only the sources visible in this segment are decoded;
// no full-project frame buffer, and every FFmpeg encoder/filter uses one thread.
export async function renderLayers(state, scratch, run, {lossless=false}={}) {
  const {width:w,height:h,fps}=state;
  const total=Math.ceil(Math.max(0,...[...state.clips,...(state.captions||[]),...(state.graphics||[])].map(c=>c.start+c.duration))*fps-1e-7)/fps;
  if(!total)throw new Error('タイムラインが空です。');
  const clips=state.clips.filter(c=>!c.muted);
  const boundaries=new Set([0,total]);
  clips.forEach(c=>{boundaries.add(c.start);boundaries.add(c.start+c.duration);});
  for(let t=60;t<total;t+=60)boundaries.add(t);
  const points=[...boundaries].sort((a,b)=>a-b),files=[];
  for(let i=0;i<points.length-1;i++){
    const start=points[i],duration=n(points[i+1]-start);if(duration<.5/fps)continue;
    const active=clips.filter(c=>c.start<points[i+1]-1e-6&&c.start+c.duration>start+1e-6).sort((a,b)=>(a.lane||0)-(b.lane||0));
    const inputs=[],filters=[`color=c=black:s=${w}x${h}:r=${fps}:d=${duration}[base]`,`anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[silence]`];
    let last='base';const audio=[];
    active.forEach((raw,index)=>{
      const c={...EFFECT_DEFAULTS,speed:1,...raw},asset=state.assets.find(a=>a.id===c.assetId),offset=start-c.start;
      if(!asset)throw new Error('素材が見つかりません。');
      if(asset.kind==='image')inputs.push('-loop','1','-framerate',String(fps),'-threads','1','-i',asset.path);
      else inputs.push('-ss',String(n(c.in+offset*c.speed)),'-t',String(n(duration*c.speed+.2)),'-threads','1','-i',asset.path);
      const fade=`min(1,min(${c.fadeIn?`(t+${n(offset)})/${c.fadeIn}`:'1'},${c.fadeOut?`(${n(c.duration-offset)}-t)/${c.fadeOut}`:'1'}))`;
      if(c.track==='video'){
        const sw=Math.max(2,Math.round(w*c.scale/2)*2),sh=Math.max(2,Math.round(h*c.scale/2)*2);
        const adjust=`colorchannelmixer=rr=${c.brightness}:gg=${c.brightness}:bb=${c.brightness},eq=contrast=${c.contrast}:saturation=${c.saturation}${c.blur?`,gblur=sigma=${c.blur}`:''}`;
        // Alpha is evaluated at the project's frame time, including partial segments.
        filters.push(`[${index}:v]setpts=(PTS-STARTPTS)/${c.speed},fps=${fps},scale=${sw}:${sh}:force_original_aspect_ratio=decrease,pad=${sw}:${sh}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,${adjust},format=rgba${c.rotation?`,rotate=${c.rotation*Math.PI/180}:ow=rotw(${c.rotation*Math.PI/180}):oh=roth(${c.rotation*Math.PI/180}):c=none`:''},geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${c.opacity}*${fade.replaceAll('t','T')}'[v${index}]`);
        filters.push(`[${last}][v${index}]overlay=x=${n(w*c.x/100)}-w/2:y=${n(h*c.y/100)}-h/2:shortest=0:eof_action=pass[vout${index}]`);last=`vout${index}`;
      }else{
        const tempo=c.speed<.5?`atempo=0.5,atempo=${c.speed/.5}`:c.speed>2?`atempo=2,atempo=${c.speed/2}`:`atempo=${c.speed}`;
        filters.push(`[${index}:a]asetpts=PTS-STARTPTS,${tempo},aresample=48000,volume='${c.gain??1}*${fade}':eval=frame,apad,atrim=duration=${duration}[a${index}]`);audio.push(`[a${index}]`);
      }
    });
    filters.push(`[${last}]trim=duration=${duration},format=yuv420p[vfinal]`);
    filters.push(`[silence]${audio.join('')}amix=inputs=${audio.length+1}:normalize=0:duration=first,alimiter=limit=0.98:level=0:latency=1[afinal]`);
    const file=`layer-${String(i).padStart(5,'0')}.mkv`;
    await run([...inputs,'-filter_complex_threads',String(PERFORMANCE.filterThreads),'-filter_complex',filters.join(';'),'-map','[vfinal]','-map','[afinal]','-t',String(duration),'-c:v','libx264','-preset','veryfast','-crf',lossless?'0':'18','-threads',encodeThreads(state.width,state.height),'-c:a','pcm_s16le',path.join(scratch,file)]);
    files.push(file);
  }
  await fs.writeFile(path.join(scratch,'layers.ffconcat'),'ffconcat version 1.0\n'+files.map(f=>`file '${f}'`).join('\n'));
  await run(['-f','concat','-safe','0','-i',path.join(scratch,'layers.ffconcat'),'-c','copy',path.join(scratch,'layers.mkv')]);
  return {path:path.join(scratch,'layers.mkv'),total};
}
