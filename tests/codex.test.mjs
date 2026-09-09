import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { spawn } from 'node:child_process';
import { createCodexBridge } from '../server/codex.mjs';

function harness({ output = { script: '今日は動画編集の流れを紹介します。' }, behavior } = {}) {
  const messages = [];
  let launched;
  let stopped = 0;
  const bridge = createCodexBridge({
    resolveCommand: async () => ({ command: process.execPath, args: ['C:/mock/codex.js'], entrypoint: 'C:/mock/codex.js' }),
    requestTimeoutMs: 80,
    timeoutMs: 80,
    stop: async child => { stopped++; child.exitCode = 0; },
    spawn(command, args, options) {
      launched = { command, args, options };
      const child = new EventEmitter();
      child.pid = 123456;
      child.exitCode = null;
      child.signalCode = null;
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      const emit = message => child.stdout.write(`${JSON.stringify(message)}\n`);
      child.stdin = new Writable({
        write(chunk, encoding, done) {
          const message = JSON.parse(String(chunk));
          messages.push(message);
          done();
          setImmediate(() => {
            if (behavior?.(message, { emit, child }) === false) return;
            if (message.method === 'initialize') emit({ id: message.id, result: { userAgent: 'codex-test' } });
            if (message.method === 'config/read') emit({ id: message.id, result: { config: { mcp_servers: { drive: {}, 'quoted.name': {} } } } });
            if (message.method === 'thread/start') emit({ id: message.id, result: { thread: { id: 'thread-1' } } });
            if (message.method === 'turn/start') {
              emit({ id: message.id, result: { turn: { id: 'turn-1' } } });
              emit({ method: 'item/completed', params: { threadId: 'thread-1', turnId: 'turn-1', item: { type: 'agentMessage', text: JSON.stringify(output) } } });
              emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } });
            }
          });
        },
      });
      return child;
    },
  });
  return { bridge, messages, get launched() { return launched; }, get stopped() { return stopped; } };
}

test('narration uses real App Server JSONL sequencing, restricted execution and default model', async () => {
  const h = harness();
  assert.equal(await h.bridge.generateNarration({ prompt: '紹介動画の台本', cwd: process.cwd() }), '今日は動画編集の流れを紹介します。');
  assert.deepEqual(h.messages.filter(m => m.method).map(m => m.method), ['initialize', 'initialized', 'config/read', 'thread/start', 'turn/start']);
  const thread = h.messages.find(m => m.method === 'thread/start').params;
  assert.equal(thread.sandbox, 'read-only');
  assert.equal(thread.approvalPolicy, 'never');
  assert.deepEqual(thread.environments, []);
  assert.equal(thread.ephemeral, true);
  assert.equal(thread.model, undefined);
  assert.equal(thread.config.mcp_servers.drive.enabled, false);
  assert.equal(thread.config.mcp_servers['quoted.name'].enabled, false);
  const turn = h.messages.find(m => m.method === 'turn/start').params;
  assert.deepEqual(turn.sandboxPolicy, { type: 'readOnly', networkAccess: false });
  assert.equal(turn.outputSchema.properties.script.type, 'string');
  assert.equal(h.launched.command, process.execPath);
  assert.equal(h.launched.options.shell, false);
  assert.equal(h.launched.options.windowsHide, true);
  assert.ok(h.launched.args.includes('features.shell_tool=false'));
  assert.ok(h.launched.args.includes('features.plugins=false'));
  assert.ok(h.launched.args.includes('features.hooks=false'));
  assert.equal(h.stopped, 1);
});

test('plan returns validated scenes and forwards only explicit model', async () => {
  const scene = { title: '導入', description: '全体を見せてから手元へカット', narration: '編集の流れを見てみましょう。', duration: 30, required: ['video', 'audio'] };
  const h = harness({ output: { scenes: [scene] } });
  assert.deepEqual(await h.bridge.generatePlan({ prompt: '編集紹介', duration: 30, model: 'gpt-6-astra' }), [scene]);
  assert.equal(h.messages.find(m => m.method === 'thread/start').params.model, 'gpt-6-astra');
  assert.equal(h.stopped, 1);
});

test('invalid plan duration and narration length fail without persisting output', async () => {
  const h = harness({ output: { scenes: [{ title: '導入', description: '映像', narration: '音声', duration: 2, required: ['video', 'audio'] }] } });
  await assert.rejects(h.bridge.generatePlan({ prompt: '概要', duration: 30 }), /合計尺/);
  assert.equal(h.stopped, 1);
  const tooLong = harness({ output: { script: 'あ'.repeat(2501) } });
  await assert.rejects(tooLong.bridge.generateNarration({ prompt: '概要' }), /2500/);
  assert.equal(tooLong.stopped, 1);
});

test('validation occurs before a process is started', async () => {
  const h = harness();
  await assert.rejects(h.bridge.generateNarration({ prompt: '' }), /プロンプト/);
  await assert.rejects(h.bridge.generatePlan({ prompt: '概要', duration: NaN }), /尺/);
  assert.equal(h.launched, undefined);
});

test('protocol errors and stalled generation both stop the process', async () => {
  const invalid = harness({ behavior(message, { child }) {
    if (message.method === 'initialize') { child.stdout.write('not-json\n'); return false; }
  } });
  await assert.rejects(invalid.bridge.generateNarration({ prompt: '概要' }), /JSONL/);
  assert.equal(invalid.stopped, 1);
  const stalled = harness({ behavior(message, { emit }) {
    if (message.method === 'turn/start') { emit({ id: message.id, result: { turn: { id: 'turn-1' } } }); return false; }
  } });
  await assert.rejects(stalled.bridge.generateNarration({ prompt: '概要' }), /タイムアウト/);
  assert.equal(stalled.stopped, 1);
});

test('approval or tool requests fail closed', async () => {
  const h = harness({ behavior(message, { emit }) {
    if (message.method === 'turn/start') {
      emit({ id: message.id, result: { turn: { id: 'turn-1' } } });
      emit({ id: 900, method: 'item/commandExecution/requestApproval', params: {} });
      return false;
    }
  } });
  await assert.rejects(h.bridge.generateNarration({ prompt: '概要' }), /テキスト生成以外/);
  assert.equal(h.messages.find(m => m.id === 900).error.code, -32601);
  assert.equal(h.stopped, 1);
});

test('tool-start notifications also abort generation', async () => {
  const h = harness({ behavior(message, { emit }) {
    if (message.method === 'turn/start') {
      emit({ id: message.id, result: { turn: { id: 'turn-1' } } });
      emit({ method: 'item/started', params: { threadId: 'thread-1', item: { type: 'mcpToolCall' } } });
      return false;
    }
  } });
  await assert.rejects(h.bridge.generateNarration({ prompt: '概要' }), /ツール操作/);
  assert.equal(h.stopped, 1);
});

test('probe performs handshake only and does not claim model authentication', async () => {
  const h = harness();
  const result = await h.bridge.probeCodex();
  assert.equal(result.available, true);
  assert.equal(result.authenticated, null);
  assert.deepEqual(h.messages.map(m => m.method), ['initialize', 'initialized']);
  assert.equal(h.stopped, 1);
});

test('installed CLI accepts initialization, config and ephemeral read-only thread (no model call)', {
  skip: process.env.YACHICUT_TEST_REAL_CODEX !== '1',
}, async () => {
  let intercepted = false;
  const bridge = createCodexBridge({
    spawn(command, args, options) {
      const child = spawn(command, args, options);
      const originalWrite = child.stdin.write.bind(child.stdin);
      child.stdin.write = (chunk, ...rest) => {
        const message = JSON.parse(String(chunk));
        if (message.method !== 'turn/start') return originalWrite(chunk, ...rest);
        // Never forward this to the actual CLI: no inference or billing occurs.
        intercepted = true;
        queueMicrotask(() => {
          const emit = message => child.stdout.emit('data', `${JSON.stringify(message)}\n`);
          emit({ id: message.id, result: { turn: { id: 'intercepted-turn' } } });
          emit({ method: 'item/completed', params: { threadId: message.params.threadId, item: { type: 'agentMessage', text: JSON.stringify({ script: '接続テスト' }) } } });
          emit({ method: 'turn/completed', params: { threadId: message.params.threadId, turn: { id: 'intercepted-turn', status: 'completed' } } });
        });
        return true;
      };
      return child;
    },
  });
  assert.equal(await bridge.generateNarration({ prompt: '接続テスト', cwd: process.cwd() }), '接続テスト');
  assert.equal(intercepted, true);
});
