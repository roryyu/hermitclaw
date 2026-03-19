import type { Provider, Message, ChatChunk } from '../types/index.js';
import { getToolDefs, getTool } from './tools.js';
import { estimateTokens, truncateMessages } from './tokens.js';

export interface AgentResult {
  messages: Message[];
  totalTokens?: number;
}

export class Agent {
  private provider: Provider;
  private model: string;
  private systemPrompt: string;
  private maxHistoryTokens: number;
  private maxTokens: number;

  constructor(
    provider: Provider,
    model: string,
    systemPrompt: string,
    maxHistoryTokens: number = 100000,
    maxTokens: number = 4096
  ) {
    this.provider = provider;
    this.model = model;
    this.systemPrompt = systemPrompt;
    this.maxHistoryTokens = maxHistoryTokens;
    this.maxTokens = maxTokens;
  }

  async *run(
    messages: Message[],
    onChunk?: (chunk: ChatChunk) => void
  ): AsyncIterable<ChatChunk> {
    const systemTokens = estimateTokens(this.systemPrompt);
    const truncatedMessages = truncateMessages(messages, this.maxHistoryTokens, systemTokens) as Message[];
    const toolDefs = getToolDefs();

    const params = {
      model: this.model,
      messages: truncatedMessages,
      system: this.systemPrompt,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      maxTokens: this.maxTokens
    };

    let assistantContent = '';
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

    for await (const chunk of this.provider.chat(params)) {
      onChunk?.(chunk);
      yield chunk;

      if (chunk.type === 'text' && chunk.content) {
        assistantContent += chunk.content;
      } else if (chunk.type === 'tool_call' && chunk.toolCall) {
        toolCalls.push(chunk.toolCall);
      } else if (chunk.type === 'done') {
        break;
      }
    }

    if (toolCalls.length > 0) {
      const assistantMsg: Message = {
        role: 'assistant',
        content: assistantContent,
        toolCalls
      };
      messages.push(assistantMsg);

      for (const tc of toolCalls) {
        const tool = getTool(tc.name);
        let resultContent: string;

        if (tool) {
          try {
            const args = JSON.parse(tc.arguments);
            resultContent = await tool.execute(args);
          } catch (error: unknown) {
            const err = error as { message?: string };
            resultContent = `Tool error: ${err.message || 'Unknown error'}`;
          }
        } else {
          resultContent = `Unknown tool: ${tc.name}`;
        }

        const toolMsg: Message = {
          role: 'tool',
          content: resultContent,
          toolCallId: tc.id
        };
        messages.push(toolMsg);
      }

      yield* this.run(messages, onChunk);
    }
  }
}
