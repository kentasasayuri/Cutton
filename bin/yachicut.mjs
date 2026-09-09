#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {api} from './client.mjs';
const [command='help',...rest]=process.argv.slice(2);
try{
  if(command==='help'||command==='--help'){
    console.log(`Cutton CLI\n\ncutton state\ncutton commands\ncutton <command> '{"key":"value"}'\ncutton <command> --file args.json\ncutton import <absolute-file-path>\n\nAll mutations use the same /api/command dispatcher as the browser and MCP.\nSet CUTTON_URL for a different local port. Start the server first with npm start.`);
  }else{
    let result;
    if(command==='state')result=await api('/api/state');
    else if(command==='commands')result=await api('/api/capabilities');
    else if(command==='import')result=await api('/api/command',{command:'asset.import',args:{path:path.resolve(rest[0])}});
    else{
      const args=rest[0]==='--file'?JSON.parse(await fs.readFile(rest[1],'utf8')):JSON.parse(rest.join(' ')||'{}');
      result=await api('/api/command',{command,args});
    }
    console.log(JSON.stringify(result,null,2));
  }
}catch(error){console.error(error.message);process.exitCode=1;}
