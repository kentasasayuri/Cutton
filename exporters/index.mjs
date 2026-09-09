import {encodeThreads} from '../server/performance.mjs';
import {toFcpxml} from './fcpxml.mjs';
import fs from 'node:fs/promises';
import { renderVectorPass } from './vector-render.mjs';
import { needsLayerRender, renderLayers } from './layers.mjs';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { ZipArchive } from 'archiver';
import { toAss, toCaptionsSrt } from '../server/overlays.mjs';
export { toCaptionsSrt } from '../server/overlays.mjs';

const xml = value => String(value ?? '').replace(/[<>&"']/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]));
const safeName = value => String(value).replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 80) || 'media';
const byTime = (a,b) => a.start - b.start;
const frames = (seconds, fps) => Math.round(seconds * fps + 1e-7);
const endTime = state => Math.max(0, ...[...state.clips, ...(state.captions ?? []), ...(state.graphics ?? [])].map(c => c.start + c.duration));
function quantizedState(state) {
  return {...state,clips:state.clips.map(c=>{
    const startFrame=frames(c.start,state.fps),endFrame=frames(c.start+c.duration,state.fps);
    if(endFrame<=startFrame) throw new Error('1フレームより短いクリップは書き出せません。尺を調整してください。');
    return {...c,start:startFrame/state.fps,duration:(endFrame-startFrame)/state.fps};
  })};
}
export async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function assetFor(state, clip) {
  const asset = state.assets.find(a => a.id === clip.assetId);
  if (!asset) throw new Error(`素材が見つかりません: ${clip.assetId}`);
  return asset;
}
const rational = (seconds, fps) => ({ OTIO_SCHEMA:'RationalTime.1', value:frames(seconds,fps), rate:fps });
const range = (start,duration,fps) => ({ OTIO_SCHEMA:'TimeRange.1', start_time:rational(start,fps), duration:rational(duration,fps) });

export function toOtio(state, resolvePath = asset => pathToFileURL(asset.path).href) {
  state=quantizedState(state);
  const tracks = ['video','audio'].map(kind => {
    let cursor = 0;
    const children = [];
    for (const clip of state.clips.filter(c => c.track === kind).sort(byTime)) {
      if (frames(clip.start,state.fps) > frames(cursor,state.fps)) children.push({ OTIO_SCHEMA:'Gap.1', name:'Gap', metadata:{}, effects:[], markers:[], source_range:range(0,clip.start-cursor,state.fps) });
      const asset = assetFor(state,clip);
      children.push({ OTIO_SCHEMA:'Clip.2', name:asset.name, metadata:{yachicut:{sceneId:clip.sceneId,sha256:asset.sha256,gain:clip.gain,muted:clip.muted}}, effects:[], markers:[], enabled:!clip.muted,
        source_range:range(clip.in,clip.duration,state.fps), active_media_reference_key:'DEFAULT_MEDIA',
        media_references:{DEFAULT_MEDIA:{ OTIO_SCHEMA:'ExternalReference.1', name:asset.name, metadata:{}, target_url:resolvePath(asset), available_range:range(0,Math.max(asset.duration||0,clip.in+clip.duration),state.fps), available_image_bounds:null }} });
      cursor = clip.start + clip.duration;
    }
    return { OTIO_SCHEMA:'Track.1', name:kind === 'video' ? 'V1' : 'A1', kind:kind === 'video' ? 'Video' : 'Audio', metadata:{}, source_range:null, effects:[], markers:[], children };
  });
  return { OTIO_SCHEMA:'Timeline.1', name:state.name, metadata:{yachicut:{projectId:state.id,storyboard:state.storyboard,captions:state.captions??[],graphics:state.graphics??[]}}, global_start_time:rational(0,state.fps), tracks:{OTIO_SCHEMA:'Stack.1',name:'Tracks',metadata:{},source_range:null,effects:[],markers:[],children:tracks} };
}

// FCP 7 XML (xmeml), supported by Premiere/Resolve. This is not Final Cut Pro X .fcpxml.
export function toFcp7(state, resolvePath = asset => pathToFileURL(asset.path).href) {
  const fps = state.fps;
  const rate = `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`;
  const sample = `<samplecharacteristics>${rate}<width>${state.width}</width><height>${state.height}</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics>`;
  const track = kind => state.clips.filter(c => c.track === kind).sort(byTime).map(c => {
    const a = assetFor(state,c);
    const duration = Math.max(a.duration || 0,c.in+c.duration);
    const sourceFps = kind === 'video' && a.fps > 0 ? a.fps : fps;
    const sourceRate = `<rate><timebase>${Math.round(sourceFps)}</timebase><ntsc>${Math.abs(sourceFps-Math.round(sourceFps)*1000/1001)<0.01?'TRUE':'FALSE'}</ntsc></rate>`;
    const sourceMedia = kind === 'video' ? `<video><samplecharacteristics>${sourceRate}<width>${a.width||state.width}</width><height>${a.height||state.height}</height></samplecharacteristics></video>` : '<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>';
    const gain = kind === 'audio' ? `<filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid><effectcategory>audiolevels</effectcategory><effecttype>audio</effecttype><mediatype>audio</mediatype><parameter><parameterid>level</parameterid><name>Level</name><value>${c.gain??1}</value></parameter></effect></filter>` : '';
    return `<clipitem id="clip-${xml(c.id)}"><name>${xml(a.name)}</name><enabled>${c.muted?'FALSE':'TRUE'}</enabled><duration>${frames(duration,sourceFps)}</duration>${sourceRate}<start>${frames(c.start,fps)}</start><end>${frames(c.start+c.duration,fps)}</end><in>${frames(c.in,sourceFps)}</in><out>${frames(c.in+c.duration,sourceFps)}</out>${kind==='video'&&a.kind==='image'?'<stillframe>TRUE</stillframe>':''}<file id="file-${xml(c.id)}"><name>${xml(a.name)}</name><pathurl>${xml(resolvePath(a))}</pathurl>${sourceRate}<duration>${frames(duration,sourceFps)}</duration><media>${sourceMedia}</media></file><sourcetrack><mediatype>${kind}</mediatype><trackindex>1</trackindex></sourcetrack>${gain}<comments><lognote>${xml(c.sceneId || '')}</lognote></comments></clipitem>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="5"><sequence id="${xml(state.id)}"><name>${xml(state.name)}</name><duration>${frames(endTime(state),fps)}</duration>${rate}<timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode><media><video><format>${sample}</format><track>${track('video')}</track></video><audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format><track>${track('audio')}</track></audio></media></sequence></xmeml>`;
}
export function timecode(seconds,fps) {
  let n = frames(seconds,fps);
  const f=n%fps; n=Math.floor(n/fps);
  const s=n%60; n=Math.floor(n/60);
  const m=n%60; const h=Math.floor(n/60);
  return [h,m,s,f].map(x=>String(x).padStart(2,'0')).join(':');
}
export function toEdl(state) {
  return `TITLE: ${state.name.replace(/[\r\n]/g,' ')}\nFCM: NON-DROP FRAME\n\n` + state.clips.filter(c=>c.track==='video'&&!c.muted).sort(byTime).map((c,i)=>{
    const a=assetFor(state,c); const reel=String(i+1).padStart(3,'0');
    return `${reel}  ${('R'+reel).padEnd(8)} V     C        ${timecode(c.in,state.fps)} ${timecode(c.in+c.duration,state.fps)} ${timecode(c.start,state.fps)} ${timecode(c.start+c.duration,state.fps)}\n* FROM CLIP NAME: ${a.name.replace(/[\r\n]/g,' ')}\n* SOURCE FILE: ${a.path}\n`;
  }).join('\n');
}
function srtTime(seconds) { const ms=Math.round(seconds*1000); return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`; }
export function toSrt(state) {
  let cursor=0; let i=0;
  return [...state.storyboard].sort((a,b)=>a.order-b.order).map(s=>{
    const related=state.clips.filter(c=>c.sceneId===s.id);
    const start=related.length?Math.min(...related.map(c=>c.start)):cursor;
    const end=related.length?Math.max(...related.map(c=>c.start+c.duration)):start+s.duration;
    cursor=end;
    if(!s.narration?.trim()) return '';
    return `${++i}\n${srtTime(start)} --> ${srtTime(end)}\n${s.narration.trim()}\n\n`;
  }).join('');
}
async function writeJson(file,value) { await fs.writeFile(file,JSON.stringify(value,null,2),'utf8'); }
function runFfmpeg(args, options = {}) {
  return new Promise((resolve,reject)=>{
    const proc=spawn(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',...args],{windowsHide:true,...options});
    let stderr=''; const timer=setTimeout(()=>{proc.kill();reject(new Error('FFmpeg処理が30分を超えました。'));},30*60*1000);
    proc.stderr.on('data',d=>{stderr=(stderr+d).slice(-8000);});
    proc.on('error',e=>{clearTimeout(timer);reject(new Error(`FFmpegを起動できません: ${e.message}`));});
    proc.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error(`FFmpeg: ${stderr||`exit ${code}`}`));});
  });
}
async function prepareOverlayFilter(state, scratch) {
  state={...state,graphics:(state.graphics||[]).filter(g=>!['vector','null'].includes(g.type))};
  if (!(state.captions?.length || state.graphics?.length)) return null;
  const candidates = [
    ...(process.env.CUTTON_FONT_PATH ? [[process.env.CUTTON_FONT_PATH, process.env.CUTTON_FONT_FAMILY || 'Meiryo']] : []),
    [path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'meiryo.ttc'), 'Meiryo'],
    ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 'Noto Sans CJK JP'],
    ['/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', 'Noto Sans CJK JP'],
    ['/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc', 'Hiragino Sans'],
  ];
  let selected;
  for (const [file, family] of candidates) {
    try { if ((await fs.stat(file)).isFile()) { selected = { file, family }; break; } } catch { /* Try the next installed Japanese font. */ }
  }
  // Explicit font loading also works when FFmpeg has no system font provider.
  if (!selected) throw new Error('日本語字幕フォントが見つかりません。CUTTON_FONT_PATH と CUTTON_FONT_FAMILY を設定してください。');
  const fonts = path.join(scratch, 'fonts');
  await fs.mkdir(fonts);
  await fs.copyFile(selected.file, path.join(fonts, `overlay${path.extname(selected.file) || '.ttf'}`));
  // Meiryo stores its real 700-weight face in a separate TTC. Loading only the
  // regular collection makes libass fall back to a light/synthetic bold face.
  const boldCandidates = [
    ...(process.env.CUTTON_FONT_BOLD_PATH ? [process.env.CUTTON_FONT_BOLD_PATH] : []),
    ...(selected.family === 'Meiryo' ? [path.join(path.dirname(selected.file), 'meiryob.ttc')] : []),
    ...(selected.family === 'Noto Sans CJK JP' ? [path.join(path.dirname(selected.file), 'NotoSansCJK-Bold.ttc')] : []),
  ];
  for (const file of boldCandidates) {
    try {
      if (!(await fs.stat(file)).isFile()) continue;
      await fs.copyFile(file, path.join(fonts, `overlay-bold${path.extname(file) || '.ttf'}`));
      break;
    } catch { /* The regular face remains usable if no bold font is installed. */ }
  }
  await fs.writeFile(path.join(scratch, 'overlays.ass'), toAss(state, { fontFamily: selected.family }), 'utf8');
  // Fixed relative filenames avoid FFmpeg filter escaping of Windows drive
  // letters, quotes and arbitrary project names. No user text enters a filter.
  return 'ass=filename=overlays.ass:fontsdir=fonts';
}
async function render(state,folder) {
  state=quantizedState(state);
  const scratch=path.resolve(folder,'render-work');
  if(path.dirname(scratch)!==path.resolve(folder)) throw new Error('Invalid render directory');
  await fs.mkdir(scratch);
  try {
    const vectors=state.graphics?.some(g=>g.type==='vector'),captions=Boolean(state.captions?.length);
    const legacy={...state,captions:[]};
    const standard=state.graphics?.some(g=>!['vector','null'].includes(g.type));
    const composite=vectors||captions||standard;
    await renderSegments(state,folder,scratch,composite);
    const combined=vectors&&captions&&!standard;
    if(vectors)await renderVectorPass(state,folder,{combined,crf:combined?18:standard||captions?0:18});
    if(standard){
      const filter=await prepareOverlayFilter(legacy,scratch);
      if(filter){const temporary=path.join(folder,'title-composite.mp4');await runFfmpeg(['-i',path.join(folder,'movie.mp4'),'-vf',filter,'-c:v','libx264','-crf',captions?'0':'18','-preset','veryfast','-threads',encodeThreads(state.width,state.height),'-c:a','copy','-movflags','+faststart',temporary],{cwd:scratch});await fs.rename(temporary,path.join(folder,'movie.mp4'));}
    }
    if(captions&&!combined)await renderVectorPass(state,folder,{captions:true,crf:18});
  }
  finally { await fs.rm(scratch,{recursive:true,force:true}); }
}
async function renderSegments(state,folder,scratch,deferOverlays=false) {
  const end=endTime(state);
  const total=end>0?Math.max(1,Math.ceil(end * state.fps - 1e-7)) / state.fps:0;
  if(!total) throw new Error('タイムラインに素材を追加してください。');
  const fps=state.fps; const w=state.width; const h=state.height;
  const overlayFilter=deferOverlays?null:await prepareOverlayFilter(state,scratch);
  if(needsLayerRender(state)) {
    const layers=await renderLayers(state,scratch,runFfmpeg,{lossless:deferOverlays});
    await runFfmpeg(['-i',layers.path,...(overlayFilter?['-vf',overlayFilter,'-c:v','libx264','-crf',deferOverlays?'0':'18','-preset','veryfast','-threads',encodeThreads(state.width,state.height)]:['-c:v','copy']),'-c:a','aac','-b:a','192k','-t',String(layers.total),'-movflags','+faststart',path.join(folder,'movie.mp4')],{cwd:scratch});
    return;
  }
  const vclips=state.clips.filter(c=>c.track==='video'&&!c.muted).sort(byTime);
  const vsegments=[]; let cursor=0;
  async function videoSegment(duration,clip=null) {
    if(duration<1/fps/2) return;
    const name=`v${String(vsegments.length).padStart(5,'0')}.mp4`;
    const target=path.join(scratch,name);
    const a=clip?assetFor(state,clip):null;
    const input=a?(a.kind==='image'?['-loop','1','-framerate',String(fps),'-i',a.path]:['-ss',String(clip.in),'-i',a.path]):['-f','lavfi','-i',`color=c=black:s=${w}x${h}:r=${fps}`];
    await runFfmpeg([...input,'-t',String(duration),'-an','-vf',`scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p`,'-c:v','libx264','-preset','veryfast','-crf',deferOverlays?'0':'18','-threads',encodeThreads(state.width,state.height),target]);
    vsegments.push(name);
  }
  for(const c of vclips) { if(c.start>cursor) await videoSegment(c.start-cursor); await videoSegment(c.duration,c); cursor=c.start+c.duration; }
  if(total>cursor) await videoSegment(total-cursor);
  await fs.writeFile(path.join(scratch,'video.ffconcat'),'ffconcat version 1.0\n'+vsegments.map(n=>`file '${n}'`).join('\n'));
  await runFfmpeg(['-f','concat','-safe','0','-i',path.join(scratch,'video.ffconcat'),'-c','copy',path.join(scratch,'video.mp4')]);
  const videoEncoding=overlayFilter?['-vf',overlayFilter,'-c:v','libx264','-preset','veryfast','-crf',deferOverlays?'0':'18','-threads',encodeThreads(state.width,state.height),'-pix_fmt','yuv420p']:['-c:v','copy'];
  const aclips=state.clips.filter(c=>c.track==='audio'&&!c.muted).sort(byTime);
  if(!aclips.length) {
    if(overlayFilter) await runFfmpeg(['-i',path.join(scratch,'video.mp4'),'-an',...videoEncoding,'-movflags','+faststart',path.join(folder,'movie.mp4')],{cwd:scratch});
    else await fs.copyFile(path.join(scratch,'video.mp4'),path.join(folder,'movie.mp4'));
    return;
  }
  const asegments=[]; cursor=0;
  async function audioSegment(duration,clip=null) {
    if(duration<=0.0001) return;
    const name=`a${String(asegments.length).padStart(5,'0')}.wav`;
    const a=clip?assetFor(state,clip):null;
    await runFfmpeg([...(a?['-ss',String(clip.in),'-i',a.path]:['-f','lavfi','-i','anullsrc=r=48000:cl=stereo']),'-t',String(duration),'-vn','-af',`volume=${clip?.gain??1},apad`,'-ar','48000','-ac','2','-c:a','pcm_s16le',path.join(scratch,name)]);
    asegments.push(name);
  }
  for(const c of aclips){if(c.start>cursor)await audioSegment(c.start-cursor);await audioSegment(c.duration,c);cursor=c.start+c.duration;}
  if(total>cursor)await audioSegment(total-cursor);
  await fs.writeFile(path.join(scratch,'audio.ffconcat'),'ffconcat version 1.0\n'+asegments.map(n=>`file '${n}'`).join('\n'));
  await runFfmpeg(['-i',path.join(scratch,'video.mp4'),'-f','concat','-safe','0','-i',path.join(scratch,'audio.ffconcat'),'-map','0:v:0','-map','1:a:0',...videoEncoding,'-c:a','aac','-b:a','192k','-t',String(total),'-movflags','+faststart',path.join(folder,'movie.mp4')],{cwd:scratch});
}
async function zipFolder(folder,target) {
  await new Promise((resolve,reject)=>{
    const output=createWriteStream(target); const archive=new ZipArchive({zlib:{level:1}});
    output.on('close',resolve); output.on('error',reject); archive.on('error',reject);
    archive.pipe(output); archive.directory(folder,false); archive.finalize();
  });
}

export async function exportProject(state,{format='bundle',dataDir}) {
  if(!['bundle','otio','fcpxml','fcpmodern','edl','render','clips'].includes(format)) throw new Error('未対応の書き出し形式です。');
  const exportsDir=path.resolve(dataDir,'exports');await fs.mkdir(exportsDir,{recursive:true});
  const name=`${safeName(state.name)}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,6)}`;
  const folder=path.join(exportsDir,name);await fs.mkdir(folder);
  const warnings=[];
  if(format!=='render'&&(state.audioMixer||state.clips.some(c=>c.keyEnabled)))warnings.push('トラックミキサーとクロマキーはCuttonプロジェクトJSONに保持します。XML/OTIOでは再現しません。見た目と音を引き継ぐにはMP4を使用してください。');
  if(needsLayerRender(state)&&!['render','bundle','clips','fcpmodern'].includes(format))throw new Error('複数トラック・速度・エフェクトを含む編集は FCPXML、MP4 またはプロジェクトバンドルで書き出してください。');
  const sidecars=[];
  if(state.captions?.length){const file=path.join(folder,'captions.srt');await fs.writeFile(file,toCaptionsSrt(state),'utf8');sidecars.push(file);}
  if(state.captions?.length||state.graphics?.length){
    const file=path.join(folder,'overlays.json');await writeJson(file,{version:1,captions:state.captions??[],graphics:state.graphics??[]});sidecars.push(file);
    if(format!=='render') warnings.push('字幕・モーショングラフィックスはXML/OTIO/EDLに映像効果として移行しません。見た目を含めるにはMP4を使用してください。字幕テキストはcaptions.srt、編集設定はoverlays.jsonに保存します。');
  }
  let target;
  if(format==='render'){
    warnings.push('MP4はH.264/AACに再エンコードします。元素材は保持されます。映像の元音声は使用せず、音声トラックを使用します。');
    await render(state,folder); target=path.join(folder,'movie.mp4');
  } else if(format==='fcpmodern'){target=path.join(folder,'timeline.fcpxml');await fs.writeFile(target,toFcpxml(state),'utf8');warnings.push('FCPXML 1.10。素材・レーン・速度・変形を保存します。カラー、フェード、グラフィックスはCutton設定に保持します。Final Cut Pro本体での読み込みは未検証です。');
  } else if(format==='otio'){
    target=path.join(folder,'timeline.otio'); await writeJson(target,toOtio(state));
    warnings.push('音量はCuttonメタデータに保存します。読み込み先によって音量・ミュートの再設定が必要です。');
  } else if(format==='fcpxml'){
    target=path.join(folder,'timeline.xml'); await fs.writeFile(target,toFcp7(state));
    warnings.push('FCP 7 XML (.xml)です。Premiere/Resolveでの素材再リンク・音量・静止画の確認が必要です。');
  } else if(format==='edl'){
    target=path.join(folder,'timeline.edl');await fs.writeFile(target,toEdl(state));
    warnings.push('EDLは映像のカット位置のみです。音声・音量・静止画・効果は移行しません。');
    if(state.clips.some(c=>c.track==='video'&&assetFor(state,c).fps&&Math.abs(assetFor(state,c).fps-state.fps)>0.01)) warnings.push('異なるフレームレートの素材はEDLでの再リンク時にコンフォームが必要です。XMLの利用を推奨します。');
  } else {
    const originals=path.join(folder,'sources');await fs.mkdir(originals);
    const manifest=[];const paths=new Map();
    const assets=format==='clips'?state.assets.filter(a=>state.clips.some(c=>c.assetId===a.id)):state.assets;
    for(const a of assets){
      const relative=`sources/${safeName(a.id)}-${safeName(a.name)}`; const copied=path.join(folder,relative);
      await fs.copyFile(a.path,copied);const sha256=await hashFile(copied);
      if(a.sha256&&sha256!==a.sha256)throw new Error(`素材 ${a.name} のハッシュが登録時から変わっています。整合性チェックを実行してください。`);
      paths.set(a.id,relative);manifest.push({assetId:a.id,name:a.name,path:relative,sha256,streamHashes:a.streamHashes,source:'original-bytes'});
    }
    const portable={...state,assets:assets.map(a=>({...a,path:paths.get(a.id),url:undefined})),settings:{...state.settings,codexModel:state.settings?.codexModel||''}};
    await writeJson(path.join(folder,'project.cutton.json'),portable);
    await writeJson(path.join(folder,'manifest.json'),{version:1,createdAt:new Date().toISOString(),originalsUnchanged:true,files:manifest});
    await fs.writeFile(path.join(folder,'timeline.fcpxml'),toFcpxml({...state,assets},a=>pathToFileURL(path.join(folder,paths.get(a.id))).href));
    if(!needsLayerRender(state)){
    await writeJson(path.join(folder,'timeline.otio'),toOtio(state,a=>paths.get(a.id)));
    await fs.writeFile(path.join(folder,'timeline.xml'),toFcp7(state,a=>pathToFileURL(path.join(folder,paths.get(a.id))).href));
    await fs.writeFile(path.join(folder,'timeline.edl'),toEdl(state));
    }else warnings.push('複数トラック・速度・エフェクトを含むため、基本形式のXML/OTIO/EDLは省略しています。timeline.fcpxml と project.cutton.json を使用してください。');
    await fs.writeFile(path.join(folder,'narration.srt'),toSrt(state));
    await writeJson(path.join(folder,'edit-list.json'),state.clips.map(c=>({...c,source:paths.get(c.assetId)})));
    await fs.writeFile(path.join(folder,'README.txt'),`Cutton / ${state.name}\n\n元素材は再エンコードせずコピー。manifest.jsonのSHA-256で照合できます。\nproject.cutton.json: アプリのプロジェクト保存形式。\ntimeline.fcpxml: Final Cut Pro向けFCPXML 1.10。\n以下の3形式は単純なカット編集の場合のみ同梱します。\ntimeline.xml: Premiere / Resolve向けFCP 7 XML。素材はsourcesから再リンクしてください。\ntimeline.otio: OTIO対応アプリ用。音量はメタデータなので読み込み後の再設定が必要な場合があります。\ntimeline.edl: 映像カットのみ。\nnarration.srt: ストーリーボード台本と編集位置の字幕。\nedit-list.json: 開始秒・素材内の開始秒・尺・トラック・音量。\n\nCapCutは他社プロジェクト直接読み込み非対応。sourcesとSRTを読み込み、編集表に従い配置してください。\n個別素材は元素材の全長コピーです。フレーム精度のトリミング動画が必要ならMP4書き出しを使用してください。\nAI台本や映像の完成・採用は自動判断されません。\n`);
    if(state.captions?.length||state.graphics?.length) await fs.appendFile(path.join(folder,'README.txt'),'\n字幕・モーショングラフィックス\ncaptions.srt: タイムラインで編集した字幕。位置・色・アニメーションはSRTに含まれません。\noverlays.json: 字幕・グラフィックス・キーフレームの編集設定。project.cutton.jsonにも保存しています。\nXML / OTIO / EDLはこれらを映像効果として復元しません。完成した見た目を渡すにはMP4を書き出してください。\n','utf8');
    target=folder+'.zip';await zipFolder(folder,target);
    warnings.push('CapCutでは個別素材と字幕を読み込み、編集表を見て配置してください。個別素材は無加工の全長コピーです。');
  }
  const rel=path.relative(exportsDir,target).split(path.sep).join('/');
  return {path:target,url:`/api/download?path=${encodeURIComponent(rel)}`,warnings,format,files:sidecars.map(file=>({name:path.basename(file),path:file,url:`/api/download?path=${encodeURIComponent(path.relative(exportsDir,file).split(path.sep).join('/'))}`}))};
}
