import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createApp} from '../server/app.mjs';
function wav(){
  const data=Buffer.alloc(44+9600);data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(48000,24);data.writeUInt32LE(96000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(9600,40);return data;
}
test('HTTP uploads, Range streaming, origin/path boundaries, and real MCP/CLI transport',async()=>{
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'yachicut-http-'));const app=await createApp({dataDir});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  const client=new Client({name:'yachicut-test',version:'1.0'});
  try{
    assert.equal((await fetch(base+'/api/state')).status,200);
    assert.equal((await fetch(base+'/api/state',{headers:{Origin:'https://evil.example'}})).status,403);
    assert.equal((await fetch(base+'/api/command',{method:'POST',headers:{'Content-Type':'application/json',Origin:'null'},body:'{}'})).status,403);
    assert.equal((await fetch(base+'/api/download?path=..%2Fstate.json')).status,403);
    const form=new FormData();form.append('files',new Blob([wav()],{type:'audio/wav'}),'音声.wav');
    const uploaded=await fetch(base+'/api/upload',{method:'POST',body:form});assert.equal(uploaded.status,200);
    const payload=await uploaded.json();const asset=payload.state.assets[0];assert.equal(asset.name,'音声.wav');
    const ranged=await fetch(base+asset.url,{headers:{Range:'bytes=0-43'}});assert.equal(ranged.status,206);assert.equal((await ranged.arrayBuffer()).byteLength,44);
    const suffix=await fetch(base+asset.url,{headers:{Range:'bytes=-10'}});assert.equal(suffix.status,206);assert.equal((await suffix.arrayBuffer()).byteLength,10);
    assert.equal((await fetch(base+asset.url,{headers:{Range:'bytes=999999-'}})).status,416);
    const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('bin/mcp.mjs')],env:{...process.env,YACHICUT_URL:base},stderr:'pipe'});
    await client.connect(transport);
    const list=await client.listTools();assert.ok(list.tools.some(t=>t.name==='cutton_command'));
    const result=await client.callTool({name:'cutton_command',arguments:{command:'project.rename',args:{name:'MCP edit verified'}}});
    assert.equal(result.isError,undefined);
    assert.equal((await(await fetch(base+'/api/state')).json()).name,'MCP edit verified');
    const error=await client.callTool({name:'cutton_command',arguments:{command:'bad_command',args:{}}});assert.equal(error.isError,true);
    const resource=await client.readResource({uri:'cutton://project'});assert.equal(JSON.parse(resource.contents[0].text).name,'MCP edit verified');
  } finally {await client.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
