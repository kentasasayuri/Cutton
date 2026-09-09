// Catalog observed in the user's Google Vids editor on 2026-09-09.
export const VIDS_VOICES=[['Nyla','ソフト・高音'],['Elio','親しみやすい・中低音'],['Knox','滑らか・低音'],['Jett','かすれ・低音'],['Zeno','しっかり・中低音'],['Tova','さわやか・中音'],['Kaci','明るい・中音'],['Lani','おおらか・中音'],['Holt','聞き取りやすい・低音'],['Lora','滑らか・中音'],['Paz','ささやくような声・低音'],['Tyra','クリア・中音'],['Kero','興奮・中低音'],['Saro','落ち着き・中音'],['Nyx','クリア・中低音'],['Lito','しっかり・中音'],['Peli','陽気・高音'],['Fira','若々しい・高音'],['Cale','しっかり・中低音'],['Neo','陽気・中音'],['Vira','前向き・中音'],['Iro','聞き取りやすい・中音'],['Dori','元気・低音'],['Umi','聡明・中音'],['Jacy','冷静・中低音'],['Fola','温かい・中音'],['Baya','気さく・中低音'],['Orla','優しい・中音'],['Sani','明るい・高音'],['Yori','カジュアル・中低音']];
export const VIDS_AVATARS=[...['オリバー','エレナ','リヴァイ','フィンレイ','リアム','ミア','ジャック','チャーリー','セバスチャン','ソフィア','ジャマル','ジャスティス','モーガン'].map(name=>({id:'real:'+name,name,category:'リアル'})),...['エイヴリー','ベンジャミン','エブリン','スカーレット','セオドア','ウィノア','ヘンリー','ハーパー','レイノルド'].map(name=>({id:'3d:'+name,name,category:'3D アニメ'})),...['アメリア','リアム','ラックス','リバー','スミス','エリヤ','ジョセフ','マーティン'].map(name=>({id:'2d:'+name,name,category:'2D アニメ'}))];
export const DELIVERY=[['natural','自然',''],['whisper','ささやき','whispers'],['amused','楽しそうに','amusement'],['excited','わくわく','excitement'],['curious','好奇心','curiosity'],['slow','ゆっくり','slow'],['fast','早口','fast']];
export const VOCALIZATIONS=[['none','なし',''],['laugh','笑い','laughs'],['sigh','ため息','sigh'],['gasp','息をのむ','gasp']];
export function voiceDirection(args={}){
 const voiceName=args.voiceName||'Nyla',avatarId=args.avatarId||'',delivery=args.delivery||'natural',vocalization=args.vocalization||'none';
 if(!VIDS_VOICES.some(v=>v[0]===voiceName))throw new Error('Vidsの声を選択してください。');
 const avatar=VIDS_AVATARS.find(a=>a.id===avatarId);if(avatarId&&!avatar)throw new Error('Vidsの人物を選択してください。');
 const style=DELIVERY.find(v=>v[0]===delivery),sound=VOCALIZATIONS.find(v=>v[0]===vocalization);if(!style||!sound)throw new Error('声の演技設定が不正です。');
 const direction=String(args.direction||'');if(direction.length>2000)throw new Error('演技指示は2000文字以内です。');
 return {voiceName,avatarId,avatar:avatar||null,delivery,vocalization,direction,stylePrompt:[`声: ${voiceName}`,avatar?`人物: ${avatar.category} / ${avatar.name}`:'声のみ',`読み方: ${style[1]}`,`声の動作: ${sound[1]}`,direction].filter(Boolean).join('\n')};
}
export function prepareVidsScript(script,args={}){
 const profile=voiceDirection(args),style=DELIVERY.find(v=>v[0]===profile.delivery),sound=VOCALIZATIONS.find(v=>v[0]===profile.vocalization);
 const taggedScript=`${style[2]?'['+style[2]+'] ':''}${script}${sound[2]?' ['+sound[2]+']':''}`;
 if(taggedScript.length>2500)throw new Error('音声タグ込みで2500文字以内に分けてください。');
 return {...profile,taggedScript,instructions:[profile.avatar?`Vidsのアバターから「${profile.avatar.category} / ${profile.avatar.name}」を選ぶ。アバター固有の声を使用。`:`Vidsのナレーションで声「${profile.voiceName}」を選ぶ。`,'音声タグ付き台本を貼り付ける。追加の演技指示は「音声タグを適用」やタグメニューで反映し、プレビューで確認する。','Vidsで生成したMP4または音声をダウンロードし、Cuttonへ取り込む。']};
}
