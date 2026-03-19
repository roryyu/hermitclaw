import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { HermitConfig, ProviderConfig } from '../types/index.js';

const CONFIG_DIR = join(homedir(), '.hermitclaw');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: HermitConfig = {
  gateway: {
    port: 19000,
    host: '127.0.0.1'
  },
  providers: {
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o'
    },
    anthropic: {
      baseUrl: 'https://api.anthropic.com',
      defaultModel: 'claude-sonnet-4-20250514'
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      defaultModel: 'llama3'
    }
  },
  agent: {
    defaultProvider: 'openai',
    systemPrompt: 'You are a helpful assistant.',
    maxHistoryTokens: 100000,
    maxTokens: 4096
  }
};

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function loadConfig(): HermitConfig {
  let config = DEFAULT_CONFIG;

  if (existsSync(CONFIG_FILE)) {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const userConfig = JSON.parse(raw);
    config = mergeConfig(DEFAULT_CONFIG, userConfig);
  }

  if (process.env.OPENAI_API_KEY) {
    config.providers.openai = {
      ...config.providers.openai,
      apiKey: process.env.OPENAI_API_KEY
    };
  }

  if (process.env.OPENAI_BASE_URL) {
    config.providers.openai = {
      ...config.providers.openai,
      baseUrl: process.env.OPENAI_BASE_URL
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    config.providers.anthropic = {
      ...config.providers.anthropic,
      apiKey: process.env.ANTHROPIC_API_KEY
    };
  }

  if (process.env.ANTHROPIC_BASE_URL) {
    config.providers.anthropic = {
      ...config.providers.anthropic,
      baseUrl: process.env.ANTHROPIC_BASE_URL
    };
  }

  if (process.env.OLLAMA_BASE_URL) {
    config.providers.ollama = {
      ...config.providers.ollama,
      baseUrl: process.env.OLLAMA_BASE_URL
    };
  }

  if (process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET) {
    config.channels = {
      ...config.channels,
      feishu: {
        appId: process.env.FEISHU_APP_ID,
        appSecret: process.env.FEISHU_APP_SECRET
      }
    };
  }

  return config;
}

export function saveConfig(config: HermitConfig): void {
  const dir = dirname(CONFIG_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function mergeConfig(base: HermitConfig, override: Partial<HermitConfig>): HermitConfig {
  const mergedProviders: Record<string, ProviderConfig> = {};

  for (const [name, baseProvider] of Object.entries(base.providers)) {
    const overrideProvider = override.providers?.[name];
    mergedProviders[name] = overrideProvider
      ? { ...baseProvider, ...overrideProvider }
      : baseProvider;
  }

  return {
    gateway: { ...base.gateway, ...override.gateway },
    providers: mergedProviders,
    agent: { ...base.agent, ...override.agent }
  };
}
