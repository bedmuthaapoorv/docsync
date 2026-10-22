import { spawn } from 'node:child_process';

export const TOOLS = [
  'mcp__claude_ai_Google_Docs__read_doc',
  'mcp__claude_ai_Google_Docs__update_doc',
  'mcp__claude_ai_Google_Drive__search_files',
  'mcp__claude_ai_Google_Drive__create_file',
  'mcp__claude_ai_Google_Drive__read_file_content',
];

function attempt(args, input, { cwd, timeoutMs, shell, stdio }) {
  return new Promise((resolve) => {
    const child = spawn('claude', args, { cwd, shell, windowsHide: true, stdio });
    let stdout = '';
    let stderr = '';
    const timer = timeoutMs ? setTimeout(() => child.kill(), timeoutMs) : null;
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr, error });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    if (child.stdin) {
      child.stdin.on('error', () => {});
      child.stdin.end(input ?? '');
    }
  });
}

/**
 * Runs the claude CLI. On Windows `claude` may be a .cmd shim, so retry through
 * the shell on ENOENT. Arguments never contain user text (prompts go on stdin),
 * so the shell retry has no quoting risk.
 */
async function run(args, input, { cwd, timeoutMs = 60_000, interactive = false } = {}) {
  const stdio = interactive ? 'inherit' : ['pipe', 'pipe', 'pipe'];
  let result = await attempt(args, input, { cwd, timeoutMs, shell: false, stdio });
  if (result.error?.code === 'ENOENT' && process.platform === 'win32') {
    result = await attempt(args, input, { cwd, timeoutMs, shell: true, stdio });
  }
  return result;
}

/** `claude -p` with the prompt on stdin. */
export function runClaude(input, { cwd, timeoutMs = 10 * 60 * 1000, tools = TOOLS } = {}) {
  return run(['-p', '--allowedTools', tools.join(',')], input, { cwd, timeoutMs });
}

export async function claudeVersion() {
  const r = await run(['--version'], '', { timeoutMs: 20_000 });
  return { ok: r.code === 0, out: r.stdout.trim(), error: r.error };
}

export function claudeAuthStatus() {
  return run(['auth', 'status'], '', { timeoutMs: 30_000 });
}

export function claudeMcpList() {
  return run(['mcp', 'list'], '', { timeoutMs: 90_000 });
}

/** Hands the terminal to `claude auth login` / `logout` so the user can sign in. */
export function claudeAuthInteractive(sub) {
  return run(['auth', sub], '', { timeoutMs: 0, interactive: true });
}
