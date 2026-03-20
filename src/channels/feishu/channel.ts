/**
 * 飞书 Channel 实现
 * 支持通过长轮询接收消息，适配 openclaw-lark 插件
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import type { Channel, ChannelMessage, SendOptions, MessageHandler } from '../types.js';

const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis';

export interface FeishuChannelConfig {
  appId: string;
  appSecret: string;
  /** 是否启用 */
  enabled?: boolean;
  /** Webhook 端口（用于接收飞书事件推送） */
  webhookPort?: number;
  /** Webhook 路径 */
  webhookPath?: string;
  /** Encrypt Key（可选，用于解密消息） */
  encryptKey?: string;
  /** Verification Token（可选，用于验证请求） */
  verificationToken?: string;
}

interface FeishuEvent {
  schema: string;
  header: {
    event_id: string;
    event_type: string;
    create_time: string;
    token: string;
    app_id: string;
    tenant_key: string;
  };
  event: {
    sender: {
      sender_id: {
        open_id: string;
        union_id: string;
        user_id: string;
      };
      sender_type: string;
      tenant_key: string;
    };
    message: {
      message_id: string;
      root_id: string;
      parent_id: string;
      create_time: string;
      chat_id: string;
      message_type: string;
      content: string;
      mentions?: Array<{
        key: string;
        id: {
          open_id: string;
          user_id: string;
        };
      }>;
    };
  };
}

interface TokenCache {
  tenantAccessToken: string;
  expire: number;
}

export class FeishuChannel implements Channel {
  name = 'feishu';
  private config: FeishuChannelConfig;
  private messageHandler: MessageHandler | null = null;
  private tokenCache: TokenCache | null = null;
  private httpServer: ReturnType<typeof createServer> | null = null;
  private running = false;

  constructor(config: FeishuChannelConfig) {
    this.config = config;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async start(): Promise<void> {
    if (!this.config.enabled && this.config.enabled !== undefined) {
      console.log('[FeishuChannel] Disabled in config');
      return;
    }

    const port = this.config.webhookPort || 19001;
    const path = this.config.webhookPath || '/feishu/webhook';

    this.httpServer = createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(port, () => {
        console.log(`[FeishuChannel] Webhook server listening on port ${port}, path: ${path}`);
        resolve();
      });
      this.httpServer!.on('error', reject);
    });

    this.running = true;
    console.log('[FeishuChannel] Started successfully');
    console.log(`[FeishuChannel] Configure your Feishu app to send events to: http://your-server:${port}${path}`);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }
    console.log('[FeishuChannel] Stopped');
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = this.config.webhookPath || '/feishu/webhook';

    if (req.url?.startsWith(path) && req.method === 'POST') {
      try {
        const body = await this.readBody(req);
        const data = JSON.parse(body);

        // 处理 URL 验证
        if (data.type === 'url_verification') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ challenge: data.challenge }));
          return;
        }

        // 处理事件
        await this.handleEvent(data);

        res.writeHead(200);
        res.end('ok');
      } catch (error: unknown) {
        const err = error as { message?: string };
        console.error('[FeishuChannel] Error handling request:', err.message);
        res.writeHead(500);
        res.end('error');
      }
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  }

  /**
   * 读取请求体
   */
  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }

  /**
   * 处理飞书事件
   */
  private async handleEvent(data: FeishuEvent | { type: string; challenge?: string }): Promise<void> {
    // 跳过 URL 验证（已在 handleRequest 中处理）
    if ('type' in data && data.type === 'url_verification') {
      return;
    }

    const event = data as FeishuEvent;

    // 只处理消息事件
    if (!event.header || !event.event) {
      return;
    }

    const { header, event: eventData } = event;

    if (header.event_type === 'im.message.receive_v1') {
      await this.handleMessage(eventData);
    }
  }

  /**
   * 处理消息事件
   */
  private async handleMessage(eventData: FeishuEvent['event']): Promise<void> {
    const { sender, message } = eventData;

    // 只处理文本消息
    if (message.message_type !== 'text') {
      return;
    }

    // 解析消息内容
    let content = '';
    try {
      const contentObj = JSON.parse(message.content);
      content = contentObj.text || '';
    } catch {
      content = message.content;
    }

    // 构建 Channel 消息
    const channelMessage: ChannelMessage = {
      id: message.message_id,
      senderId: sender.sender_id.open_id || sender.sender_id.user_id,
      senderName: sender.sender_id.open_id,
      chatId: message.chat_id,
      content,
      messageType: 'text',
      raw: eventData,
      timestamp: parseInt(message.create_time)
    };

    console.log(`[FeishuChannel] Received message from ${channelMessage.senderId} in chat ${channelMessage.chatId}: ${content.slice(0, 50)}...`);

    // 调用消息处理器
    if (this.messageHandler) {
      try {
        const response = await this.messageHandler(channelMessage);
        if (response) {
          await this.send(message.chat_id, response);
        }
      } catch (error: unknown) {
        const err = error as { message?: string };
        console.error('[FeishuChannel] Error processing message:', err.message);
      }
    }
  }

  /**
   * 发送消息到飞书
   */
  async send(chatId: string, content: string, options?: SendOptions): Promise<void> {
    const token = await this.getTenantAccessToken();

    const body: Record<string, unknown> = {
      receive_id: chatId,
      msg_type: options?.messageType === 'markdown' ? 'post' : 'text',
      content: options?.messageType === 'markdown'
        ? JSON.stringify({ post: { zh_cn: { title: '', content: [[{ tag: 'text', text: content }]] } } })
        : JSON.stringify({ text: content })
    };

    const response = await fetch(
      `${FEISHU_BASE_URL}/im/v1/messages?receive_id_type=chat_id`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json() as { code: number; msg: string };

    if (data.code !== 0) {
      throw new Error(`Feishu send error: ${data.msg}`);
    }

    console.log(`[FeishuChannel] Message sent to chat ${chatId}`);
  }

  /**
   * 获取租户访问令牌
   */
  private async getTenantAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expire > Date.now()) {
      return this.tokenCache.tenantAccessToken;
    }

    const response = await fetch(`${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.config.appId,
        app_secret: this.config.appSecret
      })
    });

    const data = await response.json() as {
      code: number;
      msg: string;
      tenant_access_token: string;
      expire: number;
    };

    if (data.code !== 0) {
      throw new Error(`Feishu auth error: ${data.msg}`);
    }

    this.tokenCache = {
      tenantAccessToken: data.tenant_access_token,
      expire: Date.now() + (data.expire - 60) * 1000
    };

    return this.tokenCache.tenantAccessToken;
  }
}
