import http from 'node:http';
import https from 'node:https';
export const baseUrl = process.env.CUTTON_URL || process.env.YACHICUT_URL || 'http://127.0.0.1:4318';
export async function api(route,body) {
  // Rendering can legitimately take over five minutes before returning headers.
  // Node fetch's separate headers timeout cannot be extended with AbortSignal.
  const url=new URL(route,baseUrl),payload=body===undefined?undefined:JSON.stringify(body);
  if(!['http:','https:'].includes(url.protocol))throw new Error('Cutton URL must use HTTP or HTTPS');
  return new Promise((resolve,reject)=>{
    const request=(url.protocol==='https:'?https:http).request(url,{agent:false,method:payload===undefined?'GET':'POST',headers:payload===undefined?{}:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('error',reject);response.on('aborted',()=>reject(new Error('Cuttonとの接続が中断されました。')));
      response.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(response.statusCode<200||response.statusCode>=300)throw new Error(value.error||`HTTP ${response.statusCode}`);resolve(value);}catch(error){reject(error);}});
    });
    request.setTimeout(30*60*1000,()=>request.destroy(new Error('Cuttonの処理が30分以内に応答しませんでした。')));request.on('error',reject);request.end(payload);
  });
}
