import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * Scheduler workflows (tick.yml, scheduler-watchdog.yml). The shell step of each workflow is extracted from the YAML and EXECUTED
 * with a stand-in `curl`, so the tests prove what the job does for each answer (exit code, message, summary), and that the secret
 * is never printed. GitHub scheduling itself cannot be tested here: it stays best-effort.
 */

const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const SECRET = "s3cr3t-VALUE-do-not-print-0123456789";

/** the `run: |` block of the workflow's only step, dedented */
function stepScript(file: string): string {
  const yml = read(file);
  const m = /\n( +)run: \|\n((?:\1 +.*\n|\n)+)/.exec(yml);
  assert.ok(m, `no run block in ${file}`);
  const indent = m![1].length + 2;
  return m![2].split("\n").map((l) => l.slice(indent)).join("\n");
}

/** minutes a 5-field cron minute expression fires on (supports "a,b", "a-b/n", "*\/n") */
function minutesOf(expr: string): number[] {
  const out = new Set<number>();
  for (const part of expr.split(",")) {
    const [range, step] = part.split("/");
    const n = step ? Number(step) : 1;
    let [a, b] = range === "*" ? [0, 59] : range.includes("-") ? range.split("-").map(Number) : [Number(range), step ? 59 : Number(range)];
    for (let m = a; m <= b; m += n) out.add(m);
  }
  return [...out].sort((x, y) => x - y);
}

const dir = mkdtempSync(join(tmpdir(), "wf-"));
const bin = join(dir, "bin");
import { mkdirSync } from "node:fs";
mkdirSync(bin, { recursive: true });
writeFileSync(
  join(bin, "curl"),
  `#!/bin/bash
out=""; while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; *) shift;; esac; done
rc=\${FAKE_RC:-0}
if [ -n "$out" ] && [ "$rc" = "0" ]; then printf '%s' "$FAKE_BODY" > "$out"; fi
if [ "$rc" = "0" ]; then printf '%s' "$FAKE_CODE"; else printf '000'; fi
exit $rc
`,
);
chmodSync(join(bin, "curl"), 0o755);

function run(file: string, fake: { code?: string; body?: string; rc?: number }, env: Record<string, string> = { CRON_SECRET: SECRET }) {
  const work = mkdtempSync(join(dir, "run-"));
  const summary = join(work, "summary.md");
  writeFileSync(summary, "");
  const r = spawnSync("bash", ["-e", "-c", stepScript(file)], {
    cwd: work,
    encoding: "utf8",
    env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_STEP_SUMMARY: summary, FAKE_CODE: fake.code ?? "200", FAKE_BODY: fake.body ?? "", FAKE_RC: String(fake.rc ?? 0), ...env } as NodeJS.ProcessEnv,
  });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const sum = readFileSync(summary, "utf8");
  assert.ok(!out.includes(SECRET) && !sum.includes(SECRET), "the secret must never appear in output or summary");
  return { status: r.status, out, sum };
}

const TICK = ".github/workflows/tick.yml";
const WATCH = ".github/workflows/scheduler-watchdog.yml";

/* ---------- A1: schedules ---------- */

test("tick cron is every 5 minutes but OFF the :00/:05 marks", () => {
  const cron = /cron: "([^"]+)"/.exec(read(TICK))![1];
  const [min, ...rest] = cron.split(" ");
  assert.equal(rest.join(" "), "* * * *");
  const m = minutesOf(min);
  assert.equal(m.length, 12, "still 12 runs an hour");
  assert.deepEqual(m, [3, 8, 13, 18, 23, 28, 33, 38, 43, 48, 53, 58]);
  assert.ok(m.every((x) => x % 5 !== 0), "no run on a multiple of 5");
});

test("watchdog cron is every 15 minutes but OFF the :00/:15/:30/:45 marks", () => {
  const cron = /cron: "([^"]+)"/.exec(read(WATCH))![1];
  const m = minutesOf(cron.split(" ")[0]);
  assert.deepEqual(m, [7, 22, 37, 52]);
  assert.ok(m.every((x) => x % 15 !== 0));
});

test("both workflows keep manual dispatch, no-overlap concurrency and the same secret name", () => {
  for (const f of [TICK, WATCH]) {
    const y = read(f);
    assert.match(y, /workflow_dispatch:/);
    assert.match(y, /cancel-in-progress: false/);
    assert.match(y, /secrets\.CRON_SECRET/);
    assert.doesNotMatch(y, /set -x|echo "?\$CRON_SECRET|\?secret=/, "the secret is never echoed or put in the URL");
  }
  assert.match(read(TICK), /timeout-minutes: 7/);
});

test("the tick still calls the same endpoint with the same limit; the lease and the application code are untouched", () => {
  assert.match(read(TICK), /api\/cron\/ingest\?limit=100/);
  assert.match(read(WATCH), /api\/cron\/health/);
  assert.match(read("src/app/api/cron/ingest/route.ts"), /acquireTickLease\(/);
});

/* ---------- A2: tick behaviour ---------- */

test("TICK: a completed tick (200, ok:true) succeeds", () => {
  const r = run(TICK, { code: "200", body: '{"ok":true,"ms":230000,"result":{}}' });
  assert.equal(r.status, 0);
  assert.match(r.out, /curl exit code: 0, HTTP status: 200/);
  assert.match(r.sum, /Tick completed/);
});

test("TICK: a SKIPPED tick (another trigger had it) is not a failure", () => {
  const r = run(TICK, { code: "200", body: '{"ok":true,"skipped":true,"reason":"a tick just ran","ms":40}' });
  assert.equal(r.status, 0);
  assert.match(r.out, /::notice title=Tick skipped/);
  assert.match(r.sum, /skipped/i);
});

test("TICK: curl timeout (exit 28) fails and says so, with the exit code", () => {
  const r = run(TICK, { rc: 28 });
  assert.equal(r.status, 1);
  assert.match(r.out, /curl exit code: 28/);
  assert.match(r.out, /exit 28/);
  assert.match(r.out, /may still have finished on the server/i);
});

test("TICK: other curl failures (cannot reach the site) fail with the exit code", () => {
  const r = run(TICK, { rc: 7 });
  assert.equal(r.status, 1);
  assert.match(r.out, /curl exit code: 7/);
  assert.match(r.out, /could not reach the site/);
});

test("TICK: HTTP errors fail with a specific message and show the response text", () => {
  const cases: [string, string, RegExp][] = [
    ["401", '{"ok":false,"error":"Unauthorized"}', /does not match the one in Vercel/],
    ["500", '{"ok":false,"error":"boom"}', /tick threw an error or CRON_SECRET is not set/],
    ["504", "gateway timeout", /platform could not run the function/],
    ["418", "teapot", /unexpected answer/],
  ];
  for (const [code, body, msg] of cases) {
    const r = run(TICK, { code, body });
    assert.equal(r.status, 1, code);
    assert.match(r.out, new RegExp(`HTTP status: ${code}`));
    assert.match(r.out, msg);
    assert.ok(r.out.includes(body), "response text is shown");
  }
});

test("TICK: HTTP 200 without ok:true is a failure", () => {
  const r = run(TICK, { code: "200", body: '{"hello":"world"}' });
  assert.equal(r.status, 1);
  assert.match(r.out, /did not contain ok:true/);
});

test("TICK: a missing secret fails before any request is made", () => {
  const r = run(TICK, { code: "200", body: '{"ok":true}' }, { CRON_SECRET: "" });
  assert.equal(r.status, 1);
  assert.match(r.out, /CRON_SECRET repository secret is missing/);
  assert.doesNotMatch(r.out, /curl exit code/);
});

/* ---------- A3: watchdog diagnostics ---------- */

test("WATCHDOG: healthy scheduler passes and reports the age of the last tick", () => {
  const r = run(WATCH, { code: "200", body: '{"ok":true,"state":"ok","late":false,"minutesSinceLastSuccessfulTick":4,"limitMinutes":60}' });
  assert.equal(r.status, 0);
  assert.match(r.out, /last successful tick 4 minute/);
});

test("WATCHDOG: a LATE scheduler (503) fails as SCHEDULER LATE with the minutes", () => {
  const r = run(WATCH, { code: "503", body: '{"ok":false,"state":"late","late":true,"minutesSinceLastSuccessfulTick":217,"limitMinutes":60}' });
  assert.equal(r.status, 1);
  assert.match(r.out, /SCHEDULER LATE: no successful tick for 217 minute/);
  assert.doesNotMatch(r.out, /CONFIGURATION|COULD NOT RUN/);
});

test("WATCHDOG: state 'never' is also reported as late", () => {
  const r = run(WATCH, { code: "503", body: '{"ok":false,"state":"never","late":true,"minutesSinceLastSuccessfulTick":null,"limitMinutes":60}' });
  assert.equal(r.status, 1);
  assert.match(r.out, /SCHEDULER LATE/);
});

test("WATCHDOG: a database error behind a 503 is NOT reported as a late scheduler", () => {
  const r = run(WATCH, { code: "503", body: '{"ok":false,"error":"database unreachable"}' });
  assert.equal(r.status, 1);
  assert.match(r.out, /CHECK COULD NOT RUN: the health endpoint could not read the database/);
  assert.doesNotMatch(r.out, /SCHEDULER LATE/);
});

test("WATCHDOG: configuration errors (401 / 500) are labelled CONFIGURATION", () => {
  const a = run(WATCH, { code: "401", body: '{"ok":false,"error":"Unauthorized"}' });
  assert.equal(a.status, 1);
  assert.match(a.out, /CONFIGURATION: HTTP 401/);
  const b = run(WATCH, { code: "500", body: '{"ok":false,"error":"CRON_SECRET is not set on the server"}' });
  assert.equal(b.status, 1);
  assert.match(b.out, /CONFIGURATION: HTTP 500/);
});

test("WATCHDOG: a network failure is reported as the check not running, never as a late scheduler", () => {
  const r = run(WATCH, { rc: 6 });
  assert.equal(r.status, 1);
  assert.match(r.out, /curl exit code: 6/);
  assert.match(r.out, /CHECK COULD NOT RUN/);
  assert.match(r.out, /nothing about whether the scheduler is late|says nothing about whether the scheduler is late/);
  assert.doesNotMatch(r.out, /SCHEDULER LATE/);
});

test("WATCHDOG: unexpected HTTP codes are labelled as the check not running", () => {
  const r = run(WATCH, { code: "502", body: "bad gateway" });
  assert.equal(r.status, 1);
  assert.match(r.out, /CHECK COULD NOT RUN: unexpected HTTP 502/);
});

test("WATCHDOG: retries transient network errors (reads only), a missing secret fails first", () => {
  assert.match(read(WATCH), /--retry 2 --retry-delay 5 --retry-all-errors/);
  assert.doesNotMatch(read(TICK), /--retry/, "the tick is never retried by the workflow: a retry could start a second tick");
  const r = run(WATCH, { code: "200" }, { CRON_SECRET: "" });
  assert.equal(r.status, 1);
  assert.match(r.out, /CRON_SECRET repository secret is missing/);
});

/* ---------- A4: documentation ---------- */

test("docs/SCHEDULER.md describes the new schedule and says GitHub scheduling is best-effort", () => {
  const d = read("docs/SCHEDULER.md");
  assert.match(d, /3-58\/5 \* \* \* \*/);
  assert.match(d, /7,22,37,52/);
  assert.match(d, /best-effort/i);
  assert.match(d, /Workflow hardening/);
  assert.ok(existsSync(join(root, "docs/SCHEDULER.md")));
});
