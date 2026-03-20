# Hermitclaw

> Minimal AI Assistant - Gateway + CLI + Agent

轻量级 AI 助手框架，支持多种 AI 模型提供商，提供命令行界面和 WebSocket 网关，可集成飞书/Lark。

## 特性

- **多模型支持**: OpenAI、Anthropic、Ollama
- **双模式使用**: CLI 直接使用 或 Gateway 远程访问
- **会话管理**: 持久化聊天会话
- **飞书集成**: 通过 Channel 模式自动接收和回复飞书消息
- **工具调用**: 内置 shell、文件读写工具

## 安装

```bash
git clone <repo-url>
cd hermitclaw
npm install
npm run build
```

## 使用模式

### 模式一：CLI 直接使用（推荐）

无需启动网关，直接在命令行中使用：

```bash
# 单次对话
node dist/cli/index.js chat "你好"

# 交互式聊天
node dist/cli/index.js chat --interactive

# 指定模型
node dist/cli/index.js chat "Hello" --provider openai --model gpt-4o
```

### 模式二：Gateway 远程访问

启动网关后，远程客户端通过 WebSocket 连接：

```bash
# 启动网关
node dist/cli/index.js gateway

# 客户端连接 ws://127.0.0.1:19000
```

## 配置

配置文件位于 `~/.hermitclaw/config.json`：

```json
{
  "gateway": {
    "port": 19000,
    "host": "127.0.0.1"
  },
  "providers": {
    "openai": {
      "apiKey": "sk-...",
      "defaultModel": "gpt-4o"
    },
    "anthropic": {
      "apiKey": "sk-ant-...",
      "defaultModel": "claude-sonnet-4-20250514"
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
    "maxHistoryTokens": 100000
  },
  "channels": {
    "feishu": {
      "appId": "cli_...",
      "appSecret": "...",
      "enabled": true
    }
  }
}
```

### 环境变量

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | OpenAI API Key |
| `ANTHROPIC_API_KEY` | Anthropic API Key |
| `OLLAMA_BASE_URL` | Ollama 服务地址 |
| `HERMITCLAW_AUTH_TOKEN` | Gateway 认证 Token |
| `HERMITCLAW_WORKSPACE` | 文件操作工作目录 |

## 飞书集成

### 1. 安装依赖

```bash
npm install @larksuite/openclaw-lark
```

### 2. 配置飞书应用

在 `~/.hermitclaw/config.json` 中添加：

```json
{
  "channels": {
    "feishu": {
      "appId": "cli_xxx",
      "appSecret": "xxx",
      "enabled": true
    }
  }
}
```

### 3. 配置飞书开发者后台

1. 登录 [飞书开发者后台](https://open.feishu.cn/app)
2. 选择应用，进入「事件订阅」
3. **订阅方式**选择「使用长连接接收事件（推荐）」
4. 订阅事件：`im.message.receive_v1`

> 长连接模式无需配置公网地址，应用会通过 WebSocket 连接到飞书服务器接收事件。

### 4. 启动 Gateway

```bash
node dist/cli/index.js gateway
```

启动后，飞书用户发送消息给机器人，Agent 会自动处理并回复。

## CLI 命令

### Chat

```bash
# 单次消息
node dist/cli/index.js chat "Hello"

# 交互式聊天
node dist/cli/index.js chat --interactive

# 指定 provider 和 model
node dist/cli/index.js chat "Hello" --provider anthropic --model claude-sonnet-4-20250514

# 继续已有会话
node dist/cli/index.js chat --interactive --session <session-id>
```

### Session

```bash
# 列出会话
node dist/cli/index.js session list

# 创建会话
node dist/cli/index.js session create --name "my-project" --provider openai

# 获取会话详情
node dist/cli/index.js session get <session-id>

# 删除会话
node dist/cli/index.js session delete <session-id>
```

### Gateway

```bash
# 启动网关（默认端口 19000）
node dist/cli/index.js gateway

# 指定端口和主机
node dist/cli/index.js gateway --port 8080 --host 0.0.0.0
```

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                      使用模式                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  模式一：CLI 直接使用（无需网关）                        │
│  ┌─────────┐    ┌─────────┐    ┌─────────────┐          │
│  │   CLI   │───▶│  Agent  │───▶│  Providers  │          │
│  └─────────┘    └─────────┘    └─────────────┘          │
│                                                         │
│  模式二：Gateway 远程访问                                │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌───────┐ │
│  │ Client  │───▶│ Gateway │───▶│  Agent  │───▶│Provi- │ │
│  │  (WS)   │    │(WS服务器)│   └─────────┘    │ders   │ │
│  └─────────┘    └─────────┘                   └───────┘ │
│                                                         │
│  模式三：Channel 集成（飞书等）                          │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌───────┐ │
│  │ 飞书用户 │───▶│ Feishu  │───▶│  Agent  │───▶│Provi- │ │
│  │         │    │ Channel │    └─────────┘    │ders   │ │
│  └─────────┘    └─────────┘                   └───────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 项目结构

```
src/
├── cli/                    # 命令行入口
│   ├── index.ts            # CLI 主入口，注册所有命令
│   ├── chat.ts             # chat 命令：单次/交互式聊天
│   ├── session.ts          # session 命令：会话管理
│   ├── gateway.ts          # gateway 命令：启动网关
│   └── feishu.ts           # feishu 命令：飞书辅助工具
│
├── gateway/                # WebSocket 网关
│   ├── index.ts            # Gateway 类：WebSocket 服务器、认证、Channel 管理
│   └── handlers.ts         # 消息处理器：session.create/send/list 等
│
├── agent/                  # AI 代理核心
│   ├── index.ts            # 导出 Agent 和工具函数
│   ├── runtime.ts          # Agent 运行时：消息处理、工具调用循环
│   ├── tools.ts            # 工具定义：shell、read_file、write_file
│   └── tokens.ts           # Token 计数：估算消息 token 数
│
├── providers/              # AI 模型提供商
│   ├── index.ts            # createProvider 工厂函数
│   ├── openai.ts           # OpenAI 提供商实现
│   ├── anthropic.ts        # Anthropic 提供商实现
│   └── ollama.ts           # Ollama 提供商实现
│
├── channels/               # 外部平台集成
│   ├── index.ts            # ChannelManager：管理所有 Channel
│   ├── types.ts            # Channel 接口定义
│   └── feishu/             # 飞书 Channel
│       └── channel.ts      # FeishuChannel：WebSocket 长连接、消息收发
│
├── session/                # 会话管理
│   ├── index.ts            # SessionManager：会话持久化、并发锁
│   └── summarizer.ts       # 会话摘要：压缩历史消息
│
├── config/                 # 配置管理
│   └── index.ts            # loadConfig/saveConfig、配置验证
│
├── types/                  # 类型定义
│   └── index.ts            # Message、Provider、ToolDef 等核心类型
│
└── utils/                  # 工具函数
    ├── logger.ts           # 结构化日志系统
    ├── timeout.ts          # 超时控制工具
    └── validation.ts       # 输入验证工具
```

### 核心模块说明

| 模块 | 文件 | 功能 |
|------|------|------|
| **CLI** | `cli/index.ts` | 命令行入口，使用 commander 注册 chat/session/gateway/feishu 命令 |
| **Gateway** | `gateway/index.ts` | WebSocket 服务器，支持 Token 认证，管理 Channel 生命周期 |
| **Agent** | `agent/runtime.ts` | AI 代理核心，处理消息、执行工具调用循环、限制最大迭代次数 |
| **Tools** | `agent/tools.ts` | 内置工具：shell 执行、文件读写，含安全限制（危险命令过滤、路径白名单） |
| **Providers** | `providers/*.ts` | 统一的 Provider 接口，支持 OpenAI/Anthropic/Ollama 流式响应 |
| **Channels** | `channels/index.ts` | ChannelManager 管理多个 Channel，路由消息到 Agent 处理 |
| **FeishuChannel** | `channels/feishu/channel.ts` | 飞书 WebSocket 长连接，使用 @larksuiteoapi/node-sdk |
| **Session** | `session/index.ts` | 会话持久化到 JSON 文件，支持异步锁防止并发问题 |
| **Config** | `config/index.ts` | 配置加载、验证、合并，支持环境变量覆盖 |

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 开发模式
npm run dev

# 测试
npm test
```

## License

MIT
