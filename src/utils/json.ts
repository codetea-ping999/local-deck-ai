export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = stripMarkdownFence(trimmed);

  try {
    return JSON.parse(withoutFence);
  } catch {
    const firstBrace = withoutFence.indexOf("{");
    const lastBrace = withoutFence.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("No JSON object was found in the LLM output.");
    }

    const candidate = withoutFence.slice(firstBrace, lastBrace + 1);
    return JSON.parse(candidate);
  }
}

function stripMarkdownFence(text: string): string {
  if (!text.startsWith("```")) {
    return text;
  }

  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
