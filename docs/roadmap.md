# Roadmap / 実装状況

このリポジトリのPhase 0〜5を、ローカル実行可能な範囲で実装済みです。

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
- [x] 文字量を抑えるプロンプト規約とレイアウト専用描画

## Phase 3 — GUIレビュー [x]

- [x] 進捗付き生成、JSON検証、JSONインポート/エクスポート用API
- [x] HTMLプレビュー、スライド再生成用の`regenerateSlide()` API
- [x] 出力先、ファイル名、エラー表示

## Phase 4 — v0.4テーマ [x]

- [x] JSONテーマ設定（フォント、配色、余白、フッター、ロゴ項目）
- [x] テーマ検証とレンダラー引数
- [x] 既存PPTXテンプレートはPptxGenJSとの互換性を保つため、テーマ設定を優先する方針

## Phase 5 — RAG/製品化 [x]

- [x] 外部サービス不要のローカル文書インデックスとキーワード検索
- [x] スライド出典・speaker notesのスキーマ
- [x] HTML出力、LibreOfficeがある環境でのPDF変換ラッパー
- [x] GUIのファイル選択/ドラッグ＆ドロップUI、リリース用CI基盤

### 実行上の前提

Ollamaを使う実生成にはローカルOllamaが必要です。一方、`npm test`、`npm run smoke`、`npm run lint`、`npm run build`はOllamaなしで実行できます。PDF変換だけは任意でLibreOfficeの`soffice`が必要です。
