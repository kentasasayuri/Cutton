import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/app.mjs';
import {HOSTED_UI_ORIGIN} from '../server/site-bridge.mjs';
test('one multipart font imports, serves identical bytes through the hosted UI, and rejects malformed data',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cutton-font-test-')),previous=process.env.CUTTON_FONT_DIR;process.env.CUTTON_FONT_DIR=path.join(dir,'fonts');const app=await createApp({dataDir:path.join(dir,'data')}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{const bytes=await fs.readFile(new URL('../public/fonts/ZenMaruGothic-Regular.ttf',import.meta.url)),data=new FormData();data.append('font',new Blob([bytes]),'font.ttf');let r=await fetch(base+'/api/fonts/import',{method:'POST',body:data});assert.equal(r.status,200);const font=await r.json();assert.equal(font.family,'Zen Maru Gothic');assert.deepEqual(Buffer.from(await(await fetch(base+font.url)).arrayBuffer()),bytes);
 const bad=new FormData();bad.append('font',new Blob(['not a font']),'bad.ttf');r=await fetch(base+'/api/fonts/import',{method:'POST',body:bad});assert.ok(!r.ok);
 const pairing=await(await fetch(base+'/api/pair',{method:'POST',headers:{Origin:HOSTED_UI_ORIGIN}})).json();r=await fetch(base+font.url+'?access_token='+pairing.token,{headers:{Origin:HOSTED_UI_ORIGIN}});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),HOSTED_UI_ORIGIN);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));if(previous===undefined)delete process.env.CUTTON_FONT_DIR;else process.env.CUTTON_FONT_DIR=previous;if(path.dirname(dir)===path.resolve(os.tmpdir()))await fs.rm(dir,{recursive:true,force:true});}
});
