import fs from 'fs';
import path from 'path';
import os from 'os';
import { contentToMarkdown } from '../visualizer/public/trace-markdown-builder.js';

const APP_HOME = process.env.CLAUDE_CODE_LENS_HOME ||
  path.join(os.homedir(), '.claude-code-lens');

export const DEFAULT_EXPORT_DIR = path.join(APP_HOME, 'exports');

function groupInteractions(logData) {
  const byUid = new Map();
  for (const interaction of logData?.interactions || []) {
    if (!interaction?.uid) continue;
    if (!byUid.has(interaction.uid)) byUid.set(interaction.uid, { uid: interaction.uid });
    const request = byUid.get(interaction.uid);
    if (interaction.type === 'input') request.input = interaction;
    if (interaction.type === 'output' || interaction.type === 'stream.final') request.output = interaction;
  }
  return [...byUid.values()].sort((a, b) =>
    Date.parse(a.input?.timestamp || a.output?.timestamp || 0) -
    Date.parse(b.input?.timestamp || b.output?.timestamp || 0)
  );
}

function shouldIncludeRequest(request, assignment, agentId) {
  if (agentId === 'all') return true;
  if (agentId === 'lead') return assignment?.agentId === 'lead';
  return assignment?.agentId === agentId;
}

function lastInputMessage(input) {
  const messages = input?.data?.messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  return messages[messages.length - 1];
}

export function buildTraceMarkdown({ logData, assignments = {}, agentId = 'all', agent }) {
  const lines = [];
  lines.push('# Claude Code Lens Trace');
  lines.push('');
  lines.push(`Session: ${logData?.session_id || 'unknown'}`);
  if (agent?.name) lines.push(`Agent: ${agent.name}`);
  if (agent?.does) lines.push(`Does: ${agent.does}`);
  if (agent?.outcome) lines.push(`Outcome: ${agent.outcome}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  let messageIndex = 1;
  for (const request of groupInteractions(logData)) {
    const assignment = assignments[request.uid];
    if (!shouldIncludeRequest(request, assignment, agentId)) continue;

    const inputMessage = lastInputMessage(request.input);
    const inputMarkdown = contentToMarkdown(inputMessage?.content);
    if (inputMarkdown) {
      lines.push(`## Message ${messageIndex}: User`);
      lines.push('');
      lines.push(inputMarkdown);
      lines.push('');
      messageIndex += 1;
    }

    const outputMarkdown = contentToMarkdown(request.output?.data?.content);
    if (outputMarkdown) {
      lines.push(`## Message ${messageIndex}: Assistant`);
      lines.push('');
      lines.push(outputMarkdown);
      lines.push('');
      messageIndex += 1;
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

export async function writeTraceMarkdown({ logData, assignments, agentId, agent, outPath, exportDir = DEFAULT_EXPORT_DIR }) {
  const shortSession = String(logData?.session_id || 'unknown').slice(0, 8);
  const safeAgent = String(agentId || 'all').replace(/[^a-zA-Z0-9_-]+/g, '-');
  const targetPath = outPath || path.join(exportDir, `trace-${shortSession}-${safeAgent}.md`);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, buildTraceMarkdown({ logData, assignments, agentId, agent }), 'utf8');
  return targetPath;
}
