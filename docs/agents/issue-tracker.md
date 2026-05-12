# Issue tracker: GitHub

Issues for this repo live as GitHub Issues on `jcbdelo26/Scaling-up-platform-v2`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

`gh` infers the repo automatically when run inside the clone at `/Users/diushianstand/Scaling-up-platform-v2`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue with appropriate category + state labels (see `triage-labels.md`).

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
