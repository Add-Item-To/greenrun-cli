## Greenrun - Browser Test Management

### Prerequisites

- **Playwright MCP** must be configured for browser test execution (`claude mcp add playwright -- npx @playwright/mcp@latest --browser chrome --user-data-dir ~/.greenrun/browser-profile`)
- MCP server must be connected (check with `/mcp` in Claude Code)

### Available MCP Tools

The Greenrun MCP server provides these tools:

- **list_projects** / **get_project** / **create_project** - Manage projects (includes auth configuration)
- **list_pages** / **create_page** - Manage page URLs within a project
- **list_tests** / **get_test** / **create_test** / **update_test** - Manage test cases
- **start_run** / **complete_run** / **get_run** / **list_runs** - Execute and track test runs
- **sweep** - Impact analysis: find tests affected by changed pages
- **prepare_test_batch** - Batch prepare tests for execution (lists, filters, fetches details, starts runs in one call)

### Running Tests

Use the `/greenrun` slash command to run all tests automatically, or `/greenrun tag:smoke` to filter.

To run tests manually:

1. Use `list_projects` to find the project
2. Call `prepare_test_batch` with the project ID (and optional filter) to get test details and run IDs
3. Execute each test's instructions using Playwright browser automation tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`)
4. Call `complete_run` with the run ID, status (passed/failed/error), and a result summary

### Auth Configuration

Projects can be configured with authentication settings so tests auto-login before execution:

- **`auth_mode: "none"`** - No authentication (default)
- **`auth_mode: "existing_user"`** - Log in with existing credentials via `login_url` and `login_instructions`
- **`auth_mode: "new_user"`** - Register a new account each run via `register_url` and `register_instructions`

Projects can also store named **credentials** (name/email/password sets). Each test can reference a credential by `credential_name` to use specific login details during execution.

### Project Setup

When asked to create tests, first call `list_projects` to check for an existing project. Then:

- **No project exists**: Create one via `create_project` with the name, base URL, and description.
- **Project exists but missing credentials or auth config**: Update it via `update_project` to add what's missing.

In either case, follow these steps:

1. **Derive the base URL** from the project's configuration (e.g. `APP_URL` in `.env`, framework config, or `docker-compose.yml`). Don't ask the user for this.
2. **Set up authentication** -- most apps need auth for testing. Be proactive:
   - Look for a registration or login page in the app's routes/config.
   - Create test credentials and store them on the project using the `credentials` parameter. Use clear names like `"default"` or `"admin"`. Example: `{ name: "default", email: "greenrun-test@example.com", password: "TestPass123!" }`.
   - Set `auth_mode: "existing_user"` with the app's `login_url` and step-by-step `login_instructions`.
   - Then register the test account through the app's registration flow using Playwright so the credentials are valid.
3. **Discover pages** by reading the app's route definitions, then register key pages via `create_page`.

Don't ask the user for information you can derive from the codebase (base URL, login URL, route structure). Only ask when there's genuine ambiguity.

### Creating Tests

1. Navigate to the page you want to test using Playwright
2. Write clear, step-by-step test instructions describing what to do and what to verify
3. Use `create_page` to register the page URL if not already registered
4. Use `create_test` with the instructions and page IDs

### Bug Detection During Test Creation

When exploring pages to write tests, if something doesn't work as expected:

- **If the test steps are wrong** (wrong field names, missing prerequisite, bad selectors) -- fix the instructions and retry. Always try to make the test work before giving up.
- **If there's a real application bug** (form won't submit with certain data, unexpected error, broken feature):
  1. Adjust the original test to work around the bug so it captures the happy path
  2. Create a **separate bug test** tagged `bug` with steps that reproduce the failure, describing expected vs actual behaviour
  3. Start a run for the bug test and complete it as `failed` with a summary of what went wrong

This way the main test suite tracks working functionality while bugs are captured as individual failing tests.

### Impact Analysis

After making code changes, use the `/greenrun-sweep` command or the `sweep` tool to find which tests are affected by the pages you changed. This helps you run only the relevant tests.
