/**
 * @file lib/prisma.ts
 * @description Global Prisma Client Singleton
 * 
 * Prevents PostgreSQL connection pool exhaustion during Next.js Hot Module Replacement (HMR)
 * in development environments by binding the Prisma client to `globalThis`.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
