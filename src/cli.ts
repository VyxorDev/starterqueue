#!/usr/bin/env node

import { parseAuditOptions } from "./args.js";
import { auditIssues } from "./audit.js";
import { fetchStarterIssues, parseRepo } from "./github.js";
import type { AuditedIssue } from "./types.js";

function usage(): string {
  return [
    "StarterQueue",
    "",
    "Usage:",
    "  starterqueue audit <owner/repo> [--json] [--label <name>] [--stale-days <days>]",
    "",
    "Options:",
    "  --json                 Print machine-readable JSON output",
    "  --label <name>         Starter issue label to audit (default: good first issue)",
    "  --stale-days <days>    Days without activity before SQ003 warns (default: 90)",
    "",
    "Environment:",
    "  GH_TOKEN  Optional GitHub token for a higher API rate limit",
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

  const pass = results.filter((result) => result.status === "pass").length;
  const warn = results.filter((result) => result.status === "warn").length;
  const fail = results.filter((result) => result.status === "fail").length;

  console.log(`\nQueue health: ${pass}/${results.length} clean · ${warn} warning · ${fail} failing`);
}

async function main(): Promise<void> {
  const [, , command, repoInput, ...rest] = process.argv;

  if (command !== "audit" || !repoInput) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const options = parseAuditOptions(rest);
  const repo = parseRepo(repoInput);
  const issues = await fetchStarterIssues(repo, { label: options.label });
  const results = auditIssues(issues, new Date(), { staleDays: options.staleDays });

  if (options.json) {
    console.log(JSON.stringify({
      repository: `${repo.owner}/${repo.name}`,
      configuration: {
        label: options.label,
        stale_days: options.staleDays,
      },
      results,
    }, null, 2));
    return;
  }

  printText(results, options.label);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`starterqueue: ${message}`);
  process.exitCode = 1;
});
