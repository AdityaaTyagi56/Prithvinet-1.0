import Bytez from 'bytez.js';

const BYTEZ_API_KEY = (import.meta.env.VITE_BYTEZ_API_KEY || '').trim();
const BYTEZ_MODEL = import.meta.env.VITE_BYTEZ_MODEL || 'anthropic/claude-opus-4-5';
const BYTEZ_LOCAL_DEV = (import.meta.env.VITE_BYTEZ_LOCAL_DEV || 'false').toLowerCase() === 'true';

export function getBytezStatus() {
  return {
    configured: BYTEZ_API_KEY.length > 0,
    model: BYTEZ_MODEL,
    providerLabel: BYTEZ_LOCAL_DEV ? 'Local Docker' : 'Hosted Bytez',
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

  return 'Bytez request failed. Please try again in a moment.';
}

function extractText(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }

  if (output && typeof output === 'object') {
    const maybeObj = output as { content?: unknown };
    if (typeof maybeObj.content === 'string') {
      return maybeObj.content;
    }
  }

  if (Array.isArray(output)) {
    for (const item of output) {
      if (item && typeof item === 'object') {
        const maybeObj = item as { content?: unknown };
        if (typeof maybeObj.content === 'string') {
          return maybeObj.content;
        }
      }
    }
  }

  return JSON.stringify(output);
}

export async function runBytezChat(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>) {
  if (!BYTEZ_API_KEY) {
    throw new Error('Bytez is not configured. Set VITE_BYTEZ_API_KEY in your frontend environment.');
  }

  const sdk = new Bytez(BYTEZ_API_KEY, BYTEZ_LOCAL_DEV);
  const model = sdk.model(BYTEZ_MODEL);
  const { error, output } = await model.run(messages);

  if (error) {
    throw new Error(normalizeBytezError(error));
  }

  const content = extractText(output);
  return content;
}
