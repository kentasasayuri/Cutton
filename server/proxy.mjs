import {PERFORMANCE} from './performance.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {AppError} from './util.mjs';

// Proxies are disposable preview files. Editing and exports always reference originals.
export function createProxyManager({dataDir,getState}) {
  const directory=path.resolve(dataDir,'proxies');
  const jobs=new Map(); const queue=[]; let active=null; let disposed=false;
  function describe(assetId,height=360) {
    height=Number(height);
    if(![360,540,720].includes(height)) throw new AppError('プレビュー解像度は360 / 540 / 720を指定してください。');
    const asset=getState().assets.find(a=>a.id===assetId);
    if(!asset) throw new AppError('素材が見つかりません。',404);
    if(asset.kind!=='video') throw new AppError('軽量プレビューは動画素材用です。');
    if(!/^[a-f0-9]{64}$/i.test(asset.sha256)) throw new AppError('素材のハッシュが不正です。');
    const key=`${asset.sha256}-${height}-v1`;
    return {asset,height,key,target:path.join(directory,key+'.mp4'),url:`/proxy/${encodeURIComponent(asset.id)}?height=${height}`};
  }
  const publicJob=(job)=>({status:job.status,url:job.url,height:job.height,error:job.error});
  async function status(assetId,height=360){
    const info=describe(assetId,height);
    try{if((await fs.stat(info.target)).size>0)return{status:'ready',url:info.url,height:info.height};}catch(e){if(e.code!=='ENOENT')throw e;}
    const job=jobs.get(info.key);
    if(job?.status==='ready'){jobs.delete(info.key);return{status:'missing',url:info.url,height:info.height};}
    return job?publicJob(job):{status:'missing',url:info.url,height:info.height};
  }
  async function prune(){
    const files=await fs.readdir(directory,{withFileTypes:true});const entries=[];
    for(const file of files){
      if(!file.isFile()||!/^\w+-\d+-v1\.mp4$/.test(file.name))continue;
      const full=path.resolve(directory,file.name);
      if(path.dirname(full)!==directory)continue;
      const info=await fs.stat(full);entries.push({full,...info});
    }
    let total=entries.reduce((n,e)=>n+e.size,0);
    for(const entry of entries.sort((a,b)=>a.mtimeMs-b.mtimeMs)){
      if(total<4*1024**3)break;
      // Never remove the file being produced; only cached proxies in our directory.
      if(entry.full===active?.target)continue;
      try { await fs.unlink(entry.full);total-=entry.size; } catch { /* An active player may hold the cached file on Windows. */ }
    }
  }
  async function next(){
    if(active||disposed||!queue.length)return;
    const job=queue.shift();active=job;job.status='running';
    const temporary=job.target+'.part.mp4';
    let timer;
    try{
      await fs.mkdir(directory,{recursive:true});
      if(disposed)throw new Error('プレビュー処理を停止しました。');
      await new Promise((resolve,reject)=>{
        const child=spawn(process.env.FFMPEG_PATH||'ffmpeg',[
          '-hide_banner','-loglevel','error','-nostdin','-y','-threads','1','-i',job.asset.path,
          '-map','0:v:0','-an','-sn','-dn','-vf',`scale=-2:max(2\\,trunc(min(${job.height}\\,ih)/2)*2),fps=30,format=yuv420p`,
          '-c:v','libx264','-preset','ultrafast','-crf','27','-threads',String(PERFORMANCE.previewThreads),'-filter_threads','1',
          '-movflags','+faststart',temporary
        ],{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,OMP_NUM_THREADS:'1'}});
        job.child=child;let errorText='';
        child.on('spawn',()=>{try{os.setPriority(child.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{/* Best effort on supported platforms. */}});
        child.stderr.on('data',d=>{errorText=(errorText+d).slice(-3000);});
        child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(errorText||'軽量プレビューの作成に失敗しました。')));
        timer=setTimeout(()=>{child.kill();reject(new Error('プレビュー作成が30分を超えました。'));},30*60*1000);timer.unref();
      });
      await fs.rename(temporary,job.target);job.status='ready';await prune();
    }catch(error){job.status='error';job.error=error.message;await fs.unlink(temporary).catch(()=>{});}
    finally{clearTimeout(timer);delete job.child;active=null;if(jobs.size>64){for(const [key,item] of jobs){if(item.status==='ready'||item.status==='error'){jobs.delete(key);if(jobs.size<=64)break;}}}void next();}
  }
  return {
    status,
    async request(assetId,height=360){
      if(disposed)throw new AppError('プレビュー処理は停止しています。',503);
      const info=describe(assetId,height);const existing=await status(assetId,height);
      if(disposed)throw new AppError('プレビュー処理は停止しています。',503);
      if(['ready','queued','running'].includes(existing.status))return existing;
      const concurrent=jobs.get(info.key);
      if(concurrent&&['ready','queued','running'].includes(concurrent.status))return publicJob(concurrent);
      if(queue.length>=16)throw new AppError('プレビュー作成が混み合っています。完了後に再試行してください。',429);
      const job={...info,status:'queued'};jobs.set(info.key,job);queue.push(job);void next();return publicJob(job);
    },
    async file(assetId,height=360){const info=describe(assetId,height);if((await status(assetId,height)).status!=='ready')throw new AppError('プレビューを作成中です。',409);return info.target;},
    close(){disposed=true;queue.length=0;active?.child?.kill();}
  };
}
