"use server";

import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";

const SUBJECTS = ["General enquiry", "About a property", "List a property / partnership", "Premium plan", "Report a problem"];

const clean = (v: FormDataEntryValue | null, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function submitContactLead(formData: FormData) {
  // Hidden field that only bots fill in: pretend it worked.
  if (clean(formData.get("website"), 50)) redirect("/contact?sent=1");

  const name = clean(formData.get("name"), 80);
  const email = clean(formData.get("email"), 120);
  const phone = clean(formData.get("phone"), 20);
  const subjectRaw = clean(formData.get("subject"), 60);
  const subject = SUBJECTS.includes(subjectRaw) ? subjectRaw : SUBJECTS[0];
  const message = typeof formData.get("message") === "string" ? String(formData.get("message")).trim().slice(0, 2000) : "";

  if (name.length < 2) redirect("/contact?error=name");
  if (!email && !phone) redirect("/contact?error=reach");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) redirect("/contact?error=email");
  if (phone && phone.replace(/\D/g, "").length < 8) redirect("/contact?error=phone");
  if (message.length < 5) redirect("/contact?error=message");

  await prisma.lead.create({
    data: {
      name,
      email: email || null,
      phone: phone || null,
      message: `[${subject}] ${message}`,
    },
  });

  redirect("/contact?sent=1");
}
