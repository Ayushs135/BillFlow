/**
 * @file lib/invoice-number.ts
 * @description Concurrency-Safe Sequential Invoice Numbering Engine
 * 
 * Uses PostgreSQL row-level atomic locks via `INSERT ... ON CONFLICT ("userId") DO UPDATE ... RETURNING`
 * on the `invoice_sequences` table.
 * 
 * Guarantees:
 * - Simultaneous requests for the same user queue on the row lock and receive distinct consecutive numbers.
 * - Multi-tenant isolation: independent counters per user (`User A` and `User B` each start at `INV-0001`).
 * - Deleting existing invoices never causes number reuse or collisions.
 * - Custom prefix updates (e.g. `BILL-`) apply cleanly to upcoming invoices without mutating past records.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import prisma from './prisma';

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Finds the highest existing invoice number for a user to initialize sequence safely.
 */
async function getHighestExistingInvoiceNumber(db: DbClient, userId: string): Promise<number> {
  const invoices = await db.invoice.findMany({
    where: { userId },
    select: { invoiceNumber: true },
  });

  let maxNum = 0;
  for (const inv of invoices) {
    const match = inv.invoiceNumber.match(/(\d+)$/);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  return maxNum;
}

/**
 * Atomically reserves the next sequential invoice number for a given user.
 * Uses PostgreSQL row-level atomic INSERT ... ON CONFLICT DO UPDATE ... RETURNING
 * ensuring concurrency safety across simultaneous requests.
 */
export async function reserveNextInvoiceNumber(
  db: DbClient,
  userId: string,
  customPrefix?: string
): Promise<{ sequenceNumber: number; invoiceNumber: string }> {
  // 1. Fetch user's settings to get invoicePrefix if not supplied
  const prefix =
    customPrefix !== undefined
      ? customPrefix
      : (
          await db.settings.findUnique({
            where: { userId },
            select: { invoicePrefix: true },
          })
        )?.invoicePrefix || 'INV-';

  // 2. Check if a sequence record already exists
  const existingSeq = await db.invoiceSequence.findUnique({
    where: { userId },
  });

  let initialBaseNumber = 1;
  if (!existingSeq) {
    // Determine the highest existing invoice number so we don't start at 1 if user already has invoices
    const highestExisting = await getHighestExistingInvoiceNumber(db, userId);
    initialBaseNumber = highestExisting + 1;
  }

  // 3. Atomically upsert and increment using PostgreSQL ON CONFLICT DO UPDATE RETURNING
  // This guarantees that concurrent transactions queue on the row lock and receive distinct numbers.
  const result = await db.$queryRaw<Array<{ reservedNumber: number }>>`
    INSERT INTO "invoice_sequences" ("id", "userId", "nextNumber", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${userId}, ${initialBaseNumber + 1}, NOW(), NOW())
    ON CONFLICT ("userId") DO UPDATE
    SET "nextNumber" = "invoice_sequences"."nextNumber" + 1, "updatedAt" = NOW()
    RETURNING ("invoice_sequences"."nextNumber" - 1)::integer AS "reservedNumber";
  `;

  const reservedNumber = result[0]?.reservedNumber ?? initialBaseNumber;
  const paddedNumber = String(reservedNumber).padStart(4, '0');
  const invoiceNumber = `${prefix}${paddedNumber}`;

  return {
    sequenceNumber: reservedNumber,
    invoiceNumber,
  };
}

/**
 * Peeks the next upcoming invoice number without incrementing the counter.
 * Used for UI form pre-filling.
 */
export async function peekNextInvoiceNumber(userId: string): Promise<string> {
  const settings = await prisma.settings.findUnique({
    where: { userId },
    select: { invoicePrefix: true },
  });

  const prefix = settings?.invoicePrefix?.trim() || 'INV-';

  const sequence = await prisma.invoiceSequence.findUnique({
    where: { userId },
    select: { nextNumber: true },
  });

  let nextNum: number;
  if (sequence) {
    nextNum = sequence.nextNumber;
  } else {
    const highestExisting = await getHighestExistingInvoiceNumber(prisma, userId);
    nextNum = highestExisting + 1;
  }

  const paddedNum = String(nextNum).padStart(4, '0');
  return `${prefix}${paddedNum}`;
}
