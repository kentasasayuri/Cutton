import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createProxyManager} from '../server/proxy.mjs';
import {hashFile} from '../exporters/index.mjs';
const exec=promisify(execFile);
test('preview proxy is small, video-only, cached and leaves source bytes unchanged',async()=>{
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'cutton-proxy-'));const source=path.join(dataDir,'source.mp4');
  await exec('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=30','-t','1','-c:v','libx264','-threads','1',source],{windowsHide:true});
  const hash=await hashFile(source);const asset={id:'video',kind:'video',path:source,sha256:hash};
  const manager=createProxyManager({dataDir,getState:()=>({assets:[asset]})});
  try{
    await assert.rejects(manager.request('video',1080));
    await manager.request('video',360);
    let status;
    for(let i=0;i<100;i++){status=await manager.status('video',360);if(['ready','error'].includes(status.status))break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(status.status,'ready',status.error);
    const file=await manager.file('video',360);
    const {stdout}=await exec('ffprobe',['-v','quiet','-show_streams','-of','json',file],{windowsHide:true});
    const info=JSON.parse(stdout);assert.equal(info.streams.length,1);assert.equal(info.streams[0].height,360);assert.equal(info.streams[0].width,640);
    const before=(await fs.stat(file)).mtimeMs;
    assert.equal((await manager.request('video',360)).status,'ready');assert.equal((await fs.stat(file)).mtimeMs,before);
    assert.equal(await hashFile(source),hash);
  }finally{manager.close();}
});
test('closing before spawn prevents background encoding and odd-size inputs are normalized',async()=>{
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'cutton-proxy-odd-'));const source=path.join(dataDir,'odd.mkv');
  await exec('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=321x181:rate=30','-t','0.2','-c:v','ffv1',source],{windowsHide:true});
  const asset={id:'odd',kind:'video',path:source,sha256:await hashFile(source)};
  const closed=createProxyManager({dataDir:path.join(dataDir,'closed'),getState:()=>({assets:[asset]})});
  await closed.request('odd');closed.close();await new Promise(r=>setTimeout(r,150));
  assert.notEqual((await closed.status('odd')).status,'ready');
  const manager=createProxyManager({dataDir,getState:()=>({assets:[asset]})});
  try{
    await manager.request('odd');let status;
    for(let i=0;i<100;i++){status=await manager.status('odd');if(['ready','error'].includes(status.status))break;await new Promise(r=>setTimeout(r,50));}
    assert.equal(status.status,'ready',status.error);
    const {stdout}=await exec('ffprobe',['-v','quiet','-show_streams','-of','json',await manager.file('odd')],{windowsHide:true});
    assert.equal(JSON.parse(stdout).streams[0].height,180);
  }finally{manager.close();}
});
