"use server";

import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";

export async function submitPropertyLead(formData: FormData) {
  const propertyId = formData.get("propertyId");
  const slug = formData.get("slug");
  const name = formData.get("name");
  const email = formData.get("email");
  const phone = formData.get("phone");
  const message = formData.get("message");

  if (typeof propertyId !== "string" || typeof slug !== "string" || typeof name !== "string" || !name.trim()) {
    redirect(`/property/${slug}?leadError=1`);
  }

  await prisma.lead.create({
    data: {
      propertyId,
      name: name.trim(),
      email: typeof email === "string" && email.trim() ? email.trim() : null,
      phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
      message: typeof message === "string" && message.trim() ? message.trim() : null,
    },
  });

  redirect(`/property/${slug}?leadSent=1`);
}
