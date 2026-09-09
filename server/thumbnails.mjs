import path from 'node:path';
import { stat, rename, unlink } from 'node:fs/promises';
import { uid, confinedFile, AppError } from './util.mjs';
import { FFMPEG, runProcess } from './media.mjs';

// Bound decoder work and coalesce repeated requests. Source media is never modified.
export function createThumbnailService(dataDir) {
  const pending = new Map();
  let running = 0;
  const waiting = [];
  const acquire = () => running < 2 ? (running++, Promise.resolve()) : new Promise((resolve) => waiting.push(resolve));
  const release = () => { const next = waiting.shift(); if (next) next(); else running--; };
  return async (asset) => {
    if (!['video', 'image'].includes(asset.kind)) throw new AppError('音声素材にサムネイルはありません。', 404);
    const target = path.join(dataDir, 'thumbnails', `${asset.id}-${asset.sha256}.jpg`);
    try { if ((await stat(target)).isFile()) return target; } catch { /* Generate on first use. */ }
    if (pending.has(asset.id)) return pending.get(asset.id);
    if (waiting.length >= 64) throw new AppError('サムネイル生成待ちです。少し待って再試行してください。', 429);
    const promise = (async () => {
      await acquire();
      const temporary = path.join(dataDir, 'tmp', `${uid('poster')}.jpg`);
      try {
        const source = await confinedFile(path.join(dataDir, 'assets'), asset.path);
        const seek = asset.kind === 'video' ? ['-ss', String(Math.min(1, asset.duration * 0.1))] : [];
        await runProcess(FFMPEG, ['-v', 'error', '-nostdin', ...seek, '-i', source, '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=480:-2:force_original_aspect_ratio=decrease', '-q:v', '4', '-threads', '1', '-y', temporary], { timeout: 30000 });
        await rename(temporary, target);
        return target;
      } finally { release(); await unlink(temporary).catch(() => {}); }
    })();
    pending.set(asset.id, promise);
    try { return await promise; } finally { pending.delete(asset.id); }
  };
}
