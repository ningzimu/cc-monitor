#!/usr/bin/env node

import { Command } from 'commander';
import {
  exportTraceSession,
  listTraceSessions,
  showTraceSession,
  TraceError
} from './index.js';

function parsePositiveInt(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TraceError('INVALID_ARGUMENT', `${name} must be a positive integer`, `Pass a valid ${name} value.`);
  }
  return parsed;
}

function scalarToYaml(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value);
  if (!text) return "''";
  if (/^[a-zA-Z0-9_./:@ -]+$/.test(text) && !/^\s|\s$/.test(text)) return text;
  return JSON.stringify(text);
}

function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]`;
    return value.map(item => {
      if (item && typeof item === 'object') {
        const nested = toYaml(item, indent + 2).trimStart();
        return `${pad}- ${nested}`;
      }
      return `${pad}- ${scalarToYaml(item)}`;
    }).join('\n');
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return `${pad}{}`;
    return entries.map(([key, item]) => {
      if (item && typeof item === 'object') {
        return `${pad}${key}:\n${toYaml(item, indent + 2)}`;
      }
      return `${pad}${key}: ${scalarToYaml(item)}`;
    }).join('\n');
  }
  return `${pad}${scalarToYaml(value)}`;
}

function render(data, format = 'json') {
  if (format === 'json') {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (format === 'yaml' || format === 'yml') {
    console.log(toYaml(data));
    return;
  }
  throw new TraceError('UNSUPPORTED_FORMAT', `Unsupported format: ${format}`, 'Use -f json or -f yaml.');
}

function renderError(error, format = 'json') {
  const payload = {
    error: {
      code: error.code || 'TRACE_FAILED',
      message: error.message,
      hint: error.hint || 'Run cclens trace --help for usage.'
    }
  };
  try {
    render(payload, format);
  } catch {
    console.error(JSON.stringify(payload, null, 2));
  }
}

function sharedOptions(options = {}) {
  const result = {
    debug: Boolean(options.debug)
  };
  if (options.limit) result.limit = parsePositiveInt(options.limit, 'limit');
  if (options.maxPreview) result.maxPreview = parsePositiveInt(options.maxPreview, 'max-preview');
  if (options.since) result.since = options.since;
  if (options.query) result.query = options.query;
  if (options.out) result.out = options.out;
  return result;
}

function addSharedOptions(command) {
  return command
    .option('-f, --format <format>', 'Output format: json, yaml', 'json')
    .option('--max-preview <chars>', 'Maximum preview characters for summary fields')
    .option('--debug', 'Include file paths, attribution stats, and source metadata', false);
}

function buildProgram() {
  const program = new Command();
  program
    .name('cclens trace')
    .description('Find Lead/Subagent traces and export selected Markdown for agent analysis.')
    .helpCommand(false);

  addSharedOptions(program.command('list'))
    .description('List captured trace sessions.')
    .option('--limit <count>', 'Maximum number of sessions to return')
    .option('--since <iso-date>', 'Only return sessions at or after this timestamp')
    .option('--query <text>', 'Filter sessions by compact session context/status/agent context')
    .action(async (options) => {
      const result = await listTraceSessions(sharedOptions(options));
      render(result, options.format);
    });

  addSharedOptions(program.command('show'))
    .description('Show compact Lead/Subagent context for one session.')
    .requiredOption('--session <session-id>', 'Session id from cclens trace list')
    .action(async (options) => {
      const result = await showTraceSession(options.session, sharedOptions(options));
      render(result, options.format);
    });

  addSharedOptions(program.command('export'))
    .description('Export one agent or the lead to Markdown.')
    .requiredOption('--session <session-id>', 'Session id from cclens trace list')
    .requiredOption('--agent <agent-id>', 'Agent id from cclens trace show, or lead')
    .option('--out <path>', 'Write Markdown to this exact path')
    .action(async (options) => {
      const result = await exportTraceSession(options.session, options.agent, sharedOptions(options));
      render(result, options.format);
    });

  return program;
}

async function main() {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    const format = process.argv.includes('-f')
      ? process.argv[process.argv.indexOf('-f') + 1]
      : process.argv.includes('--format')
        ? process.argv[process.argv.indexOf('--format') + 1]
        : 'json';
    renderError(error, format);
    process.exit(error.exitCode || 1);
  }
}

main();
