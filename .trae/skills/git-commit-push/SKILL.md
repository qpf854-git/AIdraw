---
name: "git-commit-push"
description: "Observable git commit-and-push workflow with scope control, SSH/remote verification and local==remote evidence. Invoke when user asks to commit and/or push changes to GitHub in this workspace."
---

# Git Commit & Push (Observable Workflow)

Use this workflow every time the user asks to commit or push changes in this workspace. Never report "已提交/已推送" without command output as evidence.

## Preconditions

1. Confirm cwd is the repo root (the directory containing `.git`). Use absolute paths with the Shell `cwd` parameter; do not assume the terminal persists directory.
2. If `git` is missing or `.git` does not exist, stop and ask the user before installing Git or running `git init` (high-impact actions require explicit consent).
3. For pushes, know the auth method in advance: SSH key, HTTPS token, or user pushes manually. Do not guess. In this workspace the remote is SSH (`git@github.com:qpf854-git/AIdraw.git`) with key `~/.ssh/id_ed25519`.

## Steps

1. **Freeze scope — inspect before touching anything**
   - `git status --short` and, when relevant, `git remote -v`, `git branch --show-current`.
   - Stage ONLY files that belong to this change (`git add <path>`). Avoid `git add -A`/`git add .` unless the user approved a full snapshot.
   - Verify secrets are excluded: `git ls-files | grep -x ".env"` must return nothing; `.env*` (except `.env.example`) must be git-ignored.
   - If unrelated/untracked files are mixed in, list them and confirm scope with the user instead of committing them.

2. **Commit**
   - Use a clear single-subject message: `git commit -m "type: summary"` (types: init/feat/fix/docs/refactor/chore).
   - Avoid bash heredoc multi-line `-m` in non-bash shells; use multiple `-m` flags or a message file if multi-line is needed.
   - If commit fails, read the actual error output; never claim success.

3. **Push**
   - First push of a new branch: `git push -u origin <branch>`; otherwise `git push`.
   - SSH/network commands may be blocked by the local sandbox. If the error mentions sandbox restrictions on `~/.ssh`, `known_hosts`, or network, re-run that command outside the sandbox; do not switch protocols (e.g. do not rewrite an SSH remote to an https proxy URL).
   - On rejected push: inspect `git fetch` + `git status -sb` first, then discuss rebase/merge with the user. Never force-push without explicit request.

4. **Verify with observable evidence (mandatory)**
   - Local HEAD: `git rev-parse HEAD`
   - Remote HEAD: `git ls-remote origin refs/heads/<branch>`
   - They MUST be equal; `git status -sb` should show the branch tracking with no ahead/behind.
   - Report commit hash, message, pushed range (e.g. `28692fe..a993da4 main -> main`) and the final state.

## Known environment notes (this workspace)

- Node lives at `~/.local/node/v22/bin` (not on default PATH); unrelated to git but relevant when verifying servers.
- Shell config files (`~/.gitconfig`, `~/.ssh/*`) are outside the writable sandbox; writing them requires running outside the sandbox.
- `ssh -T git@github.com` authenticates successfully with exit code 1 — the greeting `Hi <user>!` is the success signal, not the exit code.
- Prefer plain `node server.js` over `node --watch` when config must take effect: the watcher leaves child processes that keep holding the port; kill with `lsof -ti:<port> | xargs kill -9` as a fallback.

## Anti-patterns (do not repeat)

- Claiming push succeeded while local and remote HEAD differ.
- Rewriting the remote URL to a proxy when the real cause is sandbox/network.
- `git add -A` sweeping in build artifacts, secrets, or unrelated files.
- Amending/resetting/force-pushing already-pushed commits without explicit user consent.
