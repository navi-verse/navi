---
name: github
description: Interact with GitHub — manage repos, issues, pull requests, releases, and workflows via the `gh` CLI. Use when the user asks to create or clone a repo, open or list issues/PRs, make a release, check workflow runs, or do anything GitHub-related.
---

# GitHub Skill

Uses the `gh` CLI. Already authenticated.

## Repos

```bash
gh repo list [owner]                          # list repos
gh repo view [owner/repo]                     # view repo details
gh repo create <name> --public/--private      # create repo
gh repo clone <owner/repo>                    # clone repo
gh repo fork <owner/repo>                     # fork repo
gh repo delete <owner/repo> --yes             # delete repo
gh browse                                     # open repo in browser
```

## Issues

```bash
gh issue list                                 # list open issues
gh issue view <number>                        # view issue
gh issue create --title "..." --body "..."    # create issue
gh issue close <number>                       # close issue
gh issue reopen <number>                      # reopen issue
gh issue comment <number> --body "..."        # add comment
```

## Pull Requests

```bash
gh pr list                                    # list open PRs
gh pr view <number>                           # view PR
gh pr create --title "..." --body "..."       # create PR
gh pr merge <number> --merge/--squash/--rebase
gh pr checkout <number>                       # check out PR locally
gh pr review <number> --approve               # approve PR
gh pr close <number>                          # close PR
```

## Releases

```bash
gh release list                               # list releases
gh release view <tag>                         # view release
gh release create <tag> --title "..." --notes "..."   # create release
gh release upload <tag> <file>                # upload asset to release
gh release delete <tag> --yes                 # delete release
```

## Workflows & Actions

```bash
gh workflow list                              # list workflows
gh workflow run <workflow>                    # trigger workflow
gh run list                                   # list recent runs
gh run view <run-id>                          # view run details
gh run watch <run-id>                         # watch run live
```

## API (advanced)

For anything not covered by the commands above:

```bash
gh api repos/<owner>/<repo>                   # GET request
gh api repos/<owner>/<repo> -X PATCH -f description="New description"
gh api graphql -f query='{ viewer { login } }'
```

## Tips
- Most commands default to the repo in the current directory
- Use `--repo owner/repo` to target a specific repo from anywhere
- Use `gh api` for anything not covered by dedicated commands
- `gh browse` opens the current repo in the browser
