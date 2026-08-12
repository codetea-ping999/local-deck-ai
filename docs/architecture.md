# Architecture

Local Deck AI uses a deliberately boring pipeline. The LLM is responsible for structured content, while deterministic code is responsible for layout and rendering.

## Pipeline

```text
Source document
      ↓
readDocument()
      ↓
buildPresentationPrompt()
      ↓
Ollama /api/generate
      ↓
extractJsonObject()
      ↓
PresentationSchema.safeParse()
      ↓
renderPresentationToPptx()
      ↓
.pptx file
```

Long documents are split into bounded chunks and summarized before the final prompt. PDF/DOCX parsing is provided by replaceable parser adapters. The intermediate schema now carries table, timeline, key-message, citations, and theme-compatible rendering metadata. GUI review helpers can validate/import/export JSON, regenerate one slide, and create HTML previews; the local RAG module persists a small keyword index without a cloud service.

The parser registry maps `.md`, `.txt`, `.pdf`, and `.docx` to text-producing adapters. Parsed text is checked for emptiness and then passed to `chunkDocument()` when it exceeds the configured chunk size. Multi-chunk documents are summarized sequentially; any failed or empty summary aborts generation with the failing chunk number, so a partial document cannot silently produce a deck. PDF segments carry page ranges into the RAG index.

The GUI stores uploads under `.local-deck/uploads/<random-id>.<extension>`, never at a client-provided path. `/api/documents` returns IDs and extracted segments and supports deletion; `/api/outline` consumes those IDs and returns verified Presentation JSON; `/api/slides/regenerate` replaces one validated slide. `/api/generate` supports `render:false` so the browser can review a deck before any file is written. `/api/index` writes the local embedding index, and `/api/render` only writes below the configured output root (`output/` by default or `LOCAL_DECK_OUTPUT_ROOT`), returning an in-memory artifact ID for a safe download route.

The RAG flow is: upload → parse → chunk → Ollama embedding → `.local-deck/index.json` → cosine search → `[S1]` context injection → citation validation → slide citations and speaker notes. Rendering is then selected as PPTX, HTML, or PDF; PDF uses LibreOffice only at render time.

## Design principles

### 1. Keep documents local

The MVP calls a local Ollama server. The project should avoid sending document content to third-party APIs by default.

### 2. Do not let the LLM draw slides directly

The LLM returns intent:

- title
- slide layout
- bullets
- columns
- process steps
- speaker notes

The renderer owns:

- slide size
- font sizes
- spacing
- shapes
- footer
- output format

This separation makes rendering more stable and easier to test.

### 3. Validate before rendering

Generated JSON is parsed and validated with Zod before any PowerPoint file is written. Invalid LLM output should fail loudly so the prompt or schema can be improved.

### 3.1 Error boundaries and test seams

The pipeline has explicit error boundaries:

- `readDocument()` reports input read, empty, unsupported-format, and size-limit errors.
- Parser failures are reported as `PARSE_FAILED` with the source path and file extension.
- `OllamaClient` reports connection, timeout, HTTP, and malformed-response errors through `OllamaError`.
- `generatePresentation()` extracts and validates JSON, retrying invalid JSON at most once before reporting both parse failures.
- The renderer runs only after schema validation succeeds.

`generatePresentation()` depends on the `GenerateClient` interface rather than directly on `OllamaClient`. Tests inject a small mock with a `generate()` method, so unit tests do not require Ollama to be running. The browser is served as native ES Modules with separate API, state, editor, renderer, and utility modules; no frontend dependency or bundler is required. The PPTX renderer is covered separately by a file-output smoke test.

### 4. Add richer capabilities behind interfaces

Future support for PDF parsing, DOCX parsing, RAG, templates, and review agents should be added as replaceable modules rather than hidden inside the CLI.

## Main modules

- `src/cli/index.ts` — command-line entry point
- `src/parser/readDocument.ts` — source file reader
- `src/llm/ollama.ts` — local Ollama client
- `src/llm/prompts.ts` — prompt builder
- `src/pipeline/generatePresentation.ts` — LLM generation + validation
- `src/schemas/presentation.ts` — intermediate schema
- `src/renderer/pptx.ts` — deterministic PowerPoint renderer

## Intermediate representation

The intermediate representation is the most important contract in this repository. The CLI, renderer, tests, future Web UI, and future review agent should all depend on this schema rather than on raw LLM text.

```ts
Presentation
  title
  subtitle?
  audience?
  sourceSummary?
  slides[]
    title
    subtitle?
    layout
    bullets[]
    columns?
    steps?
    speakerNotes?
```
