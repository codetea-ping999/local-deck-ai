# Local Deck AI

Generate PowerPoint presentations from documents using local LLMs.

Local Deck AI is a small TypeScript CLI for turning Markdown or text files into structured slide decks using [Ollama](https://ollama.com/) and rendering them as `.pptx` files.

## Why this exists

Cloud slide-generation tools are convenient, but many work documents should not leave your machine. This project keeps the first MVP intentionally local:

- runs on your own machine
- uses Ollama-compatible local models
- sends no document content to cloud LLM APIs
- forces structured JSON before rendering slides
- generates editable PowerPoint files

## Current status

The Phase 0〜5 implementation is available. The core test/build path does not require Ollama.

Supported now:

- Markdown / plain text / PDF / DOCX input
- Ollama generation
- schema validation with Zod
- PowerPoint output with PptxGenJS
- speaker notes metadata in the intermediate JSON
- Ollamaに導入済みのモデル一覧表示 (`models`)
- ローカルGUI (`gui`) と生成進捗表示
- 長文chunkingとchunk要約
- table / timeline / key-message layouts
- theme JSON、中間JSONレビュー、HTML preview、ローカル検索インデックス

詳細な完了項目は [docs/roadmap.md](docs/roadmap.md) を参照してください。

## Requirements

- Node.js 20+
- npm 10+
- Ollama running locally
- an Ollama model that can follow JSON instructions

Recommended model examples:

```bash
ollama pull qwen3:8b
ollama pull gemma3:12b
```

## Quick start

```bash
git clone https://github.com/codetea-ping999/local-deck-ai.git
cd local-deck-ai
npm install
npm run build
```

Start Ollama in another terminal:

```bash
ollama serve
```

Generate a sample deck:

```bash
npm run generate -- examples/ai-training.md --model qwen3:8b --output output/ai-training.pptx
```

The generated PowerPoint file will be written to `output/ai-training.pptx`.

## CLI usage

```bash
local-deck-ai generate <input-file> [options]
```

Options:

```text
--model <name>       Ollama model name. Default: qwen3:8b
--output <path>      Output PPTX path. Default: output/deck.pptx
--host <url>         Ollama host. Default: http://localhost:11434
  --slides <number>    Target slide count. Default: 8
  --theme <path>       Theme JSON path (optional)
```

利用可能なモデルは、Ollamaに実際に導入済みのものだけです。確認するには次を実行します。

```bash
npm run dev -- models
```

GUIを起動する場合は、Ollamaを起動した状態で次を実行し、表示されたURLをブラウザで開きます。

```bash
npm run gui
```

既に4173番ポートを使用中の場合は、既存の `http://127.0.0.1:4173` を開くか、別ポートで起動します。

```bash
npm run gui -- --port 4174
```

`qwen3:8b` や `gemma4:12b` が404になる場合、そのモデルが未導入か、モデル名がOllamaの登録名と異なります。`npm run dev -- models` で一覧を確認し、必要なら `ollama pull <一覧のモデル名>` を実行してください。`fetch failed` の場合は `ollama serve` と `--host` の設定を確認してください。

## Architecture

```text
Input document
      ↓
Document parser
      ↓
Ollama prompt
      ↓
Structured JSON
      ↓
Zod validation
      ↓
PPTX renderer
      ↓
PowerPoint file
```

The project deliberately separates **content generation** from **visual rendering**. The LLM plans the title, bullets, layout intent, and speaker notes. The renderer owns slide sizes, typography, positioning, and PowerPoint generation.

## Example intermediate schema

```json
{
  "title": "生成AI基礎研修",
  "audience": "社内エンジニア",
  "slides": [
    {
      "title": "生成AIとは",
      "layout": "content",
      "bullets": [
        "文章・画像・コードなどを生成できる",
        "業務では補助ツールとして使う",
        "出力は人間が確認する必要がある"
      ],
      "speakerNotes": "従来AIとの違いを簡単に説明する。"
    }
  ]
}
```

## Development

```bash
npm run lint
npm test
npm run build
```

テストはOllamaに接続せず実行できます。JSON抽出、入力ファイル検証、スキーマ検証、CLI/GUI入力検証、chunking、モックを使った生成パイプライン、PPTX書き出しのスモークテストを含みます。

```bash
npm test
npm run smoke
```

実際のモデルを使った生成確認は、Ollamaを起動してから次を実行します。

```bash
npm run generate -- examples/ai-training.md --model qwen3:8b --output output/ai-training.pptx
```

よくあるエラー：

- `Ollama に接続できません`：`ollama serve`と`--host`を確認してください。
- モデルが見つからないエラー：`npm run dev -- models`で一覧を確認し、必要なら`ollama pull <model>`を実行してください。
- `Input document is too large`：現在の入力上限は1 MiBです。文書を分割して入力してください。
- GUIの`output`エラー：GUI APIでは絶対パスを指定してください。

During development, run directly with `tsx`:

```bash
npm run dev -- generate examples/ai-training.md --model gemma4:12b --output output/ai-training.pptx
```

## Project philosophy

This is not meant to be a magic one-shot slide generator. The goal is to build a reliable local pipeline:

1. parse source documents
2. ask the LLM for structured content
3. validate the structure
4. render slides deterministically
5. review and improve the output

That design makes the tool easier to debug, safer for private documents, and easier to extend into templates, RAG, and review workflows.

## License

MIT
