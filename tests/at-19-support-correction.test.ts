/**
 * AT-19 — Support tickets and correction history (WP16.4, WP16.5).
 *
 * Source-only tests; no DB needed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20261117030000_support_tickets/migration.sql", "utf8");
const supportPage = readFileSync("src/app/admin/(shell)/support/page.tsx", "utf8");
const supportDetail = readFileSync("src/app/admin/(shell)/support/[id]/page.tsx", "utf8");
const historyPage = readFileSync("src/app/admin/(shell)/properties/[id]/history/page.tsx", "utf8");
const propertyPage = readFileSync("src/app/(site)/property/[slug]/page.tsx", "utf8");
const propertyActions = readFileSync("src/app/(site)/property/[slug]/actions.ts", "utf8");

describe("AT-19: SupportTicket model", () => {
  it("SupportTicket model defined in schema", () => {
    assert.match(schema, /model SupportTicket/);
  });
  it("TicketStatus enum defined with OPEN/IN_REVIEW/RESOLVED/CLOSED", () => {
    assert.match(schema, /enum TicketStatus/);
    assert.match(schema, /OPEN/);
    assert.match(schema, /IN_REVIEW/);
    assert.match(schema, /RESOLVED/);
    assert.match(schema, /CLOSED/);
  });
  it("SupportTicket has propertyId FK", () => {
    assert.match(schema, /propertyId.*String/);
  });
  it("SupportTicket has firstResponseAt for SLA tracking", () => {
    assert.match(schema, /firstResponseAt/);
  });
  it("migration SQL creates support_tickets table", () => {
    assert.match(migration, /CREATE TABLE.*support_tickets/s);
    assert.match(migration, /TicketStatus/);
  });
  it("Property model has supportTickets relation", () => {
    assert.match(schema, /supportTickets.*SupportTicket/);
  });
});

describe("AT-19: Admin support queue", () => {
  it("admin support page filters by status", () => {
    assert.match(supportPage, /statusFilter/);
    assert.match(supportPage, /TicketStatus/);
  });
  it("shows open count prominently", () => {
    assert.match(supportPage, /openCount/);
  });
  it("paginates tickets", () => {
    assert.match(supportPage, /PAGE_SIZE/);
    assert.match(supportPage, /skip.*page|page.*skip/s);
  });
  it("links to ticket detail", () => {
    assert.match(supportPage, /admin\/support.*id/);
  });
  it("admin ticket detail has status update form", () => {
    assert.match(supportDetail, /updateStatus/);
    assert.match(supportDetail, /RESOLVED|CLOSED/);
  });
  it("ticket detail records firstResponseAt on first non-OPEN status change", () => {
    assert.match(supportDetail, /firstResponseAt/);
  });
  it("ticket detail writes audit log entry", () => {
    assert.match(supportDetail, /writeAuditLog/);
    assert.match(supportDetail, /support_ticket.status_change/);
  });
});

describe("AT-19: Report error on property page", () => {
  it("property page imports reportPropertyError action", () => {
    assert.match(propertyPage, /reportPropertyError/);
  });
  it("shows success message when ?reported=1", () => {
    assert.match(propertyPage, /reported/);
    assert.match(propertyPage, /Thank you/);
  });
  it("form has subject select and body textarea", () => {
    assert.match(propertyPage, /name="subject"/);
    assert.match(propertyPage, /name="body"/);
  });
  it("action creates SupportTicket in DB", () => {
    assert.match(propertyActions, /prisma.supportTicket.create/);
  });
  it("action redirects to ?reported=1 on success", () => {
    assert.match(propertyActions, /reported=1/);
  });
  it("action silently rejects if subject missing/too long", () => {
    assert.match(propertyActions, /subject.length > 200|!subject/);
  });
});

describe("AT-19: Correction history (PropertyChange)", () => {
  it("history page reads PropertyChange records for a property", () => {
    assert.match(historyPage, /propertyChange.findMany|PropertyChange/);
    assert.match(historyPage, /propertyId.*id|where.*propertyId/s);
  });
  it("shows field, old value, new value, source, timestamp", () => {
    assert.match(historyPage, /field/);
    assert.match(historyPage, /oldValue/);
    assert.match(historyPage, /newValue/);
    assert.match(historyPage, /detectedAt/);
  });
  it("links back to property edit page", () => {
    assert.match(historyPage, /admin\/properties.*edit|edit.*admin\/properties/s);
  });
});
