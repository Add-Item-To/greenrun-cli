Run Greenrun browser tests for this project in parallel.

## Instructions

You are executing browser tests managed by Greenrun. Tests run in parallel using background agents, each with its own browser tab. Follow these steps precisely:

### 1. Find the project

Call `list_projects` to get all projects. Match the current project by name or base URL. If no match is found, tell the user and stop.

Note the project's `concurrency` value (default: 5). This controls how many tests run simultaneously.

### 2. Get tests

Call `list_tests` with the project ID. Each test has associated pages and tags which are organizational metadata for filtering.

If the user specified an argument ("$ARGUMENTS"), use it to filter tests:
- If it starts with `/` (e.g. `/checkout`), filter to tests linked to a page matching that URL
- If it starts with `tag:` (e.g. `tag:smoke`), filter to tests with that tag
- Otherwise, treat it as a test name filter

If no argument is given, run all active tests.

If there are no matching active tests, tell the user and stop.

### 3. Execute tests in parallel

Split the test list into batches of size `concurrency` (from the project settings).

For each batch, launch all tests simultaneously using the **Task tool** with `run_in_background: true`. Each background agent receives a prompt containing everything it needs to execute one test independently:

```
For each test in the current batch, call the Task tool with:
- subagent_type: "general-purpose"
- run_in_background: true
- max_turns: 30
- model: "sonnet"
- prompt: (see below)
```

The prompt for each background agent should be:

```
You are executing a single Greenrun browser test. You have access to browser automation tools and Greenrun MCP tools.

**Test: {test_name}** (ID: {test_id})

Step 1: Call `get_test` with test_id "{test_id}" to get full instructions.
Step 2: Call `start_run` with test_id "{test_id}" to begin - save the returned `run_id`.
Step 3: Execute the test instructions using browser automation:
   - Call `tabs_context_mcp` then create a new browser tab for this test
   - Follow each instruction step exactly as written
   - The instructions will tell you where to navigate and what to do
   - Only take a screenshot when you need to verify a visual assertion — not for every navigation or click
   - When reading page content, prefer `find` or `read_page` with `filter: "interactive"` over full DOM reads
   - NEVER trigger JavaScript alerts, confirms, or prompts — they block the browser extension entirely. Before clicking delete buttons or other destructive actions, use `javascript_tool` to override: `window.alert = () => {}; window.confirm = () => true; window.prompt = () => null;`
   - If browser tools stop responding (no result or timeout), assume a dialog is blocking — report the error and stop. Do not keep retrying.
   - If you get stuck or a step fails, record the failure and move on — do not retry more than once
Step 4: Call `complete_run` with:
   - run_id: the run ID from step 2
   - status: "passed" if all checks succeeded, "failed" if any check failed, "error" if execution was blocked
   - result: a brief summary of what happened (include the failure reason if failed/error)
Step 5: Close the browser tab you created to clean up.

Return a single line summary: {test_name} | {status} | {result_summary}
```

After launching all agents in a batch, wait for them all to complete (use `TaskOutput` to collect results) before launching the next batch.

### 4. Summarize results

After all batches complete, collect results from all background agents and present a summary table:

| Test | Pages | Tags | Status | Result |
|------|-------|------|--------|--------|
| Test name | /login, /dashboard | smoke, auth | passed/failed/error | Brief summary |

Include the total count: "X passed, Y failed, Z errors out of N tests"

If any tests failed, highlight what went wrong and suggest next steps.
