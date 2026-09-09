import {evaluateOverlayTransform,wrapOverlayText} from './overlays.mjs';
const esc=value=>String(value??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const identifier=value=>'v'+Array.from(String(value)).map(c=>c.codePointAt(0).toString(16)).join('_');
export function vectorTransform(item,time,items,depth=0){
  const t=evaluateOverlayTransform(item,time-item.start);
  if(item.repeat==='loop'&&item.keyframes?.length>1){const end=item.keyframes.at(-1).time;if(end>0)Object.assign(t,evaluateOverlayTransform(item,(time-item.start)%end));}
  if(item.repeat==='pingpong'&&item.keyframes?.length>1){const end=item.keyframes.at(-1).time;if(end>0){const p=(time-item.start)%(end*2);Object.assign(t,evaluateOverlayTransform(item,p<=end?p:2*end-p));}}
  if(item.wiggle>0){const q=time-item.start;t.x+=Math.sin(q*6.28318*(item.frequency||1))*item.wiggle;t.y+=Math.sin(q*8.317*(item.frequency||1)+.8)*item.wiggle;}
  const parent=items.find(g=>g.id===item.parentId);
  if(parent&&depth<16){const p=vectorTransform(parent,time,items,depth+1),angle=p.rotation*Math.PI/180,dx=(t.x-50)*p.scale,dy=(t.y-50)*p.scale;return {...t,x:p.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:p.y+dx*Math.sin(angle)+dy*Math.cos(angle),scale:t.scale*p.scale,rotation:t.rotation+p.rotation,opacity:t.opacity*p.opacity};}
  return t;
}
export function vectorSvg(state,time,{onlyId}={}){
  const items=(state.graphics||[]).filter(i=>['vector','null'].includes(i.type));
  const {width:w,height:h}=state;
  const body=(item,matte=false)=>{
    if(item.type==='null')return '';
    const t=vectorTransform(item,time,items),id=identifier(item.id),bw=w*item.width/100,bh=h*item.height/100;
    const fill=matte?'#fff':item.gradient?`url(#${id}gradient)`:item.color;
    const points=Array.from({length:(item.sides||5)*(item.shape==='star'?2:1)},(_,i)=>{const count=(item.sides||5)*(item.shape==='star'?2:1),a=i/count*Math.PI*2-Math.PI/2,r=item.shape==='star'&&i%2?(item.innerRadius||45)/100:1;return [Math.cos(a)*bw/2*r,Math.sin(a)*bh/2*r];});
    const geometry=['polygon','star'].includes(item.shape)?`<polygon points="${points.map(p=>p.join(',')).join(' ')}"/>`:item.shape==='ellipse'?`<ellipse rx="${bw/2}" ry="${bh/2}"/>`:item.shape==='line'?`<path d="M ${-bw/2} 0 L ${bw/2} 0" fill="none"/>`:`<rect x="${-bw/2}" y="${-bh/2}" width="${bw}" height="${bh}" rx="${item.radius||0}"/>`;
    const lines=wrapOverlayText({...item,type:'shape'},w,'graphics').split('\n');
    const text=lines.map((line,i)=>`<text x="0" y="${(i-(lines.length-1)/2)*item.fontSize*1.25+item.fontSize*.36}" text-anchor="middle" font-family="Meiryo, sans-serif" font-weight="${item.fontWeight||700}" font-size="${item.fontSize}" letter-spacing="${item.tracking||0}" fill="${matte?'#fff':item.textColor||'#fff'}">${esc(line)}</text>`).join('');
    const shape=item.shape==='text'?'':geometry;
    const source=items.find(i=>i.id===item.matteId),mask=source&&!matte?` mask="url(#${id}matte)"`:'';
    const clip=item.mask==='ellipse'?`<ellipse rx="${bw/2}" ry="${bh/2}"/>`:`<rect x="${-bw/2}" y="${-bh/2}" width="${bw}" height="${bh}"/>`;
    const length=item.shape==='line'?bw:item.shape==='ellipse'?Math.PI*(3*(bw+bh)/2-Math.sqrt((3*bw+bh)*(bw+3*bh))/2):['polygon','star'].includes(item.shape)?points.reduce((n,p,i)=>n+Math.hypot(p[0]-points[(i+1)%points.length][0],p[1]-points[(i+1)%points.length][1]),0):2*(bw+bh);
    const progress=Math.max(0,Math.min(1,(time-item.start)/item.duration)),fraction=((item.strokeEnd??100)-(item.strokeStart??0))/100*(item.strokeAnimation==='draw'?progress:item.strokeAnimation==='erase'?1-progress:1);
    const strokeTrim=(item.strokeStart||item.strokeEnd<100||item.strokeAnimation&&item.strokeAnimation!=='none')?` stroke-dasharray="${length*fraction} ${length}" stroke-dashoffset="${-length*(item.strokeStart||0)/100}"`:'';
    const content=`<g transform="translate(${t.x*w/100} ${t.y*h/100}) rotate(${t.rotation}) scale(${t.scale})" opacity="${Math.max(0,Math.min(1,t.opacity))}"${!matte&&(item.shadow||item.glow)?` filter="url(#${id}fx)"`:''}><g${item.mask!=='none'?` clip-path="url(#${id}clip)"`:''} fill="${fill}" stroke="${matte?'#fff':item.strokeColor||item.color}" stroke-width="${item.stroke||0}"><g fill-opacity="${item.fillOpacity??1}"${strokeTrim}>${shape}</g><g stroke="none">${text}</g></g></g>`;
    if(matte)return content;
    return `<defs><linearGradient id="${id}gradient" x1="${.5-Math.cos((item.gradientAngle??45)*Math.PI/180)/2}" y1="${.5-Math.sin((item.gradientAngle??45)*Math.PI/180)/2}" x2="${.5+Math.cos((item.gradientAngle??45)*Math.PI/180)/2}" y2="${.5+Math.sin((item.gradientAngle??45)*Math.PI/180)/2}"><stop stop-color="${item.color}"/><stop offset="1" stop-color="${item.gradientColor||'#000000'}"/></linearGradient><clipPath id="${id}clip">${clip}</clipPath><filter id="${id}fx" x="-100%" y="-100%" width="300%" height="300%">${item.glow?`<feGaussianBlur in="SourceGraphic" stdDeviation="${item.glow}" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>`:''}${item.shadow?`<feDropShadow dx="0" dy="${item.shadow}" stdDeviation="${item.shadow}" flood-opacity=".65"/>`:''}</filter>${source?`<mask id="${id}matte" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" style="mask-type:alpha">${time>=source.start&&time<source.start+source.duration?body(source,true):''}</mask>`:''}</defs><g${mask}>${Array.from({length:item.copies||1},(_,i)=>`<g transform="translate(${i*(item.copyX??5)*w/100} ${i*(item.copyY||0)*h/100}) rotate(${i*(item.copyRotation||0)} ${t.x*w/100} ${t.y*h/100})" opacity="${Math.pow(item.copyOpacity??1,i)}">${content}</g>`).join('')}</g>`;
  };
  const matteIds=new Set(items.map(i=>i.matteId).filter(Boolean));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${items.filter(i=>time>=i.start&&time<i.start+i.duration&&(!onlyId||i.id===onlyId)&&!matteIds.has(i.id)).map(i=>body(i)).join('')}</svg>`;
}
export function validateVectorLinks(items){
  for(const item of items){
    for(const key of ['parentId','matteId']){
      if(!item[key])continue;const seen=new Set([item.id]);let current=item;
      while(current?.[key]){if(seen.has(current[key]))throw new Error(`${key}: 循環参照は使えません。`);seen.add(current[key]);current=items.find(i=>i.id===current[key]);if(!current||!['vector','null'].includes(current.type))throw new Error(`${key}: レイヤーが見つかりません。`);}
    }
  }
}
