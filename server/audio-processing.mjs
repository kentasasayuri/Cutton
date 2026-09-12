import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {importMedia,runProcess,FFMPEG} from './media.mjs';import {requireItem} from './util.mjs';import {processOptions,processingFilters} from './audio-processing-options.mjs';
export async function processAudio(state,{ids,options},dataDir){
 if(!Array.isArray(ids)||!ids.length||ids.length>64||new Set(ids).size!==ids.length)throw Error('音声クリップを1〜64個選択してください。');
 const settings=processOptions(options),jobs=ids.map(id=>{
  const clip=requireItem(state.clips,id,'音声クリップ');if(clip.track!=='audio')throw Error('処理対象は音声トラックのクリップです。');
  const current=requireItem(state.assets,clip.assetId,'素材'),p=current.provenance;
  const source=p?.kind==='cutton-audio-process'?requireItem(state.assets,p.sourceAssetId,'元音声'):current;
  const sourceIn=clip.in+(p?.kind==='cutton-audio-process'?p.sourceIn:0),duration=clip.duration*(clip.speed||1);
  if(!source.hasAudio&&source.kind!=='audio')throw Error('元の素材に音声がありません。');
  if(typeof sourceIn!=='number'||!Number.isFinite(sourceIn)||sourceIn<0||!Number.isFinite(duration)||duration<=0)throw Error('音声の使用範囲が不正です。');
  if(sourceIn+duration>(source.audioDuration||source.duration)+.001)throw Error('元音声の長さを超えています。');
  const key=createHash('sha256').update(JSON.stringify({hash:source.sha256,sourceIn,duration,settings,version:1})).digest('hex');return {clip,source,sourceIn,duration,key};
 });
 if(state.assets.length+jobs.length>5000||jobs.reduce((n,j)=>n+j.duration,0)>7200)throw Error('1回の処理は合計2時間以内、素材は5000個以内です。');
 const root=path.resolve(dataDir,'audio-process-work');await fs.mkdir(root,{recursive:true});const folder=await fs.mkdtemp(path.join(root,'job-'));
 try{for(const j of jobs){let asset=state.assets.find(a=>a.provenance?.kind==='cutton-audio-process'&&a.provenance.key===j.key);
  if(!asset){const file=path.join(folder,`${j.key}.wav`);
   // Round up to a PCM sample so fractional-speed clips retain their last frame on reload.
   const sampleDuration=Math.ceil(j.duration*48000)/48000;
   await runProcess(FFMPEG,['-v','error','-nostdin','-y','-threads','1','-ss',String(j.sourceIn),'-i',j.source.path,'-vn','-map','0:a:0','-af',`atrim=duration=${j.duration},asetpts=PTS-STARTPTS,${processingFilters(settings)},apad`,'-t',String(sampleDuration),'-filter_threads','1','-ar','48000','-ac','2','-c:a','pcm_s24le',file],{timeout:1800000});
   asset=await importMedia({source:file,dataDir,sceneId:j.clip.sceneId});asset.name=`音声調整_${j.source.name.replace(/\.[^.]+$/,'')}.wav`;asset.provenance={kind:'cutton-audio-process',key:j.key,sourceAssetId:j.source.id,sourceIn:j.sourceIn,duration:j.duration,options:settings};state.assets.push(asset);
  }
  j.clip.assetId=asset.id;j.clip.in=0;
 }return {count:jobs.length,clipIds:ids,note:'調整音を24bit / 48kHzで保存しました。再調整は元音声から行います。'};
 }finally{if(path.resolve(folder).startsWith(root+path.sep))await fs.rm(folder,{recursive:true,force:true});}
}
