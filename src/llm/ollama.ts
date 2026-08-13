export type OllamaGenerateOptions = {
  model: string;
  prompt: string;
  temperature?: number;
};

export type OllamaModel = {
  name: string;
  size?: number;
  modifiedAt?: string;
};

export type GenerateClient = {
  generate(options: OllamaGenerateOptions): Promise<string>;
};

export type OllamaEmbedOptions = {
  model: string;
  input: string | string[];
};

export type EmbedClient = {
  embed(options: OllamaEmbedOptions): Promise<number[][]>;
};

export class OllamaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly hint?: string
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

export class OllamaClient {
  constructor(private readonly host = "http://localhost:11434", private readonly timeoutMs = 600_000) {}

  async listModels(): Promise<OllamaModel[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try {
      response = await fetch(`${this.host}/api/tags`, { signal: controller.signal });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      throw new OllamaError(
        timedOut
          ? `Ollamaから5秒以内に応答がありません: ${this.host}`
          : `Ollama に接続できません: ${this.host}`,
        undefined,
        "ollama serve を実行し、画面のOllamaホストURLを確認してください。"
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new OllamaError(
        `Ollama model list failed: ${response.status} ${response.statusText}`,
        response.status,
        "ollama serve が起動しているか、OllamaホストURLを確認してください。"
      );
    }
    let data: { models?: Array<{ name?: unknown; size?: unknown; modified_at?: unknown }> };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      throw new OllamaError(
        `Ollama model list returned invalid JSON: ${this.host}`,
        response.status,
        "Ollamaを再起動し、モデル一覧を確認してください。"
      );
    }
    return (data.models ?? [])
      .filter((model): model is { name: string; size?: number; modified_at?: string } => typeof model.name === "string")
      .map((model) => ({
        name: model.name,
        size: typeof model.size === "number" ? model.size : undefined,
        modifiedAt: typeof model.modified_at === "string" ? model.modified_at : undefined
      }));
  }

  async generate(options: OllamaGenerateOptions): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.host}/api/generate`, {
        method: "POST",
        signal: controller.signal,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        stream: false,
        format: "json",
        think: false,
        options: {
          temperature: options.temperature ?? 0.2
        }
      })
      });
    } catch (error) {
      clearTimeout(timeout);
      throw new OllamaError(
        error instanceof Error && error.name === "AbortError"
          ? `Ollamaへのリクエストが${Math.round(this.timeoutMs / 1000)}秒でタイムアウトしました: ${this.host}`
          : `Ollama に接続できません: ${this.host}`,
        undefined,
        error instanceof Error && error.name === "AbortError"
          ? "モデルの応答に時間がかかっています。--timeout を長くするか、より小さいモデルを選択してください。"
          : "ollama serve を実行し、ホストURLを確認してください。"
      );
    }
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const hint = response.status === 404 && body.includes("model")
        ? `モデル「${options.model}」が見つかりません。ollama list で確認するか、ollama pull ${options.model} を実行してください。`
        : undefined;
      throw new OllamaError(
        `Ollama request failed: ${response.status} ${response.statusText}${
          body ? `\n${body}` : ""
        }`,
        response.status,
        hint
      );
    }

    let data: { response?: unknown };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      throw new OllamaError(
        `Ollama returned invalid JSON for model "${options.model}".`,
        response.status,
        "Ollamaとモデルが正常に動作しているか確認してください。"
      );
    }

    if (typeof data.response !== "string") {
      throw new OllamaError(
        `Ollama response did not contain a string response field for model "${options.model}".`,
        undefined,
        "使用中のモデルがOllamaのJSON応答に対応しているか確認してください。"
      );
    }

    if (!data.response.trim()) {
      throw new OllamaError(
        `Ollamaモデル「${options.model}」から空の応答が返りました。`,
        undefined,
        "モデルが正常に応答できるか確認し、GUIで別の導入済みモデル（例: gemma4:26b）を選択してください。"
      );
    }

    return data.response;
  }

  async embed(options: OllamaEmbedOptions): Promise<number[][]> {
    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    if (!options.model.trim()) throw new OllamaError("Embedding model must not be empty.");
    if (inputs.length === 0 || inputs.some((input) => !input.trim())) throw new OllamaError("Embedding input must not be empty.");

    const modern = await this.requestJson(`${this.host}/api/embed`, { model: options.model, input: options.input });
    if (modern.response.ok) {
      const data = modern.data as { embeddings?: unknown; embedding?: unknown };
      const vectors = normalizeEmbeddings(data.embeddings ?? data.embedding);
      if (vectors.length === 0) throw new OllamaError(`Ollama returned an empty embedding for model "${options.model}".`);
      return vectors;
    }
    if (modern.response.status !== 404 && modern.response.status !== 405) {
      throw await this.httpError("Ollama embedding request", modern.response, options.model);
    }

    const vectors: number[][] = [];
    for (const input of inputs) {
      const legacy = await this.requestJson(`${this.host}/api/embeddings`, { model: options.model, prompt: input });
      if (!legacy.response.ok) throw await this.httpError("Ollama embedding request", legacy.response, options.model);
      const data = legacy.data as { embedding?: unknown };
      const vector = normalizeEmbeddings(data.embedding)[0];
      if (!vector) throw new OllamaError(`Ollama returned an empty embedding for model "${options.model}".`);
      vectors.push(vector);
    }
    return vectors;
  }

  private async requestJson(url: string, body: unknown): Promise<{ response: Response; data: unknown }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { method: "POST", signal: controller.signal, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch (error) {
      clearTimeout(timeout);
      const timedOut = error instanceof Error && error.name === "AbortError";
      throw new OllamaError(
        timedOut ? `Ollamaへのリクエストが${Math.round(this.timeoutMs / 1000)}秒でタイムアウトしました: ${this.host}` : `Ollama に接続できません: ${this.host}`,
        undefined,
        timedOut ? "モデルの応答に時間がかかっています。--timeout を長くするか、より小さいモデルを選択してください。" : "ollama serve を実行し、ホストURLを確認してください。"
      );
    }
    clearTimeout(timeout);
    if (!response.ok) return { response, data: undefined };
    try { return { response, data: await response.json() }; }
    catch { throw new OllamaError(`Ollama returned invalid JSON from ${new URL(url).pathname}.`, response.status); }
  }

  private async httpError(operation: string, response: Response, model: string): Promise<OllamaError> {
    const body = await response.text().catch(() => "");
    return new OllamaError(`${operation} failed: ${response.status} ${response.statusText}${body ? `\n${body}` : ""}`, response.status, response.status === 404 ? `モデル「${model}」が見つかりません。ollama pull ${model} を実行してください。` : undefined);
  }
}

function normalizeEmbeddings(value: unknown): number[][] {
  if (Array.isArray(value) && value.every((item) => typeof item === "number")) return [value as number[]];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number[] => Array.isArray(item) && item.every((component) => typeof component === "number"));
}
