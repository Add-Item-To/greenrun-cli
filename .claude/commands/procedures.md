Shared procedures for executing Greenrun browser tests. Referenced by `/greenrun` and `/greenrun-sweep`.

## Authenticate

Before executing tests, handle authentication based on the project's `auth_mode` from the batch result.

- **`none`** (or missing): Skip authentication entirely.
- **`existing_user`**: Navigate to the project's `login_url` and follow the `login_instructions` step by step. Use `browser_snapshot` after to verify the page shows an authenticated state (no login form visible).
- **`new_user`**: Navigate to the project's `register_url` and follow the `register_instructions` step by step. Use `browser_snapshot` after to verify registration succeeded and the user is authenticated.

If auth fails (login form still visible after following instructions), report all tests as error with "Authentication failed" and stop.

## Execute

You have a batch result from `prepare_test_batch` containing `project` and `tests[]` (each with `test_id`, `test_name`, `run_id`, `instructions`, `pages`, `tags`, `script`, `script_generated_at`).

If `tests` is empty, tell the user no matching active tests were found and stop.

### Step 1: Authenticate on the main page

Run the Authenticate procedure above once, using the standard Playwright tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`).

### Step 2: Classify tests

Split the batch into two groups:

- **scripted**: tests where `script` is non-null (cached Playwright scripts ready to run)
- **unscripted**: tests where `script` is null (need script generation)

If all tests are scripted, skip to Step 4.

### Step 3: Score and generate scripts (easy-first)

For each **unscripted** test, assign a difficulty score based on the instructions:

- **easy** (1): Single-page tests with simple actions — navigate, check text/headings, verify static content, click a link and check the URL. Typically 1-4 steps, no form submissions, no multi-step flows.
- **medium** (2): Tests involving form input, button clicks that trigger state changes, checking error/success messages, or verifying a redirect after an action. Typically 3-8 steps.
- **hard** (3): Multi-page flows, tests requiring specific sequences of actions (e.g. add to cart then checkout), tests with complex assertions (table data, dynamic content), or tests involving file uploads, modals, or dialogs.

Sort unscripted tests by difficulty ascending (easy first). This ensures simple tests get scripts generated quickly so native execution can start sooner.

#### Walk-through script generation

For each unscripted test (in difficulty order), do a **scouting pass** — actually follow the test instructions in the browser to observe all UI states:

1. Navigate to the test's starting page via `browser_navigate`
2. Take a `browser_snapshot` to see initial elements
3. Follow the test instructions step by step using Playwright MCP tools (`browser_click`, `browser_type`, `browser_snapshot` after each action)
4. Snapshot after each state change to capture: validation errors, success banners, modal dialogs, redirected pages, dynamically loaded content
5. Collect all observed elements and selectors as context

Then generate a `.spec.ts` script using the observed elements:

```ts
import { test, expect } from '@playwright/test';
test('{test_name}', async ({ page }) => {
  await page.goto('{start_url}');
  // Steps generated from scouting pass observations
  // Use getByRole, getByText, getByLabel, getByPlaceholder for selectors
});
```

Save via `update_test(test_id, { script: <generated_script>, script_generated_at: <ISO_now> })`.

**Pipeline optimisation**: After finishing all **easy** tests, if there are medium/hard tests remaining, proceed to Step 4 immediately with whatever scripts are ready (scripted + newly generated easy tests). Continue generating medium/hard scripts in parallel by launching a background Task agent for the remaining generation work. When those scripts are ready, they'll be saved to the API for next run.

To launch the background generation agent:

```
Task tool with:
- subagent_type: "general-purpose"
- run_in_background: true
- max_turns: 50
- model: "sonnet"
- prompt: (include project details, remaining unscripted tests with instructions, and the scouting+generation procedure above)
```

The background agent should: for each remaining test, do the scouting pass, generate the script, and call `update_test` to save it. It does NOT need to call `complete_run` — that happens in the native execution step.

### Step 4: Export auth state

If `auth_mode` is not `none`, export the browser session so native Playwright inherits it:

```js
async (page) => {
  const state = await page.context().storageState();
  require('fs').writeFileSync('/tmp/greenrun-auth-state.json', JSON.stringify(state));
  return 'Auth state exported';
}
```

Call this via `browser_run_code`. If `auth_mode` is `none`, skip this step.

### Step 5: Write files and run natively

Gather all tests that have scripts (previously scripted + newly generated from Step 3).

1. **Write test files**: For each scripted test, write the script to `/tmp/greenrun-tests/{test_id}.spec.ts`

2. **Write config**: Write `/tmp/greenrun-tests/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  timeout: 30000,
  workers: 20,
  reporter: [['json', { outputFile: 'results.json' }]],
  use: {
    baseURL: '{base_url}',
    storageState: '/tmp/greenrun-auth-state.json',  // omit 'use.storageState' entirely if auth_mode is 'none'
  },
});
```

Replace `{base_url}` with the project's base_url.

3. **Execute**: Run via Bash:
```
npx playwright test --config /tmp/greenrun-tests/playwright.config.ts
```

4. **Parse results**: Read `/tmp/greenrun-tests/results.json`. Map each result back to a run ID via the filename: `{test_id}.spec.ts` → test_id → find the matching run_id from the batch.

5. **Report results**: Call `complete_run(run_id, status, result_summary)` for each test. Map Playwright statuses: `passed` → `passed`, `failed`/`timedOut` → `failed`, other → `error`.

### Step 6: Handle unscripted tests without scripts

Any tests that still don't have scripts (e.g. because the background agent hasn't finished, or script generation failed) need to be executed via AI agents using the legacy approach. Follow Step 7 for these tests.

### Step 7: Circuit breaker

After parsing all native results, walk through them in completion order. Track consecutive failures:

- If **3 or more consecutive failures** occur:
  - Mark all remaining un-reported tests as error: "Circuit breaker: N consecutive failures detected"
  - Skip AI fallback for remaining tests
  - The counter resets on any pass

### Step 8: AI-agent fallback for native failures

For tests that **failed** in native execution (and circuit breaker has not tripped):

1. Start new runs via `start_run(test_id)` (the original runs were already completed in Step 5)
2. Launch background Task agents using the tab-isolation pattern:

Create tabs and launch agents in batches of 20:

#### Create tab
```js
async (page) => {
  const newPage = await page.context().newPage();
  await newPage.goto(START_URL);
  return { index: page.context().pages().length - 1, url: newPage.url() };
}
```

#### Launch agent
```
Task tool with:
- subagent_type: "general-purpose"
- run_in_background: true
- max_turns: 25
- model: "sonnet"
- prompt: (agent prompt below, including the native failure message for diagnosis)
```

#### Agent prompt

```
Greenrun browser test (AI fallback). Run ID: {run_id}
Tab index: {INDEX}

**{test_name}**

{paste the full test instructions here}

**Native execution failed with:** {failure_message}

Determine if this is a stale script (UI changed) or an actual bug. If the script is stale, the test may still pass when executed manually.

## CRITICAL: Tab isolation

You are assigned to tab index {INDEX}. You MUST use ONLY `browser_run_code` for ALL browser interactions. Do NOT use `browser_snapshot`, `browser_click`, `browser_type`, `browser_navigate`, or any other Playwright MCP tools. The only non-browser tool you may call is `complete_run`.

Every `browser_run_code` call must scope to your tab:
```js
async (page) => {
  const p = page.context().pages()[INDEX];
  // ... your action here ...
}
```

## Auth
No authentication needed — the main page already authenticated and cookies are shared to your tab.

## Interaction patterns

**Navigate:**
```js
async (page) => {
  const p = page.context().pages()[INDEX];
  await p.goto('https://example.com/path');
  return p.url();
}
```

**Read page state (replaces browser_snapshot):**
```js
async (page) => {
  const p = page.context().pages()[INDEX];
  const url = p.url();
  const title = await p.title();
  const text = await p.locator('body').innerText();
  const headings = await p.getByRole('heading').allTextContents();
  const buttons = await p.getByRole('button').allTextContents();
  const links = await p.getByRole('link').allTextContents();
  const textboxes = await p.getByRole('textbox').evaluateAll(els =>
    els.map(e => ({ name: e.getAttribute('name') || e.getAttribute('aria-label') || e.placeholder, value: e.value }))
  );
  return { url, title, headings, buttons, links, textboxes, text: text.substring(0, 2000) };
}
```

**Click an element:**
```js
async (page) => {
  const p = page.context().pages()[INDEX];
  await p.getByRole('button', { name: 'Submit' }).click();
  return p.url();
}
```

**Fill a form field:**
```js
async (page) => {
  const p = page.context().pages()[INDEX];
  await p.getByRole('textbox', { name: 'Email' }).fill('test@example.com');
  return 'filled';
}
```

**Handle a dialog:**
```js
async (page) => {
  const p = page.context().pages()[INDEX];
  p.once('dialog', d => d.accept());
  await p.getByRole('button', { name: 'Delete' }).click();
  return p.url();
}
```

**Check for specific text (verification):**
```js
async (page) => {
  const p = page.context().pages()[INDEX];
  const visible = await p.getByText('Success').isVisible();
  return { found: visible };
}
```

## Rules
- ONLY use `browser_run_code` — no other browser tools
- Always scope to `page.context().pages()[INDEX]`
- Use Playwright locators: `getByRole`, `getByText`, `getByLabel`, `getByPlaceholder`, `locator`
- Read page state to find elements before interacting
- Navigate with absolute URLs via `p.goto(url)` — never click nav links

## FORBIDDEN — never use these:
- `browser_snapshot`, `browser_click`, `browser_type`, `browser_navigate` — these operate on the MAIN page and will interfere with other tests
- `browser_wait` — NEVER call this
- `browser_screenshot` — NEVER use

## Error recovery
- On ANY failure: retry the failing step ONCE, then skip to Finish.

## Finish (MANDATORY — always reach this step)
1. If the test passes on manual execution, call `update_test(test_id, { script: null, script_generated_at: null })` to invalidate the stale cached script.
2. `complete_run(run_id, status, brief_summary)` — ALWAYS call this, even on error.
3. Return: {test_name} | {status} | {summary}
```

#### Wait and clean up

Wait for all agents to complete via `TaskOutput`. Then close extra tabs (newest first):

```js
async (page) => {
  const pages = page.context().pages();
  for (let i = pages.length - 1; i >= 1; i--) {
    await pages[i].close();
  }
  return { remainingPages: page.context().pages().length };
}
```

Check for orphaned runs (agents that crashed without calling `complete_run`). For any orphaned run IDs, call `complete_run(run_id, "error", "Agent crashed or timed out")`.

### Step 9: Wait for background generation

If a background generation agent was launched in Step 3, check if it has completed via `TaskOutput` with `block: false`. If still running, note this in the summary. The generated scripts will be available on the next run.

## Summarize

Present a summary table with a Mode column showing how each test was executed:

| Test | Pages | Tags | Mode | Status | Result |
|------|-------|------|------|--------|--------|
| Test name | /login, /dashboard | smoke, auth | native/agent/skipped | passed/failed/error | Brief summary |

Mode values:
- **native** — executed via `npx playwright test`
- **agent** — executed via AI agent (fallback or no script available)
- **skipped** — circuit breaker tripped, not executed

Total: "X passed, Y failed, Z errors out of N tests"

If the circuit breaker tripped, note: "Circuit breaker tripped after N consecutive failures. M tests skipped."

If background script generation is still running, note: "Script generation in progress for N tests. Scripts will be cached for next run."

If any tests failed, highlight what went wrong and suggest next steps.
