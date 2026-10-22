import { readFileSync } from 'node:fs';
import path from 'node:path';

export const CONFIG_FILE = '.docsync.json';

export const DEFAULTS = {
  titleTemplate: '{repo} / {branch}',
  folderId: null,
  skipBranchesOnCheckout: ['main', 'master', 'develop'],
  maxDiffBytes: 60000,
};

export function loadConfig(root) {
  let fromFile = {};
  try {
    fromFile = JSON.parse(readFileSync(path.join(root, CONFIG_FILE), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Cannot read ${CONFIG_FILE}: ${err.message}`);
  }
  const cfg = { ...DEFAULTS, ...fromFile };
  if (process.env.DOCSYNC_FOLDER_ID) cfg.folderId = process.env.DOCSYNC_FOLDER_ID;
  return cfg;
}

export function renderTitle(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
}

/** Filesystem-safe and collision-free: "feature/x" and "feature-x" stay distinct. */
export function slugify(branch) {
  return branch.replace(/[^A-Za-z0-9._-]/g, (c) => `%${c.charCodeAt(0).toString(16)}`);
}
