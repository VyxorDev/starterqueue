import type { AuditedIssue } from "./types.js";

export type IssueFilter = "all" | "fail" | "warn" | "pass";

const FILTERS: IssueFilter[] = ["all", "fail", "warn", "pass"];

export function nextIssueFilter(current: IssueFilter): IssueFilter {
  return FILTERS[(FILTERS.indexOf(current) + 1) % FILTERS.length];
}

export function sanitizeTerminalText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
}

export function truncateText(value: string, width: number): string {
  if (width <= 0) return "";
  const chars = Array.from(sanitizeTerminalText(value));
  if (chars.length <= width) return chars.join("");
  return chars.slice(0, Math.max(0, width - 1)).join("") + "…";
}

export function visibleResults(
  results: AuditedIssue[],
  filter: IssueFilter,
  search: string,
): AuditedIssue[] {
  const needle = search.trim().toLowerCase();
  const rank = { fail: 0, warn: 1, pass: 2 };
  return results
    .filter((result) => {
      if (filter !== "all" && result.status !== filter) return false;
      if (!needle) return true;
      return [
        String(result.issue.number),
        result.issue.title,
        ...result.findings.flatMap((finding) => [finding.code, finding.message]),
      ].some((part) => part.toLowerCase().includes(needle));
    })
    .sort((left, right) => rank[left.status] - rank[right.status] || left.issue.number - right.issue.number);
}

export function visibleWindow(selected: number, total: number, rows: number): { start: number; end: number } {
  const count = Math.max(1, rows);
  const start = Math.min(Math.max(0, selected - Math.floor(count / 2)), Math.max(0, total - count));
  return { start, end: Math.min(total, start + count) };
}

export function emptyResultsMessage(
  total: number,
  filter: IssueFilter,
  search: string,
): { title: string; hint: string } {
  if (total === 0) {
    return {
      title: "No open starter issues found",
      hint: "No open 'good first issue' tickets in this repo. Press R for a new audit.",
    };
  }
  if (search.trim()) {
    return {
      title: "No search matches",
      hint: "Press X to clear search, or F to change the severity filter.",
    };
  }
  if (filter !== "all") {
    return {
      title: "No " + filter.toUpperCase() + " issues",
      hint: "Press F to switch to another severity filter.",
    };
  }
  return { title: "Nothing to show", hint: "Press R to start another audit." };
}

export function availableContentRows(height: number, usedRows: number, reservedRows = 0): number {
  // One terminal row is deliberately unused to avoid triggering auto-scroll.
  // The two final rows are reserved for the footer divider and shortcuts.
  return Math.max(0, height - 3 - usedRows - reservedRows);
}

export function wrapTerminalText(value: string, width: number): string[] {
  if (width <= 0) return [];
  const clean = sanitizeTerminalText(value);
  if (!clean) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of clean.split(" ")) {
    const remaining = Array.from(word);
    while (remaining.length > 0) {
      const room = width - (current ? Array.from(current).length + 1 : 0);
      if (room < remaining.length && current) {
        lines.push(current);
        current = "";
      } else if (remaining.length <= room) {
        current += (current ? " " : "") + remaining.join("");
        remaining.length = 0;
      } else {
        lines.push(remaining.splice(0, width).join(""));
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function safeGitHubIssueUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    if (!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9]\d*$/.test(url.pathname)) return null;
    if (url.username || url.password) return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}
