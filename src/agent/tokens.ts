const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateMessageTokens(message: { role: string; content: string }): number {
  return estimateTokens(message.role) + estimateTokens(message.content) + 4;
}

interface HistoryMessage {
  role: string;
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}

export function truncateMessages(messages: HistoryMessage[], maxTokens: number, systemPromptTokens: number): HistoryMessage[] {
  let totalTokens = systemPromptTokens;
  const result: HistoryMessage[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateMessageTokens(msg);

    if (totalTokens + msgTokens > maxTokens) {
      if (result.length === 0 && msgTokens <= maxTokens - totalTokens) {
        result.unshift(msg);
      }
      break;
    }

    result.unshift(msg);
    totalTokens += msgTokens;
  }

  return result;
}