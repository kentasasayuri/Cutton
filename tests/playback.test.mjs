import test from 'node:test';
import assert from 'node:assert/strict';
import { syncMediaElement } from '../src/playback.js';

const asset = { id: 'source-video' };
const clip = { assetId: asset.id, start: 0, in: 0, duration: 6, gain: 1 };
function media() {
  return {
    currentTime: 1, dataset: { asset: asset.id }, style: {}, paused: true, readyState: 4,
    pause() { this.paused = true; },
    play() { this.paused = false; return Promise.resolve(); },
  };
}

test('paused one-frame navigation seeks the media to the exact requested frame', () => {
  const element = media();
  const time = 1 + 1 / 30;
  syncMediaElement({ element, clip, asset, clock: { time, playing: false }, explicitSeek: false, silent: true });
  assert.equal(element.currentTime, time);
  assert.equal(element.paused, true);
  assert.equal(element.muted, true);
});

test('explicit one-frame seeking during playback bypasses drift tolerance', () => {
  const element = media();
  const time = 1 + 1 / 30;
  syncMediaElement({ element, clip, asset, clock: { time, playing: true }, explicitSeek: true, silent: true });
  assert.equal(element.currentTime, time);
  assert.equal(element.paused, false);
});

test('normal playback ignores small clock jitter without reseeking every frame', () => {
  const element = media();
  syncMediaElement({ element, clip, asset, clock: { time: 1 + 1 / 30, playing: true }, explicitSeek: false, silent: true });
  assert.equal(element.currentTime, 1);
  assert.equal(element.paused, false);
  assert.equal(element.style.visibility, 'visible');
});

test('a timeline gap immediately hides and pauses the old video frame, then restores the next valid frame', () => {
  const element = media();
  element.paused = false;
  syncMediaElement({ element, clip: null, asset: null, clock: { time: 6.45, playing: false }, silent: true });
  assert.equal(element.style.visibility, 'hidden');
  assert.equal(element.paused, true);
  syncMediaElement({ element, clip, asset, clock: { time: 2, playing: false }, silent: true });
  assert.equal(element.style.visibility, 'visible');
  assert.equal(element.currentTime, 2);
});

test('switching to another source hides the old decoded frame until its matching element is mounted', () => {
  const element = media();
  element.paused = false;
  syncMediaElement({ element, clip: { ...clip, assetId: 'next-source' }, asset: { id: 'next-source' }, clock: { time: 3, playing: true }, silent: true });
  assert.equal(element.style.visibility, 'hidden');
  assert.equal(element.paused, true);
});
