import {Resvg} from '@resvg/resvg-js';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {captionsSvg} from '../server/caption-style.mjs';
import {encodeThreads,PERFORMANCE} from '../server/performance.mjs';
import {vectorSvg} from '../server/vector.mjs';

export async function renderVectorPass(state,folder,{captions=false,crf=18}={}){
  if(captions?!state.captions?.length:!state.graphics?.some(g=>g.type==='vector'))return;
  const target=path.join(folder,'vector-composite.mp4'),source=path.join(folder,'movie.mp4');
  const end=Math.max(0,...[...state.clips,...state.captions,...state.graphics].map(c=>c.start+c.duration));
  const count=Math.ceil(end*state.fps-1e-7);
  const font=process.platform==='win32'?{loadSystemFonts:false,fontFiles:[path.join(process.env.WINDIR||'C:/Windows','Fonts/meiryo.ttc'),path.join(process.env.WINDIR||'C:/Windows','Fonts/meiryob.ttc'),...['YuGothR.ttc','YuGothB.ttc','yumin.ttf','arial.ttf','arialbd.ttf'].map(f=>path.join(process.env.WINDIR||'C:/Windows','Fonts',f))],defaultFontFamily:'Meiryo'}:{loadSystemFonts:true,defaultFontFamily:'sans-serif'};
  const proc=spawn(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-y','-threads','1','-i',source,'-f','image2pipe','-framerate',String(state.fps),'-i','pipe:0','-filter_complex_threads',String(PERFORMANCE.filterThreads),'-filter_complex','[0:v][1:v]overlay=shortest=1:format=auto,format=yuv420p[v]','-map','[v]','-map','0:a?','-c:v','libx264','-preset','veryfast','-crf',String(crf),'-threads',encodeThreads(state.width,state.height),'-c:a','copy','-movflags','+faststart',target],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let error='',failed=null;proc.stderr.on('data',d=>{error=(error+d).slice(-6000);});
  const done=new Promise((resolve,reject)=>{proc.on('error',reject);proc.on('close',code=>code===0?resolve():reject(new Error(error||`FFmpeg exit ${code}`)));});
  done.catch(e=>{failed=e;proc.stdin.destroy(e);});proc.stdin.on('error',()=>{});
  const timer=setTimeout(()=>proc.kill(),30*60*1000);
  try{
    let lastSvg,lastPng;
    for(let frame=0;frame<count;frame++){
      if(failed)throw failed;
      const svg=(captions?captionsSvg:vectorSvg)(state,frame/state.fps);
      if(svg!==lastSvg){lastSvg=svg;lastPng=new Resvg(svg,{font}).render().asPng();}
      if(!proc.stdin.write(lastPng))await once(proc.stdin,'drain');
      if(frame%10===0)await new Promise(resolve=>setImmediate(resolve));
    }
    proc.stdin.end();await done;
    await fs.rename(target,source);
  }catch(e){proc.kill();await done.catch(()=>{});throw e;}finally{clearTimeout(timer);}
}
