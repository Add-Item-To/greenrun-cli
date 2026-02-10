Run Greenrun impact analysis to find tests affected by recent code changes.

## Instructions

You are performing impact analysis to determine which browser tests need to be re-run based on code changes. Tests are linked to pages (URL paths) and tags as organizational metadata - sweep uses page associations to find affected tests.

### 1. Find changed files

Run `git diff --name-only HEAD~1` (or `git diff --name-only` for unstaged changes) to identify which files have changed. If the user specified a commit range as an argument ("$ARGUMENTS"), use that instead.

### 2. Find the project

Call `list_projects` to get all projects. Match the current project by name or base URL.

### 3. Map changes to pages

Call `list_pages` for the project. Look at the changed files and determine which page URLs they likely affect. Consider:
- View/template files -> the routes they render
- Controller/API files -> the pages that call those endpoints
- Component files -> pages that use those components
- CSS/JS assets -> pages that include them

### 4. Run sweep

Call `sweep` with the project ID and either:
- `pages`: specific page URLs that match the changes
- `url_pattern`: a glob pattern matching affected URLs

### 5. Report results

Present the affected tests:

| Test | Pages | Tags | Last Status |
|------|-------|------|-------------|
| Test name | Affected page URLs | tag1, tag2 | passed/failed/never run |

### 6. Offer to run

Ask the user if they want to run the affected tests. If yes, execute them **in parallel** using the same approach as the `/greenrun` command:

Use the project's `concurrency` setting (default: 5) to determine batch size. Split affected tests into batches and launch each batch simultaneously using the **Task tool** with `run_in_background: true`.

For each test in a batch, launch a background agent with this prompt:

```
You are executing a single Greenrun browser test. You have access to browser automation tools and Greenrun MCP tools.

**Test: {test_name}** (ID: {test_id})

Step 1: Call `get_test` with test_id "{test_id}" to get full instructions.
Step 2: Call `start_run` with test_id "{test_id}" to begin - save the returned `run_id`.
Step 3: Execute the test instructions using browser automation:
   - Create a new browser tab for this test
   - Follow each instruction step exactly as written
   - The instructions will tell you where to navigate and what to do
   - Observe results and take screenshots as needed for verification
Step 4: Call `complete_run` with:
   - run_id: the run ID from step 2
   - status: "passed" if all checks succeeded, "failed" if any check failed, "error" if execution was blocked
   - result: a brief summary of what happened

Return a single line summary: {test_name} | {status} | {result_summary}
```

Wait for each batch to complete before launching the next. After all tests finish, present a summary table:

| Test | Pages | Tags | Status | Result |
|------|-------|------|--------|--------|
| Test name | Affected page URLs | tag1, tag2 | passed/failed/error | Brief summary |

Include the total count: "X passed, Y failed, Z errors out of N tests"
