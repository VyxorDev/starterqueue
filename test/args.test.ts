import assert from "node:assert/strict";
import test from "node:test";
import { parseAuditOptions } from "../src/args.js";

test("audit options use StarterQueue defaults", () => {
  assert.deepEqual(parseAuditOptions([]), {
    json: false,
    label: "good first issue",
    staleDays: 90,
    failOn: "none",
    policy: "balanced",
  });
});

test("audit options accept custom label, stale threshold, policy, and CI threshold", () => {
  assert.deepEqual(
    parseAuditOptions([
      "--json",
      "--label",
      "starter task",
      "--stale-days",
      "45",
      "--policy",
      "strict",
      "--fail-on",
      "warn",
    ]),
    {
      json: true,
      label: "starter task",
      staleDays: 45,
      failOn: "warn",
      policy: "strict",
    },
  );
});

test("audit options accept an explicit disabled CI threshold", () => {
  assert.equal(parseAuditOptions(["--fail-on", "none"]).failOn, "none");
});

test("audit options reject invalid stale thresholds", () => {
  assert.throws(
    () => parseAuditOptions(["--stale-days", "0"]),
    /positive integer/,
  );
});

test("audit options reject invalid CI thresholds", () => {
  assert.throws(
    () => parseAuditOptions(["--fail-on", "error"]),
    /one of: 'none', 'fail', or 'warn'/,
  );
});

test("audit options reject invalid policies", () => {
  assert.throws(
    () => parseAuditOptions(["--policy", "aggressive"]),
    /either 'balanced' or 'strict'/,
  );
});

test("audit options reject unknown flags", () => {
  assert.throws(
    () => parseAuditOptions(["--mystery"]),
    /Unknown option/,
  );
});
