import {pathToFileURL} from 'node:url';
const xml=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
// FCPXML 1.10. A gap backbone keeps every connected lane and gap at exact times.
// Complex effects stay in Cutton's sidecar, rather than being silently flattened.
export function toFcpxml(state,resolvePath=a=>pathToFileURL(a.path).href){
  const t=s=>`${Math.round(s*state.fps)}/${state.fps}s`;
  const total=Math.max(0,...[...state.clips,...(state.graphics||[]),...(state.captions||[])].map(c=>c.start+c.duration));
  const resources=state.assets.map((a,i)=>`<asset id="r${i+2}" name="${xml(a.name)}" start="0s" duration="${t(Math.max(a.duration||0,...state.clips.filter(c=>c.assetId===a.id).map(c=>c.in+c.duration*(c.speed||1))))}" hasVideo="${a.kind!=='audio'?1:0}" hasAudio="${a.kind==='audio'||a.hasAudio?1:0}"${a.kind!=='audio'?' format="r1"':''}${a.kind==='audio'||a.hasAudio?' audioSources="1" audioChannels="2" audioRate="48000"':''}><media-rep kind="original-media" src="${xml(resolvePath(a))}"/></asset>`).join('');
  const clips=[...state.clips].sort((a,b)=>a.start-b.start).map(c=>{
    const index=state.assets.findIndex(a=>a.id===c.assetId);if(index<0)throw new Error('Missing asset');
    const speed=c.speed||1,retime=speed!==1?`<timeMap><timept time="0s" value="${t(c.in)}" interp="linear"/><timept time="${t(c.duration)}" value="${t(c.in+c.duration*speed)}" interp="linear"/></timeMap>`:'';
    const transform=c.track==='video'?`<adjust-conform type="fit"/><adjust-transform position="${((c.x??50)-50)*state.width/state.height} ${50-(c.y??50)}" scale="${c.scale??1} ${c.scale??1}" rotation="${-(c.rotation||0)}"/><adjust-blend amount="${c.opacity??1}"/>`:'';
    const volume=c.track==='audio'?`<adjust-volume amount="${c.gain>0?20*Math.log10(c.gain):-96}dB"/>`:'';
    return `<asset-clip ref="r${index+2}" name="${xml(state.assets[index].name)}" offset="${t(c.start)}" start="${speed===1?t(c.in):'0s'}" duration="${t(c.duration)}" lane="${(c.track==='audio'?-1:1)*((c.lane||0)+1)}" enabled="${c.muted?0:1}" srcEnable="${c.track}"${c.track==='video'?' format="r1"':''}>${retime}${transform}${volume}</asset-clip>`;
  }).join('');
  const markers=(state.markers||[]).filter(m=>m.time<total).map(m=>`<marker start="${t(m.time)}" duration="${t(1/state.fps)}" value="${xml(m.name)}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.10"><resources><format id="r1" name="Cutton" frameDuration="1/${state.fps}s" width="${state.width}" height="${state.height}" colorSpace="1-1-1 (Rec. 709)"/>${resources}</resources><library><event name="Cutton"><project name="${xml(state.name)}"><sequence format="r1" duration="${t(total)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k"><spine><gap name="Cutton timeline" offset="0s" start="0s" duration="${t(total)}">${clips}${markers}</gap></spine></sequence></project></event></library></fcpxml>`;
}
