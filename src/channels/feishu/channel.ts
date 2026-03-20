/**
 * 飞书 Channel 实现
 * 使用 @larksuiteoapi/node-sdk 官方 SDK
 * 支持 WebSocket 长连接模式接收事件
 */

import * as lark from '@larksuiteoapi/node-sdk';
import type { Channel, ChannelMessage, SendOptions, MessageHandler } from '../types.js';

export interface FeishuChannelConfig {
  appId: string;
  appSecret: string;
  /** 是否启用 */
  enabled?: boolean;
  /** Encrypt Key（可选，用于解密消息） */
  encryptKey?: string;
  /** Verification Token（可选，用于验证请求） */
  verificationToken?: string;
}

/**
 * 飞书消息事件结构（来自 SDK）
 */
interface FeishuMessageEvent {
  event_id?: string;
  token?: string;
  create_time?: string;
  event_type?: string;
  tenant_key?: string;
  ts?: string;
  app_id?: string;
  schema?: string;
  sender?: {
    sender_id?: {
      open_id?: string;
      union_id?: string;
      user_id?: string;
    };
    sender_type?: string;
    tenant_key?: string;
  };
  message?: {
    message_id?: string;
    root_id?: string;
    parent_id?: string;
    create_time?: string;
    chat_id?: string;
    message_type?: string;
    content?: string;
    mentions?: Array<{
      key?: string;
      id?: {
        open_id?: string;
        user_id?: string;
      };
    }>;
  };
}

export class FeishuChannel implements Channel {
  name = 'feishu';
  private config: FeishuChannelConfig;
  private messageHandler: MessageHandler | null = null;
  private client: lark.Client | null = null;
  private wsClient: lark.WSClient | null = null;
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

    // 初始化飞书 Client（用于发送消息）
    this.client = new lark.Client({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });

    // 创建事件分发器
    const eventDispatcher = new lark.EventDispatcher({
      verificationToken: this.config.verificationToken,
      encryptKey: this.config.encryptKey,
    });

    // 注册消息接收事件处理器
    eventDispatcher.register({
      'im.message.receive_v1': async (data: FeishuMessageEvent) => {
        await this.handleMessageEvent(data);
      }
    });

    // 创建 WebSocket 客户端
    this.wsClient = new lark.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
      domain: lark.Domain.Feishu,
    });

    // 启动长连接
    try {
      await this.wsClient.start({ eventDispatcher });
      this.running = true;
      console.log('[FeishuChannel] WebSocket connected successfully');
      console.log('[FeishuChannel] Waiting for messages from Feishu...');
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error('[FeishuChannel] Failed to start WebSocket:', err.message);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }
    console.log('[FeishuChannel] Stopped');
  }

  /**
   * 处理消息接收事件
   */
  private async handleMessageEvent(data: FeishuMessageEvent): Promise<void> {
    const { sender, message } = data;

    // 检查必要字段
    if (!message || !sender) {
      return;
    }

    // 只处理文本消息
    if (message.message_type !== 'text') {
      return;
    }

    // 解析消息内容
    let content = '';
    try {
      const contentObj = JSON.parse(message.content || '{}');
      content = contentObj.text || '';
    } catch {
      content = message.content || '';
    }

    // 构建 Channel 消息
    const channelMessage: ChannelMessage = {
      id: message.message_id || '',
      senderId: sender.sender_id?.open_id || sender.sender_id?.user_id || '',
      senderName: sender.sender_id?.open_id || '',
      chatId: message.chat_id || '',
      content,
      messageType: 'text',
      raw: data,
      timestamp: parseInt(message.create_time || '0')
    };

    console.log(`[FeishuChannel] Received message from ${channelMessage.senderId} in chat ${channelMessage.chatId}: ${content.slice(0, 50)}...`);

    // 调用消息处理器
    if (this.messageHandler) {
      try {
        const response = await this.messageHandler(channelMessage);
        if (response && message.chat_id) {
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
