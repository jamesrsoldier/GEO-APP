import { EngineType } from '@/types';
import { EngineAdapter } from './types';
import { PerplexityAdapter } from './perplexity';
import { DataForSeoAdapter } from './dataforseo';

const adapters: Partial<Record<EngineType, () => EngineAdapter>> = {
  perplexity: () => new PerplexityAdapter(),
  google_ai_overview: () => new DataForSeoAdapter(),
  // chatgpt, bing_copilot, claude — not implemented in MVP
};

export function getAdapter(engineType: EngineType): EngineAdapter {
  const factory = adapters[engineType];
  if (!factory) {
    throw new Error(`Engine adapter not implemented: ${engineType}`);
  }
  return factory();
}

export function getAvailableEngines(): EngineType[] {
  return Object.keys(adapters) as EngineType[];
}

export { type EngineAdapter, type EngineResponse } from './types';
export { buildQueryPrompt } from './types';
