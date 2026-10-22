# docsync

Keeps one Google Doc per git branch up to date. Every commit adds a Changelog entry to the branch's doc, and a new branch gets its own doc. Claude writes the text; the doc is edited in place, so the link never changes.

## Requirements

- Node 18 or newer and git (on Windows, Git for Windows, which provides the `sh` that runs hooks)
- [Claude Code](https://claude.com/claude-code), logged in (`claude` on your PATH)
- The **Google Docs** and **Google Drive** connectors enabled for your Claude account (claude.ai > Settings > Connectors)

## Install

```bash
npm install -g docsync          # or run it without installing: npx docsync init
cd your-repo
docsync init                    # installs hooks, then walks you through sign-in
docsync doctor                  # checks login, connectors and hooks
```

## Everyone signs in with their own accounts

docsync never shares or stores credentials. Each person, on each machine, runs `docsync login` (`docsync init` starts it automatically in a terminal). It:

1. Confirms the Claude account in use, and starts `claude auth login` if you are signed out. Say "n" to switch accounts.
2. Checks that the Google Docs and Google Drive connectors are connected, and opens claude.ai/settings/connectors so you can connect them with your own Google account.
3. Reads back which Google account the connectors use and asks you to confirm, because that account will own the docs.
4. Saves who it verified in `~/.docsync/user.json` (outside the repo).

Until that is done, the hooks do nothing and print `Run: docsync login`. If someone later signs in to Claude as a different account, syncs are skipped until they run `docsync login` again. `docsync whoami` shows the accounts in use and `docsync logout` clears the setup.

Docs are owned by each person's Google account and private by default. To share one set of docs across the team, put them in a shared Drive folder: `docsync init --folder <folderId>`.

`init` creates `.docsync.json` (commit it so the team shares settings) and adds two git hooks:

| Hook | What it does |
|---|---|
| `post-commit` | Adds the commit to the branch's doc |
| `post-checkout` | Creates the doc the first time you check out a branch (skips `main`, `master`, `develop`) |

Existing hooks are kept: docsync appends a clearly marked block, and `docsync uninstall` removes only that block. It respects `core.hooksPath`.

## How it behaves

- Commits are never slowed or blocked. The sync runs as a detached background process and takes roughly 30 to 90 seconds.
- One doc per branch, titled `<repo> / <branch>`. If a teammate already created it, docsync finds it by title instead of making a duplicate.
- The doc ID is cached in `.git/docsync/` per clone.
- Rebases do not trigger syncs, so replaying commits does not fire one Claude call per commit.
- Results go to `.git/docsync/docsync.log`: `docsync log`, `docsync url`.

## Commands

```
docsync login                             sign in to your own Claude and Google accounts
docsync logout                            clear this machine's setup
docsync whoami                            show the accounts in use
docsync init [--folder <driveFolderId>]   install hooks, create .docsync.json
docsync uninstall                         remove the hooks
docsync doctor                            check git, claude, login and connectors
docsync sync [--mode update|create]       sync the current branch now
docsync url                               print the current branch's doc link
docsync log [-n <lines>]                  show recent results
```

## Configuration

`.docsync.json`:

```json
{
  "titleTemplate": "{repo} / {branch}",
  "folderId": null,
  "skipBranchesOnCheckout": ["main", "master", "develop"],
  "maxDiffBytes": 60000
}
```

Environment variables: `DOCSYNC_SKIP=1` skips one commit, `DOCSYNC_FOREGROUND=1` runs the sync inside the hook and prints the result, `DOCSYNC_FOLDER_ID` overrides `folderId`.

## Limits

- The diff sent to Claude is capped at `maxDiffBytes`; larger commits are documented from the truncated diff.
- Each commit makes one Claude call, which counts against your Claude usage.
- If a hook of yours runs `exec` or `exit` before the docsync block, docsync never runs; put its block earlier or remove the early exit.
- Check that the npm name `docsync` is free before publishing, or use a scope such as `@your-org/docsync`.

## Development

```bash
npm test
```
