import {PERFORMANCE} from './performance.mjs';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { stat, unlink, access, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createStore, COMMANDS } from './store.mjs';
import { AppError, confinedFile, requireItem } from './util.mjs';
import { mediaMime } from './media.mjs';
import { createThumbnailService } from './thumbnails.mjs';
import { createProxyManager } from './proxy.mjs';
import { createSiteBridge, isEditorNavigation } from './site-bridge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loopbackHost = (hostname) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname.toLowerCase());
const loopbackAddress = (address) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);

export function localOnly(req, res, next) {
  const host = req.get('host');
  let target;
  try { target = new URL(`http://${host}`); } catch { return next(new AppError('Host が不正です。', 403)); }
  if (!host || !loopbackHost(target.hostname) || target.username || target.password || !loopbackAddress(req.socket.remoteAddress)) return next(new AppError('このアプリはローカル接続専用です。', 403));
  if (isEditorNavigation(req)) { res.set('Cache-Control', 'no-store'); return next(); }
  const origin = req.get('origin');
  if (origin) {
    let caller;
    try { caller = new URL(origin); } catch { return next(new AppError('クロスオリジン要求は許可されていません。', 403)); }
    if (!loopbackHost(caller.hostname) || caller.host !== target.host || caller.protocol !== 'http:') return next(new AppError('クロスオリジン要求は許可されていません。', 403));
  }
  if (req.get('sec-fetch-site') === 'cross-site') return next(new AppError('クロスサイト要求は許可されていません。', 403));
  next();
}

async function streamMedia(req, res, next, store) {
  try {
    const asset = requireItem(store.getState().assets, req.params.assetId, '素材');
    const target = await confinedFile(path.join(store.dataDir, 'assets'), asset.path);
    const details = await stat(target);
    if (!details.isFile()) throw new AppError('素材が見つかりません。', 404);
    res.set({ 'Content-Type': mediaMime(asset), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', ETag: `"${asset.sha256}"` });
    const range = req.headers.range;
    let start = 0, end = details.size - 1, status = 200;
    if (range && (!req.headers['if-range'] || req.headers['if-range'] === `"${asset.sha256}"`)) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]) || details.size === 0) { res.set('Content-Range', `bytes */${details.size}`); return res.status(416).end(); }
      if (!match[1]) { const suffix = Number(match[2]); if (!Number.isSafeInteger(suffix) || suffix <= 0) { res.set('Content-Range', `bytes */${details.size}`); return res.status(416).end(); } start = Math.max(0, details.size - suffix); }
      else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= details.size || start < 0) { res.set('Content-Range', `bytes */${details.size}`); return res.status(416).end(); }
      status = 206; res.set('Content-Range', `bytes ${start}-${end}/${details.size}`);
    }
    if (status === 200 && req.headers['if-none-match'] === `"${asset.sha256}"`) return res.status(304).end();
    res.status(status).set('Content-Length', String(Math.max(0, end - start + 1)));
    if (req.method === 'HEAD' || details.size === 0) return res.end();
    const stream = createReadStream(target, { start, end });
    stream.on('error', (error) => { if (res.headersSent) res.destroy(error); else next(error); });
    res.on('close', () => stream.destroy()); stream.pipe(res);
  } catch (error) { next(error); }
}

export async function createApp({ dataDir, store: providedStore } = {}) {
  const store = providedStore || await createStore({ dataDir });
  const app = express();
  app.disable('x-powered-by'); app.set('trust proxy', false); app.locals.store = store;
  app.use(createSiteBridge(localOnly));
  app.use((_req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': res.locals.sitesBridge ? 'cross-origin' : 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' }); next(); });
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '3mb', strict: true }));
  app.get(['/healthz', '/api/health'], (_req, res) => res.json({ ok: true, app: 'Cutton', version: 1, localOnly: true }));
  app.get('/api/state', (_req, res) => res.json(store.getState()));
  app.get('/api/coverage', (_req, res) => res.json(store.coverage()));
  app.get('/api/workflows', async (_req, res) => {
    const presets=[];
    for(const [file,name,kind,note] of [
      ['comfy-sd15-cpu.json','SD 1.5 · 画像','image','384px / 8 steps / CPU。メモリに余裕があるときに実行してください。'],
      ['comfy-smoke.json','接続テスト','image','モデルを使わず単色画像を保存します。']
    ]) {
      try { presets.push({id:file,name,kind,note,workflow:JSON.parse(await readFile(path.join(ROOT,'workflows',file),'utf8'))}); }
      catch(error) { if(error.code!=='ENOENT') throw error; }
    }
    res.json({presets});
  });
  app.get('/api/capabilities', (_req, res) => {
    const state = store.getState();
    res.json({ performance:PERFORMANCE, commands: COMMANDS, editing: { waveforms: { endpoint: '/api/waveform/{assetId}', maxBins: 1200, sampleRate: 8000, cached: true }, captions: true, graphics: true, vectorCompositions:true, projectLibrary:true, undoRedo:true, retime:true, previewProxies: { endpoint: '/api/proxy/{assetId}', heights: [360,540,720], originalAudio: true } }, integrations: { comfy: { mode: 'api-workflow', configuredUrl: state.settings.comfyUrl, tokens: ['{{prompt}}', '{{seed}}'], automaticPolling: false }, codex: { mode: 'app-server', model: state.settings.codexModel || 'account-default', onDemand: true }, vids: { mode: 'browser-handoff', configuredUrl: state.settings.vidsUrl || 'https://docs.google.com/videos/', narrationApi: false, accepts: ['audio', 'MP4 with audio'] }, ffmpeg: { requiredForImport: true, probeCommand: 'integrations.check' } }, limits: { uploadFiles: 8, uploadFileBytes: 2 * 1024 ** 3, importFileBytes: 20 * 1024 ** 3, timelineTracks: ['video', 'audio'], lanesPerType:8, timelineSeconds: 86400 }, fidelity: 'SHA-256はファイル／圧縮ストリームの同一性を検証します。視覚・聴覚的な品質評価ではありません。', metadata: { controls: 'data-action', entities: 'data-entity-id' } });
  });
  app.post('/api/command', async (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new AppError('command と args をJSONで指定してください。');
    res.json(await store.execute(req.body.command, req.body.args));
  });
  const upload = multer({ storage: multer.diskStorage({ destination: path.join(store.dataDir, 'tmp'), filename: (_req, file, callback) => { const extension = path.extname(file.originalname).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12); callback(null, `upload_${randomUUID()}${extension}`); } }), limits: { files: 8, fileSize: 2 * 1024 ** 3, fields: 8, fieldSize: 10000, parts: 16 } });
  app.post('/api/upload', upload.array('files', 8), async (req, res) => {
    try {
      // Multipart headers encode non-ASCII filenames as UTF-8 bytes interpreted as Latin-1.
      const files = (req.files || []).map((file) => ({ ...file, originalname: /[\u0080-\u00ff]/.test(file.originalname) ? Buffer.from(file.originalname, 'latin1').toString('utf8') : file.originalname }));
      res.json(await store.upload(files, req.body));
    } finally { await Promise.all((req.files || []).map((file) => unlink(file.path).catch(() => {}))); }
  });
  app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders(); res.write(`data: ${JSON.stringify(store.getState())}\n\n`);
    const unsubscribe = store.subscribe((state) => { if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(state)}\n\n`); });
    const heartbeat = setInterval(() => { if (!res.destroyed && !res.writableEnded) res.write(': heartbeat\n\n'); }, 20000); heartbeat.unref();
    req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
  });
  app.get('/api/download', async (req, res) => {
    const target = await confinedFile(path.join(store.dataDir, 'exports'), req.query.path);
    if (!(await stat(target)).isFile()) throw new AppError('ダウンロード対象はファイルを指定してください。');
    res.download(target, path.basename(target));
  });
  app.get('/media/:assetId', (req, res, next) => streamMedia(req, res, next, store));
  const thumbnail = createThumbnailService(store.dataDir);
  app.get('/thumbnail/:assetId', async (req, res) => {
    const asset = requireItem(store.getState().assets, req.params.assetId, '素材');
    const target = await thumbnail(asset);
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', ETag: `"poster-${asset.sha256}"` });
    res.sendFile(target);
  });
  app.get(['/waveform/:assetId', '/api/waveform/:assetId'], async (req, res) => {
    const result = await store.waveform(req.params.assetId);
    res.set('Cache-Control', 'private, max-age=3600').json(result);
  });
  const proxies = createProxyManager({ dataDir: store.dataDir, getState: store.getState });
  app.locals.proxies = proxies;
  app.post('/api/proxy/:assetId', async (req, res) => {
    res.json(await proxies.request(req.params.assetId, req.body?.height === undefined ? 360 : req.body.height));
  });
  app.get('/api/proxy/:assetId', async (req, res) => {
    res.json(await proxies.status(req.params.assetId, req.query.height === undefined ? 360 : Number(req.query.height)));
  });
  app.get('/proxy/:assetId', async (req, res) => {
    const target = await proxies.file(req.params.assetId, req.query.height === undefined ? 360 : Number(req.query.height));
    res.type('video/mp4').set('Cache-Control', 'private, max-age=86400').sendFile(target);
  });

  // Built assets are served directly in production; Vite proxies these API routes in development.
  const dist = path.join(ROOT, 'dist');
  let hasBuild = false; try { await access(path.join(dist, 'index.html')); hasBuild = true; } catch { /* Vite dev server handles the page. */ }
  if (hasBuild) {
    app.get(['/', '/index.html'], (_req, res) => res.set('Cache-Control','no-store').sendFile(path.join(dist, 'index.html')));
    app.use(express.static(dist, { index: false, maxAge: '1h', dotfiles: 'deny' }));
    app.get('/{*route}', (req, res, next) => { if (req.path.startsWith('/api/') || req.path.startsWith('/media/') || req.path.startsWith('/thumbnail/') || req.path.startsWith('/waveform/') || req.path.startsWith('/proxy/')) return next(); res.sendFile(path.join(dist, 'index.html')); });
  } else app.get('/', (_req, res) => res.type('text/plain').send('Cutton API is ready. Start npm run dev for the editor, or npm run build then restart.'));
  app.use((_req, _res, next) => next(new AppError('このエンドポイントはありません。', 404)));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    const isUploadError = error instanceof multer.MulterError;
    const status = error.status || (isUploadError ? 413 : error instanceof SyntaxError ? 400 : 500);
    res.status(status >= 400 && status <= 599 ? status : 500).json({ error: isUploadError ? `アップロードの上限を超えたか、フォームが不正です: ${error.code}（最大8ファイル、各2GB）` : error.message || '処理に失敗しました。' });
  });
  return app;
}

export { createStore } from './store.mjs';
