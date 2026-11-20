import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// MongoDB Atlas connection via MONGODB_URL environment variable.
// Connection pooling is handled by the MongoDB driver internally;
// no connection_limit query param is needed (unlike Supabase pgBouncer).
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
