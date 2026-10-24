# Changelog

All notable changes to StarterQueue are documented here.

## [0.5.0] - 2026-10-24

StarterQueue v0.5.0 introduces a keyboard-first interactive terminal UI while preserving the existing scriptable CLI and GitHub Action.

### Added

- Running `starterqueue` without arguments in a real terminal now opens a full-screen interactive UI.
- A minimal Obsidian / Silver / Frost Blue welcome screen accepts `owner/repo` or a GitHub repository URL.
- Live audit progress, PASS/WARN/FAIL totals, a searchable and filterable results explorer, and scrollable issue findings.
- Keyboard navigation: arrow keys and Enter, `F` to cycle severity filters, `/` to search, `O` to open the selected issue in a browser, `R` for a new audit, `Esc` to go back, and `Ctrl+C` to exit.
- Responsive compact terminal layouts, a visible shortcut footer, help navigation, a resize fallback for Windows terminals, and a `NO_COLOR` fallback.
- Graceful cancellation of in-flight GitHub requests when exiting the interactive UI.
- Regression tests for terminal layout, filtering, empty states, input sanitization, browser URL validation, cancellation, and non-interactive CLI compatibility.

### Compatibility

- `starterqueue audit owner/repo` remains the supported non-interactive command for scripts and CI, including `--json`, `--policy`, `--rule-level`, and `--fail-on`.
- Running `starterqueue` without arguments in a non-TTY environment reports usage and exits with a tool error instead of launching a terminal UI.
- Audit detection rules `SQ001`–`SQ009`, default severity policy, exit codes, JSON `schema_version: 1`, and the GitHub Action remain unchanged.
- `GH_TOKEN` is still required for `SQ004` closing-PR detection; other rules can run without it.
- No new runtime dependencies. StarterQueue remains read-only.

## [0.4.0] - 2026-10-24

StarterQueue v0.4.0 adds repository-specific severity tuning without changing any detection rule.

### Added

- Repeatable CLI overrides with `--rule-level SQ###=warn|fail`.
- A `rule-levels` GitHub Action input for comma-separated overrides such as `SQ001=fail,SQ009=fail`.
- JSON output now records explicit overrides in `configuration.rule_levels` while retaining `schema_version: 1`.
- Regression coverage for override parsing, policy precedence, JSON output, and the local Action path.

### Behavior

- The selected `balanced` or `strict` policy still establishes the baseline severity for every rule.
- Explicit per-rule overrides take precedence over that policy.
- Repeated CLI overrides are allowed; the last value for a rule wins.
- Only existing rules `SQ001` through `SQ009` and levels `warn` or `fail` are accepted.
- Detection logic remains unchanged: overrides only change how an already-detected fact is classified.

### Examples

```bash
starterqueue audit owner/repo --policy balanced --rule-level SQ009=fail
starterqueue audit owner/repo --policy strict --rule-level SQ001=warn
```

```yaml
- uses: VyxorDev/starterqueue@v0.4.0
  with:
    policy: balanced
    rule-levels: SQ001=fail,SQ009=fail
```

### Compatibility

- Existing users who do not configure overrides keep the v0.3.0 behavior.
- Audit rules `SQ001`–`SQ009`, exit codes, and `--fail-on` semantics are unchanged.
- `configuration.rule_levels` is additive, so JSON `schema_version` remains `1`.
- StarterQueue remains read-only.

## [0.3.0] - 2026-10-24

StarterQueue v0.3.0 separates factual detection from severity judgment so ambiguous readiness signals do not automatically count as hard failures.

### Added

- New audit policies exposed through `--policy balanced|strict` in the CLI and the `policy` GitHub Action input.
- `balanced` is now the default policy.
- `strict` preserves the previous hard-fail treatment for assignment and issue dependencies.
- JSON output now records the selected policy in `configuration.policy` while retaining `schema_version: 1`.
- GitHub REST and GraphQL requests now retry transient network failures, HTTP `429`, and common `5xx` responses up to three attempts with bounded backoff.

### Changed

- Under the default `balanced` policy, `SQ001` (already assigned) is a warning instead of a failure.
- Under the default `balanced` policy, `SQ006` (blocked by another GitHub issue dependency) is a warning instead of a failure.
- Strong contradiction signals keep their existing severities: `SQ002`, `SQ004`, `SQ005`, `SQ007`, and `SQ008` remain failures; `SQ003` and `SQ009` remain warnings.
- GitHub Action users who need the previous gating behavior can set `policy: strict`.
- Starter-issue REST pagination now continues until GitHub returns the final page instead of stopping after ten pages, removing the previous silent 1,000-response ceiling.
- Permanent client errors still fail immediately, and authenticated incomplete GraphQL closing-PR data still fails closed rather than producing a partial audit.

### Why

Real-world validation across public starter queues showed that assignment and issue dependencies are useful facts, but their meaning depends on repository policy. A contributor may still be allowed to work on an assigned issue, and some dependency-linked work can begin in parallel. StarterQueue now reports those facts without treating them as universally unusable starter issues.

Large or temporarily unstable GitHub queues should also be audited completely and predictably, so v0.3.0 removes the fixed REST page limit and adds bounded retries for transient API failures.

### Compatibility

- Detection rules `SQ001`–`SQ009` are unchanged; only policy-driven severity resolution changes.
- `strict` mode restores the v0.2.x severity behavior for `SQ001` and `SQ006`.
- Exit codes and `--fail-on` semantics are unchanged.
- StarterQueue remains read-only.

## [0.2.1] - 2026-10-24

StarterQueue v0.2.1 fixes two correctness gaps found during real-world validation without changing any audit rule semantics.

### Fixed

- The CLI now accepts an explicit `--fail-on none`, matching the existing `FailOn` type and default behavior.
- CLI help now documents `none`, `fail`, and `warn` consistently.
- The GitHub Action now automatically uses `${{ github.token }}` when auditing the current workflow repository and no explicit `token` input is provided, so authenticated `SQ004` closing-PR detection is not silently skipped in the common same-repository case.
- Cross-repository audits still require an explicit token when authenticated access is needed; the Action does not force the current repository token onto a different target repository.
- CI now exercises the Action's automatic current-repository token fallback.

### Compatibility

- Audit rules `SQ001`–`SQ009`, default severities, exit codes, and JSON `schema_version: 1` are unchanged.
- StarterQueue remains read-only.

## [0.2.0] - 2026-10-23

StarterQueue v0.2.0 adds a first-class reusable GitHub Action while preserving the existing CLI and audit semantics.

### Added

- Root `action.yml` metadata so StarterQueue can be invoked directly from GitHub Actions workflows.
- Action inputs for `repository`, `token`, `label`, `stale-days`, `fail-on`, and `json`.
- A local Action smoke test in CI that exercises `uses: ./` against the real StarterQueue audit path.

### Changed

- The recommended GitHub Actions setup is now a single `uses: VyxorDev/starterqueue@v0.2.0` step instead of manually checking out, installing, building, and invoking the CLI.
- The Action defaults to auditing the current workflow repository and to failing the job on `FAIL` findings unless configured otherwise.
- Action dependency installation explicitly includes development dependencies so the TypeScript build still works when a caller sets `NODE_ENV=production`.

### Compatibility

- The CLI, audit rules (`SQ001`–`SQ009`), exit-code contract, and JSON `schema_version: 1` remain unchanged from v0.1.0.
- StarterQueue remains read-only. The recommended authenticated workflow uses read-only `contents`, `issues`, and `pull-requests` permissions.

## [0.1.0] - 2026-10-23

StarterQueue's first public release.

### Added

- Read-only GitHub starter-issue auditing for `good first issue` queues.
- Nine objective audit rules (`SQ001`–`SQ009`) covering assignment, blocker labels, inactivity, open closing pull requests, explicit not-ready language, issue dependencies, locked conversations, closed milestones, and overdue milestones.
- Human-readable terminal output and versioned JSON output with `schema_version: 1`.
- Configurable starter label and inactivity threshold via `--label` and `--stale-days`.
- CI gating with `--fail-on fail|warn` and distinct exit codes for tool errors versus audit findings.
- GitHub Actions usage example with a read-only `GITHUB_TOKEN`/`GH_TOKEN` flow.
- Reproducible npm installs with `package-lock.json` and `npm ci`.
- Publish-safe package metadata, `prepack` build support, and packaged CLI smoke testing.

### Changed

- `SQ004` now uses GitHub's structured closing-pull-request relationship instead of generic issue/PR cross-references.
- Authenticated `SQ004` checks use GraphQL batching; tokenless runs skip `SQ004` rather than guessing from ambiguous references.
- Missing issue node IDs, missing returned GraphQL issue nodes, and more than 100 closing-PR references fail authenticated `SQ004` as a tool error instead of producing a false-clean result.
- Null or incomplete closing-PR reference nodes are skipped, so `SQ004` may not report the pull requests they represent.

### Removed

- `SQ010` was retired after real-world validation showed that a merged PR can mention an open starter issue without actually resolving it.

### Validation

The release was field-tested against public starter queues including Symfony, Kestra, and three.ws, and the resulting false-positive discovery directly informed the final `SQ004` semantics.
