import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {createApp,localOnly} from '../server/app.mjs';
import {HOSTED_UI_ORIGIN} from '../server/site-bridge.mjs';

function get(base,url,headers={},method='GET'){
 return new Promise((resolve,reject)=>{const req=http.request(base+url,{headers,method},res=>{let body='';res.setEncoding('utf8');res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();});
}
const navigation={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
test('hosted UI links open the editor shell while cross-site project/media access stays closed',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'cutton-startup-')),app=await createApp({dataDir});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const url of ['/?launch=projects','/index.html'])for(const origin of [undefined,HOSTED_UI_ORIGIN,'https://external.example']){
   const res=await get(base,url,{...navigation,...(origin?{Origin:origin}:{})});assert.equal(res.status,200);assert.match(res.body,/id="root"/);assert.equal(res.headers['cache-control'],'no-store');assert.ok(!res.body.includes(app.locals.store.getState().id));
  }
  for(const url of ['/api/state','/api/health','/api/events','/api/download?path=state.json','/media/test','/thumbnail/test','/proxy/test']){
   assert.equal((await get(base,url,navigation)).status,403,url);
   assert.equal((await get(base,url,{...navigation,Origin:HOSTED_UI_ORIGIN})).status,401,url);
  }
  for(const headers of [{...navigation,'Sec-Fetch-Dest':'iframe'},{...navigation,'Sec-Fetch-Mode':'cors','Sec-Fetch-Dest':'empty'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await get(base,'/',headers)).status,403);
  assert.equal((await get(base,'/',navigation,'POST')).status,403);
  assert.equal((await get(base,'/api/command',navigation,'POST')).status,403);
  assert.equal((await get(base,'/',{...navigation,Host:'evil.example'})).status,403);
  assert.equal((await get(base,'/api/state',{'Sec-Fetch-Site':'same-origin',Origin:base})).status,200);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('document entry exception still rejects non-loopback clients',()=>{
 let error,passed=false;
 localOnly({method:'GET',path:'/',socket:{remoteAddress:'192.168.1.1'},get:name=>({'host':'127.0.0.1:4318','sec-fetch-mode':'navigate','sec-fetch-dest':'document','sec-fetch-site':'cross-site'})[name]}, {set:()=>{}}, e=>{error=e;passed=!e;});
 assert.equal(passed,false);assert.equal(error.status,403);
});
