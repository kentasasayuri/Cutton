import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.mjs';

async function setup() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cutton-overlay-store-'));
  return { dataDir, store: await createStore({ dataDir }) };
}

test('caption and graphics CRUD validate changes atomically and persist them', async () => {
  const { store, dataDir } = await setup();
  assert.deepEqual(store.getState().captions, []);
  assert.deepEqual(store.getState().graphics, []);
  const caption = (await store.execute('caption.add', { text: '字幕の確認', start: 0.25, duration: 2.5 })).result;
  const graphic = (await store.execute('graphics.add', { type: 'callout', text: 'POINT', start: 1, duration: 3, keyframes: [{ time: 0, x: 20, y: 30, scale: 0.8, opacity: 0, rotation: 0, easing: 'linear' }, { time: 3, x: 70, y: 40, scale: 1.2, opacity: 1, rotation: 15, easing: 'ease-in-out' }] })).result;
  await store.execute('caption.update', { id: caption.id, text: '編集した字幕', y: 82 });
  await store.execute('graphics.update', { id: graphic.id, color: '#abcdef', width: 44 });
  const before = store.getState();
  await assert.rejects(store.execute('caption.update', { id: caption.id, x: 101 }));
  assert.deepEqual(store.getState(), before);
  await assert.rejects(store.execute('graphics.update', { id: graphic.id, keyframes: [{ time: 4, x: 50, y: 50 }] }));
  assert.deepEqual(store.getState(), before);
  assert.deepEqual((await createStore({ dataDir })).getState(), before);
  await store.execute('caption.remove', { id: caption.id });
  await store.execute('graphics.remove', { id: graphic.id });
  assert.deepEqual(store.getState().captions, []);
  assert.deepEqual(store.getState().graphics, []);
});

test('bundle project round trip preserves overlay timing, styles, and motion keyframes', async () => {
  const { store } = await setup();
  await store.execute('caption.add', { text: 'Source caption', start: 1, duration: 2, x: 40, y: 85, fontSize: 42, color: '#abcdef' });
  await store.execute('graphics.add', { type: 'frame', text: '', start: 0.5, duration: 4, animation: 'slide-up', width: 60, height: 50, keyframes: [{ time: 0, x: 40, y: 40, scale: 1, rotation: 0, opacity: 0 }, { time: 4, x: 55, y: 60, scale: 1.1, rotation: 10, opacity: 1 }] });
  const expected = store.getState();
  const exported = (await store.execute('export.create', { format: 'bundle' })).result;
  const projectPath = path.join(exported.path.slice(0, -4), 'project.cutton.json');
  await store.execute('project.new', { name: 'Empty after export' });
  assert.deepEqual(store.getState().captions, []);
  assert.deepEqual(store.getState().graphics, []);
  await store.execute('project.open', { path: projectPath });
  assert.deepEqual(store.getState().captions, expected.captions);
  assert.deepEqual(store.getState().graphics, expected.graphics);
  const malformed = JSON.parse(await fs.readFile(projectPath, 'utf8'));
  malformed.graphics[0].x = -100;
  await fs.writeFile(projectPath, JSON.stringify(malformed), 'utf8');
  const beforeInvalidImport = store.getState();
  await assert.rejects(store.execute('project.open', { path: projectPath }));
  assert.deepEqual(store.getState(), beforeInvalidImport);
});

test('pre-overlay state files migrate without resetting existing project fields', async () => {
  const { store, dataDir } = await setup();
  await store.execute('project.rename', { name: 'Existing film' });
  const legacy = store.getState();
  delete legacy.captions; delete legacy.graphics;
  await fs.writeFile(path.join(dataDir, 'state.json'), JSON.stringify(legacy), 'utf8');
  const migrated = await createStore({ dataDir });
  assert.equal(migrated.getState().id, legacy.id);
  assert.equal(migrated.getState().name, 'Existing film');
  assert.deepEqual(migrated.getState().captions, []);
  assert.deepEqual(migrated.getState().graphics, []);
  const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'state.json'), 'utf8'));
  assert.deepEqual(saved.captions, []);
  assert.deepEqual(saved.graphics, []);
});
