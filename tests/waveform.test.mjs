import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createWaveformService } from '../server/waveform.mjs';
import { FFMPEG, fileHash } from '../server/media.mjs';

const exec = promisify(execFile);
async function fixture(t) {
  try { await exec(FFMPEG, ['-version'], { windowsHide: true }); } catch { t.skip('FFmpeg unavailable'); return; }
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cutton-waveform-'));
  await fs.mkdir(path.join(dataDir, 'assets'));
  const source = path.join(dataDir, 'assets', 'silence-then-tone.wav');
  await exec(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=8000', '-filter_complex', '[0:a]atrim=0:0.5[a0];[1:a]atrim=0:1.5,volume=4[a1];[a0][a1]concat=n=2:v=0:a=1[out]', '-map', '[out]', '-c:a', 'pcm_s16le', '-threads', '1', source], { windowsHide: true });
  return { dataDir, asset: { id: 'asset_audio', kind: 'audio', hasAudio: true, path: source, duration: 2, audioDuration: 2, sha256: await fileHash(source) } };
}

test('real streamed waveform is finite, bounded, captures silence, and reuses persisted cache', async (t) => {
  const context = await fixture(t); if (!context) return;
  const { dataDir, asset } = context;
  const waveform = createWaveformService(dataDir);
  const [result, duplicate] = await Promise.all([waveform(asset), waveform(asset)]);
  assert.deepEqual(duplicate, result);
  assert.equal(result.sampleCount, 16000);
  assert.equal(result.duration, 2);
  assert.ok(result.peaks.length > 100 && result.peaks.length <= 1200);
  assert.ok(result.peaks.every((peak) => Number.isFinite(peak) && peak >= 0 && peak <= 1));
  assert.ok(result.peaks.slice(0, Math.floor(result.peaks.length * 0.2)).every((peak) => peak === 0));
  assert.ok(Math.max(...result.peaks) > 0.45 && Math.max(...result.peaks) < 0.55);
  const cacheFiles = await fs.readdir(path.join(dataDir, 'waveforms'));
  assert.equal(cacheFiles.length, 1);
  const before = await fs.stat(path.join(dataDir, 'waveforms', cacheFiles[0]));
  const cachedOnly = createWaveformService(dataDir, { ffmpeg: path.join(dataDir, 'missing-ffmpeg') });
  assert.deepEqual(await cachedOnly(asset), result);
  assert.equal((await fs.stat(path.join(dataDir, 'waveforms', cacheFiles[0]))).mtimeMs, before.mtimeMs);
});

test('incorrectly short container duration cannot grow waveform memory beyond 1200 bins', async (t) => {
  const context = await fixture(t); if (!context) return;
  const waveform = createWaveformService(context.dataDir);
  const result = await waveform({ ...context.asset, audioDuration: 0.001 });
  assert.equal(result.sampleCount, 16000);
  assert.equal(result.duration, 2);
  assert.ok(result.peaks.length <= 1200);
  assert.ok(result.peaks.every((peak) => Number.isFinite(peak) && peak >= 0 && peak <= 1));
  assert.ok(Math.max(...result.peaks) > 0.45);
});

test('waveforms reject media without audio before starting a decoder', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cutton-waveform-empty-'));
  const waveform = createWaveformService(dataDir, { ffmpeg: path.join(dataDir, 'missing-ffmpeg') });
  await assert.rejects(waveform({ id: 'video_silent', kind: 'video', hasAudio: false, duration: 1 }), /音声ストリーム/);
  await assert.rejects(waveform({ id: 'image', kind: 'image', duration: 0 }), /音声ストリーム/);
});
