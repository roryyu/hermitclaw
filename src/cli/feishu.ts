import { Command } from 'commander';
import { loadConfig, saveConfig } from '../config/index.js';
import { sendMessage, sendRichText, listChats, listMessages } from '../channels/feishu/api.js';
import type { FeishuConfig } from '../channels/feishu/api.js';

export const feishuCommand = new Command('feishu')
  .description('Feishu/Lark integration commands');

feishuCommand
  .command('init')
  .description('Initialize Feishu credentials')
  .option('--app-id <appId>', 'Feishu App ID')
  .option('--app-secret <appSecret>', 'Feishu App Secret')
  .action((options) => {
    const config = loadConfig();

    if (!options.appId || !options.appSecret) {
      console.error('Both --app-id and --app-secret are required');
      process.exit(1);
    }

    config.channels = {
      ...config.channels,
      feishu: {
        appId: options.appId,
        appSecret: options.appSecret
      }
    };

    saveConfig(config);
    console.log('Feishu credentials saved to config');
  });

feishuCommand
  .command('send <chatId> <message>')
  .description('Send message to Feishu chat')
  .action(async (chatId, message) => {
    const config = loadConfig();
    const feishuConfig = config.channels?.feishu;

    if (!feishuConfig?.appId || !feishuConfig?.appSecret) {
      console.error('Feishu not configured. Run: hermitclaw feishu init --app-id <id> --app-secret <secret>');
      process.exit(1);
    }

    try {
      await sendMessage(feishuConfig as FeishuConfig, chatId, message);
      console.log('Message sent successfully');
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(`Failed to send message: ${err.message}`);
      process.exit(1);
    }
  });

feishuCommand
  .command('chats')
  .description('List Feishu chats')
  .action(async () => {
    const config = loadConfig();
    const feishuConfig = config.channels?.feishu;

    if (!feishuConfig?.appId || !feishuConfig?.appSecret) {
      console.error('Feishu not configured. Run: hermitclaw feishu init --app-id <id> --app-secret <secret>');
      process.exit(1);
    }

    try {
      const chats = await listChats(feishuConfig as FeishuConfig);

      if (chats.length === 0) {
        console.log('No chats found');
        return;
      }

      console.log('\nFeishu Chats:\n');
      for (const chat of chats) {
        console.log(`  ${chat.chatId}  ${chat.name}`);
      }
      console.log();
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(`Failed to list chats: ${err.message}`);
      process.exit(1);
    }
  });

feishuCommand
  .command('messages <chatId>')
  .description('Read messages from Feishu chat')
  .option('-l, --limit <limit>', 'Number of messages to read', '10')
  .action(async (chatId, options) => {
    const config = loadConfig();
    const feishuConfig = config.channels?.feishu;

    if (!feishuConfig?.appId || !feishuConfig?.appSecret) {
      console.error('Feishu not configured. Run: hermitclaw feishu init --app-id <id> --app-secret <secret>');
      process.exit(1);
    }

    try {
      const messages = await listMessages(
        feishuConfig as FeishuConfig,
        chatId,
        parseInt(options.limit)
      );

      if (messages.length === 0) {
        console.log('No messages found');
        return;
      }

      console.log(`\nMessages from ${chatId}:\n`);
      for (const msg of messages) {
        const time = new Date(parseInt(msg.createTime) / 1000).toLocaleString();
        console.log(`  [${time}] ${msg.sender}:`);
        try {
          const content = JSON.parse(msg.content);
          console.log(`    ${content.text || msg.content}`);
        } catch {
          console.log(`    ${msg.content}`);
        }
      }
      console.log();
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(`Failed to read messages: ${err.message}`);
      process.exit(1);
    }
  });
