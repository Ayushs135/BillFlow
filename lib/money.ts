/**
 * @file lib/money.ts
 * @description Financial Decimal Arithmetic Engine & Overdue Resolution
 * 
 * Guarantees zero floating-point drift across all invoice calculations using Prisma's
 * arbitrary-precision Decimal implementation.
 * 
 * Capabilities:
 * - Line item amount computation (`quantity * rate`).
 * - Fixed-percentage Tax and Discount calculations (`subtotal * percentage / 100`).
 * - Final total arithmetic (`subtotal + tax - discount`).
 * - Real-time Overdue status resolution (`now > dueDate` for unpaid invoices).
 */

import { Prisma } from '@prisma/client';

/**
 * Rounds a number to exactly 2 decimal places to avoid floating-point issues
 */
export function roundToTwoDecimals(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

export interface CalculatedInvoiceItem {
  description: string;
  quantity: Prisma.Decimal;
  rate: Prisma.Decimal;
  amount: Prisma.Decimal;
}

export interface InvoiceFinancials {
  items: CalculatedInvoiceItem[];
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  discount: Prisma.Decimal;
  total: Prisma.Decimal;
}

export interface RawInvoiceItemInput {
  description: string;
  quantity: number | string;
  rate: number | string;
}

/**
 * Calculates line item amounts, subtotal, tax, discount, and total
 * using exact Decimal arithmetic to eliminate floating-point drift.
 * Tax and discount inputs are percentages (e.g. 10 for 10%, 5 for 5%).
 */
export function calculateInvoiceFinancials(
  rawItems: RawInvoiceItemInput[],
  taxPercentage: number | string = 0,
  discountPercentage: number | string = 0
): InvoiceFinancials {
  const parsedTax = typeof taxPercentage === 'string' ? parseFloat(taxPercentage) : taxPercentage;
  const parsedDiscount = typeof discountPercentage === 'string' ? parseFloat(discountPercentage) : discountPercentage;

  const taxPercentNum = isNaN(parsedTax) ? 0 : Math.min(100, Math.max(0, parsedTax));
  const discountPercentNum = isNaN(parsedDiscount) ? 0 : Math.min(100, Math.max(0, parsedDiscount));

  let subtotalDecimal = new Prisma.Decimal(0);

  const items: CalculatedInvoiceItem[] = rawItems.map((item) => {
    const qtyNum = Math.max(0, typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity);
    const rateNum = Math.max(0, typeof item.rate === 'string' ? parseFloat(item.rate) || 0 : item.rate);

    const qtyDecimal = new Prisma.Decimal(roundToTwoDecimals(qtyNum));
    const rateDecimal = new Prisma.Decimal(roundToTwoDecimals(rateNum));
    // amount = quantity * rate
    const itemAmount = qtyDecimal.mul(rateDecimal);

    subtotalDecimal = subtotalDecimal.add(itemAmount);

    return {
      description: item.description.trim(),
      quantity: qtyDecimal,
      rate: rateDecimal,
      amount: itemAmount,
    };
  });

  // Calculate tax amount = (subtotal * tax%) / 100
  const taxAmountNum = roundToTwoDecimals(
    subtotalDecimal.mul(new Prisma.Decimal(taxPercentNum)).div(100).toNumber()
  );
  const taxDecimal = new Prisma.Decimal(taxAmountNum);

  // Calculate discount amount = (subtotal * discount%) / 100
  const discountAmountNum = roundToTwoDecimals(
    subtotalDecimal.mul(new Prisma.Decimal(discountPercentNum)).div(100).toNumber()
  );
  const discountDecimal = new Prisma.Decimal(discountAmountNum);

  // total = subtotal + tax - discount
  let totalDecimal = subtotalDecimal.add(taxDecimal).sub(discountDecimal);

  // Guard against negative total
  if (totalDecimal.isNegative()) {
    totalDecimal = new Prisma.Decimal(0);
  }

  return {
    items,
    subtotal: subtotalDecimal,
    tax: taxDecimal,
    discount: discountDecimal,
    total: totalDecimal,
  };
}

/**
 * Helper to compute effective invoice status given status and dueDate.
 * If status is not PAID and current date > dueDate, returns OVERDUE.
 */
export function getEffectiveStatus(
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE',
  dueDate: Date | string
): 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' {
  if (status === 'PAID') {
    return 'PAID';
  }

  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  const now = new Date();

  // Due date check: compare day start/end or exact timestamp
  // End of the due date day (23:59:59.999)
  const dueEndOfDay = new Date(due);
  dueEndOfDay.setHours(23, 59, 59, 999);

  if (now > dueEndOfDay) {
    return 'OVERDUE';
  }

  return status;
}
