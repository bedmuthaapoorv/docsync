import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Per-user state lives in the user's home, never in the repo, so nothing is shared by accident. */
export const userDir = () => process.env.DOCSYNC_HOME || path.join(os.homedir(), '.docsync');
const userFile = () => path.join(userDir(), 'user.json');

export function readUser() {
  try {
    return JSON.parse(readFileSync(userFile(), 'utf8'));
  } catch {
    return null;
  }
}

export function writeUser(data) {
  mkdirSync(userDir(), { recursive: true });
  writeFileSync(userFile(), `${JSON.stringify(data, null, 2)}\n`);
}

export function clearUser() {
  rmSync(userFile(), { force: true });
}

/** Parses `claude auth status` JSON output. */
export function parseAuthStatus(text) {
  try {
    const start = text.indexOf('{');
    const j = JSON.parse(text.slice(start, text.lastIndexOf('}') + 1));
    return { loggedIn: Boolean(j.loggedIn), email: j.email ?? null };
  } catch {
    return { loggedIn: false, email: null };
  }
}

/** Parses `claude mcp list` for the two connectors docsync needs. */
export function parseMcpList(text) {
  const connected = (name) =>
    text.split(/\r?\n/).some(
      (line) =>
        new RegExp(`^claude\\.ai ${name}:`, 'i').test(line.trim()) &&
        /connected/i.test(line) &&
        !/needs auth|failed|not configured|not connected/i.test(line),
    );
  return { docs: connected('Google Docs'), drive: connected('Google Drive') };
}

export function parseOwner(output) {
  const m = output.match(/^OWNER=(\S+@\S+)\s*$/m);
  return m ? m[1] : null;
}
