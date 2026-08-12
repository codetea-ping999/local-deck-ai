# Roadmap / 実装状況

このリポジトリのPhase 0〜5を、ローカル実行可能な範囲で実装しています。

## Phase 0 — MVP安定化 [x]

- [x] CIで型チェック、テスト、ビルドを必須化
- [x] JSON抽出、Zod、CLI、GUI入力、Ollamaエラーのテスト
- [x] Ollamaを使わないモック生成とサンプルMarkdown→PPTXスモークテスト
- [x] README/architectureと実装を同期

## Phase 1 — v0.2文書対応 [x]

- [x] `DocumentParser`相当の拡張子別パーサー（Markdown/TXT/PDF/DOCX）
- [x] PDFは`pdf-parse`、DOCXは`mammoth`でテキスト抽出
- [x] 空、破損、非対応、サイズ超過のエラー境界
- [x] chunking、chunkごとのOllama要約、進捗表示

## Phase 2 — v0.3スライド品質 [x]

- [x] レイアウト別プロンプトと`title/agenda/content/comparison/process/summary`
- [x] `table/timeline/key-message`スキーマ、レンダラー、出典
- [x] `PresentationQualityReport`、構造エラー、文字量警告、`--strict-quality`
- [x] title/agenda自動追加と過密contentスライド分割

## Phase 3 — GUIレビュー [x]

- [x] multipart文書アップロード、抽出結果、ドラッグ＆ドロップ
- [x] `/api/outline`、`/api/slides/regenerate`、`/api/render`、JSON検証/入出力
- [x] HTMLプレビューとスライド一覧・編集・単位再生成
- [x] ランダムupload ID、出力root制限、パストラバーサル拒否
- [x] 文書削除、成果物ID付きダウンロード、レビュー優先の`/api/generate render:false`
- [x] 依存なしES Modules、3ペイン制作UI、レスポンシブ表示、未保存警告
- [x] スライド追加・複製・削除・並べ替え、品質警告、テーマ選択UI

## Phase 4 — v0.4テーマ [x]

- [x] `DeckTheme` Zodスキーマ（フォント、配色、余白、フッター、ロゴ位置/サイズ）
- [x] 全PPTXレイアウトとHTMLでResolvedThemeを使用
- [x] `template.pptx` + `template.template.json` sidecar検証

## Phase 5 — RAG/製品化 [x]

- [x] Ollama `/api/embed`優先、旧`/api/embeddings`フォールバック
- [x] `.local-deck/index.json`のembedding保存とコサイン類似度検索
- [x] RAG出典ID検証、スライドcitations、speaker notes反映
- [x] `index`、`search`、`generate --index`、`render` CLI
- [x] HTML出力、LibreOfficeがある環境でのPDF変換
- [x] GitHub Release/npm公開用タグCI

### 実行上の前提

Ollamaを使う実生成にはローカルOllamaが必要です。一方、`npm test`、`npm run smoke`、`npm run lint`、`npm run build`はOllamaなしで実行できます。PDF変換だけは任意でLibreOfficeの`soffice`が必要です。
