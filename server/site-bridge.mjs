import { randomBytes, timingSafeEqual } from 'node:crypto';

// Only the configured public UI origin may pair with this local engine.
export const HOSTED_UI_ORIGIN = process.env.CUTTON_UI_ORIGIN || 'https://kentasasayuri.github.io';
// A document navigation serves only the public editor shell, never project data.
export const isEditorNavigation = req => req.method === 'GET'
  && ['/', '/index.html'].includes(req.path)
  && req.get('sec-fetch-mode') === 'navigate'
  && req.get('sec-fetch-dest') === 'document';
export function createSiteBridge(fallback, { origin = HOSTED_UI_ORIGIN } = {}) {
  const sessions = new Map();
  const same = (a,b) => typeof a === 'string' && /^[a-f0-9]{64}$/.test(a) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
  return (req,res,next) => {
    if(isEditorNavigation(req))return fallback(req,res,next);
    const caller=req.get('origin');
    const token=req.get('authorization')?.replace(/^Bearer /,'') || req.query.access_token;
    const mediaRequest=req.method==='GET' && /^\/(media|thumbnail|proxy)\/|^\/api\/(download|events)$/.test(req.path);
    if(caller!==origin && !(mediaRequest && token)) return fallback(req,res,next);
    const host=req.get('host');let target;
    try{target=new URL('http://'+host);}catch{return res.status(403).json({error:'接続先が不正です。'});}
    if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.status(403).json({error:'編集エンジンはローカル接続専用です。'});
    if(caller && caller!==origin) return res.status(403).json({error:'このサイトからの接続は許可されていません。'});
    if(caller===origin) res.set({'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET,HEAD,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization,Range','Access-Control-Expose-Headers':'Content-Range,Content-Length,Accept-Ranges','Access-Control-Allow-Private-Network':'true'});
    for(const [key,expires] of sessions)if(expires<Date.now())sessions.delete(key);
    if(req.method==='OPTIONS')return res.status(204).end();
    if(req.path==='/api/pair' && req.method==='POST' && caller===origin){
      if(sessions.size>=32)return res.status(429).json({error:'接続数の上限です。不要なCuttonタブを閉じてください。'});
      const key=randomBytes(32).toString('hex');sessions.set(key,Date.now()+12*60*60*1000);
      return res.set('Cache-Control','no-store').json({token:key,expiresIn:43200});
    }
    if(typeof token!=='string'||![...sessions.keys()].some(key=>same(token,key)))return res.status(401).json({error:'編集エンジンに再接続してください。'});
    res.locals.hostedUiBridge=true;
    next();
  };
}
