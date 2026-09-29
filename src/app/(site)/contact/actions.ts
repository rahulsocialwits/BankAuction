"use server";

import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";

export async function submitContactLead(formData: FormData) {
  const name = formData.get("name");
  const email = formData.get("email");
  const phone = formData.get("phone");
  const message = formData.get("message");

  if (typeof name !== "string" || !name.trim()) {
    redirect("/contact?error=1");
  }

  await prisma.lead.create({
    data: {
      name: name.trim(),
      email: typeof email === "string" && email.trim() ? email.trim() : null,
      phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
      message: typeof message === "string" && message.trim() ? message.trim() : null,
    },
  });

  redirect("/contact?sent=1");
}
