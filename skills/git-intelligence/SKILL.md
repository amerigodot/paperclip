---
name: git-intelligence
description: >
  Analyze git history, generate multi-tier Conventional Commits changelogs,
  compare release tags on baseline branches, inspect staging/beta branches,
  evaluate active refactorings, and detect merge conflict risks across GitLab
  and GitHub repositories.
---

# Git & GitLab Intelligence Skill

Use this skill when you need to audit, inspect, or generate structured changelogs across branches and release tags for software repositories.

## Operational Workflow

### 1. Identify Target Repository Platform
- **GitLab:** When given a GitLab URL (`https://gitlab.com/...` or self-hosted) or project namespace path (`<owner>/<project>`), invoke `gitlab_intelligence`.
  - Performs pure remote REST API v4 queries using `GITLAB_TOKEN`.
  - Does NOT download or clone the repository to disk.
- **GitHub & Local Git:** When given a GitHub URL, owner/repo slug, or local filesystem path, invoke `git_intelligence`.

### 2. Multi-Tier Changelog Protocol
When asked to evaluate released features, upcoming candidate changes, and active development:

1. **Officially Released (Baseline / `main` / `master`)**:
   - Inspect tags merged into the baseline branch.
   - Categorize commits using Conventional Commits (`feat`, `fix`, `refactor`, `perf`, `breaking`).
   - Track SemVer progression between releases.

2. **Upcoming Release Candidate (Staging / `beta` / `develop`)**:
   - Compare the candidate branch against baseline.
   - Identify upcoming features, breaking changes, and newly introduced files/modules.

3. **Active Work in Progress (`refactor/*`, `feat/*`, topic branches)**:
   - Identify active non-baseline branches and sync status (ahead/behind).
   - Map touched subsystems and packages.
   - Run the **Conflict Risk Radar** to detect overlapping file modifications across branches.

### 3. Granular Token Resilience
Fine-grained access tokens often restrict administrative endpoints (`[Pipeline: Read]`, `[Project: Read]`). With `[Repository: Read]`, all branch, tag, commit, and compare operations succeed. Do not abort or assume a repository is uninitialized when non-critical endpoints return 403.

### 4. Artifact Publication
Always publish the finalized structured Markdown report as a persistent Paperclip task document using the document key `changelog`.
