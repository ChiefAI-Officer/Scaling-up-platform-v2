# Task Board

This repository uses GitHub Issues and Projects as the primary task board. This file exists only as a small source-truth pointer for agents when GitHub Projects are unavailable or the current token cannot read Projects.

## Current Collaboration Tasks

| ID | Task | Owner | Status |
| --- | --- | --- | --- |
| GSYNC-01 | Keep every code change on a branch and PR; no direct `main` pushes. | Team | Active |
| GSYNC-02 | Link new Gabriel work to a GitHub issue before implementation starts. | Gabriel / reviewer | Active |
| GSYNC-03 | Keep PR descriptions updated with checks, blockers, and reviewer notes. | PR author | Active |
| GSYNC-04 | Run branch cleanup audits before deleting any stale branch. | Maintainer | Approval required |
| GSYNC-05 | Require CI checks in branch protection after confirming stable check names. | Maintainer | Pending |

## Agent Instructions

Before selecting work, inspect open GitHub issues and pull requests. If GitHub Projects access is blocked, report the exact token-scope blocker and use this file only as a fallback.