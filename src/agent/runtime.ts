import type { Provider, Message, ChatChunk } from '../types/index.js';
import { getToolDefs, getTool, MAX_TOOL_ITERATIONS } from './tools.js';
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

  /**
   * 运行 Agent 对话
   * @param messages 消息历史
   * @param onChunk 可选的 chunk 回调
   * @param iteration 当前迭代次数（内部使用）
   */
  async *run(
    messages: Message[],
    onChunk?: (chunk: ChatChunk) => void,
    iteration: number = 0
  ): AsyncIterable<ChatChunk> {
    // 检查迭代深度限制
    if (iteration >= MAX_TOOL_ITERATIONS) {
      yield {
        type: 'text',
        content: `\n[Warning: Maximum tool iterations (${MAX_TOOL_ITERATIONS}) reached. Stopping to prevent infinite loops.]`
      };
      yield { type: 'done' };
      return;
    }
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

      // 记录工具调用信息
      yield {
        type: 'text',
        content: `\n[Tool iteration ${iteration + 1}/${MAX_TOOL_ITERATIONS}]`
      };

      // 递归调用，增加迭代计数
      yield* this.run(messages, onChunk, iteration + 1);
    }
  }
}
