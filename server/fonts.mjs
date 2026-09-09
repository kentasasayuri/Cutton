import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BUNDLED_FONTS,validFontFamily} from './font-catalog.mjs';
export const bundledFontDir=fileURLToPath(new URL('../public/fonts/',import.meta.url));
export const localFontDir=()=>process.env.CUTTON_FONT_DIR||path.join(process.env.LOCALAPPDATA||process.env.HOME||'.','Cutton','fonts');
// Read the OpenType name table without executing font data. Reject collections and web archives.
export function readFontFamily(buffer){
 if(buffer.length<12||buffer.length>24*1024*1024)throw new Error('フォントは24 MB以下のTTF / OTFを選択してください。');
 const signature=buffer.readUInt32BE(0);if(signature!==0x00010000&&buffer.toString('ascii',0,4)!=='OTTO')throw new Error('TTF / OTF形式ではありません。');
 const n=buffer.readUInt16BE(4);if(n>512||12+n*16>buffer.length)throw new Error('フォントのテーブルが不正です。');
 for(let i=0;i<n;i++){const base=12+i*16;if(buffer.toString('ascii',base,base+4)!=='name')continue;const start=buffer.readUInt32BE(base+8),length=buffer.readUInt32BE(base+12);if(start+length>buffer.length||length<6)break;const count=buffer.readUInt16BE(start+2),strings=start+buffer.readUInt16BE(start+4);if(6+count*12>length)break;const names=[];
  for(let j=0;j<count;j++){const p=start+6+j*12,platform=buffer.readUInt16BE(p),language=buffer.readUInt16BE(p+4),id=buffer.readUInt16BE(p+6),size=buffer.readUInt16BE(p+8),offset=strings+buffer.readUInt16BE(p+10);if(![1,16].includes(id)||offset+size>start+length||offset<start||![0,3].includes(platform)||size%2)continue;let value='';for(let k=offset;k<offset+size;k+=2)value+=String.fromCharCode(buffer.readUInt16BE(k));if(validFontFamily(value))names.push({value,score:(id===16?4:0)+(language===0x409?2:0)});}
  names.sort((a,b)=>b.score-a.score);if(names.length)return names[0].value;
 }throw new Error('フォント名を読み取れません。');
}
export async function installedFonts(){let entries=[];try{entries=await readdir(localFontDir());}catch(e){if(e.code!=='ENOENT')throw e;}const fonts=[];for(const file of entries.filter(f=>/^[a-f0-9]{64}\.(ttf|otf)$/.test(f))){try{fonts.push({family:readFontFamily(await readFile(path.join(localFontDir(),file))),file,url:'/api/fonts/file/'+file});}catch{}}return fonts;}
export async function importFont(buffer){const family=readFontFamily(buffer),extension=buffer.toString('ascii',0,4)==='OTTO'?'otf':'ttf',file=createHash('sha256').update(buffer).digest('hex')+'.'+extension;await mkdir(localFontDir(),{recursive:true});await writeFile(path.join(localFontDir(),file),buffer,{flag:'w'});return {family,file,url:'/api/fonts/file/'+file};}
export async function renderFontFiles(families=[]){const names=new Set(families);return [...BUNDLED_FONTS.filter(f=>names.has(f.family)).flatMap(f=>f.files.map(file=>path.join(bundledFontDir,file))),...(await installedFonts()).filter(f=>names.has(f.family)).map(f=>path.join(localFontDir(),f.file))];}
