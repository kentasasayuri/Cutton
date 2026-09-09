# Cutton の実装状況（2026-09-09）

Sitesには編集UIを配置し、素材・プロジェクトはPCの編集エンジンに保存します。CLI、MCP、WebMCP、UIは同じコマンドを実行します。別PCではそのPCのエンジンに接続します。クラウドへのプロジェクト同期は未実装です。

## 動作する機能

| 分野 | 実装 |
|---|---|
| プロジェクト | 一覧、新規、切り替え、複製、名前、解像度・fps、バンドル保存・復元 |
| 素材 | 動画・音声・静止画、サムネイル、音声波形、シーン分類、採否ログ、原本ハッシュ |
| タイムライン | 映像8・音声8レーン、トリム、分割、移動、スナップ（Shiftで解除）、リップル削除、空白詰め、CLIスリップ、マーカー |
| 編集履歴 | 最大50段階・履歴8MiB以内のUndo/Redo。素材操作・プロジェクト切替・生成等の境界では履歴をリセット |
| リタイム・音声 | 0.25〜4倍速、独立音声レーン、ミュート、音量、フェード、複数音声のミックス |
| 映像 | 位置、拡大率、回転、不透明度、明るさ、コントラスト、彩度、ぼかし、フェード。重なったレーンでディゾルブを作成可能 |
| 字幕 | テキスト、時間、位置、サイズ、色、SRT、MP4への焼き込み |
| モーション | 既存6テンプレート＋ベクター、テキスト・長方形・楕円・線、グラデーション、線幅、角丸、シャドウ、グロー、字間・太さ |
| アニメーション | 位置・拡大・回転・不透明度、リニア・イーズ・ベジェ・ホールド、カーブ表示、親／ヌル、矩形・楕円マスク、アルファマット、ループ／往復、正弦波の揺れ |
| 書き出し | H.264/AAC MP4、原本付きCutton ZIP、FCPXML 1.10。単純なカットはFCP7 XML／OTIO／EDLも対応 |
| 生成 | ComfyUI APIワークフロー、独立した映像・音声素材の管理。Codex App Serverによる編集計画・台本 |
| Google Vids | Codexの認証済みブラウザで日本語音声生成を実証。ダウンロードしたMP4から圧縮音声を無変換抽出・取り込み |

## 今回の参考動画と画面確認

YouTube CLIでメタデータと指定時刻の画像を取得しました。動画全編の確認ではありません。画像はローカルの `output/reference-frames` に保存しています。第三者の解説画像はSiteに転載しません。

| 動画 | 確認時刻／着目点 |
|---|---|
| https://www.youtube.com/watch?v=hVYihOrgMRw | 38:30、1:29:30。マグネティック編集、波形、タイトル、カラーのパネル構成 |
| https://www.youtube.com/watch?v=znE65yc2LsQ | 9:00。トランジションブラウザとタイムライン |
| https://www.youtube.com/watch?v=E-398iJNY4Y | 50:00。効果・トランジションの配置 |
| https://www.youtube.com/watch?v=utmr_xRqIHw | 4:30。Ken Burnsの開始・終了範囲 |
| https://www.youtube.com/watch?v=Tk13YoXr2S4 | 3:00、10:00。マグネティックマスクと追従効果 |
| https://www.youtube.com/watch?v=P1Ta4AJrpz4 | 35:00、2:25:00。アニメーション・マット |
| https://www.youtube.com/watch?v=zxM1wqaNGM8 | 9:45、16:15、21:50。変形キー、親子関係、レイヤー合成 |

## 未実装・検証の限界

Final Cut Pro／After Effectsとの全面互換や同等品質を達成した版ではありません。以下は未実装です。

- 自動マグネティック接続、ロール／リップルトリム、マルチカム、複合クリップのネスト、ビデオのKen Burns、逆再生・速度ランプ。
- AI追従マスク、ロトブラシ、自動トラッキング、手ぶれ補正、クロマキー、パペット、3Dカメラ／ライト／3Dモデル、パーティクル、任意のAE式・プラグイン。
- HDR／広色域／カラーマネジメント、スコープ、LUT、プロ向けオーディオエフェクト。現在の完成MP4はSDR・8bit。
- CuttonのボタンだけでGoogle Vidsを無人実行する機能。Vidsにはこの実装が利用できる公開ナレーション生成APIを確認できていません。Codexブラウザ操作が必要です。
- Final Cut Pro／Premiere／Resolve本体での読み込み検証。FCPXMLはDTDに沿った交換形式であり、エフェクトの完全移行ではありません。
- 実際の低スペックPCでの長時間・大規模案件のベンチマーク。低解像度プロキシ、可視範囲のタイムライン描画、波形キャッシュ、区間単位の合成、FFmpegスレッド制限を実装しましたが、処理速度は実測機材に依存します。

WebMCPの登録、正常入力による保存・読戻し、不正入力の拒否を検証済みです。FCPXMLはAppleの1.10 DTDによる検証を通過しました。

ベクターのプレビューと書き出しは同じSVG定義を使います。書き出しはCPUで順次描画します。ブラウザとResvgのフォント・フィルタ描画には差が出る場合があります。原本のハッシュ一致は画質評価を意味しません。

## CLI例

PowerShellではJSON引数をファイルに保存し、`--file` を使うと引用符の問題を避けられます。

```powershell
cutton state
cutton commands
cutton project.list
cutton project.new --file project.json
cutton project.switch --file project-id.json
cutton timeline.update --file clip.json
cutton edit.undo
cutton export.create --file export.json
```

`clip.json` の例：`{"id":"取得したクリップID","lane":1,"scale":0.6,"x":70,"y":60,"fadeIn":0.5}`。
`export.json` の例：`{"format":"fcpmodern"}` または `{"format":"render"}`。

FCPXMLの参照仕様：[Apple FCPXML DTD](https://developer.apple.com/documentation/professional-video-applications/document-type-definition)。
