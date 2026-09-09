import path from 'node:path';
import { mkdir, readdir, readFile, stat } from 'node:fs/promises';
import { atomicJson, AppError } from './util.mjs';
const validId=id=>typeof id==='string'&&/^project_[a-zA-Z0-9_-]{1,90}$/.test(id);
export function projectLibrary(dataDir){
  const root=path.join(dataDir,'library');
  const file=id=>{if(!validId(id))throw new AppError('プロジェクトIDが不正です。');return path.join(root,id+'.json');};
  return {
    async initialize(current){await mkdir(root,{recursive:true});await atomicJson(file(current.id),current);},
    async save(state){await atomicJson(file(state.id),state);},
    async load(id){const target=file(id);if((await stat(target)).size>20*1024**2)throw new AppError('プロジェクトが大きすぎます。');const state=JSON.parse(await readFile(target,'utf8'));if(state.id!==id)throw new AppError('プロジェクトIDが一致しません。');return state;},
    async list(){const projects=[];for(const item of (await readdir(root)).filter(name=>name.endsWith('.json')).slice(0,5000)){
      try{const state=JSON.parse(await readFile(path.join(root,item),'utf8'));if(!validId(state.id))continue;projects.push({id:state.id,name:state.name,updatedAt:state.updatedAt,width:state.width,height:state.height,fps:state.fps,assets:state.assets.length,clips:state.clips.length,duration:Math.max(0,...state.clips.map(c=>c.start+c.duration),...(state.graphics||[]).map(g=>g.start+g.duration))});}catch{/* A broken snapshot does not hide healthy projects. */}
    }return projects.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));}
  };
}
