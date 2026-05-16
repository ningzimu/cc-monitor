import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseConversationLog } from '../visualizer/public/parser-core.js';
import { buildMarkdownExport } from '../visualizer/public/trace-markdown-builder.js';
import {
  fileNameFromUrl,
  fileSlug,
  projectNameFromNativeFile,
  slug
} from '../visualizer/public/markdown-export-helpers.js';

const APP_HOME = process.env.CLAUDE_CODE_LENS_HOME ||
  path.join(os.homedir(), '.claude-code-lens');

export const DEFAULT_EXPORT_DIR = path.join(APP_HOME, 'exports');

function applyAssignments(parsedData, assignments = {}) {
  (parsedData?.conversations || []).forEach(conv => {
    const assignment = assignments[conv.uid];
    conv.agentId = assignment?.agentId || 'unmatched';
    conv.agentName = assignment?.agentName || 'Unmatched';
    conv.agentRole = assignment?.agentRole || 'unmatched';
    conv.agentConfidence = assignment?.confidence || 'unmatched';
    conv.agentMatchReason = assignment?.matchReason || 'not-attributed';
  });
}

function agentFilterForId(agentId) {
  if (agentId === 'all' || agentId === 'lead') {
    return agentId;
  }
  return `agent:${agentId}`;
}

function conversationsForAgent(conversations = [], agentId = 'all') {
  if (agentId === 'all') return conversations;
  if (agentId === 'lead') return conversations.filter(conv => conv.agentRole === 'lead');
  return conversations.filter(conv => conv.agentId === agentId);
}

export function buildTraceMarkdown({ logData, assignments = {}, agentId = 'all', leadSubagentView = {} }) {
  const parsedData = parseConversationLog(JSON.stringify(logData));
  applyAssignments(parsedData, assignments);
  const agentFilter = agentFilterForId(agentId);
  const exported = buildMarkdownExport({
    currentLogUrl: '',
    parsedData,
    conversations: conversationsForAgent(parsedData.conversations, agentId),
    agentFilter,
    leadSubagentView,
    fileNameFromUrl,
    slug,
    fileSlug,
    projectNameFromNativeFile
  });
  return exported.text;
}

export async function writeTraceMarkdown({ logData, assignments, agentId, leadSubagentView, outPath, exportDir = DEFAULT_EXPORT_DIR }) {
  const shortSession = String(logData?.session_id || 'unknown').slice(0, 8);
  const safeAgent = String(agentId || 'all').replace(/[^a-zA-Z0-9_-]+/g, '-');
  const targetPath = outPath || path.join(exportDir, `trace-${shortSession}-${safeAgent}.md`);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, buildTraceMarkdown({ logData, assignments, agentId, leadSubagentView }), 'utf8');
  return targetPath;
}
