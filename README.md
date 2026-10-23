# StarterQueue

**Keep your `good first issue` queue honest.**

StarterQueue is a small CLI for maintainers who use GitHub's `good first issue` label. It audits those issues and flags tickets that are no longer genuinely ready for a newcomer.

## MVP rules

| Rule | Meaning | Result |
| --- | --- | --- |
| `SQ001` | Issue already has an assignee | Fail |
| `SQ002` | Issue has a blocked/waiting label | Fail |
| `SQ003` | No activity for 90+ days | Warning |

The goal is not to guess whether an issue is easy. The goal is to catch objective queue rot first.

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

Set `GH_TOKEN` if you want a higher GitHub API rate limit.

## Example

```text
StarterQueue — Repository Audit

PASS  #412  Fix authentication typo
FAIL  #397  Update installation guide
      SQ001: Issue is already assigned
WARN  #301  Add example for foo()
      SQ003: No activity for 94 days

Queue health: 1/3 clean · 1 warning · 1 failing
```

## Scope

This first version intentionally stays narrow. Future rules may detect linked open pull requests, missing reproduction/context, or repository-specific queue policies—but only after the objective checks are solid.

## License

MIT
