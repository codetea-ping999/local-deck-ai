#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OllamaClient, OllamaError } from "../llm/ollama.js";
import { readDocument } from "../parser/readDocument.js";
import { generatePresentation } from "../pipeline/generatePresentation.js";
import { renderPresentationToPptx } from "../renderer/pptx.js";
import { startGuiServer } from "../gui/server.js";
import { loadTheme } from "../theme/theme.js";

type CliOptions = {
  command?: string;
  input?: string;
  model: string;
  output: string;
  host: string;
  slides: number;
  port: number;
  theme?: string;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "gui") {
    startGuiServer(options.port);
    return;
  }

  if (options.command === "models") {
    const models = await new OllamaClient(options.host).listModels();
    if (models.length === 0) console.log("モデルが見つかりません。ollama pull <model> で追加してください。");
    else models.forEach((model) => console.log(model.name));
    return;
  }

  if (options.command !== "generate" || !options.input) {
    printHelp();
    process.exit(options.command ? 1 : 0);
  }

  const inputPath = resolve(options.input);
  const outputPath = resolve(options.output);

  console.log(`• Loading document: ${inputPath}`);
  const document = await readDocument(inputPath);
  console.log(`• Using model: ${options.model}`);

  console.log(`• Generating deck with Ollama model: ${options.model}`);
  const client = new OllamaClient(options.host);
  const presentation = await generatePresentation({
    document,
    client,
    model: options.model,
    targetSlideCount: options.slides,
    onProgress: (message, percent) => console.log(`  [${percent}%] ${message}`)
  });

  console.log(`• Rendering ${presentation.slides.length} slides to: ${outputPath}`);
  await renderPresentationToPptx(presentation, outputPath, (message, percent) => console.log(`  [${percent}%] ${message}`), await loadTheme(options.theme));

  console.log("✓ Done");
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    model: "qwen3:8b",
    output: "output/deck.pptx",
    host: "http://localhost:11434",
    slides: 8,
    port: 4173
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
    case "port": {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error("--port must be a number between 1 and 65535.");
      }
      options.port = parsed;
      break;
    }
    case "theme": options.theme = value; break;
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
  local-deck-ai models [--host <url>]
  local-deck-ai gui

Options:
  --model <name>       Ollama model name. Default: qwen3:8b
  --output <path>      Output PPTX path. Default: output/deck.pptx
  --host <url>         Ollama host. Default: http://localhost:11434
  --slides <number>    Target slide count. Default: 8
  --port <number>      GUI port. Default: 4173
  --theme <path>       Theme JSON path (optional)
  --help               Show this help message

Examples:
  npm run generate -- examples/ai-training.md --model qwen3:8b
  npm run dev -- models
  npm run gui
  npm run dev -- generate examples/ai-training.md --output output/demo.pptx
`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    if (error instanceof OllamaError && error.hint) console.error(`${error.message}\nヒント: ${error.hint}`);
    else console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
