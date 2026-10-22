import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hooksDir } from './git.js';

export const HOOK_NAMES = ['post-commit', 'post-checkout'];
const START = '# >>> docsync >>>';
const END = '# <<< docsync <<<';
const BLOCK_RE = new RegExp(`\\n?${START}[\\s\\S]*?${END}\\n?`);

/** Hooks run under sh on every platform (Git for Windows ships one). */
export function shim(name) {
  return [
    START,
    '# Managed by docsync. Remove with: docsync uninstall',
    'if command -v docsync >/dev/null 2>&1; then',
    `  docsync hook ${name} "$@" || true`,
    'elif command -v npx >/dev/null 2>&1; then',
    `  npx --no-install docsync hook ${name} "$@" || true`,
    'fi',
    END,
    '',
  ].join('\n');
}

export function addBlock(existing, name) {
  const block = shim(name);
  if (!existing.trim()) return `#!/bin/sh\n${block}`;
  if (BLOCK_RE.test(existing)) return existing.replace(BLOCK_RE, `\n${block}`);
  return `${existing.replace(/\s*$/, '\n')}\n${block}`;
}

/** Returns the new content, or null when nothing but our block (and a shebang) is left. */
export function removeBlock(existing) {
  const rest = existing.replace(BLOCK_RE, '\n');
  return rest.replace(/^#!.*\n?/, '').trim() === '' ? null : rest.replace(/\s*$/, '\n');
}

export function hasBlock(content) {
  return BLOCK_RE.test(content);
}

export function installHooks(cwd) {
  const dir = hooksDir(cwd);
  mkdirSync(dir, { recursive: true });
  return HOOK_NAMES.map((name) => {
    const file = path.join(dir, name);
    const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
    writeFileSync(file, addBlock(before, name));
    try {
      chmodSync(file, 0o755);
    } catch {
      // not supported on some Windows filesystems; git runs the hook anyway
    }
    return { name, file, existed: before.trim() !== '' };
  });
}

export function uninstallHooks(cwd) {
  const dir = hooksDir(cwd);
  return HOOK_NAMES.map((name) => {
    const file = path.join(dir, name);
    if (!existsSync(file)) return { name, removed: false };
    const content = readFileSync(file, 'utf8');
    if (!hasBlock(content)) return { name, removed: false };
    const after = removeBlock(content);
    if (after === null) rmSync(file);
    else writeFileSync(file, after);
    return { name, removed: true };
  });
}

export function hookStatus(cwd) {
  const dir = hooksDir(cwd);
  return HOOK_NAMES.map((name) => {
    const file = path.join(dir, name);
    return { name, installed: existsSync(file) && hasBlock(readFileSync(file, 'utf8')) };
  });
}
