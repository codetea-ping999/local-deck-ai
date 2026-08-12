# Local RAG

Local Deck AI keeps retrieval local. `local-deck-ai index <files...>` extracts supported documents, chunks them, calls Ollama's `/api/embed` endpoint, and stores the result in `.local-deck/index.json`. If `/api/embed` is unavailable, the client falls back to the legacy `/api/embeddings` endpoint one input at a time.

The default embedding model is `nomic-embed-text` and can be changed with `--embedding-model`. Each chunk stores its document ID, source filename, chunk ID, text, optional PDF page range, embedding vector, and embedding model. Search uses cosine similarity and returns `--top-k` chunks. The old keyword-only `createLocalIndex()` API remains available for offline tests and compatibility.

```bash
local-deck-ai index manual.pdf guide.docx --index .local-deck/index.json
local-deck-ai search "deployment policy" --index .local-deck/index.json --top-k 5
local-deck-ai generate --index .local-deck/index.json --query "What changed?" --model qwen3:8b
```

Retrieved context is injected as `[S1]`, `[S2]`, and so on. The model must use those IDs in `citations.source`; unknown IDs are rejected. Validated citations are copied to slide JSON and speaker notes. PDF segments retain page numbers; DOCX, Markdown, and TXT segments intentionally have no page number.

No external vector database or cloud service is used.
