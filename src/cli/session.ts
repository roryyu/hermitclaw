import { Command } from 'commander';
import { createSession, getSession, listSessions, deleteSession } from '../session/index.js';
import { loadConfig } from '../config/index.js';

export const sessionCommand = new Command('session')
  .description('Manage chat sessions');

sessionCommand
  .command('list')
  .description('List all sessions')
  .action(() => {
    const sessions = listSessions();

    if (sessions.length === 0) {
      console.log('No sessions found.');
      return;
    }

    console.log('\nSessions:\n');
    for (const s of sessions) {
      const date = new Date(s.updatedAt).toLocaleString();
      const msgs = s.messages.length;
      const summary = s.summary ? ' [has summary]' : '';
      console.log(`  ${s.id.slice(0, 8)}  ${s.name.padEnd(20)} ${s.provider}/${s.model}  ${msgs} msgs${summary}  (${date})`);
    }
    console.log();
  });

sessionCommand
  .command('create')
  .description('Create a new session')
  .option('-n, --name <name>', 'Session name', 'New Session')
  .option('-p, --provider <provider>', 'Provider to use')
  .option('-m, --model <model>', 'Model to use')
  .option('-s, --system <prompt>', 'System prompt')
  .action((options) => {
    const config = loadConfig();
    const provider = options.provider || config.agent.defaultProvider;
    const model = options.model || config.providers[provider]?.defaultModel;
    const systemPrompt = options.system || config.agent.systemPrompt;

    if (!model) {
      console.error(`No default model for provider: ${provider}`);
      process.exit(1);
    }

    const session = createSession(options.name, provider, model, systemPrompt);
    console.log(`Session created: ${session.id}`);
  });

sessionCommand
  .command('get <id>')
  .description('Get session details')
  .action((id) => {
    const session = getSession(id);
    if (!session) {
      console.error(`Session not found: ${id}`);
      process.exit(1);
    }

    console.log(JSON.stringify(session, null, 2));
  });

sessionCommand
  .command('delete <id>')
  .description('Delete a session')
  .action((id) => {
    const deleted = deleteSession(id);
    if (deleted) {
      console.log(`Session deleted: ${id}`);
    } else {
      console.error(`Session not found: ${id}`);
      process.exit(1);
    }
  });
