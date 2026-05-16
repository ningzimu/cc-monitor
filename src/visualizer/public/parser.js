import { parseConversationLog } from './parser-core.js';

const root = typeof window !== 'undefined' ? window : globalThis;
root.parseConversationLog = parseConversationLog;

export { parseConversationLog };
