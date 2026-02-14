import { createInterface, Interface as ReadlineInterface } from 'readline';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates');
const APP_URL = 'https://app.greenrun.dev';

interface InitOptions {
  token?: string;
  scope?: 'local' | 'project';
  claudeMd?: boolean;
  commands?: boolean;
}

function parseFlags(args: string[]): InitOptions {
  const opts: InitOptions = { claudeMd: true, commands: true };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--token' && args[i + 1]) {
      opts.token = args[++i];
    } else if (arg === '--scope' && args[i + 1]) {
      const val = args[++i];
      if (val === 'local' || val === 'project') opts.scope = val;
    } else if (arg === '--no-claude-md') {
      opts.claudeMd = false;
    } else if (arg === '--no-commands') {
      opts.commands = false;
    }
  }
  return opts;
}

function prompt(rl: ReadlineInterface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      resolve(answer.trim());
    });
  });
}

function detectSystemChrome(): boolean {
  const platform = process.platform;
  if (platform === 'darwin') {
    return existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  }
  if (platform === 'win32') {
    const dirs = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env['LOCALAPPDATA']];
    return dirs.some(dir => dir && existsSync(join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe')));
  }
  // Linux
  try {
    execSync('which google-chrome-stable || which google-chrome || which chromium-browser || which chromium', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function installPlaywrightChromium(): boolean {
  try {
    console.log('  Installing @playwright/test (this may take a minute)...');
    execSync('npm install -g @playwright/test@latest', { stdio: 'inherit' });
    console.log('  Installing Chromium browser...');
    execSync('npx playwright install --with-deps chromium', { stdio: 'inherit' });
    return true;
  } catch {
    console.error('  Failed to install Playwright. You can install manually:');
    console.error('    npm install -g @playwright/test@latest');
    console.error('    npx playwright install --with-deps chromium\n');
    return false;
  }
}

function checkNodeVersion(): boolean {
  const match = process.version.match(/^v(\d+)\./);
  return match ? parseInt(match[1], 10) >= 18 : false;
}

function checkPrerequisites(): { claude: boolean } {
  let claude = false;
  try {
    execSync('claude --version', { stdio: 'pipe' });
    claude = true;
  } catch {
    // not installed
  }
  return { claude };
}

async function validateToken(token: string): Promise<{ valid: boolean; projectCount?: number; error?: string }> {
  try {
    const response = await fetch(`${APP_URL}/api/v1/projects`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });
    if (!response.ok) {
      return { valid: false, error: `API returned HTTP ${response.status}` };
    }
    const data = await response.json() as any;
    const projects = Array.isArray(data) ? data : (data.data ?? []);
    return { valid: true, projectCount: projects.length };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: message };
  }
}

function getClaudeConfigPath(): string {
  return join(homedir(), '.claude.json');
}

interface ClaudeConfig {
  projects?: Record<string, {
    mcpServers?: Record<string, Record<string, unknown>>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/** Read the Claude Code config from ~/.claude.json. */
function readClaudeConfig(): ClaudeConfig {
  const configPath = getClaudeConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as ClaudeConfig;
  } catch {
    return {};
  }
}

/** Write the Claude Code config to ~/.claude.json. */
function writeClaudeConfig(config: ClaudeConfig): void {
  writeFileSync(getClaudeConfigPath(), JSON.stringify(config, null, 2) + '\n');
}

function setLocalMcpServer(name: string, server: Record<string, unknown>): void {
  const config = readClaudeConfig();
  const projectPath = process.cwd();

  config.projects = config.projects || {};
  config.projects[projectPath] = config.projects[projectPath] || {};
  config.projects[projectPath].mcpServers = config.projects[projectPath].mcpServers || {};
  config.projects[projectPath].mcpServers[name] = server;

  writeClaudeConfig(config);
}

function configureMcpLocal(token: string): void {
  try {
    setLocalMcpServer('greenrun', {
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'greenrun-cli@latest'],
      env: { GREENRUN_API_TOKEN: token },
    });
    console.log('  Configured greenrun MCP server');
  } catch {
    console.error('\nFailed to write greenrun MCP config to ~/.claude.json');
    console.error('You can add the MCP server manually by running:\n');
    console.error(`  claude mcp add greenrun --transport stdio -e GREENRUN_API_TOKEN=${token} -- npx -y greenrun-cli@latest\n`);
  }
}

function configurePlaywrightMcp(browser: 'chrome' | 'chromium' = 'chrome'): void {
  try {
    setLocalMcpServer('playwright', {
      type: 'stdio',
      command: 'npx',
      args: [
        '@playwright/mcp@latest',
        '--browser', browser,
        '--user-data-dir', join(homedir(), '.greenrun', 'browser-profile'),
      ],
      env: {},
    });
    console.log(`  Configured playwright MCP server (${browser})`);
  } catch {
    console.error('\nFailed to write Playwright MCP config to ~/.claude.json');
    console.error('You can add it manually:\n');
    console.error(`  claude mcp add playwright -- npx @playwright/mcp@latest --browser ${browser} --user-data-dir ~/.greenrun/browser-profile\n`);
  }
}

function configureMcpProject(token: string): void {
  const mcpConfig = {
    mcpServers: {
      greenrun: {
        command: 'npx',
        args: ['-y', 'greenrun-cli@latest'],
        env: { GREENRUN_API_TOKEN: '${GREENRUN_API_TOKEN}' },
      },
    },
  };

  const mcpPath = join(process.cwd(), '.mcp.json');
  let existing: any = {};
  if (existsSync(mcpPath)) {
    try {
      existing = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    } catch {
      // overwrite invalid JSON
    }
  }
  existing.mcpServers = existing.mcpServers || {};
  existing.mcpServers.greenrun = mcpConfig.mcpServers.greenrun;
  writeFileSync(mcpPath, JSON.stringify(existing, null, 2) + '\n');
  console.log('  Created .mcp.json');

  // Add token to .env
  const envPath = join(process.cwd(), '.env');
  const envLine = `GREENRUN_API_TOKEN=${token}`;
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    if (!envContent.includes('GREENRUN_API_TOKEN=')) {
      appendFileSync(envPath, `\n${envLine}\n`);
      console.log('  Added GREENRUN_API_TOKEN to .env');
    } else {
      const updated = envContent.replace(/GREENRUN_API_TOKEN=.*/g, envLine);
      writeFileSync(envPath, updated);
      console.log('  Updated GREENRUN_API_TOKEN in .env');
    }
  } else {
    writeFileSync(envPath, `${envLine}\n`);
    console.log('  Created .env with GREENRUN_API_TOKEN');
  }
}

function installClaudeMd(): void {
  const templatePath = join(TEMPLATES_DIR, 'claude-md.md');
  if (!existsSync(templatePath)) {
    console.log('  Warning: CLAUDE.md template not found, skipping');
    return;
  }
  const snippet = readFileSync(templatePath, 'utf-8');
  const claudeMdPath = join(process.cwd(), 'CLAUDE.md');

  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf-8');
    if (existing.includes('## Greenrun')) {
      const updated = existing.replace(/## Greenrun[\s\S]*$/, snippet.trimEnd());
      writeFileSync(claudeMdPath, updated.endsWith('\n') ? updated : updated + '\n');
      console.log('  Replaced Greenrun section in CLAUDE.md');
      return;
    }
    appendFileSync(claudeMdPath, '\n' + snippet);
    console.log('  Appended Greenrun instructions to CLAUDE.md');
  } else {
    writeFileSync(claudeMdPath, snippet);
    console.log('  Created CLAUDE.md with Greenrun instructions');
  }
}

/** Build the list of MCP tool permissions needed for Greenrun and Playwright. */
function buildPermissionsList(): string[] {
  const greenrunTools = [
    'mcp__greenrun__list_projects',
    'mcp__greenrun__get_project',
    'mcp__greenrun__create_project',
    'mcp__greenrun__update_project',
    'mcp__greenrun__list_pages',
    'mcp__greenrun__create_page',
    'mcp__greenrun__list_tests',
    'mcp__greenrun__get_test',
    'mcp__greenrun__create_test',
    'mcp__greenrun__update_test',
    'mcp__greenrun__start_run',
    'mcp__greenrun__complete_run',
    'mcp__greenrun__batch_complete_runs',
    'mcp__greenrun__get_run',
    'mcp__greenrun__list_runs',
    'mcp__greenrun__sweep',
    'mcp__greenrun__prepare_test_batch',
    'mcp__greenrun__export_test_script',
    'mcp__greenrun__export_test_instructions',
  ];

  const browserTools = [
    'mcp__playwright__browser_navigate',
    'mcp__playwright__browser_snapshot',
    'mcp__playwright__browser_click',
    'mcp__playwright__browser_type',
    'mcp__playwright__browser_handle_dialog',
    'mcp__playwright__browser_select_option',
    'mcp__playwright__browser_hover',
    'mcp__playwright__browser_drag',
    'mcp__playwright__browser_press_key',
    'mcp__playwright__browser_screenshot',
    'mcp__playwright__browser_wait',
    'mcp__playwright__browser_file_upload',
    'mcp__playwright__browser_pdf_save',
    'mcp__playwright__browser_close',
    'mcp__playwright__browser_console_messages',
    'mcp__playwright__browser_resize',
    'mcp__playwright__browser_run_code',
    'mcp__playwright__browser_evaluate',
    'mcp__playwright__browser_fill_form',
    'mcp__playwright__browser_tabs',
    'mcp__playwright__browser_network_requests',
  ];

  return [...greenrunTools, ...browserTools];
}

function installSettings(): void {
  const settingsDir = join(process.cwd(), '.claude');
  mkdirSync(settingsDir, { recursive: true });
  const settingsPath = join(settingsDir, 'settings.local.json');

  let existing: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      existing = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      // overwrite invalid JSON
    }
  }

  const requiredTools = buildPermissionsList();

  const permissions = (existing.permissions ?? {}) as Record<string, unknown>;
  const currentAllow = (permissions.allow ?? []) as string[];
  const merged = [...new Set([...currentAllow, ...requiredTools])];
  permissions.allow = merged;
  existing.permissions = permissions;

  writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + '\n');
  console.log('  Updated .claude/settings.local.json with tool permissions');
}

function installCommands(): void {
  const commandsDir = join(process.cwd(), '.claude', 'commands');
  mkdirSync(commandsDir, { recursive: true });

  const commands = ['greenrun.md', 'greenrun-sweep.md', 'procedures.md'];
  for (const cmd of commands) {
    const src = join(TEMPLATES_DIR, 'commands', cmd);
    if (!existsSync(src)) {
      console.log(`  Warning: ${cmd} template not found, skipping`);
      continue;
    }
    const dest = join(commandsDir, cmd);
    writeFileSync(dest, readFileSync(src, 'utf-8'));
    console.log(`  Installed /${cmd.replace('.md', '')}`);
  }
}

function checkDependencies(): void {
  console.log('Checking dependencies...');
  let allGood = true;

  // Node version
  if (checkNodeVersion()) {
    console.log(`  [x] Node.js ${process.version}`);
  } else {
    console.log(`  [ ] Node.js ${process.version} (18+ required)`);
    allGood = false;
  }

  // Claude Code
  const prereqs = checkPrerequisites();
  if (prereqs.claude) {
    console.log('  [x] Claude Code CLI');
  } else {
    console.log('  [ ] Claude Code CLI not found');
    allGood = false;
  }

  // @playwright/test
  try {
    execSync('npx playwright --version', { stdio: 'pipe' });
    console.log('  [x] @playwright/test');
  } catch {
    console.log('  [ ] @playwright/test not installed');
    console.log('      Run: npm install -g @playwright/test@latest');
    allGood = false;
  }

  // Browser (Chrome or Chromium)
  if (detectSystemChrome()) {
    console.log('  [x] Chrome detected');
  } else {
    try {
      execSync('npx playwright install --dry-run chromium', { stdio: 'pipe' });
      console.log('  [x] Playwright Chromium');
    } catch {
      console.log('  [ ] No browser detected (Chrome or Playwright Chromium)');
      console.log('      Run: npx playwright install --with-deps chromium');
      allGood = false;
    }
  }

  if (allGood) {
    console.log('  All dependencies installed.\n');
  } else {
    console.log('\n  Some dependencies are missing. Install them and run again.\n');
  }
}

export function runUpdate(): void {
  console.log('\nGreenrun - Updating templates\n');
  checkDependencies();
  installCommands();
  installSettings();
  installClaudeMd();
  console.log('\nDone! Templates updated to latest version.\n');
}

export async function runInit(args: string[]): Promise<void> {
  const opts = parseFlags(args);
  const interactive = !opts.token;

  console.log('\nGreenrun - Browser Test Management for Claude Code\n');

  // Node version gate
  if (!checkNodeVersion()) {
    console.error(`Error: Node.js 18 or later is required (detected ${process.version}).`);
    console.error('Install a newer version: https://nodejs.org/\n');
    process.exit(1);
  }

  // Prerequisites
  console.log('Prerequisites:');
  const prereqs = checkPrerequisites();
  if (prereqs.claude) {
    console.log('  [x] Claude Code CLI installed');
  } else {
    console.log('  [ ] Claude Code CLI not found');
    console.log('      Install it: https://docs.anthropic.com/en/docs/claude-code');
    if (interactive) {
      console.log('\nClaude Code is required. Please install it and run this command again.');
      process.exit(1);
    }
  }
  console.log('  [i] Playwright MCP will be configured for browser test execution\n');

  let token = opts.token;
  let scope = opts.scope;

  if (interactive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    // Step 1: Token
    console.log('Step 1: API Token');
    console.log(`  Get your token at: ${APP_URL}/tokens`);
    token = await prompt(rl, '  Paste your token: ');

    if (!token) {
      console.log('  No token provided. Aborting.');
      rl.close();
      process.exit(1);
    }

    process.stdout.write('  Validating... ');
    const validation = await validateToken(token);
    if (!validation.valid) {
      console.log(`Failed! ${validation.error || 'Invalid token or cannot reach the API.'}`);
      rl.close();
      process.exit(1);
    }
    console.log(`Connected! (${validation.projectCount} project${validation.projectCount === 1 ? '' : 's'} found)\n`);

    // Step 2: Scope
    console.log('Step 2: MCP Configuration');
    console.log('  [1] Local config (recommended) - token stored in ~/.claude.json');
    console.log('  [2] Project config (.mcp.json) - token via env var');
    const scopeChoice = await prompt(rl, '  Choice [1]: ');
    scope = scopeChoice === '2' ? 'project' : 'local';
    console.log();

    // Step 3: Extras
    console.log('Step 3: Extras (optional)');
    const claudeMdAnswer = await prompt(rl, '  Add Greenrun instructions to CLAUDE.md? [Y/n]: ');
    opts.claudeMd = claudeMdAnswer.toLowerCase() !== 'n';

    const commandsAnswer = await prompt(rl, '  Install slash commands? [Y/n]: ');
    opts.commands = commandsAnswer.toLowerCase() !== 'n';
    console.log();

    rl.close();
  } else {
    // Non-interactive: validate token
    if (!token) {
      console.error('Error: --token is required for non-interactive mode');
      process.exit(1);
    }
    process.stdout.write('Validating token... ');
    const validation = await validateToken(token);
    if (!validation.valid) {
      console.log(`Failed! ${validation.error || 'Invalid token or cannot reach the API.'}`);
      process.exit(1);
    }
    console.log(`Connected! (${validation.projectCount} project${validation.projectCount === 1 ? '' : 's'} found)`);
    scope = scope || 'local';
  }

  // Detect browser
  let browser: 'chrome' | 'chromium' = 'chrome';
  if (!detectSystemChrome()) {
    if (interactive) {
      const rl2 = createInterface({ input: process.stdin, output: process.stdout });
      console.log('Chrome not detected on this system.');
      const installChoice = await prompt(rl2, '  Install Playwright Chromium? [Y/n]: ');
      rl2.close();
      if (installChoice.toLowerCase() !== 'n') {
        if (installPlaywrightChromium()) {
          browser = 'chromium';
        } else {
          console.log('  Continuing with chrome config. You can install Chrome manually later.\n');
        }
      }
    } else {
      console.log('Chrome not detected. Installing Playwright Chromium...');
      if (installPlaywrightChromium()) {
        browser = 'chromium';
      }
    }
    console.log();
  }

  // Configure MCP
  console.log('Configuring MCP servers...');
  if (scope === 'project') {
    configureMcpProject(token!);
  } else {
    configureMcpLocal(token!);
  }
  configurePlaywrightMcp(browser);
  console.log('  MCP servers configured.\n');

  // Install extras
  if (opts.claudeMd) {
    installClaudeMd();
  }
  if (opts.commands) {
    installCommands();
  }
  installSettings();

  console.log(`
Done! Restart Claude Code to connect.

Playwright will launch a Chrome browser automatically when running tests.
Run /greenrun to execute your test suite.
`);
}
