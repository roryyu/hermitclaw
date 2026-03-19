import type { ChatParams, ChatChunk, Provider } from '../types/index.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { OllamaProvider } from './ollama.js';
import type { ProviderConfig } from '../types/index.js';

const providerFactories: Record<string, new (config: ProviderConfig) => Provider> = {
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  ollama: OllamaProvider
};

export function createProvider(name: string, config: ProviderConfig): Provider {
  const Factory = providerFactories[name];
  if (!Factory) {
    throw new Error(`Unknown provider: ${name}. Available: ${Object.keys(providerFactories).join(', ')}`);
  }
  return new Factory(config);
}

export function listProviders(): string[] {
  return Object.keys(providerFactories);
}
