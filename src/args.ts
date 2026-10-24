import { DEFAULT_STALE_DAYS, DEFAULT_STARTER_LABEL } from "./config.js";

export type FailOn = "none" | "fail" | "warn";

export interface AuditCliOptions {
  json: boolean;
  label: string;
  staleDays: number;
  failOn: FailOn;
}

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

export function parseAuditOptions(args: string[]): AuditCliOptions {
  let json = false;
  let label = DEFAULT_STARTER_LABEL;
  let staleDays = DEFAULT_STALE_DAYS;
  let failOn: FailOn = "none";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--label") {
      label = optionValue(args, index, arg).trim();
      if (!label) throw new Error("--label cannot be empty");
      index += 1;
      continue;
    }

    if (arg === "--stale-days") {
      const value = optionValue(args, index, arg);
      if (!/^[1-9]\d*$/.test(value)) {
        throw new Error("--stale-days must be a positive integer");
      }
      staleDays = Number(value);
      index += 1;
      continue;
    }

    if (arg === "--fail-on") {
      const value = optionValue(args, index, arg);
      if (value !== "none" && value !== "fail" && value !== "warn") {
        throw new Error("--fail-on must be one of: 'none', 'fail', or 'warn'");
      }
      failOn = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return { json, label, staleDays, failOn };
}
