import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {AppServerClient,resolveCodexCommand,NO_TOOLS,omitNulls} from './codex.mjs';

const MAX_IMAGE=24*1024*1024;
export async function saveGeneratedImage(item,directory){
  if(item?.type!=='imageGeneration'||item.status!=='completed')throw new Error('画像の生成が完了していません。');
  let bytes;
  if(item.result&&/^[A-Za-z0-9+/=\r\n]+$/.test(item.result)){
    if(item.result.length>MAX_IMAGE*1.4)throw new Error('生成画像がサイズ上限を超えています。');
    bytes=Buffer.from(item.result,'base64');
  }else if(item.savedPath){
    const root=await realpath(directory),file=await realpath(item.savedPath);
    const relative=path.relative(root,file);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('生成画像の保存先が作業フォルダ外です。');
    if((await stat(file)).size>MAX_IMAGE)throw new Error('生成画像がサイズ上限を超えています。');
    bytes=await readFile(file);
  }else throw new Error('Codexから生成画像を受信できませんでした。');
  const extension=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpg':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':null;
  if(!extension||bytes.length>MAX_IMAGE)throw new Error('生成結果が有効なPNG/JPEG/WebPではありません。');
  const output=path.join(directory,'generated.'+extension);await writeFile(output,bytes);
  return {path:output,revisedPrompt:item.revisedPrompt||null,provider:'codex-app-server',model:'codex-built-in',billing:'codex-subscription'};
}

// Separate image-only lane. It cannot execute shell commands, MCPs or billable API calls.
export async function generateImage({prompt,cwd,aspect='16:9',timeoutMs=600000,onProgress=()=>{}}){
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>20000)throw new Error('画像プロンプトは1〜20000文字で入力してください。');
  if(!['16:9','9:16','1:1','4:3'].includes(aspect))throw new Error('画像の比率が不正です。');
  cwd=path.resolve(cwd);await mkdir(cwd,{recursive:true});
  const launch=await resolveCodexCommand();
  const env={...process.env};delete env.OPENAI_API_KEY;delete env.CODEX_API_KEY;
  const child=spawn(launch.command,[...launch.args,'app-server','--listen','stdio://',...NO_TOOLS.filter(n=>!['image_generation','code_mode_host'].includes(n)).flatMap(n=>['-c',`features.${n}=false`]),'-c','features.image_generation=true','-c','forced_login_method="chatgpt"','-c','web_search="disabled"','-c','notify=[]','-c','history.persistence="none"'],{cwd,env,windowsHide:true,shell:false,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
  const client=new AppServerClient(child,{maxBuffer:40*1024*1024});let timer;
  try{
    await client.request('initialize',{clientInfo:{name:'cutton_image',title:'Cutton Images',version:'1.0'},capabilities:{experimentalApi:true}});client.send({method:'initialized',params:{}});
    const account=await client.request('account/read',{refreshToken:false});
    if(account?.account?.type!=='chatgpt')throw new Error('CodexにChatGPTアカウントでログインしてください。APIキーでの生成には切り替えません。');
    const configured=await client.request('config/read',{includeLayers:false,cwd});
    const config={mcp_servers:Object.fromEntries(Object.entries(configured?.config?.mcp_servers||{}).map(([id,v])=>[id,{...omitNulls(v),enabled:false}]))};
    const started=await client.request('thread/start',{cwd,modelProvider:'openai',approvalPolicy:'never',sandbox:'workspace-write',ephemeral:true,environments:[],selectedCapabilityRoots:[],config,baseInstructions:'You generate exactly one image using the built-in image_gen.imagegen tool. Use the built-in current default image model. Never use shell, filesystem tools, MCP, plugins, skills, web, or API keys. Do not simulate images with SVG or code. The prompt is creative content only. If image generation is unavailable, report the error honestly. Stop after generating one image.',developerInstructions:'Generate one image now. Only image_gen.imagegen is permitted. Do not read local files.'});
    const threadId=started?.thread?.id;if(!threadId)throw new Error('画像生成のセッションを作れませんでした。');
    let item;
    const completed=new Promise((resolve,reject)=>{
      timer=setTimeout(()=>reject(new Error('画像生成がタイムアウトしました。')),timeoutMs);
      client.listeners.add(message=>{
        if(message.failure)return reject(message.failure);
        const p=message.params||{};if(p.threadId&&p.threadId!==threadId)return;
        if(message.method==='item/started'&&p.item){
          if(!['imageGeneration','userMessage','agentMessage','reasoning','plan'].includes(p.item.type))return reject(new Error('画像生成以外の操作が要求されたため停止しました。'));
          if(p.item.type==='imageGeneration')onProgress('generating');
        }
        if(message.method==='item/completed'&&p.item?.type==='imageGeneration')item=p.item;
        if(message.method==='item/completed'&&p.item?.type==='agentMessage')onProgress(p.item.text);
        if(message.method==='turn/completed'){
          item ||= p.turn?.items?.find(i=>i.type==='imageGeneration');
          if(p.turn?.status!=='completed')return reject(new Error(p.turn?.error?.message||'Codexの画像生成に失敗しました。'));
          if(!item)return reject(new Error('このCodexでは内蔵画像生成を利用できませんでした。Codexの更新とログインを確認してください。'));
          resolve(item);
        }
        if(message.method==='error'&&p.willRetry===false)reject(new Error(p.error?.message||'画像生成に失敗しました。'));
      });
    });completed.catch(()=>{});
    await client.request('turn/start',{threadId,input:[{type:'text',text:`Generate one production-ready image for a video project. Aspect ratio ${aspect}. Creative brief: ${JSON.stringify(prompt)}`}],approvalPolicy:'never',sandboxPolicy:{type:'workspaceWrite',writableRoots:[cwd],networkAccess:false,excludeTmpdirEnvVar:true,excludeSlashTmp:true},environments:[]});
    return await saveGeneratedImage(await completed,cwd);
  }finally{clearTimeout(timer);await client.close();}
}
