/** Infers an LLM provider slug from a bare model name (openai-style default). */
export function inferProviderFromModelName(modelName: string): string {
  const lower = modelName.toLowerCase();
  if (lower.startsWith("claude") || lower.includes("anthropic")) {
    return "anthropic";
  }
  if (lower.startsWith("gemini") || lower.includes("google")) {
    return "google";
  }
  return "openai";
}
