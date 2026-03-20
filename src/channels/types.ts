/**
 * Channel 接口定义
 * Channel 用于接收外部平台消息并转发给 Agent 处理
 */

import type { Message } from '../types/index.js';

/**
 * Channel 接收到的消息
 */
export interface ChannelMessage {
  /** 消息 ID */
  id: string;
  /** 发送者 ID */
  senderId: string;
  /** 发送者名称 */
  senderName?: string;
  /** 聊天/会话 ID */
  chatId: string;
  /** 消息内容 */
  content: string;
  /** 消息类型 */
  messageType: 'text' | 'image' | 'file' | 'other';
  /** 原始消息数据 */
  raw?: unknown;
  /** 时间戳 */
  timestamp: number;
}

/**
 * Channel 发送消息的选项
 */
export interface SendOptions {
  /** 消息类型 */
  messageType?: 'text' | 'markdown' | 'rich';
  /** 回复的消息 ID（用于线程回复） */
  replyTo?: string;
}

/**
 * Channel 接口
 */
export interface Channel {
  /** Channel 名称 */
  name: string;

  /** 启动 Channel */
  start(): Promise<void>;

  /** 停止 Channel */
  stop(): Promise<void>;

  /** 发送消息 */
  send(chatId: string, content: string, options?: SendOptions): Promise<void>;

  /** 设置消息处理器 */
  onMessage(handler: MessageHandler): void;
}

/**
 * 消息处理器类型
 */
export type MessageHandler = (message: ChannelMessage) => Promise<string>;

/**
 * Channel 配置基类
 */
export interface ChannelConfig {
  /** 是否启用 */
  enabled?: boolean;
}
