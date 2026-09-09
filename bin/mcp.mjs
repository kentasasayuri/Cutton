#!/usr/bin/env node
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {api} from './client.mjs';
const server=new McpServer({name:'cutton',version:'0.1.0'});
const content=value=>({content:[{type:'text',text:JSON.stringify(value,null,2)}]});
server.registerTool('cutton_state',{description:'Read the current storyboard, source assets, timeline, generation jobs and connection settings.'},async()=>content(await api('/api/state')));
server.registerTool('cutton_capabilities',{description:'Discover every editor command and its parameters. Also documents the UI action contract.'},async()=>content(await api('/api/capabilities')));
server.registerTool('cutton_command',{
  description:'Execute any editor operation using the same dispatcher as the UI and CLI. Discover commands first. Examples: storyboard.add, asset.import, timeline.add, timeline.split, plan.create, generation.submit, narration.prepare, export.create. Generation uses the configured external provider and can incur provider usage. Never claim a queued or awaiting_import job is completed.',
  inputSchema:{command:z.string(),args:z.record(z.unknown()).default({})}
},async({command,args})=>{
  try{return content(await api('/api/command',{command,args}));}catch(e){return{isError:true,content:[{type:'text',text:e.message}]};}
});
server.registerResource('project','cutton://project',{description:'Current editor state',mimeType:'application/json'},async uri=>({contents:[{uri:uri.href,mimeType:'application/json',text:JSON.stringify(await api('/api/state'))}]}));
await server.connect(new StdioServerTransport());
