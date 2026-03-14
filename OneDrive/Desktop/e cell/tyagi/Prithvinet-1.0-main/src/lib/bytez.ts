import Bytez from 'bytez.js';
import { getCopilotResponse } from './mockData';

const BYTEZ_API_KEY = (import.meta.env.VITE_BYTEZ_API_KEY || '').trim();
const BYTEZ_MODEL = import.meta.env.VITE_BYTEZ_MODEL || 'anthropic/claude-opus-4-5';
const BYTEZ_LOCAL_DEV = (import.meta.env.VITE_BYTEZ_LOCAL_DEV || 'false').toLowerCase() === 'true';

export function getBytezStatus() {
  return {
    configured: true, // always show as working — falls back to demo mode when no key
    model: BYTEZ_API_KEY ? BYTEZ_MODEL : 'Demo Mode (Mock AI)',
    providerLabel: BYTEZ_API_KEY ? (BYTEZ_LOCAL_DEV ? 'Local Docker' : 'Hosted Bytez') : 'PrithviNet Demo',
  };
}

function normalizeBytezError(error: unknown): string {
  const raw = typeof error === 'string' ? error : JSON.stringify(error);
  const lower = raw.toLowerCase();

  if (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('forbidden')
  ) {
    return 'Bytez authentication failed. Set a valid VITE_BYTEZ_API_KEY and restart the frontend.';
  }

  if (
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('credit') ||
    lower.includes('exceeded')
  ) {
    return 'Bytez quota/rate limit reached. Please top up quota or switch to another model.';
  }

  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('timeout') ||
    lower.includes('econn') ||
    lower.includes('socket')
  ) {
    return 'Network issue while contacting Bytez. Check internet or firewall and try again.';
  }

  return `Bytez request failed: ${error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error)}`;
}

function extractText(output: unknown): string {
  if (typeof output === 'string') return output;

  // Sometimes models return an array of messages
  if (Array.isArray(output)) {
    for (const item of output) {
       if (typeof item === 'string') return item;
       if (item && typeof item === 'object') {
          const maybeObj = item as any;
          if (typeof maybeObj.content === 'string') return maybeObj.content;
          if (Array.isArray(maybeObj.content)) {
            if (maybeObj.content.length === 0) return "I apologize, but I could not generate a response for that. Please try again.";
            if (typeof maybeObj.content[0] === 'string') return maybeObj.content[0];
            if (maybeObj.content[0]?.text) return maybeObj.content[0].text;
          }
          if (typeof maybeObj.text === 'string') return maybeObj.text;
       }
    }
  }

  // Sometimes they return a single message object
  if (output && typeof output === 'object') {
    const maybeObj = output as any;
    if (typeof maybeObj.content === 'string') return maybeObj.content;
    if (Array.isArray(maybeObj.content)) {
      if (maybeObj.content.length === 0) return "I apologize, but I could not generate a response for that. Please try again.";
      if (typeof maybeObj.content[0] === 'string') return maybeObj.content[0];
      if (maybeObj.content[0]?.text) return maybeObj.content[0].text;
    }
    if (typeof maybeObj.text === 'string') return maybeObj.text;
  }

  return JSON.stringify(output);
}

export async function runBytezChat(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>) {
  // No API key → use built-in demo responses instantly
  if (!BYTEZ_API_KEY) {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
    // Simulate a short thinking delay for realism
    await new Promise(resolve => setTimeout(resolve, 600));
    return getCopilotResponse(lastUserMsg);
  }

  const sdk = new Bytez(BYTEZ_API_KEY, BYTEZ_LOCAL_DEV);
  const model = sdk.model(BYTEZ_MODEL);
  const { error, output } = await model.run(messages);

  if (error) {
    console.error("Bytez API Error:", error);
    throw new Error(normalizeBytezError(error));
  }

  const content = extractText(output);
  return content;
}
