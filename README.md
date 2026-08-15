# Local Deck AI

Local Deck AI turns Markdown, TXT, PDF, and DOCX documents into reviewable slide decks using local Ollama models. Content stays on the machine; the intermediate Presentation JSON is validated before PPTX, HTML, or optional LibreOffice PDF rendering.

## What is implemented

- Quality reports for title, subtitle, bullet, table, timeline, and slide-density limits, with title/agenda insertion and dense content splitting.
- Vanilla HTML GUI for upload/drag-and-drop, extraction review, outline generation, slide editing, single-slide regeneration, JSON import/export, preview, and output.
- Theme JSON for fonts, colors, margins, footer, logo path, logo position, and logo size.
- Explicit PPTX template sidecars (`template.pptx` + `template.template.json`). Arbitrary PPTX files without a sidecar are rejected.
- Ollama embedding RAG with `/api/embed` first and legacy `/api/embeddings` fallback, JSON storage, cosine search, PDF page metadata, and validated citations.
- PPTX, HTML, and PDF output. PDF requires `soffice` / LibreOffice at render time.

See [docs/roadmap.md](docs/roadmap.md), [docs/rag.md](docs/rag.md), and [docs/templates.md](docs/templates.md) for constraints and details.

## Requirements

- Node.js 20+
- npm 10+
- Ollama running locally for generation and embeddings
- an Ollama model that can follow JSON instructions
- LibreOffice only for PDF output
- PDF/DOCX input is extracted as text; the maximum input size is 10 MiB

```bash
ollama pull qwen3:8b
ollama pull nomic-embed-text
```

## Quick start

```bash
git clone https://github.com/codetea-ping999/local-deck-ai.git
cd local-deck-ai
npm install
npm run build
ollama serve
npm run generate -- examples/ai-training.md --model qwen3:8b --output output/ai-training.pptx
```

## CLI

```text
local-deck-ai generate <input-file> [options]
local-deck-ai index <files...> [options]
local-deck-ai search <query> --index <path> [options]
local-deck-ai generate --index <path> --query <text> [options]
local-deck-ai render <presentation.json> [options]
local-deck-ai gui
```

Common options:

```text
--model <name>             Generation model. Default: qwen3:8b
--embedding-model <name>   Embedding model. Default: nomic-embed-text
--index <path>             Index path. Default: .local-deck/index.json
--query <text>             RAG query
--top-k <number>           Retrieved chunks. Default: 5
--format pptx|html|pdf     Output format. Default: pptx
--output <path>            Output path
--host <url>               Ollama host. Default: http://localhost:11434
--timeout <seconds>        Ollama request timeout. Default: 600
--slides <number>          Target slide count. Default: 8
--theme <path>             Theme JSON path
--template <path>          Template PPTX path with sidecar JSON
--strict-quality           Treat quality warnings as generation errors
```

Examples:

```bash
local-deck-ai generate report.pdf --format html --output output/report.html
local-deck-ai render output/presentation.json --format pptx --output output/review.pptx --theme theme.json
local-deck-ai index manual.pdf guide.docx --index .local-deck/index.json --embedding-model nomic-embed-text
local-deck-ai search "deployment policy" --index .local-deck/index.json --top-k 5
local-deck-ai generate --index .local-deck/index.json --query "What changed?" --model qwen3:8b
```

## GUI

Start the local review server:

```bash
npm run gui
# or: npm run gui -- --port 4174
```

The browser workflow is upload → extracted document chips → outline → slide-by-slide edit → regenerate one slide → JSON/HTML preview → PPTX, HTML, PDF, or JSON output. The review workspace supports adding, duplicating, deleting, and reordering slides, with Undo/Redo for the current session. Only connection/generation settings and the selected theme are stored in `localStorage`; document content and Presentation drafts are not automatically saved. Unsaved changes are marked in the UI and trigger a navigation warning. Uploads are stored below `.local-deck/uploads/` with random IDs. GUI output is restricted to `output/` by default; set `LOCAL_DECK_OUTPUT_ROOT` to choose another root. Completed artifacts can be downloaded through the server-provided artifact URL.

## Themes and templates

Example theme JSON:

```json
{
  "fontFace": "Aptos",
  "headingFontFace": "Aptos Display",
  "colors": {
    "ink": "111827",
    "muted": "6B7280",
    "line": "E5E7EB",
    "accent": "2563EB",
    "canvas": "FFFFFF",
    "surface": "F9FAFB"
  },
  "footer": "Internal use only",
  "margin": 0.85,
  "logo": { "path": "assets/logo.png", "x": 11.5, "y": 6.75, "w": 1, "h": 0.35 }
}
```

All renderer layouts consume the resolved theme. For managed PowerPoint templates, provide `template.pptx` and a matching `template.template.json`; see [docs/templates.md](docs/templates.md).

## Presentation JSON

```json
{
  "title": "生成AI基礎研修",
  "audience": "社内エンジニア",
  "slides": [
    {
      "title": "生成AIとは",
      "layout": "content",
      "bullets": ["文章・画像・コードなどを生成できる", "業務では補助ツールとして使う"],
      "speakerNotes": "従来AIとの違いを説明する。"
    }
  ]
}
```

The quality layer adds a title slide when missing, creates an agenda for decks of five or more slides, and splits overfull content slides. Structural table/timeline limits are errors. Text-length limits are warnings unless `--strict-quality` is supplied.

## Development and CI

```bash
npm run verify
```

`npm run verify` is the canonical local/CI harness: type check, test suite, mock document-to-PPTX smoke test, build, and package dry run. During iteration, the individual commands (`lint`, `test`, `smoke`, and `build`) remain available. The test suite does not require Ollama. It covers JSON/schema validation, quality adjustment, document parsing, embedding fallback and vector search, GUI request validation, theme/template checks, rendering, and mock generation. See [AGENTS.md](AGENTS.md) and [docs/agent-development.md](docs/agent-development.md) for the agent development loop. Tag pushes matching `v*.*.*` run the same checks, create `.tar.gz` and `.zip` CLI archives, publish a GitHub Release, and publish the package using `NPM_TOKEN`.

### PptxGenJS security pin

`pptxgenjs` is temporarily resolved to immutable commit `2ea5bafc5a1260c108c7200f6a36519bb6d35bd7` from upstream [PR #1473](https://github.com/gitbrent/PptxGenJS/pull/1473). The commit removes its unused `image-size` runtime dependency, for which the two current high-severity advisories have no patched release. It is a PptxGenJS 4.0.1 source pin, so the full test suite and representative PPTX smoke test are required before release. Replace this URL with the first upstream npm release that includes the same change, then rerun `npm audit --omit=dev` and the full verification suite.

## Troubleshooting

- `Ollama に接続できません`: run `ollama serve` and verify `--host`.
- Ollama request timeout: a large local model may need longer than the default 600 seconds; retry with `--timeout 900` or a smaller model.
- Model not found: run `local-deck-ai models`, then `ollama pull <model>`.
- `Input document is too large`: split the document; the limit is 10 MiB.
- PDF output error: install LibreOffice so `soffice` is on `PATH`.
- Template mapping error: add a `.template.json` sidecar with every layout used by the deck.

## License

MIT
