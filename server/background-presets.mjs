export const backgroundPresets=[
 {id:'blue',name:'ブルー・エディトリアル',a:'#3a6495',b:'#193954',accent:'#a5d9e0',pattern:'geometry'},
 {id:'teal',name:'ティール・幾何模様',a:'#286c76',b:'#133e48',accent:'#b5e8db',pattern:'geometry'},
 {id:'paper',name:'ライト・ペーパー',a:'#e8edf3',b:'#b8c8da',accent:'#516c92',pattern:'dots'},
 {id:'sunset',name:'サンセット',a:'#e69a8d',b:'#553973',accent:'#ffe0a9',pattern:'waves'},
 {id:'midnight',name:'ミッドナイト・グリッド',a:'#252c50',b:'#111522',accent:'#839af5',pattern:'grid'},
 {id:'cream',name:'クリーム・カード',a:'#fff3dc',b:'#d9c7b0',accent:'#9a7955',pattern:'none'},
 {id:'rose',name:'ローズ・スポット',a:'#914d69',b:'#412e51',accent:'#edbfd1',pattern:'spotlight'},
 {id:'forest',name:'フォレスト',a:'#44674a',b:'#182f2e',accent:'#bfcea0',pattern:'waves'},
 {id:'slate',name:'スレート',a:'#404957',b:'#171e28',accent:'#cad2dc',pattern:'diagonal'},
 {id:'ice',name:'アイス・ドット',a:'#ecf8fa',b:'#a0cbd2',accent:'#407983',pattern:'dots'}
];
export const backgroundPatterns=[['none','なし'],['geometry','幾何模様'],['grid','グリッド'],['dots','ドット'],['waves','ウェーブ'],['diagonal','斜線'],['spotlight','スポットライト']];
export function backgroundOptions(preset,args={}){
 const p=backgroundPresets.find(p=>p.id===preset);if(!p)throw Error('背景を選択してください。');const o={a:p.a,b:p.b,accent:p.accent,pattern:p.pattern,angle:55,density:1,patternOpacity:.15,vignette:0,...args};
 for(const k of ['a','b','accent'])if(typeof o[k]!=='string'||!/^#[a-f0-9]{6}$/i.test(o[k]))throw Error('背景色は#rrggbbで指定してください。');
 if(!backgroundPatterns.some(([id])=>id===o.pattern))throw Error('背景模様が不正です。');
 for(const [k,min,max] of [['angle',-360,360],['density',.5,3],['patternOpacity',0,.8],['vignette',0,.8]])if(typeof o[k]!=='number'||!Number.isFinite(o[k])||o[k]<min||o[k]>max)throw Error(`${k}が範囲外です。`);
 return Object.fromEntries(['a','b','accent','pattern','angle','density','patternOpacity','vignette'].map(k=>[k,o[k]]));
}
export function backgroundSvg(preset,width,height,options={}){
 const p=backgroundOptions(preset,options),a=p.angle*Math.PI/180,x=Math.cos(a)/2,y=Math.sin(a)/2,step=70/p.density;let shape='';
 if(p.pattern==='geometry')shape='<path d="M790 -50 L1120 -50 L1120 620 Z M-40 560 L420 1120 L-40 1120 Z"/><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="1010" cy="20" r="240"/><circle cx="1010" cy="20" r="300"/></g>';
 if(['grid','dots','diagonal'].includes(p.pattern)){const tile=p.pattern==='dots'?'<circle cx="4" cy="4" r="2"/>':p.pattern==='grid'?`<path d="M0 ${step} V0 H${step}" fill="none" stroke="currentColor"/>`:`<path d="M-${step/2} ${step/2} L${step/2} -${step/2} M0 ${step} L${step} 0 M${step/2} ${1.5*step} L${1.5*step} ${step/2}" fill="none" stroke="currentColor"/>`;shape=`<defs><pattern id="p" width="${step}" height="${step}" patternUnits="userSpaceOnUse">${tile}</pattern></defs><rect width="1080" height="1080" fill="url(#p)"/>`;}
 if(p.pattern==='waves')shape=Array.from({length:Math.round(9*p.density)},(_,i)=>`<path d="M-100 ${650+i*30} Q250 ${300+i*30} 600 ${700+i*20} T1200 ${600+i*30}" fill="none" stroke="currentColor" stroke-width="2"/>`).join('');
 if(p.pattern==='spotlight')shape='<ellipse cx="800" cy="200" rx="540" ry="440" fill="url(#light)"/>';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1080 1080" preserveAspectRatio="none"><defs><linearGradient id="b" x1="${.5-x}" y1="${.5-y}" x2="${.5+x}" y2="${.5+y}"><stop stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/></linearGradient><radialGradient id="light"><stop stop-color="${p.accent}"/><stop offset="1" stop-color="${p.accent}" stop-opacity="0"/></radialGradient><radialGradient id="v"><stop offset=".3" stop-opacity="0"/><stop offset="1" stop-opacity="${p.vignette}"/></radialGradient></defs><rect width="1080" height="1080" fill="url(#b)"/><g fill="${p.accent}" color="${p.accent}" opacity="${p.patternOpacity}">${shape}</g><rect width="1080" height="1080" fill="url(#v)"/></svg>`;
}
