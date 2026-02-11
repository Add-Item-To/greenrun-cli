#!/usr/bin/env node

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

function printHelp(): void {
  const version = getVersion();
  console.log(`greenrun-cli v${version} - Browser test management for Claude Code

Usage:
  greenrun init             Interactive setup wizard
  greenrun update           Update command templates to latest version
  greenrun serve            Start MCP server
  greenrun --version, -v    Print version
  greenrun --help, -h       Print this help

When invoked with no arguments over a pipe (non-TTY stdin),
the MCP server starts automatically (used by Claude Code).

Quick start:
  npx greenrun-cli init
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === '--version' || command === '-v') {
    console.log(getVersion());
    return;
  }

  if (command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'init') {
    const { runInit } = await import('./commands/init.js');
    await runInit(args.slice(1));
    return;
  }

  if (command === 'update') {
    const { runUpdate } = await import('./commands/init.js');
    runUpdate();
    return;
  }

  if (command === 'serve') {
    const { startServer } = await import('./server.js');
    await startServer();
    return;
  }

  // No command: auto-detect mode
  if (!process.stdin.isTTY) {
    // Non-TTY stdin means Claude Code is invoking us as an MCP server
    const { startServer } = await import('./server.js');
    await startServer();
    return;
  }

  // TTY with no command: show help
  printHelp();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
