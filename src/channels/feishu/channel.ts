/**
 * 飞书 Channel 实现
 * 使用 @larksuiteoapi/node-sdk 官方 SDK
 * 适配 openclaw-lark 插件架构
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import * as lark from '@larksuiteoapi/node-sdk';
import type { Channel, ChannelMessage, SendOptions, MessageHandler } from '../types.js';

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

/**
 * 飞书事件结构
 */
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

export class FeishuChannel implements Channel {
  name = 'feishu';
  private config: FeishuChannelConfig;
  private messageHandler: MessageHandler | null = null;
  private client: lark.Client | null = null;
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

    // 初始化飞书 Client
    this.client = new lark.Client({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });

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
    // 跳过 URL 验证
    if ('type' in data && data.type === 'url_verification') {
      return;
    }

    const event = data as FeishuEvent;

    // 只处理消息接收事件
    if (!event.header || event.header.event_type !== 'im.message.receive_v1') {
      return;
    }

    const eventData = event.event;
    if (!eventData) return;

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
   * 发送消息到飞书（使用官方 SDK）
   */
  async send(chatId: string, content: string, options?: SendOptions): Promise<void> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    const msgType = options?.messageType === 'markdown' ? 'post' : 'text';
    const msgContent = options?.messageType === 'markdown'
      ? JSON.stringify({ post: { zh_cn: { title: '', content: [[{ tag: 'text', text: content }]] } } })
      : JSON.stringify({ text: content });

    await this.client.im.message.create({
      params: {
        receive_id_type: 'chat_id',
      },
      data: {
        receive_id: chatId,
        content: msgContent,
        msg_type: msgType,
      },
    });

    console.log(`[FeishuChannel] Message sent to chat ${chatId}`);
  }
}
