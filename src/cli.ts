#!/usr/bin/env node

import { parseAuditOptions } from "./args.js";
import { auditIssues } from "./audit.js";
import { auditExitCode, EXIT_TOOL_ERROR } from "./exit.js";
import { fetchStarterIssues, parseRepo } from "./github.js";
import { createJsonOutput, summarizeAudit } from "./output.js";
import type { AuditedIssue } from "./types.js";

function usage(): string {
  return [
    "StarterQueue",
    "",
    "Usage:",
    "  starterqueue audit <owner/repo> [--json] [--label <name>] [--stale-days <days>] [--fail-on <fail|warn>]",
    "",
    "Options:",
    "  --json                 Print machine-readable JSON output",
    "  --label <name>         Starter issue label to audit (default: good first issue)",
    "  --stale-days <days>    Days without activity before SQ003 warns (default: 90)",
    "  --fail-on <fail|warn>  Exit 2 when findings meet the selected severity threshold",
    "",
    "Exit codes:",
    "  0  Audit completed and the selected threshold was not violated",
    "  1  StarterQueue could not complete because of CLI, config, or GitHub API errors",
    "  2  Audit completed but findings violated --fail-on",
    "",
    "Environment:",
    "  GH_TOKEN  Enables authenticated requests and SQ004 closing-PR detection",
  ].join("\n");
}

function printText(results: AuditedIssue[], label: string): void {
  console.log("StarterQueue — Repository Audit\n");

  if (results.length === 0) {
    console.log(`No open issues labelled '${label}' were found.`);
    return;
  }

  for (const result of results) {
    const status = result.status.toUpperCase().padEnd(4);
    console.log(`${status}  #${result.issue.number}  ${result.issue.title}`);
    for (const finding of result.findings) {
      console.log(`      ${finding.code}: ${finding.message}`);
    }
    console.log(`      ${result.issue.html_url}`);
  }

  const summary = summarizeAudit(results);
  console.log(`\nQueue health: ${summary.pass}/${summary.total} clean · ${summary.warn} warning · ${summary.fail} failing`);
}

async function main(): Promise<void> {
  const [, , command, repoInput, ...rest] = process.argv;

  if (command !== "audit" || !repoInput) {
    console.error(usage());
    process.exitCode = EXIT_TOOL_ERROR;
    return;
  }

  const options = parseAuditOptions(rest);
  const repo = parseRepo(repoInput);
  const token = process.env.GH_TOKEN;

  if (!token) {
    console.error("starterqueue: GH_TOKEN is not set; SQ004 closing pull request detection is skipped.");
  }

  const issues = await fetchStarterIssues(repo, { label: options.label, token });
  const results = auditIssues(issues, new Date(), { staleDays: options.staleDays });

  if (options.json) {
    console.log(JSON.stringify(
      createJsonOutput(`${repo.owner}/${repo.name}`, options, results),
      null,
      2,
    ));
  } else {
    printText(results, options.label);
  }

  process.exitCode = auditExitCode(results, options.failOn);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`starterqueue: ${message}`);
  process.exitCode = EXIT_TOOL_ERROR;
});
