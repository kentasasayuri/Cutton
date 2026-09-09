import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {realpathSync} from 'node:fs';
const engineProxy=()=>({target:'http://127.0.0.1:4318',changeOrigin:true,configure(proxy){proxy.on('proxyReq',(outgoing,request)=>{if(request.headers.origin==='http://127.0.0.1:5173')outgoing.setHeader('Origin','http://127.0.0.1:4318');});}});
export default defineConfig({
  root: realpathSync(process.cwd()),
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort:true, proxy: Object.fromEntries(['/api','/media','/thumbnail','/proxy','/waveform'].map(prefix=>[prefix,engineProxy()])) },
  build: { target: 'es2022', sourcemap: false },
});
