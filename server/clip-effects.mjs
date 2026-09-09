import {keyControls,keyDefaults} from './chroma-key.mjs';
// Shared, deterministic controls. No browser or Node dependency.
export const EFFECT_DEFAULTS = { x:50, y:50, scale:1, rotation:0, opacity:1, brightness:1, contrast:1, saturation:1, blur:0, fadeIn:0, fadeOut:0, ...keyDefaults };
export function clipControls(args = {}) {
  const result = {};
  const ranges = { lane:[0,7,0], speed:[.25,4,1], x:[-100,200,50], y:[-100,200,50], scale:[.05,4,1], rotation:[-360,360,0], opacity:[0,1,1], brightness:[0,2,1], contrast:[0,3,1], saturation:[0,3,1], blur:[0,40,0], fadeIn:[0,60,0], fadeOut:[0,60,0] };
  for (const [key,[min,max,fallback]] of Object.entries(ranges)) {
    const value=args[key] ?? fallback;
    if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(key==='lane'&&!Number.isInteger(value)))throw new Error(`${key} must be ${min}–${max}`);
    result[key]=value;
  }
  return {...result,...keyControls(args)};
}
export function clipEnvelope(clip,time) {
  const relative=time-clip.start;
  return Math.max(0,Math.min(1,clip.fadeIn>0?relative/clip.fadeIn:1,clip.fadeOut>0?(clip.duration-relative)/clip.fadeOut:1));
}
export function clipStyle(clip,time) {
  const c={...EFFECT_DEFAULTS,...clip};
  return {left:`${c.x}%`,top:`${c.y}%`,width:`${c.scale*100}%`,height:`${c.scale*100}%`,transform:`translate(-50%,-50%) rotate(${c.rotation}deg)`,opacity:c.opacity*clipEnvelope(c,time),filter:`brightness(${c.brightness}) contrast(${c.contrast}) saturate(${c.saturation}) blur(${c.blur}px)`};
}
