import assert from "node:assert/strict";
import test from "node:test";
import { parseAuditOptions } from "../src/args.js";

test("audit options use StarterQueue defaults", () => {
  assert.deepEqual(parseAuditOptions([]), {
    json: false,
    label: "good first issue",
    staleDays: 90,
    failOn: "none",
  });
});

test("audit options accept custom label, stale threshold, and CI threshold", () => {
  assert.deepEqual(
    parseAuditOptions([
      "--json",
      "--label",
      "starter task",
      "--stale-days",
      "45",
      "--fail-on",
      "warn",
    ]),
    {
      json: true,
      label: "starter task",
      staleDays: 45,
      failOn: "warn",
    },
  );
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
    /either 'fail' or 'warn'/,
  );
});

test("audit options reject unknown flags", () => {
  assert.throws(
    () => parseAuditOptions(["--mystery"]),
    /Unknown option/,
  );
});
