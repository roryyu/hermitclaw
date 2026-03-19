import type { GatewayResponse, HermitConfig, Message, ChatChunk } from '../types/index.js';
import { WebSocket } from 'ws';
import { createSession, getSession, listSessions, deleteSession, addMessage } from '../session/index.js';
import { createProvider } from '../providers/index.js';
import { Agent } from '../agent/index.js';

export function handleSessionCreate(payload: Record<string, unknown>, id?: string): GatewayResponse {
  const { name, provider, model, systemPrompt } = payload as {
    name: string;
    provider: string;
    model: string;
    systemPrompt?: string;
  };

  const session = createSession(
    name || 'New Session',
    provider,
    model,
    systemPrompt || 'You are a helpful assistant.'
  );

  return {
    type: 'session.created',
    id,
    payload: { session }
  };
}

export function handleSessionList(id?: string): GatewayResponse {
  const sessions = listSessions();
  return {
    type: 'session.listed',
    id,
    payload: { sessions }
  };
}

export function handleSessionGet(payload: Record<string, unknown>, id?: string): GatewayResponse {
  const { sessionId } = payload as { sessionId: string };
  const session = getSession(sessionId);

  if (!session) {
    return {
      type: 'error',
      id,
      payload: { message: `Session not found: ${sessionId}` }
    };
  }

  return {
    type: 'session.get',
    id,
    payload: { session }
  };
}

export function handleSessionDelete(payload: Record<string, unknown>, id?: string): GatewayResponse {
  const { sessionId } = payload as { sessionId: string };
  const deleted = deleteSession(sessionId);

  return {
    type: 'session.deleted',
    id,
    payload: { deleted, sessionId }
  };
}

export async function handleSessionSend(
  payload: Record<string, unknown>,
  config: HermitConfig,
  ws: WebSocket,
  id?: string
): Promise<GatewayResponse> {
  const { sessionId, content } = payload as { sessionId: string; content: string };

  const session = getSession(sessionId);
  if (!session) {
    return {
      type: 'error',
      id,
      payload: { message: `Session not found: ${sessionId}` }
    };
  }

  const userMsg: Message = { role: 'user', content };
  addMessage(session, userMsg);

  const providerConfig = config.providers[session.provider];
  if (!providerConfig) {
    return {
      type: 'error',
      id,
      payload: { message: `Provider not configured: ${session.provider}` }
    };
  }

  const provider = createProvider(session.provider, providerConfig);
  const agent = new Agent(provider, session.model, session.systemPrompt);

  let assistantContent = '';

  for await (const chunk of agent.run(session.messages)) {
    if (chunk.type === 'text' && chunk.content) {
      assistantContent += chunk.content;
      ws.send(JSON.stringify({
        type: 'message.delta',
        id,
        payload: { content: chunk.content }
      }));
    } else if (chunk.type === 'tool_call' && chunk.toolCall) {
      ws.send(JSON.stringify({
        type: 'tool_call',
        id,
        payload: { toolCall: chunk.toolCall }
      }));
    } else if (chunk.type === 'done') {
      break;
    }
  }

  const assistantMsg: Message = { role: 'assistant', content: assistantContent };
  addMessage(session, assistantMsg);

  return {
    type: 'message.done',
    id,
    payload: { sessionId, message: assistantMsg }
  };
}
