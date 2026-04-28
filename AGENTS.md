please reply in chinese

# Claude Code Lens

This repository builds a local observability tool for Claude Code API traffic.

Use **Superpowers** workflows for feature work, debugging, TDD, verification, and code review.

## Project Shape

The public CLI is a single npm-managed command:

```bash
cclens
```

Primary subcommands:

```bash
cclens            # proxy + visualizer + Claude Code
cclens -p "hello" # pass Claude Code args through
cclens proxy      # proxy only
cclens stop       # stop proxy
cclens status     # proxy status
cclens viz        # visualizer
cclens extract    # prompt/tool extraction
cclens config     # print resolved config
```

Avoid introducing new top-level command prefixes. Keep `cclens` as the only documented CLI prefix.

## Runtime Paths

User-level runtime data lives in:

```text
~/.claude-code-lens/
  config.json
  settings.json
  logs/
  raw_logs/
  prompts/
```

Do not write private endpoint configuration into the repository. Use `~/.claude-code-lens/config.json` or environment variables.

Configuration priority:

```text
CLAUDE_CODE_LENS_* environment variables
> ~/.claude-code-lens/config.json
> Claude Code settings target discovery
> built-in defaults
```

Supported overrides:

```bash
CLAUDE_CODE_LENS_HOME=~/.claude-code-lens
CLAUDE_CODE_LENS_PROXY_HOST=127.0.0.1
CLAUDE_CODE_LENS_PROXY_PORT=18888
CLAUDE_CODE_LENS_TARGET_BASE_URL=https://api.anthropic.com
CLAUDE_CODE_LENS_TARGET_TIMEOUT=120000
CLAUDE_CODE_LENS_VISUALIZER_PORT=5500
CLAUDE_CODE_LENS_LOGGING_ENABLE_CONSOLE=true
CLAUDE_CODE_LENS_OPEN_BROWSER=false
CLAUDE_CODE_LENS_VERBOSE=true
```

## Development

Use the root package for npm management:

```bash
npm install
npm link
npm test
npm run check
```

## Code Style

- JavaScript ESM.
- 2-space indentation.
- Prefer single quotes and semicolons.
- Keep runtime config out of the repository.
- Keep public docs neutral and GitHub-friendly.
