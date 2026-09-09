import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prepareWorkflow, submitGeneration, refreshGeneration } from '../server/integrations.mjs';
import { createStore } from '../server/store.mjs';
import { fileHash } from '../server/media.mjs';

const exec = promisify(execFile);
const workflow = () => ({ '1': { class_type: 'TestGenerator', inputs: { text: '{{prompt}}', seed: '{{seed}}' } } });

async function mockComfy(t, handler) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    let body;
    try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null; }
    catch { res.writeHead(400); res.end('invalid JSON'); return; }
    const url = new URL(req.url, 'http://127.0.0.1');
    requests.push({ method: req.method, url, body });
    try {
      const result = await handler({ method: req.method, url, body });
      const status = result?.status ?? 200;
      if (Buffer.isBuffer(result?.bytes)) { res.writeHead(status, { 'Content-Type': 'application/octet-stream' }); res.end(result.bytes); }
      else { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result?.json ?? {})); }
    } catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { base: `http://127.0.0.1:${server.address().port}`, requests };
}

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yachicut-comfy-test-'));
  t.after(async () => {
    const absolute = path.resolve(directory);
    assert.equal(path.dirname(absolute).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(absolute).startsWith('yachicut-comfy-test-'));
    await fs.rm(absolute, { recursive: true, force: true });
  });
  return directory;
}

async function hasFfmpeg(t) {
  try {
    await exec(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], { windowsHide: true });
    await exec(process.env.FFPROBE_PATH || 'ffprobe', ['-version'], { windowsHide: true });
    return true;
  } catch { t.skip('FFmpeg / FFprobe unavailable'); return false; }
}

test('Comfy templates preserve literal prompt content and native numeric seed', () => {
  const original = { '1': { class_type: 'TextAndSeed', inputs: { text: '{{prompt}}', seed: '{{seed}}', prefix: 'take-{{seed}}', nested: ['{{prompt}}', { seed: '{{seed}}' }] } } };
  const prompt = '日本語 "quoted" $& $` $\' {{seed}}';
  const prepared = prepareWorkflow(original, { prompt, seed: 12345 });
  assert.equal(prepared.seed, 12345);
  assert.equal(prepared.workflow['1'].inputs.seed, 12345);
  assert.equal(prepared.workflow['1'].inputs.prefix, 'take-12345');
  assert.equal(prepared.workflow['1'].inputs.text, prompt);
  assert.equal(prepared.workflow['1'].inputs.nested[0], prompt);
  assert.equal(prepared.workflow['1'].inputs.nested[1].seed, 12345);
  assert.equal(original['1'].inputs.seed, '{{seed}}');
  assert.throws(() => prepareWorkflow({ nodes: [] }, { prompt: 'x' }), /API形式/);
  assert.throws(() => prepareWorkflow(workflow(), { prompt: 'x', seed: 1.5 }), /整数/);
});

test('HTTP 200 prompt_id is accepted even when Comfy reports invalid optional output nodes', async t => {
  const warnings = { '9': { errors: [{ type: 'value_not_in_list', message: 'Optional output branch unavailable' }], dependent_outputs: ['9'], class_type: 'OptionalSave' } };
  const mock = await mockComfy(t, ({ url }) => {
    assert.equal(url.pathname, '/prompt');
    return { json: { prompt_id: 'accepted-prompt', number: 7, node_errors: warnings } };
  });
  const accepted = await submitGeneration(mock.base, { workflow: workflow(), prompt: '素材生成', seed: 42, projectId: 'project-test' });
  assert.equal(accepted.promptId, 'accepted-prompt');
  assert.equal(accepted.queueNumber, 7);
  assert.equal(accepted.seed, 42);
  assert.equal(mock.requests.length, 1);
  assert.equal(mock.requests[0].body.prompt['1'].inputs.seed, 42);
  assert.equal(mock.requests[0].body.prompt['1'].inputs.text, '素材生成');
  assert.equal(mock.requests[0].body.client_id, 'yachicut_project-test');
  // Do not discard the warning when keeping the accepted job.
  assert.deepEqual(accepted.nodeWarnings, warnings);
});

test('rejected workflow and execution_error remain failures with useful details', async t => {
  const mock = await mockComfy(t, ({ url }) => {
    if (url.pathname === '/prompt') return { status: 400, json: { error: { message: 'Missing checkpoint' }, node_errors: {} } };
    return { json: { 'failed-prompt': { status: { completed: false, status_str: 'error', messages: [['execution_error', { exception_message: 'CUDA out of memory' }]] }, outputs: {} } } };
  });
  await assert.rejects(submitGeneration(mock.base, { workflow: workflow(), prompt: 'x', seed: 1, projectId: 'p' }), /Missing checkpoint/);
  const result = await refreshGeneration(mock.base, { id: 'j', promptId: 'failed-prompt' }, 'unused');
  assert.equal(result.status, 'failed');
  assert.match(result.error, /CUDA out of memory/);
  assert.equal(result.assets, undefined);
});

test('refresh rechecks history if execution leaves the queue between the two requests', async t => {
  let historyReads = 0;
  const mock = await mockComfy(t, ({ url }) => {
    if (url.pathname === '/queue') return { json: { queue_pending: [], queue_running: [] } };
    historyReads++;
    if (historyReads === 1) return { json: {} };
    return { json: { 'race-prompt': { status: { completed: false, status_str: 'error', messages: [['execution_error', { exception_message: 'Actual execution failure after queue removal' }]] }, outputs: {} } } };
  });
  const result = await refreshGeneration(mock.base, { id: 'race-job', promptId: 'race-prompt' }, 'unused');
  assert.equal(historyReads, 2);
  assert.equal(result.status, 'failed');
  assert.match(result.error, /Actual execution failure/);
  assert.deepEqual(mock.requests.map(request => request.url.pathname), ['/history/race-prompt', '/queue', '/history/race-prompt']);
});

test('queued and running jobs do not import assets; completed outputs preserve separate video and audio bytes', async t => {
  if (!await hasFfmpeg(t)) return;
  const dataDir = await temporaryDirectory(t);
  const videoPath = path.join(dataDir, 'mock-video.mp4');
  const audioPath = path.join(dataDir, 'mock-audio.wav');
  const common = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  await exec(process.env.FFMPEG_PATH || 'ffmpeg', [...common, '-f', 'lavfi', '-i', 'color=c=blue:s=64x36:r=25', '-t', '0.4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', videoPath], { windowsHide: true });
  await exec(process.env.FFMPEG_PATH || 'ffmpeg', [...common, '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '0.4', '-c:a', 'pcm_s16le', audioPath], { windowsHide: true });
  const media = { 'shot.mp4': await fs.readFile(videoPath), 'voice.wav': await fs.readFile(audioPath) };
  let phase = 'queued';
  const mock = await mockComfy(t, ({ url }) => {
    if (url.pathname === '/prompt') return { json: { prompt_id: 'media-prompt', number: 1, node_errors: {} } };
    if (url.pathname === '/queue') return { json: { queue_pending: phase === 'queued' ? [[1, 'media-prompt']] : [], queue_running: phase === 'running' ? [[1, 'media-prompt']] : [] } };
    if (url.pathname === '/history/media-prompt') {
      if (phase !== 'completed') return { json: {} };
      return { json: { 'media-prompt': { status: { completed: true, status_str: 'success', messages: [] }, outputs: {
        '4': { videos: [{ filename: 'shot.mp4', subfolder: 'generated', type: 'output' }] },
        '5': { audio: [{ filename: 'voice.wav', subfolder: 'generated', type: 'output' }] },
      } } } };
    }
    if (url.pathname === '/view') {
      assert.equal(url.searchParams.get('subfolder'), 'generated');
      assert.equal(url.searchParams.get('type'), 'output');
      const bytes = media[url.searchParams.get('filename')];
      assert.ok(bytes);
      return { bytes };
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  });
  const store = await createStore({ dataDir });
  await store.execute('settings.update', { comfyUrl: mock.base });
  const scene = await store.execute('storyboard.add', { title: '音声と映像', duration: 0.4 });
  const sceneId = scene.result.id;
  const submitted = await store.execute('generation.submit', { kind: 'video', prompt: '短いショット', workflow: workflow(), seed: 11, sceneId });
  const jobId = submitted.result.id;
  assert.equal(submitted.result.status, 'queued');
  assert.equal(submitted.state.assets.length, 0);
  const queued = await store.execute('generation.refresh', { id: jobId });
  assert.equal(queued.result.status, 'queued');
  assert.equal(queued.state.assets.length, 0);
  phase = 'running';
  const running = await store.execute('generation.refresh', { id: jobId });
  assert.equal(running.result.status, 'running');
  assert.equal(running.state.assets.length, 0);
  phase = 'completed';
  const completed = await store.execute('generation.refresh', { id: jobId });
  assert.equal(completed.result.status, 'completed');
  assert.deepEqual(completed.state.assets.map(asset => asset.kind).sort(), ['audio', 'video']);
  assert.equal(completed.state.clips.length, 0, 'generation must not silently accept or place shots');
  for (const asset of completed.state.assets) {
    assert.equal(asset.sceneId, sceneId);
    assert.equal(asset.decision, 'pending');
    assert.equal(asset.provenance.promptId, 'media-prompt');
    assert.equal(asset.provenance.seed, 11);
    assert.equal(asset.sha256, await fileHash(asset.name === 'shot.mp4' ? videoPath : audioPath));
    assert.equal(await fileHash(asset.path), asset.sha256);
  }
  const downloadCount = mock.requests.filter(request => request.url.pathname === '/view').length;
  const repeated = await store.execute('generation.refresh', { id: jobId });
  assert.equal(repeated.state.assets.length, 2);
  assert.equal(mock.requests.filter(request => request.url.pathname === '/view').length, downloadCount);
});

test('Vids handoff remains awaiting_import with no audio until a real file is imported', async t => {
  if (!await hasFfmpeg(t)) return;
  const dataDir = await temporaryDirectory(t);
  const store = await createStore({ dataDir });
  const prepared = await store.execute('narration.prepare', { prompt: '読み上げる文章です。', mode: 'local' });
  const jobId = prepared.result.jobId;
  assert.equal(prepared.result.status, 'awaiting_import');
  assert.equal(prepared.state.jobs.find(job => job.id === jobId).status, 'awaiting_import');
  assert.equal(prepared.state.assets.length, 0);
  assert.equal(await fs.readFile(prepared.result.textPath, 'utf8'), '読み上げる文章です。');
  const handoff = JSON.parse(await fs.readFile(prepared.result.path, 'utf8'));
  assert.equal(handoff.status, 'awaiting_import');
  const audioPath = path.join(dataDir, 'downloaded-voice.wav');
  await exec(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '0.2', '-c:a', 'pcm_s16le', audioPath], { windowsHide: true });
  const imported = await store.execute('narration.import', { jobId, path: audioPath });
  assert.equal(imported.state.jobs.find(job => job.id === jobId).status, 'completed');
  assert.equal(imported.result.kind, 'audio');
  assert.equal(imported.result.sha256, await fileHash(audioPath));
  await assert.rejects(store.execute('narration.import', { jobId, path: audioPath }), /取り込み済み/);
});
