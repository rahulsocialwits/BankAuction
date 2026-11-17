/**
 * P1.2 structural tests: SourceRunLog schema has the composite index on (source, startedAt)
 * that makes per-source history queries efficient.
 *
 * These are schema-level (file-read) tests: they run without a database or Prisma client.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function readSchema(): string {
  return readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
}

function readMigration(name: string): string {
  return readFileSync(join(root, "prisma", "migrations", name, "migration.sql"), "utf8");
}

test("SourceRunLog: composite index (source, startedAt) declared in schema.prisma", () => {
  const schema = readSchema();
  const model = /model SourceRunLog \{([\s\S]*?)\}/.exec(schema)?.[1] ?? "";
  assert.match(
    model,
    /@@index\(\[source,\s*startedAt\]\)/,
    "SourceRunLog must have @@index([source, startedAt]) for per-source history queries",
  );
});

test("SourceRunLog: startedAt-only index still present (not removed by P1.2)", () => {
  const schema = readSchema();
  const model = /model SourceRunLog \{([\s\S]*?)\}/.exec(schema)?.[1] ?? "";
  assert.match(model, /@@index\(\[startedAt\]\)/, "@@index([startedAt]) must not be removed");
});

test("P1.2 migration: creates composite index on source_run_logs", () => {
  const sql = readMigration("20261116000000_source_run_log_source_index");
  assert.match(sql, /CREATE INDEX/, "migration must CREATE the index");
  assert.match(sql, /source_run_logs/, "index must target source_run_logs table");
  assert.match(sql, /"source"/, 'index must include "source" column');
  assert.match(sql, /"startedAt"/, 'index must include "startedAt" column');
});

test("SourceRunLog: no unique constraint on (source, startedAt) — duplicates are allowed", () => {
  const schema = readSchema();
  const model = /model SourceRunLog \{([\s\S]*?)\}/.exec(schema)?.[1] ?? "";
  assert.doesNotMatch(
    model,
    /@@unique\(\[source,\s*startedAt\]\)/,
    "SourceRunLog must NOT have a unique constraint on (source, startedAt): one source can have many rows",
  );
});
