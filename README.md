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
- an open pull request already referencing the issue;
- explicit text saying the issue is not ready for contributors;
- GitHub reporting that the issue is blocked by open dependencies.

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

### Rule notes

**`SQ004` — open pull request references**  
Uses GitHub timeline cross-reference events. It catches open pull requests that reference the issue, including normal PR-to-issue references. Manually connected relationships that do not produce a cross-reference event are not guaranteed to be detected yet.

**`SQ005` — explicit not-ready language**  
Intentionally narrow. It only catches explicit wording such as `not ready for contribution` or `not ready for contributions`. StarterQueue does not perform subjective language scoring or infer readiness from arbitrary prose.

**`SQ006` — GitHub issue dependencies**  
Uses GitHub's structured issue dependency summary. If GitHub reports that an issue is currently blocked by one or more other issues, StarterQueue fails it without parsing `Blocked by ...` text or making an additional API request.

---

## Quick start

### Requirements

- Node.js **20 or newer**
- npm
- Optional: `GH_TOKEN` for a higher GitHub API rate limit

### Run locally

```bash
npm install
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
> Set `GH_TOKEN` when auditing repositories with several starter issues. StarterQueue reads issue timelines to detect open pull request references, so authenticated requests are much less likely to hit GitHub's rate limit.

---

## Customize the audit

StarterQueue defaults to:

| Setting | Default |
| :--- | :--- |
| Starter label | `good first issue` |
| Inactivity threshold | `90` days |

Override either value from the CLI:

```bash
node dist/src/cli.js audit owner/repo --label "starter task"
node dist/src/cli.js audit owner/repo --stale-days 45
node dist/src/cli.js audit owner/repo --label "starter task" --stale-days 45
```

`--stale-days` must be a positive integer. The selected label and stale threshold are also included in `--json` output.

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
WARN  #301  Add example for foo()
      SQ003: No activity for 94 days

Queue health: 1/5 clean · 1 warning · 3 failing
```

---

## Design principles

StarterQueue intentionally stays small and boring in the best way:

- **Read-only** — it audits; it does not relabel or modify repository issues.
- **Objective first** — rules are based on verifiable GitHub state, not subjective “difficulty” scoring.
- **Low API overhead** — new checks should reuse existing GitHub responses whenever possible.
- **Explainable output** — every failure or warning has a stable `SQ###` rule code.
- **Repository-friendly** — text output works for humans; JSON output works for automation.

---

## Scope

StarterQueue is intentionally focused on whether a starter issue is **actually available and ready to be picked up**.

Future rules may cover:

- missing reproduction or implementation context;
- repository-specific queue policies;
- more complete detection of manually linked work;
- additional objective forms of starter-queue rot.

New rules should stay narrow, testable, and evidence-based.

---

## Contributing

Issues and pull requests are welcome. If you propose a new audit rule, prefer a concrete GitHub state or real-world false-pass example that StarterQueue can verify deterministically.

---

## License

Released under the [MIT License](LICENSE).
