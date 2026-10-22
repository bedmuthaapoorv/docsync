import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/docsync.js', import.meta.url));
// Isolate per-user state so tests never touch the real ~/.docsync.
const HOME = mkdtempSync(path.join(tmpdir(), 'docsync-home-'));
const env = { ...process.env, DOCSYNC_HOME: HOME };
const run = (cwd, ...args) => execFileSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env });

function tempRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'docsync-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

test('init installs hooks and config, uninstall removes the hooks', () => {
  const repo = tempRepo();
  run(repo, 'init', '--folder', 'FOLDER123');

  const cfg = JSON.parse(readFileSync(path.join(repo, '.docsync.json'), 'utf8'));
  assert.equal(cfg.folderId, 'FOLDER123');
  for (const name of ['post-commit', 'post-checkout']) {
    const hook = readFileSync(path.join(repo, '.git', 'hooks', name), 'utf8');
    assert.match(hook, new RegExp(`docsync hook ${name}`));
  }

  run(repo, 'uninstall');
  assert.equal(existsSync(path.join(repo, '.git', 'hooks', 'post-commit')), false);
});

test('init preserves an existing hook and uninstall restores it', () => {
  const repo = tempRepo();
  const hookFile = path.join(repo, '.git', 'hooks', 'post-commit');
  const original = '#!/bin/sh\necho mine\n';
  writeFileSync(hookFile, original);

  run(repo, 'init');
  assert.match(readFileSync(hookFile, 'utf8'), /echo mine/);
  run(repo, 'uninstall');
  assert.equal(readFileSync(hookFile, 'utf8'), original);
});

test('init honors core.hooksPath', () => {
  const repo = tempRepo();
  execFileSync('git', ['config', 'core.hooksPath', '.myhooks'], { cwd: repo });
  run(repo, 'init');
  assert.ok(existsSync(path.join(repo, '.myhooks', 'post-commit')));
});

test('without login, init asks for docsync login and whoami reports not set up', () => {
  const repo = tempRepo();
  const out = run(repo, 'init');
  assert.match(out, /docsync login/);
  assert.throws(() => run(repo, 'whoami'), (e) => /Not set up/.test(e.stdout));
});

test('hooks do nothing and ask for login when this machine is not set up', () => {
  const repo = tempRepo();
  run(repo, 'init');
  execFileSync('git', ['config', 'user.email', 't@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repo });
  writeFileSync(path.join(repo, 'a.txt'), 'x');
  execFileSync('git', ['add', 'a.txt'], { cwd: repo });
  const hooksDir = path.join(repo, '.git', 'hooks');
  assert.ok(existsSync(path.join(hooksDir, 'post-commit')));
  const out = execFileSync(process.execPath, [BIN, 'hook', 'post-commit'], { cwd: repo, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(out, '');
  assert.equal(existsSync(path.join(repo, '.git', 'docsync')), false);
});

test('outside a git repo, commands fail with a clear message', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'docsync-nogit-'));
  assert.throws(() => run(dir, 'init'), /Not inside a git repository/);
});
