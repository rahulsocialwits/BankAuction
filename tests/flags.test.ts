import test from "node:test";
import assert from "node:assert/strict";
import { isFeatureEnabled } from "../src/lib/flags";

const key = "NEXT_PUBLIC_FEATURE_PROPERTY_MAP";

test("feature flags preserve current behaviour when unset or blank", () => {
  const before = process.env[key];
  try {
    delete process.env[key];
    assert.equal(isFeatureEnabled("propertyMap"), true);
    process.env[key] = "  ";
    assert.equal(isFeatureEnabled("propertyMap"), true);
  } finally {
    if (before === undefined) delete process.env[key];
    else process.env[key] = before;
  }
});

test("feature flag can be disabled with common explicit false values", () => {
  const before = process.env[key];
  try {
    for (const value of ["0", "false", "FALSE", "off", "no"]) {
      process.env[key] = value;
      assert.equal(isFeatureEnabled("propertyMap"), false, value);
    }
  } finally {
    if (before === undefined) delete process.env[key];
    else process.env[key] = before;
  }
});

test("feature flag is enabled for explicit non-false values", () => {
  const before = process.env[key];
  try {
    for (const value of ["1", "true", "on", "yes"]) {
      process.env[key] = value;
      assert.equal(isFeatureEnabled("propertyMap"), true, value);
    }
  } finally {
    if (before === undefined) delete process.env[key];
    else process.env[key] = before;
  }
});
