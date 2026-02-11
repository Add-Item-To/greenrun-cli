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

function checkPrerequisites(): { claude: boolean; chromeHint: boolean } {
  let claude = false;
  try {
    execSync('claude --version', { stdio: 'pipe' });
    claude = true;
  } catch {
    // not installed
  }
  return { claude, chromeHint: true };
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
      console.log('  CLAUDE.md already contains Greenrun section, skipping');
      return;
    }
    appendFileSync(claudeMdPath, '\n' + snippet);
    console.log('  Appended Greenrun instructions to CLAUDE.md');
  } else {
    writeFileSync(claudeMdPath, snippet);
    console.log('  Created CLAUDE.md with Greenrun instructions');
  }
}

function installCommands(): void {
  const commandsDir = join(process.cwd(), '.claude', 'commands');
  mkdirSync(commandsDir, { recursive: true });

  const commands = ['greenrun.md', 'greenrun-sweep.md'];
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
  console.log('  [i] Claude in Chrome extension required for browser test execution');
  console.log('      Get it at: https://chromewebstore.google.com/detail/claude-in-chrome\n');

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
  console.log('Configuring MCP server...');
  if (scope === 'project') {
    configureMcpProject(token!);
  } else {
    configureMcpLocal(token!);
  }
  console.log('  MCP server configured.\n');

  // Install extras
  if (opts.claudeMd) {
    installClaudeMd();
  }
  if (opts.commands) {
    installCommands();
  }

  console.log(`
Done! Restart Claude Code to connect.

Make sure Chrome is open with the Claude in Chrome extension active
before running /greenrun - Claude needs browser access to execute tests.
`);
}
