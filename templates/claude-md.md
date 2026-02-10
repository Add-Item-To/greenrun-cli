## Greenrun - Browser Test Management

### Prerequisites

- **Claude in Chrome extension** must be installed and active in your browser for test execution
- MCP server must be connected (check with `/mcp` in Claude Code)

### Available MCP Tools

The Greenrun MCP server provides these tools:

- **list_projects** / **get_project** / **create_project** - Manage projects
- **list_pages** / **create_page** - Manage page URLs within a project
- **list_tests** / **get_test** / **create_test** / **update_test** - Manage test cases
- **start_run** / **complete_run** / **get_run** / **list_runs** - Execute and track test runs
- **sweep** - Impact analysis: find tests affected by changed pages

### Running Tests

To run tests for this project:

1. Use `list_projects` to find the project, then `list_tests` to get all tests
2. For each test, call `get_test` to retrieve the full instructions
3. Call `start_run` to begin a run (returns a run ID)
4. Execute the test instructions using browser automation (Claude in Chrome)
5. Call `complete_run` with the run ID, status (passed/failed/error), and a result summary

Or use the `/greenrun` slash command to run all tests automatically.

### Creating Tests

1. Navigate to the page you want to test in Chrome
2. Write clear, step-by-step test instructions describing what to do and what to verify
3. Use `create_page` to register the page URL if not already registered
4. Use `create_test` with the instructions and page IDs

### Impact Analysis

After making code changes, use the `/greenrun-sweep` command or the `sweep` tool to find which tests are affected by the pages you changed. This helps you run only the relevant tests.
