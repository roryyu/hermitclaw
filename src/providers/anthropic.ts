import Anthropic from '@anthropic-ai/sdk';
import type { ChatParams, ChatChunk, Provider, Message, ToolDef } from '../types/index.js';
import type { ProviderConfig } from '../types/index.js';

export class AnthropicProvider implements Provider {
  name = 'anthropic';
  private client: Anthropic;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      baseURL: config.baseUrl
    });
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const messages: Anthropic.MessageParam[] = [];

    for (const msg of params.messages) {
      if (msg.role === 'tool') {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId!,
              content: msg.content
            }
          ]
        });
      } else if (msg.role === 'assistant' && msg.toolCalls) {
        const content: Anthropic.ContentBlockParam[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.arguments)
          });
        }
        messages.push({ role: 'assistant', content });
      } else {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        });
      }
    }

    const tools: Anthropic.Tool[] | undefined = params.tools?.map((t: ToolDef) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool.InputSchema
    }));

    const stream = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      system: params.system,
      messages,
      tools: tools?.length ? tools : undefined,
      stream: true
    });

    const toolCalls: Map<number, { id: string; name: string; input: string }> = new Map();

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolCalls.set(event.index, {
            id: event.content_block.id,
            name: event.content_block.name,
            input: ''
          });
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text', content: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          const tc = toolCalls.get(event.index);
          if (tc) tc.input += event.delta.partial_json;
        }
      } else if (event.type === 'message_stop') {
        for (const tc of toolCalls.values()) {
          yield {
            type: 'tool_call',
            toolCall: { id: tc.id, name: tc.name, arguments: tc.input }
          };
        }
        yield { type: 'done' };
      }
    }
  }

  async listModels(): Promise<string[]> {
    return ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-opus-4-20250514'];
  }
}
