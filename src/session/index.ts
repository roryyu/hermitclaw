import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { homedir } from 'os';
import type { Session, Message } from '../types/index.js';

const SESSIONS_DIR = join(homedir(), '.hermitclaw', 'sessions');

// ============ 简单的异步锁机制 ============

class SessionLock {
  private locks: Map<string, Promise<void>> = new Map();

  /**
   * 获取锁并执行操作
   */
  async withLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    // 等待现有锁释放
    while (this.locks.has(sessionId)) {
      await this.locks.get(sessionId);
    }

    // 创建新锁
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.locks.set(sessionId, lockPromise);

    try {
      return await operation();
    } finally {
      this.locks.delete(sessionId);
      releaseLock!();
    }
  }
}

const sessionLock = new SessionLock();

// ============ 会话存储函数 ============

function ensureDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

export function createSession(
  name: string,
  provider: string,
  model: string,
  systemPrompt: string
): Session {
  ensureDir();

  const session: Session = {
    id: uuidv4(),
    name,
    provider,
    model,
    messages: [],
    systemPrompt,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  saveSessionSync(session);
  return session;
}

export function getSession(id: string): Session | null {
  return getSessionSync(id);
}

/**
 * 异步获取会话（带锁保护）
 */
export async function getSessionAsync(id: string): Promise<Session | null> {
  return sessionLock.withLock(id, async () => {
    return getSessionSync(id);
  });
}

export function listSessions(): Session[] {
  ensureDir();

  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
  const sessions: Session[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(SESSIONS_DIR, file), 'utf-8');
      sessions.push(JSON.parse(raw));
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(`Failed to read session file ${file}: ${err.message}`);
    }
  }

  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteSession(id: string): boolean {
  const path = getSessionPath(id);
  if (!existsSync(path)) return false;

  unlinkSync(path);
  return true;
}

/**
 * 异步添加消息（带锁保护）
 */
export async function addMessageAsync(sessionId: string, message: Message): Promise<Session> {
  return sessionLock.withLock(sessionId, async () => {
    const session = getSessionSync(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.messages.push(message);
    session.updatedAt = Date.now();
    saveSessionSync(session);
    return session;
  });
}

/**
 * 同步添加消息（向后兼容）
 */
export function addMessage(session: Session, message: Message): Session {
  session.messages.push(message);
  session.updatedAt = Date.now();
  saveSessionSync(session);
  return session;
}

/**
 * 异步更新摘要（带锁保护）
 */
export async function updateSummaryAsync(sessionId: string, summary: string): Promise<Session> {
  return sessionLock.withLock(sessionId, async () => {
    const session = getSessionSync(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.summary = summary;
    session.updatedAt = Date.now();
    saveSessionSync(session);
    return session;
  });
}

/**
 * 同步更新摘要（向后兼容）
 */
export function updateSummary(session: Session, summary: string): Session {
  session.summary = summary;
  session.updatedAt = Date.now();
  saveSessionSync(session);
  return session;
}

/**
 * 异步保存会话（带锁保护）
 */
export async function saveSessionAsync(session: Session): Promise<void> {
  return sessionLock.withLock(session.id, async () => {
    saveSessionSync(session);
  });
}

/**
 * 同步保存会话（向后兼容）
 */
export function saveSession(session: Session): void {
  saveSessionSync(session);
}

// ============ 内部辅助函数 ============

function getSessionSync(id: string): Session | null {
  const path = getSessionPath(id);
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as Session;
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error(`Failed to read session ${id}: ${err.message}`);
    return null;
  }
}

function saveSessionSync(session: Session): void {
  ensureDir();
  session.updatedAt = Date.now();
  const path = getSessionPath(session.id);
  writeFileSync(path, JSON.stringify(session, null, 2));
}

function getSessionPath(id: string): string {
  return join(SESSIONS_DIR, `${id}.json`);
}
