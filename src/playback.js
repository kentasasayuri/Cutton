import {clipEnvelope} from '../server/clip-effects.mjs';
export function syncMediaElement({ element, clip, asset, clock, explicitSeek, silent, onError }) {
  if (!element) return;
  if (!clip || element.dataset.asset !== asset?.id) {
    element.pause();
    element.style.visibility = 'hidden';
    return;
  }
  element.style.visibility = 'visible';
  const target = Math.max(0, clip.in + (clock.time - clip.start) * (clip.speed ?? 1));
  element.playbackRate=clip.speed??1;
  const threshold = !clock.playing || explicitSeek ? .0005 : .16;
  if (Number.isFinite(target) && Math.abs(element.currentTime - target) > threshold) element.currentTime = target;
  element.muted = silent;
  element.volume = Math.max(0, Math.min(1, (clip.gain ?? 1)*clipEnvelope(clip,clock.time)));
  if (clock.playing && element.paused && element.readyState >= 2) element.play().catch(error => { if (error.name !== 'AbortError') onError?.(error); });
  else if (!clock.playing && !element.paused) element.pause();
}
