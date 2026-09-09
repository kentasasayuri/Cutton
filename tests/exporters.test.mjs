import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {toOtio,toFcp7,toEdl,toSrt,timecode,hashFile,exportProject} from '../exporters/index.mjs';
const exec=promisify(execFile);
const fixture=()=>({id:'p1',name:'Film <test>',fps:30,width:320,height:180,storyboard:[{id:'s1',order:0,duration:2,title:'First',narration:'日本語のナレーション'}],settings:{},assets:[{id:'a1',name:'source & one.mp4',kind:'video',path:path.resolve('example.mp4'),duration:5,width:320,height:180}],clips:[{id:'c1',assetId:'a1',sceneId:'s1',track:'video',start:1,in:0.5,duration:2,gain:1,muted:false}],jobs:[],decisions:[]});
test('OTIO preserves gaps, trims, media reference and track separation',()=>{
  const doc=toOtio(fixture());const video=doc.tracks.children[0];
  assert.equal(video.children[0].OTIO_SCHEMA,'Gap.1');
  assert.equal(video.children[0].source_range.duration.value,30);
  assert.equal(video.children[1].source_range.start_time.value,15);
  assert.equal(video.children[1].source_range.duration.value,60);
  assert.equal(doc.tracks.children[1].kind,'Audio');
  assert.match(video.children[1].media_references.DEFAULT_MEDIA.target_url,/^file:/);
});
test('FCP7 uses xmeml, escapes XML and preserves frame boundaries',()=>{
  const result=toFcp7(fixture());
  assert.match(result,/<xmeml version="5">/);
  assert.match(result,/Film &lt;test&gt;/);
  assert.match(result,/source &amp; one.mp4/);
  assert.match(result,/<start>30<\/start><end>90<\/end><in>15<\/in><out>75<\/out>/);
});
test('OTIO rounds absolute cut boundaries without cumulative drift',()=>{
  const state=fixture();state.clips=[0,0.15,0.3].map((start,i)=>({id:'v'+i,assetId:'a1',track:'video',start,in:0,duration:0.15,gain:1}));
  const clips=toOtio(state).tracks.children[0].children;
  assert.equal(clips.reduce((sum,c)=>sum+c.source_range.duration.value,0),14);
});
test('EDL has source and record timecodes; subtitles follow actual clip placement',()=>{
  assert.equal(timecode(3661.5,30),'01:01:01:15');
  assert.match(toEdl(fixture()),/00:00:00:15 00:00:02:15 00:00:01:00 00:00:03:00/);
  assert.match(toSrt(fixture()),/00:00:01,000 --> 00:00:03,000/);
});
test('bundle copies exact source bytes and reports CapCut limits',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yachicut-export-'));
  const state=fixture();state.assets[0].path=path.join(dir,'source.mp4');
  await fs.writeFile(state.assets[0].path,Buffer.from('immutable original bytes'));
  state.assets[0].sha256=await hashFile(state.assets[0].path);
  const result=await exportProject(state,{format:'bundle',dataDir:dir});
  assert.ok((await fs.stat(result.path)).size>100);
  const manifest=JSON.parse(await fs.readFile(path.join(result.path.slice(0,-4),'manifest.json')));
  assert.equal(manifest.files[0].sha256,state.assets[0].sha256);
  assert.equal(await hashFile(path.join(result.path.slice(0,-4),manifest.files[0].path)),state.assets[0].sha256);
  assert.ok(result.warnings.some(x=>x.includes('CapCut')));
  assert.match(result.url,/^\/api\/download\?path=/);
});
test('changed originals block preservation export',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yachicut-integrity-'));const state=fixture();
  state.assets[0].path=path.join(dir,'source.mp4');await fs.writeFile(state.assets[0].path,'new bytes');state.assets[0].sha256='old hash';
  await assert.rejects(exportProject(state,{format:'bundle',dataDir:dir}),/ハッシュ/);
});
test('MP4 render contains planned duration and separate audio while originals remain unchanged',async(t)=>{
  try{await exec('ffmpeg',['-version'],{windowsHide:true});}catch{t.skip('FFmpeg unavailable');return;}
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yachicut-render-'));
  const video=path.join(dir,'video.mp4'),audio=path.join(dir,'audio.wav');
  await exec('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=320x180:r=30','-t','2','-c:v','libx264','-pix_fmt','yuv420p',video],{windowsHide:true});
  await exec('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2',audio],{windowsHide:true});
  const hash=await hashFile(video);const state=fixture();state.assets[0].path=video;state.assets[0].duration=2;
  state.assets.push({id:'a2',name:'audio.wav',kind:'audio',path:audio,duration:2});
  state.clips=[{id:'v',assetId:'a1',sceneId:'s1',track:'video',start:0.5,in:0.2,duration:1,gain:1},{id:'a',assetId:'a2',sceneId:'s1',track:'audio',start:0,in:0,duration:2,gain:0.5}];
  const result=await exportProject(state,{format:'render',dataDir:dir});
  const {stdout}=await exec('ffprobe',['-v','quiet','-show_streams','-show_format','-of','json',result.path],{windowsHide:true});
  const probe=JSON.parse(stdout);assert.ok(Math.abs(Number(probe.format.duration)-2)<0.1);
  assert.deepEqual(probe.streams.map(s=>s.codec_type).sort(),['audio','video']);
  assert.equal(await hashFile(video),hash);
  await assert.rejects(fs.stat(path.join(path.dirname(result.path),'render-work')), {code:'ENOENT'});
});
