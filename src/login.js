import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { clearUser, connectorHelp, parseAuthStatus, parseMcpList, parseOwner, writeUser } from './account.js';
import { claudeAuthInteractive, claudeAuthStatus, claudeMcpList, claudeVersion, runClaude } from './claude.js';

export const CONNECTORS_URL = 'https://claude.ai/settings/connectors';

const PROBE_TOOLS = [
  'mcp__claude_ai_Google_Drive__search_files',
  'mcp__claude_ai_Google_Drive__get_file_metadata',
];
const PROBE_PROMPT = `Call Google Drive search_files with query "owner = 'me'" and pageSize 1, then call get_file_metadata on the first result and read its owner field. Output exactly one line: OWNER=<owner email>. If there are no files, output OWNER=unknown. Output nothing else.`;

export const isInteractive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

async function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim().toLowerCase();
  } finally {
    rl.close();
  }
}

const isNo = (a) => a === 'n' || a === 'no';

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch {
    // the URL is printed anyway
  }
}

async function currentAuth() {
  return parseAuthStatus((await claudeAuthStatus()).stdout);
}

/** `claude mcp list` can briefly report a connector as missing, so look a few times before giving up. */
export async function connectorStatus(attempts = 3, delayMs = 2000) {
  let status = { docs: false, drive: false, raw: '' };
  for (let i = 0; i < attempts; i++) {
    const r = await claudeMcpList();
    status = { ...parseMcpList(r.stdout), raw: r.stdout + r.stderr };
    if (status.docs && status.drive) break;
    if (i < attempts - 1) await new Promise((r2) => setTimeout(r2, delayMs));
  }
  return status;
}

async function probeOwner() {
  for (let i = 0; i < 2; i++) {
    const r = await runClaude(PROBE_PROMPT, { tools: PROBE_TOOLS, timeoutMs: 180_000 });
    const owner = parseOwner(r.stdout);
    if (owner) return owner;
  }
  return null;
}

/**
 * Makes each person sign in to THEIR OWN Claude account and connect THEIR OWN Google
 * account. Credentials stay in Claude Code and claude.ai; docsync only records who
 * it verified, in the user's home directory.
 */
export async function login({ interactive = isInteractive() } = {}) {
  console.log('docsync login: links docsync to your own Claude account and your own Google Docs.\n');

  const v = await claudeVersion();
  if (!v.ok) {
    console.error('Claude Code was not found on your PATH. Install it, then run: docsync login');
    return 1;
  }

  // 1. Claude account
  let auth = await currentAuth();
  if (!auth.loggedIn) {
    if (!interactive) {
      console.error('You are not signed in to Claude. Run "docsync login" in a terminal.');
      return 1;
    }
    console.log('You are not signed in to Claude. Starting sign-in...\n');
    await claudeAuthInteractive('login');
    auth = await currentAuth();
    if (!auth.loggedIn) {
      console.error('Claude sign-in did not complete. Run "docsync login" to try again.');
      return 1;
    }
  } else if (interactive) {
    const a = await ask(`Claude account: ${auth.email}. Use this account? [Y/n] `);
    if (isNo(a)) {
      await claudeAuthInteractive('logout');
      await claudeAuthInteractive('login');
      auth = await currentAuth();
      if (!auth.loggedIn) {
        console.error('Claude sign-in did not complete. Run "docsync login" to try again.');
        return 1;
      }
    }
  }
  console.log(`Claude account: ${auth.email}`);

  // 2. Google connectors, authorized by the user in claude.ai
  let conn = await connectorStatus();
  while (!(conn.docs && conn.drive)) {
    const missing = [!conn.docs && 'Google Docs', !conn.drive && 'Google Drive'].filter(Boolean).join(' and ');
    console.log(`\nNot connected yet: ${missing}.`);
    console.log(connectorHelp(auth, conn.raw, CONNECTORS_URL));
    if (!interactive) return 1;
    openBrowser(CONNECTORS_URL);
    const a = await ask('Press Enter once connected (or type q to quit): ');
    if (a === 'q' || a === 'quit') return 1;
    conn = await connectorStatus();
  }
  console.log('Google Docs and Google Drive connectors: connected');

  // 3. Which Google account do the connectors use?
  console.log('Checking which Google account the connectors use (a few seconds)...');
  const googleEmail = await probeOwner();
  if (googleEmail) {
    console.log(`Google account: ${googleEmail}`);
    if (interactive) {
      const a = await ask('Docs will be created in this Google account. Correct? [Y/n] ');
      if (isNo(a)) {
        console.log(`\nDisconnect Google Docs and Google Drive at ${CONNECTORS_URL}, reconnect them with the right Google account, then run "docsync login" again.`);
        return 1;
      }
    }
  } else {
    console.log('Could not read the Google account name (the connectors work, but no file was found to check).');
  }

  writeUser({ claudeEmail: auth.email, googleEmail, verifiedAt: new Date().toISOString() });
  console.log('\nDone. docsync will now sync your commits to Google Docs.');
  return 0;
}

export function logout() {
  clearUser();
  console.log('docsync is signed out on this machine. Hooks stay installed but do nothing until you run "docsync login".');
  console.log('(Your Claude and Google sessions are untouched. Use "claude auth logout" to sign out of Claude.)');
  return 0;
}
