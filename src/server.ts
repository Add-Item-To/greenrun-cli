import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ApiClient } from './api-client.js';

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
    version: '0.1.0',
  });

  // --- Projects ---

  server.tool('list_projects', 'List all projects', {}, async () => {
    const result = await api.listProjects();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool(
    'create_project',
    'Create a new project',
    {
      name: z.string().describe('Project name'),
      base_url: z.string().optional().describe('Base URL of the site (e.g. https://myapp.com)'),
      description: z.string().optional().describe('Project description'),
      concurrency: z.number().int().min(1).max(20).optional().describe('Number of tests to run in parallel (default: 5)'),
    },
    async (args) => {
      const result = await api.createProject(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_project',
    'Get project details',
    { project_id: z.string().describe('Project UUID') },
    async (args) => {
      const result = await api.getProject(args.project_id);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Pages ---

  server.tool(
    'list_pages',
    'List pages in a project',
    { project_id: z.string().describe('Project UUID') },
    async (args) => {
      const result = await api.listPages(args.project_id);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Tests ---

  server.tool(
    'list_tests',
    'List tests in a project (includes latest run status)',
    { project_id: z.string().describe('Project UUID') },
    async (args) => {
      const result = await api.listTests(args.project_id);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_test',
    'Get test details including instructions, pages, and recent runs',
    { test_id: z.string().describe('Test UUID') },
    async (args) => {
      const result = await api.getTest(args.test_id);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
    },
    async (args) => {
      const result = await api.createTest(args.project_id, {
        name: args.name,
        instructions: args.instructions,
        page_ids: args.page_ids,
        status: args.status,
        tags: args.tags,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
    },
    async (args) => {
      const { test_id, ...data } = args;
      const result = await api.updateTest(test_id, data);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Test Runs ---

  server.tool(
    'start_run',
    'Start a test run (sets status to running)',
    { test_id: z.string().describe('Test UUID') },
    async (args) => {
      const result = await api.startRun(args.test_id);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
      const result = await api.completeRun(args.run_id, {
        status: args.status,
        result: args.result,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'get_run',
    'Get details of a specific test run',
    { run_id: z.string().describe('Run UUID') },
    async (args) => {
      const result = await api.getRun(args.run_id);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'list_runs',
    'List run history for a test (newest first)',
    { test_id: z.string().describe('Test UUID') },
    async (args) => {
      const result = await api.listRuns(args.test_id);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
