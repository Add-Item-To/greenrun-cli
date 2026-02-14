import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiClient } from './api-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Remove keys with null or undefined values from an object (shallow). */
function stripNulls<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value != null) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}

/** Build a compact MCP text response from data, stripping nulls and using minimal JSON. */
function jsonResponse(data: unknown) {
  const cleaned = data && typeof data === 'object' && !Array.isArray(data)
    ? stripNulls(data as Record<string, unknown>)
    : data;
  return { content: [{ type: 'text' as const, text: JSON.stringify(cleaned) }] };
}

/** Read the package version from package.json. */
function readPackageVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Shared zod schema for credential sets, used by create_project and update_project. */
const credentialSchema = z.object({
  name: z.string().describe('Credential set name (e.g. "admin", "viewer")'),
  email: z.string().describe('Login email'),
  password: z.string().describe('Login password'),
});

export async function startServer(): Promise<void> {
  const GREENRUN_API_URL = process.env.GREENRUN_API_URL || 'https://app.greenrun.dev';
  const GREENRUN_API_TOKEN = process.env.GREENRUN_API_TOKEN;

  if (!GREENRUN_API_TOKEN) {
    console.error('Error: GREENRUN_API_TOKEN environment variable is required');
    process.exit(1);
  }

  const api = new ApiClient({
    baseUrl: GREENRUN_API_URL,
    token: GREENRUN_API_TOKEN,
  });

  const server = new McpServer({
    name: 'greenrun',
    version: readPackageVersion(),
  });

  // --- Projects ---

  server.tool('list_projects', 'List all projects', {}, async () => {
    const result = await api.listProjects();
    return jsonResponse(result);
  });

  server.tool(
    'create_project',
    'Create a new project',
    {
      name: z.string().describe('Project name'),
      base_url: z.string().optional().describe('Base URL of the site (e.g. https://myapp.com)'),
      description: z.string().optional().describe('Project description'),
      auth_mode: z.enum(['none', 'existing_user', 'new_user']).optional().describe('How to authenticate before tests (default: none)'),
      login_url: z.string().optional().describe('URL of login page (for existing_user auth mode)'),
      register_url: z.string().optional().describe('URL of registration page (for new_user auth mode)'),
      login_instructions: z.string().optional().describe('Steps to log in with existing credentials'),
      register_instructions: z.string().optional().describe('Steps to register a new user'),
      credentials: z.array(credentialSchema).optional().describe('Named credential sets for test authentication (max 20)'),
    },
    async (args) => {
      const result = await api.createProject(args);
      return jsonResponse(result);
    },
  );

  server.tool(
    'get_project',
    'Get project details',
    { project_id: z.string().describe('Project UUID') },
    async (args) => {
      const result = await api.getProject(args.project_id);
      return jsonResponse(result);
    },
  );

  server.tool(
    'update_project',
    'Update project settings',
    {
      project_id: z.string().describe('Project UUID'),
      name: z.string().optional().describe('Updated project name'),
      base_url: z.string().optional().describe('Updated base URL'),
      description: z.string().optional().describe('Updated description'),
      auth_mode: z.enum(['none', 'existing_user', 'new_user']).optional().describe('How to authenticate before tests'),
      login_url: z.string().optional().describe('URL of login page (for existing_user auth mode)'),
      register_url: z.string().optional().describe('URL of registration page (for new_user auth mode)'),
      login_instructions: z.string().optional().describe('Steps to log in with existing credentials'),
      register_instructions: z.string().optional().describe('Steps to register a new user'),
      credentials: z.array(credentialSchema).optional().describe('Named credential sets for test authentication (max 20)'),
    },
    async (args) => {
      const { project_id, ...data } = args;
      const result = await api.updateProject(project_id, data);
      return jsonResponse(result);
    },
  );

  // --- Pages ---

  server.tool(
    'list_pages',
    'List pages in a project',
    { project_id: z.string().describe('Project UUID') },
    async (args) => {
      const result = await api.listPages(args.project_id);
      return jsonResponse(result);
    },
  );

  server.tool(
    'create_page',
    'Register a page URL in a project',
    {
      project_id: z.string().describe('Project UUID'),
      url: z.string().describe('Page URL (absolute or relative to project base_url)'),
      name: z.string().optional().describe('Human-friendly page name'),
    },
    async (args) => {
      const result = await api.createPage(args.project_id, { url: args.url, name: args.name });
      return jsonResponse(result);
    },
  );

  // --- Tests ---

  server.tool(
    'list_tests',
    'List tests in a project (includes latest run status)',
    { project_id: z.string().describe('Project UUID') },
    async (args) => {
      const result = await api.listTests(args.project_id);
      return jsonResponse(result);
    },
  );

  server.tool(
    'get_test',
    'Get test details including instructions, pages, and recent runs',
    { test_id: z.string().describe('Test UUID') },
    async (args) => {
      const result = await api.getTest(args.test_id);
      return jsonResponse(result);
    },
  );

  server.tool(
    'create_test',
    'Store a new test case in a project',
    {
      project_id: z.string().describe('Project UUID'),
      name: z.string().describe('Test name (e.g. "User can log in")'),
      instructions: z.string().describe('Complete test instructions as plain text'),
      page_ids: z.array(z.string()).optional().describe('UUIDs of pages this test covers'),
      status: z.enum(['draft', 'active', 'archived']).optional().describe('Test status (default: active)'),
      tags: z.array(z.string()).optional().describe('Tag names for organizing tests (e.g. ["smoke", "auth"])'),
      credential_name: z.string().optional().describe('Name of a credential set from the project to use for authentication'),
    },
    async (args) => {
      const result = await api.createTest(args.project_id, {
        name: args.name,
        instructions: args.instructions,
        page_ids: args.page_ids,
        status: args.status,
        tags: args.tags,
        credential_name: args.credential_name,
      });
      return jsonResponse(result);
    },
  );

  server.tool(
    'update_test',
    'Update test instructions, name, status, or page associations',
    {
      test_id: z.string().describe('Test UUID'),
      name: z.string().optional().describe('Updated test name'),
      instructions: z.string().optional().describe('Updated test instructions'),
      page_ids: z.array(z.string()).optional().describe('Updated page UUIDs (replaces existing)'),
      status: z.enum(['draft', 'active', 'archived']).optional().describe('Updated status'),
      tags: z.array(z.string()).optional().describe('Updated tag names (replaces existing tags)'),
      credential_name: z.string().optional().nullable().describe('Name of a credential set from the project to use for authentication'),
      script: z.string().optional().nullable().describe('Generated Playwright test script'),
      script_generated_at: z.string().optional().nullable().describe('ISO timestamp when the script was generated'),
    },
    async (args) => {
      const { test_id, ...data } = args;
      await api.updateTest(test_id, data);
      return jsonResponse({ success: true });
    },
  );

  server.tool(
    'export_test_script',
    'Fetch a test\'s cached Playwright script and write it directly to a file. The script content is never returned — only a confirmation. Use this to export scripts without consuming context.',
    {
      test_id: z.string().describe('Test UUID'),
      file_path: z.string().describe('Absolute file path to write the script to (e.g. /tmp/greenrun-tests/{test_id}.spec.ts)'),
    },
    async (args) => {
      const result = await api.getTest(args.test_id);
      const script = result.test?.script;
      if (!script) {
        return { content: [{ type: 'text', text: `No script found for test ${args.test_id}` }] };
      }
      mkdirSync(dirname(args.file_path), { recursive: true });
      writeFileSync(args.file_path, script, 'utf-8');
      return { content: [{ type: 'text', text: `Script written to ${args.file_path} (${script.length} chars)` }] };
    },
  );

  server.tool(
    'export_test_instructions',
    'Fetch a test\'s instructions and write them to a local file. The instructions are never returned — only a confirmation. Use this so agents can read instructions from disk instead of receiving them through MCP context.',
    {
      test_id: z.string().describe('Test UUID'),
      file_path: z.string().describe('Absolute file path to write the instructions to (e.g. /tmp/greenrun-tests/{test_id}.instructions.md)'),
    },
    async (args) => {
      const result = await api.getTest(args.test_id);
      const instructions = result.test?.instructions;
      if (!instructions) {
        return { content: [{ type: 'text', text: `No instructions found for test ${args.test_id}` }] };
      }
      mkdirSync(dirname(args.file_path), { recursive: true });
      const header = result.test.name ? `# ${result.test.name}\n\n` : '';
      writeFileSync(args.file_path, header + instructions, 'utf-8');
      return { content: [{ type: 'text', text: `Instructions written to ${args.file_path} (${instructions.length} chars)` }] };
    },
  );

  // --- Sweep ---

  server.tool(
    'sweep',
    'Find tests affected by specific pages (impact analysis). Use after making changes to determine which tests to re-run.',
    {
      project_id: z.string().describe('Project UUID'),
      pages: z.array(z.string()).optional().describe('Exact page URLs to match'),
      url_pattern: z.string().optional().describe('Glob-style URL pattern (e.g. /checkout*)'),
    },
    async (args) => {
      const result = await api.sweep(args.project_id, {
        pages: args.pages,
        url_pattern: args.url_pattern,
      });
      return jsonResponse(result);
    },
  );

  // --- Batch ---

  server.tool(
    'prepare_test_batch',
    'Prepare a batch of tests for execution: lists tests, filters, fetches full details, and starts runs — all in one call. Returns everything needed to execute tests.',
    {
      project_id: z.string().describe('Project UUID'),
      filter: z.string().optional().describe('Filter: "tag:xxx" for tag, "/path" for page URL, or text for name substring'),
      test_ids: z.array(z.string()).optional().describe('Specific test UUIDs to run (overrides filter)'),
    },
    async (args) => {
      try {
        const result = await api.prepareTestBatch(args.project_id, args.filter, args.test_ids);
        return jsonResponse(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
      }
    },
  );

  // --- Test Runs ---

  server.tool(
    'start_run',
    'Start a test run (sets status to running)',
    { test_id: z.string().describe('Test UUID') },
    async (args) => {
      const result = await api.startRun(args.test_id);
      return jsonResponse({ run_id: result.run.id });
    },
  );

  server.tool(
    'complete_run',
    'Record the result of a test run',
    {
      run_id: z.string().describe('Run UUID'),
      status: z.enum(['passed', 'failed', 'error']).describe('Run result status'),
      result: z.string().optional().describe('Summary of what happened during the run'),
    },
    async (args) => {
      await api.completeRun(args.run_id, {
        status: args.status,
        result: args.result,
      });
      return jsonResponse({ success: true });
    },
  );

  server.tool(
    'batch_complete_runs',
    'Record results for multiple test runs in a single call. More efficient than calling complete_run individually.',
    {
      runs: z.array(z.object({
        run_id: z.string().describe('Run UUID'),
        status: z.enum(['passed', 'failed', 'error']).describe('Run result status'),
        result: z.string().optional().describe('Summary of what happened'),
      })).describe('Array of run results to complete'),
    },
    async (args) => {
      const result = await api.batchCompleteRuns(args.runs);
      return jsonResponse(result);
    },
  );

  server.tool(
    'get_run',
    'Get details of a specific test run',
    { run_id: z.string().describe('Run UUID') },
    async (args) => {
      const result = await api.getRun(args.run_id);
      return jsonResponse(result);
    },
  );

  server.tool(
    'list_runs',
    'List run history for a test (newest first)',
    { test_id: z.string().describe('Test UUID') },
    async (args) => {
      const result = await api.listRuns(args.test_id);
      return jsonResponse(result);
    },
  );

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
