import type { EngineType } from "@/types";

export const ENGINE_COLORS: Record<EngineType, string> = {
  perplexity: "#20808D",
  google_ai_overview: "#4285F4",
  chatgpt: "#10A37F",
  bing_copilot: "#00BCF2",
  claude: "#D97706",
};

export const ENGINE_LABELS: Record<EngineType, string> = {
  perplexity: "Perplexity",
  google_ai_overview: "AI Overview",
  chatgpt: "ChatGPT",
  bing_copilot: "Bing Copilot",
  claude: "Claude",
};

export const ALL_ENGINES: EngineType[] = [
  "perplexity",
  "google_ai_overview",
  "chatgpt",
  "bing_copilot",
  "claude",
];

export const AI_REFERRAL_SOURCES = [
  "chatgpt.com",
  "perplexity.ai",
  "claude.ai",
  "you.com",
  "phind.com",
  "copilot.microsoft.com",
];
