import { Command } from 'commander';
import { Gateway } from '../gateway/index.js';
import { loadConfig } from '../config/index.js';

export const gatewayCommand = new Command('gateway')
  .description('Start the Gateway WebSocket server')
  .option('-p, --port <port>', 'Port to listen on', '19000')
  .option('-H, --host <host>', 'Host to bind to', '127.0.0.1')
  .action(async (options) => {
    const config = loadConfig();

    if (options.port) config.gateway.port = parseInt(options.port);
    if (options.host) config.gateway.host = options.host;

    const gateway = new Gateway(config);

    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await gateway.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await gateway.stop();
      process.exit(0);
    });

    await gateway.start();
  });
