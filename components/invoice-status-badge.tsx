/**
 * @file components/invoice-status-badge.tsx
 * @description Status Pill Badge Component
 * 
 * Visual indicator for invoice lifecycle states (`DRAFT`, `SENT`, `PAID`, `OVERDUE`)
 * with distinct accessible colors, borders, and Lucide icons.
 */

import { Send, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';

interface InvoiceStatusBadgeProps {
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | string;
  size?: 'sm' | 'md';
}

export default function InvoiceStatusBadge({ status, size = 'sm' }: InvoiceStatusBadgeProps) {
  const normalized = status.toUpperCase();

  const sizeClasses = size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  switch (normalized) {
    case 'PAID':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 ${sizeClasses}`}
        >
          <CheckCircle2 className={`${iconSize} text-emerald-600`} />
          <span>PAID</span>
        </span>
      );
    case 'OVERDUE':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-rose-50 text-rose-700 border border-rose-200 ${sizeClasses}`}
        >
          <AlertTriangle className={`${iconSize} text-rose-600`} />
          <span>OVERDUE</span>
        </span>
      );
    case 'SENT':
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200 ${sizeClasses}`}
        >
          <Send className={`${iconSize} text-blue-600`} />
          <span>SENT</span>
        </span>
      );
    case 'DRAFT':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-200 ${sizeClasses}`}
        >
          <FileText className={`${iconSize} text-slate-500`} />
          <span>DRAFT</span>
        </span>
      );
  }
}
