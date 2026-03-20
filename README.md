# hermitclaw

> Minimal AI assistant - Gateway + CLI + Agent

A simplified version of OpenClaw, built with Node.js.

## Features

- **Gateway**: WebSocket control plane (ws://127.0.0.1:19000)
- **CLI**: Command-line interface for chat and session management
- **Agent**: AI agent with tool support (shell, file read/write)
- **Multi-Provider**: OpenAI, Anthropic, Ollama support
- **Session Management**: Persistent chat sessions (JSON)

## Installation

```bash
cd hermitclaw
npm install
npm run build
```

## Configuration

Configuration is stored in `~/.hermitclaw/config.json`.

### Environment Variables

- `OPENAI_API_KEY` - OpenAI API key
- `OPENAI_BASE_URL` - OpenAI API base URL
- `ANTHROPIC_API_KEY` - Anthropic API key
- `ANTHROPIC_BASE_URL` - Anthropic API base URL
- `OLLAMA_BASE_URL` - Ollama base URL (default: http://localhost:11434)
- `HERMITCLAW_AUTH_TOKEN` - Gateway authentication token
- `HERMITCLAW_WORKSPACE` - Workspace directory for file operations

### Config File Example

```json
{
  "gateway": {
    "port": 19000,
    "host": "127.0.0.1"
  },
  "providers": {
    "openai": {
      "baseUrl": "https://api.openai.com/v1",
      "defaultModel": "gpt-4o",
      "apiKey": "sk-..."
    },
    "anthropic": {
      "baseUrl": "https://api.anthropic.com",
      "defaultModel": "claude-sonnet-4-20250514",
      "apiKey": "sk-ant-..."
    },
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "defaultModel": "llama3"
    }
  },
  "agent": {
    "defaultProvider": "openai",
    "defaultModel": "gpt-4o-mini",
    "systemPrompt": "You are a helpful assistant.",
    "maxHistoryTokens": 100000,
    "maxTokens": 1000
  },
  "channels": {
    "feishu": {
      "appId": "cli_...",
      "appSecret": "...",
      "enabled": true,
      "webhookPort": 19001,
      "webhookPath": "/feishu/webhook"
    }
  }
}
```


## 使用模式

Hermitclaw 支持两种使用模式：

### 模式一：CLI 直接使用（推荐）

**无需启动网关**，直接在命令行中使用：

```bash
# 单次对话
node dist/cli/index.js chat "Hello, how are you?"

# 交互式聊天
node dist/cli/index.js chat --interactive

# 会话管理
node dist/cli/index.js session list
node dist/cli/index.js session create --name "my-project"

# 飞书集成
node dist/cli/index.js feishu send <chat-id> "Hello"
```

### 模式二：Gateway 远程访问

**需要先启动网关**，然后远程客户端通过 WebSocket 连接：

```bash
# 1. 启动网关
node dist/cli/index.js gateway

# 2. 客户端通过 WebSocket 连接 ws://127.0.0.1:19000
#    发送消息进行交互
```

**Gateway 使用场景：**
- 远程访问 AI 服务
- 与其他应用集成
- 多客户端共享同一个 AI 实例

---

## CLI 命令参考

### Chat（聊天）

```bash
# 单次消息
node dist/cli/index.js chat "Hello" --provider openai --model gpt-4o

# 交互式聊天
node dist/cli/index.js chat --interactive --provider anthropic

# 继续已有会话
node dist/cli/index.js chat --interactive --session <session-id>
```

### Session（会话管理）

```bash
# 列出会话
node dist/cli/index.js session list

# 创建会话
node dist/cli/index.js session create --name "coding" --provider openai

# 获取会话详情
node dist/cli/index.js session get <session-id>

# 删除会话
node dist/cli/index.js session delete <session-id>
```

### Gateway（网关）

```bash
# 启动网关（默认端口 19000）
node dist/cli/index.js gateway

# 指定端口和主机
node dist/cli/index.js gateway --port 8080 --host 0.0.0.0
```

### Feishu（飞书 Channel 集成）

飞书集成通过 **Channel 模式** 实现，启动 Gateway 后自动接收飞书消息并回复。

#### 1. 配置飞书 App

在 `~/.hermitclaw/config.json` 中添加飞书配置：

```json
{
  "channels": {
    "feishu": {
      "appId": "cli_xxx",
      "appSecret": "xxx",
      "enabled": true,
      "webhookPort": 19001,
      "webhookPath": "/feishu/webhook"
    }
  }
}
```

#### 2. 配置飞书开发者后台

1. 登录 [飞书开发者后台](https://open.feishu.cn/app)
2. 选择你的应用，进入「事件订阅」
3. 配置请求网址：`http://your-server:19001/feishu/webhook`
4. 订阅事件：`im.message.receive_v1`（接收消息）

#### 3. 启动 Gateway

```bash
node dist/cli/index.js gateway
```

启动后，飞书 Channel 会自动监听消息，当用户在飞书中发送消息给机器人时，Agent 会自动处理并回复。

#### CLI 辅助命令

```bash
# 初始化飞书配置
node dist/cli/index.js feishu init --app-id <id> --app-secret <secret>

# 发送消息
node dist/cli/index.js feishu send <chat-id> "Hello"

# 列出聊天
node dist/cli/index.js feishu chats

# 读取消息
node dist/cli/index.js feishu messages <chat-id> --limit 10
```

---

## Gateway 客户端示例

启动网关后，可以通过 WebSocket 连接：

```javascript
// Node.js 客户端示例
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:19000');

ws.on('open', () => {
  // 如果配置了认证，先发送认证消息
  // ws.send(JSON.stringify({ type: 'auth', token: 'your-token' }));
  
  // 创建会话
  ws.send(JSON.stringify({
    type: 'session.create',
    id: 'req-1',
    payload: { provider: 'openai', model: 'gpt-4o' }
  }));
});

ws.on('message', (data) => {
  const response = JSON.parse(data.toString());
  console.log('Response:', response);
});
```

---



## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      使用模式                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  模式一：CLI 直接使用（无需网关）                            │
│  ┌─────────┐    ┌─────────┐    ┌─────────────┐              │
│  │   CLI   │───▶│  Agent  │───▶│  Providers  │              │
│  └─────────┘    └─────────┘    └─────────────┘              │
│                                                             │
│  模式二：Gateway 远程访问                                    │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌───────────┐  │
│  │ Client  │───▶│Gateway  │───▶│  Agent  │───▶│ Providers │  │
│  │ (WS)    │    │ (WS服务器)│   └─────────┘    └───────────┘  │
│  └─────────┘    └─────────┘                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**组件说明：**
- **CLI**: 命令行界面，直接调用 Agent
- **Gateway**: WebSocket 服务器，用于远程访问
- **Agent**: AI 代理核心，处理对话和工具调用
- **Providers**: AI 提供商（OpenAI、Anthropic、Ollama）

## Built-in Tools

- `shell` - Execute shell commands
- `read_file` - Read file contents
- `write_file` - Write content to files

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run dev mode (with tsx)
npm run dev
```

## License

MIT

          
# Hermitclaw 代码 Wiki

## 1. 项目概述

Hermitclaw是一个轻量级的AI助手框架，提供了完整的网关、CLI和代理功能，支持多种AI模型提供商，并可通过插件扩展功能。

**主要特性：**
- 支持OpenAI、Anthropic和Ollama等多种AI模型提供商
- 提供命令行界面（CLI）和WebSocket网关
- 会话管理和持久化
- 工具调用系统
- 支持飞书集成
- 可扩展的插件架构

## 2. 架构设计

Hermitclaw采用模块化设计，主要组件包括：

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│      CLI        │────▶│     Agent       │────▶│   Providers     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
          │                      ▲                        ▲
          │                      │                        │
          ▼                      │                        │
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Gateway     │────▶│    Session      │     │    Config       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
          │                      ▲
          │                      │
          ▼                      │
┌─────────────────┐     ┌─────────────────┐
│    Channels     │────▶│     Types       │
└─────────────────┘     └─────────────────┘
```

## 3. 核心组件

### 3.1 Agent

Agent是Hermitclaw的核心组件，负责处理AI交互逻辑、工具调用和会话管理。

**主要文件：**
- `src/agent/index.ts` - Agent模块入口
- `src/agent/runtime.ts` - Agent运行时实现
- `src/agent/tools.ts` - 内置工具定义
- `src/agent/tokens.ts` - Token管理工具

**核心功能：**
- 处理聊天请求和响应
- 管理工具调用流程
- 实现消息历史截断
- 支持记忆增强功能

**关键类：**
```typescript
class Agent {
  constructor(provider: Provider, model: string, systemPrompt: string, maxHistoryTokens: number)
  async *run(messages: Message[], onChunk?: (chunk: ChatChunk) => void): AsyncIterable<ChatChunk>
}
```

### 3.2 CLI

CLI提供了命令行界面，支持聊天、会话管理、网关启动和飞书集成等功能。

**主要文件：**
- `src/cli/index.ts` - CLI入口
- `src/cli/chat.ts` - 聊天命令实现
- `src/cli/session.ts` - 会话管理命令
- `src/cli/gateway.ts` - 网关命令
- `src/cli/feishu.ts` - 飞书集成命令

**主要命令：**
```
hermitclaw chat        # 聊天功能
hermitclaw session     # 会话管理
hermitclaw gateway     # 启动网关
hermitclaw feishu      # 飞书集成
```

### 3.3 Gateway

Gateway实现了WebSocket服务器，支持远程客户端连接和会话管理。

**主要文件：**
- `src/gateway/index.ts` - WebSocket服务器实现
- `src/gateway/handlers.ts` - 消息处理器

**支持的消息类型：**
- `session.create` - 创建会话
- `session.list` - 列出所有会话
- `session.get` - 获取会话详情
- `session.delete` - 删除会话
- `session.send` - 发送消息

### 3.4 Providers

Providers模块封装了不同AI模型提供商的API，提供统一的接口。

**主要文件：**
- `src/providers/index.ts` - Provider工厂
- `src/providers/openai.ts` - OpenAI实现
- `src/providers/anthropic.ts` - Anthropic实现
- `src/providers/ollama.ts` - Ollama实现

**统一接口：**
```typescript
interface Provider {
  name: string;
  chat(params: ChatParams): AsyncIterable<ChatChunk>;
  listModels(): Promise<string[]>;
}
```

### 3.5 Session

Session模块负责管理聊天会话的持久化存储和检索。

**主要文件：**
- `src/session/index.ts` - 会话管理核心
- `src/session/summarizer.ts` - 会话摘要生成

**核心功能：**
- 会话创建、列出、获取和删除
- 消息添加和存储
- 会话摘要生成

**关键接口：**
```typescript
interface Session {
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
```

### 3.6 Config

Config模块处理配置加载和管理，支持默认配置、用户配置和环境变量。

**主要文件：**
- `src/config/index.ts` - 配置管理核心

**配置结构：**
```typescript
interface HermitConfig {
  gateway: GatewayConfig;       // 网关配置
  providers: Record<string, ProviderConfig>;  // 提供商配置
  agent: AgentConfig;           // 代理配置
  channels?: ChannelsConfig;    // 通道配置（如飞书）
}
```

### 3.7 Types

Types模块定义了项目的核心类型接口，确保类型安全。

**主要文件：**
- `src/types/index.ts` - 核心类型定义

**主要类型：**
- `Message` - 聊天消息
- `ChatParams` - 聊天请求参数
- `ChatChunk` - 流式聊天响应块
- `ToolDef` - 工具定义
- `Provider` - 提供商接口
- `Session` - 会话接口

### 3.8 Channels

Channels模块提供了与外部平台的集成，目前主要支持飞书。

**主要文件：**
- `src/channels/feishu/api.ts` - 飞书API封装

**飞书功能：**
- 消息发送和接收
- 文档管理
- 表格操作
- 日历事件管理
- 任务跟踪

## 4. API参考

### 4.1 Agent API

```typescript
// 创建Agent实例
const agent = new Agent(provider, model, systemPrompt, maxHistoryTokens);

// 运行Agent处理消息
const messages: Message[] = [{ role: 'user', content: 'Hello' }];
for await (const chunk of agent.run(messages)) {
  if (chunk.type === 'text' && chunk.content) {
    console.log(chunk.content);
  }
}
```

### 4.2 Provider API

```typescript
// 创建Provider实例
const provider = createProvider('openai', { apiKey: '...' });

// 调用聊天API
const chatParams: ChatParams = {
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }]
};

for await (const chunk of provider.chat(chatParams)) {
  // 处理响应块
}

// 列出可用模型
const models = await provider.listModels();
```

### 4.3 Session API

```typescript
// 创建会话
const session = createSession('My Session', 'openai', 'gpt-4o', 'You are a helpful assistant.');

// 获取会话
const session = getSession(sessionId);

// 列出会话
const sessions = listSessions();

// 删除会话
deleteSession(sessionId);

// 添加消息
addMessage(session, { role: 'user', content: 'Hello' });
```

### 4.4 Gateway API

```typescript
// 创建Gateway实例
const gateway = new Gateway(config);

// 启动网关
await gateway.start();

// 停止网关
await gateway.stop();
```

## 5. 配置说明

### 5.1 配置文件

配置文件存储在 `~/.hermitclaw/config.json`，示例配置：

```json
{
  "gateway": {
    "port": 19000,
    "host": "127.0.0.1"
  },
  "providers": {
    "openai": {
      "baseUrl": "https://api.openai.com/v1",
      "defaultModel": "gpt-4o",
      "apiKey": "sk-..."
    },
    "anthropic": {
      "baseUrl": "https://api.anthropic.com",
      "defaultModel": "claude-sonnet-4-20250514",
      "apiKey": "sk-ant-..."
    },
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "defaultModel": "llama3"
    }
  },
  "agent": {
    "defaultProvider": "openai",
    "defaultModel": "gpt-4o-mini",
    "systemPrompt": "You are a helpful assistant.",
    "maxHistoryTokens": 100000,
    "maxTokens": 1000
  },
  "channels": {
    "feishu": {
      "appId": "cli_...",
      "appSecret": "..."
    }
  }
}
```

### 5.2 环境变量

支持的环境变量：
- `OPENAI_API_KEY` - OpenAI API密钥
- `OPENAI_BASE_URL` - OpenAI API基础URL
- `ANTHROPIC_API_KEY` - Anthropic API密钥
- `ANTHROPIC_BASE_URL` - Anthropic API基础URL
- `OLLAMA_BASE_URL` - Ollama API基础URL
- `HERMITCLAW_AUTH_TOKEN` - Gateway认证令牌
- `HERMITCLAW_WORKSPACE` - 文件操作工作目录
- `FEISHU_APP_ID` - 飞书App ID
- `FEISHU_APP_SECRET` - 飞书App Secret

## 6. 使用指南

### 6.1 基本聊天

```bash
# 单次聊天
hermitclaw chat "Hello, how are you?"

# 交互式聊天
hermitclaw chat --interactive

# 指定提供商和模型
hermitclaw chat --provider anthropic --model claude-sonnet-4-20250514 "Hello"
```

### 6.2 会话管理

```bash
# 创建会话
hermitclaw session create --name "My Project" --provider openai --model gpt-4o

# 列出会话
hermitclaw session list

# 获取会话详情
hermitclaw session get <session-id>

# 删除会话
hermitclaw session delete <session-id>
```

### 6.3 启动网关

```bash
# 启动网关
hermitclaw gateway

# 指定端口和主机
hermitclaw gateway --port 8080 --host 0.0.0.0
```

### 6.4 飞书集成

```bash
# 初始化飞书集成
hermitclaw feishu init --app-id <app-id> --app-secret <app-secret>

# 发送消息到飞书
hermitclaw feishu send <chat-id> "Hello from Hermitclaw"

# 读取飞书消息
hermitclaw feishu messages <chat-id> --limit 10
```

## 7. 扩展开发

### 7.1 添加新工具

```typescript
// 在src/agent/tools.ts中添加新工具
const tools: AgentTool[] = [
  // 现有工具...
  {
    name: 'my_tool',
    description: 'My custom tool',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: 'First parameter' },
        param2: { type: 'number', description: 'Second parameter' }
      },
      required: ['param1']
    },
    async execute(params) {
      return `Tool executed with param1: ${params.param1}, param2: ${params.param2}`;
    }
  }
];
```

### 7.2 添加新提供商

```typescript
// 创建新的提供商文件 src/providers/myprovider.ts
import type { ChatParams, ChatChunk, Provider } from '../types/index.js';
import type { ProviderConfig } from '../types/index.js';

export class MyProvider implements Provider {
  name = 'myprovider';
  private client: any;  // 替换为实际的客户端

  constructor(config: ProviderConfig) {
    // 初始化客户端
  }

  async *chat(params: ChatParams): AsyncIterable<ChatChunk> {
    // 实现聊天逻辑
    yield { type: 'text', content: 'Hello from MyProvider' };
    yield { type: 'done' };
  }

  async listModels(): Promise<string[]> {
    // 实现模型列表逻辑
    return ['model-1', 'model-2'];
  }
}

// 在src/providers/index.ts中注册
import { MyProvider } from './myprovider.js';

const providerFactories: Record<string, new (config: ProviderConfig) => Provider> = {
  // 现有提供商...
  myprovider: MyProvider
};
```

## 8. 最佳实践

### 8.1 性能优化

- 使用适当的`maxHistoryTokens`限制消息历史长度
- 为不同的用例选择合适的模型
- 利用会话摘要减少上下文长度

### 8.2 安全性

- 不要在代码中硬编码API密钥
- 使用环境变量或配置文件存储敏感信息
- 限制shell工具的使用权限

### 8.3 可维护性

- 遵循现有的代码风格和命名约定
- 添加适当的注释和文档
- 编写单元测试

## 9. 版本历史

- v0.1.0 - 初始版本，支持基本聊天、会话管理和网关功能
- v0.1.1 - 添加飞书集成支持
- v0.1.2 - 实现会话摘要和记忆增强功能

## 10. 贡献指南

欢迎通过以下方式贡献：
- 提交Issue报告bug或提出功能建议
- 提交Pull Request修复bug或添加新功能
- 改进文档和示例

## 11. 许可证

Hermitclaw采用MIT许可证，详见项目根目录的LICENSE文件。