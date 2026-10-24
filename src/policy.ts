import type { FindingLevel } from "./types.js";

export type AuditPolicy = "balanced" | "strict";
export type AuditRuleCode =
  | "SQ001"
  | "SQ002"
  | "SQ003"
  | "SQ004"
  | "SQ005"
  | "SQ006"
  | "SQ007"
  | "SQ008"
  | "SQ009";
export type RuleLevelOverrides = Partial<Record<AuditRuleCode, FindingLevel>>;

export const DEFAULT_AUDIT_POLICY: AuditPolicy = "balanced";

export const AUDIT_RULE_CODES: readonly AuditRuleCode[] = [
  "SQ001",
  "SQ002",
  "SQ003",
  "SQ004",
  "SQ005",
  "SQ006",
  "SQ007",
  "SQ008",
  "SQ009",
];

const BALANCED_LEVELS: Record<AuditRuleCode, FindingLevel> = {
  SQ001: "warn",
  SQ002: "fail",
  SQ003: "warn",
  SQ004: "fail",
  SQ005: "fail",
  SQ006: "warn",
  SQ007: "fail",
  SQ008: "fail",
  SQ009: "warn",
};

const STRICT_LEVELS: Record<AuditRuleCode, FindingLevel> = {
  ...BALANCED_LEVELS,
  SQ001: "fail",
  SQ006: "fail",
};

export function isAuditRuleCode(value: string): value is AuditRuleCode {
  return AUDIT_RULE_CODES.includes(value as AuditRuleCode);
}

export function findingLevel(
  code: AuditRuleCode,
  policy: AuditPolicy,
  overrides: RuleLevelOverrides = {},
): FindingLevel {
  return overrides[code] ?? (policy === "strict" ? STRICT_LEVELS[code] : BALANCED_LEVELS[code]);
}
