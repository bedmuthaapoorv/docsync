# docsync

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)

**Every git branch gets its own Google Doc, and every commit adds to it automatically.**

You commit as usual. About a minute later, a Google Doc named `your-repo / your-branch` has a new entry like this:

> **2026-10-22 · 1f9aefb · add login page**
> Added a login page with email and password fields. Files touched: login.html, auth.js.

Claude writes the summary from your commit. The doc is edited in place, so the link never changes, and your commits are never slowed down.

## Set up in 5 minutes

**You need**
- [Node.js](https://nodejs.org) 18 or newer (check: `node --version`)
- [Claude Code](https://claude.com/claude-code) installed (check: `claude --version`)
- git (on Windows, [Git for Windows](https://git-scm.com/download/win))

**1. Install**

```bash
npm install -g @bedmuthaapoorv/docsync
```

**2. Turn it on in your repo**

```bash
cd your-repo
docsync init
```

You will see:

```
Created .docsync.json (commit it so your team shares the settings).
Installed post-commit hook.
Installed post-checkout hook.
```

**3. Sign in (it starts by itself)**

docsync asks you to confirm two accounts. Answer with Enter to accept.

```
Claude account: you@example.com. Use this account? [Y/n]
...
Google account: you@example.com
Docs will be created in this Google account. Correct? [Y/n]
```

If Claude or Google isn't connected yet, docsync tells you what to do and opens [claude.ai/settings/connectors](https://claude.ai/settings/connectors) so you can connect **Google Docs** and **Google Drive** with your own Google account.

**4. Make a commit**

```bash
git commit -am "my change"
```

Your commit finishes right away. Within a minute or two, find your doc with:

```bash
docsync url
```

That's it. From now on, every commit adds an entry to the doc for the branch you're on, and the first time you switch to a new branch, it gets its own doc.

## Everyday use

| I want to... | Run |
|---|---|
| Open the doc for my current branch | `docsync url` |
| See whether the last commit synced | `docsync log` |
| Skip docs for one commit | `DOCSYNC_SKIP=1 git commit -m "..."` (PowerShell: `$env:DOCSYNC_SKIP=1; git commit -m "..."; Remove-Item Env:DOCSYNC_SKIP`) |
| Check that everything is set up right | `docsync doctor` |
| See which accounts docsync is using | `docsync whoami` |
| Sync the current branch right now | `docsync sync` |
| Turn it off in this repo | `docsync uninstall` |
| Turn it off on this machine only | `docsync logout` |

## Something not working?

Start with `docsync doctor`. It checks each requirement and tells you how to fix what's missing.

| What you see | What to do |
|---|---|
| `Run: docsync login` after a commit | This machine isn't signed in yet. Run `docsync login`. |
| No doc after a commit | Wait a minute (it runs in the background), then run `docsync log`. A line with `FAILED` or `SKIPPED` explains why. |
| "Access denied" when opening a doc | The doc belongs to a different Google account than the one you're signed in to in your browser. `docsync whoami` shows the owner account. For shared docs, see [Sharing docs with your team](#sharing-docs-with-your-team). |
| `doctor` says a connector isn't connected | Connect Google Docs and Google Drive at [claude.ai/settings/connectors](https://claude.ai/settings/connectors) using your own Google account. |
| You switched Claude accounts and syncs stopped | Run `docsync login` again so docsync records the new account. |
| `doctor` says a hook is missing | Run `docsync init` again. If one of your own hooks calls `exit` before docsync's block, move docsync's block up. |

## Sharing docs with your team

Each person's docs are created in their own Google account and are private by default. If teammates should read the same docs, use a shared Google Drive folder:

1. Create a folder in Google Drive and share it with your team.
2. Copy the folder ID, the last part of its URL (`drive.google.com/drive/folders/<folder ID>`).
3. Run this once in the repo and commit the result:

```bash
docsync init --folder <folder ID>
```

New docs are created in that folder and inherit its sharing. If a teammate already created the doc for a branch, docsync finds it by title instead of making a duplicate.

Every teammate still runs `docsync init` once on their own machine and signs in with their own accounts. docsync never shares or stores passwords or tokens.

## Good to know

- **Cost:** each commit makes one Claude call, which counts toward your Claude usage.
- **Privacy:** your commit message and diff are sent to Claude, and the doc lives in your Google Drive. docsync itself only keeps a small cache of doc IDs inside `.git/docsync/` and your verified account names in `~/.docsync/`.
- **Large commits:** only the first 60,000 characters of a diff are sent to Claude.
- **Rebases:** syncing is paused during a rebase so replaying commits doesn't trigger one call per commit.
- **What it writes:** new Changelog entries. It doesn't check whether older parts of a doc have gone out of date.

<details>
<summary><strong>Settings</strong> (<code>.docsync.json</code>)</summary>

`docsync init` creates `.docsync.json` at the repo root. Commit it so your team shares the settings.

```json
{
  "titleTemplate": "{repo} / {branch}",
  "folderId": null,
  "skipBranchesOnCheckout": ["main", "master", "develop"],
  "maxDiffBytes": 60000
}
```

| Setting | Meaning |
|---|---|
| `titleTemplate` | Doc title. `{repo}` and `{branch}` are filled in. |
| `folderId` | Google Drive folder for new docs. Default is the top level of My Drive. |
| `skipBranchesOnCheckout` | Branches that don't get a doc just from being checked out. They still get one on their first commit. |
| `maxDiffBytes` | Largest diff sent to Claude. |

Environment variables: `DOCSYNC_SKIP=1` skips one commit, `DOCSYNC_FOREGROUND=1` runs the sync inside the commit and prints the result, `DOCSYNC_FOLDER_ID=<id>` overrides `folderId`.

</details>

<details>
<summary><strong>How it works</strong></summary>

```
git commit ──► post-commit hook ──► docsync (runs in the background)
                                         │
                      commit message + diff ──► claude -p (your login)
                                                      │
                                                      ▼
                                      Google Drive / Docs connectors
                                      find or create "<repo> / <branch>"
                                      add a Changelog entry in place
```

- `docsync init` adds a `post-commit` hook (adds each commit to the branch's doc) and a `post-checkout` hook (creates the doc the first time you check out a branch). Existing hooks are kept, and `docsync uninstall` removes only docsync's part. It respects `core.hooksPath`.
- The doc is found by its exact title, so there is one doc per branch.
- Results go to `.git/docsync/docsync.log`.

</details>

<details>
<summary><strong>All commands</strong></summary>

| Command | What it does |
|---|---|
| `docsync init [--folder <id>]` | Install the hooks and create `.docsync.json` |
| `docsync login` | Sign in to your own Claude and Google accounts (once per machine) |
| `docsync logout` | Clear this machine's setup; hooks do nothing until you log in again |
| `docsync whoami` | Show which accounts are in use |
| `docsync doctor` | Check git, login, connectors and hooks |
| `docsync url` | Print the link to the current branch's doc |
| `docsync log [-n <lines>]` | Show recent sync results |
| `docsync sync [--mode update\|create]` | Sync the current branch now, in the foreground |
| `docsync uninstall` | Remove the hooks |

</details>

## Other tools

Other projects generate docs from git changes, usually as Markdown files or through CI, for example [CommitLM](https://github.com/LeeSinLiang/commitLM) and [commit-to-docs](https://github.com/Chndr-3/commit-to-docs). docsync is for a local workflow with one Google Doc per branch and no API keys or CI setup.

## Contributing

```bash
git clone https://github.com/bedmuthaapoorv/docsync.git
cd docsync
npm test
node bin/docsync.js --help
```

Tests use Node's built-in test runner and need no network or Claude login. Issues and pull requests are welcome.

## License

[Apache-2.0](LICENSE)
