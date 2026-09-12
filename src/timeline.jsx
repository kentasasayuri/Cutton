import {BatchTools} from './studio-tools';
import TimingTools from './timing-tools';
import {ProTimelineTools} from './pro-panels';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Captions, Film, Layers3, Music2, RefreshCw, Scissors, Trash2, Type, Volume2, VolumeX } from 'lucide-react';
import { Button } from './ui';
import { timecode } from './model';
import Waveform, { retryWaveforms } from './waveform';

function packLayers(items) {
  const lanes = [];
  [...items].sort((a, b) => a.start - b.start).forEach(item => {
    let lane = lanes.find(items => items.at(-1).start + items.at(-1).duration <= item.start + .00001);
    if (!lane) { lane = []; lanes.push(lane); }
    lane.push(item);
  });
  return lanes.length ? lanes : [[]];
}
const graphicNames = { kinetic: 'キネティック', title: 'タイトル', 'lower-third': 'ローワーサード', shape: 'シェイプ', callout: 'コールアウト', frame: 'フレーム' };

export default memo(function Timeline({ state, clock, selected, onSelect, onUpdate, onSplit, onDelete, onArrange, onClear, onOverlaySelect, onOverlayUpdate, onOverlayDelete, run, busy }) {
  const [group,setGroup]=useState([]);
  useEffect(()=>setGroup([]),[state.id]);
  const selectedItems=group.filter(s=>[...state.clips,...state.captions,...state.graphics].some(i=>i.id===s.id));
  const chosen=selectedItems.length?selectedItems:selected?.type&&['clip','caption','graphic'].includes(selected.type)?[selected]:[];
  const [scale, setScale] = useState(36), [viewport, setViewport] = useState({ left: 0, width: 1200 });
  const cursorRef = useRef(null), laneRef = useRef(null), scrollRef = useRef(null);
  const length = Math.max(clock.duration + 4, 20), width = Math.max(length * scale, 660);
  const baseStep = scale >= 30 ? 2 : 5;
  const tickStep = Math.max(baseStep, Math.ceil(length / 249 / baseStep) * baseStep);
  const viewStart = Math.max(0, (viewport.left - 300) / scale), viewEnd = (viewport.left + viewport.width + 300) / scale;
  const inView = item => item.start + item.duration >= viewStart && item.start <= viewEnd;
  const ticks = Array.from({ length: Math.floor(length / tickStep) + 1 }, (_, i) => i * tickStep).filter(t => t >= viewStart - tickStep && t <= viewEnd + tickStep);
  const assets = useMemo(() => new Map(state.assets.map(asset => [asset.id, asset])), [state.assets]);
  const rows = useMemo(() => [
    ...packLayers(state.graphics || []).map((items, index) => ({ id: `graphics-${index}`, kind: 'graphic', label: `G${index + 1}`, title: 'グラフィック', Icon: Type, items })),
    ...packLayers(state.captions || []).map((items, index) => ({ id: `captions-${index}`, kind: 'caption', label: `T${index + 1}`, title: '字幕', Icon: Captions, items })),
    ...['video','audio'].flatMap(kind=>Array.from({length:Math.max(1,...state.clips.filter(c=>c.track===kind).map(c=>(c.lane||0)+1))},(_,i)=>({id:`${kind}-${i}`,kind,label:`${kind==='video'?'V':'A'}${i+1}`,title:kind==='video'?'映像':'音声',Icon:kind==='video'?Film:Volume2,items:state.clips.filter(c=>c.track===kind&&(c.lane||0)===i)})).sort((a,b)=>kind==='video'?b.label.localeCompare(a.label):a.label.localeCompare(b.label))),
  ], [state.clips, state.captions, state.graphics]);
  useEffect(() => {
    const update = () => { if (cursorRef.current) cursorRef.current.style.transform = `translateX(${clock.time * scale}px)`; };
    update(); return clock.subscribe(update);
  }, [clock, scale]);
  useEffect(() => {
    const scroller = scrollRef.current;
    let frame = null;
    const update = () => { if (frame != null) return; frame = requestAnimationFrame(() => { frame = null; setViewport({ left: scroller.scrollLeft, width: scroller.clientWidth - 96 }); }); };
    const observer = new ResizeObserver(update); observer.observe(scroller); scroller.addEventListener('scroll', update, { passive: true }); update();
    return () => { if (frame != null) cancelAnimationFrame(frame); observer.disconnect(); scroller.removeEventListener('scroll', update); };
  }, []);
  const selectItem = (item, kind) => ['video', 'audio'].includes(kind) ? onSelect(item) : onOverlaySelect({ type: kind, id: item.id });
  const drag = (event, item, kind) => {
    if (event.button !== 0 || busy || event.ctrlKey || event.metaKey) return;
    selectItem(item, kind);
    const startX = event.clientX, target = event.currentTarget;
    const moving=chosen.length>1&&chosen.some(s=>s.id===item.id)?chosen:[{id:item.id,type:['video','audio'].includes(kind)?'clip':kind}], movingIds=new Set(moving.map(s=>s.id)), earliest=Math.min(...[...state.clips,...state.captions,...state.graphics].filter(c=>movingIds.has(c.id)).map(c=>c.start));
    const elements=[...laneRef.current.querySelectorAll('.timeline-clip')].filter(e=>movingIds.has(e.dataset.entityId));
    let offset = 0;
    const move = current => { offset = (current.clientX - startX) / scale; elements.forEach(e=>e.style.transform=`translateX(${Math.max(-earliest,offset)*scale}px)`); };
    const finish = current => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', cancel); elements.forEach(e=>e.style.transform='');
      if (Math.abs(offset * scale) <= 4) return;
      let start = Math.max(0, Math.round((item.start + Math.max(-earliest,offset)) * state.fps) / state.fps);
      if(!current?.shiftKey){const points=[0,clock.time,...(state.markers||[]).map(m=>m.time),...[...state.clips,...state.captions,...state.graphics].filter(c=>!movingIds.has(c.id)).flatMap(c=>[c.start,c.start+c.duration])];const targets=points.flatMap(t=>[t,t-item.duration]).filter(t=>t>=Math.max(0,item.start-earliest)&&Math.abs(t-start)*scale<8).sort((a,b)=>Math.abs(a-start)-Math.abs(b-start));if(targets.length)start=targets[0];}
      if(moving.length>1){run('timeline.align',{items:moving,mode:'offset',at:start-item.start});return;}
      if (['video', 'audio'].includes(kind)) onUpdate(item.id, { start }); else onOverlayUpdate(kind, item.id, { start });
    };
    const cancel = () => { offset = 0; finish(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish, { once: true }); window.addEventListener('pointercancel', cancel, { once: true });
  };
  const trim=(event,item,kind,edge)=>{
    event.stopPropagation();if(busy||event.button!==0)return;const x=event.clientX,target=event.currentTarget.parentElement,minimum=1/state.fps;let delta=0;
    const move=e=>{delta=Math.round((e.clientX-x)/scale*state.fps)/state.fps;delta=edge==='left'?Math.max(-item.start,Math.min(item.duration-minimum,delta)):Math.max(minimum-item.duration,delta);target.style.width=`${(item.duration+(edge==='left'?-delta:delta))*scale-2}px`;if(edge==='left')target.style.left=`${(item.start+delta)*scale}px`;};
    const finish=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',cancel);target.style.width=`${Math.max(item.duration*scale-2,5)}px`;target.style.left=`${item.start*scale}px`;if(!delta)return;const fields=edge==='left'?{start:item.start+delta,duration:item.duration-delta}:{duration:item.duration+delta};if(['audio','video'].includes(kind)){if(edge==='left')fields.in=assets.get(item.assetId)?.kind==='image'?0:item.in+delta*(item.speed||1);onUpdate(item.id,fields);}else onOverlayUpdate(kind,item.id,fields);};
    const cancel=()=>{delta=0;finish();};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',cancel);
  };
  const seek = event => { if (event.target.closest('.timeline-clip')) return; const rect = laneRef.current.getBoundingClientRect(); clock.seek((event.clientX - rect.left) / scale); };
  const selectedClip = selected?.type === 'clip' && state.clips.find(c => c.id === selected.id);
  const overlaySelected = selected && ['graphic', 'caption'].includes(selected.type);
  const remove = () => chosen.length>1?run('timeline.batch',{items:chosen,action:'remove'}):selectedClip ? onDelete(selectedClip) : overlaySelected ? onOverlayDelete(selected.type, selected.id) : null;
  const totalItems = state.clips.length + (state.captions?.length || 0) + (state.graphics?.length || 0);
  const keys=e=>{if(e.target.closest('input,textarea,select,[contenteditable="true"]')||busy)return;const key=e.key.toLowerCase(),cmd=e.ctrlKey||e.metaKey;if(cmd&&!(['a','d'].includes(key)))return;let handled=true;
    if(cmd&&key==='a')setGroup([...state.clips.map(i=>({id:i.id,type:'clip'})),...state.captions.map(i=>({id:i.id,type:'caption'})),...state.graphics.map(i=>({id:i.id,type:'graphic'}))]);
    else if(cmd&&key==='d'&&chosen.length)run('timeline.batch',{items:chosen,action:'duplicate'}).then(r=>{if(r)setGroup(r.result.items);});
    else if(['delete','backspace'].includes(key)&&chosen.length)run('timeline.batch',{items:chosen,action:'remove'});
    else if(['arrowleft','arrowright'].includes(key)){const delta=(key==='arrowright'?1:-1)*(e.shiftKey?10:1)/state.fps;if(e.altKey&&chosen.length)run('timeline.align',{items:chosen,mode:'offset',at:delta});else{clock.pause();clock.seek(clock.time+delta);}}
    else if(key==='home')clock.seek(0);else if(key==='end')clock.seek(clock.duration);
    else if(key==='+'||key==='=')setScale(s=>Math.min(90,s+6));else if(key==='-')setScale(s=>Math.max(12,s-6));
    else if(key==='f')setScale(Math.max(12,Math.min(90,(scrollRef.current.clientWidth-120)/Math.max(1,clock.duration))));
    else if(key==='m')run('marker.add',{time:clock.time});else if(key==='s'&&e.shiftKey)run('timeline.splitAll',{at:clock.time});
    else if(key==='escape')setGroup([]);else handled=false;
    if(handled){e.preventDefault();e.stopPropagation();}
  };
  return <section className="timeline-panel" tabIndex={0} aria-label="タイムライン編集" onKeyDown={keys} onPointerDown={e=>{if(!e.target.closest('input,textarea,select,button,a,summary'))e.currentTarget.focus({preventScroll:true});}}><div className="timeline-toolbar"><div className="timeline-tools"><span className="sequence-label">タイムライン</span><span className="toolbar-divider" /><Button icon={Scissors} action="timeline.split" title="再生ヘッドで分割 (S)" aria-label="再生ヘッドで分割" disabled={!selectedClip || !!busy} onClick={() => onSplit(selectedClip)} /><Button icon={Trash2} action="timeline.removeSelected" title="選択レイヤーを削除" aria-label="選択レイヤーを削除" disabled={(!selectedClip && !overlaySelected) || !!busy} onClick={remove} /><span className="toolbar-divider" /><Button icon={Layers3} action="timeline.arrange.open" disabled={!state.assets.some(a => a.decision === 'accepted' && a.sceneId) || !!busy} onClick={onArrange}>採用素材を整列</Button></div><div className="timeline-tools"><Button icon={RefreshCw} action="waveform.retry" title="波形を再取得" aria-label="波形を再取得" disabled={!state.clips.some(clip => clip.track === 'audio')} onClick={retryWaveforms} /><span className="timeline-duration">{timecode(clock.duration, state.fps)}</span><label className="zoom-control"><span>−</span><input type="range" aria-label="タイムラインのズーム" data-action="timeline.zoom" min="12" max="90" step="2" value={scale} onChange={event => setScale(Number(event.target.value))} /><span>+</span></label><Button icon={Trash2} title="映像と音声の配置を空にする" aria-label="映像と音声の配置を空にする" action="timeline.clear.open" disabled={!state.clips.length || !!busy} onClick={onClear} /></div></div><BatchTools state={state} items={chosen} clock={clock} run={run} busy={!!busy} onSelection={setGroup}/><ProTimelineTools state={state} clock={clock} items={chosen} run={run} busy={busy}/><TimingTools state={state} clock={clock} items={chosen} run={run} busy={busy} onClear={()=>setGroup([])} onSelectAll={()=>setGroup([...state.clips.map(i=>({id:i.id,type:'clip'})),...state.captions.map(i=>({id:i.id,type:'caption'})),...state.graphics.map(i=>({id:i.id,type:'graphic'}))])}/><div className="timeline-scroller" ref={scrollRef}><div className="timeline-content" style={{ minWidth: width + 96, minHeight: 28 + rows.reduce((sum, row) => sum + (['graphic', 'caption'].includes(row.kind) ? 44 : 74), 0) }}><div className="timeline-labels"><div className="ruler-label">秒</div>{rows.map(row => <div key={row.id} className={['graphic', 'caption'].includes(row.kind) ? 'overlay-label' : ''}><span className={`track-letter ${row.kind}-letter`}>{row.label}</span><span>{row.title}</span><row.Icon size={11} /></div>)}</div><div className="timeline-lanes" ref={laneRef} style={{ width }} onPointerDown={seek}><div className="timeline-ruler">{ticks.map(tick => <span key={tick} style={{ left: tick * scale }}>{timecode(tick).slice(3, 8)}</span>)}</div>{rows.map(row => <div key={row.id} className={`timeline-lane ${row.kind}-lane ${['graphic', 'caption'].includes(row.kind) ? 'overlay-lane' : ''}`} style={{ backgroundSize: `${tickStep * scale}px 100%` }}>{row.items.filter(inView).map(item => {
    const isOverlay = ['graphic', 'caption'].includes(row.kind), asset = !isOverlay && assets.get(item.assetId);
    const label = isOverlay ? item.text || graphicNames[item.type] : asset?.name || '素材がありません';
    const selectedItem = chosen.some(s=>s.id===item.id);
    return <button key={item.id} className={`timeline-clip ${row.kind} ${isOverlay ? 'overlay-clip' : ''} ${selectedItem ? 'selected' : ''} ${item.muted ? 'muted' : ''}`} style={{ left: item.start * scale, width: Math.max(item.duration * scale - 2, 5) }} data-action={`${isOverlay ? row.kind : 'timeline'}.selectAndDrag`} data-entity-id={item.id} aria-label={`${label}、${item.start}秒から${item.duration}秒`} title={`${label} · ${item.duration.toFixed(2)}s${row.kind === 'graphic' ? ` · ${graphicNames[item.type] || item.type}` : ''}`} onPointerDown={event => drag(event, item, row.kind)} onClick={e => {if(e.ctrlKey||e.metaKey){const type=isOverlay?row.kind:'clip';setGroup(previous=>{const base=previous.length?previous:chosen;return base.some(s=>s.id===item.id)?base.filter(s=>s.id!==item.id):[...base,{id:item.id,type}];});}else{if(!chosen.some(s=>s.id===item.id))setGroup([]);selectItem(item,row.kind);}}}>{!isOverlay&&['left','right'].map(edge=><span key={edge} className={`trim-handle ${edge}`} aria-label={edge==='left'?'開始をトリム':'終了をトリム'} onPointerDown={e=>trim(e,item,row.kind,edge)}/>)}<div className="clip-name"><row.Icon size={10} /><span>{label}</span>{item.muted && <VolumeX size={10} />}</div>{!isOverlay && (row.kind === 'audio' ? <Waveform asset={asset} clip={item} /> : <div className="video-strip">{asset?.kind === 'image' && <img src={asset.url} loading="lazy" alt="" />}</div>)}{!isOverlay && <span className="clip-duration">{item.duration.toFixed(1)}s</span>}</button>;
  })}{!row.items.length && <span className="empty-lane-copy">{row.kind === 'graphic' ? 'グラフィック' : row.kind === 'caption' ? '字幕' : row.kind === 'video' ? '動画・画像を追加' : '音声を追加'}</span>}</div>)}<div className="playhead" ref={cursorRef}><span /></div></div></div></div><div className="timeline-bottom"><span>{state.width} × {state.height}<b>·</b>{state.fps} fps</span><span>{totalItems} レイヤー <b>·</b> Space 再生 <b>·</b> S 分割 <b>·</b> Ctrl K コマンド</span></div></section>;
});
