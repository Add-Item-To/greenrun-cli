Run Greenrun browser tests for this project.

## Instructions

You are executing browser tests managed by Greenrun. Follow these steps precisely:

### 1. Find the project

Call `list_projects` to get all projects. Match the current project by name or base URL. If no match is found, tell the user and stop.

### 2. Get tests

Call `list_tests` with the project ID. If the user specified a test name as an argument ("$ARGUMENTS"), filter to only that test. Otherwise, run all active tests.

If there are no active tests, tell the user and stop.

### 3. Execute each test

For each test:

1. Call `get_test` to retrieve full instructions and page URLs
2. Call `start_run` to begin a run - save the returned `run_id`
3. **Execute the test instructions using browser automation:**
   - Navigate to the test's page URL in Chrome
   - Follow each instruction step exactly as written
   - Observe the results and take screenshots as needed for verification
4. Call `complete_run` with:
   - `run_id`: the run ID from step 2
   - `status`: "passed" if all checks succeeded, "failed" if any check failed, "error" if execution was blocked
   - `result`: a brief summary of what happened

### 4. Summarize results

After all tests complete, present a summary table:

| Test | Status | Result |
|------|--------|--------|
| Test name | passed/failed/error | Brief summary |

If any tests failed, highlight what went wrong and suggest next steps.
