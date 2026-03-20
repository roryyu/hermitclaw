import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { HermitConfig, ProviderConfig } from '../types/index.js';

const CONFIG_DIR = join(homedir(), '.hermitclaw');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// ============ 配置验证 ============

function validateConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be an object'] };
  }

  const cfg = config as Record<string, unknown>;

  // 验证 gateway 配置
  if (cfg.gateway && typeof cfg.gateway === 'object') {
    const gateway = cfg.gateway as Record<string, unknown>;
    if (gateway.port !== undefined && (typeof gateway.port !== 'number' || gateway.port < 1 || gateway.port > 65535)) {
      errors.push('gateway.port must be a number between 1 and 65535');
    }
    if (gateway.host !== undefined && typeof gateway.host !== 'string') {
      errors.push('gateway.host must be a string');
    }
    if (gateway.authToken !== undefined && typeof gateway.authToken !== 'string') {
      errors.push('gateway.authToken must be a string');
    }
  }

  // 验证 providers 配置
  if (cfg.providers && typeof cfg.providers === 'object') {
    const providers = cfg.providers as Record<string, unknown>;
    for (const [name, provider] of Object.entries(providers)) {
      if (!provider || typeof provider !== 'object') {
        errors.push(`providers.${name} must be an object`);
        continue;
      }
      const p = provider as Record<string, unknown>;
      if (p.apiKey !== undefined && typeof p.apiKey !== 'string') {
        errors.push(`providers.${name}.apiKey must be a string`);
      }
      if (p.baseUrl !== undefined && typeof p.baseUrl !== 'string') {
        errors.push(`providers.${name}.baseUrl must be a string`);
      }
      if (p.defaultModel !== undefined && typeof p.defaultModel !== 'string') {
        errors.push(`providers.${name}.defaultModel must be a string`);
      }
    }
  }

  // 验证 agent 配置
  if (cfg.agent && typeof cfg.agent === 'object') {
    const agent = cfg.agent as Record<string, unknown>;
    if (agent.defaultProvider !== undefined && typeof agent.defaultProvider !== 'string') {
      errors.push('agent.defaultProvider must be a string');
    }
    if (agent.defaultModel !== undefined && typeof agent.defaultModel !== 'string') {
      errors.push('agent.defaultModel must be a string');
    }
    if (agent.systemPrompt !== undefined && typeof agent.systemPrompt !== 'string') {
      errors.push('agent.systemPrompt must be a string');
    }
    if (agent.maxHistoryTokens !== undefined && (typeof agent.maxHistoryTokens !== 'number' || agent.maxHistoryTokens < 1)) {
      errors.push('agent.maxHistoryTokens must be a positive number');
    }
    if (agent.maxTokens !== undefined && (typeof agent.maxTokens !== 'number' || agent.maxTokens < 1)) {
      errors.push('agent.maxTokens must be a positive number');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

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
    try {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      const userConfig = JSON.parse(raw);
      
      // 验证配置
      const validation = validateConfig(userConfig);
      if (!validation.valid) {
        console.error('Invalid config file:');
        validation.errors.forEach(e => console.error(`  - ${e}`));
        console.error('Using default config');
      } else {
        config = mergeConfig(DEFAULT_CONFIG, userConfig);
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(`Failed to load config file: ${err.message}`);
      console.error('Using default config');
    }
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

  // Gateway 认证令牌
  if (process.env.HERMITCLAW_AUTH_TOKEN) {
    config.gateway = {
      ...config.gateway,
      authToken: process.env.HERMITCLAW_AUTH_TOKEN
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

  const result: HermitConfig = {
    gateway: { ...base.gateway, ...override.gateway },
    providers: mergedProviders,
    agent: { ...base.agent, ...override.agent }
  };

  // 合并 channels 配置
  if (base.channels || override.channels) {
    result.channels = {
      ...base.channels,
      ...override.channels
    };
  }

  return result;
}
