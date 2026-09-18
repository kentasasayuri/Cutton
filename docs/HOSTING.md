# 公開構成

Cuttonの公開UIはGitHub Pagesで配信し、編集処理は利用者のPC上で実行します。

| 構成 | 役割 |
|---|---|
| GitHub Pages | 起動・接続画面と編集UIを配信。閲覧にGitHubやOpenAIのアカウントは不要 |
| ローカル編集エンジン | 素材、プロジェクト、FFmpeg処理、書き出しをPC内で実行 |
| Codex App Server | 構成案、台本、GPT Imageを使う場合だけ任意で接続 |
| ComfyUI / Google Vids | 利用者が選んだ外部機能として任意で接続 |

GitHub Pagesだけでは動画編集処理や素材保存は行えません。公開UIから「Cuttonを起動」を選び、PC上の編集エンジンを起動してください。ブラウザからローカルエンジンへ接続できない場合は、「起動済みのCuttonを開く」でローカルUIへ移動できます。

公開UIは `main` へのプッシュ時に `.github/workflows/deploy-pages.yml` でビルドされます。Viteの公開パスは `/Cutton/` に設定され、生成物だけがGitHub Pagesへ配置されます。

素材やプロジェクトをインターネット上のサーバーへ移す場合は、認証、TLS、保存容量、バックアップ、アップロード制限、FFmpeg実行環境、費用管理を別途設計してください。現在のローカル専用エンジンをそのまま外部へ公開しないでください。
