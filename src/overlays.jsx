import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Copy, Diamond, Plus, Save, Trash2 } from 'lucide-react';
import { Button, Field } from './ui';
import {VectorFields,VectorPreview,CurveEditor,vectorDefaults} from './vector-editor';
import { timecode } from './model';

import { evaluateOverlayTransform as evaluateTransform, wrapOverlayText } from '../server/overlays.mjs';

const graphicPresets = [
  {id:'vector',name:'ベクターコンポジション',type:'vector',text:'CUTTON / MOTION',x:50,y:50,width:68,height:24,fontSize:70,color:'#13243b',animation:'none',shape:'rect',gradient:true,gradientColor:'#287880',radius:2,stroke:2,strokeColor:'#75ead9',textColor:'#ffffff',tracking:5,shadow:9,keyframes:[{time:0,x:50,y:60,scale:.85,rotation:-3,opacity:0,easing:'bezier',bezier:[.16,1,.3,1]},{time:1,x:50,y:50,scale:1,rotation:0,opacity:1,easing:'linear'}]},
  {id:'null',name:'ヌル（親レイヤー）',type:'null',text:'親レイヤー',x:50,y:50,width:10,height:10,fontSize:40,color:'#ffffff',animation:'none'},
  { id: 'kinetic', name: 'キネティックタイトル', type: 'kinetic', text: 'YOUR NEXT CHAPTER', x: 50, y: 48, width: 65, height: 18, fontSize: 76, color: '#37cbd6', animation: 'none', keyframes: [{ time: 0, x: 50, y: 57, scale: .92, rotation: 0, opacity: 0, easing: 'ease-in-out' }, { time: .45, x: 50, y: 48, scale: 1, rotation: 0, opacity: 1, easing: 'linear' }] },
  { id: 'lower-third', name: 'ローワーサード', type: 'lower-third', text: '名前 / タイトル', x: 30, y: 81, width: 42, height: 10, fontSize: 40, color: '#315b65', animation: 'slide-up' },
  { id: 'callout', name: 'コールアウト', type: 'callout', text: 'ポイントをここに入力', x: 68, y: 40, width: 42, height: 18, fontSize: 42, color: '#37cbd6', animation: 'fade' },
  { id: 'frame', name: 'フレーム', type: 'frame', text: 'FOCUS', x: 50, y: 50, width: 68, height: 45, fontSize: 62, color: '#ffffff', animation: 'fade' },
  { id: 'title', name: 'タイトル', type: 'title', text: 'タイトルを入力', x: 50, y: 50, width: 70, height: 18, fontSize: 72, color: '#ffffff', animation: 'fade' },
  { id: 'shape', name: 'シェイプ', type: 'shape', text: '', x: 50, y: 50, width: 45, height: 30, fontSize: 48, color: '#315b65', animation: 'none' },
];

function OverlayForm({ item, kind, state, clock, run, busy, onSelect, onNew }) {
  const caption = kind === 'caption';
  const initial = useMemo(() => item || (caption ? { text: '', start: Math.round(clock.time * 1000) / 1000, duration: 3, x: 50, y: 88, fontSize: 48, color: '#ffffff' } : { ...graphicPresets[0], start: Math.round(clock.time * 1000) / 1000, duration: 4 }), [item?.id, caption]);
  const [draft, setDraft] = useState(initial);
  const itemSnapshot = JSON.stringify(item || null);
  useEffect(() => { if (item) setDraft(item); }, [itemSnapshot]);
  const set = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const numeric = (key, label, options = {}) => <Field label={label}><input type="number" value={draft[key] ?? ''} step={options.step || .1} min={options.min} max={options.max} required data-action={`${caption ? 'caption' : 'graphics'}.${key}`} onChange={event => set(key, event.target.value)} /></Field>;
  const updateFrame = (index, key, value) => set('keyframes', (draft.keyframes || []).map((frame, i) => i === index ? { ...frame, [key]: value } : frame));
  const addFrame = () => {
    const time = Math.round(Math.max(0, Math.min(draft.duration, clock.time - draft.start)) * 1000) / 1000;
    const numericDraft = { ...draft, x: Number(draft.x), y: Number(draft.y), duration: Number(draft.duration), keyframes: (draft.keyframes || []).map(frame => ({ ...frame, time: Number(frame.time), x: Number(frame.x), y: Number(frame.y), scale: Number(frame.scale), rotation: Number(frame.rotation), opacity: Number(frame.opacity) })).sort((a, b) => a.time - b.time) };
    const transform = evaluateTransform(numericDraft, time);
    const frame = { time, x: transform.x, y: transform.y, scale: transform.scale, rotation: transform.rotation, opacity: transform.opacity, easing: 'ease-in-out' };
    set('keyframes', [...(draft.keyframes || []).filter(existing => Math.abs(existing.time - time) > .0001), frame].sort((a, b) => a.time - b.time));
  };
  const save = async event => {
    event.preventDefault();
    const fields = { text: draft.text, start: Number(draft.start), duration: Number(draft.duration), x: Number(draft.x), y: Number(draft.y), fontSize: Number(draft.fontSize), color: draft.color };
    if (!caption) Object.assign(fields, { type: draft.type, width: Number(draft.width), height: Number(draft.height), animation: draft.animation, keyframes: (draft.keyframes || []).map(frame => ({ ...frame, time: Number(frame.time), x: Number(frame.x), y: Number(frame.y), scale: Number(frame.scale), rotation: Number(frame.rotation), opacity: Number(frame.opacity) })).sort((a, b) => a.time - b.time) });
    if(['vector','null'].includes(draft.type))Object.assign(fields,Object.fromEntries(Object.keys(vectorDefaults).map(key=>[key,draft[key]??vectorDefaults[key]])));
    const response = await run(`${caption ? 'caption' : 'graphics'}.${item ? 'update' : 'add'}`, { ...(item ? { id: item.id } : {}), ...fields });
    const saved = response?.result;
    if (saved?.id) onSelect({ type: kind, id: saved.id });
  };
  return <form className="overlay-form" onSubmit={save}>
    <div className="overlay-edit-heading"><h3>{item ? caption ? '字幕を編集' : 'グラフィックを編集' : caption ? '字幕を追加' : 'グラフィックを追加'}</h3>{item && <Button icon={Plus} action={`${kind}.new`} title="新規追加" aria-label="新規追加" onClick={onNew} />}</div>
    {!caption && <Field label="テンプレート"><select value={draft.type} data-action="graphics.preset" onChange={event => { const preset = graphicPresets.find(p => p.type === event.target.value); setDraft(previous => ({ ...previous, ...preset, keyframes: preset.keyframes ? structuredClone(preset.keyframes) : [] })); }}>{graphicPresets.map(preset => <option key={preset.id} value={preset.type}>{preset.name}</option>)}</select></Field>}
    <Field label="テキスト"><textarea rows="3" value={draft.text} required={caption || !['shape', 'frame', 'vector', 'null'].includes(draft.type)} data-action={`${kind}.text`} onChange={event => set('text', event.target.value)} placeholder={caption ? '字幕を入力' : 'テキストを入力'} /></Field>
    <div className="field-row">{numeric('start', '開始（秒）', { min: 0, step: .001 })}{numeric('duration', '長さ（秒）', { min: .1, step: .001 })}</div>
    <div className="inspector-section-title">変形</div>
    <div className="field-row">{numeric('x', '位置 X（%）', { min: 0, max: 100 })}{numeric('y', '位置 Y（%）', { min: 0, max: 100 })}</div>
    {!caption && <div className="field-row">{numeric('width', '幅（%）', { min: .1, max: 100 })}{numeric('height', '高さ（%）', { min: .1, max: 100 })}</div>}
    <div className="field-row">{numeric('fontSize', '文字サイズ（px）', { min: 8, max: 300, step: 1 })}<Field label="カラー"><input type="color" value={draft.color} data-action={`${kind}.color`} onChange={event => set('color', event.target.value)} /></Field></div>
    {!caption&&['vector','null'].includes(draft.type)&&<VectorFields draft={draft} set={set} state={state}/>}
    {!caption && <><Field label="アニメーション"><select value={draft.animation} disabled={draft.keyframes?.length > 0} data-action="graphics.animation" onChange={event => set('animation', event.target.value)}><option value="none">なし</option><option value="fade">フェード</option><option value="slide-up">下からスライド</option></select>{draft.keyframes?.length > 0 && <small>キーフレームの動きを適用します。</small>}</Field><div className="keyframe-heading"><span><Diamond size={12} />キーフレーム</span><Button icon={Plus} action="graphics.keyframe.add" title="現在位置にキーフレームを追加" aria-label="現在位置にキーフレームを追加" disabled={(draft.keyframes || []).length >= 60} onClick={addFrame} /></div><div className="keyframe-list">{(draft.keyframes || []).map((frame, index) => <div className="keyframe-row" key={index}><div className="keyframe-time"><span>{index + 1}</span><Field label="相対時間（秒）"><input type="number" min="0" max={draft.duration} step="0.001" value={frame.time} data-action="graphics.keyframe.time" data-entity-id={String(index)} onChange={event => updateFrame(index, 'time', event.target.value)} /></Field><Button icon={Trash2} action="graphics.keyframe.remove" entity={String(index)} title="キーフレームを削除" aria-label="キーフレームを削除" onClick={() => set('keyframes', draft.keyframes.filter((_, i) => i !== index))} /></div><div className="keyframe-values">{[['x', 'X', 0, 100], ['y', 'Y', 0, 100], ['scale', '拡大率', .1, 4], ['rotation', '回転 °', -360, 360], ['opacity', '不透明度', 0, 1]].map(([key, label, min, max]) => <Field label={label} key={key}><input type="number" value={frame[key]} min={min} max={max} step={key === 'scale' || key === 'opacity' ? .01 : .1} data-action={`graphics.keyframe.${key}`} data-entity-id={String(index)} onChange={event => updateFrame(index, key, event.target.value)} /></Field>)}<Field label="補間"><select value={frame.easing} data-action="graphics.keyframe.easing" data-entity-id={String(index)} onChange={event => updateFrame(index, 'easing', event.target.value)}><option value="linear">リニア</option><option value="ease-in-out">イーズ</option><option value="bezier">ベジェ</option><option value="hold">ホールド</option></select></Field></div>{frame.easing==='bezier'&&<CurveEditor frame={frame} onChange={value=>updateFrame(index,'bezier',value)}/>}<Button className="keyframe-seek" action="graphics.keyframe.seek" entity={String(index)} onClick={() => clock.seek(Number(draft.start) + Number(frame.time))}>この位置へ移動</Button></div>)}</div>{!(draft.keyframes || []).length && <p className="muted-copy">再生ヘッドを移動し、＋で位置・拡大率・回転・不透明度を追加できます。</p>}</>}
    <button type="submit" className="button primary full-width" data-action={`${caption ? 'caption' : 'graphics'}.${item ? 'update' : 'add'}`} disabled={!!busy}><Save size={13} />{item ? '変更を保存' : caption ? '字幕を追加' : 'グラフィックを追加'}</button>
    {item && <Button className="full-width danger-text" icon={Trash2} action={`${caption ? 'caption' : 'graphics'}.remove`} entity={item.id} disabled={!!busy} onClick={async () => { const response = await run(`${caption ? 'caption' : 'graphics'}.remove`, { id: item.id }); if (response) onNew(); }}>削除</Button>}
  </form>;
}

export function OverlayEditor({ state, selected, mode, onMode, onSelect, clock, run, busy }) {
  const items = mode === 'caption' ? state.captions || [] : state.graphics || [];
  const item = selected?.type === mode ? items.find(i => i.id === selected.id) : null;
  return <><div className="overlay-mode-switch"><button className={mode === 'caption' ? 'active' : ''} data-action="overlay.captions" onClick={() => onMode('caption')}>字幕</button><button className={mode === 'graphic' ? 'active' : ''} data-action="overlay.graphics" onClick={() => onMode('graphic')}>グラフィック</button></div><OverlayForm key={`${mode}-${item?.id || 'new'}`} item={item} kind={mode} state={state} clock={clock} run={run} busy={busy} onSelect={onSelect} onNew={() => onSelect(null)} />{items.length > 0 && <div className="overlay-layer-list"><div className="inspector-section-title">レイヤー <span>{items.length}</span></div>{items.map(layer => <button key={layer.id} className={item?.id === layer.id ? 'active' : ''} data-action={`${mode}.select`} data-entity-id={layer.id} onClick={() => onSelect({ type: mode, id: layer.id })}><span>{layer.text || layer.type}</span><small>{timecode(layer.start).slice(3, 8)} · {layer.duration}s</small></button>)}</div>}</>;
}

export const OverlayPreview = memo(function OverlayPreview({ state, clock, selected, onSelect }) {
  const stageRef = useRef(null), nodes = useRef(new Map()), sizeRef = useRef({ width: 0, height: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [visibleIds, setVisibleIds] = useState([]);
  const visibleKey = useRef('');
  const items = useMemo(() => [...(state.graphics || []).filter(item=>!['vector','null'].includes(item.type)).map(item => ({ ...item, kind: 'graphic' })), ...(state.captions || []).map(item => ({ ...item, kind: 'caption' }))], [state.graphics, state.captions]);
  useEffect(() => {
    const parent = stageRef.current.parentElement;
    const resize = () => { const rect = parent.getBoundingClientRect(); const width = Math.min(rect.width, rect.height * state.width / state.height); const next = { width, height: width * state.height / state.width }; sizeRef.current = next; setSize(next); clock.notify(); };
    const observer = new ResizeObserver(resize); observer.observe(parent); resize(); return () => observer.disconnect();
  }, [state.width, state.height, clock]);
  useEffect(() => {
    const update = () => {
      const active = items.filter(item => clock.time >= item.start && clock.time < item.start + item.duration);
      const key = active.map(item => item.id).join('|');
      if (key !== visibleKey.current) { visibleKey.current = key; setVisibleIds(active.map(item => item.id)); }
      active.forEach(item => {
      const element = nodes.current.get(item.id); if (!element) return;
      const time = clock.time - item.start;
      const visible = time >= 0 && time < item.duration;
      element.style.display = visible ? 'flex' : 'none';
      if (!visible) return;
      const transform = evaluateTransform(item, time), dimensions = sizeRef.current;
      element.style.transform = `translate3d(${transform.x / 100 * dimensions.width}px,${transform.y / 100 * dimensions.height}px,0) translate(-50%,-50%) rotate(${transform.rotation}deg) scale(${transform.scale})`;
      element.style.opacity = String(transform.opacity);
      });
    };
    update(); return clock.subscribe(update);
  }, [items, size, clock, visibleIds]);
  const ratio = size.width / state.width;
  return <div className="overlay-stage" ref={stageRef} style={{ width: size.width, height: size.height }}><VectorPreview state={state} clock={clock}/>{items.filter(item => visibleIds.includes(item.id)).map(item => {
    const type = item.kind === 'caption' ? 'caption' : item.type;
    const box = ['lower-third', 'shape', 'callout', 'frame'].includes(type);
    const style = { color: ['lower-third', 'shape', 'callout'].includes(type) ? '#ffffff' : item.color, fontSize: `${item.fontSize * ratio * (type === 'kinetic' ? 1.5 : 1)}px`, width: box ? `${item.width}%` : '90%', height: box ? `${item.height}%` : 'auto', background: ['lower-third', 'shape'].includes(type) ? item.color : type === 'callout' ? '#111c2c' : 'transparent', '--graphic-color': item.color, '--graphic-rule-width': `${(item.width || 40) / 100 * size.width * .6}px`, '--graphic-rule-thickness': `${4 * ratio}px`, '--graphic-rule-offset': `${item.fontSize * 1.05 * ratio}px`, borderWidth: type === 'frame' ? `${3 * ratio}px` : 0, borderColor: type === 'frame' ? item.color : 'transparent', ...(type === 'callout' ? { borderLeftWidth: `${6 * ratio}px`, borderLeftColor: item.color } : {}) };
    return <button key={item.id} ref={element => { if (element) nodes.current.set(item.id, element); else nodes.current.delete(item.id); }} className={`preview-overlay overlay-${type} ${selected?.id === item.id ? 'selected' : ''}`} style={style} data-action={`${item.kind}.select`} data-entity-id={item.id} aria-label={`${item.kind === 'caption' ? '字幕' : 'グラフィック'}: ${item.text || item.type}`} onClick={() => onSelect({ type: item.kind, id: item.id })}><span>{wrapOverlayText(item, state.width, item.kind)}</span>{type === 'kinetic' && <i className="kinetic-rule" />}</button>;
  })}</div>;
});
