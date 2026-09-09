import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AppError, atomicJson, confinedFile } from './util.mjs';
import { FFMPEG } from './media.mjs';

const SAMPLE_RATE = 8000;
const MAX_BINS = 1200;
const CACHE_VERSION = 1;

function validWaveform(value) {
  return value && Number.isFinite(value.duration) && value.duration > 0 && Number.isSafeInteger(value.sampleCount) && value.sampleCount > 0 && Array.isArray(value.peaks) && value.peaks.length > 0 && value.peaks.length <= MAX_BINS && value.peaks.every((peak) => Number.isFinite(peak) && peak >= 0 && peak <= 1);
}

function decodePeaks(source, duration, ffmpeg) {
  return new Promise((resolve, reject) => {
    const peaks = new Float32Array(MAX_BINS);
    let samplesPerBin = Math.max(1, Math.ceil(duration * SAMPLE_RATE / MAX_BINS));
    let sampleCount = 0, filledBins = 0, trailingByte = null, stderr = '', settled = false;
    const child = spawn(ffmpeg, ['-v', 'error', '-nostdin', '-threads', '1', '-i', source, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-c:a', 'pcm_s16le', '-threads', '1', '-f', 's16le', 'pipe:1'], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = (error) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) { reject(error); return; }
      if (!sampleCount) { reject(new AppError('この素材から音声波形を読み取れませんでした。')); return; }
      resolve({ peaks: Array.from(peaks.subarray(0, filledBins), (peak) => Math.round(peak * 1000000) / 1000000), duration: sampleCount / SAMPLE_RATE, sampleCount });
    };
    const timer = setTimeout(() => { child.kill(); finish(new AppError('波形解析がタイムアウトしました。', 504)); }, 10 * 60 * 1000);
    const consume = (signedSample) => {
      let bin = Math.floor(sampleCount / samplesPerBin);
      if (bin >= MAX_BINS) {
        // If container duration underestimated the audio, fold existing bins in place.
        // Memory stays bounded even for very long or incorrectly tagged sources.
        for (let i = 0; i < MAX_BINS / 2; i++) peaks[i] = Math.max(peaks[i * 2], peaks[i * 2 + 1]);
        peaks.fill(0, MAX_BINS / 2); samplesPerBin *= 2; filledBins = MAX_BINS / 2;
        bin = Math.floor(sampleCount / samplesPerBin);
      }
      peaks[bin] = Math.max(peaks[bin], Math.abs(signedSample) / 32768);
      filledBins = Math.max(filledBins, bin + 1); sampleCount++;
    };
    child.stdout.on('data', (chunk) => {
      if (settled) return;
      let offset = 0;
      if (trailingByte !== null && chunk.length) {
        const combined = trailingByte | (chunk[0] << 8);
        consume(combined >= 32768 ? combined - 65536 : combined);
        trailingByte = null; offset = 1;
      }
      for (; offset + 1 < chunk.length; offset += 2) consume(chunk.readInt16LE(offset));
      if (offset < chunk.length) trailingByte = chunk[offset];
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-3000); });
    child.on('error', (error) => finish(new AppError(error.code === 'ENOENT' ? '波形解析にはFFmpegが必要です。PATHまたはFFMPEG_PATHを確認してください。' : error.message, 503)));
    child.on('close', (code) => finish(code === 0 ? null : new AppError(`波形解析に失敗しました: ${stderr.trim() || `FFmpeg終了コード ${code}`}`)));
  });
}

export function createWaveformService(dataDir, { ffmpeg = FFMPEG } = {}) {
  const cacheDir = path.join(dataDir, 'waveforms');
  const pending = new Map();
  let queue = Promise.resolve();
  return async (asset) => {
    if (!asset || (asset.kind !== 'audio' && !asset.hasAudio)) throw new AppError('この素材には音声ストリームがありません。', 400);
    const duration = Number(asset.audioDuration || asset.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new AppError('素材の音声の長さを確認できません。');
    const source = await confinedFile(path.join(dataDir, 'assets'), asset.path);
    const details = await stat(source);
    if (!details.isFile()) throw new AppError('素材ファイルが見つかりません。', 404);
    // The source stat joins the original hash so external edits invalidate the cache.
    const key = createHash('sha256').update(JSON.stringify([CACHE_VERSION, asset.sha256, details.size, details.mtimeMs, SAMPLE_RATE, MAX_BINS])).digest('hex');
    const cachePath = path.join(cacheDir, `${key}.json`);
    try {
      const cached = JSON.parse(await readFile(cachePath, 'utf8'));
      if (validWaveform(cached)) return cached;
    } catch (error) { if (error.code && error.code !== 'ENOENT') throw error; }
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 64) throw new AppError('波形解析の順番待ちが多いため、少し待って再試行してください。', 429);
    const run = queue.then(async () => {
      const result = await decodePeaks(source, duration, ffmpeg);
      await mkdir(cacheDir, { recursive: true }); await atomicJson(cachePath, result);
      return result;
    });
    pending.set(key, run); queue = run.catch(() => {});
    try { return await run; } finally { pending.delete(key); }
  };
}
