import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {alignItems,cutRanges} from '../server/timing-edits.mjs';
import {readFontFamily,bundledFontDir} from '../server/fonts.mjs';
import {BUNDLED_FONTS,ARTICLE_FONTS} from '../server/font-catalog.mjs';
import {createOverlay} from '../server/overlays.mjs';
import {captionTransition,captionsSvg} from '../server/caption-style.mjs';
import {clipControls,clipStyle} from '../server/clip-effects.mjs';
import {mixerSettings,mixerFilters} from '../server/audio-mixer.mjs';
test('bundled font files contain the exact family used by browser and export; article catalog has 35 entries',async()=>{
 assert.equal(ARTICLE_FONTS.length,35);
 for(const f of BUNDLED_FONTS)for(const file of f.files)assert.equal(readFontFamily(await readFile(path.join(bundledFontDir,file))),f.family,file);
 assert.throws(()=>readFontFamily(Buffer.from('not a font')));
 assert.throws(()=>createOverlay('caption',{text:'test',fontFamily:'x"/><script>'}));
});
const fixture=()=>({fps:24,assets:[{id:'a',kind:'video'}],clips:[{id:'v',assetId:'a',start:0,in:10,duration:10,speed:2,track:'video'},{id:'a',assetId:'a',start:0,in:10,duration:10,speed:2,track:'audio'}],captions:[{id:'c',text:'abc',start:1,duration:6,words:[{text:'a',start:0,end:1},{text:'b',start:2,end:3},{text:'c',start:5,end:6}]}],graphics:[{id:'g',start:1,duration:6,keyframes:[{time:0,x:0},{time:3,x:50},{time:6,x:100}]}],markers:[{id:'m',time:8}],storyboard:[{id:'s',duration:10}]});
test('range cuts retain AV sync, retimed source offsets, subtitle word timing, markers and curve order',()=>{const s=fixture();let serial=0;const r=cutRanges(s,{ranges:[{start:3,end:4},{start:2,end:3.5}]},()=>`new${++serial}`);assert.equal(r.removedSeconds,2);for(const track of ['video','audio'])assert.deepEqual(s.clips.filter(c=>c.track===track).map(c=>[c.start,c.duration,c.in]),[[0,2,10],[2,6,18]]);assert.equal(s.captions[0].text,'ac');assert.deepEqual(s.captions[0].words,[{text:'a',start:0,end:1},{text:'c',start:3,end:4}]);assert.equal(s.markers[0].time,6);assert.equal(s.storyboard[0].duration,8);assert.deepEqual(s.graphics[0].keyframes.map(f=>f.time),[0,1,4]);});
test('alignment operates across clips, captions and graphics without altering source offsets',()=>{const s=fixture();alignItems(s,{items:[{id:'v',type:'clip'},{id:'c',type:'caption'},{id:'g',type:'graphic'}],mode:'playhead',at:2.5});assert.equal(s.clips[0].in,10);assert.equal(s.clips[0].start,2.5);assert.equal(s.captions[0].start,2.5);assert.equal(s.graphics[0].start,2.5);assert.throws(()=>alignItems(s,{items:[{type:'clip',id:'v'},{type:'clip',id:'v'}]}));});
test('caption entry and exit independently settle, and two outlines preserve text escaping',()=>{
 const c=createOverlay('caption',{text:'字幕<&',duration:3,fontFamily:'Source Han Sans JP',enterAnimation:'up',exitAnimation:'left',outerOutline:3,outline:2},'test');
 assert.equal(captionTransition(c,0).opacity,0);assert.equal(captionTransition(c,1).opacity,1);assert.equal(captionTransition(c,1).x,0);assert.ok(captionTransition(c,2.9).x<0);assert.equal(captionTransition(c,3).opacity,0);
 const svg=captionsSvg({width:1080,height:1080,captions:[c]},1);assert.match(svg,/stroke-width="10"/);assert.match(svg,/stroke-width="4"/);assert.match(svg,/&lt;/);
});
test('crop retains visible bounds and audio controls are reflected in export filters',()=>{
 assert.throws(()=>clipControls({cropLeft:50,cropRight:50}));assert.equal(clipStyle({...clipControls({cropTop:10,cropBottom:15}),start:0,duration:1},.5).clipPath,'inset(10% 0% 15% 0%)');
 const m=mixerSettings();Object.assign(m.tracks[0],{midHz:2300,midQ:2.5,highpass:true,highpassHz:90,lowpass:true,lowpassHz:14000});const f=mixerFilters(mixerSettings(m),0);assert.match(f,/highpass=f=90/);assert.match(f,/lowpass=f=14000/);assert.match(f,/equalizer=f=2300:t=q:w=2.5/);assert.throws(()=>mixerSettings({...m,tracks:m.tracks.map(t=>({...t,midQ:0}))}));
});
