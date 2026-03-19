export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface ChatParams {
  model: string;
  messages: Message[];
  system?: string;
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
}

export interface ChatChunk {
  type: 'text' | 'tool_call' | 'done';
  content?: string;
  toolCall?: ToolCall;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export interface Provider {
  name: string;
  chat(params: ChatParams): AsyncIterable<ChatChunk>;
  listModels(): Promise<string[]>;
}

export interface Session {
  id: string;
  name: string;
  provider: string;
  model: string;
  messages: Message[];
  systemPrompt: string;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

export type GatewayMessageType =
  | 'session.create'
  | 'session.list'
  | 'session.get'
  | 'session.delete'
  | 'session.send';

export interface GatewayMessage {
  type: GatewayMessageType;
  id?: string;
  payload: Record<string, unknown>;
}

export interface GatewayResponse {
  type: string;
  id?: string;
  payload: Record<string, unknown>;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel: string;
}

export interface GatewayConfig {
  port: number;
  host: string;
}

export interface AgentConfig {
  defaultProvider: string;
  systemPrompt: string;
  maxHistoryTokens: number;
  maxTokens: number;
}

export interface FeishuChannelConfig {
  appId: string;
  appSecret: string;
}

export interface ChannelsConfig {
  feishu?: FeishuChannelConfig;
}

export interface HermitConfig {
  gateway: GatewayConfig;
  providers: Record<string, ProviderConfig>;
  agent: AgentConfig;
  channels?: ChannelsConfig;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: ToolDef['parameters'];
  execute: (params: Record<string, unknown>) => Promise<string>;
}
