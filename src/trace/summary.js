const DEFAULT_LIMITS = {
  context: 120,
  status: 160,
  does: 160,
  outcome: 220
};

export function cleanText(value) {
  return String(value ?? '')
    .replace(/\x1B\[[0-9;]*m/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, ' ')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncateText(value, max = 160) {
  const text = cleanText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function contentToText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map(block => {
      if (!block) return '';
      if (typeof block === 'string') return block;
      if (block.type === 'text') return block.text || '';
      if (block.type === 'thinking') return block.thinking || '';
      if (block.type === 'tool_result') return contentToText(block.content);
      if (block.type === 'tool_use') {
        return `${block.name || 'tool'} ${JSON.stringify(block.input || {})}`;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

export function firstSentence(value, max = 160) {
  const text = cleanText(value);
  if (!text) return '';
  const sentence = text.match(/^(.+?[。.!?？])/u)?.[1] || text;
  return truncateText(sentence, max);
}

export function summarizeContext(text, maxPreview) {
  return truncateText(text, maxPreview ?? DEFAULT_LIMITS.context);
}

export function summarizeStatus(text, maxPreview) {
  return firstSentence(text, maxPreview ?? DEFAULT_LIMITS.status);
}

export function summarizeDoes(text, maxPreview) {
  return firstSentence(text, maxPreview ?? DEFAULT_LIMITS.does);
}

export function summarizeOutcome(text, maxPreview) {
  return firstSentence(text, maxPreview ?? DEFAULT_LIMITS.outcome);
}

export function defaultLimits() {
  return { ...DEFAULT_LIMITS };
}
