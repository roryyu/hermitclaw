import { Command } from 'commander';
import { gatewayCommand } from './gateway.js';
import { chatCommand } from './chat.js';
import { sessionCommand } from './session.js';
import { feishuCommand } from './feishu.js';

export function run(): void {
  const program = new Command();

  program
    .name('hermitclaw')
    .description('Minimal AI assistant - Gateway + CLI + Agent')
    .version('0.1.0');

  program.addCommand(gatewayCommand);
  program.addCommand(chatCommand);
  program.addCommand(sessionCommand);
  program.addCommand(feishuCommand);

  program.parse();
}

// 当直接运行此文件时自动执行
if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
