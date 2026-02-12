Run Greenrun browser tests for this project in parallel.

## Instructions

You are executing browser tests managed by Greenrun. Follow these steps precisely:

### 1. Find the project

Call `list_projects` to get all projects. Match the current project by name or base URL. If no match is found, tell the user and stop.

### 2. Prepare test batch

Call `prepare_test_batch` with the project ID.

If the user specified an argument ("$ARGUMENTS"), pass it as the `filter` parameter:
- `tag:smoke` → filters by tag
- `/checkout` → filters by page URL
- `login` → filters by test name

If no argument is given, omit the filter to run all active tests.

If the result has zero tests, tell the user and stop.

### 3. Execute tests

Read `.claude/commands/procedures.md` and follow the Execute and Summarize procedures using the batch result.
