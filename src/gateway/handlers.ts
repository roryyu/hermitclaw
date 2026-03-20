import type { GatewayResponse, HermitConfig, Message, ChatChunk } from '../types/index.js';
import { WebSocket } from 'ws';
import { createSession, getSession, listSessions, deleteSession, addMessage } from '../session/index.js';
import { createProvider } from '../providers/index.js';
import { Agent } from '../agent/index.js';
import {
  validateSessionId,
  validateContent,
  validateSessionName,
  validateProviderName,
  validateModelName,
  validateSystemPrompt,
  validateRequiredFields,
  mergeResults
} from '../utils/validation.js';
import { withTimeout } from '../utils/timeout.js';

// 默认请求超时时间（毫秒）
const DEFAULT_REQUEST_TIMEOUT = 120000; // 2分钟

export function handleSessionCreate(payload: Record<string, unknown>, id?: string): GatewayResponse {
  // 验证必需字段
  const requiredResult = validateRequiredFields(payload, ['provider', 'model']);
  if (!requiredResult.valid) {
    return {
      type: 'error',
      id,
      payload: { message: requiredResult.errors.join('; ') }
    };
  }

  // 验证各字段
  const name = payload.name as string | undefined;
  const provider = payload.provider as string;
  const model = payload.model as string;
  const systemPrompt = payload.systemPrompt as string | undefined;

  const validationResult = mergeResults(
    name ? validateSessionName(name) : { valid: true, errors: [] },
    validateProviderName(provider),
    validateModelName(model),
    validateSystemPrompt(systemPrompt)
  );

  if (!validationResult.valid) {
    return {
      type: 'error',
      id,
      payload: { message: validationResult.errors.join('; ') }
    };
  }

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
  // 验证 sessionId
  const sessionIdResult = validateSessionId(payload.sessionId);
  if (!sessionIdResult.valid) {
    return {
      type: 'error',
      id,
      payload: { message: sessionIdResult.errors.join('; ') }
    };
  }

  const sessionId = payload.sessionId as string;
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
  // 验证 sessionId
  const sessionIdResult = validateSessionId(payload.sessionId);
  if (!sessionIdResult.valid) {
    return {
      type: 'error',
      id,
      payload: { message: sessionIdResult.errors.join('; ') }
    };
  }

  const sessionId = payload.sessionId as string;
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
  // 验证必需字段
  const requiredResult = validateRequiredFields(payload, ['sessionId', 'content']);
  if (!requiredResult.valid) {
    return {
      type: 'error',
      id,
      payload: { message: requiredResult.errors.join('; ') }
    };
  }

  // 验证各字段
  const sessionIdResult = validateSessionId(payload.sessionId);
  const contentResult = validateContent(payload.content);

  const validationResult = mergeResults(sessionIdResult, contentResult);
  if (!validationResult.valid) {
    return {
      type: 'error',
      id,
      payload: { message: validationResult.errors.join('; ') }
    };
  }

  const sessionId = payload.sessionId as string;
  const content = payload.content as string;

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

  try {
    // 使用超时包装器
    const timeoutMs = config.gateway.connectionTimeout || DEFAULT_REQUEST_TIMEOUT;
    const timeoutIterable = withTimeout(
      agent.run(session.messages),
      timeoutMs,
      'Request timed out'
    );

    for await (const chunk of timeoutIterable) {
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
  } catch (error: unknown) {
    const err = error as { message?: string };
    return {
      type: 'error',
      id,
      payload: { message: `Agent error: ${err.message || 'Unknown error'}` }
    };
  }

  const assistantMsg: Message = { role: 'assistant', content: assistantContent };
  addMessage(session, assistantMsg);

  return {
    type: 'message.done',
    id,
    payload: { sessionId, message: assistantMsg }
  };
}
