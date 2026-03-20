/**
 * 简单的日志系统
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogConfig {
  level: LogLevel;
  includeTimestamp: boolean;
  includeLevel: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

class Logger {
  private config: LogConfig;
  private context: string;

  constructor(context: string = 'app', config: Partial<LogConfig> = {}) {
    this.context = context;
    this.config = {
      level: (process.env.LOG_LEVEL as LogLevel) || 'info',
      includeTimestamp: true,
      includeLevel: true,
      ...config
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  private formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const parts: string[] = [];

    if (this.config.includeTimestamp) {
      parts.push(new Date().toISOString());
    }

    if (this.config.includeLevel) {
      parts.push(`[${level.toUpperCase().padEnd(5)}]`);
    }

    parts.push(`[${this.context}]`);
    parts.push(message);

    if (data !== undefined) {
      if (data instanceof Error) {
        parts.push(`\n  Error: ${data.message}`);
        if (data.stack) {
          parts.push(`\n  Stack: ${data.stack}`);
        }
      } else if (typeof data === 'object') {
        try {
          parts.push(`\n  ${JSON.stringify(data, null, 2)}`);
        } catch {
          parts.push(`\n  [Object]`);
        }
      } else {
        parts.push(`\n  ${String(data)}`);
      }
    }

    return parts.join(' ');
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, message, data);
    
    switch (level) {
      case 'debug':
      case 'info':
        console.log(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  /**
   * 创建带有上下文的子日志器
   */
  child(context: string): Logger {
    return new Logger(`${this.context}:${context}`, this.config);
  }
}

// 全局日志器实例
let rootLogger: Logger | null = null;

/**
 * 获取根日志器
 */
export function getLogger(context?: string): Logger {
  if (!rootLogger) {
    rootLogger = new Logger('hermitclaw');
  }
  
  if (context) {
    return rootLogger.child(context);
  }
  
  return rootLogger;
}

/**
 * 配置日志级别
 */
export function setLogLevel(level: LogLevel): void {
  if (rootLogger) {
    (rootLogger as unknown as { config: LogConfig }).config.level = level;
  }
}

/**
 * 创建特定模块的日志器
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}
