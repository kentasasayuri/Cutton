# CodexからGoogle Vids音声を作る

2026-09-09に、日本語の台本から約9.3秒のNyla音声を生成し、CuttonへAACのまま取り込みました。圧縮音声のハッシュ一致を確認しています。

検証ファイル：https://docs.google.com/videos/d/1Ak0Y2Xtkoz7A-Kn_lLNIXCKtY7G2cxXNO-GNw17pMjA/edit

## 再現手順

1. CLI/MCPの `narration.prepare` に `prompt` と任意の `sceneId` を渡す。`mode:codex` はCodex App Serverによる台本作成、`mode:local` は入力原稿をそのまま使う。
2. 戻り値の `jobId` と `script` を保持する。この時点では音声未生成。
3. Codexの `google-vids-operator` と利用可能なブラウザ操作を使う。認証済みVidsで新規の空白動画を作るか、指定された既存Vidsを開く。Googleの認証情報は取り出さない。
4. 「ナレーションを生成」→「スクリプトを編集」に原稿を入力。読み戻しで原稿を確認。
5. 音声を選択し「ナレーションを挿入」。タイムラインに音声クリップと実時間が現れるまで状態を確認。
6. 「ファイル」→「ダウンロード」→「MP4動画」。実ファイルの非ゼロサイズ・音声ストリームを確認。
7. `narration.import` に実際の `path` と手順2の `jobId` を渡す。Cuttonは音声のみを取り込み、ジョブを完了にする。
8. `timeline.add` に返された `assetId`、`track:audio`、開始・尺を渡す。

ユーザーのVids画面・プランによってラベルや利用可能な音声が異なります。生成不能、ログイン要求、生成中、取り込み待ちを完了と報告しないでください。

現在のCuttonはVidsの無人ブラウザ実行サービスを内蔵していません。上記をCodexから操作する必要があります。音声生成を装うダミー音声・偽APIは使っていません。
