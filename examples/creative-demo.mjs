// Standalone editable demonstration. Never opens or changes the user's active project.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createOverlay} from '../server/overlays.mjs';
import {motionFrames} from '../server/motion-presets.mjs';
import {emptyState} from '../server/store.mjs';
import {exportProject} from '../exporters/index.mjs';
const folder=path.resolve('output/creative-demo');await fs.mkdir(folder,{recursive:true});
const state={...emptyState('Cutton · 字幕とモーションのサンプル'),width:960,height:540,fps:30};
const graphic=(id,args)=>createOverlay('graphics',{type:'vector',text:'',duration:3,animation:'none',...args},id);
state.graphics=[
 graphic('background',{width:100,height:100,x:50,y:50,color:'#0c1425',gradient:true,gradientColor:'#283253',gradientAngle:25}),
 graphic('orbit',{shape:'ellipse',width:33,height:59,x:78,y:42,fillOpacity:0,stroke:2,strokeColor:'#7ec5d1',copies:5,copyX:1.4,copyY:0,copyOpacity:.65,keyframes:motionFrames('float',{duration:3,x:78,y:42},{amount:4})}),
 graphic('spark',{shape:'star',sides:4,innerRadius:10,width:8,height:14,x:23,y:29,color:'#e3b8fd',keyframes:motionFrames('spin',{duration:3,x:23,y:29})}),
 graphic('rule',{shape:'line',x:50,y:74,width:72,height:1,stroke:2,strokeColor:'#66dfcb',strokeAnimation:'draw'}),
];
state.captions=[
 createOverlay('caption',{text:'声と、言葉が動き出す。',x:50,y:49,fontSize:53,duration:3,fontFamily:'Yu Gothic',fontWeight:700,color:'#ffffff',outline:1,outlineColor:'#182235',shadow:3,karaoke:'sweep',highlightColor:'#72edc9',textAnimation:'rise-letters',animationDuration:.4,stagger:.025,words:[{text:'声と、',start:.3,end:1},{text:'言葉が',start:1,end:1.8},{text:'動き出す。',start:1.8,end:2.9}]},'karaoke'),
 createOverlay('caption',{text:'CUTTON  /  MOTION & TYPE',x:50,y:66,fontSize:19,fontFamily:'Arial',duration:3,tracking:3,color:'#ccb0ff',gradient:true,gradientColor:'#68edda',gradientAngle:0,outline:0,shadow:0,textAnimation:'fade-letters',stagger:.015},'credit'),
];
await fs.writeFile(path.join(folder,'project.cutton.json'),JSON.stringify(state,null,2));
const result=await exportProject(state,{format:'render',dataDir:folder});
await fs.copyFile(result.path,path.join(folder,'cutton-motion.mp4'));
console.log(JSON.stringify({path:path.join(folder,'cutton-motion.mp4'),project:path.join(folder,'project.cutton.json')}));
