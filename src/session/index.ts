import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { homedir } from 'os';
import type { Session, Message } from '../types/index.js';

const SESSIONS_DIR = join(homedir(), '.hermitclaw', 'sessions');

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

  saveSession(session);
  return session;
}

export function getSession(id: string): Session | null {
  const path = getSessionPath(id);
  if (!existsSync(path)) return null;

  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
}

export function listSessions(): Session[] {
  ensureDir();

  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
  const sessions: Session[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(SESSIONS_DIR, file), 'utf-8');
      sessions.push(JSON.parse(raw));
    } catch {
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

export function addMessage(session: Session, message: Message): Session {
  session.messages.push(message);
  session.updatedAt = Date.now();
  saveSession(session);
  return session;
}

export function updateSummary(session: Session, summary: string): Session {
  session.summary = summary;
  session.updatedAt = Date.now();
  saveSession(session);
  return session;
}

export function saveSession(session: Session): void {
  ensureDir();
  session.updatedAt = Date.now();
  const path = getSessionPath(session.id);
  writeFileSync(path, JSON.stringify(session, null, 2));
}

function getSessionPath(id: string): string {
  return join(SESSIONS_DIR, `${id}.json`);
}
