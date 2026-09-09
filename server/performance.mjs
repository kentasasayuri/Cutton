import os from 'node:os';
export function performanceProfile({memory=os.totalmem(),processors=os.availableParallelism?.()||os.cpus().length,cpu=os.cpus()[0]?.model||'CPU'}={}){
 const memoryGiB=Math.round(memory/1024**3*10)/10;
 return {cpu,memoryGiB,processors,encodeThreads:Math.max(1,Math.min(4,Math.floor(processors/4),Math.floor(memoryGiB/3))),previewThreads:Math.max(1,Math.min(2,Math.floor(processors/6))),filterThreads:memoryGiB>=12?2:1,renderConcurrency:1,quality:{finalCrf:18,intermediateCrf:0,originalResolution:true,originalFrameRate:true},note:'書き出しは元素材を使用。中間合成は可逆圧縮、最終MP4のみ圧縮します。'};
}
export const PERFORMANCE=performanceProfile();
export const encodeThreads=(width=1920,height=1080)=>String(width*height>=3840*2160?Math.min(2,PERFORMANCE.encodeThreads):PERFORMANCE.encodeThreads);
