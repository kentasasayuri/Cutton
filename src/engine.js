const remote = typeof location !== 'undefined' && location.hostname.endsWith('.chatgpt.site');
export const isHosted = remote;
const base = remote ? 'http://127.0.0.1:4318' : '';
let token='', pairing;
export async function connectEngine(){
  if(!remote||token)return;
  if(!pairing)pairing=fetch(base+'/api/pair',{method:'POST'}).then(async response=>{
    const data=await response.json();if(!response.ok||!data.token)throw new Error(data.error||'接続できません');token=data.token;
  }).catch(()=>{throw new Error('編集エンジンに接続できません。PCで「Cuttonを起動」を開き、ブラウザのローカルネットワーク接続を許可してください。');}).finally(()=>{pairing=null;});
  return pairing;
}
export function engineUrl(url){
  if(!remote||typeof url!=='string'||!url.startsWith('/'))return url;
  const target=new URL(url,base);if(token)target.searchParams.set('access_token',token);return target.href;
}
export function hydrateEngineUrls(value){
  if(!remote||value===null||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(hydrateEngineUrls);
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,/url$/i.test(key)&&typeof item==='string'?engineUrl(item):hydrateEngineUrls(item)]));
}
export async function engineFetch(url,options={}){
  await connectEngine();
  const headers=new Headers(options.headers);if(remote)headers.set('Authorization','Bearer '+token);
  const response=await fetch(base+url,{...options,headers});
  if(remote&&response.status===401){token='';await connectEngine();headers.set('Authorization','Bearer '+token);return fetch(base+url,{...options,headers});}
  return response;
}
