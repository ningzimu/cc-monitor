export function markdownEscape(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .trim();
}

export function resolvePromptRef(value, prompts = {}) {
  if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(prompts, value)) {
    return prompts[value];
  }
  return value;
}

function blockContentToText(content, prompts = {}) {
  const resolved = resolvePromptRef(content, prompts);
  if (typeof resolved === 'string') return resolved;
  if (!Array.isArray(resolved)) return JSON.stringify(resolved ?? {}, null, 2);

  return resolved
    .map(block => {
      if (!block) return '';
      if (typeof block === 'string') return block;
      if (block.type === 'text') return resolvePromptRef(block.text || '', prompts);
      if (block.type === 'thinking') return block.thinking || '';
      if (block.type === 'tool_result') return blockContentToText(block.content, prompts);
      if (block.type === 'tool_use') return `${block.name || 'tool'} ${JSON.stringify(block.input || {})}`;
      return JSON.stringify(block, null, 2);
    })
    .filter(Boolean)
    .join('\n');
}

export function contentToMarkdown(content, prompts = {}) {
  const resolved = resolvePromptRef(content, prompts);
  if (typeof resolved === 'string') return markdownEscape(resolved);
  if (!Array.isArray(resolved)) {
    return `\`\`\`json\n${JSON.stringify(resolved ?? {}, null, 2)}\n\`\`\``;
  }

  const lines = [];
  resolved.forEach(block => {
    if (!block) return;
    if (block.type === 'text') {
      const text = markdownEscape(resolvePromptRef(block.text, prompts));
      if (!text) return;
      lines.push(text);
    } else if (block.type === 'thinking') {
      const thinking = markdownEscape(block.thinking || '');
      if (!thinking) return;
      lines.push('**Thinking:**');
      lines.push('');
      lines.push(thinking);
    } else if (block.type === 'tool_use') {
      lines.push(`**Tool Use:** \`${block.name || 'tool'}\``);
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(block.input || {}, null, 2));
      lines.push('```');
    } else if (block.type === 'tool_result') {
      const result = markdownEscape(blockContentToText(block.content, prompts));
      if (!result) return;
      lines.push('**Tool Result:**');
      lines.push('');
      lines.push('```');
      lines.push(result);
      lines.push('```');
    } else {
      lines.push('```json');
      lines.push(JSON.stringify(block, null, 2));
      lines.push('```');
    }
    lines.push('');
  });
  return lines.join('\n').trim();
}

export function buildMarkdownExport({
  currentLogUrl,
  parsedData,
  conversations = [],
  agentFilter = 'all',
  leadSubagentView = {},
  date = new Date(),
  fileNameFromUrl,
  slug,
  fileSlug,
  projectNameFromNativeFile
} = {}) {
  const prompts = parsedData?.prompts || {};
  const filter = filterDetails(agentFilter, leadSubagentView, fileSlug);
  const nativeFile = leadSubagentView?.nativeTrace?.nativeFile || '';
  const projectName = projectNameFromNativeFile(nativeFile) || parsedData?.session_title || fileNameFromUrl(currentLogUrl);
  const dateText = date.toISOString().split('T')[0];
  const fileName = `claude-context-${slug(projectName)}-${filter.slug}-${dateText}.md`;
  const historyLines = [];
  let messageNumber = 1;

  function pushConversationMessage(role, timestamp, content) {
    const rendered = contentToMarkdown(content, prompts);
    if (!rendered) return;

    historyLines.push(`### Message ${messageNumber}: ${role}`);
    historyLines.push(timestamp ? `*${timestamp}*` : '');
    historyLines.push('');
    historyLines.push(rendered);
    historyLines.push('');
    historyLines.push('---');
    historyLines.push('');
    messageNumber += 1;
  }

  conversations.forEach(conv => {
    if (isTitleGenerationConversation(conv, prompts)) return;

    if (Array.isArray(conv.input?.messages) && conv.input.messages.length) {
      const message = conv.input.messages[conv.input.messages.length - 1];
      const role = message.role === 'assistant' ? 'Assistant' : message.role === 'user' ? 'User' : 'Message';
      pushConversationMessage(role, conv.started_at, message.content);
    }

    if (Array.isArray(conv.result?.data?.content)) {
      pushConversationMessage('Assistant', conv.finished_at || conv.started_at, conv.result.data.content);
    } else if (conv.result?.data?.text) {
      pushConversationMessage('Assistant', conv.finished_at || conv.started_at, conv.result.data.text);
    }
  });

  const lines = [];
  lines.push('# Previous Conversation Context');
  lines.push('');
  lines.push('> Human-readable Claude Code Lens trace export for the currently selected Lead/Subagent filter.');
  lines.push('');
  lines.push(`**Project:** ${projectName || 'Unknown'}`);
  lines.push(`**Date:** ${dateText}`);
  lines.push(`**Current filter:** ${filter.label}`);
  lines.push(`**Messages in this export:** ${messageNumber - 1}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Conversation History');
  lines.push('');
  lines.push(...historyLines);
  lines.push('*Generated by Claude Code Lens*');
  return { text: lines.join('\n'), fileName };
}

function filterDetails(agentFilter, view = {}, fileSlug) {
  if (agentFilter === 'lead') return { label: 'Lead', slug: 'lead' };
  if (agentFilter === 'unmatched') return { label: 'Unmatched', slug: 'unmatched' };
  if (String(agentFilter || '').startsWith('agent:')) {
    const agentId = String(agentFilter).slice('agent:'.length);
    const agent = (view.agents || []).find(item => item.id === agentId) || {};
    const type = agent.subagentType || 'subagent';
    const description = agent.description ? ` · ${agent.description}` : '';
    return {
      label: `Subagent: ${type}${description}`,
      slug: fileSlug(type, 'subagent')
    };
  }
  return { label: 'All agents', slug: 'all' };
}

function isTitleGenerationConversation(conv, prompts) {
  return hasTitleOutputSchema(conv?.input?.output_config) ||
    hasTitleOnlyRequestAndResponse(conv, prompts);
}

function hasTitleOutputSchema(outputConfig = {}) {
  const schema = outputConfig?.format?.schema;
  const properties = schema?.properties || {};
  const keys = Object.keys(properties);
  return outputConfig?.format?.type === 'json_schema' &&
    schema?.type === 'object' &&
    keys.length === 1 &&
    keys[0] === 'title' &&
    properties.title?.type === 'string' &&
    Array.isArray(schema.required) &&
    schema.required.length === 1 &&
    schema.required[0] === 'title' &&
    schema.additionalProperties === false;
}

function hasTitleOnlyRequestAndResponse(conv, prompts) {
  const tools = conv?.input?.tools;
  const messages = conv?.input?.messages;
  return (!Array.isArray(tools) || tools.length === 0) &&
    Array.isArray(messages) &&
    messages.length === 1 &&
    messages[0]?.role === 'user' &&
    responseIsTitleJson(conv?.result?.data?.content, prompts);
}

function responseIsTitleJson(content, prompts = {}) {
  const text = contentToMarkdown(content, prompts);
  try {
    const parsed = JSON.parse(text);
    return parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 1 &&
      typeof parsed.title === 'string';
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  window.CCLensTraceMarkdownBuilder = {
    markdownEscape,
    resolvePromptRef,
    contentToMarkdown,
    buildMarkdownExport
  };
}
