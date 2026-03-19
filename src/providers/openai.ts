import OpenAI from 'openai';
import type { ChatParams, ChatChunk, Provider, ToolDef } from '../types/index.js';
import type { ProviderConfig } from '../types/index.js';

export class OpenAIProvider implements Provider {
  name = 'openai';
  private client: OpenAI;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      baseURL: config.baseUrl
    });
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (params.system) {
      messages.push({ role: 'system', content: params.system });
    }

    for (const msg of params.messages) {
      if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId!,
          content: msg.content
        });
      } else if (msg.role === 'assistant' && msg.toolCalls) {
        messages.push({
          role: 'assistant',
          content: msg.content,
          tool_calls: msg.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments }
          }))
        });
      } else {
        messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
      }
    }

    const tools: OpenAI.ChatCompletionTool[] | undefined = params.tools?.map((t: ToolDef) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    const stream = await this.client.chat.completions.create({
      model: params.model,
      messages,
      tools: tools?.length ? tools : undefined,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens,
      stream: true
    });

    let toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { type: 'text', content: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index ?? 0;
          if (!toolCalls.has(index)) {
            toolCalls.set(index, { id: tc.id || '', name: tc.function?.name || '', arguments: '' });
          }
          const existing = toolCalls.get(index)!;
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        }
      }
    }

    for (const tc of toolCalls.values()) {
      yield {
        type: 'tool_call',
        toolCall: { id: tc.id, name: tc.name, arguments: tc.arguments }
      };
    }

    yield { type: 'done' };
  }

  async listModels(): Promise<string[]> {
    const models = await this.client.models.list();
    return models.data.map(m => m.id).filter(id => id.startsWith('gpt'));
  }
}
