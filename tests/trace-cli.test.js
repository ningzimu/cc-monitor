import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'cclens.js');
const SESSION_ID = '22222222-3333-4444-8555-666666666666';
const USER_PROMPT = 'Analyze request latency and find slow tool calls.';
const FIRST_THINKING = 'The user is running a trace efficiency audit and wants slow tool calls identified.';

function jsonl(entries) {
  return entries.map(entry => JSON.stringify(entry)).join('\n');
}

function assistantEvent(timestamp, content) {
  return {
    type: 'assistant',
    timestamp,
    message: {
      role: 'assistant',
      model: 'claude-sonnet-4-5',
      content
    }
  };
}

function lensInput(uid, timestamp, content = 'User asks for trace analysis') {
  return {
    uid,
    timestamp,
    type: 'input',
    data: {
      model: 'claude-sonnet-4-5',
      messages: [
        {
          role: 'user',
          content
        }
      ],
      metadata: {
        user_id: JSON.stringify({ session_id: SESSION_ID })
      }
    }
  };
}

function lensOutput(uid, timestamp, content) {
  return {
    uid,
    timestamp,
    type: 'stream.final',
    data: {
      model: 'claude-sonnet-4-5',
      stop_reason: 'end_turn',
      content
    }
  };
}

async function createTraceFixture() {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'cclens-trace-home-'));
  const projectsDir = await mkdtemp(path.join(os.tmpdir(), 'cclens-trace-projects-'));
  const rawLogsDir = path.join(homeDir, 'raw_logs');
  const projectDir = path.join(projectsDir, '-tmp-project');
  const subagentsDir = path.join(projectDir, SESSION_ID, 'subagents');
  await mkdir(rawLogsDir, { recursive: true });
  await mkdir(subagentsDir, { recursive: true });

  await writeFile(
    path.join(projectDir, `${SESSION_ID}.jsonl`),
    jsonl([
      {
        type: 'user',
        timestamp: '2026-05-09T10:00:00.000Z',
        message: {
          role: 'user',
          content: [
            {
              type: 'text',
              text: USER_PROMPT
            }
          ]
        }
      },
      assistantEvent('2026-05-09T10:00:05.000Z', [
        {
          type: 'tool_use',
          id: 'toolu_worker',
          name: 'Agent',
          input: {
            description: 'Inspect trace timings',
            subagent_type: 'trace-worker',
            prompt: 'Read the trace and identify inefficient tool usage.'
          }
        }
      ]),
      {
        type: 'user',
        timestamp: '2026-05-09T10:00:25.000Z',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_worker',
              content: 'Found repeated broad searches and recommended narrowing queries.'
            }
          ]
        }
      },
      assistantEvent('2026-05-09T10:00:30.000Z', [
        {
          type: 'text',
          text: 'Trace review complete with actionable recommendations.'
        }
      ])
    ])
  );

  await writeFile(
    path.join(subagentsDir, 'agent-abcd1234.jsonl'),
    jsonl([
      {
        type: 'user',
        timestamp: '2026-05-09T10:00:10.000Z',
        message: {
          role: 'user',
          content: 'Read the trace and identify inefficient tool usage.'
        }
      },
      assistantEvent('2026-05-09T10:00:20.000Z', [
        {
          type: 'text',
          text: 'Found repeated broad searches and recommended narrowing queries.'
        }
      ])
    ])
  );

  await writeFile(
    path.join(rawLogsDir, 'messages-test.json'),
    JSON.stringify({
      session_id: SESSION_ID,
      created_at: '2026-05-09T10:00:00.000Z',
      interactions: [
        lensInput('lead-request', '2026-05-09T10:00:29.000Z', USER_PROMPT),
        lensOutput('lead-request', '2026-05-09T10:00:30.000Z', [
          {
            type: 'thinking',
            thinking: FIRST_THINKING
          },
          {
            type: 'text',
            text: 'Trace review complete with actionable recommendations.'
          }
        ]),
        lensInput('subagent-request', '2026-05-09T10:00:19.000Z', [
          {
            type: 'tool_result',
            content: '<system-reminder>Hidden runtime reminder with internal skills list</system-reminder>\nVisible tool output'
          }
        ]),
        lensOutput('subagent-request', '2026-05-09T10:00:20.000Z', [
          {
            type: 'text',
            text: 'Found repeated broad searches and recommended narrowing queries.'
          }
        ])
      ]
    })
  );

  return { homeDir, projectsDir };
}

async function runTrace(args, fixture) {
  const result = await execFileAsync(process.execPath, [cliPath, 'trace', ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CLAUDE_CODE_LENS_HOME: fixture.homeDir,
      CLAUDE_CODE_LENS_CLAUDE_PROJECTS_DIR: fixture.projectsDir
    }
  });
  return JSON.parse(result.stdout);
}

test('cclens trace list returns compact session records for agents', async () => {
  const fixture = await createTraceFixture();

  const output = await runTrace(['list', '-f', 'json'], fixture);

  assert.deepEqual(Object.keys(output.sessions[0]), [
    'sessionId',
    'startedAt',
    'context',
    'status',
    'agents'
  ]);
  assert.equal(output.sessions[0].sessionId, SESSION_ID);
  assert.equal(output.sessions[0].startedAt, '2026-05-09T10:00:00.000Z');
  assert.equal(output.sessions[0].agents, 'lead + 1 subagents');
  assert.match(output.sessions[0].context, /trace efficiency audit/);
});

test('cclens trace list can filter by session id', async () => {
  const fixture = await createTraceFixture();

  const output = await runTrace(['list', '--query', SESSION_ID, '-f', 'json'], fixture);

  assert.equal(output.sessions.length, 1);
  assert.equal(output.sessions[0].sessionId, SESSION_ID);
});

test('cclens trace show returns minimal lead and subagent context', async () => {
  const fixture = await createTraceFixture();

  const output = await runTrace(['show', '--session', SESSION_ID, '-f', 'json'], fixture);
  const lead = output.agents.find(agent => agent.id === 'lead');
  const subagent = output.agents.find(agent => agent.id === 'abcd1234');

  assert.equal(output.sessionId, SESSION_ID);
  assert.match(output.context, /trace efficiency audit/);
  assert.deepEqual(Object.keys(lead), ['id', 'role', 'name', 'does', 'outcome']);
  assert.equal(lead.role, 'lead');
  assert.equal(lead.does, USER_PROMPT);
  assert.deepEqual(Object.keys(subagent), ['id', 'role', 'name', 'does', 'outcome']);
  assert.equal(subagent.role, 'subagent');
  assert.equal(subagent.name, 'trace-worker · Inspect trace timings');
  assert.match(subagent.does, /Read the trace/);
  assert.match(subagent.outcome, /Found repeated broad searches/);
});

test('cclens trace export writes markdown and returns its path plus agent context', async () => {
  const fixture = await createTraceFixture();

  const output = await runTrace([
    'export',
    '--session',
    SESSION_ID,
    '--agent',
    'abcd1234',
    '-f',
    'json'
  ], fixture);
  const markdown = await readFile(output.markdownPath, 'utf8');

  assert.equal(output.sessionId, SESSION_ID);
  assert.equal(output.agent.id, 'abcd1234');
  assert.match(output.markdownPath, /trace-22222222-abcd1234\.md$/);
  assert.match(markdown, /Found repeated broad searches/);
  assert.match(markdown, /Visible tool output/);
  assert.doesNotMatch(markdown, /system-reminder/);
  assert.doesNotMatch(markdown, /Hidden runtime reminder/);
  assert.doesNotMatch(markdown, /internal skills list/);
  assert.doesNotMatch(markdown, /Trace review complete with actionable recommendations/);
});

test('cclens trace errors use a structured agent-readable envelope', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'cclens-empty-trace-home-'));
  const projectsDir = await mkdtemp(path.join(os.tmpdir(), 'cclens-empty-trace-projects-'));
  await mkdir(path.join(homeDir, 'raw_logs'), { recursive: true });

  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, 'trace', 'list', '-f', 'json'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        CLAUDE_CODE_LENS_HOME: homeDir,
        CLAUDE_CODE_LENS_CLAUDE_PROJECTS_DIR: projectsDir
      }
    }),
    (error) => {
      const payload = JSON.parse(error.stdout);
      assert.equal(error.code, 66);
      assert.equal(payload.error.code, 'NO_LOGS');
      assert.match(payload.error.message, /No Claude Code Lens raw logs found/);
      assert.match(payload.error.hint, /Run cclens first/);
      return true;
    }
  );
});
