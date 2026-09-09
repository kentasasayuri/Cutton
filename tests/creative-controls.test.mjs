import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createOverlay} from '../server/overlays.mjs';
import {captionsSvg,captionGlyphState,graphemes} from '../server/caption-style.mjs';
import {motionFrames,MOTION_PRESETS} from '../server/motion-presets.mjs';
import {vectorSvg} from '../server/vector.mjs';
import {prepareVidsScript} from '../server/vids-voices.mjs';
import {performanceProfile} from '../server/performance.mjs';
import {createStore,COMMANDS} from '../server/store.mjs';
import {exportProject} from '../exporters/index.mjs';
const exec=promisify(execFile);

test('karaoke respects explicit phrase boundaries, pauses and graphemes',()=>{
 const caption=createOverlay('caption',{text:'日本語',duration:3,karaoke:'sweep',words:[{text:'日本',start:.5,end:1.5},{text:'語',start:2,end:3}]});
 assert.equal(captionGlyphState(caption,0,.25).progress,0);
 assert.equal(captionGlyphState(caption,0,.75).progress,.5);
 assert.equal(captionGlyphState(caption,1,.75).progress,0);
 assert.equal(captionGlyphState(caption,2,1.75).progress,0);
 assert.equal(captionGlyphState({...caption,karaoke:'words'},1,.75).progress,1);
 assert.equal(graphemes('👩‍👩‍👧‍👦あ').length,2);
 for(const words of [[{text:'違う',start:0,end:1}],[{text:'日',start:0,end:2},{text:'本語',start:1,end:3}],[{text:'日本語',start:0,end:4}]])assert.throws(()=>createOverlay('caption',{text:'日本語',words}));
});

test('caption animations, opacity and escaped SVG remain deterministic across frames',()=>{
 const c=createOverlay('caption',{text:'<>&',fontFamily:'Yu Gothic',fontSize:30,duration:2,opacity:.5,gradient:true,gradientAngle:0,textAnimation:'rise-letters',animationDuration:1,stagger:.1,karaoke:'sweep',background:true},'test"id');
 const start=captionGlyphState(c,0,0),end=captionGlyphState(c,0,1);
 assert.equal(start.opacity,0);assert.ok(start.y>0);assert.equal(end.opacity,.5);assert.equal(end.y,0);
 const state={width:640,height:360,captions:[c]},a=captionsSvg(state,.6);captionsSvg(state,1);assert.equal(captionsSvg(state,.6),a);
 assert.match(a,/gradientUnits="userSpaceOnUse"/);assert.match(a,/&lt;/);assert.match(a,/test&quot;id/);assert.match(a,/font-family="Yu Gothic"/);assert.match(a,/clipPath/);assert.doesNotMatch(captionsSvg(state,3),/<text/);
 assert.throws(()=>createOverlay('caption',{text:'a',opacity:2}));assert.throws(()=>createOverlay('caption',{text:'a',fontFamily:'<script>invalid</script>'}));
});

test('motion presets expand into valid editable curves and repeaters draw shapes',()=>{
 for(const [name] of MOTION_PRESETS){const keyframes=motionFrames(name,{duration:3,x:50,y:50},{amount:10,cycles:2});const g=createOverlay('graphics',{type:'vector',shape:'star',duration:3,fillOpacity:0,stroke:3,strokeAnimation:'draw',copies:4,copyOpacity:.8,keyframes},name);assert.ok(g.keyframes.length<=33);const svg=vectorSvg({width:640,height:360,graphics:[g]},1.5);assert.match(svg,/<polygon/);assert.match(svg,/stroke-dasharray/);assert.equal((svg.match(/<polygon/g)||[]).length,4);}
 assert.throws(()=>motionFrames('rise',{duration:0,x:50,y:50}));assert.throws(()=>createOverlay('graphics',{type:'vector',strokeStart:80,strokeEnd:20}));assert.throws(()=>createOverlay('graphics',{type:'vector',copies:100}));
});

test('Vids exports verified voice/avatar instructions, audio tags and preserves project handoff',async()=>{
 const tagged=prepareVidsScript('ここだけの話です。',{voiceName:'Paz',delivery:'whisper',vocalization:'laugh'});assert.equal(tagged.taggedScript,'[whispers] ここだけの話です。 [laughs]');assert.match(tagged.instructions[0],/Paz/);
 const avatar=prepareVidsScript('こんにちは。',{avatarId:'real:ミア',voiceName:'Nyla'});assert.match(avatar.instructions[0],/ミア.*固有の声/);assert.doesNotMatch(avatar.instructions[0],/Nyla/);
 assert.throws(()=>prepareVidsScript('a'.repeat(2500),{delivery:'whisper'}));assert.throws(()=>prepareVidsScript('a',{voiceName:'invented'}));
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'cutton-voice-controls-')),store=await createStore({dataDir});
 const {result}=await store.execute('narration.prepare',{prompt:'こんにちは。',mode:'local',voiceName:'Paz',delivery:'whisper',avatarId:'real:ミア',direction:'静かに、親しみを込めて。'});
 const file=JSON.parse(await fs.readFile(result.path,'utf8'));assert.equal(file.taggedScript,result.taggedScript);assert.match(file.instructions[0],/ミア/);
 const reloaded=await createStore({dataDir});assert.equal(reloaded.getState().jobs.at(-1).result.avatarId,'real:ミア');
 assert.ok(COMMANDS.find(c=>c.name==='caption.add').args.includes('words?'));
});

test('hardware budgets cap concurrency without lowering export quality',()=>{
 const pc=performanceProfile({memory:16507727872,processors:22,cpu:'155H'});assert.equal(pc.encodeThreads,4);assert.equal(pc.previewThreads,2);assert.equal(pc.renderConcurrency,1);assert.equal(pc.quality.intermediateCrf,0);assert.equal(pc.quality.finalCrf,18);
 const low=performanceProfile({memory:4*1024**3,processors:2,cpu:'small'});assert.equal(low.encodeThreads,1);assert.equal(low.filterThreads,1);assert.deepEqual(low.quality,pc.quality);
});

test('real MP4 karaoke sweeps left to right, retains requested dimensions and fps',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'cutton-karaoke-render-'));
 const store=await createStore({dataDir});await store.execute('project.settings',{width:320,height:180,fps:10});
 await store.execute('caption.add',{text:'日本語字幕',fontSize:30,y:50,duration:1,karaoke:'sweep',color:'#ffffff',highlightColor:'#ff0000',outline:2,shadow:0,words:[{text:'日本語字幕',start:0,end:1}]});
 const result=await exportProject(store.getState(),{format:'render',dataDir});
 const reds=[];
 for(const time of ['0.1','0.8']){const {stdout}=await exec('ffmpeg',['-v','error','-ss',time,'-i',result.path,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:1000000});let n=0,xsum=0;for(let i=0;i<stdout.length;i+=3)if(stdout[i]>150&&stdout[i+1]<70&&stdout[i+2]<70){n++;xsum+=(i/3)%320;}reds.push({n,x:xsum/n});}
 assert.ok(reds[1].n>reds[0].n*3);assert.ok(reds[1].x>reds[0].x+25);
 const {stdout}=await exec('ffprobe',['-v','quiet','-show_streams','-of','json',result.path],{windowsHide:true});const v=JSON.parse(stdout).streams.find(s=>s.codec_type==='video');assert.equal(v.width,320);assert.equal(v.height,180);assert.equal(v.r_frame_rate,'10/1');
});
