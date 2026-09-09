import { useEffect, useState } from 'react';
import { request } from './model';

export function usePreviewMedia(asset, clock) {
  const [quality, setQualityValue] = useState(() => { try { return localStorage.getItem('cutton.previewQuality') || '360'; } catch { return '360'; } });
  const [proxy, setProxy] = useState(null);
  useEffect(()=>{const update=()=>setQualityValue(localStorage.getItem('cutton.previewQuality')||'360');window.addEventListener('cutton-quality',update);return()=>window.removeEventListener('cutton-quality',update);},[]);
  const setQuality = value => { setQualityValue(value); try { localStorage.setItem('cutton.previewQuality', value); window.dispatchEvent(new Event('cutton-quality')); } catch { /* Private browser mode. */ } };
  useEffect(() => {
    if (!asset || asset.kind !== 'video' || quality === 'original') { setProxy(null); return; }
    let alive = true, timer;
    const resume = clock.playing;
    clock.pause();
    setProxy({ assetId: asset.id, quality, status: 'queued' });
    const poll = async (start = false) => {
      try {
        const result = await request(start ? `/api/proxy/${asset.id}` : `/api/proxy/${asset.id}?height=${quality}`, start ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ height: Number(quality) }) } : undefined);
        if (!alive) return;
        setProxy({ ...result, assetId: asset.id, quality });
        if (result.status === 'ready' && resume) clock.play();
        if (['queued', 'running'].includes(result.status)) timer = setTimeout(() => poll(), 1000);
      } catch (error) { if (alive) setProxy({ assetId: asset.id, quality, status: 'error', error: error.message }); }
    };
    poll(true);
    return () => { alive = false; clearTimeout(timer); };
  }, [asset?.id, asset?.kind, quality, clock]);
  const current = proxy?.assetId === asset?.id && proxy?.quality === quality ? proxy : null;
  return { quality, setQuality, proxy: current, url: asset?.kind === 'video' && quality !== 'original' ? current?.status === 'ready' ? current.url : null : asset?.url, pending: asset?.kind === 'video' && quality !== 'original' && current?.status !== 'ready' };
}
