#!/usr/bin/env node
import { resolve } from "node:path";
import { OllamaClient } from "../llm/ollama.js";
import { readDocument } from "../parser/readDocument.js";
import { generatePresentation } from "../pipeline/generatePresentation.js";
import { renderPresentationToPptx } from "../renderer/pptx.js";

type CliOptions = {
  command?: string;
  input?: string;
  model: string;
  output: string;
  host: string;
  slides: number;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.command !== "generate" || !options.input) {
    printHelp();
    process.exit(options.command ? 1 : 0);
  }

  const inputPath = resolve(options.input);
  const outputPath = resolve(options.output);

  console.log(`• Loading document: ${inputPath}`);
  const document = await readDocument(inputPath);

  console.log(`• Generating deck with Ollama model: ${options.model}`);
  const client = new OllamaClient(options.host);
  const presentation = await generatePresentation({
    document,
    client,
    model: options.model,
    targetSlideCount: options.slides
  });

  console.log(`• Rendering ${presentation.slides.length} slides to: ${outputPath}`);
  await renderPresentationToPptx(presentation, outputPath);

  console.log("✓ Done");
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    model: "qwen3:8b",
    output: "output/deck.pptx",
    host: "http://localhost:11434",
    slides: 8
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      continue;
    }

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[index + 1];
      const value = next && !next.startsWith("--") ? next : "true";

      if (value !== "true") {
        index += 1;
      }

      applyOption(options, key, value);
      continue;
    }

    if (!options.command) {
      options.command = arg;
      continue;
    }

    if (!options.input) {
      options.input = arg;
    }
  }

  return options;
}

function applyOption(options: CliOptions, key: string, value: string): void {
  switch (key) {
    case "model":
      options.model = value;
      break;
    case "output":
      options.output = value;
      break;
    case "host":
      options.host = value;
      break;
    case "slides": {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 40) {
        throw new Error("--slides must be a number between 1 and 40.");
      }
      options.slides = parsed;
      break;
    }
    case "help":
    case "h":
      printHelp();
      process.exit(0);
    default:
      throw new Error(`Unknown option: --${key}`);
  }
}

function printHelp(): void {
  console.log(`Local Deck AI

Usage:
  local-deck-ai generate <input-file> [options]

Options:
  --model <name>       Ollama model name. Default: qwen3:8b
  --output <path>      Output PPTX path. Default: output/deck.pptx
  --host <url>         Ollama host. Default: http://localhost:11434
  --slides <number>    Target slide count. Default: 8
  --help               Show this help message

Examples:
  npm run generate -- examples/ai-training.md --model qwen3:8b
  npm run dev -- generate examples/ai-training.md --output output/demo.pptx
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
