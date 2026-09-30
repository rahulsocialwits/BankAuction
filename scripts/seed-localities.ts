import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { prisma } from "@/lib/db/prisma";
import { slugify } from "@/lib/normalization/parsers";

const SEED: Record<string, string[]> = {
  Mumbai: ["Ghatkopar", "Kurla", "Dadar", "Bhandup", "Borivali", "Andheri", "Thane", "Mulund", "Vikhroli", "Powai", "Chembur", "Malad", "Kandivali", "Goregaon", "Bandra", "Worli", "Navi Mumbai"],
  Delhi: ["Dwarka", "Rohini", "Saket", "Karol Bagh", "Janakpuri", "Lajpat Nagar", "Pitampura"],
  Pune: ["Kothrud", "Hinjewadi", "Viman Nagar", "Wakad", "Hadapsar", "Baner", "Pimpri Chinchwad"],
  Bangalore: ["Whitefield", "Koramangala", "Electronic City", "Indiranagar", "HSR Layout", "Jayanagar"],
  Ahmedabad: ["Satellite", "Navrangpura", "Bopal", "Vastrapur", "Maninagar", "Naroda"],
  Surat: ["Adajan", "Vesu", "Katargam", "Varachha", "Piplod", "Udhna"],
};

async function main() {
  let created = 0;
  for (const [city, names] of Object.entries(SEED)) {
    for (const [i, name] of names.entries()) {
      const slug = slugify(name);
      const r = await prisma.locality.upsert({
        where: { city_slug: { city, slug } },
        update: {},
        create: { city, name, slug, sortOrder: i },
      });
      if (r.createdAt.getTime() > Date.now() - 5000) created++;
    }
  }
  console.log(`Seeded localities (${created} new).`);
}

main().finally(() => process.exit(0));
