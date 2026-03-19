import type { ChatParams, ChatChunk, Provider, ToolDef } from '../types/index.js';
import type { ProviderConfig } from '../types/index.js';

interface OllamaMessage {
  role: string;
  content: string;
  tool_calls?: Array<{
    function: { name: string; arguments: Record<string, unknown> };
  }>;
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required?: string[];
    };
  };
}

export class OllamaProvider implements Provider {
  name = 'ollama';
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    const messages: OllamaMessage[] = [];

    if (params.system) {
      messages.push({ role: 'system', content: params.system });
    }

    for (const msg of params.messages) {
      if (msg.role === 'tool') {
        messages.push({ role: 'tool', content: msg.content });
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const tools: OllamaTool[] | undefined = params.tools?.map((t: ToolDef) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));

    const body: Record<string, unknown> = {
      model: params.model,
      messages,
      stream: true,
      options: {
        temperature: params.temperature ?? 0.7
      }
    };

    if (tools?.length) {
      body.tools = tools;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);

          if (data.message?.content) {
            yield { type: 'text', content: data.message.content };
          }

          if (data.message?.tool_calls) {
            for (const tc of data.message.tool_calls) {
              yield {
                type: 'tool_call',
                toolCall: {
                  id: `ollama_${Date.now()}`,
                  name: tc.function.name,
                  arguments: JSON.stringify(tc.function.arguments)
                }
              };
            }
          }

          if (data.done) {
            yield { type: 'done' };
          }
        } catch {
        }
      }
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      const data = await response.json() as { models?: Array<{ name: string }> };
      return data.models?.map(m => m.name) || [];
    } catch {
      return [];
    }
  }
}
