Run Greenrun impact analysis to find tests affected by recent code changes.

## Instructions

You are performing impact analysis to determine which browser tests need to be re-run based on code changes.

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

Ask the user if they want to run the affected tests. If yes, execute them following the same process as the `/greenrun` command:
- `get_test` -> `start_run` -> execute instructions via browser -> `complete_run`
