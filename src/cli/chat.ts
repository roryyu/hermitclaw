import { Command } from 'commander';
import { createInterface } from 'readline';
import { loadConfig } from '../config/index.js';
import { createProvider } from '../providers/index.js';
import { Agent } from '../agent/index.js';
import { createSession, addMessage, updateSummary, getSession } from '../session/index.js';
import { generateSummary } from '../session/summarizer.js';
import type { Message, ChatChunk, Session } from '../types/index.js';

export const chatCommand = new Command('chat')
  .description('Chat with the AI assistant')
  .argument('[message]', 'Single message to send')
  .option('-i, --interactive', 'Start interactive chat session')
  .option('-p, --provider <provider>', 'Provider to use')
  .option('-m, --model <model>', 'Model to use')
  .option('-s, --system <prompt>', 'System prompt')
  .option('-S, --session <sessionId>', 'Continue existing session')
  .action(async (message: string | undefined, options) => {
    const config = loadConfig();

    const providerName = options.provider || config.agent.defaultProvider;
    const model = options.model || config.providers[providerName]?.defaultModel;
    const systemPrompt = options.system || config.agent.systemPrompt;

    if (!model) {
      console.error(`No default model configured for provider: ${providerName}`);
      process.exit(1);
    }

    const providerConfig = config.providers[providerName];
    if (!providerConfig) {
      console.error(`Provider not configured: ${providerName}`);
      process.exit(1);
    }

    const provider = createProvider(providerName, providerConfig);
    const agent = new Agent(
      provider,
      model,
      systemPrompt,
      config.agent.maxHistoryTokens,
      config.agent.maxTokens
    );

    let session: Session;
    if (options.session) {
      const existing = getSession(options.session);
      if (!existing) {
        console.error(`Session not found: ${options.session}`);
        process.exit(1);
      }
      session = existing;
    } else {
      session = createSession(
        message ? message.slice(0, 30) : 'Chat',
        providerName,
        model,
        systemPrompt
      );
    }

    if (options.interactive) {
      await interactiveChat(agent, session, provider, model);
    } else if (message) {
      await singleChat(agent, message, session, provider, model);
    } else {
      console.error('Provide a message or use --interactive mode');
      process.exit(1);
    }
  });

async function singleChat(
  agent: Agent,
  content: string,
  session: Session,
  provider: unknown,
  model: string
): Promise<void> {
  const userMsg: Message = { role: 'user', content };
  addMessage(session, userMsg);

  process.stdout.write('\n');
  let fullResponse = '';

  for await (const chunk of agent.run(session.messages)) {
    if (chunk.type === 'text' && chunk.content) {
      fullResponse += chunk.content;
      process.stdout.write(chunk.content);
    } else if (chunk.type === 'tool_call' && chunk.toolCall) {
      process.stdout.write(`\n[Tool: ${chunk.toolCall.name}]\n`);
    } else if (chunk.type === 'done') {
      break;
    }
  }

  process.stdout.write('\n');

  addMessage(session, { role: 'assistant', content: fullResponse });

  if (session.messages.length >= 10) {
    const summary = await generateSummary(session.messages, provider as any, model);
    updateSummary(session, summary);
  }
}

async function interactiveChat(
  agent: Agent,
  session: Session,
  provider: unknown,
  model: string
): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`hermitclaw interactive chat (session: ${session.id.slice(0, 8)})`);
  console.log('Type "exit" to quit, "summary" to see session summary\n');

  if (session.messages.length > 0) {
    console.log(`Resuming session with ${session.messages.length} messages\n`);
  }

  const ask = (): void => {
    rl.question('You: ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        if (session.messages.length >= 10) {
          console.log('\nGenerating session summary...');
          const summary = await generateSummary(session.messages, provider as any, model);
          updateSummary(session, summary);
          console.log('Summary saved.\n');
        }
        rl.close();
        return;
      }

      if (input.toLowerCase() === 'summary') {
        if (session.summary) {
          console.log(`\nSummary: ${session.summary}\n`);
        } else {
          console.log('\nNo summary available yet.\n');
        }
        ask();
        return;
      }

      addMessage(session, { role: 'user', content: input });
      process.stdout.write('\nAssistant: ');

      let fullResponse = '';

      for await (const chunk of agent.run(session.messages)) {
        if (chunk.type === 'text' && chunk.content) {
          fullResponse += chunk.content;
          process.stdout.write(chunk.content);
        } else if (chunk.type === 'tool_call' && chunk.toolCall) {
          process.stdout.write(`\n[Tool: ${chunk.toolCall.name}]\n`);
        } else if (chunk.type === 'done') {
          break;
        }
      }

      process.stdout.write('\n\n');

      addMessage(session, { role: 'assistant', content: fullResponse });
      ask();
    });
  };

  ask();
}
