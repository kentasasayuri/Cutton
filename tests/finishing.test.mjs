import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {EventEmitter} from 'node:events';
import {createStore} from '../server/store.mjs';import {createOverlay} from '../server/overlays.mjs';import {captionIssues,splitCaption} from '../server/caption-editing.mjs';import {runProcess,FFMPEG} from '../server/media.mjs';import {exportProject} from '../exporters/index.mjs';import {writeRasterFrame} from '../exporters/vector-render.mjs';import {execFileSync} from 'node:child_process';
import {motionLayout,moveGraphicDraft} from '../server/motion-layouts.mjs';
const setup=async()=>{const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'cutton-finishing-'));return {dataDir,store:await createStore({dataDir})};};
test('motion layouts stagger entries and moving a card moves its animation too',()=>{
 const items=motionLayout({preset:'steps',texts:['音','リズム','共感'],start:10,duration:6});assert.ok(items[0].start<items[1].start&&items[1].start<items[2].start);for(const i of items){assert.equal(i.start+i.duration,16);createOverlay('graphics',i);}
 const moved=moveGraphicDraft(items[0],'y',30);assert.equal(moved.keyframes[1].y,30);assert.equal(moved.keyframes[0].y,34);assert.equal(items[0].y,18);const shorter=moveGraphicDraft(moved,'duration',3);assert.equal(shorter.keyframes.at(-1).time,3);createOverlay('graphics',shorter);
});
test('caption review is read-only; merging orphan endings preserves timing and undo',async()=>{
 const {store}=await setup();const a=(await store.execute('caption.add',{text:'調べま',start:1,duration:2,words:[{text:'調べま',start:0,end:1.9}]})).result,b=(await store.execute('caption.add',{text:'した。',start:3,duration:.5,words:[{text:'した。',start:0,end:.4}]})).result;
 const before=store.getState(),review=await store.execute('caption.check');assert.equal(review.result.issues.length,1);assert.deepEqual(store.getState(),before);
 const merged=(await store.execute('caption.merge',{ids:[a.id,b.id]})).result;assert.equal(merged.text,'調べました。');assert.equal(merged.duration,2.5);assert.equal(merged.words[1].start,2);assert.equal(merged.id,a.id);
 await store.execute('edit.undo');assert.deepEqual(store.getState().captions,before.captions);
 const unchanged=store.getState();await assert.rejects(store.execute('caption.merge',{ids:[a.id,'unknown']}));assert.deepEqual(store.getState(),unchanged);
});
test('split uses word timing, distinct IDs and round trips without missing text',()=>{
 const c=createOverlay('caption',{text:'調べました。次へ',start:10,duration:3,words:[{text:'調べました。',start:0,end:2},{text:'次へ',start:2,end:3}]});const state={fps:24,captions:[c]};const {captions:[a,b]}=splitCaption(state,{id:c.id,index:6});assert.equal(a.text,'調べました。');assert.equal(b.text,'次へ');assert.equal(b.start,12);assert.equal(b.words[0].start,0);assert.notEqual(a.id,b.id);assert.equal(a.text+b.text,c.text);
 assert.throws(()=>splitCaption({fps:24,captions:[c]},{id:c.id,index:6,at:10.1}),/単語/);
 const emoji=createOverlay('caption',{text:'😀テスト'});assert.throws(()=>splitCaption({fps:24,captions:[emoji]},{id:emoji.id,index:1,at:1}),/文字/);
});
test('readability checks catch overlaps, punctuation and lines; style preserves words',async()=>{
 const {store}=await setup();const c=(await store.execute('caption.add',{text:'音楽を聴く',duration:3,words:[{text:'音楽を聴く',start:0,end:3}],karaoke:'words'})).result;
 await store.execute('caption.look',{ids:[c.id],preset:'emphasis'});const styled=store.getState().captions[0];assert.deepEqual(styled.words,c.words);assert.equal(styled.enterAnimation,'up');assert.equal(styled.karaoke,'none');await store.execute('caption.look',{ids:[c.id],preset:'calm'});assert.equal(store.getState().captions[0].enterAnimation,'none');
 const issues=captionIssues({width:160,captions:[createOverlay('caption',{text:'長い文章'.repeat(10),fontSize:40,duration:2}),createOverlay('caption',{text:'、',start:1,duration:.3})]});assert.ok(issues.some(i=>i.reasons.includes('3行以上になる')));assert.ok(issues.some(i=>i.reasons.includes('前の字幕と重なる')));
});
test('a failed raster pipe cannot hang while waiting for drain',async()=>{
 const proc=new EventEmitter();proc.exitCode=null;proc.stdin=new EventEmitter();proc.stdin.write=()=>false;proc.stdin.destroyed=false;
 const pending=writeRasterFrame(proc,Buffer.alloc(1));proc.stdin.emit('close');await assert.rejects(pending,/中断/);assert.equal(proc.listenerCount('close'),0);assert.equal(proc.stdin.listenerCount('drain'),0);
});
test('background and ducked looping BGM are editable, export together and restore atomically',async()=>{
 const {store,dataDir}=await setup(),video=path.join(dataDir,'video.mp4'),voice=path.join(dataDir,'voice.wav'),music=path.join(dataDir,'music.wav');
 await runProcess(FFMPEG,['-v','error','-y','-f','lavfi','-i','color=red:s=160x90:r=24:d=3','-vf','pad=160:160:0:35:black','-c:v','libx264','-threads','1',video]);
 for(const [file,freq,duration] of [[voice,880,1],[music,220,1.5]])await runProcess(FFMPEG,['-v','error','-y','-f','lavfi','-i',`sine=frequency=${freq}:duration=${duration}:sample_rate=48000`,'-ac','2',file]);
 await store.execute('project.settings',{width:160,height:160,fps:24});const va=(await store.execute('asset.import',{path:video})).result,vo=(await store.execute('asset.import',{path:voice})).result,ma=(await store.execute('asset.import',{path:music})).result;
 await store.execute('timeline.add',{assetId:va.id,track:'video',duration:3});await store.execute('timeline.add',{assetId:vo.id,track:'audio',lane:0,start:1,duration:1});const before=store.getState();
 await store.execute('background.apply',{preset:'blue',foregroundLane:0,top:21.875,bottom:21.875});let state=store.getState();assert.equal(state.clips.find(c=>c.assetId===va.id).lane,1);const bg=state.clips.find(c=>c.lane===0&&c.track==='video');assert.equal(bg.muted,false);assert.equal(bg.duration,3);
 await store.execute('edit.undo');assert.deepEqual(store.getState().clips,before.clips);await store.execute('edit.redo');const invalid=store.getState();await assert.rejects(store.execute('background.apply',{preset:'blue',foregroundLane:1,top:80,bottom:80}));assert.deepEqual(store.getState(),invalid);
 await store.execute('background.apply',{preset:'teal',replaceClipId:bg.id});assert.equal(store.getState().clips.filter(c=>c.track==='video').length,2);
 const result=(await store.execute('audio.prepareBgm',{assetId:ma.id,voiceLane:0,fadeIn:0,fadeOut:0})).result;state=store.getState();const bgm=state.assets.find(a=>a.id===result.assetId);assert.equal(bgm.provenance.ducking,true);assert.equal(result.lane,1);assert.ok(Math.abs(bgm.duration-3)<.01);
 const pcm=execFileSync(FFMPEG,['-v','error','-i',bgm.path,'-ac','1','-ar','8000','-f','f32le','pipe:1'],{windowsHide:true});const samples=new Float32Array(pcm.buffer,pcm.byteOffset,pcm.length/4),rms=(a,b)=>Math.sqrt(samples.slice(a*8000,b*8000).reduce((n,x)=>n+x*x,0)/((b-a)*8000));assert.ok(rms(1.4,1.8)<rms(.4,.8)*.85,'voice reduces the music');
 await store.execute('caption.add',{text:'字幕',start:0,duration:3,fontSize:16,fontFamily:'Source Han Sans JP',y:85});await store.execute('graphics.add',{type:'vector',shape:'rect',text:'比較',fontFamily:'Source Han Sans JP',fontSize:12,start:0,duration:3,y:10,width:50,height:12});
 const rendered=await exportProject(store.getState(),{format:'render',dataDir});const rgb=execFileSync(FFMPEG,['-v','error','-ss','1.5','-i',rendered.path,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true});const pixel=(x,y)=>[...rgb.subarray((y*160+x)*3,(y*160+x)*3+3)];assert.ok(pixel(4,4)[1]>30,'colored background survives export');assert.ok(pixel(80,80)[0]>180&&pixel(80,80)[2]<40,'foreground is retained');assert.ok(rgb.length===160*160*3);
 const untouched=store.getState();await assert.rejects(store.execute('audio.prepareBgm',{assetId:ma.id,lane:0,voiceLane:0}));assert.deepEqual(store.getState(),untouched);
});
