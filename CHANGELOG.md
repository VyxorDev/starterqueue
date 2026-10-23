# Changelog

All notable changes to StarterQueue are documented here.

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
