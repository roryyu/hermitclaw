import type { Message } from '../types/index.js';
import type { Provider } from '../types/index.js';

export async function generateSummary(
  messages: Message[],
  provider: Provider,
  model: string
): Promise<string> {
  const recentMessages = messages.slice(-20);

  const conversationText = recentMessages
    .map(msg => `${msg.role}: ${msg.content}`)
    .join('\n');

  const prompt = `Summarize this conversation in 2-3 sentences. Focus on main topics, decisions, and key information.

${conversationText}`;

  let summary = '';

  for await (const chunk of provider.chat({
    model,
    messages: [{ role: 'user', content: prompt }],
    system: 'You are a concise summarizer. Be brief.',
    maxTokens: 200
  })) {
    if (chunk.type === 'text' && chunk.content) {
      summary += chunk.content;
    } else if (chunk.type === 'done') {
      break;
    }
  }

  return summary.trim();
}
