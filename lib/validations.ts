/**
 * @file lib/validations.ts
 * @description Central Zod Validation Schemas
 * 
 * Defines strict input validation, type inference, and bounds-checking rules for:
 * - Authentication (Sign Up & Login)
 * - Client Management (CRUD)
 * - Business Settings & Branding (Prefix, Currency, Logo data URLs)
 * - Invoice Lifecycle (Creation, Itemization, Percentage Tax/Discount bounds, Due Dates)
 */

import { z } from 'zod';

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Please enter a valid email address').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const clientSchema = z.object({
  name: z.string().trim().min(1, 'Client name is required'),
  email: z.string().trim().email('Please enter a valid email address').or(z.literal('')).nullable().optional(),
  company: z.string().trim().max(100).or(z.literal('')).nullable().optional(),
  address: z.string().trim().max(300).or(z.literal('')).nullable().optional(),
  phone: z.string().trim().max(30).or(z.literal('')).nullable().optional(),
});

export const settingsSchema = z.object({
  businessName: z.string().trim().max(100).or(z.literal('')).nullable().optional(),
  currency: z.string().trim().min(2).max(5).default('USD'),
  invoicePrefix: z.string().trim().min(1, 'Invoice prefix is required').max(10, 'Prefix too long').default('INV-'),
  logoUrl: z.string().trim().or(z.literal('')).nullable().optional(),
});

export const invoiceItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().trim().min(1, 'Item description is required'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  rate: z.coerce.number().min(0, 'Rate cannot be negative'),
});

export const createInvoiceSchema = z.object({
  clientId: z.string().min(1, 'Please select a valid client'),
  invoiceNumber: z.string().trim().min(1, 'Invoice number is required').optional(),
  issueDate: z.coerce.date({ message: 'Invalid issue date' }),
  dueDate: z.coerce.date({ message: 'Invalid due date' }),
  items: z.array(invoiceItemSchema).min(1, 'At least one line item is required'),
  tax: z.coerce
    .number({ message: 'Tax percentage must be a valid number' })
    .min(0, 'Tax percentage cannot be negative')
    .max(100, 'Tax percentage cannot exceed 100%')
    .default(0),
  discount: z.coerce
    .number({ message: 'Discount percentage must be a valid number' })
    .min(0, 'Discount percentage cannot be negative')
    .max(100, 'Discount percentage cannot exceed 100%')
    .default(0),
  notes: z.string().trim().max(2000).or(z.literal('')).nullable().optional(),
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE']).default('DRAFT'),
}).refine((data) => {
  const issue = new Date(data.issueDate);
  const due = new Date(data.dueDate);
  // Compare without milliseconds/time differences if same day
  issue.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due >= issue;
}, {
  message: 'Due date cannot be before issue date',
  path: ['dueDate'],
});

export const updateInvoiceSchema = z.object({
  clientId: z.string().min(1, 'Please select a valid client'),
  invoiceNumber: z.string().trim().min(1, 'Invoice number is required'),
  issueDate: z.coerce.date({ message: 'Invalid issue date' }),
  dueDate: z.coerce.date({ message: 'Invalid due date' }),
  items: z.array(invoiceItemSchema).min(1, 'At least one line item is required'),
  tax: z.coerce
    .number({ message: 'Tax percentage must be a valid number' })
    .min(0, 'Tax percentage cannot be negative')
    .max(100, 'Tax percentage cannot exceed 100%')
    .default(0),
  discount: z.coerce
    .number({ message: 'Discount percentage must be a valid number' })
    .min(0, 'Discount percentage cannot be negative')
    .max(100, 'Discount percentage cannot exceed 100%')
    .default(0),
  notes: z.string().trim().max(2000).or(z.literal('')).nullable().optional(),
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE']).default('DRAFT'),
}).refine((data) => {
  const issue = new Date(data.issueDate);
  const due = new Date(data.dueDate);
  issue.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due >= issue;
}, {
  message: 'Due date cannot be before issue date',
  path: ['dueDate'],
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ClientInput = z.infer<typeof clientSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
