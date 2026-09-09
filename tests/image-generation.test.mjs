import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Resvg} from '@resvg/resvg-js';
import {saveGeneratedImage} from '../server/codex-image.mjs';
import {createStore} from '../server/store.mjs';
const png=()=>new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="teal"/></svg>').render().asPng();
test('image events require real bounded raster output and reject unrelated saved paths',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'cutton-image-'));
 try{
  const data=png();const output=await saveGeneratedImage({type:'imageGeneration',status:'completed',result:data.toString('base64')},root);
  assert.deepEqual(await readFile(output.path),data);
  await assert.rejects(saveGeneratedImage({type:'imageGeneration',status:'failed',result:data.toString('base64')},root),/完了/);
  await assert.rejects(saveGeneratedImage({type:'imageGeneration',status:'completed',result:Buffer.from('<svg/>').toString('base64')},root),/PNG/);
  await assert.rejects(saveGeneratedImage({type:'imageGeneration',status:'completed',savedPath:new URL(import.meta.url)},root));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('background images remain in submitting project after switching; errors are durable',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'cutton-image-store-'));let release,entered;
 const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 try{
  const store=await createStore({dataDir:root,imageGenerator:async({cwd})=>{entered();await gate;const file=path.join(root,'image.png');await writeFile(file,png());return {path:file,model:'test'};}});
  const id=store.getState().id;
  const submitted=await store.execute('image.generate',{prompt:'teal background'});
  await started;
  await store.execute('project.new',{name:'別のプロジェクト'});release();
  const deadline=Date.now()+10000;
  while(true){const saved=JSON.parse(await readFile(path.join(root,'library',id+'.json'),'utf8'));if(saved.jobs[0].status==='completed')break;assert.notEqual(saved.jobs[0].status,'failed',saved.jobs[0].error);assert.ok(Date.now()<deadline,'Image import did not finish before timeout');await new Promise(r=>setTimeout(r,25));}
  assert.equal(store.getState().assets.length,0);
  await store.execute('project.switch',{id});assert.equal(store.getState().assets.length,1);assert.equal(store.getState().jobs[0].id,submitted.result.id);assert.equal(store.getState().jobs[0].status,'completed');
  assert.equal(store.getState().assets[0].provenance.type,'codex-image');
  await assert.rejects(store.execute('image.generate',{prompt:'',aspect:'bad'}));
 }finally{release?.();await rm(root,{recursive:true,force:true});}
});
