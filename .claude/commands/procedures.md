Shared procedures for executing Greenrun browser tests. Referenced by `/greenrun` and `/greenrun-sweep`.

## Authenticate

Before executing tests, handle authentication based on the project's `auth_mode` from the batch result.

- **`none`** (or missing): Skip authentication entirely.
- **`existing_user`**: Navigate to the project's `login_url` and follow the `login_instructions` step by step. Use `browser_snapshot` after to verify the page shows an authenticated state (no login form visible).
- **`new_user`**: Navigate to the project's `register_url` and follow the `register_instructions` step by step. Use `browser_snapshot` after to verify registration succeeded and the user is authenticated.

### Credentials

The project may include a `credentials` array — named credential sets with `name`, `email`, and `password`. Each test may have a `credential_name` field referencing one of these sets.

When authenticating for a test with `credential_name`:
- Find the matching credential in `project.credentials` by name
- Use that credential's email and password to fill the login form at `login_url`
- If no `credential_name` is set on a test, use the first credential in the array (or fall back to `login_instructions`)

When authenticating once for a batch (Step 1 below), use the credential that appears most frequently across the batch's tests. If tests use different credentials, re-authenticate between tests as needed.

If auth fails (login form still visible after following instructions), report all tests as error with "Authentication failed" and stop.

## Execute

You have a batch result from `prepare_test_batch` containing `project` (with `credentials` array) and `tests[]` (each with `test_id`, `test_name`, `run_id`, `credential_name`, `pages`, `tags`, `has_script`).

Note: The batch does not include `instructions` or `script` content. Use `export_test_instructions(test_id, file_path)` to write instructions to disk — agents read from the file instead of receiving them through MCP context.

If `tests` is empty, tell the user no matching active tests were found and stop.

### Step 1: Authenticate on the main page

Run the Authenticate procedure above once, using the standard Playwright tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`).

### Step 2: Classify tests

Split the batch into two groups:

- **scripted**: tests where `has_script` is true (cached Playwright scripts ready to run)
- **unscripted**: tests where `has_script` is false (need script generation)

If all tests are scripted, skip to Step 4.

### Step 3: Generate scripts for unscripted tests

For each **unscripted** test:

1. Call `export_test_instructions(test_id, "/tmp/greenrun-tests/{test_id}.instructions.md")` to write instructions to disk
2. Launch a Task agent sequentially (one at a time, wait for each to complete before starting the next). This keeps browser snapshot data out of the parent context.

```
Task tool with:
- subagent_type: "general-purpose"
- max_turns: 30
- model: "sonnet"
- prompt: (see agent prompt below)
```

#### Script generation agent prompt

Include the following in the prompt, substituting the actual values:

```
Greenrun script generation for test: {test_name}
Test ID: {test_id}
Project ID: {project_id}

Project auth: {auth_mode}, login_url: {login_url}
Credentials: {credential_name} — email: {email}, password: {password}

## Task

1. Read the test instructions from `/tmp/greenrun-tests/{test_id}.instructions.md` (exported before agent launch)
2. Authenticate: navigate to {login_url} and log in with the credential above using `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`
3. Do a scouting pass — follow the test instructions step by step in the browser:
   - Navigate to the test's starting page via `browser_navigate`
   - Take a `browser_snapshot` to see initial elements
   - Follow each instruction using Playwright MCP tools (`browser_click`, `browser_type`, `browser_snapshot` after each action)
   - Snapshot after each state change to capture selectors, validation errors, success banners, modal dialogs, redirected pages
4. Handle failures:
   - If a step fails because the test instructions are wrong (wrong field name, missing step, bad selector), fix the instructions and retry. Update the test via `update_test` with corrected instructions.
   - If a step fails because of an application bug, work around it for the main test and create a new bug test:
     `create_test({project_id}, { name: "BUG: [description]", instructions: "[repro steps]", tags: ["bug"], page_ids: [...], credential_name: "{credential_name}" })`
     Then: `start_run(bug_test_id)` → `complete_run(run_id, "failed", "description")`
5. After scouting, generate a Playwright `.spec.ts` script:

import { test, expect } from '@playwright/test';
test('{test_name}', async ({ page }) => {
  // Include login steps using the credential email + password at login_url
  await page.goto('{start_url}');
  // Steps from scouting observations
  // Use getByRole, getByText, getByLabel, getByPlaceholder for selectors
});

6. Save: `update_test("{test_id}", { script: <generated_script>, script_generated_at: "<ISO_now>" })`
7. Close browser: `browser_close`

## Return

Return a one-line summary: {test_name} | script generated | or | {test_name} | failed | {reason}
```

After each agent completes, note the result and proceed to the next unscripted test.

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

**0. Clean up** — run `rm -rf /tmp/greenrun-tests` via Bash to clear any stale files from a previous run.

**1. Fetch scripts and write test files** — call `export_test_script` for each scripted test (all calls in parallel). This fetches each script from the API and writes it directly to disk without returning the script content, keeping context clean. Also write the Playwright config directly.

For each scripted test, call in parallel:
```
export_test_script(test_id: "{test_id}", file_path: "/tmp/greenrun-tests/{test_id}.spec.ts")
```

Then write `/tmp/greenrun-tests/playwright.config.ts` directly:

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  timeout: 30000,
  workers: 20,
  reporter: [['json', { outputFile: 'results.json' }]],
  use: {
    baseURL: '{base_url}',
    // include storageState ONLY if auth_mode is not 'none':
    storageState: '/tmp/greenrun-auth-state.json',
  },
});
```

Wait for all agents to complete before executing.

**2. Execute** — run via Bash:
```
npx playwright test --config /tmp/greenrun-tests/playwright.config.ts
```

**3. Parse results**: Read `/tmp/greenrun-tests/results.json`. Map each result back to a run ID via the filename: `{test_id}.spec.ts` → test_id → find the matching run_id from the batch.

**4. Report results**: Call `batch_complete_runs` with all results at once. Map Playwright statuses: `passed` → `passed`, `failed`/`timedOut` → `failed`, other → `error`. Example: `batch_complete_runs({ runs: [{ run_id, status, result }] })`.

**5. Clean up**: Call `browser_close` to reset the MCP browser context.

### Step 6: Circuit breaker

After parsing all native results, walk through them in completion order. Track consecutive failures:

- If **3 or more consecutive failures** occur:
  - Mark all remaining un-reported tests as error: "Circuit breaker: N consecutive failures detected"
  - Skip AI fallback for remaining tests
  - The counter resets on any pass

### Step 7: AI fallback for native failures

For tests that **failed** in native execution (and circuit breaker has not tripped), execute them one at a time via Task agents. This keeps snapshot data out of the parent context.

For each failed test:

1. Call `export_test_instructions(test_id, "/tmp/greenrun-tests/{test_id}.instructions.md")` to write instructions to disk
2. Launch a Task agent sequentially (wait for each to complete before the next):

```
Task tool with:
- subagent_type: "general-purpose"
- max_turns: 25
- model: "sonnet"
- prompt: (see agent prompt below)
```

#### AI fallback agent prompt

```
Greenrun AI fallback test. Test: {test_name}
Test ID: {test_id}

Project auth: {auth_mode}, login_url: {login_url}
Credentials: {credential_name} — email: {email}, password: {password}

Native execution failed with: {failure_message}

## Task

1. Read the test instructions from `/tmp/greenrun-tests/{test_id}.instructions.md` (exported before agent launch)
2. Start a new run: `start_run("{test_id}")` — note the run_id
3. Authenticate: navigate to {login_url} and log in with the credential above
4. Follow the test instructions step by step using Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`)
5. Determine if the native failure was a stale script (UI changed) or an actual application bug
6. If the test passes manually, invalidate the stale cached script: `update_test("{test_id}", { script: null, script_generated_at: null })`
7. Call `complete_run(run_id, status, brief_summary)` — ALWAYS call this, even on error
8. Call `browser_close`

## Return

Return: {test_name} | {status} | {summary}
```

After each agent completes, note the result. If the agent fails to call `complete_run`, call it yourself with status "error".

### Step 8: Handle unscripted tests without scripts

Any tests that didn't get scripts generated in Step 3 (e.g. if script generation failed) need to be executed the same way as Step 7 — launch a Task agent for each one sequentially using the AI fallback agent prompt above (omit the "Native execution failed with" line).

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

If any tests failed, highlight what went wrong and suggest next steps.
