我需要从节省token的角度重新审查项目，重点关注消息历史管理、系统提示词、工具调用和模型参数设置等方面。
        
            
toolName: view_files
            
status: success
          
            
filePath: /Users/roryyu/Downloads/code/opencode-app/hermitclaw/src/agent/runtime.ts
          
我需要检查配置文件，看看maxHistoryTokens的默认设置和使用情况。
        
            
toolName: view_files
            
status: success
          
            
filePath: /Users/roryyu/Downloads/code/opencode-app/hermitclaw/src/config/index.ts
          
让我检查types文件，确认AgentConfig的定义，并查看是否有其他与token管理相关的类型。
        
            
toolName: view_files
            
status: success
          
            
filePath: /Users/roryyu/Downloads/code/opencode-app/hermitclaw/src/types/index.ts
          
让我检查一下CLI聊天命令的实现，看看是否有与token管理相关的逻辑。
        
            
toolName: view_files
            
status: success
          
            
filePath: /Users/roryyu/Downloads/code/opencode-app/hermitclaw/src/cli/chat.ts
          
让我检查一下网关处理消息发送的逻辑，看看是否有与token管理相关的代码。
        
            
toolName: view_files
            
status: success
          
            
filePath: /Users/roryyu/Downloads/code/opencode-app/hermitclaw/src/gateway/handlers.ts
          
# Hermitclaw 项目 Token 节省分析报告

## 1. 现状分析

通过对项目代码的全面审查，我发现 Hermitclaw 在 token 管理方面存在以下问题：

### 1.1 消息历史管理缺失
- **问题**：虽然配置文件中定义了 `maxHistoryTokens: 100000`，但实际代码中没有任何使用该配置的逻辑
- **影响**：所有对话历史都会被完整发送给模型，随着对话长度增加，token 消耗会急剧增长

### 1.2 系统提示词未优化
- **问题**：系统提示词是固定的，没有根据上下文动态调整
- **影响**：无论对话场景如何，都会发送相同的系统提示词，可能包含不必要的信息

### 1.3 工具定义重复发送
- **问题**：每次调用 `Agent.run()` 时，都会完整发送所有工具定义
- **影响**：工具定义通常包含大量描述性文本，会导致额外的 token 消耗

### 1.4 Anthropic 重复请求问题
- **问题**：AnthropicProvider 同时发送流式和非流式请求
- **影响**：会导致双重 token 消耗，大幅增加成本

### 1.5 模型参数未优化
- **问题**：没有设置 `max_tokens` 的默认优化值
- **影响**：模型可能生成比实际需要更长的响应

## 2. Token 节省建议

### 2.1 实现消息历史截断功能

```typescript
// 改进建议 - src/agent/runtime.ts
import type { Provider, Message, ChatChunk } from '../types/index.js';
import { getToolDefs, getTool } from './tools.js';
import { estimateTokens } from './tokenUtils.js'; // 需要实现

export class Agent {
  private provider: Provider;
  private model: string;
  private systemPrompt: string;
  private maxHistoryTokens: number;

  constructor(provider: Provider, model: string, systemPrompt: string, maxHistoryTokens: number = 100000) {
    this.provider = provider;
    this.model = model;
    this.systemPrompt = systemPrompt;
    this.maxHistoryTokens = maxHistoryTokens;
  }

  // 新增方法：截断消息历史
  private truncateMessageHistory(messages: Message[]): Message[] {
    let totalTokens = estimateTokens(this.systemPrompt);
    const truncatedMessages: Message[] = [];

    // 从最新消息开始，向前添加直到达到token限制
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgTokens = estimateTokens(msg.content);
      
      if (totalTokens + msgTokens <= this.maxHistoryTokens) {
        truncatedMessages.unshift(msg);
        totalTokens += msgTokens;
      } else {
        // 如果消息本身超过限制，截断内容
        const remainingTokens = this.maxHistoryTokens - totalTokens;
        if (remainingTokens > 0) {
          // 这里需要实现智能截断，保持消息的语义完整性
          const truncatedContent = this.truncateContent(msg.content, remainingTokens);
          truncatedMessages.unshift({ ...msg, content: truncatedContent });
        }
        break;
      }
    }

    return truncatedMessages;
  }

  async *run(
    messages: Message[],
    onChunk?: (chunk: ChatChunk) => void
  ): AsyncIterable<ChatChunk> {
    const truncatedMessages = this.truncateMessageHistory(messages);
    const toolDefs = getToolDefs();

    const params = {
      model: this.model,
      messages: truncatedMessages,
      system: this.systemPrompt,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      max_tokens: 1000, // 添加默认max_tokens限制
    };

    // 其余代码保持不变...
  }

  // 新增方法：截断内容
  private truncateContent(content: string, maxTokens: number): string {
    // 实现基于token的内容截断逻辑
    // 可以使用第三方库如tiktoken或类似工具
    return content; // 临时实现
  }
}
```

### 2.2 实现工具定义优化

```typescript
// 改进建议 - src/agent/tools.ts
// 实现工具定义缓存和按需发送
let cachedToolDefs: ToolDef[] | null = null;

export function getToolDefs(onlyEssential: boolean = false): ToolDef[] {
  if (!cachedToolDefs) {
    cachedToolDefs = tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }

  if (onlyEssential) {
    // 只返回最常用的工具定义
    return cachedToolDefs.filter(tool => ['read_file', 'write_file'].includes(tool.name));
  }

  return cachedToolDefs;
}
```

### 2.3 修复 Anthropic 重复请求问题

```typescript
// 改进建议 - src/providers/anthropic.ts
async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
  // ... 现有代码 ...

  const stream = await this.client.messages.create({
    model: params.model,
    max_tokens: params.maxTokens ?? 4096,
    system: params.system,
    messages,
    tools: tools?.length ? tools : undefined,
    stream: true
  });

  let finalContent: Anthropic.ContentBlock[] = [];
  let currentBlock: Anthropic.ContentBlock | null = null;

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      if (!currentBlock) {
        currentBlock = {
          type: event.content_block.type,
          text: ''
        };
      }
      
      if (event.delta.type === 'text_delta') {
        const deltaText = event.delta.text;
        (currentBlock as Anthropic.TextBlock).text += deltaText;
        yield { type: 'text', content: deltaText };
      }
    } else if (event.type === 'content_block_stop') {
      if (currentBlock) {
        finalContent.push(currentBlock);
        currentBlock = null;
      }
    } else if (event.type === 'message_stop') {
      // 从finalContent中提取工具调用
      for (const block of finalContent) {
        if (block.type === 'tool_use') {
          yield {
            type: 'tool_call',
            toolCall: {
              id: block.id,
              name: block.name,
              arguments: JSON.stringify(block.input)
            }
          };
        }
      }
      yield { type: 'done' };
    }
  }
}
```

### 2.4 实现系统提示词优化

```typescript
// 改进建议 - src/agent/runtime.ts
// 动态调整系统提示词
private optimizeSystemPrompt(messages: Message[]): string {
  // 根据对话历史调整系统提示词
  // 例如，如果最近的消息涉及文件操作，可以强化相关指令
  const recentMessages = messages.slice(-5);
  const hasFileOperation = recentMessages.some(msg => 
    msg.content.includes('file') || msg.content.includes('read') || msg.content.includes('write')
  );

  if (hasFileOperation) {
    return `${this.systemPrompt} When working with files, always double-check paths and file contents before making changes.`;
  }

  return this.systemPrompt;
}

async *run(
  messages: Message[],
  onChunk?: (chunk: ChatChunk) => void
): AsyncIterable<ChatChunk> {
  const truncatedMessages = this.truncateMessageHistory(messages);
  const optimizedSystemPrompt = this.optimizeSystemPrompt(truncatedMessages);
  // ... 其余代码 ...
}
```

## 3. Token 管理工具实现建议

为了支持上述优化，需要实现一个 token 估算工具：

```typescript
// 建议新增文件 - src/agent/tokenUtils.ts
import { encodingForModel } from 'tiktoken';

// 缓存不同模型的编码
const encodings: Record<string, any> = {};

export function estimateTokens(text: string, model: string = 'gpt-4o'): number {
  try {
    if (!encodings[model]) {
      encodings[model] = encodingForModel(model);
    }
    const tokens = encodings[model].encode(text);
    return tokens.length;
  } catch (error) {
    // 如果模型不支持，使用简单的字符计数估算
    // 平均每个token约4个字符
    return Math.ceil(text.length / 4);
  }
}

export function estimateMessageTokens(message: { role: string; content: string }, model: string = 'gpt-4o'): number {
  const roleTokens = estimateTokens(message.role, model);
  const contentTokens = estimateTokens(message.content, model);
  return roleTokens + contentTokens + 4; // 每条消息的额外开销
}
```

## 4. 总结

通过实施上述优化措施，Hermitclaw 可以显著减少 token 消耗，降低 API 调用成本：

1. **消息历史截断**：避免发送不必要的历史消息，控制上下文长度
2. **工具定义优化**：只发送必要的工具定义，减少重复内容
3. **修复重复请求**：消除 Anthropic 提供商的双重请求问题
4. **系统提示词优化**：根据上下文动态调整提示词，避免不必要的信息
5. **模型参数优化**：设置合理的 `max_tokens` 默认值，避免过长响应

这些优化不仅可以节省 token 成本，还能提高模型响应速度，改善用户体验。建议优先实施消息历史截断和修复 Anthropic 重复请求问题，这两项措施可以带来最显著的 token 节省效果。