import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  }).replace(/\r?\n$/, '');
}

export function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

export function repoRoot(cwd) {
  return tryGit(['rev-parse', '--show-toplevel'], cwd);
}

/** Shared across worktrees, so a branch keeps one doc ID per clone. */
export function commonDir(cwd) {
  return path.resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd));
}

/** Honors core.hooksPath, so it works alongside husky and similar tools. */
export function hooksDir(cwd) {
  return path.resolve(cwd, git(['rev-parse', '--git-path', 'hooks'], cwd));
}

export function currentBranch(cwd) {
  return tryGit(['symbolic-ref', '--short', '-q', 'HEAD'], cwd);
}

export function inRebase(cwd) {
  const gd = path.resolve(cwd, git(['rev-parse', '--git-dir'], cwd));
  return existsSync(path.join(gd, 'rebase-merge')) || existsSync(path.join(gd, 'rebase-apply'));
}

export function latestCommitContext(cwd, maxBytes) {
  const header = git(['log', '-1', '--format=Commit %h by %an on %ad%nSubject: %s%n%n%b', 'HEAD'], cwd);
  const diff = git(['show', '--stat', '-p', '--format=', 'HEAD'], cwd);
  return `${header}\n\n${diff.slice(0, maxBytes)}`;
}

export function recentCommitsContext(cwd) {
  const log = tryGit(['log', '--oneline', '-n', '10'], cwd) ?? '';
  return `Recent commits on this branch:\n${log}`;
}
