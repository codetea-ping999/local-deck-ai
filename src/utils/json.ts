export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = stripMarkdownFence(trimmed).replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    for (const candidate of findJsonObjects(withoutFence)) {
      try {
        return JSON.parse(candidate);
      } catch {
        // Try the next balanced object. Models sometimes include an example before the answer.
      }
    }

    const preview = withoutFence.replace(/\s+/g, " ").slice(0, 240);
    throw new Error(
      `No valid JSON object was found in the LLM output.${preview ? ` Response preview: ${preview}` : " The response was empty."}`
    );
  }
}

function findJsonObjects(text: string): string[] {
  const candidates: string[] = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        candidates.push(text.slice(start, index + 1));
        break;
      }
    }
  }
  return candidates;
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
