# Cutton: 直接操作・音声・キー合成

2026-09-09 実装と調査記録。

## 操作

- プログラム画面で字幕・図形・映像をドラッグして移動。右下の四角で縦横比を保って拡大縮小。上の丸で映像・グラフィックを回転。字幕の拡大縮小はフォントサイズに反映。
- Shift＋ドラッグで移動方向を固定、Shift＋回転で15度刻み。中央付近では位置を吸着、Altで解除。矢印キーで1プロジェクト画素、Shift＋矢印で10画素。Escapeでドラッグを取り消し。
- 「左右中央」「上下中央」「セーフエリア」を使用可能。枠は停止中に表示。重なったレイヤーは右のレイヤー一覧やタイムラインからも選択できる。
- ドラッグ中はローカルの表示を変更し、離した時に1回保存。Undoでドラッグ前に戻る。既存キーフレーム全体を同じ量だけ移動するため、移動軌跡を保持する。親レイヤー付き図形は親の変形を逆算する。
- 「ミキサー」からA1〜A8の音量・ステレオバランス・ミュート・ソロ・低中高域EQとマスター音量を調整。Mはミュート、Sはソロ。複数ソロ可、ミュートが優先。メーターは実際の再生信号。
- 「効果音」からウーシュ、ライザー、インパクト、クリック、チャイムを試聴・生成。長さ、基準音程、音量を設定可能。48kHz/16bitモノラルWAVを生成し、再生ヘッド位置の空き音声トラックに自動配置。取り込み後は通常の素材と同様に波形・フェード・トリム・ミックス可能。音程の聴感はプリセットによって異なる。
- 映像を上位のVトラックへ置き、詳細の「クロマキー」で背景色・許容範囲・境界の柔らかさ・緑青の色かぶり除去を設定して保存。下の映像が透けて見える。
- グラフィックのテンプレートにエディトリアル・リビール、オービット・ライン、スピーカー・カードを追加。ベクター・グラデーション・線描画・ベジェ曲線と各キーフレームを編集可能。

## Premiereの公式資料との比較

網羅的な同等実装ではなく、現在のCuttonのソースと公式機能説明を比較して今回の優先順位を決めた。

| 領域 | 今回追加した機能 | 未実装・制限 |
| --- | --- | --- |
| プログラムモニターでの配置 | 選択枠、移動、均等拡大縮小、回転、中央吸着・整列、セーフエリア、キーで微調整 | 複数選択の分布、カスタムガイド、アンカーポイント編集、自由変形は未実装。文字枠は共通レイアウトの概算 |
| トラックミキサー | 8トラック、音量、左右バランス、M/S、3帯域EQ、実信号メーター、マスター | オートメーション書き込み、サブミックス、センド、5.1、VST、マイク録音、LUFS計測は未実装 |
| 効果音 | 調整可能な5種類の内蔵合成音、試聴、WAV素材化、自動レーン選択 | Adobe Stock連携・商用音源ライブラリではない。環境音・フォーリーの収録音源は利用者が取り込む |
| キー合成 | RGB距離キー、透過境界、緑・青の色かぶり除去、複数レイヤー合成 | Ultra KeyのChoke/Soften/Contrast/Pedestalや髪の精密マット、モーショントラッキングは未実装 |
| モーショングラフィックス | 3つの編集可能な追加テンプレートと直接変形。既存の親子、マット、カーブ、リピーター、文字アニメーションを保持 | MOGRT、After Effects Dynamic Link、3Dコンポジションは未実装 |
| 編集全般 | 既存のカット・リップル削除・スリップ・プロキシ・字幕を保持 | マルチカメラ、ネストしたシーケンス、文字起こしによる編集、Lumetri相当の色管理は今後の独立した開発範囲 |

参照した一次資料：

- [Adobe: Align objects](https://helpx.adobe.com/premiere/desktop/add-text-images/align-and-distribute-objects/align-objects.html) — フレームまたは選択したオブジェクトを基準にした整列。Cuttonは単一オブジェクトのフレーム中央整列を追加。
- [Adobe: Audio Track Mixer](https://helpx.adobe.com/premiere/desktop/add-audio-effects/advanced-audio-techniques/about-audio-track-mixer.html) — トラックと最終ミックスのレベル調整。Cuttonは基本ミックスを優先。
- [Adobe: Pan or balance a stereo track](https://helpx.adobe.com/premiere/desktop/add-audio-effects/apply-audio-effects/pan-or-balance-a-stereo-track.html) — 左右への音声分配。Cuttonはステレオバランスで、中央で元の左右を保持する。
- [Adobe: Ultra Key parameters](https://helpx.adobe.com/premiere/desktop/add-video-effects/effects-and-transitions-library/ultra-key-effect-parameters.html) — マット生成、境界補正、スピル抑制の各グループ。Cuttonのキーは別アルゴリズムで、Ultra Keyの再実装ではない。
- [Adobe: Properties panel](https://helpx.adobe.com/premiere/desktop/add-text-images/stylize-text/about-properties-panel.html) — 選択対象の設定を素早く編集する構成の参考。
- [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html) — colorkey / geq / pan / bass / equalizer / treble / alimiterを使用。

## 処理・品質

- 新しい外部依存ライブラリは追加していない。動画は既存プロキシを利用し、キーはWebGLで描画。停止中は素材フレームまたは設定が変わった時だけ再アップロードする。全動画をメモリーへ展開しない。
- Web Audioで再生中の音声クリップだけを処理。メーターは80ms間隔。フェーダー更新は短いランプで音の段差を抑制。書き出しは従来のPC別スレッド上限と同時処理数を維持。
- 出力は元のメディアを使用し、プロジェクト解像度とfpsを保持。元素材のハッシュ不変をテスト。MP4は従来通りH.264/AACへ再エンコードし、無劣化の完成動画を保証するものではない。
- プレビューと書き出しのEQ・最終ピーク抑制は別のDSP（Web Audio / FFmpeg）のためビット一致しない。クロマキーは両方とも色調整前の画素で透過を判定する。既存のブラウザCSSカラーとFFmpegの色調整には差があるため、厳密な色合わせは出力を確認する。WebGL非対応環境ではキーのプレビュー不可を表示する。
- XML/OTIO/EDLはトラックEQ・クロマキーを再現しない。設定はCuttonプロジェクトJSONに保存。完成した見た目と音の受け渡しにはMP4を利用する。

## CLI / MCP

GUIと共通のディスパッチャーで `audio.track.update`、`audio.master.update`、`sfx.create` を公開。キーは `timeline.add/update` の `keyEnabled`, `keyColor`, `keySimilarity`, `keyBlend`, `keySpill`。直接変形は `timeline.update`, `caption.update`, `graphics.update` を利用する。

例の引数：`audio.track.update` → `{"lane":0,"volumeDb":-6,"balance":0.25,"lowDb":2,"mute":false,"solo":true}`。`sfx.create` → `{"preset":"whoosh","duration":1.2,"frequency":440,"levelDb":-12,"start":3}`。

## 確認

専用の一時プロジェクトで、親子付きキーフレーム移動とUndo、テンプレート検証、効果音の決定性・波形上限、ミキサーの保存・再起動・切り替えを確認。FFmpegの実出力で左右分離、ソロ・ミュート、EQ減衰、緑背景の除去と赤い被写体の保持、元素材のハッシュ不変を確認。ユーザーの既存素材・配置は変更しない。

ブラウザでのマウス操作・視覚比較テストはこの更新では実施していない。
