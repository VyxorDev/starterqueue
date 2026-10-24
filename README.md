<div align="center">

# StarterQueue

### Keep your `good first issue` queue honest.

StarterQueue is a small, read-only CLI and GitHub Action that audits starter issues and flags verifiable signals that a ticket may no longer be ready for a newcomer.

[![CI](https://github.com/VyxorDev/starterqueue/actions/workflows/ci.yml/badge.svg)](https://github.com/VyxorDev/starterqueue/actions/workflows/ci.yml)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-VyxorDev%2Fstarterqueue-181717?logo=github)](https://github.com/VyxorDev/starterqueue)

</div>

---

## Why StarterQueue?

A `good first issue` label can stay attached long after an issue stops being a good first issue.

StarterQueue checks for **objective queue-rot signals** such as:

- an issue already being assigned;
- a blocker or waiting label;
- long inactivity;
- an open pull request that GitHub marks as closing the issue;
- explicit text saying the issue is not ready for contributors;
- GitHub reporting that the issue is blocked by open dependencies;
- a locked issue conversation;
- a closed or overdue milestone.

The goal is deliberately narrow: **detect verifiable GitHub state without pretending every signal means the issue is definitely unusable or “too hard.”** StarterQueue separates detection from severity through audit policies and optional per-rule severity overrides.

---

## Audit policies

StarterQueue has two built-in severity policies:

- **`balanced`** — the default. Strong contradictions fail, while assignment and issue dependencies warn because repository policies differ.
- **`strict`** — preserves the v0.2.x treatment where assignment and issue dependencies also fail.

The detected facts do not change between policies. Only their severity changes.

Starting with v0.4.0, a repository can also override individual rule severities. The selected policy establishes the baseline, and an explicit per-rule override wins for that rule. For example, a project can keep `balanced` but make overdue milestones (`SQ009`) fail, or use `strict` while softening assignment (`SQ001`) back to a warning.

## Audit rules

| Rule | What StarterQueue detects | Balanced | Strict |
| :--- | :--- | :---: | :---: |
| `SQ001` | Issue already has an assignee | ⚠️ Warning | ❌ Fail |
| `SQ002` | Issue has a blocked/waiting label | ❌ Fail | ❌ Fail |
| `SQ003` | No activity for the configured threshold — 90 days by default | ⚠️ Warning | ⚠️ Warning |
| `SQ004` | An open pull request is registered by GitHub as closing the issue | ❌ Fail | ❌ Fail |
| `SQ005` | Issue text explicitly says it is not ready for contribution(s) | ❌ Fail | ❌ Fail |
| `SQ006` | GitHub reports one or more open issue dependencies blocking it | ⚠️ Warning | ❌ Fail |
| `SQ007` | Issue conversation is locked | ❌ Fail | ❌ Fail |
| `SQ008` | Issue belongs to a closed milestone | ❌ Fail | ❌ Fail |
| `SQ009` | An open milestone is past its due date | ⚠️ Warning | ⚠️ Warning |

### Rule notes

**`SQ001` — already assigned**  
Assignment is objective, but repositories differ on what it means. In `balanced` mode StarterQueue warns rather than assuming the issue is unavailable. Use `strict` if your repository treats assignment as exclusive ownership.

**`SQ004` — open closing pull request**  
Uses GitHub GraphQL's structured `closedByPullRequestsReferences` relation. A normal mention such as `Part of #123`, `Follows #123`, or a PR that explicitly leaves work for the issue does **not** count. This avoids treating incidental cross-references as proof that the issue is already being solved. `SQ004` requires `GH_TOKEN`; tokenless runs skip this rule and print a notice to stderr.

**`SQ005` — explicit not-ready language**  
Intentionally narrow. It only catches explicit wording such as `not ready for contribution` or `not ready for contributions`. StarterQueue does not perform subjective language scoring or infer readiness from arbitrary prose.

**`SQ006` — GitHub issue dependencies**  
Uses GitHub's structured issue dependency summary. A dependency is a useful readiness signal, but some repositories allow parallel work before the dependency is resolved. It warns in `balanced` mode and fails in `strict` mode.

**`SQ007` — locked conversations**  
Uses the issue's existing `locked` field. A locked starter issue fails because a newcomer cannot use the normal issue conversation to ask questions or coordinate work.

**`SQ008` and `SQ009` — milestone state**  
Use GitHub's existing milestone fields. Closed milestones fail with `SQ008`; explicitly open milestones whose due date has passed warn with `SQ009`. Closed milestones do not also receive the overdue warning.

---

## Quick start

### GitHub Action

For v0.4.0, the normal way to run StarterQueue in CI is a single Action step:

```yaml
permissions:
  contents: read
  issues: read
  pull-requests: read

steps:
  - name: Audit starter queue
    uses: VyxorDev/starterqueue@v0.4.0
```

The Action audits the current workflow repository by default, uses the workflow token automatically for that same-repository audit, and fails when it finds a `FAIL` result. It installs StarterQueue from the repository lockfile, builds it, and runs the same audit engine as the CLI. No repository checkout or npm commands are required in the consuming workflow.

For cross-repository audits, pass an explicit `token` when authenticated checks such as `SQ004` are required.

For production workflows, prefer a reviewed release tag or immutable commit SHA instead of a floating branch.

### Action inputs

| Input | Default | Description |
| :--- | :--- | :--- |
| `repository` | current workflow repository | Repository to audit in `owner/repo` form |
| `token` | automatic workflow token for same-repository audits | Explicit GitHub token for cross-repository authenticated requests and `SQ004` |
| `label` | `good first issue` | Starter issue label to audit |
| `stale-days` | `90` | Days without activity before `SQ003` warns |
| `policy` | `balanced` | Baseline severity policy: `balanced` or `strict` |
| `rule-levels` | empty | Comma-separated per-rule overrides, e.g. `SQ001=fail,SQ009=fail` |
| `fail-on` | `fail` | Failure threshold: `none`, `fail`, or `warn` |
| `json` | `false` | Print versioned JSON instead of human-readable text |

A ready-to-copy scheduled workflow is available at [`examples/starterqueue.yml`](examples/starterqueue.yml).

### Run locally

Requirements:

- Node.js **20 or newer**
- npm
- Optional but recommended: `GH_TOKEN` for authenticated GitHub requests and `SQ004`

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

To restore the stricter v0.2.x severity behavior:

```bash
node dist/src/cli.js audit owner/repo --policy strict
```

To override one rule without inventing a whole new policy:

```bash
node dist/src/cli.js audit owner/repo --policy balanced --rule-level SQ009=fail
node dist/src/cli.js audit owner/repo --policy strict --rule-level SQ001=warn
```

> [!TIP]
> Set `GH_TOKEN` for the complete CLI audit. Authenticated runs batch GitHub's structured closing-PR relationship through GraphQL. If GitHub returns incomplete closing-PR data, StarterQueue exits with a tool error instead of silently producing a false-clean audit. Without a token, all other rules still run, but `SQ004` is skipped.

---

## Customize the audit

StarterQueue defaults to:

| Setting | CLI default | Action default |
| :--- | :--- | :--- |
| Starter label | `good first issue` | `good first issue` |
| Inactivity threshold | `90` days | `90` days |
| Audit policy | `balanced` | `balanced` |
| Per-rule overrides | none | none |
| CI failure threshold | disabled | `fail` |

Override values from the CLI:

```bash
node dist/src/cli.js audit owner/repo --label "starter task"
node dist/src/cli.js audit owner/repo --stale-days 45
node dist/src/cli.js audit owner/repo --policy strict
node dist/src/cli.js audit owner/repo --rule-level SQ009=fail
node dist/src/cli.js audit owner/repo --rule-level SQ001=fail --rule-level SQ009=fail
node dist/src/cli.js audit owner/repo --label "starter task" --stale-days 45 --policy strict
```

`--stale-days` must be a positive integer. `--policy` must be `balanced` or `strict`. `--rule-level` is repeatable and must use an existing rule code (`SQ001`–`SQ009`) with `warn` or `fail`. Rule codes are case-insensitive. If the same rule is overridden more than once, the last value wins.

For the Action, pass the corresponding `with:` inputs. Multiple rule overrides use a comma-separated `rule-levels` value:

```yaml
- uses: VyxorDev/starterqueue@v0.4.0
  with:
    label: starter task
    stale-days: '45'
    policy: balanced
    rule-levels: SQ001=fail,SQ009=fail
    fail-on: warn
```

Per-rule settings change **severity only**. They do not disable a rule, alter the GitHub facts StarterQueue detects, or turn a non-finding into a finding.

---

## CI behavior

By default, the CLI reports findings without making the process fail. Add `--fail-on` when you want it to act as a CI gate.

```bash
# Exit 2 when at least one FAIL finding exists.
node dist/src/cli.js audit owner/repo --fail-on fail

# Exit 2 when at least one WARN or FAIL finding exists.
node dist/src/cli.js audit owner/repo --fail-on warn

# Explicitly disable gating.
node dist/src/cli.js audit owner/repo --fail-on none
```

The GitHub Action defaults to `policy: balanced` and `fail-on: fail`. That means an issue that is only assigned (`SQ001`) or only dependency-blocked (`SQ006`) is reported as a warning without failing the job. Set `policy: strict` to make those signals failures as they were in v0.2.x, or use per-rule overrides when only selected rules need different severity.

### Exit codes

| Code | Meaning |
| :---: | :--- |
| `0` | Audit completed and the selected threshold was not violated |
| `1` | StarterQueue could not complete because of CLI, configuration, or GitHub API errors |
| `2` | Audit completed successfully, but findings violated `--fail-on` |

Keeping tool failures separate from audit failures makes CI logs and automation easier to reason about.

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
    "policy": "balanced",
    "rule_levels": {
      "SQ009": "fail"
    },
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

`configuration.rule_levels` contains only explicit overrides. An empty object means all severities come directly from the selected policy.

Breaking changes to the machine-readable top-level contract require a `schema_version` bump. New additive fields may be introduced within the same schema version when they do not invalidate existing consumers.

---

## Example output

With the default `balanced` policy:

```text
StarterQueue — Repository Audit

PASS  #412  Fix authentication typo
WARN  #397  Update installation guide
      SQ001: Issue is already assigned
FAIL  #355  Improve cache handling
      SQ004: Open pull request https://github.com/example/project/pull/421 is linked to close this issue
WARN  #330  Add usage statistics administration UI
      SQ006: Issue is blocked by 1 open GitHub issue dependency
WARN  #275  Refresh CSS documentation
      SQ009: Milestone "v0.4" is past due (due 2026-10-01)
WARN  #301  Add example for foo()
      SQ003: No activity for 94 days

Queue health: 1/6 clean · 4 warning · 1 failing
```

---

## API behavior and request cost

StarterQueue keeps correctness ahead of cleverness:

- The open starter-issue queue is fetched through GitHub REST at 100 results per page until GitHub returns the final page; there is no fixed 1,000-response ceiling.
- Transient network failures, HTTP `429`, and common GitHub `5xx` responses are retried up to three attempts with bounded backoff. Permanent client errors still fail immediately.
- With `GH_TOKEN`, `SQ004` uses GitHub GraphQL `closedByPullRequestsReferences` in batches of 25 issues.
- Only **open** pull requests from that structured closing relationship count for `SQ004`.
- Generic issue/PR mentions and merged PR references are intentionally ignored; an open issue remains authoritative even if an old merged PR mentions it.
- If authenticated GraphQL data is missing or paginated beyond the supported bound, StarterQueue exits with code `1` rather than guessing.
- Without `GH_TOKEN`, StarterQueue skips `SQ004` and continues with the remaining rules.

This is intentionally conservative: temporary API instability is retried, but incomplete or permanently failed data is never presented as a clean audit.

---

## Design principles

StarterQueue intentionally stays small and boring in the best way:

- **Read-only** — it audits; it does not relabel or modify repository issues.
- **Objective first** — rules are based on verifiable GitHub state, not subjective “difficulty” scoring.
- **Detection before judgment** — facts are detected consistently, while policies and explicit overrides control how signals are ranked.
- **Low API overhead** — reuse or batch GitHub responses whenever correctness allows it.
- **Explainable output** — every failure or warning has a stable `SQ###` rule code.
- **Automation-friendly** — human text, versioned JSON, distinct CI exit codes, and a reusable GitHub Action serve different consumers cleanly.
- **Reproducible** — dependency versions are locked and CI installs with `npm ci`.

---

## Scope

StarterQueue is intentionally focused on whether a starter issue shows evidence that it may not be **available and ready to be picked up**.

Future work may cover:

- additional objective forms of starter-queue rot when real-world false passes justify them;
- smarter interpretation of strong signals such as whether a closing pull request is active or abandoned, when GitHub exposes enough objective evidence to do so safely;
- a prebuilt Action runtime if real usage shows startup time matters.

New rules should stay narrow, testable, and evidence-based.

---

## Contributing

Issues and pull requests are welcome. If you propose a new audit rule, prefer a concrete GitHub state or real-world false-pass example that StarterQueue can verify deterministically.

---

## License

Released under the [MIT License](LICENSE).
