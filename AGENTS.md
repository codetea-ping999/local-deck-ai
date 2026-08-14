# Local Deck AI: agent guide

This file is a navigation map, not an encyclopedia. Keep durable knowledge in the linked documentation and encode repeatable rules in tests or tooling.

## Start here

1. Run `git status --short` and preserve unrelated working-tree changes.
2. Read [README.md](README.md) for supported workflows and [docs/architecture.md](docs/architecture.md) before changing a pipeline boundary.
3. Read [docs/agent-development.md](docs/agent-development.md) for the required goal → change → evidence loop.
4. Read the target module and its closest test before editing.

## Source-of-truth map

| Need | Read |
| --- | --- |
| Commands, CLI, local-only product constraints | `README.md` |
| Pipeline boundaries and module responsibilities | `docs/architecture.md` |
| RAG behavior and citation rules | `docs/rag.md` |
| Theme and PPTX template contract | `docs/templates.md` |
| Product scope and completed work | `docs/roadmap.md` |
| Agent workflow, evidence, and escalation rules | `docs/agent-development.md` |
| Presentation data contract | `src/schemas/presentation.ts` |

## Non-negotiable invariants

- Keep document processing local by default. Do not add a third-party content upload path without explicit approval.
- Treat LLM output as untrusted: validate it with Zod, resolve citations, and run quality checks before rendering or writing output.
- Keep rendering deterministic; the model supplies presentation intent, not positioned drawing commands.
- Validate external input at the boundary and return explicit, actionable errors.
- Prefer small, focused changes. Preserve public CLI and GUI behavior unless the task explicitly changes it.
- Use mocks in automated tests. The standard verification suite must not require a running Ollama instance or LibreOffice.
- When changing `public/`, add or update the corresponding GUI state, utility, or HTTP contract test; browser code is outside the TypeScript compiler scope.

## Working loop

1. State a testable goal, scope, acceptance criteria, and the command that will prove completion.
2. Observe the current behavior and reproduce the issue when applicable.
3. Make the smallest change that satisfies the goal; add or update the test that captures new behavior.
4. Run focused checks while iterating, then run `npm run verify` before declaring the change complete.
5. Review the diff against the goal, invariants, and touched documentation. Record any residual risk or follow-up.

## Verification commands

| Command | Evidence |
| --- | --- |
| `npm run lint` | Type-level correctness |
| `npm test` | Unit, contract, and integration behavior |
| `npm run smoke` | Mock document-to-PPTX path |
| `npm run build` | Publishable TypeScript output |
| `npm run verify` | Full pre-merge/release harness, including package dry run |

Use a targeted test first where practical, but do not replace the full verification harness with a targeted result.

## Stop and ask for a human decision

- Publishing to npm, creating a release, pushing or merging a branch.
- A change to privacy posture, network access, authentication, or output-root policy.
- A breaking CLI, JSON schema, template-sidecar, or stored-index change without an approved migration.
- Requirements that are ambiguous, conflict with repository documentation, or cannot be proven with available checks.

## Handoff format

Report the goal, changed files, commands run and their results, plus any unverified area, risk, or follow-up. Promote lessons that should survive the task into a test, a small rule here, or the relevant document—never rely only on chat memory.
