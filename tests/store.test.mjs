import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createStore} from '../server/store.mjs';
const exec=promisify(execFile);
async function setup(){const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'yachicut-store-'));return{store:await createStore({dataDir}),dataDir};}
test('parallel changes persist without losing updates; invalid changes roll back',async()=>{
  const {store,dataDir}=await setup();
  await Promise.all(Array.from({length:10},(_,i)=>store.execute('storyboard.add',{title:'Scene '+i,duration:2})));
  assert.equal(store.getState().storyboard.length,10);
  const original=store.getState();
  await assert.rejects(store.execute('storyboard.update',{id:original.storyboard[0].id,duration:-1}));
  assert.deepEqual(store.getState(),original);
  const reloaded=await createStore({dataDir});assert.deepEqual(reloaded.getState(),original);
});
test('local plan is explicit scaffold; Vids is awaiting import, never fake generated audio',async()=>{
  const {store}=await setup();
  const plan=await store.execute('plan.create',{prompt:'英語の学習紹介',duration:12,mode:'local'});
  assert.equal(plan.state.storyboard.reduce((n,s)=>n+s.duration,0),12);
  const result=await store.execute('narration.prepare',{prompt:'Hello world.',mode:'local',sceneId:plan.state.storyboard[0].id});
  assert.equal(result.state.jobs.at(-1).status,'awaiting_import');
  assert.equal(result.state.assets.length,0);
});
test('invalid settings and unknown commands are rejected',async()=>{
  const {store}=await setup();
  await assert.rejects(store.execute('settings.update',{vidsUrl:'https://evil.example.com/fake'}));
  await assert.rejects(store.execute('settings.update',{comfyUrl:'file:///etc/passwd'}));
  await assert.rejects(store.execute('unknown',{}));
});
test('media import, edits, integrity, project round-trip, and archive preserve originals',async(t)=>{
  try{await exec('ffmpeg',['-version'],{windowsHide:true});}catch{t.skip('FFmpeg unavailable');return;}
  const {store,dataDir}=await setup();const source=path.join(dataDir,'source-25fps.mp4');
  await exec('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=green:s=320x180:r=25','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source],{windowsHide:true});
  const {state:s}=await store.execute('storyboard.add',{title:'試験',duration:2});const sceneId=s.storyboard[0].id;
  const imported=await store.execute('asset.import',{path:source,sceneId});const asset=imported.state.assets[0];
  assert.notEqual(asset.path,source);assert.equal(asset.kind,'video');assert.equal(asset.hasAudio,true);
  assert.equal(asset.sha256.length,64);assert.equal(asset.streamHashes.video.length,64);assert.equal(asset.streamHashes.audio.length,64);
  assert.equal(asset.fps,25);
  await store.execute('asset.decide',{id:asset.id,decision:'accepted',reason:'構図が明確'});
  await store.execute('timeline.add',{assetId:asset.id,sceneId,track:'video',start:0,in:0,duration:2});
  await store.execute('timeline.add',{assetId:asset.id,sceneId,track:'audio',start:0,in:0,duration:2});
  assert.equal(store.coverage().percent,100);
  const video=store.getState().clips.find(c=>c.track==='video');
  const before=store.getState();
  await assert.rejects(store.execute('timeline.add',{assetId:asset.id,track:'video',start:1,duration:1}));
  assert.deepEqual(store.getState(),before);
  await assert.rejects(store.execute('timeline.update',{id:video.id,in:1,duration:2}));
  await store.execute('timeline.split',{id:video.id,at:1});
  assert.equal(store.getState().clips.filter(c=>c.track==='video').length,2);
  assert.equal(store.getState().clips.find(c=>c.track==='video'&&c.start===1).in,1);
  const verified=await store.execute('asset.verify',{id:asset.id});assert.equal(verified.result.allMatch,true);
  const exported=await store.execute('export.create',{format:'bundle'});
  const projectFile=path.join(exported.result.path.slice(0,-4),'project.cutton.json');
  await store.execute('project.new',{name:'Blank'});assert.equal(store.getState().clips.length,0);
  await store.execute('project.open',{path:projectFile});assert.equal(store.getState().clips.length,3);assert.equal(store.getState().assets.length,1);
  const restoredVerify=await store.execute('asset.verify',{});assert.equal(restoredVerify.result.allMatch,true);
  const extracted=await store.execute('narration.import',{path:source,sceneId:store.getState().storyboard[0].id});
  assert.equal(extracted.result.kind,'audio');assert.equal(extracted.result.provenance.streamIdentical,true);
});
