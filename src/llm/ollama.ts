export type OllamaGenerateOptions = {
  model: string;
  prompt: string;
  temperature?: number;
};

export class OllamaClient {
  constructor(private readonly host = "http://localhost:11434") {}

  async generate(options: OllamaGenerateOptions): Promise<string> {
    const response = await fetch(`${this.host}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        stream: false,
        format: "json",
        options: {
          temperature: options.temperature ?? 0.2
        }
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Ollama request failed: ${response.status} ${response.statusText}${
          body ? `\n${body}` : ""
        }`
      );
    }

    const data = (await response.json()) as { response?: unknown };

    if (typeof data.response !== "string") {
      throw new Error("Ollama response did not contain a string response field.");
    }

    return data.response;
  }
}
