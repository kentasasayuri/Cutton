import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppError, textValue, uid, safeFilename, numberValue } from './util.mjs';
import { importMedia } from './media.mjs';

export function comfyBase(value) {
  textValue(value, 'ComfyUI URL', { max: 2000 });
  let url;
  try { url = new URL(value); } catch { throw new AppError('ComfyUI URL が不正です。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new AppError('ComfyUI URL は認証情報を含まない http(s) URL で指定してください。');
  return url.href.replace(/\/+$/, '');
}

export function vidsLink(value) {
  if (!value) return 'https://docs.google.com/videos/';
  let url;
  try { url = new URL(value); } catch { throw new AppError('Google Vids URL が不正です。'); }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !/^\/videos(?:\/|$)/.test(url.pathname) || url.username || url.password) throw new AppError('Google Vids の https://docs.google.com/videos/ URL を指定してください。');
  return url.href;
}

async function comfyFetch(base, endpoint, options = {}) {
  const response = await fetch(`${comfyBase(base)}${endpoint}`, { signal: AbortSignal.timeout(20000), redirect: 'error', ...options });
  const body = await response.text();
  if (body.length > 20 * 1024 ** 2) throw new AppError('ComfyUI の応答が大きすぎます。', 502);
  let data;
  try { data = JSON.parse(body); } catch { throw new AppError(`ComfyUI がJSON以外を返しました（HTTP ${response.status}）。URLを確認してください。`, 502); }
  if (!response.ok) throw new AppError(`ComfyUI HTTP ${response.status}: ${JSON.stringify(data).slice(0, 1000)}`, 502);
  return data;
}

export async function checkComfy(base) {
  try {
    const data = await comfyFetch(base, '/system_stats', { signal: AbortSignal.timeout(3000) });
    return { available: true, url: comfyBase(base), devices: (data.devices || []).map(({ name, type, vram_total, vram_free }) => ({ name, type, vram_total, vram_free })), system: { comfyui_version: data.system?.comfyui_version, python_version: data.system?.python_version } };
  } catch (error) { return { available: false, url: base, error: error.message }; }
}

export function prepareWorkflow(workflow, { prompt, seed }) {
  if (!workflow || Array.isArray(workflow) || typeof workflow !== 'object' || Object.keys(workflow).length === 0) throw new AppError('ComfyUI の「API形式で保存」したワークフローJSONを指定してください。');
  if (workflow.nodes || workflow.links) throw new AppError('これは編集用のワークフローです。ComfyUI で API形式のワークフローを保存してください。');
  if (JSON.stringify(workflow).length > 2 * 1024 ** 2) throw new AppError('ワークフローJSONは2MB以内で指定してください。');
  const actualSeed = numberValue(seed, 'seed', { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: Math.floor(Math.random() * 2 ** 32) });
  if (!Number.isInteger(actualSeed)) throw new AppError('seed は整数で指定してください。');
  const visit = (value, depth = 0) => {
    if (depth > 64) throw new AppError('ワークフローJSONが深すぎます。');
    if (typeof value === 'string') return value === '{{seed}}' ? actualSeed : value.replace(/\{\{(prompt|seed)\}\}/g, (_match, token) => token === 'prompt' ? prompt : String(actualSeed));
    if (Array.isArray(value)) return value.map((item) => visit(item, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, depth + 1)]));
    return value;
  };
  const compiled = visit(workflow);
  for (const [id, node] of Object.entries(compiled)) {
    if (!node || typeof node !== 'object' || typeof node.class_type !== 'string' || !node.inputs || typeof node.inputs !== 'object' || Array.isArray(node.inputs)) throw new AppError(`ワークフローノード ${id} に class_type と inputs が必要です。`);
  }
  return { workflow: compiled, seed: actualSeed };
}

export async function submitGeneration(base, { workflow, prompt, seed, projectId }) {
  const compiled = prepareWorkflow(workflow, { prompt, seed });
  const data = await comfyFetch(base, '/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: compiled.workflow, client_id: `yachicut_${projectId}`, extra_data: { extra_pnginfo: { yachicut: { prompt, seed: compiled.seed } } } }) });
  if (!data.prompt_id) throw new AppError(`ComfyUI がワークフローを受理しませんでした: ${JSON.stringify(data.error || data.node_errors || data).slice(0, 1500)}`, 502);
  // ComfyUI may queue valid output branches while reporting other branch errors.
  // Once a prompt_id exists, retain it so refresh/retry never submits a duplicate job.
  return { promptId: data.prompt_id, queueNumber: data.number, seed: compiled.seed, ...(data.node_errors && Object.keys(data.node_errors).length ? { nodeWarnings: data.node_errors } : {}), ...(data.error ? { submissionWarning: data.error } : {}) };
}

function outputFiles(outputs) {
  const found = [];
  const dedupe = new Set();
  for (const output of Object.values(outputs || {})) {
    for (const field of ['images', 'audio', 'audios', 'videos', 'gifs', 'files']) {
      for (const item of Array.isArray(output?.[field]) ? output[field] : []) {
        if (!item || typeof item.filename !== 'string') continue;
        const subfolder = typeof item.subfolder === 'string' ? item.subfolder : '';
        if (/[\\/\x00]/.test(item.filename) || item.filename === '.' || item.filename === '..' || /(^|[/\\])\.\.([/\\]|$)/.test(subfolder) || path.isAbsolute(subfolder) || /^[a-z]:/i.test(subfolder)) throw new AppError('ComfyUI 出力パスが不正です。', 502);
        const descriptor = { filename: item.filename, subfolder, type: item.type || 'output' };
        if (!['output', 'temp'].includes(descriptor.type)) continue;
        const key = JSON.stringify(descriptor);
        if (!dedupe.has(key)) { dedupe.add(key); found.push(descriptor); }
      }
    }
  }
  if (found.length > 64) throw new AppError('生成物が多すぎます。1回の生成を64ファイル以内にしてください。');
  return found;
}

export async function refreshGeneration(base, job, dataDir) {
  const data = await comfyFetch(base, `/history/${encodeURIComponent(job.promptId)}`);
  let history = data[job.promptId];
  if (!history) {
    const queue = await comfyFetch(base, '/queue');
    const pending = queue.queue_pending?.some((entry) => entry[1] === job.promptId);
    const running = queue.queue_running?.some((entry) => entry[1] === job.promptId);
    if (pending || running) return { status: running ? 'running' : 'queued' };
    // A job can finish between the first history read and the queue read.
    // Re-read history before deciding it disappeared.
    const latest = await comfyFetch(base, `/history/${encodeURIComponent(job.promptId)}`);
    history = latest[job.promptId];
    if (!history) return { status: 'failed', error: 'ComfyUI の履歴を再確認しましたがキューにもこのジョブが見つかりません。サーバーの再起動・キューの削除を確認してください。' };
  }
  if (history.status?.status_str === 'error' || history.status?.status_str === 'failed') {
    const executionError = history.status.messages?.find(([name]) => name === 'execution_error')?.[1];
    return { status: 'failed', error: executionError?.exception_message || JSON.stringify(history.status).slice(0, 2000) };
  }
  if (history.status?.completed === false) return { status: 'running' };
  const files = outputFiles(history.outputs);
  if (!files.length) return { status: 'failed', error: '生成は終了しましたが保存されたメディアがありません。ワークフローに SaveImage / SaveVideo / SaveAudio ノードを追加してください。' };
  const assets = [];
  const skipped = [];
  await mkdir(path.join(dataDir, 'tmp'), { recursive: true });
  for (const descriptor of files) {
    const temporary = path.join(dataDir, 'tmp', `${uid('comfy')}_${safeFilename(descriptor.filename)}`);
    try {
      const response = await fetch(`${comfyBase(base)}/view?${new URLSearchParams(descriptor)}`, { signal: AbortSignal.timeout(300000), redirect: 'error' });
      if (!response.ok || !response.body) throw new AppError(`生成物の取得に失敗しました（HTTP ${response.status}）。`, 502);
      let total = 0;
      const limit = new Transform({ transform(chunk, _encoding, callback) { total += chunk.length; if (total > 2 * 1024 ** 3) callback(new AppError('生成物は1ファイル2GB以内にしてください。')); else callback(null, chunk); } });
      await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(temporary, { flags: 'wx' }));
      const asset = await importMedia({ source: temporary, originalName: descriptor.filename, dataDir, sceneId: job.sceneId || null, provenance: { type: 'comfyui', jobId: job.id, promptId: job.promptId, requestedKind: job.kind, seed: job.seed } });
      assets.push(asset);
    } catch (error) { skipped.push({ filename: descriptor.filename, error: error.message }); }
    finally { await unlink(temporary).catch(() => {}); }
  }
  if (!assets.length) return { status: 'failed', error: skipped.map((entry) => `${entry.filename}: ${entry.error}`).join('\n').slice(0, 4000) };
  return { status: 'completed', assets, result: { assetIds: assets.map((asset) => asset.id), skipped, note: '各生成物は実際のメディア種類を検査して保存しました。動画と音声を別トラックとして配置できます。' } };
}
