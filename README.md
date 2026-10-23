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
- an open or merged pull request already referencing the issue;
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
| `SQ004` | An open pull request references the issue | ❌ Fail |
| `SQ005` | Issue text explicitly says it is not ready for contribution(s) | ❌ Fail |
| `SQ006` | GitHub reports one or more open issue dependencies blocking it | ❌ Fail |
| `SQ007` | Issue conversation is locked | ❌ Fail |
| `SQ008` | Issue belongs to a closed milestone | ❌ Fail |
| `SQ009` | An open milestone is past its due date | ⚠️ Warning |
| `SQ010` | A merged pull request still references the open issue | ❌ Fail |

### Rule notes

**`SQ004` — open pull request references**  
Uses GitHub cross-reference events. It catches open pull requests that reference the issue, including normal PR-to-issue references. Manually connected relationships that do not produce a cross-reference event are not guaranteed to be detected yet.

**`SQ005` — explicit not-ready language**  
Intentionally narrow. It only catches explicit wording such as `not ready for contribution` or `not ready for contributions`. StarterQueue does not perform subjective language scoring or infer readiness from arbitrary prose.

**`SQ006` — GitHub issue dependencies**  
Uses GitHub's structured issue dependency summary. If GitHub reports that an issue is currently blocked by one or more other issues, StarterQueue fails it without parsing `Blocked by ...` text or making an additional API request.

**`SQ007` — locked conversations**  
Uses the issue's existing `locked` field. A locked starter issue is treated as unavailable because a newcomer cannot use the normal issue conversation to ask questions or coordinate work.

**`SQ008` and `SQ009` — milestone state**  
Use GitHub's existing milestone fields. Closed milestones fail with `SQ008`; explicitly open milestones whose due date has passed warn with `SQ009`. Closed milestones do not also receive the overdue warning.

**`SQ010` — merged pull request references**  
Uses the same cross-reference data as `SQ004`. Only pull requests with GitHub merge metadata are counted; closed-but-unmerged pull requests are ignored.

---

## Quick start

### Requirements

- Node.js **20 or newer**
- npm
- Optional: `GH_TOKEN` for authenticated GitHub requests and batched cross-reference lookups

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
> Set `GH_TOKEN` when auditing repositories with several starter issues. Authenticated runs batch pull-request cross-reference lookups through GitHub GraphQL when possible. If GraphQL is unavailable, incomplete, or cannot fully reveal a cross-reference source under the token's repository scope, StarterQueue safely falls back to the REST timeline endpoint for that issue. Tokenless runs continue to use REST.

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
          ref: 3f8cee64f040216de0df99b40d8246b5a03df7db
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
      SQ004: Open pull request https://github.com/example/project/pull/421 references this issue
FAIL  #330  Add usage statistics administration UI
      SQ006: Issue is blocked by 1 open GitHub issue dependency
FAIL  #290  Clean up legacy starter task
      SQ010: Merged pull request https://github.com/example/project/pull/444 still references this open issue
WARN  #275  Refresh CSS documentation
      SQ009: Milestone "v0.4" is past due (due 2026-10-01)
WARN  #301  Add example for foo()
      SQ003: No activity for 94 days

Queue health: 1/7 clean · 2 warning · 4 failing
```

---

## API behavior and request cost

StarterQueue keeps correctness ahead of cleverness:

- The issue queue itself is fetched through GitHub REST.
- With `GH_TOKEN`, cross-reference lookups are batched through GraphQL in small groups.
- A failed GraphQL batch only falls back for issues from that batch; results from earlier successful batches are retained.
- If an issue has no usable node ID, its cross-reference timeline exceeds the batched page, or GraphQL cannot fully resolve a cross-reference source under the current token, StarterQueue falls back to the REST timeline endpoint for that issue.
- Without a token, StarterQueue stays on the REST path.

This reduces request count for normal authenticated CI runs without removing the simpler public REST fallback or sacrificing cross-reference correctness.

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
- more complete detection of manually linked work;
- additional objective forms of starter-queue rot when real-world false passes justify them.

New rules should stay narrow, testable, and evidence-based.

---

## Contributing

Issues and pull requests are welcome. If you propose a new audit rule, prefer a concrete GitHub state or real-world false-pass example that StarterQueue can verify deterministically.

---

## License

Released under the [MIT License](LICENSE).
