# Roadmap

## v0.1 — MVP

Goal: prove the local document-to-PowerPoint pipeline.

- [x] Markdown input
- [x] plain text input
- [x] Ollama generation
- [x] JSON-only prompt contract
- [x] Zod schema validation
- [x] PowerPoint rendering
- [x] sample source document
- [x] basic CI

## v0.2 — Document support

Goal: handle common source material.

- [ ] PDF text extraction
- [ ] DOCX text extraction
- [ ] source chunking for long files
- [ ] source summary step before slide generation
- [ ] better error messages for unsupported files

## v0.3 — Slide quality

Goal: improve deck usefulness and readability.

- [ ] layout-specific prompting
- [ ] better title slide handling
- [ ] agenda generation
- [ ] table layout
- [ ] timeline layout
- [ ] key-message slide layout
- [ ] automatic slide count adjustment

## v0.4 — Templates

Goal: support repeatable visual identity.

- [ ] theme config file
- [ ] font and color presets
- [ ] custom footer
- [ ] existing `.pptx` template import investigation
- [ ] brand-safe rendering rules

## v0.5 — RAG

Goal: generate decks from multiple private documents.

- [ ] local vector store investigation
- [ ] document indexing
- [ ] citation tracking in intermediate JSON
- [ ] source-grounded slide notes

## v0.6 — Review loop

Goal: make generated decks easier to improve.

- [ ] local reviewer prompt
- [ ] slide-level critique
- [ ] rewrite specific slide
- [ ] regenerate by layout
- [ ] export intermediate JSON
- [ ] import edited intermediate JSON

## v1.0 — Productized local deck workflow

Goal: stable local presentation generation for day-to-day use.

- [ ] Web UI
- [ ] drag-and-drop source upload
- [ ] editable outline before render
- [ ] template selector
- [ ] PowerPoint / PDF / HTML export
- [ ] automated release workflow
