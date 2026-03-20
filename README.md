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
      "enabled": true,
      "webhookPort": 19001,
      "webhookPath": "/feishu/webhook"
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
      "enabled": true,
      "webhookPort": 19001,
      "webhookPath": "/feishu/webhook"
    }
  }
}
```

### 3. 配置飞书开发者后台

1. 登录 [飞书开发者后台](https://open.feishu.cn/app)
2. 选择应用，进入「事件订阅」
3. 配置请求网址：`http://your-server:19001/feishu/webhook`
4. 订阅事件：`im.message.receive_v1`

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
