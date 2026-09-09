export const FONT_ARTICLE='https://note.com/roja3_/n/n2adf4864590d';
export const BUNDLED_FONTS=[
 {family:'Source Han Sans JP',label:'源ノ角ゴシック',group:'ゴシック',files:['SourceHanSansJP-Regular.otf','SourceHanSansJP-Bold.otf'],weights:[400,700]},
 {family:'Source Han Serif JP',label:'源ノ明朝 JP',group:'明朝',files:['SourceHanSerifJP-Regular.otf','SourceHanSerifJP-Bold.otf'],weights:[400,700]},
 {family:'Zen Maru Gothic',label:'Zen Maru Gothic',group:'ゴシック',files:['ZenMaruGothic-Regular.ttf','ZenMaruGothic-Bold.ttf'],weights:[400,700]},
 {family:'Kaisei Decol',label:'Kaisei Decol',group:'デザイン',files:['KaiseiDecol-Regular.ttf','KaiseiDecol-Bold.ttf'],weights:[400,700]},
 {family:'Reggae One',label:'Reggae One',group:'デザイン',files:['ReggaeOne-Regular.ttf'],weights:[400]},
];
export const ARTICLE_FONTS=[...BUNDLED_FONTS,...[
 ['凸版文久見出しゴシック Std','ゴシック'],['コーポレート・ロゴ ver2','ゴシック'],['M+A1','ゴシック'],['モッチーポップ','ゴシック'],['ラノベPOP V2','ゴシック'],['あかずきんポップ','ゴシック'],['平成丸ゴシック Std','ゴシック'],['Sicマカロン','ゴシック'],
 ['凸版文久見出し明朝 Std','明朝'],['FOT-マティス ProN','明朝'],['A-OTF リュウミン Pr6N','明朝'],['あおさぎ','明朝'],['装甲明朝','明朝'],
 ['玉ねぎ楷書「激」','筆文字'],['AB-ジャングルコック-01','筆文字'],['りいてがき筆','筆文字'],['TA-おおにし','筆文字'],['AB-我逢人','筆文字'],['AB-玲月さわやか','筆文字'],['AB-玲月やわらか','筆文字'],
 ['FOT-キアロ Std','デザイン'],['ABキリギリス','デザイン'],['零ゴシック','デザイン'],['異世明','デザイン'],['異世ゴ','デザイン'],['ボトムズ','デザイン'],['源界明朝','デザイン'],['851チカラヨワク','デザイン'],['ふぉんとうは怖い明朝体','デザイン'],['怪盗予告ゴシック','デザイン']
].map(([label,group])=>({family:label,label,group,files:[]}))];
export const validFontFamily=value=>typeof value==='string'&&value.length>0&&value.length<=100&&!/[<>"'\\;{}\r\n\x00-\x1f]/.test(value);
