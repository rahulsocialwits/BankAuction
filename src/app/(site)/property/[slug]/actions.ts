"use server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/userSession";
import { redirect } from "next/navigation";

export async function reportPropertyError(slug: string, formData: FormData) {
  const subject = (formData.get("subject") as string | null)?.trim() ?? "";
  const body = (formData.get("body") as string | null)?.trim() ?? "";

  if (!subject || subject.length > 200) return;
  if (!body || body.length > 2000) return;

  const property = await prisma.property.findFirst({
    where: { slug },
    select: { id: true },
  });
  if (!property) return;

  const user = await getCurrentUser().catch(() => null);

  await prisma.supportTicket.create({
    data: {
      propertyId: property.id,
      reporterEmail: user?.email ?? (formData.get("email") as string | null)?.trim() ?? null,
      subject,
      body,
    },
  });

  redirect(`/property/${slug}?reported=1`);
}
