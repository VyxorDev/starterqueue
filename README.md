# StarterQueue

**Keep your `good first issue` queue honest.**

StarterQueue is a small CLI for maintainers who use GitHub's `good first issue` label. It audits those issues and flags tickets that are no longer genuinely ready for a newcomer.

## MVP rules

| Rule | Meaning | Result |
| --- | --- | --- |
| `SQ001` | Issue already has an assignee | Fail |
| `SQ002` | Issue has a blocked/waiting label | Fail |
| `SQ003` | No activity for the configured threshold (90 days by default) | Warning |
| `SQ004` | An open pull request references the issue | Fail |

The goal is not to guess whether an issue is easy. The goal is to catch objective queue rot first.

`SQ004` uses GitHub timeline cross-reference events. It catches open pull requests that reference the issue, including normal PR-to-issue references. Manually connected relationships that do not produce a cross-reference event are not guaranteed to be detected yet.

## Run locally

Requires Node.js 20 or newer.

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

### Customize the audit

StarterQueue defaults to the `good first issue` label and a 90-day inactivity warning. Repositories with different conventions can override either value:

```bash
node dist/src/cli.js audit owner/repo --label "starter task"
node dist/src/cli.js audit owner/repo --stale-days 45
node dist/src/cli.js audit owner/repo --label "starter task" --stale-days 45
```

`--stale-days` must be a positive integer. The selected label and stale threshold are also included in `--json` output.

Set `GH_TOKEN` for a higher GitHub API rate limit. It is strongly recommended for repositories with several starter issues because StarterQueue also reads each issue's timeline to find open PR references.

## Example

```text
StarterQueue — Repository Audit

PASS  #412  Fix authentication typo
FAIL  #397  Update installation guide
      SQ001: Issue is already assigned
FAIL  #355  Improve cache handling
      SQ004: Open pull request https://github.com/example/project/pull/421 references this issue
WARN  #301  Add example for foo()
      SQ003: No activity for 94 days

Queue health: 1/4 clean · 1 warning · 2 failing
```

## Scope

This version stays intentionally narrow and objective. Future rules may cover missing reproduction/context, repository-specific queue policies, and more complete detection of manually linked work—but only after the current checks are solid.

## License

MIT
