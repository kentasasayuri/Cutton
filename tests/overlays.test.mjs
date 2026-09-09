import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createOverlay, updateOverlay, evaluateOverlayTransform, wrapOverlayText, escapeAssText, toAss, toCaptionsSrt, GRAPHIC_TYPES } from '../server/overlays.mjs';
import { exportProject, hashFile, toOtio } from '../exporters/index.mjs';

const exec = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const fixture = () => ({ id: 'overlay-project', name: "日本語 overlay's test", width: 320, height: 180, fps: 30, assets: [], clips: [], captions: [], graphics: [], storyboard: [], settings: {}, jobs: [], decisions: [] });

test('overlay defaults, whitelist, immutable update and validation', () => {
  const caption = createOverlay('caption', { text: '日本語\r\n字幕', extra: 'discard me' }, 'cap_1');
  assert.deepEqual(caption, { id: 'cap_1', text: '日本語\n字幕', start: 0, duration: 3, x: 50, y: 88, fontSize: 48, color: '#ffffff' });
  const updated = updateOverlay('caption', caption, { id: 'replace', start: 2, color: '#ABCDEF' });
  assert.equal(updated.id, 'cap_1'); assert.equal(updated.start, 2); assert.equal(updated.color, '#abcdef'); assert.equal(caption.start, 0);
  for (const type of GRAPHIC_TYPES) assert.equal(createOverlay('graphics', { type, text: 'Design' }).type, type);
  assert.equal(createOverlay('graphics', { type: 'shape' }).text, '');
  for (const args of [{ text: '' }, { text: 'a'.repeat(2001) }, { text: 'a', start: -1 }, { text: 'a', duration: 0 }, { text: 'a', duration: NaN }, { text: 'a', start: 86400 }, { text: 'a', x: 101 }, { text: 'a', y: ' ' }, { text: 'a', color: 'red' }, { text: 'a', fontSize: 301 }]) assert.throws(() => createOverlay('caption', args));
  assert.throws(() => createOverlay('graphics', { type: 'script', text: 'a' }));
  assert.throws(() => createOverlay('graphics', { type: 'shape', width: 0 }));
  assert.throws(() => createOverlay('caption', null));
});

test('keyframes normalize once, hold endpoints and share deterministic easing', () => {
  const item = createOverlay('graphics', { text: 'Move', x: 30, duration: 4, animation: 'fade', keyframes: [{ time: 3, x: 80, y: 80, scale: 2, rotation: 90, opacity: 0.5 }, { time: 1, x: 20, y: 20, easing: 'ease-in-out' }] }, 'g');
  assert.deepEqual(item.keyframes.map(f => f.time), [1, 3]);
  assert.equal(evaluateOverlayTransform(item, 0).x, 20);
  assert.equal(evaluateOverlayTransform(item, 4).x, 80);
  const mid = evaluateOverlayTransform(item, 2);
  assert.equal(mid.x, 50); assert.equal(mid.y, 50); assert.equal(mid.scale, 1.5); assert.equal(mid.rotation, 45); assert.equal(mid.opacity, 0.75);
  assert.equal(evaluateOverlayTransform(item, 1.5).x, 29.375);
  assert.equal(evaluateOverlayTransform(item, 0).opacity, 1, 'keyframes override entry fade');
  const fade = createOverlay('graphics', { text: 'Fade', duration: 1 });
  assert.equal(evaluateOverlayTransform(fade, 0).opacity, 0);
  assert.equal(evaluateOverlayTransform(fade, 0.125).opacity, 0.5);
  assert.equal(evaluateOverlayTransform(fade, 0.5).opacity, 1);
  assert.equal(evaluateOverlayTransform(fade, 0.875).opacity, 0.5);
  const slide = createOverlay('graphics', { text: 'Slide', animation: 'slide-up' });
  assert.equal(evaluateOverlayTransform(slide, 0).y, 70);
  assert.equal(evaluateOverlayTransform(slide, 0.2).y, 67.5);
  assert.equal(evaluateOverlayTransform(slide, 0.4).y, 65);
  for (const keyframes of [[{ time: -1 }], [{ time: 4 }], [{ time: 0 }, { time: 0 }], [{ time: 0, opacity: 2 }], [{ time: 0, scale: 0 }], [{ time: 0, rotation: 361 }], [{ time: 0, easing: 'spring' }], Array.from({ length: 61 }, (_, i) => ({ time: i / 30 }))]) assert.throws(() => createOverlay('graphics', { text: 'a', keyframes }));
  assert.throws(() => updateOverlay('graphics', item, { duration: 2 }));
});

test('ASS escapes untrusted tags and bounds event size independent of video duration', () => {
  const literal = '{\\p1}m 0 0 l 9000 0\\N\n日本語';
  const escaped = escapeAssText(literal);
  assert.ok(!escaped.includes('{')); assert.ok(!escaped.includes('}'));
  assert.equal(escaped.split('\\N').length - 1, 1, 'only actual newline becomes ASS line break');
  const state = fixture();
  state.captions = [createOverlay('caption', { text: literal, duration: 0.001 })];
  state.graphics = GRAPHIC_TYPES.map(type => createOverlay('graphics', { type, text: 'Motion', duration: 80000, keyframes: [{ time: 0, x: 20, easing: 'ease-in-out' }, { time: 80000, x: 80, rotation: 45, scale: 2 }] }));
  const ass = toAss(state);
  assert.match(ass, /PlayResX: 320/); assert.match(ass, /Meiryo/); assert.match(ass, /\\move\(/); assert.match(ass, /\\t\(/); assert.match(ass, /\\frz-/);
  assert.ok(ass.includes(escapeAssText(wrapOverlayText(state.captions[0], state.width, 'caption')))); assert.ok(!ass.includes(literal));
  assert.ok(ass.split('\n').length < 400, 'long animation uses bounded scalar transform events');
  assert.match(ass, /0:00:00\.00,0:00:00\.01/);
  assert.throws(() => toAss(state, { fontFamily: 'font\nDialogue: injected' }));
});

test('shared wrapping preserves paragraphs, CJK graphemes and Latin word boundaries', () => {
  assert.equal(wrapOverlayText({ text: 'hello world', fontSize: 20 }, 100, 'caption'), 'hello\nworld');
  assert.equal(wrapOverlayText({ text: '字'.repeat(12), fontSize: 20 }, 100, 'caption'), '字字字字\n字字字字\n字字字字');
  assert.equal(wrapOverlayText({ text: '一行目\n\nSecond line', fontSize: 20 }, 400, 'caption'), '一行目\n\nSecond line');
  const family = '👩‍👩‍👧‍👦';
  const emoji = wrapOverlayText({ text: family.repeat(6), fontSize: 30 }, 100, 'caption');
  assert.deepEqual(emoji.split('\n'), [family.repeat(2), family.repeat(2), family.repeat(2)]);
  const token = 'https://example.com/long-unbroken-identifier';
  assert.equal(wrapOverlayText({ text: token, fontSize: 20 }, 100, 'caption').replace(/\n/g, ''), token);
  const base = { text: '字'.repeat(12), fontSize: 20, width: 50 };
  const boxed = wrapOverlayText({ ...base, type: 'shape' }, 200, 'graphic');
  assert.equal(boxed.split('\n')[0].length, 4);
  const callout = wrapOverlayText({ ...base, type: 'callout' }, 200, 'graphics');
  assert.equal(callout.split('\n')[0].length, 3);
  assert.ok(wrapOverlayText({ ...base, type: 'kinetic' }, 200).split('\n').length > wrapOverlayText({ ...base, type: 'title' }, 200).split('\n').length);
  const state = fixture();
  state.captions = [createOverlay('caption', { text: '日本語の長い字幕を同じ位置で確実に折り返します。', fontSize: 25 })];
  const expected = escapeAssText(wrapOverlayText(state.captions[0], state.width, 'caption'));
  assert.ok(expected.includes('\\N'));
  assert.ok(toAss(state).includes(expected), 'the exported explicit line breaks are identical to the preview helper');
});

test('ASS converts Meiryo CSS em sizing and uses explicit font weights', () => {
  const state = fixture();
  state.captions = [createOverlay('caption', { text: '字幕', fontSize: 48 })];
  state.graphics = [createOverlay('graphics', { type: 'kinetic', text: 'CUT', fontSize: 76 })];
  const ass = toAss(state);
  assert.match(ass, /\\fs72\\b400/);
  assert.match(ass, /\\fs171\\b700/);
  assert.match(toAss(state, { fontFamily: 'Custom Font', fontSizeScale: 2 }), /\\fs96\\b400/);
});

test('actual captions SRT follows caption positions and bundle preserves overlay data and source bytes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cutton-overlay-bundle-'));
  const state = fixture();
  state.captions = [createOverlay('caption', { text: '後の字幕', start: 4.25, duration: 1.5 }), createOverlay('caption', { text: '最初の字幕\n二行目', start: 0.1, duration: 1 })];
  state.graphics = [createOverlay('graphics', { type: 'callout', text: 'Keep editable', start: 1, duration: 2 })];
  state.storyboard = [{ id: 'story', order: 0, duration: 2, narration: 'Separate draft narration' }];
  const source = path.join(dir, 'source.bin'); await fs.writeFile(source, 'unchanged bytes');
  state.assets = [{ id: 'source', name: 'source.bin', path: source, kind: 'video', sha256: await hashFile(source) }];
  const srt = toCaptionsSrt(state);
  assert.match(srt, /^1\n00:00:00,100 --> 00:00:01,100\n最初の字幕\n二行目/);
  assert.match(srt, /2\n00:00:04,250 --> 00:00:05,750/);
  assert.ok(!srt.includes('Separate draft'));
  const result = await exportProject(state, { format: 'bundle', dataDir: dir });
  const folder = result.path.slice(0, -4);
  assert.equal(await fs.readFile(path.join(folder, 'captions.srt'), 'utf8'), srt);
  assert.ok((await fs.readFile(path.join(folder, 'narration.srt'), 'utf8')).includes('Separate draft'));
  const portable = JSON.parse(await fs.readFile(path.join(folder, 'project.cutton.json'), 'utf8'));
  assert.deepEqual(portable.captions, state.captions); assert.deepEqual(portable.graphics, state.graphics);
  const overlays = JSON.parse(await fs.readFile(path.join(folder, 'overlays.json'), 'utf8'));
  assert.deepEqual(overlays.graphics, state.graphics);
  assert.equal(await hashFile(path.join(folder, portable.assets[0].path)), state.assets[0].sha256);
  assert.ok(result.files.find(f => f.name === 'captions.srt')?.url.startsWith('/api/download?path='));
  assert.ok(result.warnings.some(w => w.includes('モーショングラフィックス') && w.includes('MP4')));
  assert.deepEqual(toOtio(state).metadata.yachicut.graphics, state.graphics);
});

async function ffmpegAvailable(t) {
  try { await exec(ffmpeg, ['-version'], { windowsHide: true }); return true; } catch { t.skip('FFmpeg unavailable'); return false; }
}
async function frame(file, time, width = 320, height = 180) {
  const { stdout } = await exec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(time), '-i', file, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, encoding: 'buffer', maxBuffer: width * height * 3 + 65536 });
  assert.equal(stdout.length, width * height * 3);
  return stdout;
}
function pixels(data, predicate, width = 320) {
  let count = 0, sumX = 0, sumY = 0;
  for (let i = 0; i < data.length; i += 3) if (predicate(data[i], data[i + 1], data[i + 2], (i / 3) % width, Math.floor(i / 3 / width))) { count++; sumX += (i / 3) % width; sumY += Math.floor(i / 3 / width); }
  return { count, x: sumX / count, y: sumY / count };
}

test('real MP4 burns Japanese captions and moving vectors, keeps separate audio and extends overlay duration', async t => {
  if (!await ffmpegAvailable(t)) return;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cutton 日本語's overlay-render-"));
  const video = path.join(dir, 'original.mp4'), audio = path.join(dir, 'original.wav');
  await exec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video], { windowsHide: true });
  await exec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', audio], { windowsHide: true });
  const hashes = [await hashFile(video), await hashFile(audio)];
  const state = fixture();
  state.assets = [{ id: 'v', name: 'original.mp4', path: video, kind: 'video', duration: 2 }, { id: 'a', name: 'original.wav', path: audio, kind: 'audio', duration: 2 }];
  state.clips = [{ id: 'v', assetId: 'v', track: 'video', start: 0, in: 0, duration: 2 }, { id: 'a', assetId: 'a', track: 'audio', start: 0, in: 0, duration: 2, gain: 0.5 }];
  state.captions = [createOverlay('caption', { text: '日本語の字幕', start: 0.3, duration: 0.6, fontSize: 25 })];
  state.graphics = [createOverlay('graphics', { type: 'shape', start: 1, duration: 1.6, width: 14, height: 20, color: '#ff0000', animation: 'none', keyframes: [{ time: 0, x: 20, y: 35 }, { time: 1.6, x: 80, y: 35 }] })];
  const result = await exportProject(state, { format: 'render', dataDir: dir });
  const before = await frame(result.path, 0.1), caption = await frame(result.path, 0.5), early = await frame(result.path, 1.1), late = await frame(result.path, 2.3);
  assert.equal(pixels(before, (r, g, b) => r + g + b > 50).count, 0);
  assert.ok(pixels(caption, (r, g, b, x, y) => r > 180 && g > 180 && b > 180 && y > 120).count > 150, 'Japanese subtitle glyphs are present near bottom');
  const red = data => pixels(data, (r, g, b) => r > 150 && g < 50 && b < 50);
  assert.ok(red(early).count > 1000); assert.ok(red(late).count > 1000);
  assert.ok(red(late).x > red(early).x + 120, 'keyframe motion reaches later position beyond the source clip');
  assert.ok(Math.abs(red(early).y - 63) < 4, 'vector uses center anchor');
  const { stdout } = await exec(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'quiet', '-show_streams', '-show_format', '-of', 'json', result.path], { windowsHide: true });
  const probe = JSON.parse(stdout);
  assert.ok(Math.abs(Number(probe.format.duration) - 2.6) < 0.1);
  assert.deepEqual(probe.streams.map(s => s.codec_type).sort(), ['audio', 'video']);
  assert.deepEqual([await hashFile(video), await hashFile(audio)], hashes);
  await assert.rejects(fs.stat(path.join(path.dirname(result.path), 'render-work')), { code: 'ENOENT' });
});

test('overlay-only MP4 renders a transparent frame and visibly fades without source media', async t => {
  if (!await ffmpegAvailable(t)) return;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cutton-overlay-only-'));
  const state = fixture();
  state.graphics = [createOverlay('graphics', { type: 'frame', text: '', x: 50, y: 50, width: 50, height: 40, duration: 1, color: '#00ff00', animation: 'fade' })];
  const result = await exportProject(state, { format: 'render', dataDir: dir });
  const first = await frame(result.path, 0), middle = await frame(result.path, 0.5);
  const green = data => pixels(data, (r, g, b) => g > 100 && r < 50 && b < 50);
  assert.equal(green(first).count, 0); assert.ok(green(middle).count > 500);
  const center = (90 * 320 + 160) * 3;
  assert.ok(middle[center] + middle[center + 1] + middle[center + 2] < 20, 'frame center stays transparent');
});

test('real keyframe render applies scale, clockwise rotation and opacity', async t => {
  if (!await ffmpegAvailable(t)) return;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cutton-keyframe-transform-'));
  const state = fixture();
  state.graphics = [createOverlay('graphics', { type: 'shape', width: 20, height: 10, duration: 1.2, color: '#00ff00', keyframes: [{ time: 0, x: 50, y: 50 }, { time: 1, x: 50, y: 50, scale: 2, rotation: 90, opacity: 0.25 }] })];
  const result = await exportProject(state, { format: 'render', dataDir: dir });
  const first = await frame(result.path, 0), last = await frame(result.path, 1.1);
  function bounds(data) {
    let minX = 320, maxX = 0, minY = 180, maxY = 0, peakGreen = 0;
    for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
      const i = (y * 320 + x) * 3;
      if (data[i + 1] < 35 || data[i] > 30 || data[i + 2] > 30) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); peakGreen = Math.max(peakGreen, data[i + 1]);
    }
    return { width: maxX - minX + 1, height: maxY - minY + 1, peakGreen };
  }
  const a = bounds(first), b = bounds(last);
  assert.ok(a.width > a.height * 3);
  assert.ok(b.height > b.width * 3);
  assert.ok(Math.abs(b.height - a.width * 2) < 5, '90-degree rotated width doubles with scale');
  assert.ok(b.peakGreen < a.peakGreen * 0.35 && b.peakGreen > a.peakGreen * 0.2, 'opacity is burned into the result');
});

test('real Meiryo kinetic title retains browser-scale width and true bold strokes', async t => {
  if (!await ffmpegAvailable(t)) return;
  try { await fs.access(path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'meiryob.ttc')); } catch { t.skip('Meiryo bold unavailable'); return; }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cutton-font-parity-'));
  const state = { ...fixture(), width: 1920, height: 1080, fps: 1 };
  state.graphics = [createOverlay('graphics', { type: 'kinetic', text: 'CUT / CREATE', width: 65, fontSize: 76, x: 50, y: 48, duration: 1, color: '#37cbd6', keyframes: [{ time: 0, x: 50, y: 48, scale: 1.08 }] })];
  const result = await exportProject(state, { format: 'render', dataDir: dir });
  const data = await frame(result.path, 0, 1920, 1080);
  let minX = 1920, maxX = 0, colored = 0;
  for (let y = 350; y < 590; y++) for (let x = 0; x < 1920; x++) {
    const i = (y * 1920 + x) * 3;
    if (data[i] < 110 && data[i + 1] > 120 && data[i + 2] > 120) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); colored++; }
  }
  assert.ok(maxX - minX > 850 && maxX - minX < 960, 'font must not regress to the old 580px width');
  assert.ok(colored > 28000, 'real bold glyphs must not fall back to thin regular strokes');
});
