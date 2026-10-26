import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { connectorHelp, parseAuthStatus, readUser } from './account.js';
import { claudeAuthStatus, claudeVersion } from './claude.js';
import { CONFIG_FILE, DEFAULTS, loadConfig } from './config.js';
import { currentBranch, repoRoot } from './git.js';
import { hookStatus, installHooks, uninstallHooks } from './hooks.js';
import { CONNECTORS_URL, connectorStatus, isInteractive, login, logout } from './login.js';
import { docUrl } from './prompt.js';
import { dispatch, hasDoc, readDocId, stateFor, syncNow } from './sync.js';

const HELP = `docsync: keep one Google Doc per git branch up to date on every commit.

Usage:
  docsync login                             sign in to YOUR Claude and Google accounts (once per machine)
  docsync logout                            forget this machine's setup (hooks do nothing until you log in)
  docsync whoami                            show which Claude and Google accounts are in use
  docsync init [--folder <driveFolderId>]   install git hooks and create ${CONFIG_FILE}
  docsync uninstall                         remove the git hooks
  docsync doctor                            check git, login, connectors and hooks
  docsync sync [--mode update|create]       sync the current branch now (foreground)
  docsync url                               print the current branch's doc link
  docsync log [-n <lines>]                  show recent sync results

Environment:
  DOCSYNC_SKIP=1          skip syncing (e.g. DOCSYNC_SKIP=1 git commit ...)
  DOCSYNC_FOREGROUND=1    run the sync inside the git hook and show the result
  DOCSYNC_FOLDER_ID=<id>  Drive folder for newly created docs
`;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v ?? (argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : true);
    } else if (a === '-n') {
      flags.n = argv[++i];
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function requireRepo(cwd) {
  const root = repoRoot(cwd);
  if (!root) throw new Error('Not inside a git repository.');
  return root;
}

async function init(cwd, flags) {
  const root = requireRepo(cwd);
  const cfgPath = path.join(root, CONFIG_FILE);
  if (!existsSync(cfgPath)) {
    const cfg = { ...DEFAULTS, ...(flags.folder ? { folderId: String(flags.folder) } : {}) };
    writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
    console.log(`Created ${CONFIG_FILE} (commit it so your team shares the settings).`);
  } else {
    console.log(`Kept existing ${CONFIG_FILE}.`);
  }
  for (const h of installHooks(root)) {
    console.log(`Installed ${h.name} hook${h.existed ? ' (added to your existing hook)' : ''}.`);
  }

  if (readUser()) {
    console.log('\nYou are already signed in on this machine ("docsync whoami" shows who).');
    console.log('Make a commit and a Google Doc for this branch will appear within a minute or two.');
    return 0;
  }
  console.log('\nEvery person signs in with their own Claude and Google accounts.');
  if (isInteractive()) return login();
  console.log('Run "docsync login" in a terminal to finish setup.');
  return 0;
}

async function doctor(cwd) {
  let failed = false;
  const check = (ok, label, hint) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !hint ? '' : `\n     -> ${hint}`}`);
    if (!ok) failed = true;
  };

  const root = repoRoot(cwd);
  check(Boolean(root), 'inside a git repository', 'run this from a git repository');
  if (root) {
    for (const h of hookStatus(root)) check(h.installed, `${h.name} hook installed`, 'run "docsync init"');
  }

  const v = await claudeVersion();
  check(v.ok, `claude CLI found${v.ok ? ` (${v.out})` : ''}`, 'install Claude Code and make sure "claude" is on your PATH');

  if (v.ok) {
    const auth = parseAuthStatus((await claudeAuthStatus()).stdout);
    check(auth.loggedIn, `signed in to Claude${auth.loggedIn ? ` as ${auth.email}` : ''}`, 'run "docsync login"');

    const conn = await connectorStatus();
    check(conn.docs, 'Google Docs connector connected', `connect it at ${CONNECTORS_URL}`);
    check(conn.drive, 'Google Drive connector connected', `connect it at ${CONNECTORS_URL}`);
    if (!conn.docs || !conn.drive) console.log(connectorHelp(auth, conn.raw, CONNECTORS_URL));

    const user = readUser();
    check(Boolean(user), 'docsync set up on this machine', 'run "docsync login"');
    if (user && auth.loggedIn) {
      check(
        user.claudeEmail === auth.email,
        'docsync login matches the current Claude account',
        `docsync was set up for ${user.claudeEmail} but Claude is signed in as ${auth.email}; run "docsync login"`,
      );
    }
  }
  console.log(failed ? '\nSome checks failed.' : '\nAll good.');
  return failed ? 1 : 0;
}

function whoami() {
  const user = readUser();
  if (!user) {
    console.log('Not set up on this machine. Run: docsync login');
    return 1;
  }
  console.log(`Claude account: ${user.claudeEmail}`);
  console.log(`Google account: ${user.googleEmail ?? 'unknown (not verified)'}`);
  console.log(`Verified:       ${user.verifiedAt}`);
  return 0;
}

async function hook(cwd, name, rest) {
  const root = repoRoot(cwd);
  if (!root) return 0;
  if (name === 'post-commit') {
    await dispatch(cwd, 'update');
  } else if (name === 'post-checkout') {
    const isBranchCheckout = rest[2] === '1';
    const branch = currentBranch(cwd);
    if (!isBranchCheckout || !branch) return 0;
    if (loadConfig(root).skipBranchesOnCheckout.includes(branch)) return 0;
    if (hasDoc(cwd, branch)) return 0;
    await dispatch(cwd, 'create');
  }
  return 0;
}

export async function main(argv) {
  const cwd = process.cwd();
  const { positional, flags } = parseArgs(argv);
  const [cmd, ...rest] = positional;
  if (flags.version || flags.v) return main(['version']);

  switch (cmd) {
    case 'login':
      return login();
    case 'logout':
      return logout();
    case 'whoami':
      return whoami();
    case 'init':
      return init(cwd, flags);
    case 'uninstall': {
      const root = requireRepo(cwd);
      for (const r of uninstallHooks(root)) console.log(`${r.removed ? 'Removed' : 'Not installed:'} ${r.name}`);
      return 0;
    }
    case 'doctor':
      return doctor(cwd);
    case 'hook':
      // Hooks must never fail a git operation.
      return hook(cwd, rest[0], rest.slice(1)).catch(() => 0);
    case 'sync': {
      requireRepo(cwd);
      const mode = flags.mode === 'create' ? 'create' : 'update';
      const r = await syncNow(cwd, mode);
      if (r.url) console.log(r.url);
      else console.error(`docsync: ${r.error ?? r.skipped}`);
      return r.url ? 0 : 1;
    }
    case 'url': {
      requireRepo(cwd);
      const branch = currentBranch(cwd);
      const id = branch && readDocId(cwd, branch);
      if (!id) {
        console.error('No doc yet for this branch. Make a commit or run "docsync sync".');
        return 1;
      }
      console.log(docUrl(id));
      return 0;
    }
    case 'log': {
      requireRepo(cwd);
      const branch = currentBranch(cwd) ?? 'HEAD';
      const file = stateFor(cwd, branch).log;
      if (!existsSync(file)) {
        console.log('No sync has run yet.');
        return 0;
      }
      const lines = readFileSync(file, 'utf8').trimEnd().split('\n');
      console.log(lines.slice(-Number(flags.n ?? 10)).join('\n'));
      return 0;
    }
    case 'version':
      console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
      return 0;
    case undefined:
    case 'help':
    case '--help':
      console.log(HELP);
      return 0;
    default:
      console.error(`Unknown command: ${cmd}\n\n${HELP}`);
      return 1;
  }
}
