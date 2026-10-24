import { DEFAULT_STALE_DAYS, DEFAULT_STARTER_LABEL } from "./config.js";
import {
  DEFAULT_AUDIT_POLICY,
  isAuditRuleCode,
  type AuditPolicy,
  type AuditRuleCode,
  type RuleLevelOverrides,
} from "./policy.js";
import type { FindingLevel } from "./types.js";

export type FailOn = "none" | "fail" | "warn";

export interface AuditCliOptions {
  json: boolean;
  label: string;
  staleDays: number;
  failOn: FailOn;
  policy: AuditPolicy;
  ruleLevels: RuleLevelOverrides;
}

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseRuleLevel(value: string): { code: AuditRuleCode; level: FindingLevel } {
  const [rawCode, rawLevel, ...extra] = value.split("=");
  const code = rawCode?.trim().toUpperCase() ?? "";
  const level = rawLevel?.trim().toLowerCase() ?? "";

  if (extra.length > 0 || !isAuditRuleCode(code) || (level !== "warn" && level !== "fail")) {
    throw new Error("--rule-level must be in SQ001=warn or SQ001=fail form for SQ001-SQ009");
  }

  return { code, level };
}

export function parseAuditOptions(args: string[]): AuditCliOptions {
  let json = false;
  let label = DEFAULT_STARTER_LABEL;
  let staleDays = DEFAULT_STALE_DAYS;
  let failOn: FailOn = "none";
  let policy: AuditPolicy = DEFAULT_AUDIT_POLICY;
  const ruleLevels: RuleLevelOverrides = {};

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

    if (arg === "--policy") {
      const value = optionValue(args, index, arg);
      if (value !== "balanced" && value !== "strict") {
        throw new Error("--policy must be either 'balanced' or 'strict'");
      }
      policy = value;
      index += 1;
      continue;
    }

    if (arg === "--rule-level") {
      const { code, level } = parseRuleLevel(optionValue(args, index, arg));
      ruleLevels[code] = level;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return { json, label, staleDays, failOn, policy, ruleLevels };
}
