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
