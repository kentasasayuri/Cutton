import {keyControls,keyDefaults} from './chroma-key.mjs';
// Shared, deterministic controls. No browser or Node dependency.
export const BLEND_MODES=[['normal','通常'],['screen','スクリーン'],['multiply','乗算'],['overlay','オーバーレイ'],['difference','差の絶対値'],['lighten','比較（明）'],['darken','比較（暗）']];
export const EFFECT_DEFAULTS = { cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,x:50, y:50, scale:1, rotation:0, opacity:1, brightness:1, contrast:1, saturation:1, blur:0, fadeIn:0, fadeOut:0, fadeCurve:'linear',blendMode:'normal',maskShape:'none',maskX:50,maskY:50,maskWidth:80,maskHeight:80,maskFeather:0,maskInvert:false, ...keyDefaults };
export function clipControls(args = {}) {
  const result = {};
  const ranges = { cropLeft:[0,90,0],cropRight:[0,90,0],cropTop:[0,90,0],cropBottom:[0,90,0],lane:[0,7,0], speed:[.25,4,1], x:[-100,200,50], y:[-100,200,50], scale:[.05,4,1], rotation:[-360,360,0], opacity:[0,1,1], brightness:[0,2,1], contrast:[0,3,1], saturation:[0,3,1], blur:[0,40,0], fadeIn:[0,60,0], fadeOut:[0,60,0] };
  for (const [key,[min,max,fallback]] of Object.entries(ranges)) {
    const value=args[key] ?? fallback;
    if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(key==='lane'&&!Number.isInteger(value)))throw new Error(`${key} must be ${min}–${max}`);
    result[key]=value;
  }
  for(const [k,min,max] of [['maskX',0,100],['maskY',0,100],['maskWidth',1,200],['maskHeight',1,200],['maskFeather',0,50]]){const v=args[k]??EFFECT_DEFAULTS[k];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`Invalid ${k}`);result[k]=v;}
  for(const [k,values] of [['blendMode',BLEND_MODES.map(x=>x[0])],['maskShape',['none','rect','ellipse']],['fadeCurve',['linear','equalPower']]]){result[k]=args[k]??EFFECT_DEFAULTS[k];if(!values.includes(result[k]))throw Error(`Invalid ${k}`);}
  result.maskInvert=args.maskInvert??false;if(typeof result.maskInvert!=='boolean')throw Error('Invalid maskInvert');
  if(result.cropLeft+result.cropRight>=95||result.cropTop+result.cropBottom>=95)throw new Error('画面を5%以上残してください。');return {...result,...keyControls(args)};
}
export function clipEnvelope(clip,time) {
  const relative=time-clip.start;
  const value=Math.max(0,Math.min(1,clip.fadeIn>0?relative/clip.fadeIn:1,clip.fadeOut>0?(clip.duration-relative)/clip.fadeOut:1));return clip.track==='audio'&&clip.fadeCurve==='equalPower'?Math.sin(value*Math.PI/2):value;
}
export function maskSvg(c){
 if(!c.maskShape||c.maskShape==='none')return null;const x=c.maskX??50,y=c.maskY??50,w=c.maskWidth??80,h=c.maskHeight??80,f=c.maskFeather??0;
 const shape=c.maskShape==='ellipse'?`<ellipse cx="${x}" cy="${y}" rx="${w/2}" ry="${h/2}"/>`:`<rect x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}"/>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><filter id="f" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${f/3}"/></filter><mask id="m"><rect width="100" height="100" fill="${c.maskInvert?'white':'black'}"/><g fill="${c.maskInvert?'black':'white'}"${f?' filter="url(#f)"':''}>${shape}</g></mask></defs><rect width="100" height="100" fill="white" mask="url(#m)"/></svg>`;
}
export function clipStyle(clip,time) {
  const c={...EFFECT_DEFAULTS,...clip};
  const svg=maskSvg(c);return {maskImage:svg?`url("data:image/svg+xml,${encodeURIComponent(svg)}")`:'none',maskSize:'100% 100%',mixBlendMode:c.blendMode,clipPath:`inset(${c.cropTop}% ${c.cropRight}% ${c.cropBottom}% ${c.cropLeft}%)`,left:`${c.x}%`,top:`${c.y}%`,width:`${c.scale*100}%`,height:`${c.scale*100}%`,transform:`translate(-50%,-50%) rotate(${c.rotation}deg)`,opacity:c.opacity*clipEnvelope(c,time),filter:`brightness(${c.brightness}) contrast(${c.contrast}) saturate(${c.saturation}) blur(${c.blur}px)`};
}
