# greenrun-cli

Browser test management for Claude Code. Write tests in plain English, and Claude generates and runs Playwright scripts automatically.

Greenrun is an [MCP server](https://modelcontextprotocol.io/) that connects Claude Code to the [Greenrun API](https://app.greenrun.dev). You describe what to test, Greenrun handles the rest — script generation, parallel execution, result tracking, and re-running only what's needed.

## Quick Start

```bash
npx greenrun-cli init
```

The setup wizard will:

1. Validate your Greenrun API token
2. Configure the Greenrun and Playwright MCP servers for Claude Code
3. Install `/greenrun` and `/greenrun-sweep` slash commands
4. Add project instructions to your `CLAUDE.md`
5. Set up tool permissions so tests run without prompts

Get an API token at [app.greenrun.dev/tokens](https://app.greenrun.dev/tokens).

## Prerequisites

- **Node.js 18+**
- **Claude Code** — [install guide](https://docs.anthropic.com/en/docs/claude-code)
- **Playwright MCP** — configured automatically by `init`

## How It Works

1. **Define tests** in the [dashboard](https://app.greenrun.dev) or via Claude Code using MCP tools
2. **Run `/greenrun`** — Claude fetches tests, generates Playwright scripts on first run, then executes them natively
3. **Scripts are cached** — subsequent runs skip generation and execute instantly via `npx playwright test`
4. **Results are tracked** — pass/fail status, duration, and summaries stored per run

### Script Generation

On first run, Claude walks through each test's instructions in the browser (scouting pass), observes UI states, and generates a `.spec.ts` script using real selectors. Scripts are saved to the API and reused on future runs.

If a cached script fails, an AI agent re-executes the test manually to determine whether the script is stale or there's a real bug. Stale scripts are automatically cleared for regeneration.

### Authentication

Projects support named **credential sets** (name, email, password). Each test can reference a credential by name via `credential_name`. During execution, the matching credentials are used to authenticate before running the test.

### Impact Analysis

After code changes, run `/greenrun-sweep` to find which tests are affected by the pages you changed. Only the relevant tests are re-run.

## Slash Commands

### `/greenrun [filter]`

Run tests for the current project. Supports filters:

- `/greenrun` — run all active tests
- `/greenrun tag:smoke` — run tests tagged "smoke"
- `/greenrun /checkout` — run tests linked to pages matching "/checkout"
- `/greenrun login` — run tests with "login" in the name

### `/greenrun-sweep`

Detect which tests are impacted by recent git changes and offer to run them.

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects |
| `create_project` | Create a project (with credentials, auth config) |
| `get_project` | Get project details |
| `update_project` | Update project settings |
| `list_pages` | List pages in a project |
| `create_page` | Register a page URL |
| `list_tests` | List tests with latest run status |
| `get_test` | Get full test details and instructions |
| `create_test` | Create a test (with credential_name, tags, pages) |
| `update_test` | Update test (auto-invalidates script on content change) |
| `prepare_test_batch` | Fetch, filter, and start runs for a batch of tests |
| `export_test_script` | Write a test's cached Playwright script to a local file (keeps scripts out of context) |
| `export_test_instructions` | Write a test's instructions to a local file (keeps instructions out of context) |
| `sweep` | Find tests affected by specific pages |
| `start_run` | Start a test run |
| `complete_run` | Record a single test result |
| `batch_complete_runs` | Record results for multiple test runs in one call |
| `get_run` | Get run details |
| `list_runs` | List run history |

## Manual Setup

If you prefer to configure manually instead of using `init`:

```bash
claude mcp add greenrun --transport stdio -e GREENRUN_API_TOKEN=your_token -- npx -y greenrun-cli@latest
claude mcp add playwright -- npx @playwright/mcp@latest --browser chrome --user-data-dir ~/.greenrun/browser-profile
```

Or add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "greenrun": {
      "command": "npx",
      "args": ["-y", "greenrun-cli@latest"],
      "env": { "GREENRUN_API_TOKEN": "${GREENRUN_API_TOKEN}" }
    }
  }
}
```

## CLI Commands

```
greenrun init             Interactive setup wizard
greenrun update           Update templates and commands to latest version
greenrun serve            Start MCP server directly
greenrun --version        Print version
greenrun --help           Print help
```

Non-interactive init:

```bash
npx greenrun-cli init --token gr_xxx --scope local --no-claude-md --no-commands
```

## License

MIT
