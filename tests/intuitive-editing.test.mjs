import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {createStore} from '../server/store.mjs';
import {createOverlay} from '../server/overlays.mjs';
import {vectorTransform} from '../server/vector.mjs';
import {moveItem,resizeItem,rotateItem,itemBox} from '../server/direct-transform.mjs';
import {graphicPresets} from '../server/graphic-presets.mjs';
import {synthSound,soundWav,sfxPresets} from '../server/sfx.mjs';
import {mixerSettings,mixerFilters} from '../server/audio-mixer.mjs';
import {exportProject} from '../exporters/index.mjs';
const exec=promisify(execFile),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
async function setup(){const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'cutton-intuitive-'));return {dataDir,store:await createStore({dataDir})};}
test('drag translates the entire motion path, inverts parent transforms, clamps together and undoes once',async()=>{
 const {store}=await setup();const parent=(await store.execute('graphics.add',{type:'null',animation:'none',duration:4,keyframes:[{time:0,x:60,y:40,scale:2,rotation:90,opacity:1}]})).result;
 const g=(await store.execute('graphics.add',{type:'vector',text:'',parentId:parent.id,duration:4,keyframes:[{time:0,x:50,y:50,scale:1,rotation:0},{time:2,x:60,y:60,scale:1,rotation:20}]})).result;
 const state=store.getState(),before=vectorTransform(g,1,state.graphics),fields=moveItem(g,'graphic',4,6,state,1);
 const after=vectorTransform({...g,...fields},1,state.graphics);near(after.x-before.x,4);near(after.y-before.y,6);near(fields.keyframes[1].x-fields.keyframes[0].x,10);
 await store.execute('graphics.update',{id:g.id,...fields});await store.execute('edit.undo');assert.deepEqual(store.getState().graphics.find(i=>i.id===g.id),g);
 const bounded=moveItem(g,'graphic',1000,0,{graphics:[]},1);assert.equal(bounded.keyframes[1].x,100);assert.equal(bounded.keyframes[0].x,90);
 assert.deepEqual(moveItem({},'clip',1,2,{},0),{x:51,y:52});
 const faded=createOverlay('graphics',{text:'fade',animation:'fade'}),spun=rotateItem(faded,'graphic',30);assert.equal(spun.rotation,30);assert.equal(createOverlay('graphics',{...faded,...spun}).animation,'fade');
 const resized=resizeItem(g,'graphic',2);assert.equal(resized.keyframes[0].scale,2);const rotated=rotateItem(g,'graphic',10);assert.equal(rotated.keyframes[1].rotation,30);
 const caption=createOverlay('caption',{text:'ドラッグ字幕'});assert.ok(itemBox(caption,'caption',{width:1920,height:1080},0).height>0);
});
test('every graphic template validates and stays editable',()=>{for(const preset of graphicPresets){const g=createOverlay('graphics',{...preset,duration:4});assert.ok(g.keyframes.every(k=>Number.isFinite(k.x)));assert.doesNotThrow(()=>createOverlay('graphics',{...g,...resizeItem(g,'graphic',1.2)}));}});
test('synthesized sound is deterministic, bounded and rejects unbounded allocation',()=>{
 for(const preset of Object.keys(sfxPresets)){const a=synthSound({preset,duration:.2}),b=synthSound({preset,duration:.2});assert.deepEqual(a.samples,b.samples);assert.equal(a.rate,48000);assert.equal(a.samples.length,9600);assert.ok(a.samples.every(v=>Number.isFinite(v)&&Math.abs(v)<=.901));assert.ok(a.samples.some(v=>Math.abs(v)>.01));assert.ok(a.samples[0]===0);assert.equal(soundWav({preset,duration:.2}).length,19244);}
 for(const options of [{duration:1e8},{frequency:NaN},{levelDb:Infinity},{seed:-1},{preset:'unknown'}])assert.throws(()=>synthSound(options));
});
test('mixer and SFX commands persist, undo, enforce placement, and reject invalid settings atomically',async()=>{
 const {store,dataDir}=await setup();await store.execute('audio.track.update',{lane:2,volumeDb:-9,balance:-.5,solo:true,lowDb:3});await store.execute('audio.master.update',{masterDb:-3});
 const before=store.getState();for(const args of [{lane:9},{lane:1,volumeDb:100},{lane:1,balance:NaN},{lane:1,mute:'true'}])await assert.rejects(store.execute('audio.track.update',args));assert.deepEqual(store.getState(),before);
 const reloaded=await createStore({dataDir});assert.equal(reloaded.getState().audioMixer.tracks[2].lowDb,3);assert.equal(reloaded.getState().audioMixer.masterDb,-3);
 const {result}=await store.execute('sfx.create',{preset:'chime',duration:.5,start:0});assert.equal(result.clip.track,'audio');assert.equal(result.asset.kind,'audio');assert.ok(result.asset.sha256);
 await assert.rejects(store.execute('sfx.create',{preset:'click',duration:.5,start:0,lane:0}));
 await store.execute('edit.undo');assert.equal(store.getState().clips.length,0);assert.equal(store.getState().assets.length,1);await store.execute('edit.redo');assert.equal(store.getState().clips.length,1);
 const original=store.getState().id;await store.execute('project.new',{name:'Empty'});assert.equal(store.getState().audioMixer.masterDb,0);await store.execute('project.switch',{id:original});assert.equal(store.getState().audioMixer.masterDb,-3);
});
test('real stereo processing isolates channels, applies solo/mute and attenuates EQ bands',async()=>{
 const {dataDir}=await setup(),source=path.join(dataDir,'stereo.wav');await exec('ffmpeg',['-v','error','-f','lavfi','-i','aevalsrc=0.1*sin(2*PI*1000*t)|0.1*sin(2*PI*1000*t):s=48000:d=0.3','-y',source]);
 const rms=async(mixer,lane)=>{const {stdout}=await exec('ffmpeg',['-v','error','-i',source,'-af',mixerFilters(mixer,lane),'-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:2000000});let l=0,r=0,count=0;for(let i=4800*8;i+7<stdout.length;i+=8){l+=stdout.readFloatLE(i)**2;r+=stdout.readFloatLE(i+4)**2;count++;}return [Math.sqrt(l/count),Math.sqrt(r/count)];};
 const m=mixerSettings(),base=await rms(m,0);m.tracks[0].balance=1;let values=await rms(m,0);assert.ok(values[0]<1e-7&&values[1]>.06);m.tracks[0].balance=0;m.tracks[0].midDb=-12;values=await rms(m,0);assert.ok(values[0]<base[0]*.3);m.tracks[1].solo=true;values=await rms(m,0);assert.ok(values.every(v=>v<1e-7));m.tracks[0].solo=true;m.tracks[0].mute=true;values=await rms(m,0);assert.ok(values.every(v=>v<1e-7));
});
test('real MP4 chroma composition preserves foreground, reveals lower track, exports mixer and retains originals',async()=>{
 const {store,dataDir}=await setup();await store.execute('project.settings',{width:160,height:90,fps:10});
 const green=path.join(dataDir,'green.mkv'),blue=path.join(dataDir,'blue.mkv');
 await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=0x00ff00:s=160x90:r=10:d=0.6,drawbox=x=60:y=20:w=40:h=50:color=red:t=fill','-c:v','ffv1','-y',green]);await exec('ffmpeg',['-v','error','-f','lavfi','-i','color=blue:s=160x90:r=10:d=0.6','-c:v','ffv1','-y',blue]);
 const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex'),before=await hash(green);
 const bg=(await store.execute('asset.import',{path:blue})).result,fg=(await store.execute('asset.import',{path:green})).result;
 await store.execute('timeline.add',{assetId:bg.id,track:'video',duration:.6});const c=(await store.execute('timeline.add',{assetId:fg.id,track:'video',lane:1,duration:.6,brightness:.8,keyEnabled:true,keyColor:'#00ff00',keySimilarity:.15,keyBlend:.05,keySpill:.5})).result;
 await assert.rejects(store.execute('timeline.update',{id:c.id,keyColor:'red;movie=bad'}));
 await store.execute('sfx.create',{preset:'chime',duration:.6,levelDb:-6,lane:0});await store.execute('audio.track.update',{lane:0,balance:1});await store.execute('audio.master.update',{masterDb:-6});
 const output=await exportProject(store.getState(),{dataDir,format:'render'});
 const {stdout}=await exec('ffmpeg',['-v','error','-ss','0.3','-i',output.path,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{encoding:'buffer'});
 const px=(x,y)=>[...stdout.subarray((y*160+x)*3,(y*160+x)*3+3)],background=px(15,45),foreground=px(80,45);assert.ok(background[2]>180&&background[1]<50,background);assert.ok(foreground[0]>180&&foreground[1]<50,foreground);
 const audio=await exec('ffmpeg',['-v','error','-i',output.path,'-vn','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:2000000});let left=0,right=0;for(let i=0;i+7<audio.stdout.length;i+=8){left+=audio.stdout.readFloatLE(i)**2;right+=audio.stdout.readFloatLE(i+4)**2;}assert.ok(right>1&&left<right*.001);assert.equal(await hash(green),before);
});
