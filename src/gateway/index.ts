import { WebSocketServer, WebSocket } from 'ws';
import type { GatewayMessage, GatewayResponse, HermitConfig } from '../types/index.js';
import { handleSessionCreate, handleSessionList, handleSessionGet, handleSessionDelete, handleSessionSend } from './handlers.js';

export class Gateway {
  private wss: WebSocketServer | null = null;
  private config: HermitConfig;

  constructor(config: HermitConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    const { port, host } = this.config.gateway;

    this.wss = new WebSocketServer({ port, host });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('Client connected');

      ws.on('message', async (data: Buffer) => {
        try {
          const message: GatewayMessage = JSON.parse(data.toString());
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
      });
    });

    console.log(`Gateway listening on ws://${host}:${port}`);
  }

  async stop(): Promise<void> {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  private async routeMessage(message: GatewayMessage, ws: WebSocket): Promise<GatewayResponse> {
    const { type, id, payload } = message;

    switch (type) {
      case 'session.create':
        return handleSessionCreate(payload, id);
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
