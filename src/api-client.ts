export interface ApiConfig {
  baseUrl: string;
  token: string;
}

export class ApiClient {
  private baseUrl: string;
  private token: string;

  constructor(config: ApiConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.token = config.token;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
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

    return response.json();
  }

  // Projects
  async listProjects() {
    return this.request('GET', '/projects');
  }

  async createProject(data: {
    name: string;
    base_url?: string;
    description?: string;
    auth_mode?: string;
    login_url?: string;
    register_url?: string;
    login_instructions?: string;
    register_instructions?: string;
    credentials?: { name: string; email: string; password: string }[];
  }) {
    return this.request('POST', '/projects', data);
  }

  async getProject(id: string) {
    return this.request('GET', `/projects/${id}`);
  }

  async updateProject(id: string, data: {
    name?: string;
    base_url?: string;
    description?: string;
    auth_mode?: string;
    login_url?: string;
    register_url?: string;
    login_instructions?: string;
    register_instructions?: string;
    credentials?: { name: string; email: string; password: string }[];
  }) {
    return this.request('PUT', `/projects/${id}`, data);
  }

  async deleteProject(id: string) {
    return this.request('DELETE', `/projects/${id}`);
  }

  // Pages
  async listPages(projectId: string) {
    return this.request('GET', `/projects/${projectId}/pages`);
  }

  async createPage(projectId: string, data: { url: string; name?: string }) {
    return this.request('POST', `/projects/${projectId}/pages`, data);
  }

  async updatePage(id: string, data: { url?: string; name?: string }) {
    return this.request('PUT', `/pages/${id}`, data);
  }

  async deletePage(id: string) {
    return this.request('DELETE', `/pages/${id}`);
  }

  // Tests
  async listTests(projectId: string) {
    return this.request('GET', `/projects/${projectId}/tests`);
  }

  async createTest(projectId: string, data: { name: string; instructions: string; page_ids?: string[]; status?: string; tags?: string[]; credential_name?: string }) {
    return this.request('POST', `/projects/${projectId}/tests`, data);
  }

  async getTest(id: string) {
    return this.request('GET', `/tests/${id}`);
  }

  async updateTest(id: string, data: { name?: string; instructions?: string; page_ids?: string[]; status?: string; tags?: string[]; credential_name?: string | null; script?: string | null; script_generated_at?: string | null }) {
    return this.request('PUT', `/tests/${id}`, data);
  }

  async deleteTest(id: string) {
    return this.request('DELETE', `/tests/${id}`);
  }

  // Sweep
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
    return this.request('GET', `/projects/${projectId}/sweep?${searchParams.toString()}`);
  }

  // Test Runs
  async startRun(testId: string) {
    return this.request('POST', `/tests/${testId}/runs`);
  }

  async completeRun(runId: string, data: { status: string; result?: string }) {
    return this.request('PUT', `/runs/${runId}`, data);
  }

  async getRun(runId: string) {
    return this.request('GET', `/runs/${runId}`);
  }

  async listRuns(testId: string) {
    return this.request('GET', `/tests/${testId}/runs`);
  }

  // Batch operations
  async prepareTestBatch(projectId: string, filter?: string, testIds?: string[]) {
    const [projectResult, testsResult] = await Promise.all([
      this.getProject(projectId) as Promise<{ project: any }>,
      this.listTests(projectId) as Promise<{ tests: any[] }>,
    ]);

    const project = projectResult.project;
    let tests = (testsResult.tests || []).filter((t: any) => t.status === 'active');

    if (testIds && testIds.length > 0) {
      const idSet = new Set(testIds);
      tests = tests.filter((t: any) => idSet.has(t.id));
    } else if (filter) {
      if (filter.startsWith('tag:')) {
        const tag = filter.slice(4).toLowerCase();
        tests = tests.filter((t: any) =>
          (t.tags || []).some((tg: any) => (tg.name || tg).toLowerCase() === tag),
        );
      } else if (filter.startsWith('/')) {
        tests = tests.filter((t: any) =>
          (t.pages || []).some((p: any) => (p.url || '').includes(filter)),
        );
      } else {
        const term = filter.toLowerCase();
        tests = tests.filter((t: any) => (t.name || '').toLowerCase().includes(term));
      }
    }

    if (tests.length === 0) {
      return {
        project: {
          id: project.id, name: project.name, base_url: project.base_url,
          auth_mode: project.auth_mode ?? 'none',
          login_url: project.login_url ?? null,
          register_url: project.register_url ?? null,
          login_instructions: project.login_instructions ?? null,
          register_instructions: project.register_instructions ?? null,
          credentials: project.credentials ?? null,
        },
        tests: [],
      };
    }

    // Fetch full test details in parallel
    const fullTests = await Promise.all(
      tests.map((t: any) => this.getTest(t.id) as Promise<{ test: any }>),
    );

    // Start runs in parallel
    const runs = await Promise.all(
      tests.map((t: any) => this.startRun(t.id) as Promise<{ run: any }>),
    );

    return {
      project: {
        id: project.id, name: project.name, base_url: project.base_url,
        auth_mode: project.auth_mode ?? 'none',
        login_url: project.login_url ?? null,
        register_url: project.register_url ?? null,
        login_instructions: project.login_instructions ?? null,
        register_instructions: project.register_instructions ?? null,
        credentials: project.credentials ?? null,
      },
      tests: fullTests.map((ft, i) => ({
        test_id: ft.test.id,
        test_name: ft.test.name,
        run_id: runs[i].run.id,
        instructions: ft.test.instructions,
        credential_name: ft.test.credential_name ?? null,
        pages: ft.test.pages || [],
        tags: ft.test.tags || [],
        script: ft.test.script ?? null,
        script_generated_at: ft.test.script_generated_at ?? null,
      })),
    };
  }
}
