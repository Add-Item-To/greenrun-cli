import { createInterface, Interface as ReadlineInterface } from 'readline';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

async function validateToken(token: string): Promise<{ valid: boolean; projectCount?: number }> {
  try {
    const response = await fetch(`${APP_URL}/api/v1/projects`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });
    if (!response.ok) return { valid: false };
    const data = await response.json() as any;
    const projects = Array.isArray(data) ? data : (data.data ?? []);
    return { valid: true, projectCount: projects.length };
  } catch {
    return { valid: false };
  }
}

function configureMcpLocal(token: string): void {
  try {
    execSync(
      `claude mcp add greenrun --transport stdio -e GREENRUN_API_TOKEN=${token} -- npx -y greenrun-cli@latest`,
      { stdio: 'inherit' },
    );
  } catch {
    console.error('\nFailed to run "claude mcp add". Make sure Claude Code is installed and in your PATH.');
    console.error('You can add the MCP server manually by running:\n');
    console.error(`  claude mcp add greenrun --transport stdio -e GREENRUN_API_TOKEN=${token} -- npx -y greenrun-cli@latest\n`);
  }
}

function configurePlaywrightMcp(): void {
  try {
    execSync(
      'claude mcp add playwright -- npx @playwright/mcp@latest --browser chrome --user-data-dir ~/.greenrun/browser-profile',
      { stdio: 'inherit' },
    );
  } catch {
    console.error('\nFailed to add Playwright MCP. You can add it manually:\n');
    console.error('  claude mcp add playwright -- npx @playwright/mcp@latest --browser chrome --user-data-dir ~/.greenrun/browser-profile\n');
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
      console.log('  GREENRUN_API_TOKEN already in .env (not modified)');
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

function installSettings(): void {
  const settingsDir = join(process.cwd(), '.claude');
  mkdirSync(settingsDir, { recursive: true });
  const settingsPath = join(settingsDir, 'settings.local.json');

  let existing: any = {};
  if (existsSync(settingsPath)) {
    try {
      existing = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      // overwrite invalid JSON
    }
  }

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
    'mcp__greenrun__get_run',
    'mcp__greenrun__list_runs',
    'mcp__greenrun__sweep',
    'mcp__greenrun__prepare_test_batch',
  ];

  const browserTools = [
    'mcp__playwright__browser_navigate',
    'mcp__playwright__browser_snapshot',
    'mcp__playwright__browser_click',
    'mcp__playwright__browser_type',
    'mcp__playwright__browser_handle_dialog',
    'mcp__playwright__browser_tab_list',
    'mcp__playwright__browser_tab_new',
    'mcp__playwright__browser_tab_select',
    'mcp__playwright__browser_tab_close',
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

  const requiredTools = [...greenrunTools, ...browserTools];

  existing.permissions = existing.permissions || {};
  const currentAllow: string[] = existing.permissions.allow || [];
  const merged = [...new Set([...currentAllow, ...requiredTools])];
  existing.permissions.allow = merged;

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

export function runUpdate(): void {
  console.log('\nGreenrun - Updating templates\n');
  installCommands();
  installSettings();
  installClaudeMd();
  console.log('\nDone! Templates updated to latest version.\n');
}

export async function runInit(args: string[]): Promise<void> {
  const opts = parseFlags(args);
  const interactive = !opts.token;

  console.log('\nGreenrun - Browser Test Management for Claude Code\n');

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
      console.log('Failed! Invalid token or cannot reach the API.');
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
      console.log('Failed!');
      process.exit(1);
    }
    console.log(`Connected! (${validation.projectCount} project${validation.projectCount === 1 ? '' : 's'} found)`);
    scope = scope || 'local';
  }

  // Configure MCP
  console.log('Configuring MCP servers...');
  if (scope === 'project') {
    configureMcpProject(token!);
  } else {
    configureMcpLocal(token!);
  }
  configurePlaywrightMcp();
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
