# Cutton

GitHub Pagesの公開UIと、PC上で動くローカル編集エンジンを組み合わせた構成です。最新の対応範囲・未実装機能は [機能一覧](docs/FEATURES.md)、実証済みのVids操作は [Vids連携](docs/GOOGLE-VIDS.md) を参照してください。

個人用のローカル動画編集アプリ。編集点を先に計画し、ストーリーボード・素材・映像／音声トラックを一つのプロジェクトで管理します。UI、CLI、MCP、WebMCPは同じコマンド処理を使用します。

## 起動

公開UI: https://kentasasayuri.github.io/Cutton/ 。閲覧とローカル編集にOpenAIアカウントは不要です。「Cuttonを起動」、またはデスクトップの「Cutton」から開きます。エンジンの準備後、新規／既存プロジェクトの選択画面が開きます。初回のみ外部アプリを開く確認が出る場合があります。起動済みなら「起動済みのCuttonを開く」で移動します。公開UI内で直接編集する場合は「別の開き方」から接続できます。

このフォルダの `Cuttonを起動.cmd` をダブルクリックします。サーバーは `http://127.0.0.1:4318` で動作します。Codex内では同じURLをブラウザパネルで開けます。

初回セットアップ／開発:

```powershell
npm install
npm run build
npm start
# UIの開発時
npm run dev
```

Node.js 22以降、FFmpegとffprobeが必要です。このPCでは検出済みです。サーバー終了はターミナル起動ならCtrl+C、ランチャー起動時は `Cuttonを停止.cmd` を使用します。

## 基本の流れ

1. 「編集プラン」で目的・長さ・構成を入力。CodexモードはApp Server経由で計画を生成します。ローカルモードは入力から作るたたき台です。
2. 動画・画像・音声を取り込み、シーンへ割り当てます。採用／不採用と判断理由を残します。
3. 採用素材を整列し、タイムラインで開始位置・素材内の開始点・尺を調整。再生位置で分割できます。
4. 必要に応じてComfyUIで追加素材を生成、Google Vidsで音声を生成して取り込みます。
5. プロジェクトZIPまたは再生用MP4を書き出します。

映像の元音声は自動再生しません。音声は明示的に音声トラックへ配置します。シーンの完成率は必要な映像／音声区間の充足率です。作品の品質を自動判定した数値ではありません。

## Codex App Server

ローカルにインストールされたCodex CLIをNodeから起動し、stdioのJSON-RPCで接続します。`initialize → initialized → thread/start → turn/start` を使用。既定モデルを使用し、設定欄の明示指定で変更できます。

計画／台本の生成ではツール実行を無効化した一時的な読み取り専用セッションと構造化出力を使用します。ログインが必要な場合はCodex CLIでログインしてください。生成ボタンを押すとCodexの利用枠を使用します。接続確認はモデル生成を行いません。

## ComfyUI

設定に接続先URLを入力します。初期値は `http://127.0.0.1:8188`。ComfyUIで「API形式」のワークフローJSONを取得し、生成パネルに貼り付けます。

このPCにはComfyUIとSD1.5 FP16画像モデルをセットアップ済みです。`ComfyUI起動.cmd` / `ComfyUI停止.cmd` で操作します。CPU 2スレッド、低優先度、キャッシュ無効で動きます。生成パネルのプリセットから384pxの画像ワークフローを選べます。起動・モデル認識・接続テスト・画像保存と取り込みを確認済みです。モデルを使った画像推論は空きメモリ不足のため未検証です。動画・音声モデルは未導入です。詳細は `workflows/README.md`。

- プロンプトを差し込む入力値に `{{prompt}}`、seedに `{{seed}}` を指定します。
- 画像・映像と音声のワークフローを別ジョブで送信します。
- `/prompt` へ投入し、ジョブ更新で `/history/{prompt_id}` を確認し、`/view` から出力を取り込みます。
- カスタムノード、モデル、GPUは接続先ComfyUI側に必要です。H3を含め、指定ワークフローに必要な構成を自動でインストールするものではありません。

## Google Vidsとナレーション

ナレーションパネルに生成指示を入力します。Codexモードでは台本を生成し、ローカルモードでは入力した文章をそのまま台本にします。シーン・台本・声の指示を含む連携ファイルを出力します。

Google Vidsで該当プロジェクトを開き、「Scripts / AI voiceover」で台本から音声を生成してください。生成後の音声またはMP4を取り込みます。MP4の場合は音声ストリームを再エンコードせず分離し、映像と別に管理します。

Vidsの音声生成用公開APIは確認できていないため、音声生成操作は認証済みブラウザで実行します。アプリ単独での完全自動生成ではありません。Codexにこの操作も任せる場合は、同梱の `skills/cutton-editor/SKILL.md` と既存の `google-vids-operator` を使い、「CuttonのシーンのナレーションをGoogle Vidsで生成して取り込んで」と依頼できます。ログイン、利用プラン、提供言語、生成枠に依存します。

Vidsから書き出したMP4由来の音声は、生成時の原本WAVとは扱いません。生成待ち、取り込み待ち、完了を区別して表示します。

## 字幕とモーショングラフィックス

字幕をタイムライン上で配置し、テキスト・時間・位置・大きさ・色を編集できます。グラフィックはタイトル、下部テロップ、図形、キネティックタイポグラフィ、コールアウト、フレームを組み合わせ、複数レイヤーを重ねられます。位置・拡大率・回転・透明度と補間方法をキーフレームで指定します。

字幕とグラフィックはMP4に焼き込み、プロジェクトJSONには編集可能な状態で保存します。字幕はSRTでも渡せます。XMLやOTIOで他社ソフトへ渡す場合、これらの表現を同じ動きのまま移行する保証はありません。MP4またはプロジェクトJSONを使用してください。

## 保存・書き出し

| 形式 | 内容と用途 |
|---|---|
| プロジェクトZIP | 元素材の全長コピー、プロジェクトJSON、ハッシュ一覧、編集表、XML、OTIO、EDL、SRT |
| 個別素材ZIP | タイムラインで使用中の元素材の全長コピーと編集情報。素材を再圧縮しません |
| Final Cut Pro FCPXML | 1.10の `.fcpxml`。複数レーン・速度・基本変形。DTD検証済み、本体での読み込みは未検証 |
| Premiere / Resolve XML | FCP 7の `.xml`。カット・別音声トラック。移行先で素材再リンクと確認が必要 |
| OTIO | OTIO対応ソフト向けの素材参照・トラック・トリム。音量はメタデータで保存 |
| EDL | 映像カット位置のみ。音声や効果を含まない |
| MP4 | H.264 / AACで再エンコードした再生用動画。元素材は保持 |

CapCutは他社ソフトのプロジェクトを直接取り込めません。元素材・SRT・編集表を用いて再構成してください。Resolve／Premiereでの実機インポートは未検証です。映像のトランジション、速度変更は現在実装していません。字幕・グラフィックを含む完成映像はMP4で書き出してください。

プロジェクトZIPを展開し、`project.open` に `project.cutton.json` の絶対パスを渡すと再開できます。プロジェクトは `data/state.json` に自動保存されます。新規作成時は旧プロジェクトをアーカイブします。素材と出力は `data/assets` と `data/exports` にあります。

SHA-256はバイトの同一性を、ストリームハッシュは圧縮済み映像／音声データの同一性を確認します。ハッシュ不一致だけで「画質劣化」とは判定しません。

## CLI・MCP

```powershell
node bin/cutton.mjs state
node bin/cutton.mjs commands
node bin/cutton.mjs import 'C:\Media\clip.mp4'
node bin/cutton.mjs storyboard.add '{"title":"導入","duration":5}'
node bin/cutton.mjs export.create '{"format":"bundle"}'
# JSONをファイルから渡す場合
node bin/cutton.mjs generation.submit --file workflow-request.json
```

MCP設定例（アプリのサーバーを先に起動）:

```json
{
  "mcpServers": {
    "cutton": {
      "command": "node",
      "args": ["C:/path/to/Cutton/bin/mcp.mjs"]
    }
  }
}
```

Codex CLIへの登録:

```powershell
codex mcp add cutton -- node 'C:\path\to\Cutton\bin\mcp.mjs'
```

`cutton_capabilities` で操作一覧を取得し、`cutton_command` へ `{command,args}` を渡します。画面のボタンは `data-action`、対象は `data-entity-id`、入力はアクセシビリティ名で識別できます。`GET /api/capabilities` と `GET /api/state` が機械向けの操作情報です。

## 軽量化

- 素材本体はファイルとして保持し、JSONやReactの状態に埋め込みません。
- HTTP Range配信で必要な区間を読み込みます。プレビューは必要な映像・音声だけを再生します。
- 編集用に360p / 540p / 720pの動画を必要なときだけ作り、キャッシュを再利用します。元動画の画質や書き出しには影響しません。
- プレビュー作成は1ジョブ・1スレッド・低優先度。キャッシュは約4GBを目安に古いファイルから整理します。
- 音声波形は8kHzに間引いてストリーム解析し、最大1200点を保存します。長尺の音声を丸ごとメモリに展開しません。
- 素材一覧は80件ずつ、タイムライン目盛りは最大250個。動きは主にCSSのtransformとopacityで描画します。
- タイムラインは画面に見える時間帯だけ描画し、波形も表示時に取得します。プレビューには現在時刻の字幕・グラフィックだけを配置します。
- 再生クロックをReactから分離し、毎フレームの画面全体の再描画を避けます。
- サムネイルは低解像度でキャッシュします。元素材の画質を変更しません。
- MP4書き出しはセグメント単位に処理し、FFmpegの映像エンコードを2スレッドに制限します。

映像8レーン＋音声8レーンに、字幕と複数グラフィックのレイヤーを重ねられます。映像／音声の同一トラック内の重なりは拒否します。長尺・大量素材での包括的な負荷試験は未実施です。低解像度プレビューで編集時の負荷を抑えますが、AIモデルの生成負荷は接続先ComfyUIの性能・空きメモリに依存します。

## 検証

```powershell
npm test
npm run build
```

CLI/MCPとHTTPの操作検証、App Serverプロトコル、メディア原本保護、トリム／分割、字幕・キーフレームのMP4描画、実波形、軽量プレビューをテストします。ComfyUIは実機の画像保存・取り込みを確認済みです。ComfyUIのモデル推論は未検証です。Google Vidsは日本語音声を実際に生成し、AACのハッシュ一致で取り込みを検証済みです。

このPCの待機中Cuttonサーバーは常駐約43 MiB、プライベート約56 MiBでした（2026-09-08）。ブラウザの使用量・AI推論時の負荷を含まず、低性能PCでの動作保証を意味する値ではありません。

## 参照した公式仕様

- [Codex App Server](https://developers.openai.com/codex/app-server/)
- [ComfyUIサーバールート](https://docs.comfy.org/development/comfyui-server/comms_routes)
- [Google Vids音声生成](https://support.google.com/docs/answer/15070345?hl=en)
- [Google VidsとSlides](https://support.google.com/docs/answer/15577408)
- [DriveのVidsダウンロード](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
- [FCP 7 XML仕様](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/FinalCutPro_XML/Elements/Elements.html)
- [OTIO仕様](https://opentimelineio.readthedocs.io/en/latest/tutorials/otio-file-format-specification.html)
- [CapCutのプロジェクト互換性](https://www.capcut.com/help/how-to-export-pro-project)

起動の仕組み・確認項目は [docs/STARTUP.md](docs/STARTUP.md) を参照してください。
