import { engineFetch, hydrateEngineUrls } from './engine';
export async function request(url, options) {
  const response = await engineFetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `接続に失敗しました (${response.status})`);
  return hydrateEngineUrls(data);
}

export function timecode(seconds = 0, fps = 30) {
  const value = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  const secs = Math.floor(value) % 60;
  const frames = Math.floor((value % 1) * fps + 0.0001);
  return [hours, minutes, secs, frames].map(v => String(v).padStart(2, '0')).join(':');
}

export const bytes = size => !size ? '0 B' : size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.round(size / 1024)} KB`;
export const sortedScenes = scenes => [...scenes].sort((a, b) => a.order - b.order);
export const timelineDuration = state => Math.max(0, state.storyboard.reduce((sum, scene) => sum + scene.duration, 0), ...state.clips.map(clip => clip.start + clip.duration), ...(state.captions || []).map(item => item.start + item.duration), ...(state.graphics || []).map(item => item.start + item.duration));

export function coverage(state) {
  let sceneStart = 0;
  let available = 0;
  let required = 0;
  const scenes = sortedScenes(state.storyboard).map(scene => {
    const start = sceneStart;
    const end = start + scene.duration;
    sceneStart = end;
    const tracks = (scene.required || ['video', 'audio']).map(track => {
      const intervals = state.clips.filter(c => c.sceneId === scene.id && c.track === track && !c.muted).map(c => [Math.max(start, c.start), Math.min(end, c.start + c.duration)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
      let total = 0, cursor = start;
      intervals.forEach(([a, b]) => { total += Math.max(0, b - Math.max(a, cursor)); cursor = Math.max(cursor, b); });
      total = Math.min(total, scene.duration);
      available += total;
      required += scene.duration;
      return { track, filled: total, missing: Math.max(0, scene.duration - total), complete: total >= scene.duration - .01 };
    });
    const target = scene.duration * tracks.length;
    const filled = tracks.reduce((sum, track) => sum + track.filled, 0);
    return { ...scene, start, end, tracks, progress: target ? Math.round(filled / target * 100) : 100 };
  });
  return { scenes, percent: required ? Math.round(available / required * 100) : 0, missingSeconds: required - available };
}

// The clock stays outside React. Frame updates only touch the player and cursor.
export function createClock() {
  const listeners = new Set();
  const clock = {
    time: 0, duration: 0, playing: false, seekVersion: 0,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    notify() { listeners.forEach(fn => fn(clock)); },
    seek(time) { clock.time = Math.max(0, Math.min(clock.duration || 0, time)); clock.seekVersion += 1; clock.notify(); },
    pause() { clock.playing = false; clock.notify(); },
    play() { if (!clock.duration) return; if (clock.time >= clock.duration) { clock.time = 0; clock.seekVersion += 1; } clock.playing = true; clock.notify(); },
    toggle() { clock.playing ? clock.pause() : clock.play(); },
  };
  return clock;
}
