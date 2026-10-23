<div align="center">

# StarterQueue

### Keep your `good first issue` queue honest.

StarterQueue is a small, read-only CLI that audits GitHub starter issues and flags tickets that are no longer genuinely ready for a newcomer.

[![CI](https://github.com/VyxorDev/starterqueue/actions/workflows/ci.yml/badge.svg)](https://github.com/VyxorDev/starterqueue/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-VyxorDev%2Fstarterqueue-181717?logo=github)](https://github.com/VyxorDev/starterqueue)

</div>

---

## Why StarterQueue?

A `good first issue` label can stay attached long after an issue stops being a good first issue.

StarterQueue checks for **objective queue rot** such as:

- an issue already being assigned;
- a blocker or waiting label;
- long inactivity;
- an open pull request that GitHub marks as closing the issue;
- explicit text saying the issue is not ready for contributors;
- GitHub reporting that the issue is blocked by open dependencies;
- a locked issue conversation;
- a closed or overdue milestone.

The goal is deliberately narrow: **catch obvious readiness problems without pretending to judge whether an issue is “easy.”**

---

## Audit rules

| Rule | What StarterQueue detects | Result |
| :--- | :--- | :---: |
| `SQ001` | Issue already has an assignee | ❌ Fail |
| `SQ002` | Issue has a blocked/waiting label | ❌ Fail |
| `SQ003` | No activity for the configured threshold — 90 days by default | ⚠️ Warning |
| `SQ004` | An open pull request is registered by GitHub as closing the issue | ❌ Fail |
| `SQ005` | Issue text explicitly says it is not ready for contribution(s) | ❌ Fail |
| `SQ006` | GitHub reports one or more open issue dependencies blocking it | ❌ Fail |
| `SQ007` | Issue conversation is locked | ❌ Fail |
| `SQ008` | Issue belongs to a closed milestone | ❌ Fail |
| `SQ009` | An open milestone is past its due date | ⚠️ Warning |

### Rule notes

**`SQ004` — open closing pull request**  
Uses GitHub GraphQL's structured `closedByPullRequestsReferences` relation. A normal mention such as `Part of #123`, `Follows #123`, or a PR that explicitly leaves work for the issue does **not** count. This avoids treating incidental cross-references as proof that the issue is already being solved. `SQ004` requires `GH_TOKEN`; tokenless runs skip this rule and print a notice to stderr.

**`SQ005` — explicit not-ready language**  
Intentionally narrow. It only catches explicit wording such as `not ready for contribution` or `not ready for contributions`. StarterQueue does not perform subjective language scoring or infer readiness from arbitrary prose.

**`SQ006` — GitHub issue dependencies**  
Uses GitHub's structured issue dependency summary. If GitHub reports that an issue is currently blocked by one or more other issues, StarterQueue fails it without parsing `Blocked by ...` text or making an additional API request.

**`SQ007` — locked conversations**  
Uses the issue's existing `locked` field. A locked starter issue is treated as unavailable because a newcomer cannot use the normal issue conversation to ask questions or coordinate work.

**`SQ008` and `SQ009` — milestone state**  
Use GitHub's existing milestone fields. Closed milestones fail with `SQ008`; explicitly open milestones whose due date has passed warn with `SQ009`. Closed milestones do not also receive the overdue warning.

---

## Quick start

### Requirements

- Node.js **20 or newer**
- npm
- Optional but recommended: `GH_TOKEN` for authenticated GitHub requests and `SQ004`

### Run locally

```bash
npm ci
npm run build
node dist/src/cli.js audit owner/repo
```

You can also pass a GitHub repository URL:

```bash
node dist/src/cli.js audit https://github.com/owner/repo
```

For JSON output:

```bash
node dist/src/cli.js audit owner/repo --json
```

> [!TIP]
> Set `GH_TOKEN` for the complete audit. Authenticated runs batch GitHub's structured closing-PR relationship through GraphQL. If GitHub returns incomplete closing-PR data, StarterQueue exits with a tool error instead of silently producing a false-clean audit. Without a token, all other rules still run, but `SQ004` is skipped.

---

## Customize the audit

StarterQueue defaults to:

| Setting | Default |
| :--- | :--- |
| Starter label | `good first issue` |
| Inactivity threshold | `90` days |
| CI failure threshold | disabled |

Override values from the CLI:

```bash
node dist/src/cli.js audit owner/repo --label "starter task"
node dist/src/cli.js audit owner/repo --stale-days 45
node dist/src/cli.js audit owner/repo --label "starter task" --stale-days 45
```

`--stale-days` must be a positive integer.

---

## Use StarterQueue in CI

By default, audit findings are reported without making the process fail. Add `--fail-on` when you want StarterQueue to act as a CI gate.

```bash
# Exit 2 when at least one FAIL finding exists.
node dist/src/cli.js audit owner/repo --fail-on fail

# Exit 2 when at least one WARN or FAIL finding exists.
node dist/src/cli.js audit owner/repo --fail-on warn
```

### Exit codes

| Code | Meaning |
| :---: | :--- |
| `0` | Audit completed and the selected threshold was not violated |
| `1` | StarterQueue could not complete because of CLI, configuration, or GitHub API errors |
| `2` | Audit completed successfully, but findings violated `--fail-on` |

Keeping tool failures separate from audit failures makes CI logs and automation easier to reason about.

### GitHub Actions

A ready-to-copy example is available at [`examples/starterqueue.yml`](examples/starterqueue.yml).

Until StarterQueue is published as a package or dedicated Marketplace Action, the workflow checks out this repository into a subdirectory, installs from the lockfile, builds the CLI, and audits the repository in which the workflow is running. The StarterQueue checkout is pinned to an immutable reviewed commit SHA rather than floating `main`; update that SHA deliberately after reviewing newer StarterQueue changes.

```yaml
name: StarterQueue

on:
  workflow_dispatch:
  schedule:
    - cron: "0 8 * * 1"

permissions:
  contents: read
  issues: read
  pull-requests: read

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: VyxorDev/starterqueue
          # Immutable reviewed StarterQueue revision. Update deliberately after reviewing upstream changes.
          ref: 6122489847298e2c612387d478fd339463a1857d
          path: .starterqueue

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: .starterqueue/package-lock.json

      - run: npm ci
        working-directory: .starterqueue

      - run: npm run build
        working-directory: .starterqueue

      - name: Audit starter queue
        working-directory: .starterqueue
        env:
          GH_TOKEN: ${{ github.token }}
        run: node dist/src/cli.js audit "${{ github.repository }}" --fail-on fail
```

---

## JSON output contract

`--json` is intended for automation, so its top-level format is versioned.

```json
{
  "schema_version": 1,
  "repository": "owner/repo",
  "configuration": {
    "label": "good first issue",
    "stale_days": 90,
    "fail_on": "none"
  },
  "summary": {
    "total": 3,
    "pass": 1,
    "warn": 1,
    "fail": 1
  },
  "results": []
}
```

Breaking changes to the machine-readable top-level contract require a `schema_version` bump. New additive fields may be introduced within the same schema version when they do not invalidate existing consumers.

---

## Example output

```text
StarterQueue — Repository Audit

PASS  #412  Fix authentication typo
FAIL  #397  Update installation guide
      SQ001: Issue is already assigned
FAIL  #355  Improve cache handling
      SQ004: Open pull request https://github.com/example/project/pull/421 is registered by GitHub as closing this issue
FAIL  #330  Add usage statistics administration UI
      SQ006: Issue is blocked by 1 open GitHub issue dependency
WARN  #275  Refresh CSS documentation
      SQ009: Milestone "v0.4" is past due (due 2026-10-01)
WARN  #301  Add example for foo()
      SQ003: No activity for 94 days

Queue health: 1/6 clean · 2 warning · 3 failing
```

---

## API behavior and request cost

StarterQueue keeps correctness ahead of cleverness:

- The open starter-issue queue is fetched through GitHub REST.
- With `GH_TOKEN`, `SQ004` uses GitHub GraphQL `closedByPullRequestsReferences` in batches of 25 issues.
- Only **open** pull requests from that structured closing relationship count for `SQ004`.
- Generic issue/PR mentions and merged PR references are intentionally ignored; an open issue remains authoritative even if an old merged PR mentions it.
- If authenticated GraphQL data is missing or paginated beyond the supported bound, StarterQueue exits with code `1` rather than guessing.
- Without `GH_TOKEN`, StarterQueue skips `SQ004` and continues with the remaining rules.

This is intentionally conservative: a missed optional signal is preferable to a false accusation that a starter issue is already taken.

---

## Design principles

StarterQueue intentionally stays small and boring in the best way:

- **Read-only** — it audits; it does not relabel or modify repository issues.
- **Objective first** — rules are based on verifiable GitHub state, not subjective “difficulty” scoring.
- **Low API overhead** — reuse or batch GitHub responses whenever correctness allows it.
- **Explainable output** — every failure or warning has a stable `SQ###` rule code.
- **Automation-friendly** — human text, versioned JSON, and distinct CI exit codes serve different consumers cleanly.
- **Reproducible** — dependency versions are locked and CI installs with `npm ci`.

---

## Scope

StarterQueue is intentionally focused on whether a starter issue is **actually available and ready to be picked up**.

Future work may cover:

- simpler distribution through a package or dedicated GitHub Action;
- repository-specific queue policies;
- additional objective forms of starter-queue rot when real-world false passes justify them.

New rules should stay narrow, testable, and evidence-based.

---

## Contributing

Issues and pull requests are welcome. If you propose a new audit rule, prefer a concrete GitHub state or real-world false-pass example that StarterQueue can verify deterministically.

---

## License

Released under the [MIT License](LICENSE).
