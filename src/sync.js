import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readUser, parseAuthStatus } from './account.js';
import { claudeAuthStatus, runClaude } from './claude.js';
import { loadConfig, renderTitle, slugify } from './config.js';
import {
  commonDir,
  currentBranch,
  inRebase,
  latestCommitContext,
  recentCommitsContext,
  repoRoot,
} from './git.js';
import { buildPrompt, docUrl, parseDocId } from './prompt.js';

const BIN = fileURLToPath(new URL('../bin/docsync.js', import.meta.url));
const STALE_LOCK_MS = 15 * 60 * 1000;

export function stateFor(cwd, branch) {
  const dir = path.join(commonDir(cwd), 'docsync');
  const slug = slugify(branch);
  return {
    dir,
    idFile: path.join(dir, `${slug}.id`),
    lock: path.join(dir, `${slug}.lock`),
    log: path.join(dir, 'docsync.log'),
  };
}

export function readDocId(cwd, branch) {
  try {
    return readFileSync(stateFor(cwd, branch).idFile, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function writeLog(logFile, line) {
  try {
    appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // logging must never break a commit
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function acquireLock(lock) {
  for (let i = 0; i < 150; i++) {
    try {
      mkdirSync(lock);
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') return false;
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) rmSync(lock, { recursive: true, force: true });
      } catch {
        // lock vanished, retry
      }
      await sleep(2000);
    }
  }
  return false;
}

/** Synchronizes the current branch's doc now. Never throws. */
export async function syncNow(cwd, mode) {
  const root = repoRoot(cwd);
  const branch = root && currentBranch(cwd);
  if (!root || !branch) return { skipped: 'not on a branch' };

  const cfg = loadConfig(root);
  const st = stateFor(cwd, branch);
  mkdirSync(st.dir, { recursive: true });

  // Only run as the person who completed "docsync login" on this machine.
  const user = readUser();
  if (!user) {
    writeLog(st.log, `${mode} ${branch} SKIPPED: not set up on this machine, run "docsync login"`);
    return { error: 'not set up, run "docsync login"' };
  }
  const auth = parseAuthStatus((await claudeAuthStatus()).stdout);
  if (!auth.loggedIn || auth.email !== user.claudeEmail) {
    const why = auth.loggedIn ? `Claude is signed in as ${auth.email}, not ${user.claudeEmail}` : 'Claude is signed out';
    writeLog(st.log, `${mode} ${branch} SKIPPED: ${why}, run "docsync login"`);
    return { error: `${why}, run "docsync login"` };
  }

  if (!(await acquireLock(st.lock))) {
    writeLog(st.log, `${mode} ${branch} FAILED: could not get lock`);
    return { error: 'lock timeout' };
  }
  try {
    const repo = path.basename(root);
    const title = renderTitle(cfg.titleTemplate, { repo, branch });
    const context =
      mode === 'update' ? latestCommitContext(cwd, cfg.maxDiffBytes) : recentCommitsContext(cwd);
    const prompt = buildPrompt({
      repo,
      branch,
      title,
      mode,
      docId: readDocId(cwd, branch),
      folderId: cfg.folderId,
      context,
    });

    // MCP connectors connect asynchronously, so a first call can miss them. Retry once.
    let result = await runClaude(prompt, { cwd });
    let id = parseDocId(result.stdout);
    if (!id) {
      result = await runClaude(prompt, { cwd });
      id = parseDocId(result.stdout);
    }
    if (id) {
      writeFileSync(st.idFile, `${id}\n`);
      writeLog(st.log, `${mode} ${branch} -> ${docUrl(id)}`);
      return { docId: id, url: docUrl(id) };
    }
    const why = result.error?.message || (result.stdout || result.stderr).trim().split('\n').slice(-3).join(' | ');
    writeLog(st.log, `${mode} ${branch} FAILED (exit ${result.code}): ${why}`);
    return { error: why };
  } catch (err) {
    writeLog(st.log, `${mode} ${branch} FAILED: ${err.message}`);
    return { error: err.message };
  } finally {
    rmSync(st.lock, { recursive: true, force: true });
  }
}

/** Entry point for git hooks: returns immediately, the sync runs detached. */
export async function dispatch(cwd, mode, { foreground = false } = {}) {
  if (process.env.DOCSYNC_SKIP) return;
  if (!readUser()) {
    console.error('docsync: not set up for your account on this machine. Run: docsync login');
    return;
  }
  try {
    if (inRebase(cwd)) return; // one call per replayed commit would be noisy and slow
  } catch {
    return;
  }
  if (foreground || process.env.DOCSYNC_FOREGROUND) {
    console.error(`docsync: syncing (${mode})...`);
    const r = await syncNow(cwd, mode);
    console.error(r.url ? `docsync: ${r.url}` : `docsync: ${r.error ?? r.skipped}`);
    return;
  }
  const child = spawn(process.execPath, [BIN, 'sync', '--mode', mode], {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

export function hasDoc(cwd, branch) {
  return existsSync(stateFor(cwd, branch).idFile);
}
