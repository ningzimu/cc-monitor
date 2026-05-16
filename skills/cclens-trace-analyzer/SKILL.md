---
name: cclens-trace-analyzer
description: 分析 Claude Code 会话的 trace，当用户询问说"分析 trace"、"查看 session"、"排查 subagent"、"最近一次 trace"、"看看这个 session 里发生了什么"、"导出 trace"、"这个 subagent 为什么失败了"、提供 sessionId 片段、时间范围、关键词，使用此 Skill。
---

# CCLens Trace Analyzer

`cclens trace` 让 Agent 不依赖浏览器 UI，自己完成 trace 定位、Lead/Subagent 选择、Markdown 导出和后续分析。用户只需提供模糊线索，Agent 走完 `list → show → export → Read markdown` 的完整流程。

## 前置检查

执行任何 trace 命令前，先确认 `cclens trace` 是否可用：

```bash
cclens trace --help 2>&1
```

- 如果输出包含 `Commands: list [options]` 等子命令 → 正常使用 `cclens trace`。
- 如果输出的是 Claude Code 的帮助（`Usage: claude [options]`）→ 说明当前安装的 `cclens` 版本还不包含 trace 功能，改用源码运行：

```bash
node <repo>/src/trace/cli.js <subcommand> ...
```

`<repo>` 为 `cclens` 源码目录，可通过 `which cclens` 或 `ls /Users/*/open_source_poj/cc/claude-code-lens/src/trace/cli.js` 定位。

## 核心原则

- `cclens trace` 是唯一可信来源。不打开浏览器 UI，不猜测 raw log 路径。
- 始终使用 `-f json`。将 CLI 输出视为结构化数据，而非自然语言。
- 默认选择能回答用户问题的最窄范围 — 先看单个 agent，必要时再扩大到 `all`。
- `--debug` 仅在需要排查归因统计、log 文件路径或 per-agent 工具调用分布时使用，常规分析不添加。
- 匹配到多个 session 时，用 `startedAt`、`context` 和 `status` 区分后再继续。

## 工作流

### 1. 列出候选 Session

```bash
cclens trace list -f json
```

| 参数 | 用途 |
| ---- | ---- |
| `--query <text>` | 匹配 sessionId、context、status、agents 或 agent 名称 |
| `--since <iso-date>` | 仅返回指定 ISO 8601 时间戳之后的 session |
| `--limit <n>` | 限制返回数量（在构建摘要前截断，非正整数会触发 `INVALID_ARGUMENT`） |
| `--max-preview <n>` | 截断 context、status、does、outcome 等摘要字段（默认 120–220 字符不等） |

每个 session 的关键字段：

- `sessionId` — `show` 和 `export` 的主键
- `startedAt` — 区分同一任务的多次运行
- `context` — 首条模型 thinking 或 fallback 会话上下文，用于确认目标 trace
- `status` — session 当前或最终结果摘要
- `agents` — agent 数量概览，如 `lead + 6 subagents`

### 2. 查看 Session 中的 Agent

```bash
cclens trace show --session <sessionId> -f json
```

每个 agent 的关键字段：

- `id` — 传给 `export --agent`
- `role` — `lead` 或 `subagent`
- `name` — 紧凑可识别名称，subagent 格式为 `<type> · <description>`
- `does` — 该 agent 被派去做什么
- `outcome` — 该 agent 交付了什么

按用户意图选择导出目标：

| 用户意图 | 导出目标 | 匹配方式 |
| -------- | -------- | -------- |
| 排查整体流程、任务编排问题 | `--agent lead` | 直接指定 |
| 调查某个 subagent 的行为或失败原因 | `--agent <id>` | 按 `name` 匹配，歧义时看 `does` |
| 对比 Lead 和 Subagent 的协作 | `--agent all` | 直接指定 |

在运行 `show` 之前先读取 `list` 输出中的 `context` 和 `status`，避免对错误 session 做无效操作。

### 3. 导出 Trace 为 Markdown

```bash
cclens trace export --session <sessionId> --agent <agentId|lead|all> -f json
```

| 值 | 范围 |
| -- | ---- |
| `lead` | 仅主 Agent |
| `<id>` | 指定 subagent（id 来自 `show` 输出） |
| `all` | 完整 session，含 lead、所有 subagent 及未归因到特定 agent 的请求 |

指定输出路径：

```bash
cclens trace export --session <sessionId> --agent <id> --out /tmp/cclens-<session>-<agent>.md -f json
```

返回的 JSON 中 `markdownPath` 是下一步要读取的绝对路径，同时返回 `agent.does` 和 `agent.outcome`，读取前先确认导出对象与目标一致。

未指定 `--out` 时，默认输出到 `~/.claude-code-lens/exports/trace-<session前8位>-<agentId>.md`。

### 4. 读取并分析 Markdown

对 `markdownPath` 用 `Read` 工具读取。

分析重点：

- 范围过大、重复或可避免的工具调用
- `does` 与实际行为不一致的 subagent
- 因 Skill 指令不清晰导致的过长 thinking 路径
- Skill 中缺失的约束、决策规则或示例
- 可减少步骤、工具调用或 agent 交接的机会

## 错误处理

所有错误以结构化 JSON 返回。读取 `error.code` 决定恢复路径，不要解析 `message` 做判断。

| 错误码 | 触发条件 | 恢复方式 |
| ------ | -------- | -------- |
| `NO_LOGS` | `raw_logs/` 中没有捕获到会话 | 提示用户先运行 CCLens 捕获一次会话 |
| `SESSION_NOT_FOUND` | 指定的 `sessionId` 在所有 log 中都不存在 | 重新运行 `trace list -f json`，选择有效的 `sessionId` |
| `AGENT_NOT_FOUND` | 指定的 agent id 在 session 中不存在 | 重新运行 `trace show --session <id> -f json`，选择有效的 `agents[].id` |
| `EXPORT_FAILED` | Markdown 写入失败 | 用 `--out /tmp/<name>.md` 重试，或报告路径/权限问题 |
| `UNSUPPORTED_FORMAT` | 使用了 `json`/`yaml`/`yml` 之外的格式 | 使用 `-f json` 或 `-f yaml` |
| `INVALID_ARGUMENT` | `--limit` 或 `--max-preview` 不是正整数 | 检查参数值，传入有效正整数 |

## 汇报要求

汇报结果时包含以下要素，缺一不可：

- **目标 session**：`sessionId` 和 `startedAt`
- **目标 agent**：`id`、`role`、`name`、`does`
- **证据**：导出 Markdown 中的简短引用片段，不凭空断言
- **建议**：具体的 Skill 或工作流修改方案，而非泛泛的观察
- **置信度**：说明是否使用了 `--debug` 或 `--agent all`，还是仅分析了单个 agent trace
