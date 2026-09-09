import React, { memo, useMemo, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, Clapperboard, Film, Image, Layers3, LoaderCircle, Maximize, Mic, MoreHorizontal, Music2, Pause, Play, Plus, Scissors, Search, SkipBack, SkipForward, Sparkles, Trash2, Upload, Volume2, VolumeX, X } from 'lucide-react';
import { bytes, timecode } from './model';
import Waveform from './waveform';
import { engineUrl } from './engine';
import { OverlayPreview } from './overlays';
import { usePreviewMedia } from './preview-media';
import MediaLayers from './media-layers';
import DirectManipulation from './direct-manipulation';
import { syncMediaElement } from './playback';

export { Button, Field } from './ui';
import { Button, Field } from './ui';
export function Empty({ icon: Icon = Layers3, title, detail, children }) { return <div className="empty-state"><Icon size={27} strokeWidth={1.2} /><strong>{title}</strong>{detail && <p>{detail}</p>}{children}</div>; }
export function Modal({ title, children, onClose, wide = false }) {
  const dialogRef = useRef(null);
  useEffect(() => { const dialog = dialogRef.current; dialog.showModal(); const callback = event => { event.preventDefault(); onClose(); }; dialog.addEventListener('cancel', callback); return () => { dialog.removeEventListener('cancel', callback); dialog.close(); }; }, [onClose]);
  return <dialog ref={dialogRef} className={`modal ${wide ? 'wide' : ''}`} aria-label={title} onClick={event => { if (event.target === dialogRef.current) onClose(); }}><header className="modal-header"><h2>{title}</h2><Button icon={X} action="dialog.close" title="閉じる" aria-label="閉じる" onClick={onClose} /></header>{children}</dialog>;
}
export function Timecode({ clock, fps = 30, className = '' }) {
  const element = useRef(null);
  useEffect(() => { const update = () => { if (element.current) element.current.textContent = timecode(clock.time, fps); }; update(); return clock.subscribe(update); }, [clock, fps]);
  return <span ref={element} className={`timecode ${className}`}>{timecode(clock.time, fps)}</span>;
}

export const Player = memo(function Player({ state, clock, selectedAsset, sourceCandidate, onSelectSource, onClearAsset, selected, onOverlaySelect, onTransform, busy }) {
  const [draft,setDraft]=useState(null);
  const previewState=useMemo(()=>{if(!draft)return state;const field={clip:'clips',graphic:'graphics',caption:'captions'}[draft.kind];return {...state,[field]:state[field].map(item=>item.id===draft.id?{...item,...draft.fields}:item)};},[state,draft]);
  useEffect(()=>setDraft(null),[state.id]);
  const videoRef = useRef(null), audioRef = useRef(null), screenRef = useRef(null);
  const [active, setActive] = useState({ video: null, audio: null });
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const lastSeekRef = useRef(-1);
  const [previewError, setPreviewError] = useState('');
  const [projectSize, setProjectSize] = useState({ width: 0, height: 0 });
  const activeRef = useRef(active);
  const assetMap = new Map(state.assets.map(a => [a.id, a]));
  const videoClip = active.video && state.clips.find(c => c.id === active.video && !c.muted && c.start <= clock.time && c.start + c.duration > clock.time);
  const audioClip = active.audio && state.clips.find(c => c.id === active.audio && !c.muted && c.start <= clock.time && c.start + c.duration > clock.time);
  const videoAsset = videoClip && assetMap.get(videoClip.assetId);
  const audioAsset = audioClip && assetMap.get(audioClip.assetId);

  useEffect(() => {
    const screen = screenRef.current;
    const resize = () => { const box = screen.getBoundingClientRect(); const width = Math.min(box.width, box.height * state.width / state.height); setProjectSize({ width, height: width * state.height / state.width }); };
    const observer = new ResizeObserver(resize); observer.observe(screen); resize(); return () => observer.disconnect();
  }, [state.width, state.height]);
  useEffect(() => { setPreviewError(''); }, [videoAsset?.id, audioAsset?.id, selectedAsset?.id]);
  useEffect(() => {
    let frame = null, previous = performance.now();
    const selectAndSync = () => {
      const explicitSeek = lastSeekRef.current !== clock.seekVersion;
      lastSeekRef.current = clock.seekVersion;
      if (playingRef.current !== clock.playing) { playingRef.current = clock.playing; setPlaying(clock.playing); }
      if (selectedAsset) return;
      const nextVideo = state.clips.find(c => c.track === 'video' && !c.muted && c.start <= clock.time && c.start + c.duration > clock.time);
      const nextAudio = state.clips.find(c => c.track === 'audio' && !c.muted && c.start <= clock.time && c.start + c.duration > clock.time);
      if (activeRef.current.video !== (nextVideo?.id || null) || activeRef.current.audio !== (nextAudio?.id || null)) {
        activeRef.current = { video: nextVideo?.id || null, audio: nextAudio?.id || null };
        setActive(activeRef.current);
      }
      [[videoRef.current, nextVideo, true], [audioRef.current, nextAudio, false]].forEach(([element, clip, silent]) => syncMediaElement({ element, clip, asset: clip && state.assets.find(asset => asset.id === clip.assetId), clock, explicitSeek, silent, onError: () => setPreviewError('プレビューの再生を開始できません。再生ボタンでもう一度お試しください。') }));
    };
    const tick = now => {
      const elapsed = Math.min((now - previous) / 1000, .25); previous = now;
      if (clock.playing && !selectedAsset) { clock.time = Math.min(clock.duration, clock.time + elapsed); if (clock.time >= clock.duration) clock.playing = false; clock.notify(); }
      selectAndSync();
      frame = clock.playing && !selectedAsset ? requestAnimationFrame(tick) : null;
    };
    const update = () => { selectAndSync(); if (clock.playing && !selectedAsset && frame == null) { previous = performance.now(); frame = requestAnimationFrame(tick); } };
    update();
    const unsubscribe = clock.subscribe(update);
    return () => { unsubscribe(); if (frame != null) cancelAnimationFrame(frame); videoRef.current?.pause(); audioRef.current?.pause(); };
  }, [state.clips, state.assets, clock, selectedAsset]);

  const visible = selectedAsset || videoAsset;
  const preview = usePreviewMedia(visible, clock);
  return <section className="preview-panel">
    <div className="panel-heading"><div className="viewer-tabs"><button className={!selectedAsset ? 'active' : ''} aria-pressed={!selectedAsset} data-action="preview.program" onClick={onClearAsset}>プログラム</button><button className={selectedAsset ? 'active' : ''} aria-pressed={!!selectedAsset} disabled={!sourceCandidate && !selectedAsset && !videoAsset} data-action="preview.source" onClick={() => onSelectSource(sourceCandidate || selectedAsset || videoAsset)}>ソース</button></div><select className="preview-quality" aria-label="プレビュー画質" data-action="preview.quality" value={preview.quality} onChange={event => preview.setQuality(event.target.value)}><option value="360">360p</option><option value="540">540p</option><option value="720">720p</option><option value="original">オリジナル</option></select></div>
    <div className="preview-screen" ref={screenRef}>
      <div className="program-stage" style={selectedAsset ? { width: '100%', height: '100%' } : projectSize}>
      {!selectedAsset ? <MediaLayers state={previewState} clock={clock} onError={setPreviewError}/> : visible?.kind === 'image' ? <img src={visible.url} alt={visible.name} className="preview-media" /> : visible?.kind === 'video' && !preview.url ? <div className="proxy-loading">{preview.proxy?.status === 'error' ? <><p>{preview.proxy.error || 'プレビューの準備に失敗しました'}</p><Button action="preview.originalFallback" onClick={() => preview.setQuality('original')}>オリジナルで再生</Button></> : <><LoaderCircle size={18} className="spin" /><span>プレビューを準備中</span></>}</div> : visible?.kind === 'video' ? <video key={visible.id} ref={videoRef} data-asset={visible.id} src={preview.url} className="preview-media" preload="metadata" muted controls={!!selectedAsset} onLoadedMetadata={() => clock.notify()} onCanPlay={() => clock.notify()} playsInline onError={() => setPreviewError('この形式はブラウザで再生できません。MP4（H.264）などのプレビュー用素材を使用してください。')} /> : selectedAsset?.kind === 'audio' ? <div className="audio-source"><Music2 size={43} /><strong>{selectedAsset.name}</strong><audio src={selectedAsset.url} controls preload="metadata" /></div> : <div className="preview-placeholder"><p>{state.clips.length ? '' : 'メディアをタイムラインに追加'}</p></div>}
      {false && audioAsset && <audio key={audioAsset.id} ref={audioRef} data-asset={audioAsset.id} src={audioAsset.url} preload="metadata" onLoadedMetadata={() => clock.notify()} onCanPlay={() => clock.notify()} onError={() => setPreviewError('音声プレビューに失敗しました。ブラウザ対応の音声形式を確認してください。')} />}
      {!selectedAsset && <OverlayPreview state={previewState} clock={clock} selected={selected} onSelect={onOverlaySelect} />}
      {!selectedAsset&&<DirectManipulation state={previewState} clock={clock} selected={selected} onSelect={onOverlaySelect} onDraft={setDraft} onCommit={onTransform} busy={busy}/>}
      </div>
      {selectedAsset && <Button className="back-to-timeline" icon={ArrowLeft} action="preview.timeline" onClick={onClearAsset}>タイムラインに戻る</Button>}
      {previewError && <div className="preview-error">{previewError}</div>}
    </div>
    <div className="transport"><Timecode clock={clock} fps={state.fps} /><div className="transport-center"><Button icon={SkipBack} title="先頭へ" aria-label="先頭へ" action="playback.start" onClick={() => { onClearAsset(); clock.seek(0); }} /><Button icon={ChevronRight} className="previous-frame" title="1フレーム戻る" aria-label="1フレーム戻る" action="playback.previousFrame" onClick={() => { onClearAsset(); clock.seek(clock.time - 1 / state.fps); }} /><Button icon={playing ? Pause : Play} className="play-button" title={playing ? '一時停止 (Space)' : '再生 (Space)'} aria-label={playing ? '一時停止' : '再生'} action="playback.toggle" disabled={!clock.duration || preview.pending} onClick={() => { onClearAsset(); clock.toggle(); }} /><Button icon={ChevronRight} title="1フレーム進む" aria-label="1フレーム進む" action="playback.nextFrame" onClick={() => { onClearAsset(); clock.seek(clock.time + 1 / state.fps); }} /><Button icon={SkipForward} title="末尾へ" aria-label="末尾へ" action="playback.end" onClick={() => { onClearAsset(); clock.seek(clock.duration); }} /></div><Button icon={Maximize} title="プレビューを全画面表示" aria-label="プレビューを全画面表示" action="preview.fullscreen" onClick={() => { screenRef.current?.requestFullscreen?.().catch(() => setPreviewError('全画面表示を利用できません。')); }} /></div>
  </section>;
});

export const Storyboard = memo(function Storyboard({ progress, selected, onSelect, onAdd, onPlan, onReorder }) {
  return <section className="storyboard-panel"><div className="panel-heading"><span><Layers3 size={14} />ストーリーボード <small>{progress.scenes.length}</small></span><div className="heading-actions"><span className="completion"><i><b style={{ width: `${progress.percent}%` }} /></i>{progress.percent}%</span><Button icon={Plus} action="storyboard.add.open" title="シーンを追加" aria-label="シーンを追加" onClick={onAdd} /></div></div><div className="storyboard-scroll">{progress.scenes.length ? progress.scenes.map((scene, i) => <article key={scene.id} className={`scene-card ${selected?.type === 'scene' && selected.id === scene.id ? 'selected' : ''}`}><button className="scene-main" data-action="storyboard.select" data-entity-id={scene.id} onClick={() => onSelect(scene)}><div className="scene-topline"><span>{String(i + 1).padStart(2, '0')}</span><span>{scene.duration}s</span></div><h3>{scene.title}</h3><p>{scene.description || 'シーンの内容を追加'}</p><div className="scene-tracks">{scene.tracks.map(track => <span key={track.track} className={track.complete ? 'complete' : ''}>{track.complete ? <Check size={11} /> : <span className="track-dot" />}{track.track === 'video' ? '映像' : '音声'}{!track.complete && ` −${track.missing.toFixed(1)}s`}</span>)}</div><div className="scene-progress"><span style={{ width: `${scene.progress}%` }} /></div></button><div className="scene-reorder"><Button icon={ArrowLeft} action="storyboard.moveLeft" entity={scene.id} title="シーンを前へ" aria-label="シーンを前へ" disabled={i === 0} onClick={() => onReorder(i, -1)} /><span>{timecode(scene.start).slice(3, 8)}</span><Button icon={ArrowRight} action="storyboard.moveRight" entity={scene.id} title="シーンを後ろへ" aria-label="シーンを後ろへ" disabled={i === progress.scenes.length - 1} onClick={() => onReorder(i, 1)} /></div></article>) : <div className="storyboard-empty"><span>シーンがありません</span><Button icon={Sparkles} action="plan.open" onClick={onPlan}>編集プランを作成</Button></div>}<button className="add-scene-card" data-action="storyboard.add.open" aria-label="シーンを追加" onClick={onAdd}><Plus size={19} /><span>シーン追加</span></button></div></section>;
});

export const Library = memo(function Library({ assets, scenes, selected, onSelect, onUpload, onAdd, onGenerate, busy }) {
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [scene, setScene] = useState('all');
  const [displayLimit, setDisplayLimit] = useState(80);
  useEffect(() => { setDisplayLimit(80); }, [search, filter, scene]);
  const visible = assets.filter(a => a.name.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || a.kind === filter || a.decision === filter) && (scene === 'all' || (scene === 'none' ? !a.sceneId : a.sceneId === scene)));
  return <aside className="library"><div className="panel-heading"><span><Film size={14} />メディア</span><Button icon={Upload} title="素材を読み込む" aria-label="素材を読み込む" action="asset.upload.open" onClick={onUpload} disabled={busy} /></div><div className="library-tools"><label className="search-field"><Search size={13} /><input aria-label="素材を検索" data-action="asset.search" value={search} onChange={event => setSearch(event.target.value)} placeholder="素材を検索…" /><kbd>⌕</kbd></label><div className="media-filters">{[['all', 'すべて'], ['video', '映像'], ['audio', '音声'], ['image', '画像']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} data-action="asset.filter" data-entity-id={value} onClick={() => setFilter(value)}>{label}</button>)}</div><select aria-label="シーンで絞り込む" data-action="asset.filterScene" value={scene} onChange={event => setScene(event.target.value)}><option value="all">すべてのシーン</option><option value="none">未割り当て</option>{scenes.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></div><div className="asset-list">{visible.length ? visible.slice(0, displayLimit).map(asset => { const Icon = asset.kind === 'audio' ? Music2 : asset.kind === 'image' ? Image : Film; return <article key={asset.id} className={`asset-card ${selected?.id === asset.id ? 'selected' : ''} ${asset.decision === 'rejected' ? 'rejected' : ''}`}><button className="asset-select" data-action="asset.select" data-entity-id={asset.id} onClick={() => onSelect(asset)}><div className={`asset-thumb ${asset.kind}`}>{asset.kind === 'image' ? <img src={asset.url} alt="" loading="lazy" /> : asset.kind === 'video' ? <><Icon size={23} strokeWidth={1.3} /><img className="video-thumbnail" src={engineUrl(`/thumbnail/${asset.id}`)} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} /></> : <Icon size={23} strokeWidth={1.3} />}<span>{asset.kind === 'image' ? '画像' : `${Number(asset.duration || 0).toFixed(1)}s`}</span>{asset.decision === 'accepted' && <b className="asset-approved"><Check size={11} /></b>}{asset.decision === 'rejected' && <b className="asset-rejected"><X size={11} /></b>}</div><strong title={asset.name}>{asset.name}</strong><small>{bytes(asset.size)}</small></button><Button className="asset-add" icon={Plus} action="timeline.add.open" entity={asset.id} title={`${asset.name}をタイムラインへ追加`} aria-label={`${asset.name}をタイムラインへ追加`} onClick={() => onAdd(asset)} /></article>; }) : <Empty icon={Upload} title={assets.length ? '該当する素材がありません' : 'メディアをインポート'} detail={assets.length ? '' : '動画、音声、画像をドラッグ'}>{!assets.length && <Button icon={Plus} action="asset.upload.open" onClick={onUpload} disabled={busy}>素材を読み込む</Button>}</Empty>}{visible.length > displayLimit && <Button className="load-more-assets" icon={Plus} action="asset.showMore" onClick={() => setDisplayLimit(limit => limit + 80)}>さらに {Math.min(80, visible.length - displayLimit)} 件を表示</Button>}</div><div className="library-footer"><span>{Math.min(displayLimit, visible.length)} / {visible.length} 素材</span><Button icon={Sparkles} action="generation.open" onClick={onGenerate}>生成</Button></div></aside>;
});

export { default as Timeline } from './timeline';
