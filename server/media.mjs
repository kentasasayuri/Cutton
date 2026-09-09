import path from 'node:path';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, stat, realpath, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AppError, uid, now, safeFilename } from './util.mjs';

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export function runProcess(command, args, { timeout = 120000, maxOutput = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', finished = false;
    const timer = setTimeout(() => { child.kill(); finish(new AppError(`${path.basename(command)} がタイムアウトしました。`, 504)); }, timeout);
    const finish = (error, result) => { if (finished) return; finished = true; clearTimeout(timer); error ? reject(error) : resolve(result); };
    child.on('error', (error) => finish(new AppError(error.code === 'ENOENT' ? `${path.basename(command)} が見つかりません。FFmpeg をインストールして PATH を設定してください。` : error.message, 503)));
    child.stdout.on('data', (data) => { stdout += data.toString(); if (stdout.length > maxOutput) { child.kill(); finish(new AppError('メディア解析の出力が上限を超えました。')); } });
    child.stderr.on('data', (data) => { stderr = (stderr + data.toString()).slice(-32768); });
    child.on('close', (code) => finish(code === 0 ? null : new AppError(`${path.basename(command)}: ${stderr.trim().slice(-2000) || `終了コード ${code}`}`), { stdout, stderr }));
  });
}

export async function binaryStatus(binary) {
  try { const { stdout } = await runProcess(binary, ['-version'], { timeout: 5000 }); return { available: true, version: stdout.split(/\r?\n/)[0] }; }
  catch (error) { return { available: false, error: error.message }; }
}

export async function probeMedia(filePath) {
  const { stdout } = await runProcess(FFPROBE, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath], { timeout: 30000 });
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new AppError('メディア情報を解析できませんでした。'); }
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic !== 1);
  const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio');
  const imageFormats = /(^|,)(image2|image2pipe|png_pipe|jpeg_pipe|webp_pipe|bmp_pipe|tiff_pipe|gif|apng|svg_pipe)(,|$)/;
  const imageExtension = /\.(png|jpe?g|webp|bmp|tiff?|avif|heic)$/i.test(filePath);
  const animated = Number(parsed.format?.duration) > 0 || Number(video?.nb_frames) > 1;
  const kind = video ? ((imageExtension || imageFormats.test(parsed.format?.format_name || '')) && !animated ? 'image' : 'video') : audio ? 'audio' : null;
  if (!kind) throw new AppError('対応する映像・音声・画像ストリームがありません。');
  const durationCandidates = [parsed.format?.duration, video?.duration, audio?.duration].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const duration = kind === 'image' ? 0 : Math.max(0, ...durationCandidates);
  if (kind !== 'image' && duration <= 0) throw new AppError('素材の再生時間を確認できませんでした。');
  const frameRate = String(video?.avg_frame_rate && video.avg_frame_rate !== '0/0' ? video.avg_frame_rate : video?.r_frame_rate || '').split('/').map(Number);
  const fps = frameRate.length === 2 && frameRate[1] ? frameRate[0] / frameRate[1] : frameRate[0];
  return { kind, duration, width: video?.width, height: video?.height, ...(Number.isFinite(fps) && fps > 0 ? { fps } : {}), hasAudio: Boolean(audio), audioCodec: audio?.codec_name, videoCodec: video?.codec_name, audioDuration: Number(audio?.duration) || duration, videoDuration: Number(video?.duration) || duration };
}

export async function fileHash(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

export async function compressedStreamHashes(filePath, info) {
  const streamHashes = {};
  const warnings = [];
  for (const stream of ['video', 'audio']) {
    if ((stream === 'video' && !['video', 'image'].includes(info.kind)) || (stream === 'audio' && !info.hasAudio)) continue;
    try {
      const { stdout } = await runProcess(FFMPEG, ['-v', 'error', '-nostdin', '-i', filePath, '-map', `0:${stream === 'video' ? 'v' : 'a'}:0`, '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-'], { timeout: 300000 });
      const match = stdout.match(/SHA256=([0-9a-f]{64})/i);
      if (!match) throw new Error('ストリームハッシュが取得できませんでした。');
      streamHashes[stream] = match[1].toLowerCase();
    } catch (error) { warnings.push(`${stream}: ${error.message}`); }
  }
  return { streamHashes, hashWarnings: warnings };
}

export async function localMediaPath(input) {
  if (typeof input !== 'string' || !input || input.includes('\0') || !path.isAbsolute(input) || /^[/\\]{2}/.test(input)) throw new AppError('素材はローカルの絶対パスで指定してください。');
  let source;
  try { source = await realpath(input); } catch { throw new AppError('素材ファイルが見つかりません。', 404); }
  const details = await stat(source);
  if (!details.isFile()) throw new AppError('通常のファイルを指定してください。');
  if (details.size > 20 * 1024 ** 3) throw new AppError('1つの素材は20GB以内で指定してください。');
  return source;
}

export async function importMedia({ source, dataDir, sceneId = null, originalName, provenance }) {
  const sourcePath = await localMediaPath(source);
  const id = uid('asset');
  const name = safeFilename(originalName || path.basename(sourcePath));
  const assetDir = path.join(dataDir, 'assets');
  await mkdir(assetDir, { recursive: true });
  const destination = path.join(assetDir, `${id}_${name}`);
  await copyFile(sourcePath, destination);
  try {
    const info = await probeMedia(destination);
    const [sha256, hashes, details] = await Promise.all([fileHash(destination), compressedStreamHashes(destination, info), stat(destination)]);
    return { id, name, ...info, path: destination, url: `/media/${id}`, sha256, ...hashes, size: details.size, sceneId, decision: 'pending', createdAt: now(), ...(provenance ? { provenance } : {}) };
  } catch (error) { await unlink(destination).catch(() => {}); throw error; }
}

export async function verifyAsset(asset) {
  try {
    const [sha256, { streamHashes, hashWarnings }] = await Promise.all([fileHash(asset.path), compressedStreamHashes(asset.path, asset)]);
    const streamMatches = Object.fromEntries(Object.entries(asset.streamHashes || {}).map(([kind, hash]) => [kind, streamHashes[kind] ? streamHashes[kind] === hash : null]));
    return { assetId: asset.id, checkedAt: now(), matches: sha256 === asset.sha256, sha256, expectedSha256: asset.sha256, streamMatches, streamHashes, hashWarnings, note: 'ハッシュはファイル／圧縮ストリームの同一性を確認します。画質や音質の主観評価ではありません。' };
  } catch (error) { return { assetId: asset.id, checkedAt: now(), matches: false, missing: error.code === 'ENOENT', error: error.message }; }
}

export async function extractNarration({ source, dataDir, sceneId }) {
  const sourcePath = await localMediaPath(source);
  const info = await probeMedia(sourcePath);
  if (!info.hasAudio) throw new AppError('このファイルに音声トラックがありません。Google Vidsからナレーションを含むMP4をダウンロードしてください。');
  if (info.kind === 'audio') return importMedia({ source: sourcePath, dataDir, sceneId, provenance: { type: 'google-vids-import', mode: 'original-audio' } });
  const extension = { aac: '.m4a', alac: '.m4a', mp3: '.mp3', opus: '.ogg', vorbis: '.ogg', flac: '.flac' }[info.audioCodec] || '.mka';
  const temporary = path.join(dataDir, 'tmp', `${uid('narration')}${extension}`);
  await mkdir(path.dirname(temporary), { recursive: true });
  try {
    await runProcess(FFMPEG, ['-v', 'error', '-nostdin', '-i', sourcePath, '-map', '0:a:0', '-vn', '-c:a', 'copy', '-y', temporary], { timeout: 300000 });
    const sourceStreams = await compressedStreamHashes(sourcePath, { ...info, kind: 'audio' });
    const asset = await importMedia({ source: temporary, originalName: `${path.parse(sourcePath).name}_narration${extension}`, dataDir, sceneId, provenance: { type: 'google-vids-import', mode: 'audio-stream-copy', sourceName: path.basename(sourcePath), sourceAudioHash: sourceStreams.streamHashes.audio } });
    asset.provenance.streamIdentical = Boolean(sourceStreams.streamHashes.audio && asset.streamHashes.audio === sourceStreams.streamHashes.audio);
    if (extension === '.mka') asset.playbackWarning = 'この音声形式はブラウザで再生できない場合があります。編集ソフトへの書き出しでは元ストリームを保持します。';
    return asset;
  } finally { await unlink(temporary).catch(() => {}); }
}

export const mediaMime = (asset) => ({ '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.mka': 'audio/x-matroska', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' }[path.extname(asset.path).toLowerCase()] || 'application/octet-stream');
