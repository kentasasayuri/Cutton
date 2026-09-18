import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {createStore} from '../server/store.mjs';
import {exportProject} from '../exporters/index.mjs';
import {createOverlay,cubicEase} from '../server/overlays.mjs';
import {vectorSvg,validateVectorLinks,vectorTransform} from '../server/vector.mjs';
import {createApp} from '../server/app.mjs';
import {HOSTED_UI_ORIGIN} from '../server/site-bridge.mjs';
import {toFcpxml} from '../exporters/fcpxml.mjs';
const exec=promisify(execFile);
async function setup(){const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'cutton-pro-'));return {dataDir,store:await createStore({dataDir})};}
test('project library switches exact IDs, duplicates edits independently and persists across restarts',async()=>{
  const {store,dataDir}=await setup();const original=store.getState().id;
  await store.execute('storyboard.add',{title:'Original'});
  const copy=await store.execute('project.duplicate',{name:'Second'});
  await store.execute('storyboard.update',{id:copy.state.storyboard[0].id,title:'Changed'});
  await store.execute('project.switch',{id:original});assert.equal(store.getState().storyboard[0].title,'Original');
  assert.equal((await store.execute('project.list')).result.projects.length,2);
  await assert.rejects(store.execute('project.switch',{id:'../../state'}));
  const loaded=await createStore({dataDir});await loaded.execute('project.switch',{id:copy.state.id});assert.equal(loaded.getState().storyboard[0].title,'Changed');
});
test('multi-track bounds, ripple/slip/speed and undo/redo preserve sources and edit placement',async()=>{
  const {store,dataDir}=await setup();const source=path.join(dataDir,'source.wav');
  await exec('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=4','-y',source]);
  const asset=(await store.execute('asset.import',{path:source})).result;
  const a=(await store.execute('timeline.add',{assetId:asset.id,track:'audio',duration:1,speed:2})).result;
  const b=(await store.execute('timeline.add',{assetId:asset.id,track:'audio',start:2,duration:1})).result;
  await store.execute('timeline.add',{assetId:asset.id,track:'audio',lane:1,start:0,duration:2});
  await assert.rejects(store.execute('timeline.add',{assetId:asset.id,track:'audio',start:0,duration:1}));
  await assert.rejects(store.execute('timeline.update',{id:a.id,speed:4,duration:2}));
  await store.execute('timeline.slip',{id:b.id,offset:1});assert.equal(store.getState().clips.find(c=>c.id===b.id).in,1);
  await store.execute('timeline.rippleRemove',{id:a.id});assert.equal(store.getState().clips.find(c=>c.id===b.id).start,1);
  await store.execute('edit.undo');assert.equal(store.getState().clips.length,3);assert.equal(store.getState().clips.find(c=>c.id===b.id).start,2);
  await store.execute('edit.redo');assert.equal(store.getState().clips.length,2);
  await store.execute('timeline.closeGaps',{track:'audio',lane:0});assert.equal(store.getState().clips.find(c=>c.id===b.id).start,0);
});
test('vector curves, parenting and masks are deterministic and escape text',()=>{
  const parent=createOverlay('graphics',{type:'null',x:60,y:50,animation:'none'},'parent');
  const child=createOverlay('graphics',{type:'vector',text:'<script>&',fontSize:8,parentId:'parent',x:50,y:50,mask:'ellipse',gradient:true,animation:'none'},'child');
  validateVectorLinks([parent,child]);assert.equal(vectorTransform(child,1,[parent,child]).x,60);
  assert.ok(cubicEase(.5,[.16,1,.3,1])>.9);
  const svg=vectorSvg({width:320,height:180,graphics:[parent,child]},1);assert.match(svg,/&lt;script&gt;&amp;/);assert.match(svg,/clipPath/);assert.doesNotMatch(svg,/<script>/);
  assert.throws(()=>validateVectorLinks([{...parent,parentId:'child'},child]));
  assert.throws(()=>createOverlay('graphics',{type:'vector',keyframes:[{bezier:[1]}]}));
});
test('real multi-track MP4 composes layers, mixes audio and renders a vector matte',async()=>{
  const {store,dataDir}=await setup();await store.execute('project.settings',{width:320,height:180,fps:10});
  const source=path.join(dataDir,'red.mp4');await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=red:s=320x180:r=10:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-shortest','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac','-y',source]);
  const asset=(await store.execute('asset.import',{path:source})).result;
  await store.execute('timeline.add',{assetId:asset.id,track:'video',start:0,duration:1});
  await store.execute('timeline.add',{assetId:asset.id,track:'video',lane:1,start:0,duration:1,scale:.5,brightness:.2,opacity:.8,rotation:10,fadeIn:.2});
  await store.execute('timeline.add',{assetId:asset.id,track:'audio',start:0,duration:1,speed:2,gain:.1,fadeOut:.2});
  await store.execute('timeline.add',{assetId:asset.id,track:'audio',lane:1,start:0,duration:1,gain:.1});
  const matte=(await store.execute('graphics.add',{type:'vector',shape:'rect',text:'',width:12,height:30,duration:1,animation:'none',x:20,y:50})).result;
  await store.execute('graphics.add',{type:'vector',shape:'ellipse',color:'#00ff00',text:'',width:20,height:25,duration:1,animation:'none',x:20,y:50,glow:1,matteId:matte.id});
  await store.execute('caption.add',{text:'TEST',fontSize:20,start:0,duration:1,x:50,y:88});
  const xml=toFcpxml(store.getState());assert.match(xml,/lane="2"/);assert.match(xml,/lane="-2"/);assert.match(xml,/<timeMap>/);assert.match(xml,/srcEnable="video"/);
  const output=await exportProject(store.getState(),{dataDir,format:'render'});
  const file=output.path;assert.ok((await fs.stat(file)).size>2000);
  const raw=await exec('ffmpeg',['-v','error','-ss','0.5','-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:'buffer',maxBuffer:1000000});
  const pixel=(x,y)=>[...raw.stdout.subarray((y*320+x)*3,(y*320+x)*3+3)];
  const red=pixel(310,90),green=pixel(64,90),center=pixel(160,90),outsideMatte=pixel(37,90);assert.ok(red[0]>180&&red[1]<50);assert.ok(green[1]>150&&green[0]<80);assert.ok(center[0]<150);assert.ok(outsideMatte[0]>180&&outsideMatte[1]<50);
});
test('hosted UI bridge pairs only the configured origin and rejects malformed bearer tokens',async()=>{
  const {store}=await setup();const created=await createApp({store});const app=created.app||created;
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const bad=await fetch(base+'/api/pair',{method:'POST',headers:{Origin:'https://evil.example'}});assert.equal(bad.status,403);
    const pair=await fetch(base+'/api/pair',{method:'POST',headers:{Origin:HOSTED_UI_ORIGIN}});assert.equal(pair.status,200);const {token}=await pair.json();
    const state=await fetch(base+'/api/state',{headers:{Origin:HOSTED_UI_ORIGIN,Authorization:`Bearer ${token}`}});assert.equal(state.status,200);assert.equal(state.headers.get('access-control-allow-origin'),HOSTED_UI_ORIGIN);
    assert.equal((await fetch(base+'/api/state',{headers:{Origin:HOSTED_UI_ORIGIN,Authorization:'Bearer '+ 'x'.repeat(64)}})).status,401);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await created.close?.();}
});
