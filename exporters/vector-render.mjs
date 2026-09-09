import {Resvg} from '@resvg/resvg-js';
import {renderFontFiles} from '../server/fonts.mjs';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {captionsSvg} from '../server/caption-style.mjs';
import {encodeThreads,PERFORMANCE} from '../server/performance.mjs';
import {vectorSvg} from '../server/vector.mjs';

export async function writeRasterFrame(proc,png){
  if(proc.exitCode!==null&&proc.exitCode!==undefined||proc.stdin.destroyed)throw new Error('合成処理が中断されました。');
  if(proc.stdin.write(png))return;
  await new Promise((resolve,reject)=>{
    const clean=()=>{proc.stdin.off('drain',drain);proc.stdin.off('error',error);proc.stdin.off('close',closed);proc.off('close',closed);};
    const drain=()=>{clean();resolve();},error=e=>{clean();reject(e);},closed=()=>error(new Error('合成処理への送信が中断されました。'));
    proc.stdin.once('drain',drain);proc.stdin.once('error',error);proc.stdin.once('close',closed);proc.once('close',closed);
    if(proc.stdin.destroyed||proc.exitCode!==null&&proc.exitCode!==undefined)closed();
  });
}
export async function renderVectorPass(state,folder,{captions=false,combined=false,crf=18}={}){
  if(captions?!state.captions?.length:!state.graphics?.some(g=>g.type==='vector'))return;
  const target=path.join(folder,'vector-composite.mp4'),source=path.join(folder,'movie.mp4');
  const end=Math.max(0,...[...state.clips,...state.captions,...state.graphics].map(c=>c.start+c.duration));
  const count=Math.ceil(end*state.fps-1e-7);
  const families=new Set([...state.captions,...state.graphics].map(c=>c.fontFamily));
  const systemFiles=['meiryo.ttc',...(families.has('Meiryo')?['meiryob.ttc']:[]),...(families.has('Yu Gothic')?['YuGothR.ttc','YuGothB.ttc']:[]),...(families.has('Yu Mincho')?['yumin.ttf']:[]),...(families.has('Arial')?['arial.ttf','arialbd.ttf']:[])];
  const font=process.platform==='win32'?{loadSystemFonts:false,fontFiles:systemFiles.map(f=>path.join(process.env.WINDIR||'C:/Windows','Fonts',f)),defaultFontFamily:'Meiryo'}:{loadSystemFonts:true,defaultFontFamily:'sans-serif'};
  font.fontFiles=[...(font.fontFiles||[]),...await renderFontFiles([...(state.captions||[]),...(state.graphics||[])].map(item=>item.fontFamily))];
  const proc=spawn(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-y','-threads','1','-i',source,'-f','image2pipe','-framerate',String(state.fps),'-i','pipe:0','-filter_complex_threads',String(PERFORMANCE.filterThreads),'-filter_complex','[0:v][1:v]overlay=shortest=1:format=auto,format=yuv420p[v]','-map','[v]','-map','0:a?','-c:v','libx264','-preset','veryfast','-crf',String(crf),'-threads',encodeThreads(state.width,state.height),'-c:a','copy','-movflags','+faststart',target],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let error='',failed=null;proc.stderr.on('data',d=>{error=(error+d).slice(-6000);});
  const done=new Promise((resolve,reject)=>{proc.on('error',reject);proc.on('close',code=>code===0?resolve():reject(new Error(error||`FFmpeg exit ${code}`)));});
  done.catch(e=>{failed=e;proc.stdin.destroy(e);});proc.stdin.on('error',()=>{});
  const timer=setTimeout(()=>proc.kill(),30*60*1000);
  try{
    let lastSvg,lastPng;
    for(let frame=0;frame<count;frame++){
      if(failed)throw failed;
      const svg=combined?`<svg xmlns="http://www.w3.org/2000/svg" width="${state.width}" height="${state.height}">${vectorSvg(state,frame/state.fps)}${captionsSvg(state,frame/state.fps)}</svg>`:(captions?captionsSvg:vectorSvg)(state,frame/state.fps);
      if(svg!==lastSvg){lastSvg=svg;lastPng=new Resvg(svg,{font}).render().asPng();}
      await writeRasterFrame(proc,lastPng);
      if(frame%10===0)await new Promise(resolve=>setImmediate(resolve));
    }
    proc.stdin.end();await done;
    await fs.rename(target,source);
  }catch(e){proc.kill();await done.catch(()=>{});throw e;}finally{clearTimeout(timer);}
}
