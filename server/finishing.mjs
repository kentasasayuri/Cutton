import fs from 'node:fs/promises';import path from 'node:path';import {Resvg} from '@resvg/resvg-js';
import {backgroundSvg} from './background-presets.mjs';
import {runProcess,FFMPEG,importMedia} from './media.mjs';
import {numberValue,requireItem} from './util.mjs';
import {mixerSettings,mixerFilters,trackGain} from './audio-mixer.mjs';
const endOf=state=>Math.max(0,...[...state.clips,...state.captions,...state.graphics].map(c=>c.start+c.duration));
const run=args=>runProcess(FFMPEG,['-hide_banner','-loglevel','error','-nostdin','-y',...args],{timeout:1800000});
async function work(dataDir,fn){const root=path.resolve(dataDir,'finishing-work');await fs.mkdir(root,{recursive:true});const folder=await fs.mkdtemp(path.join(root,'job-'));try{return await fn(folder);}finally{if(path.resolve(folder).startsWith(root+path.sep))await fs.rm(folder,{recursive:true,force:true});}}
export async function backgroundAsset(state,args,dataDir){return work(dataDir,async folder=>{const file=path.join(folder,'背景.png');await fs.writeFile(file,new Resvg(backgroundSvg(args.preset,state.width,state.height)).render().asPng());const asset=await importMedia({source:file,dataDir,sceneId:null});asset.provenance={kind:'cutton-background',preset:args.preset};return asset;});}
export function bgmOptions(state,args){
 const asset=requireItem(state.assets,args.assetId,'BGM素材');if(!asset.hasAudio&&asset.kind!=='audio')throw Error('音声のある素材を選択してください。');
 const duration=numberValue(args.duration,'BGMの長さ',{min:1,max:7200,fallback:endOf(state)}),voiceLane=numberValue(args.voiceLane,'声のトラック',{max:7,fallback:0});if(!Number.isInteger(voiceLane))throw Error('声のトラックが不正です。');
 const ducking=args.ducking??true;if(typeof ducking!=='boolean')throw Error('duckingは真偽値です。');
 const voice=state.clips.filter(c=>c.track==='audio'&&(c.lane||0)===voiceLane&&!c.muted&&c.start<duration).sort((a,b)=>a.start-b.start);
 if(ducking&&!voice.length)throw Error('選択したトラックにナレーションを配置してください。');
 if(ducking&&trackGain(mixerSettings(state.audioMixer),voiceLane)===0)throw Error('声のトラックのミュート・ソロ設定を解除してください。');
 if(ducking&&voice.some(c=>c.assetId===asset.id))throw Error('BGM自身を声のトラックに指定できません。');
 const level=numberValue(args.level,'BGMの目標音量',{min:-45,max:-18,fallback:-30}),fadeIn=numberValue(args.fadeIn,'フェードイン',{max:30,fallback:2}),fadeOut=numberValue(args.fadeOut,'フェードアウト',{max:30,fallback:4});
 const sourceDuration=asset.audioDuration||asset.duration;if(sourceDuration<1)throw Error('BGMには1秒以上の音声を選択してください。');
 return {asset,duration,voiceLane,voice,ducking,level,fadeIn:Math.min(fadeIn,duration/2),fadeOut:Math.min(fadeOut,duration/2),sourceDuration};
}
export async function prepareBgm(state,args,dataDir){
 const o=bgmOptions(state,args);return work(dataDir,async folder=>{
  const wav=path.join(folder,'BGM.wav');let music=o.asset.path;
  if(o.sourceDuration<o.duration){
   const d=o.sourceDuration,x=Math.min(2,d/4);music=path.join(folder,'loop.wav');
   await run(['-threads','1','-i',o.asset.path,'-filter_complex_threads','1','-filter_complex',`[0:a]aresample=48000,asplit=3[m][t][h];[m]atrim=start=${x}:end=${d-x},asetpts=PTS-STARTPTS[mid];[t]atrim=start=${d-x}:end=${d},asetpts=PTS-STARTPTS[tail];[h]atrim=duration=${x},asetpts=PTS-STARTPTS[head];[tail][head]acrossfade=d=${x}:c1=tri:c2=tri[seam];[mid][seam]concat=n=2:v=0:a=1[out]`,'-map','[out]','-ac','2','-ar','48000','-c:a','pcm_s24le',music]);
  }
  let guide;
  if(o.ducking){
   const names=[];let cursor=0;const mixer=mixerSettings(state.audioMixer);
   async function segment(duration,clip){if(duration<.00001)return;const name=`voice-${names.length}.wav`,file=path.join(folder,name);let input,filter;
    if(clip){const a=requireItem(state.assets,clip.assetId,'ナレーション素材'),speed=clip.speed||1,tempo=speed<.5?`atempo=.5,atempo=${speed/.5}`:speed>2?`atempo=2,atempo=${speed/2}`:`atempo=${speed}`;input=['-ss',String(clip.in),'-t',String(duration*speed+.1),'-threads','1','-i',a.path];filter=`${tempo},volume=${clip.gain??1},${mixerFilters(mixer,o.voiceLane)}${clip.fadeIn?`,afade=t=in:d=${clip.fadeIn}:curve=${clip.fadeCurve==='equalPower'?'qsin':'tri'}`:''}${clip.fadeOut?`,afade=t=out:st=${Math.max(0,clip.duration-clip.fadeOut)}:d=${clip.fadeOut}:curve=${clip.fadeCurve==='equalPower'?'qsin':'tri'}`:''},apad`;
    }else{input=['-f','lavfi','-i','anullsrc=r=48000:cl=stereo'];filter='anull';}
    await run([...input,'-t',String(duration),'-vn','-af',filter,'-ac','2','-ar','48000','-c:a','pcm_s16le',file]);names.push(name);
   }
   for(const c of o.voice){if(c.start>cursor)await segment(c.start-cursor);await segment(Math.min(c.duration,o.duration-c.start),c);cursor=Math.min(o.duration,c.start+c.duration);}
   if(cursor<o.duration)await segment(o.duration-cursor);
   const list=path.join(folder,'voice.ffconcat');await fs.writeFile(list,'ffconcat version 1.0\n'+names.map(n=>`file '${n}'`).join('\n'));guide=path.join(folder,'voice.wav');await run(['-f','concat','-safe','0','-i',list,'-c','copy',guide]);
  }
  const input=['-stream_loop','-1','-threads','1','-i',music,...(guide?['-threads','1','-i',guide]:[])];
  const filter=`[0:a]atrim=duration=${o.duration},asetpts=PTS-STARTPTS,loudnorm=I=${o.level}:TP=-3:LRA=8,aresample=48000[m];${guide?'[m][1:a]sidechaincompress=threshold=0.04:ratio=3:attack=20:release=450:makeup=1':'[m]anull'},afade=t=in:d=${Math.max(.001,o.fadeIn)},afade=t=out:st=${o.duration-o.fadeOut}:d=${Math.max(.001,o.fadeOut)}[out]`;
  await run([...input,'-filter_complex_threads','1','-filter_complex',filter,'-map','[out]','-t',String(o.duration),'-ar','48000','-ac','2','-c:a','pcm_s24le',wav]);
  const asset=await importMedia({source:wav,dataDir,sceneId:null});asset.name=`BGM調整済み_${path.parse(o.asset.name).name}.wav`;asset.provenance={kind:'cutton-bgm',sourceAssetId:o.asset.id,voiceLane:o.voiceLane,ducking:o.ducking,level:o.level,fadeIn:o.fadeIn,fadeOut:o.fadeOut,voiceClips:o.voice.map(c=>({...c})),note:'声の配置を変更した場合はBGMを作り直してください。'};return asset;
 });
}
