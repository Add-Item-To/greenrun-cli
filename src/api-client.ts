/** Configuration for connecting to the Greenrun API. */
export interface ApiConfig {
  baseUrl: string;
  token: string;
}

/** Credential set stored on a project. */
export interface Credential {
  name: string;
  email: string;
  password: string;
}

/** Project data returned by the API. */
export interface ProjectResponse {
  id: string;
  name: string;
  base_url?: string;
  description?: string;
  auth_mode?: string;
  login_url?: string;
  register_url?: string;
  login_instructions?: string;
  register_instructions?: string;
  credentials?: Credential[];
  tests_count?: number;
  pages_count?: number;
}

/** Tag data as returned by the API (may be a string or object with name). */
interface TagData {
  name?: string;
  [key: string]: unknown;
}

/** Page data as returned by the API. */
interface PageData {
  id: string;
  url: string;
  [key: string]: unknown;
}

/** Test data returned by the API. */
export interface TestResponse {
  id: string;
  name: string;
  instructions?: string;
  status?: string;
  credential_name?: string;
  has_script?: boolean;
  script?: string;
  script_generated_at?: string;
  pages?: PageData[];
  tags?: (string | TagData)[];
  [key: string]: unknown;
}

/** Run data returned by the API. */
export interface RunResponse {
  id: string;
  status: string;
  result?: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

/** Summary of a test in a prepared batch. */
export interface BatchTestSummary {
  test_id: string;
  test_name: string;
  run_id: string;
  credential_name: string | null;
  pages: { id: string; url: string }[];
  tags: string[];
  has_script: boolean;
}

/** Project summary included in a batch result, with auth fields filtered by relevance. */
export interface BatchProjectSummary {
  id: string;
  name: string;
  base_url?: string;
  auth_mode: string;
  login_url?: string;
  register_url?: string;
  login_instructions?: string;
  register_instructions?: string;
  credentials?: Credential[];
}

/** Result of preparing a test batch for execution. */
export interface BatchResult {
  project: BatchProjectSummary;
  tests: BatchTestSummary[];
}

/** A single run result for batch completion. */
export interface RunResult {
  run_id: string;
  status: string;
  result?: string;
}

/** HTTP client for the Greenrun API. */
export class ApiClient {
  private baseUrl: string;
  private token: string;

  constructor(config: ApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token;
  }

  /** Make an authenticated request to the API. */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      let message: string;
      try {
        const json = JSON.parse(text);
        message = json.message || text;
      } catch {
        message = text;
      }
      throw new Error(`API ${method} ${path} failed (${response.status}): ${message}`);
    }

    return response.json() as Promise<T>;
  }

  // --- Projects ---

  /** List all projects accessible to the authenticated user. */
  async listProjects() {
    return this.request<{ projects: ProjectResponse[] }>('GET', '/projects');
  }

  /** Create a new project. */
  async createProject(data: {
    name: string;
    base_url?: string;
    description?: string;
    auth_mode?: string;
    login_url?: string;
    register_url?: string;
    login_instructions?: string;
    register_instructions?: string;
    credentials?: Credential[];
  }) {
    return this.request<{ project: ProjectResponse }>('POST', '/projects', data);
  }

  /** Get a project by ID. */
  async getProject(id: string) {
    return this.request<{ project: ProjectResponse }>('GET', `/projects/${id}`);
  }

  /** Update a project's settings. */
  async updateProject(id: string, data: {
    name?: string;
    base_url?: string;
    description?: string;
    auth_mode?: string;
    login_url?: string;
    register_url?: string;
    login_instructions?: string;
    register_instructions?: string;
    credentials?: Credential[];
  }) {
    return this.request<{ project: ProjectResponse }>('PUT', `/projects/${id}`, data);
  }

  /** Delete a project by ID. */
  async deleteProject(id: string) {
    return this.request<{ message: string }>('DELETE', `/projects/${id}`);
  }

  // --- Pages ---

  /** List all pages in a project. */
  async listPages(projectId: string) {
    return this.request<{ pages: PageData[] }>('GET', `/projects/${projectId}/pages`);
  }

  /** Register a new page URL in a project. */
  async createPage(projectId: string, data: { url: string; name?: string }) {
    return this.request<{ page: PageData }>('POST', `/projects/${projectId}/pages`, data);
  }

  /** Update a page's URL or name. */
  async updatePage(id: string, data: { url?: string; name?: string }) {
    return this.request<{ page: PageData }>('PUT', `/pages/${id}`, data);
  }

  /** Delete a page by ID. */
  async deletePage(id: string) {
    return this.request<{ message: string }>('DELETE', `/pages/${id}`);
  }

  // --- Tests ---

  /** List tests in a project. Pass compact=true to omit instructions/script content. */
  async listTests(projectId: string, compact?: boolean) {
    const query = compact ? '?compact=1' : '';
    return this.request<{ tests: TestResponse[] }>('GET', `/projects/${projectId}/tests${query}`);
  }

  /** Create a new test in a project. */
  async createTest(projectId: string, data: {
    name: string;
    instructions: string;
    page_ids?: string[];
    status?: string;
    tags?: string[];
    credential_name?: string;
  }) {
    return this.request<{ test: TestResponse }>('POST', `/projects/${projectId}/tests`, data);
  }

  /** Get full test details including instructions, pages, and recent runs. */
  async getTest(id: string) {
    return this.request<{ test: TestResponse }>('GET', `/tests/${id}`);
  }

  /** Update a test's properties. */
  async updateTest(id: string, data: {
    name?: string;
    instructions?: string;
    page_ids?: string[];
    status?: string;
    tags?: string[];
    credential_name?: string | null;
    script?: string | null;
    script_generated_at?: string | null;
  }) {
    return this.request<{ test: TestResponse }>('PUT', `/tests/${id}`, data);
  }

  /** Delete a test by ID. */
  async deleteTest(id: string) {
    return this.request<{ message: string }>('DELETE', `/tests/${id}`);
  }

  // --- Sweep ---

  /** Find tests affected by specific pages (impact analysis). */
  async sweep(projectId: string, params: { pages?: string[]; url_pattern?: string }) {
    const searchParams = new URLSearchParams();
    if (params.pages) {
      for (const page of params.pages) {
        searchParams.append('pages[]', page);
      }
    }
    if (params.url_pattern) {
      searchParams.set('url_pattern', params.url_pattern);
    }
    return this.request<unknown>('GET', `/projects/${projectId}/sweep?${searchParams.toString()}`);
  }

  // --- Test Runs ---

  /** Start a new test run (sets status to running). */
  async startRun(testId: string) {
    return this.request<{ run: RunResponse }>('POST', `/tests/${testId}/runs`);
  }

  /** Record the result of a single test run. */
  async completeRun(runId: string, data: { status: string; result?: string }) {
    return this.request<{ run: RunResponse }>('PUT', `/runs/${runId}`, data);
  }

  /** Complete multiple test runs in a single batch call. */
  async batchCompleteRuns(runs: RunResult[]): Promise<{ completed: number }> {
    return this.request<{ completed: number }>('PUT', '/runs/batch', { runs });
  }

  /** Get details of a specific test run. */
  async getRun(runId: string) {
    return this.request<{ run: RunResponse }>('GET', `/runs/${runId}`);
  }

  /** List run history for a test (newest first). */
  async listRuns(testId: string) {
    return this.request<unknown>('GET', `/tests/${testId}/runs`);
  }

  // --- Batch Operations ---

  /**
   * Prepare a batch of tests for execution. Lists tests, applies filters,
   * fetches project details, and starts runs — all in one call.
   * Only includes credentials referenced by the batch's tests.
   */
  async prepareTestBatch(projectId: string, filter?: string, testIds?: string[]): Promise<BatchResult> {
    const [projectResult, testsResult] = await Promise.all([
      this.getProject(projectId),
      this.listTests(projectId, true),
    ]);

    const project = projectResult.project;
    const activeTests = filterTests(testsResult.tests || [], filter, testIds);

    const projectSummary = buildProjectSummary(project, activeTests);

    if (activeTests.length === 0) {
      return { project: projectSummary, tests: [] };
    }

    const runs = await startBatchRuns(activeTests, (testId) => this.startRun(testId));

    return {
      project: projectSummary,
      tests: activeTests.map((test, index) => ({
        test_id: test.id,
        test_name: test.name,
        run_id: runs[index].run.id,
        credential_name: test.credential_name ?? null,
        pages: (test.pages || []).map((page) => ({ id: page.id, url: page.url })),
        tags: (test.tags || []).map((tag) => typeof tag === 'string' ? tag : tag.name || ''),
        has_script: test.has_script ?? !!test.script,
      })),
    };
  }
}

/** Filter tests by test IDs, tag, page URL, or name substring. */
function filterTests(tests: TestResponse[], filter?: string, testIds?: string[]): TestResponse[] {
  let activeTests = tests.filter((test) => test.status === 'active');

  if (testIds && testIds.length > 0) {
    const idSet = new Set(testIds);
    activeTests = activeTests.filter((test) => idSet.has(test.id));
  } else if (filter) {
    if (filter.startsWith('tag:')) {
      const tagName = filter.slice(4).toLowerCase();
      activeTests = activeTests.filter((test) =>
        (test.tags || []).some((tag) => {
          const name = typeof tag === 'string' ? tag : tag.name || '';
          return name.toLowerCase() === tagName;
        }),
      );
    } else if (filter.startsWith('/')) {
      activeTests = activeTests.filter((test) =>
        (test.pages || []).some((page) => (page.url || '').includes(filter)),
      );
    } else {
      const term = filter.toLowerCase();
      activeTests = activeTests.filter((test) => (test.name || '').toLowerCase().includes(term));
    }
  }

  return activeTests;
}

/**
 * Build a project summary for the batch response.
 * Omits auth fields when auth_mode is 'none'.
 * Only includes credentials referenced by the batch's tests.
 */
function buildProjectSummary(project: ProjectResponse, tests: TestResponse[]): BatchProjectSummary {
  const authMode = project.auth_mode ?? 'none';

  if (authMode === 'none') {
    return { id: project.id, name: project.name, base_url: project.base_url, auth_mode: 'none' };
  }

  const referencedNames = new Set(
    tests.map((test) => test.credential_name).filter((name): name is string => !!name),
  );

  const allCredentials = project.credentials ?? [];
  const filteredCredentials = referencedNames.size > 0
    ? allCredentials.filter((cred) => referencedNames.has(cred.name))
    : allCredentials;

  return {
    id: project.id,
    name: project.name,
    base_url: project.base_url,
    auth_mode: authMode,
    login_url: project.login_url,
    register_url: project.register_url,
    login_instructions: project.login_instructions,
    register_instructions: project.register_instructions,
    credentials: filteredCredentials.length > 0 ? filteredCredentials : undefined,
  };
}

/** Start runs for all tests in parallel. */
async function startBatchRuns(
  tests: TestResponse[],
  startRun: (testId: string) => Promise<{ run: RunResponse }>,
): Promise<{ run: RunResponse }[]> {
  return Promise.all(tests.map((test) => startRun(test.id)));
}
