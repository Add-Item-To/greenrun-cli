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

  async createProject(data: { name: string; base_url?: string; description?: string; concurrency?: number }) {
    return this.request('POST', '/projects', data);
  }

  async getProject(id: string) {
    return this.request('GET', `/projects/${id}`);
  }

  async updateProject(id: string, data: { name?: string; base_url?: string; description?: string; concurrency?: number }) {
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

  async createTest(projectId: string, data: { name: string; instructions: string; page_ids?: string[]; status?: string; tags?: string[] }) {
    return this.request('POST', `/projects/${projectId}/tests`, data);
  }

  async getTest(id: string) {
    return this.request('GET', `/tests/${id}`);
  }

  async updateTest(id: string, data: { name?: string; instructions?: string; page_ids?: string[]; status?: string; tags?: string[] }) {
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
}
