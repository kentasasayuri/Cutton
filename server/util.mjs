import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename, realpath } from 'node:fs/promises';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'AppError'; this.status = status; }
}
export const uid = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
export const now = () => new Date().toISOString();
export function object(value, label = 'args') {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new AppError(`${label} はオブジェクトで指定してください。`);
  return value;
}
export function textValue(value, label, { max = 10000, empty = false, fallback } = {}) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) throw new AppError(`${label} は${empty ? '文字列' : '空ではない文字列'}（${max}文字以内）で指定してください。`);
  return value.trim();
}
export function numberValue(value, label, { min = 0, max = 86400, fallback } = {}) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new AppError(`${label} は ${min}〜${max} の数値で指定してください。`);
  return value;
}
export function choice(value, choices, label, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!choices.includes(value)) throw new AppError(`${label} は ${choices.join(' / ')} で指定してください。`);
  return value;
}
export function booleanValue(value, label) {
  if (typeof value !== 'boolean') throw new AppError(`${label} は true / false で指定してください。`);
  return value;
}
export function requireItem(items, id, label) {
  textValue(id, `${label} ID`, { max: 100 });
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new AppError(`${label}が見つかりません: ${id}`, 404);
  return item;
}
export function sceneIdValue(state, sceneId) {
  if (sceneId === null || sceneId === undefined || sceneId === '') return null;
  return requireItem(state.storyboard, sceneId, 'シーン').id;
}
export function isWithin(directory, target) {
  const relative = path.relative(path.resolve(directory), path.resolve(target));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export async function confinedFile(directory, input) {
  if (typeof input !== 'string' || !input || input.includes('\0')) throw new AppError('ファイルパスが不正です。');
  const target = path.resolve(directory, input);
  if (!isWithin(directory, target)) throw new AppError('この場所のファイルにはアクセスできません。', 403);
  let resolved;
  try { resolved = await realpath(target); } catch { throw new AppError('ファイルが見つかりません。', 404); }
  if (!isWithin(await realpath(directory), resolved)) throw new AppError('この場所のファイルにはアクセスできません。', 403);
  return resolved;
}
export async function atomicJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  // Windows readers and virus scanners can briefly hold a replace-denying handle.
  // Keep the existing project intact and retry the same atomic replacement.
  for(let attempt=0;;attempt++){
    try{await rename(temporary,filePath);break;}
    catch(error){if(process.platform!=='win32'||!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=5)throw error;await new Promise(resolve=>setTimeout(resolve,25*2**attempt));}
  }
}
export function safeFilename(name, fallback = 'media') {
  return (String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 160) || fallback);
}
export const seconds = (value) => Math.round(value * 1000000) / 1000000;
