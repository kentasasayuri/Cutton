# ComfyUI ワークフロー

`comfy-smoke.json` は、ComfyUIとの接続・キュー実行・画像保存・素材取り込みを確認するためのAPI形式ワークフローです。320×180の単色画像を作るだけで、AIモデルによる画像生成ではありません。

生成パネルで種類「画像」を選択し、このJSONを貼り付けて送信できます。プロンプトはテストの記録用です。このワークフローの画像内容には使われません。

ComfyUIは `ComfyUI起動.cmd` で起動、`ComfyUI停止.cmd` で停止できます。初期設定はCPU、2スレッド、ノード結果キャッシュ無効です。SD1.5 FP16の画像モデルは導入済みです。

`comfy-sd15-cpu.json` はSD1.5 FP16の画像生成用です。384×384・8ステップ・1枚ずつのプレビュー設定で、`{{prompt}}` と `{{seed}}` を生成パネルの入力に置換します。英語プロンプトを推奨します。CPU実行のため生成に時間がかかり、モデルを読み込む間は数GBのメモリが必要です。空きメモリを確保してから使ってください。動画・音声の生成モデルは含みません。

対応チェックポイント: [Comfy-Org SD1.5 FP16](https://huggingface.co/Comfy-Org/stable-diffusion-v1-5-archive/blob/main/v1-5-pruned-emaonly-fp16.safetensors)（2,132,696,762 bytes、CreativeML Open RAIL-M）。保存先はComfyUIの `models/checkpoints/v1-5-pruned-emaonly-fp16.safetensors` です。

検証用SHA-256: `e9476a13728cd75d8279f6ec8bad753a66a1957ca375a1464dc63b37db6e3916`

セットアップ時にComfyUIの起動・モデル一覧への表示・単色画像の実行と取り込みを確認しました。SD1.5による画像推論は、その時点の空きメモリが約1.5GBだったため実行していません。
