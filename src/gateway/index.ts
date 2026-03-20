import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes, timingSafeEqual } from 'crypto';
import type { GatewayMessage, GatewayResponse, HermitConfig } from '../types/index.js';
import { handleSessionCreate, handleSessionList, handleSessionGet, handleSessionDelete, handleSessionSend } from './handlers.js';

// 认证超时（毫秒）
const AUTH_TIMEOUT_MS = 10000;

// 已认证的客户端集合
const authenticatedClients = new Set<WebSocket>();

/**
 * 安全比较字符串，防止时序攻击
 */
function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * 生成随机令牌
 */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export class Gateway {
  private wss: WebSocketServer | null = null;
  private config: HermitConfig;
  private requiresAuth: boolean;

  constructor(config: HermitConfig) {
    this.config = config;
    this.requiresAuth = !!config.gateway.authToken;
  }

  /**
   * 检查客户端是否已认证
   */
  private isClientAuthenticated(ws: WebSocket): boolean {
    return !this.requiresAuth || authenticatedClients.has(ws);
  }

  /**
   * 处理认证请求
   */
  private handleAuth(ws: WebSocket, message: GatewayMessage): GatewayResponse {
    const token = message.token || message.payload?.token as string | undefined;
    const expectedToken = this.config.gateway.authToken;

    if (!expectedToken) {
      // 没有配置认证令牌，自动通过
      authenticatedClients.add(ws);
      return {
        type: 'auth.success',
        id: message.id,
        payload: { message: 'Authentication not required' }
      };
    }

    if (token && safeCompare(token, expectedToken)) {
      authenticatedClients.add(ws);
      return {
        type: 'auth.success',
        id: message.id,
        payload: { message: 'Authentication successful' }
      };
    }

    return {
      type: 'auth.failed',
      id: message.id,
      payload: { message: 'Invalid authentication token' }
    };
  }

  async start(): Promise<void> {
    const { port, host } = this.config.gateway;

    this.wss = new WebSocketServer({ port, host });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('Client connected');
      
      // 如果需要认证，设置认证超时
      let authTimeout: NodeJS.Timeout | null = null;
      if (this.requiresAuth) {
        authTimeout = setTimeout(() => {
          if (!authenticatedClients.has(ws)) {
            console.log('Client authentication timeout');
            ws.send(JSON.stringify({
              type: 'auth.timeout',
              payload: { message: 'Authentication timeout' }
            }));
            ws.close();
          }
        }, AUTH_TIMEOUT_MS);
      }

      ws.on('message', async (data: Buffer) => {
        try {
          const message: GatewayMessage = JSON.parse(data.toString());
          
          // 处理认证消息
          if (message.type === 'auth') {
            const response = this.handleAuth(ws, message);
            ws.send(JSON.stringify(response));
            if (authTimeout && response.type === 'auth.success') {
              clearTimeout(authTimeout);
            }
            return;
          }
          
          // 检查认证状态
          if (!this.isClientAuthenticated(ws)) {
            ws.send(JSON.stringify({
              type: 'error',
              id: message.id,
              payload: { message: 'Authentication required. Send auth message first.' }
            }));
            return;
          }
          
          const response = await this.routeMessage(message, ws);
          ws.send(JSON.stringify(response));
        } catch (error: unknown) {
          const err = error as { message?: string };
          ws.send(JSON.stringify({
            type: 'error',
            payload: { message: err.message || 'Invalid message' }
          }));
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
        authenticatedClients.delete(ws);
        if (authTimeout) clearTimeout(authTimeout);
      });
    });

    const authInfo = this.requiresAuth ? ' (authentication required)' : '';
    console.log(`Gateway listening on ws://${host}:${port}${authInfo}`);
  }

  async stop(): Promise<void> {
    if (this.wss) {
      // 关闭所有客户端连接
      for (const client of authenticatedClients) {
        client.close();
      }
      authenticatedClients.clear();
      
      this.wss.close();
      this.wss = null;
    }
  }

  private async routeMessage(message: GatewayMessage, ws: WebSocket): Promise<GatewayResponse> {
    const { type, id, payload } = message;

    switch (type) {
      case 'session.create':
        return handleSessionCreate(payload, this.config, id);
      case 'session.list':
        return handleSessionList(id);
      case 'session.get':
        return handleSessionGet(payload, id);
      case 'session.delete':
        return handleSessionDelete(payload, id);
      case 'session.send':
        return handleSessionSend(payload, this.config, ws, id);
      default:
        return {
          type: 'error',
          id,
          payload: { message: `Unknown message type: ${type}` }
        };
    }
  }
}
