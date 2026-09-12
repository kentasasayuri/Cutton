# Resolve・Premiere 公式資料とCuttonへの反映

調査日: 2026-09-12。メーカーの機能紹介・操作マニュアルを参照し、名称だけでなく時間、素材範囲、下位レイヤー、音量への作用を比較した。以下はCutton独自の実装であり、両製品の完全互換や全機能の再現を意味しない。

|分野|公式資料で確認した操作|今回のCuttonへの反映|操作場所・範囲|
|---|---|---|---|
|トリム|Rollは編集点両側の尺を交換、Slideは対象を移動して前後を調整|ロール・リップル・スライド・スリップの整数フレーム調整。素材範囲を超える変更は保存せず拒否|タイムライン「精密編集・レイヤー」。リップルは選択トラックのみ|
|配置|Insert / Overwrite / Place on Topは異なる時間・レイヤー操作|挿入は全クリップを分割・後方移動、字幕・図形・マーカーも追従。上書きは指定トラックを切り替え、かぶせは上位の空きトラックへ|「挿入・上書き・かぶせ」。素材の開始・使用尺・配置先を指定|
|同期|開始・終了に加え、マーカーや共通音声で合わせる|2つのクリップ内時刻を合わせる操作。音声包絡線の相互相関による候補表示、低確度候補の適用抑止、編集後の候補失効|「同期・クロスフェード」。先頭60秒、20ms刻み、±30秒まで。配置はプロジェクトフレームに丸める|
|複数要素|関連する要素を相対関係を保って調整|複数選択ドラッグ、±1/10フレーム移動、従来の開始・終了・再生位置合わせ|Ctrl＋クリックで選択。衝突した場合は全操作を取り消す|
|合成|PremiereのBlend Modes、Fusionの前景／背景Merge|通常・スクリーン・乗算・オーバーレイ・差の絶対値・比較明／暗。透明度とマスクを考慮して下の映像と合成|映像クリップの「重ね合わせ・VFXマスク」。GUI試聴とFFmpeg出力に接続|
|マスク|形状、feather、inversionで表示領域を調整|長方形／楕円、中心、幅・高さ、ぼかし、反転。クロマキー・トリミングと併用|静的な形状マスク。被写体追跡・自由曲線ロトスコープは未実装|
|音響|FairlightのEQ・Dynamics、Premiereの音声トランジション|コンプレッサーのしきい値・比率・ニー・アタック・リリース・補正ゲイン、会話／穏やか／効果音プリセット、等電力クロスフェード|ミキサー各Aトラック。既存EQと併用。ブラウザとFFmpegの圧縮器はアルゴリズムが異なる|
|モーション|Fusionの曲線、reverse／stretch、Premiereの入退場保護|8つの複数レイヤー構成、ベジェの反転、順次表示、入退場を保つ尺変更、ベクターの前後順変更|グラフィックの構成ライブラリとタイムラインの一括調整|
|マージ|素材をまとめる操作と画像の合成は別の役割|同素材・同設定・連続ソース範囲のカット結合。映像の合成は上記Merge相当のレイヤー合成|異種素材のネスト／Compound Clipとは異なる。内部のフェードがある場合は結合しない|

## 参照した一次資料

- [Blackmagic Design: Edit](https://www.blackmagicdesign.com/products/davinciresolve/edit) — 編集方法、素材のIn/Out、トリム、重ね合わせ、調整クリップの役割。
- [Blackmagic Design: Fusion](https://www.blackmagicdesign.com/products/davinciresolve/fusion) — Mergeの前景／背景、スプライン、曲線の逆転・伸縮、マスクと3D機能の範囲。
- [Blackmagic Design: Fairlight](https://www.blackmagicdesign.com/products/davinciresolve/fairlight) — トラックミキサー、EQ、ダイナミクス、音声オートメーション。
- [Adobe: Rolling edits](https://helpx.adobe.com/premiere/desktop/edit-projects/trim-clips/perform-rolling-edits.html) — 全体尺を維持した編集点移動。
- [Adobe: Slide edits](https://helpx.adobe.com/au/premiere/desktop/edit-projects/trim-clips/perform-slide-edits.html) — 前後の尺を調整しながら中央クリップを移動。
- [Adobe: Synchronize clips](https://helpx.adobe.com/premiere/desktop/add-audio-effects/basic-audio-editing/synchronize-clips-in-the-timeline-panel.html) — クリップ内基準点、タイムコード、音声チャンネルによる同期。
- [Adobe: Blend mode options](https://helpx.adobe.com/premiere/desktop/add-video-effects/work-with-composites/blend-mode-options.html) — 色チャンネル単位の演算と下位レイヤーとの関係。
- [Adobe: Refine and combine masks](https://helpx.adobe.com/uk/premiere/desktop/add-video-effects/work-with-masks/refining-and-combining-masks.html) — 境界、透明度、拡張、反転の役割。
- [Adobe: Audio crossfade transitions](https://helpx.adobe.com/premiere/desktop/add-audio-effects/apply-audio-transitions/audio-crossfade-transitions.html) — Constant Gain / Constant Power / Exponential Fadeの違い。
- [Adobe: Preserve intro and outro](https://helpx.adobe.com/premiere/desktop/add-text-images/insert-images-and-graphics/preserve-intro-outro-animations-while-creating-responsive-design-graphics.html) — 尺変更時の導入・終了アニメーションの保護。
- [Adobe: Keyframe interpolation](https://helpx.adobe.com/premiere/desktop/add-video-effects/control-effects-and-transitions-using-keyframes/control-effect-changes-using-keyframe-interpolation.html) — 直線・曲線補間による時間変化。

## 検証と制約

全編集は共通のコマンド経由でGUI・CLI・MCPから利用できる。変更は一度に保存され、失敗時は元の状態を維持する。素材を再圧縮するトリムやマージではなく、元のソース参照を編集する。

映像は区間ごとの既存レンダラーを拡張し、同時刻に必要なレイヤーだけを処理する。マスクは書き出し前にラスタライズして利用する。音声解析は1素材ずつ、最長60秒のモノラル音声に制限してメモリを抑える。書き出し解像度と品質設定は維持する。

ネストされたタイムライン、Fusion互換ノードグラフ、3D空間・パーティクル、被写体追跡、サブミックスバス、VST/OpenFXプラグイン互換、調整レイヤー、HDRカラーマネジメント、マルチカムは今回の実装範囲に含まない。入退場保護はキーフレームを対象とし、ホールド補間の逆再生は誤った動きを保存しないため拒否する。ベクターの前後順はベクターレイヤー同士に作用し、字幕・旧形式グラフィックの合成順は従来どおり。

Crossfadeは未使用のソース音声を前後に引き出し、隣接クリップを別Aトラックに配置する。空きトラックのミキサーが異なると音色が変わるため、同じ設定の空きトラックのみ利用する。音声と映像のタイムコードメタデータを読んだ自動同期、速度やドリフトの自動補正は行わない。

## コマンド例

```json
{"command":"timeline.trim","args":{"id":"clip_id","mode":"roll","edge":"out","frames":1}}
{"command":"timeline.place","args":{"assetId":"asset_id","mode":"overwrite","track":"video","lane":0,"start":10,"in":3,"duration":4}}
{"command":"timeline.layers","args":{"ids":["clip_id"],"action":"up"}}
{"command":"timeline.merge","args":{"ids":["left_id","right_id"]}}
{"command":"audio.syncAnalyze","args":{"referenceId":"ref_id","targetId":"target_id","maxShift":10}}
{"command":"audio.crossfade","args":{"leftId":"left_id","rightId":"right_id","duration":0.4}}
{"command":"graphics.compose","args":{"preset":"chapter","title":"新しい章","subtitle":"ポイントを伝える","duration":6}}
{"command":"graphics.batch","args":{"ids":["graphic_id"],"action":"duration","duration":10,"protect":0.5}}
```
