import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, statSync, realpathSync, mkdirSync } from 'fs';
import { resolve, normalize, join, dirname, isAbsolute, relative } from 'path';
import { homedir } from 'os';
import type { AgentTool, ToolDef } from '../types/index.js';

// ============ 安全配置常量 ============
export const MAX_TOOL_ITERATIONS = 10; // 最大工具调用轮次
const SHELL_TIMEOUT_MS = 30000;
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1MB
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// 工作目录（可通过环境变量配置）
const WORKSPACE_ROOT = process.env.HERMITCLAW_WORKSPACE || process.cwd();

// 只读命令（安全）
const READ_ONLY_COMMANDS = [
  'ls', 'pwd', 'cat', 'head', 'tail', 'wc', 'grep', 'find',
  'date', 'whoami', 'uname', 'which', 'type', 'file', 'stat', 'echo'
];

// 写入命令（需要路径验证）
const WRITE_COMMANDS = ['mkdir', 'touch', 'cp', 'mv'];

// 开发命令（限制危险操作）
const DEV_COMMANDS = ['git', 'npm', 'node', 'python3', 'python', 'pip'];

const ALLOWED_COMMANDS = [...READ_ONLY_COMMANDS, ...WRITE_COMMANDS, ...DEV_COMMANDS];

// 危险模式检测（按优先级排序）
const DANGEROUS_PATTERNS = [
  /rm\s+/,                     // 任何 rm 命令
  /chmod\s+/,                  // chmod 命令
  /chown\s+/,                  // chown 命令
  />\s*\/dev\/(sd|hd|nvme)/,   // 写入磁盘设备
  /mkfs/,                       // 格式化文件系统
  /dd\s+/,                      // dd 命令
  /:\(\)\s*\{/,                // fork bombs
  /\$\(/,                       // 命令替换 $()
  /`[^`]*`/,                    // 反引号命令替换
  /\|\s*(bash|sh|zsh|fish)/,   // 管道到 shell
  /;\s*\S/,                     // 分号命令分隔
  /&&\s*\S/,                    // && 命令链接
  /\|\|\s*\S/,                  // || 命令链接
  /\|\s*\S/,                    // 管道（谨慎）
  /sudo\s+/,                    // sudo
  /su\s+/,                       // su
  /eval\s+/,                    // eval
  /exec\s+/,                    // exec
  /source\s+/,                  // source
  /\.\s+\//,                    // 执行脚本
  /curl\s+.*[|>]/,             // curl 管道或重定向
  /wget\s+.*[|>]/,             // wget 管道或重定向
  /nc\s+-/,                     // netcat
  /telnet\s+/,                  // telnet
  /ssh\s+/,                     // ssh
  /scp\s+/,                     // scp
];

// 禁止访问的系统路径
const BLOCKED_PATHS = [
  '/etc', '/usr', '/bin', '/sbin', '/boot', '/dev', '/proc', '/sys',
  '/var', '/lib', '/lib64', '/root', '/home'
];

// 禁止写入的敏感文件模式
const SENSITIVE_FILE_PATTERNS = [
  /\.ssh\//i,
  /\.gnupg\//i,
  /\.env$/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /credentials/i,
  /password/i,
  /\.bashrc$/i,
  /\.zshrc$/i,
  /\.profile$/i,
];

function isBlockedPath(filePath: string): boolean {
  try {
    const normalized = normalize(resolve(filePath));
    
    // 检查系统禁止路径
    for (const blocked of BLOCKED_PATHS) {
      if (normalized.startsWith(blocked + '/') || normalized === blocked) {
        return true;
      }
    }
    
    // 检查敏感文件模式
    for (const pattern of SENSITIVE_FILE_PATTERNS) {
      if (pattern.test(normalized)) {
        return true;
      }
    }
    
    return false;
  } catch {
    return true; // 解析失败则拒绝
  }
}

// 验证路径是否在工作目录内（可选启用）
function isWithinWorkspace(filePath: string): boolean {
  try {
    const resolvedPath = isAbsolute(filePath) ? filePath : resolve(WORKSPACE_ROOT, filePath);
    const realPath = existsSync(resolvedPath) ? realpathSync(resolvedPath) : resolvedPath;
    const rel = relative(WORKSPACE_ROOT, realPath);
    return !rel.startsWith('..') && !isAbsolute(rel);
  } catch {
    return false;
  }
}

// 从命令中提取路径参数
function extractPathsFromCommand(command: string): string[] {
  const paths: string[] = [];
  const args = command.split(/\s+/).slice(1);
  
  for (const arg of args) {
    // 跳过选项参数
    if (arg.startsWith('-')) continue;
    // 检查是否像路径
    if (arg.includes('/') || arg.includes('.')) {
      paths.push(arg);
    }
  }
  
  return paths;
}

function validateCommand(command: string): string | null {
  const trimmed = command.trim();
  
  if (!trimmed) {
    return 'Empty command';
  }

  // 检查危险模式
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return `Dangerous command pattern detected`;
    }
  }

  // 提取命令名
  const cmdName = trimmed.split(/\s+/)[0];

  if (!ALLOWED_COMMANDS.includes(cmdName)) {
    return `Command not allowed: ${cmdName}. Allowed: ${ALLOWED_COMMANDS.join(', ')}`;
  }

  // 对于写入命令，验证路径
  if (WRITE_COMMANDS.includes(cmdName) || DEV_COMMANDS.includes(cmdName)) {
    const paths = extractPathsFromCommand(trimmed);
    for (const p of paths) {
      if (isBlockedPath(p)) {
        return `Access denied to path: ${p}`;
      }
    }
  }

  return null;
}

const tools: AgentTool[] = [
  {
    name: 'shell',
    description: `Execute a shell command. Allowed: ${READ_ONLY_COMMANDS.slice(0, 5).join(', ')}... (read-only), ${WRITE_COMMANDS.join(', ')} (write), ${DEV_COMMANDS.join(', ')} (dev). No pipes, redirects, or command chaining allowed.`,
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute (single command only)' }
      },
      required: ['command']
    },
    async execute(params) {
      const command = params.command as string;

      if (!command || typeof command !== 'string') {
        return 'Error: Invalid command parameter';
      }

      const error = validateCommand(command);
      if (error) return error;

      try {
        const output = execSync(command, {
          encoding: 'utf-8',
          timeout: SHELL_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
          cwd: WORKSPACE_ROOT,
          env: {
            ...process.env,
            // 移除敏感环境变量
            OPENAI_API_KEY: undefined,
            ANTHROPIC_API_KEY: undefined,
            FEISHU_APP_SECRET: undefined,
          }
        });
        
        // 截断过长的输出
        if (output.length > MAX_OUTPUT_BYTES) {
          return output.slice(0, MAX_OUTPUT_BYTES) + '\n... (output truncated)';
        }
        return output;
      } catch (error: unknown) {
        const err = error as { stderr?: string; message?: string; status?: number };
        // Node.js execSync timeout error has a specific structure
        const isTimeout = err.message?.includes('ETIMEDOUT') || 
                         err.message?.includes('timed out');
        if (isTimeout) {
          return `Error: Command timed out after ${SHELL_TIMEOUT_MS / 1000}s`;
        }
        return `Error: ${err.stderr || err.message || 'Unknown error'}`;
      }
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file (max 10MB)',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to read' }
      },
      required: ['path']
    },
    async execute(params) {
      const path = params.path as string;
      
      if (!path || typeof path !== 'string') {
        return 'Error: Invalid path parameter';
      }
      
      if (isBlockedPath(path)) {
        return `Error: Access denied to system path`;
      }
      
      if (!existsSync(path)) {
        return `Error: File not found: ${path}`;
      }
      
      try {
        const stats = statSync(path);
        if (stats.size > MAX_FILE_SIZE_BYTES) {
          return `Error: File too large (${Math.round(stats.size / 1024 / 1024)}MB > 10MB limit)`;
        }
        
        const content = readFileSync(path, 'utf-8');
        return content;
      } catch (error: unknown) {
        const err = error as { message?: string };
        return `Error reading file: ${err.message || 'Unknown error'}`;
      }
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file (max 10MB). Creates parent directories if needed.',
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
      
      if (!path || typeof path !== 'string') {
        return 'Error: Invalid path parameter';
      }
      
      if (content === undefined || content === null) {
        return 'Error: Content parameter is required';
      }
      
      if (isBlockedPath(path)) {
        return `Error: Access denied to system path`;
      }
      
      const contentStr = String(content);
      if (Buffer.byteLength(contentStr, 'utf-8') > MAX_FILE_SIZE_BYTES) {
        return `Error: File content exceeds size limit (${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB)`;
      }
      
      try {
        // 创建父目录
        const parentDir = dirname(path);
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }
        
        writeFileSync(path, contentStr, 'utf-8');
        return `Successfully wrote ${Buffer.byteLength(contentStr, 'utf-8')} bytes to ${path}`;
      } catch (error: unknown) {
        const err = error as { message?: string };
        return `Error writing file: ${err.message || 'Unknown error'}`;
      }
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
