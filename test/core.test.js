import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderTitle, slugify } from '../src/config.js';
import { addBlock, hasBlock, removeBlock } from '../src/hooks.js';
import { parseDocId } from '../src/prompt.js';
import { parseAuthStatus, parseMcpList, parseOwner } from '../src/account.js';

test('parseAuthStatus reads claude auth status JSON', () => {
  assert.deepEqual(parseAuthStatus('{\n "loggedIn": true,\n "email": "a@b.com"\n}'), { loggedIn: true, email: 'a@b.com' });
  assert.deepEqual(parseAuthStatus('{"loggedIn": false}'), { loggedIn: false, email: null });
  assert.deepEqual(parseAuthStatus('garbage'), { loggedIn: false, email: null });
});

test('parseMcpList requires both Google connectors to be connected', () => {
  const ok = 'claude.ai Google Docs: https://x - ✔ Connected\nclaude.ai Google Drive: https://y - ✔ Connected\n';
  assert.deepEqual(parseMcpList(ok), { docs: true, drive: true });
  const partial = 'claude.ai Google Docs: https://x - ! Needs authentication\nclaude.ai Google Drive: https://y - ✔ Connected\n';
  assert.deepEqual(parseMcpList(partial), { docs: false, drive: true });
  assert.deepEqual(parseMcpList('plugin:engineering:gmail:  (HTTP) - - Not configured'), { docs: false, drive: false });
});

test('parseOwner extracts the owner email line', () => {
  assert.equal(parseOwner('OWNER=me@example.com\n'), 'me@example.com');
  assert.equal(parseOwner('OWNER=unknown'), null);
});

test('slugify keeps distinct branches distinct and filesystem safe', () => {
  assert.notEqual(slugify('feature/x'), slugify('feature-x'));
  assert.match(slugify('feature/x y'), /^[A-Za-z0-9._%-]+$/);
});

test('renderTitle fills known placeholders and leaves unknown ones', () => {
  assert.equal(renderTitle('{repo} / {branch}', { repo: 'r', branch: 'b' }), 'r / b');
  assert.equal(renderTitle('{repo} {nope}', { repo: 'r' }), 'r {nope}');
});

test('parseDocId takes the last DOC_ID line', () => {
  assert.equal(parseDocId('https://x\nDOC_ID=abc123\n'), 'abc123');
  assert.equal(parseDocId('DOC_ID=old\nmore\nDOC_ID=new\r\n'), 'new');
  assert.equal(parseDocId('no id here'), null);
});

test('addBlock creates a hook with a shebang when none exists', () => {
  const out = addBlock('', 'post-commit');
  assert.ok(out.startsWith('#!/bin/sh\n'));
  assert.ok(hasBlock(out));
  assert.match(out, /docsync hook post-commit/);
});

test('addBlock is idempotent and keeps the existing hook', () => {
  const existing = '#!/bin/sh\necho hello\n';
  const once = addBlock(existing, 'post-commit');
  const twice = addBlock(once, 'post-commit');
  assert.equal(once, twice);
  assert.ok(once.includes('echo hello'));
});

test('removeBlock restores the original hook and returns null when nothing is left', () => {
  const existing = '#!/bin/sh\necho hello\n';
  const installed = addBlock(existing, 'post-commit');
  assert.equal(removeBlock(installed), existing);
  assert.equal(removeBlock(addBlock('', 'post-commit')), null);
});
