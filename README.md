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

This repository is at **v0.1 MVP** stage.

Supported now:

- Markdown input
- plain text input
- Ollama generation
- schema validation with Zod
- PowerPoint output with PptxGenJS
- speaker notes metadata in the intermediate JSON

Planned next:

- PDF / DOCX parsing
- richer slide layouts
- corporate template support
- diagram generation
- RAG over multiple source documents
- Web UI

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
```

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
npm run build
```

During development, run directly with `tsx`:

```bash
npm run dev -- generate examples/ai-training.md --model qwen3:8b
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
