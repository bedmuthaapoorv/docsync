# docsync

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)

**One Google Doc per git branch, updated on every commit.**

docsync installs two git hooks. After each commit, Claude reads the diff and adds a Changelog entry to that branch's Google Doc. The doc is edited in place, so the link never changes. Each person signs in with their own Claude and Google accounts; there are no API keys or service accounts to manage.

## What you get

Commit as usual:

```console
$ git commit -m "add app.txt for docsync e2e test"
[feature/e2e-test 1f9aefb] add app.txt for docsync e2e test
```

About 30 to 90 seconds later, a Google Doc titled `my-repo / feature/e2e-test` has this entry at the top of its Changelog:

> **2026-10-22 1f9aefb add app.txt for docsync e2e test**
> Added a new file, app.txt, containing a single line, "hello". Files touched: app.txt.

The doc starts with Purpose, Overview and Changelog sections. Later commits add entries to the top of the Changelog and update Purpose or Overview only when a commit changes what they say.

## Quick start

```bash
# 1. Install (the command it provides is just "docsync")
npm install -g @bedmuthaapoorv/docsync

# 2. In any git repository
cd your-repo
docsync init       # installs hooks, then walks you through sign-in
docsync doctor     # confirms everything is connected
```

Make a commit. Run `docsync url` to print the link to the branch's doc.

## How it works

```
 git commit ──► post-commit hook ──► docsync (detached background process)
                                          │
                       ┌──────────────────┴──────────────────┐
                       ▼                                     ▼
              commit message + diff                 claude -p (your login)
              (capped at maxDiffBytes)                       │
                                                             ▼
                                             Google Drive / Docs connectors
                                             find or create "<repo> / <branch>"
                                             add a Changelog entry in place
```

- `post-commit` adds the commit to the branch's doc. `post-checkout` creates the doc the first time you check out a branch (skipping `main`, `master` and `develop`).
- The sync runs detached, so commits are never slowed or blocked. Failures are logged and ignored by git.
- If the doc for a branch already exists, docsync finds it by exact title instead of creating a duplicate. Teammates on the same branch share one doc when they share a Drive folder (see [Teams](#teams)).
- The doc ID is cached per clone in `.git/docsync/`. Results are logged to `.git/docsync/docsync.log`.
- Rebases do not trigger syncs, so replaying commits does not make one Claude call per commit.

## Requirements

- Node 18 or newer, and git. On Windows, use Git for Windows, which provides the `sh` that runs hooks.
- [Claude Code](https://claude.com/claude-code) installed, with `claude` on your PATH.
- A Claude account with the **Google Docs** and **Google Drive** connectors available.

## Everyone signs in with their own accounts

docsync never shares or stores credentials. Each person, on each machine, runs `docsync login`. (`docsync init` starts it automatically in a terminal.) It:

1. Confirms the Claude account in use, and starts `claude auth login` if you are signed out. Answer "n" to switch accounts.
2. Checks that the Google Docs and Google Drive connectors are connected, and opens [claude.ai/settings/connectors](https://claude.ai/settings/connectors) so you can connect them with your own Google account.
3. Reads back which Google account the connectors use and asks you to confirm, because that account will own the docs.
4. Saves who it verified in `~/.docsync/user.json`, outside the repo.

Until that is done, the hooks do nothing and print `Run: docsync login`. If someone later signs in to Claude as a different account, syncs are skipped until they run `docsync login` again.

## Commands

| Command | What it does |
|---|---|
| `docsync login` | Sign in to your own Claude and Google accounts (once per machine) |
| `docsync logout` | Clear this machine's setup; hooks do nothing until you log in again |
| `docsync whoami` | Show which Claude and Google accounts are in use |
| `docsync init [--folder <id>]` | Install the hooks and create `.docsync.json` |
| `docsync uninstall` | Remove the hooks (your own hook code is left alone) |
| `docsync doctor` | Check git, login, connectors and hooks |
| `docsync sync [--mode update\|create]` | Sync the current branch now, in the foreground |
| `docsync url` | Print the link to the current branch's doc |
| `docsync log [-n <lines>]` | Show recent sync results |

## Configuration

`init` creates `.docsync.json` at the repo root. Commit it so your team shares the settings.

```json
{
  "titleTemplate": "{repo} / {branch}",
  "folderId": null,
  "skipBranchesOnCheckout": ["main", "master", "develop"],
  "maxDiffBytes": 60000
}
```

| Key | Meaning |
|---|---|
| `titleTemplate` | Doc title. `{repo}` and `{branch}` are filled in. |
| `folderId` | Drive folder for new docs. Default is the root of My Drive. |
| `skipBranchesOnCheckout` | Branches that do not get a doc just from being checked out. They still get one on their first commit. |
| `maxDiffBytes` | Largest diff sent to Claude. Bigger commits are documented from the truncated diff. |

Environment variables:

| Variable | Effect |
|---|---|
| `DOCSYNC_SKIP=1` | Skip syncing, for example `DOCSYNC_SKIP=1 git commit ...` |
| `DOCSYNC_FOREGROUND=1` | Run the sync inside the hook and print the result |
| `DOCSYNC_FOLDER_ID=<id>` | Overrides `folderId` |

## Teams

Docs are owned by each person's Google account and are private by default. If two people use docsync on the same repo with no shared folder, each only sees their own docs, and opening someone else's link shows "access denied".

To share one set of docs, create a shared Drive folder and use its ID (the last part of the folder URL):

```bash
docsync init --folder <folderId>
```

Commit the resulting `.docsync.json`. New docs are created in that folder and inherit its sharing.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Hook prints `Run: docsync login` | This machine is not set up. Run `docsync login`. |
| Commit succeeds but no doc appears | The sync is a background process. Wait a minute, then run `docsync log` and `docsync url`. A line containing `FAILED` or `SKIPPED` says why. |
| "Access denied" when opening a doc | The doc belongs to another Google account. Open it from the account shown by `docsync whoami`, or use a shared folder. |
| `docsync doctor` says a connector is not connected | Connect it at [claude.ai/settings/connectors](https://claude.ai/settings/connectors) with your own Google account. |
| Nothing happens, and `docsync doctor` shows a hook missing | Run `docsync init` again. If one of your own hooks calls `exec` or `exit` before the docsync block, move the block earlier. |
| Syncs skipped after switching Claude accounts | Run `docsync login` so docsync records the new account. |

## FAQ

**Does it block my commits?** No. The hook returns immediately and the sync runs in the background.

**Does it cost anything?** Each commit makes one Claude call, which counts against your Claude usage.

**Can I skip a commit?** Yes: `DOCSYNC_SKIP=1 git commit ...`.

**Where is my data stored?** The commit message and diff are sent to Claude, and the doc lives in your Google Drive. docsync itself keeps only the doc ID cache in `.git/docsync/` and your verified account names in `~/.docsync/`.

**Can I turn it off?** `docsync uninstall` removes the hooks from the repo. `docsync logout` keeps the hooks but makes them inert on your machine.

## Similar tools

Other projects generate docs from git changes, usually as Markdown files or through CI: for example [CommitLM](https://github.com/LeeSinLiang/commitLM) (post-commit hook, Markdown output) and [commit-to-docs](https://github.com/Chndr-3/commit-to-docs) (GitHub Action that can mirror a changelog to one Google Doc). docsync's niche is a local, per-user workflow that keeps one Google Doc per branch and needs no API keys or CI setup.

## Limits

- One Claude call per commit; very large commits are documented from the truncated diff.
- docsync adds changelog entries. It does not detect that older sections of a doc have gone stale.
- It depends on the Claude CLI and the claude.ai Google connectors, so it needs a Claude account that has them.

## Development

```bash
git clone https://github.com/bedmuthaapoorv/docsync.git
cd docsync
npm test
node bin/docsync.js --help
```

Tests use Node's built-in test runner and need no network or Claude login.

## License

[Apache-2.0](LICENSE)
