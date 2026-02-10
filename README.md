# greenrun-cli

Browser test management for Claude Code. Connects Claude to the [Greenrun](https://app.greenrun.dev) API via MCP, enabling Claude to run, create, and manage browser tests directly from your terminal.

## Prerequisites

- **Node.js 18+**
- **Claude Code CLI** - [Install guide](https://docs.anthropic.com/en/docs/claude-code)
- **Claude in Chrome extension** - Required for browser test execution. [Install from Chrome Web Store](https://chromewebstore.google.com/detail/claude-in-chrome)

## Quick Start

```bash
npx greenrun-cli init
```

This interactive wizard will:
1. Connect your Greenrun API token
2. Configure the MCP server for Claude Code
3. Optionally install slash commands and project instructions

## How It Works

Greenrun CLI is an [MCP server](https://modelcontextprotocol.io/) that gives Claude Code access to the Greenrun API. Combined with the Claude in Chrome extension for browser automation, Claude can execute your browser tests end-to-end.

**Flow:** Claude Code -> MCP Server -> Greenrun API -> Test instructions -> Browser automation via Chrome extension

## Slash Commands

After setup, two slash commands are available in Claude Code:

### `/greenrun`

Runs all browser tests for the current project. Optionally pass a test name to run a single test.

### `/greenrun-sweep`

Impact analysis - identifies which tests are affected by recent code changes and offers to run them.

## MCP Tools

The server exposes these tools to Claude:

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects |
| `create_project` | Create a new project |
| `get_project` | Get project details |
| `list_pages` | List pages in a project |
| `create_page` | Register a page URL |
| `list_tests` | List tests (with latest run status) |
| `get_test` | Get test details and instructions |
| `create_test` | Create a new test case |
| `update_test` | Update test instructions or status |
| `sweep` | Find tests affected by specific pages |
| `start_run` | Start a test run |
| `complete_run` | Record test run result |
| `get_run` | Get run details |
| `list_runs` | List run history |

## Manual Setup

If you prefer to configure manually instead of using `init`:

```bash
claude mcp add --transport stdio -e GREENRUN_API_TOKEN=your_token greenrun -- npx -y greenrun-cli@latest
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

## CLI Usage

```
greenrun init             Interactive setup wizard
greenrun serve            Start MCP server explicitly
greenrun --version        Print version
greenrun --help           Print help
```

Non-interactive init:

```bash
npx greenrun-cli init --token gr_xxx --scope local --no-claude-md --no-commands
```

## License

MIT
