/**
 * Channel 管理器
 * 管理所有 Channel 实例，并处理消息路由
 */

import type { Channel, ChannelMessage, MessageHandler } from './types.js';
import { FeishuChannel } from './feishu/channel.js';
import type { HermitConfig } from '../types/index.js';
import { createProvider } from '../providers/index.js';
import { Agent } from '../agent/index.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('channels');

/**
 * Channel 管理器
 */
export class ChannelManager {
  private channels: Map<string, Channel> = new Map();
  private config: HermitConfig;
  private messageHandler: MessageHandler | null = null;

  constructor(config: HermitConfig) {
    this.config = config;
  }

  /**
   * 设置消息处理器（使用 Agent 处理消息）
   */
  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * 初始化所有 Channel
   */
  async initialize(): Promise<void> {
    // 初始化飞书 Channel
    if (this.config.channels?.feishu) {
      const feishuConfig = this.config.channels.feishu;
      
      if (feishuConfig.appId && feishuConfig.appSecret) {
        const channel = new FeishuChannel({
          appId: feishuConfig.appId,
          appSecret: feishuConfig.appSecret,
          enabled: true,
          encryptKey: this.config.channels.feishu.encryptKey,
          verificationToken: this.config.channels.feishu.verificationToken
        });

        // 设置消息处理器
        channel.onMessage(async (message: ChannelMessage) => {
          return this.handleChannelMessage('feishu', message);
        });

        this.channels.set('feishu', channel);
        logger.info('Feishu channel initialized');
      }
    }

    logger.info(`Initialized ${this.channels.size} channel(s)`);
  }

  /**
   * 启动所有 Channel
   */
  async startAll(): Promise<void> {
    for (const [name, channel] of this.channels) {
      try {
        await channel.start();
        logger.info(`Channel ${name} started`);
      } catch (error: unknown) {
        const err = error as { message?: string };
        logger.error(`Failed to start channel ${name}: ${err.message}`);
      }
    }
  }

  /**
   * 停止所有 Channel
   */
  async stopAll(): Promise<void> {
    for (const [name, channel] of this.channels) {
      try {
        await channel.stop();
        logger.info(`Channel ${name} stopped`);
      } catch (error: unknown) {
        const err = error as { message?: string };
        logger.error(`Failed to stop channel ${name}: ${err.message}`);
      }
    }
  }

  /**
   * 获取 Channel
   */
  getChannel(name: string): Channel | undefined {
    return this.channels.get(name);
  }

  /**
   * 处理来自 Channel 的消息
   */
  private async handleChannelMessage(channelName: string, message: ChannelMessage): Promise<string> {
    logger.info(`Processing message from ${channelName}: ${message.content.slice(0, 50)}...`);

    if (this.messageHandler) {
      return this.messageHandler(message);
    }

    // 默认处理：使用 Agent 处理
    return this.defaultMessageHandler(message);
  }

  /**
   * 默认消息处理器（使用配置的 Agent）
   */
  private async defaultMessageHandler(message: ChannelMessage): Promise<string> {
    const providerName = this.config.agent.defaultProvider;
    const providerConfig = this.config.providers[providerName];

    if (!providerConfig) {
      logger.error(`Provider not configured: ${providerName}`);
      return 'Sorry, AI provider is not configured.';
    }

    const model = this.config.agent.defaultModel || providerConfig.defaultModel;
    const provider = createProvider(providerName, providerConfig);
    const agent = new Agent(
      provider,
      model,
      this.config.agent.systemPrompt,
      this.config.agent.maxHistoryTokens,
      this.config.agent.maxTokens
    );

    let response = '';
    try {
      for await (const chunk of agent.run([{ role: 'user', content: message.content }])) {
        if (chunk.type === 'text' && chunk.content) {
          response += chunk.content;
        }
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error(`Agent error: ${err.message}`);
      return 'Sorry, an error occurred while processing your message.';
    }

    return response;
  }

  /**
   * 发送消息到指定 Channel
   */
  async send(channelName: string, chatId: string, content: string): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel not found: ${channelName}`);
    }
    await channel.send(chatId, content);
  }
}
