import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { request } from './model';

const cache = new Map();
const retryListeners = new Set();
export function retryWaveforms() { retryListeners.forEach(retry => retry()); }
function loadWaveform(id) {
  if (!cache.has(id)) cache.set(id, request(`/api/waveform/${id}`).catch(error => { cache.delete(id); throw error; }));
  return cache.get(id);
}

export default memo(function Waveform({ asset, clip }) {
  const ref = useRef(null), [waveform, setWaveform] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    if (!asset?.id) return;
    let alive = true, failed = false;
    setWaveform(null); setError('');
    const load = () => {
      failed = false; setError('');
      loadWaveform(asset.id).then(result => { if (alive) setWaveform(result); }).catch(failure => { if (alive) { failed = true; setError(failure.message); } });
    };
    const retry = () => { if (failed) load(); };
    retryListeners.add(retry);
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    }, { rootMargin: '120px' });
    observer.observe(ref.current);
    return () => { alive = false; observer.disconnect(); retryListeners.delete(retry); };
  }, [asset?.id]);
  const path = useMemo(() => {
    if (!waveform?.peaks?.length || !waveform.duration) return '';
    const bins = 240;
    const peaks = waveform.peaks;
    const shape = [];
    for (let index = 0; index < bins; index++) {
      const start = Math.floor((clip.in + index / bins * clip.duration * (clip.speed||1)) / waveform.duration * peaks.length);
      const end = Math.max(start + 1, Math.ceil((clip.in + (index + 1) / bins * clip.duration * (clip.speed||1)) / waveform.duration * peaks.length));
      let amplitude = 0;
      for (let j = Math.max(0, start); j < Math.min(end, peaks.length); j++) amplitude = Math.max(amplitude, peaks[j]);
      const y = Math.max(.25, Math.min(1, amplitude) * 14);
      shape.push(`M${index * 2} ${16 - y}V${16 + y}`);
    }
    return shape.join('');
  }, [waveform, clip.in, clip.duration, clip.speed]);
  return <div className="audio-waveform real-waveform" ref={ref} aria-label={error ? '波形の取得に失敗しました。ツールバーの波形再取得ボタンで再試行できます。' : path ? '音声の波形' : '波形を読み込み中'}>{path && <svg viewBox="0 0 480 32" preserveAspectRatio="none" aria-hidden="true"><path d={path} /></svg>}{error && <span className="waveform-error" title={error}>波形を取得できません</span>}</div>;
});
