import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { AgentTool, ToolDef } from '../types/index.js';

const ALLOWED_COMMANDS = [
  'ls', 'pwd', 'cat', 'echo', 'head', 'tail', 'wc', 'grep', 'find',
  'date', 'whoami', 'uname', 'which', 'type', 'file', 'stat',
  'mkdir', 'touch', 'cp', 'mv', 'rm', 'chmod',
  'git', 'npm', 'node', 'python3', 'python', 'pip'
];

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\/$/,       // rm -rf /
  />\s*\/dev\/sd/,         // write to disk devices
  /mkfs/,                  // format filesystem
  /dd\s+if=/,             // dd commands
  /:\(\)\s*\{/,           // fork bombs
];

function validateCommand(command: string): string | null {
  const trimmed = command.trim();

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return `Dangerous command pattern detected: ${trimmed}`;
    }
  }

  const cmdName = trimmed.split(/\s+/)[0];

  if (!ALLOWED_COMMANDS.includes(cmdName)) {
    return `Command not allowed: ${cmdName}. Allowed: ${ALLOWED_COMMANDS.join(', ')}`;
  }

  return null;
}

const tools: AgentTool[] = [
  {
    name: 'shell',
    description: `Execute a shell command. Allowed commands: ${ALLOWED_COMMANDS.join(', ')}`,
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' }
      },
      required: ['command']
    },
    async execute(params) {
      const command = params.command as string;

      const error = validateCommand(command);
      if (error) return error;

      try {
        const output = execSync(command, {
          encoding: 'utf-8',
          timeout: 30000,
          maxBuffer: 1024 * 1024
        });
        return output;
      } catch (error: unknown) {
        const err = error as { stderr?: string; message?: string };
        return `Error: ${err.stderr || err.message || 'Unknown error'}`;
      }
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to read' }
      },
      required: ['path']
    },
    async execute(params) {
      const path = params.path as string;
      if (!existsSync(path)) {
        return `Error: File not found: ${path}`;
      }
      return readFileSync(path, 'utf-8');
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file, creating it if it does not exist',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to write' },
        content: { type: 'string', description: 'Content to write to the file' }
      },
      required: ['path', 'content']
    },
    async execute(params) {
      const path = params.path as string;
      const content = params.content as string;
      writeFileSync(path, content);
      return `Successfully wrote to ${path}`;
    }
  }
];

let cachedToolDefs: ToolDef[] | null = null;

export function getTools(): AgentTool[] {
  return tools;
}

export function getToolDefs(): ToolDef[] {
  if (!cachedToolDefs) {
    cachedToolDefs = tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }
  return cachedToolDefs;
}

export function getTool(name: string): AgentTool | undefined {
  return tools.find(t => t.name === name);
}
