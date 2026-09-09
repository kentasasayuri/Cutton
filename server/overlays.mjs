import {captionStyle} from './caption-style.mjs';
// Shared with the preview: keep this module free of Node-only imports.
export const GRAPHIC_TYPES = ['title', 'lower-third', 'shape', 'kinetic', 'callout', 'frame', 'vector', 'null'];
const ANIMATIONS = ['fade', 'slide-up', 'none'];
const EASINGS = ['linear', 'ease-in-out', 'bezier', 'hold'];
const MAX_TIME = 86400;

function number(value, fallback, label, min, max) {
  if (value === undefined) return fallback;
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value))) throw new Error(`${label} must be a finite number`);
  const result = Number(value);
  if (result < min || result > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return result;
}
function color(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new Error('color must be #rrggbb');
  return value.toLowerCase();
}
function choice(value, fallback, choices, label) {
  const result = value ?? fallback;
  if (!choices.includes(result)) throw new Error(`Invalid ${label}: ${result}`);
  return result;
}
function text(value, required) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > 2000 || (required && !value.trim())) throw new Error('text must contain 1–2000 characters');
  return value.replace(/\r\n?/g, '\n');
}

export function createOverlay(kind, args = {}, id) {
  if (!['caption', 'graphics'].includes(kind)) throw new Error('Overlay kind must be caption or graphics');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Overlay arguments must be an object');
  const start = number(args.start, 0, 'start', 0, MAX_TIME);
  const duration = number(args.duration, 3, 'duration', Number.MIN_VALUE, MAX_TIME);
  if (start + duration > MAX_TIME) throw new Error('Overlay end must be at most 86400 seconds');
  const type = kind === 'graphics' ? choice(args.type, 'title', GRAPHIC_TYPES, 'graphics type') : undefined;
  const result = {
    id: id ?? `${kind === 'caption' ? 'cap' : 'gfx'}_${globalThis.crypto.randomUUID()}`,
    ...(type ? { type } : {}),
    text: text(args.text, kind === 'caption' || !['shape', 'frame', 'vector', 'null'].includes(type)),
    start, duration,
    x: number(args.x, 50, 'x', 0, 100),
    y: number(args.y, kind === 'caption' ? 88 : 65, 'y', 0, 100),
    fontSize: number(args.fontSize, kind === 'caption' ? 48 : 56, 'fontSize', 8, 300),
    color: color(args.color, kind === 'caption' ? '#ffffff' : '#63c9cf'),
  };
  if (typeof result.id !== 'string' || !result.id || result.id.length > 200) throw new Error('Invalid overlay id');
  if(kind==='caption')Object.assign(result,captionStyle(args,duration,result.text));
  if (kind === 'graphics') {
    if(['vector','null'].includes(type)){
      result.shape=choice(args.shape,'rect',['rect','ellipse','line','text','polygon','star'],'shape');
      result.mask=choice(args.mask,'none',['none','rect','ellipse'],'mask');
      result.repeat=choice(args.repeat,'none',['none','loop','pingpong'],'repeat');
      for(const [key,min,max,fallback] of [['stroke',0,100,0],['radius',0,500,0],['shadow',0,60,0],['glow',0,60,0],['tracking',-20,100,0],['fontWeight',100,900,700],['wiggle',0,20,0],['frequency',.1,20,1],['fillOpacity',0,1,1],['sides',3,16,5],['innerRadius',5,95,45],['gradientAngle',-360,360,45],['strokeStart',0,100,0],['strokeEnd',0,100,100],['copies',1,20,1],['copyX',-100,100,5],['copyY',-100,100,0],['copyRotation',-360,360,0],['copyOpacity',0,1,1]])result[key]=number(args[key],fallback,key,min,max);
      for(const key of ['sides','copies'])if(!Number.isInteger(result[key]))throw new Error(key+' must be an integer');
      if(result.strokeEnd<result.strokeStart)throw new Error('線の終点は始点以降にしてください。');
      result.strokeAnimation=choice(args.strokeAnimation,'none',['none','draw','erase'],'strokeAnimation');
      for(const [key,fallback] of [['strokeColor','#ffffff'],['textColor','#ffffff'],['gradientColor','#182a58']])result[key]=color(args[key],fallback);
      if(args.gradient!==undefined&&typeof args.gradient!=='boolean')throw new Error('gradient must be boolean');result.gradient=args.gradient??false;
      for(const key of ['parentId','matteId']){if(args[key]!=null&&(typeof args[key]!=='string'||args[key].length>200))throw new Error('Invalid layer reference');result[key]=args[key]||null;}
    }
    result.animation = choice(args.animation, 'fade', ANIMATIONS, 'animation');
    result.width = number(args.width, 40, 'width', 0.1, 100);
    result.height = number(args.height, 12, 'height', 0.1, 100);
    if (args.keyframes !== undefined && !Array.isArray(args.keyframes)) throw new Error('keyframes must be an array');
    if ((args.keyframes?.length ?? 0) > 60) throw new Error('At most 60 keyframes are supported');
    result.keyframes = (args.keyframes ?? []).map(frame => {
      if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw new Error('Invalid keyframe');
      if(frame.bezier!==undefined&&(!Array.isArray(frame.bezier)||frame.bezier.length!==4))throw new Error('bezier requires four controls');
      return {
        time: number(frame.time, 0, 'keyframe time', 0, duration),
        x: number(frame.x, result.x, 'keyframe x', 0, 100),
        y: number(frame.y, result.y, 'keyframe y', 0, 100),
        scale: number(frame.scale, 1, 'keyframe scale', 0.1, 4),
        rotation: number(frame.rotation, 0, 'keyframe rotation', -360, 360),
        opacity: number(frame.opacity, 1, 'keyframe opacity', 0, 1),
        bezier: (frame.bezier??[.25,.1,.25,1]).map((v,i)=>number(v,0,'bezier',i%2? -2:0,i%2?3:1)),
        easing: choice(frame.easing, 'linear', EASINGS, 'keyframe easing'),
      };
    }).sort((a, b) => a.time - b.time);
    if (result.keyframes.some((frame, i, list) => i && frame.time === list[i - 1].time)) throw new Error('Keyframe times must be unique');
  }
  return result;
}

export function updateOverlay(kind, existing, args = {}) {
  if (!existing?.id) throw new Error('Existing overlay is required');
  return createOverlay(kind, { ...existing, ...args }, existing.id);
}

// The first keyframe holds before its time and the last holds through the end.
// Easing belongs to the outgoing keyframe. Rotation is clockwise, as in CSS.
export function evaluateOverlayTransform(item, relativeTime) {
  const time = Math.max(0, Math.min(item.duration, relativeTime));
  const list = item.keyframes ?? [];
  if (list.length) {
    if (time <= list[0].time) return { ...list[0] };
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (time > b.time) continue;
      let u = (time - a.time) / (b.time - a.time);
      if (a.easing === 'ease-in-out') u = u * u * (3 - 2 * u);
      if (a.easing === 'hold') u = time < b.time ? 0 : 1;
      if (a.easing === 'bezier') u = cubicEase(u,a.bezier);
      const value = { time, easing: a.easing };
      for (const field of ['x', 'y', 'scale', 'rotation', 'opacity']) value[field] = a[field] + (b[field] - a[field]) * u;
      return value;
    }
    return { ...list.at(-1) };
  }
  const value = { x: item.x, y: item.y, scale: 1, rotation: 0, opacity: 1 };
  if (item.animation === 'fade') {
    const fade = Math.min(0.25, item.duration / 2);
    value.opacity = Math.max(0, Math.min(1, time / fade, (item.duration - time) / fade));
  } else if (item.animation === 'slide-up') value.y += 5 * (1 - Math.min(1, time / Math.min(0.4, item.duration)));
  return value;
}

const graphemeSegmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ja', { granularity: 'grapheme' }) : null;
const isWideGrapheme = value => /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]|\p{Extended_Pictographic}/u.test(value);
function graphemeWidth(value) {
  if (/^\s+$/u.test(value)) return 0.36;
  if (isWideGrapheme(value)) return 1.05;
  if (/^[MWmw]/.test(value)) return 1;
  if (/^[A-Z]/.test(value)) return 0.85;
  if (/^[iljtfr]/.test(value)) return 0.48;
  if (/^[\p{Script=Latin}\d]/u.test(value)) return 0.72;
  if (/^[.,:;!'"`()\[\]{}\-–—/\\]/u.test(value)) return 0.48;
  return 1.05;
}

// This deliberately uses the same conservative metrics in browser and export,
// rather than either engine's font measurement. Layout stays fixed while the
// entire graphic scales/rotates. Explicit input line breaks remain intact.
export function wrapOverlayText(item, projectWidth, kind) {
  const canvasWidth = number(projectWidth, 1920, 'projectWidth', 2, 8192);
  const caption = kind === 'caption' || (!kind && !item.type);
  const type = caption ? 'caption' : item.type;
  const boxed = ['lower-third', 'shape', 'callout', 'frame'].includes(type);
  const boxWidth = canvasWidth * (boxed ? Number(item.width ?? 40) : 90) / 100;
  const padding = boxed ? Math.min(16, boxWidth * 0.08) : 0;
  const available = Math.max(1, boxWidth - padding * 2 - (['callout', 'frame'].includes(type) ? 6 : 0));
  const fontSize = Number(item.fontSize ?? (caption ? 48 : 56)) * (type === 'kinetic' ? 1.5 : 1);
  const maximum = available / Math.max(1, fontSize);
  const wrapLine = line => {
    const graphemes = graphemeSegmenter ? Array.from(graphemeSegmenter.segment(line), part => part.segment) : Array.from(line);
    const lines = [];
    let start = 0;
    while (start < graphemes.length) {
      let end = start, width = 0, boundary = null;
      while (end < graphemes.length) {
        const nextWidth = graphemeWidth(graphemes[end]);
        if (end > start && width + nextWidth > maximum + 1e-8) break;
        width += nextWidth;
        if (/^\s+$/u.test(graphemes[end]) && end > start) boundary = { end, next: end + 1 };
        else if (end + 1 < graphemes.length && (isWideGrapheme(graphemes[end]) || isWideGrapheme(graphemes[end + 1]) || graphemes[end] === '-')) boundary = { end: end + 1, next: end + 1 };
        end++;
      }
      if (end === graphemes.length) { lines.push(graphemes.slice(start).join('')); break; }
      // Prefer a word/CJK boundary. A single overlong Latin word still breaks
      // by grapheme so URLs and unspaced strings cannot run outside the stage.
      const cut = boundary && boundary.end > start ? boundary : { end, next: end };
      lines.push(graphemes.slice(start, cut.end).join('').replace(/[\t ]+$/u, ''));
      start = cut.next;
      while (start < graphemes.length && /^[\t ]+$/u.test(graphemes[start])) start++;
    }
    return lines.join('\n');
  };
  return String(item.text ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n').map(wrapLine).join('\n');
}

function srtTime(seconds) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
export function toCaptionsSrt(state) {
  return (state.captions ?? []).map(item => createOverlay('caption', item, item.id)).sort((a, b) => a.start - b.start).map((item, i) => {
    // Empty lines terminate SRT cues; keep multiline captions in a single cue.
    const content = item.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\n[\t ]*\n/g, '\n');
    return `${i + 1}\n${srtTime(item.start)} --> ${srtTime(Math.max(item.start + 0.001, item.start + item.duration))}\n${content}\n\n`;
  }).join('');
}

// ASS has no portable literal escape for opening braces. Fullwidth braces and
// a zero-width separator after backslashes keep text visible without allowing
// user text to become override tags, drawings, or ASS newline escapes.
export function escapeAssText(value) {
  return String(value).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\\/g, '\\\u2060').replace(/\{/g, '｛').replace(/\}/g, '｝').replace(/\n/g, '\\N').replace(/\t/g, '    ');
}
const n = value => String(Math.round(value * 1000) / 1000);
const assColor = value => `&H${value.slice(5, 7)}${value.slice(3, 5)}${value.slice(1, 3)}&`;
const assAlpha = opacity => `&H${Math.round((1 - Math.max(0, Math.min(1, opacity))) * 255).toString(16).padStart(2, '0')}&`;
function assTime(centiseconds) {
  const cs = Math.max(0, Math.round(centiseconds));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
const rect = (w, h) => `m 0 0 l ${n(w)} 0 ${n(w)} ${n(h)} 0 ${n(h)}`;

function components(item, kind, width, height) {
  if (kind === 'caption') return [{ text: item.text, color: item.color, size: item.fontSize, outline: 2, shadow: 1 }];
  const w = item.width * width / 100, h = item.height * height / 100;
  const parts = [];
  if (['lower-third', 'shape', 'callout'].includes(item.type)) parts.push({ drawing: rect(w, h), color: item.type === 'callout' ? '#111c2c' : item.color });
  if (item.type === 'callout') parts.push({ drawing: rect(Math.min(6, w), h), color: item.color, dx: -(w - Math.min(6, w)) / 2 });
  if (item.type === 'frame') {
    const line = Math.min(3, w / 2, h / 2);
    // Opposite winding makes a transparent center, rather than a dark fill.
    parts.push({ drawing: `${rect(w, h)} m ${n(line)} ${n(line)} l ${n(line)} ${n(h - line)} ${n(w - line)} ${n(h - line)} ${n(w - line)} ${n(line)}`, color: item.color });
  }
  if (item.type === 'kinetic') parts.push({ drawing: rect(w * 0.6, 4), color: item.color, dy: item.fontSize * 1.05 });
  if (item.text) parts.push({ text: item.text, color: ['title', 'kinetic', 'frame'].includes(item.type) ? item.color : '#ffffff', size: item.fontSize * (item.type === 'kinetic' ? 1.5 : 1), bold: item.type === 'kinetic' ? 700 : ['lower-third', 'callout'].includes(item.type) ? 600 : 400, shadow: item.type === 'title' ? 1 : 0 });
  return parts;
}

function animationCuts(item) {
  const cuts = new Set([0, item.duration]);
  if (item.keyframes?.length) {
    for (let i = 0; i < item.keyframes.length; i++) {
      const a = item.keyframes[i];
      cuts.add(a.time);
      const b = item.keyframes[i + 1];
      if (!b) continue;
      // Bound ASS size by keyframe count, not movie length. Subdivision closely
      // approximates smoothstep and curved offsets on rotating template parts.
      const steps = ['ease-in-out','bezier'].includes(a.easing) || a.rotation !== b.rotation ? 16 : 1;
      for (let step = 1; step < steps; step++) cuts.add(a.time + (b.time - a.time) * step / steps);
    }
  } else if (item.animation === 'fade') {
    const fade = Math.min(0.25, item.duration / 2);
    cuts.add(fade); cuts.add(item.duration - fade);
  } else if (item.animation === 'slide-up') cuts.add(Math.min(0.4, item.duration));
  return [...cuts].sort((a, b) => a - b);
}
function componentTransform(value, component, width, height) {
  const radians = value.rotation * Math.PI / 180;
  const dx = (component.dx ?? 0) * value.scale, dy = (component.dy ?? 0) * value.scale;
  return { ...value, x: value.x * width / 100 + dx * Math.cos(radians) - dy * Math.sin(radians), y: value.y * height / 100 + dx * Math.sin(radians) + dy * Math.cos(radians) };
}
function transformTags(a, b, ms) {
  const position = a.x === b.x && a.y === b.y ? `\\pos(${n(a.x)},${n(a.y)})` : `\\move(${n(a.x)},${n(a.y)},${n(b.x)},${n(b.y)},0,${ms})`;
  const style = value => `\\fscx${n(value.scale * 100)}\\fscy${n(value.scale * 100)}\\frz${n(-value.rotation)}\\alpha${assAlpha(value.opacity)}`;
  return `${position}${style(a)}${a.scale !== b.scale || a.rotation !== b.rotation || a.opacity !== b.opacity ? `\\t(0,${ms},${style(b)})` : ''}`;
}

export function toAss(state, { fontFamily = 'Meiryo', fontSizeScale = fontFamily === 'Meiryo' ? 1.5 : 1 } = {}) {
  if (typeof fontFamily !== 'string' || !fontFamily.trim() || /[,\r\n{}\\]/.test(fontFamily)) throw new Error('Invalid subtitle font family');
  // CSS font-size is em-based. libass uses the Windows ascender+descender.
  // Meiryo regular and bold: (2171 + 901) / 2048 = 1.5, measured from OS/2 and
  // head tables. Scale only text font size; geometry and wrapping remain CSS px.
  fontSizeScale = number(fontSizeScale, 1, 'fontSizeScale', 0.5, 3);
  const width = number(state.width, 1920, 'width', 2, 8192), height = number(state.height, 1080, 'height', 2, 8192);
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Overlay,${fontFamily},48,&H00FFFFFF,&H00FFFFFF,&H00101820,&H80101820,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const events = [];
  const all = [...(state.graphics ?? []).map(item => ['graphics', item]), ...(state.captions ?? []).map(item => ['caption', item])];
  for (let index = 0; index < all.length; index++) {
    const [kind, original] = all[index];
    const item = createOverlay(kind, original, original.id);
    const parts = components(item, kind, width, height);
    const wrappedText = escapeAssText(wrapOverlayText(item, width, kind));
    const cuts = animationCuts(item);
    for (let i = 1; i < cuts.length; i++) {
      const start = Math.round((item.start + cuts[i - 1]) * 100);
      const end = i === cuts.length - 1 ? Math.max(Math.round(item.start * 100) + 1, Math.round((item.start + cuts[i]) * 100)) : Math.round((item.start + cuts[i]) * 100);
      if (end <= start) continue;
      const ms = (end - start) * 10;
      for (let p = 0; p < parts.length; p++) {
        const part = parts[p];
        const a = componentTransform(evaluateOverlayTransform(item, cuts[i - 1]), part, width, height);
        const outgoing=item.keyframes?.findLast(frame=>frame.time<=cuts[i-1]);
        const b = componentTransform(evaluateOverlayTransform(item, outgoing?.easing==='hold'?Math.max(cuts[i-1],cuts[i]-1e-7):cuts[i]), part, width, height);
        const tags = `\\an5\\q2\\bord${part.outline ?? 0}\\shad${part.shadow ?? 0}\\1c${assColor(part.color)}${transformTags(a, b, ms)}${part.drawing ? '\\p1' : `\\fs${n(part.size * fontSizeScale)}\\b${part.bold ?? 400}`}`;
        events.push(`Dialogue: ${index * 4 + p},${assTime(start)},${assTime(end)},Overlay,,0,0,0,,{${tags}}${part.drawing ?? wrappedText}`);
      }
    }
  }
  return header + events.join('\n') + '\n';
}

export function cubicEase(x,controls=[.25,.1,.25,1]){
  const [x1,y1,x2,y2]=controls,curve=(t,a,b)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
  let lo=0,hi=1;for(let i=0;i<24;i++){const t=(lo+hi)/2;if(curve(t,x1,x2)<x)lo=t;else hi=t;}return curve((lo+hi)/2,y1,y2);
}
