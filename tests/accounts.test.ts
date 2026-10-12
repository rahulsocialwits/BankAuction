import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createResetToken, resetTokenUserId, verifyResetToken } from "../src/lib/auth/resetToken";

process.env.USER_SESSION_SECRET = "test-secret-for-reset-tokens";
const NOW = Date.UTC(2026, 9, 12, 10, 0, 0);

test("a reset link works with the current password hash, until it expires", () => {
  const t = createResetToken("user1", "salt:hashA", 60, NOW);
  assert.equal(resetTokenUserId(t), "user1");
  assert.equal(verifyResetToken(t, "salt:hashA", NOW + 59 * 60_000), true);
  assert.equal(verifyResetToken(t, "salt:hashA", NOW + 61 * 60_000), false, "expired after an hour");
});

test("a reset link stops working once the password changed (single use) and cannot be forged or edited", () => {
  const t = createResetToken("user1", "salt:hashA", 60, NOW);
  assert.equal(verifyResetToken(t, "salt:hashB", NOW + 1000), false, "new password hash: the old link is dead");
  const [id, exp, sig] = t.split(".");
  assert.equal(verifyResetToken(`user2.${exp}.${sig}`, "salt:hashA", NOW + 1000), false, "another user id");
  assert.equal(verifyResetToken(`${id}.${Number(exp) + 999999}.${sig}`, "salt:hashA", NOW + 1000), false, "longer expiry");
  assert.equal(verifyResetToken("garbage", "salt:hashA", NOW), false);
  assert.equal(resetTokenUserId("garbage"), null);
});

test("forgot password: the same answer for every email, a mail only when mail is configured, otherwise an admin request", () => {
  const a = readFileSync("src/app/(site)/forgot-password/actions.ts", "utf8");
  assert.match(a, /redirect\("\/forgot-password\?sent=1"\)/);
  assert.equal((a.match(/redirect\(/g) ?? []).length, 1, "one single redirect: nothing reveals whether an account exists");
  assert.match(a, /mailConfigured\(\)/);
  assert.match(a, /prisma\.lead\.create/);
  const r = readFileSync("src/app/(site)/reset-password/actions.ts", "utf8");
  assert.ok(r.indexOf("verifyResetToken(") < r.indexOf("prisma.user.update"), "the link is verified before the password changes");
  assert.match(r, /password\.length < 8/);
  assert.match(readFileSync("src/app/(site)/login/page.tsx", "utf8"), /forgot-password/);
});

test("saved properties and searches belong to the logged-in user only", () => {
  for (const f of ["src/app/api/saved/route.ts", "src/app/api/saved-searches/route.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /getCurrentUser\(\)/, f);
    assert.match(src, /login_required/, f);
  }
  assert.match(readFileSync("src/app/api/saved-searches/route.ts", "utf8"), /deleteMany\(\{ where: \{ id, userId: user\.id \} \}\)/);
  assert.match(readFileSync("src/app/(site)/my-alerts/page.tsx", "utf8"), /redirect\("\/login\?next=\/my-alerts"\)/);
  assert.match(readFileSync("src/app/(site)/saved-properties/page.tsx", "utf8"), /where: \{ userId: user\.id/);
});

test("admin reset link is master-only", () => {
  const s = readFileSync("src/app/admin/(shell)/users/actions.ts", "utf8");
  const i = s.indexOf("export async function makeResetLink");
  assert.ok(i > 0 && s.slice(i, i + 200).includes("requireMaster()"));
});
