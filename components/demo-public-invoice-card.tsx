'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Copy, Check, Share2, Sparkles } from 'lucide-react';
import { formatCurrency } from '@/lib/currencies';

interface DemoPublicInvoiceCardProps {
  invoice: {
    id: string;
    invoiceNumber: string;
    publicToken: string;
    status: string;
    total: number;
    clientName: string;
  } | null;
  currency: string;
}

export default function DemoPublicInvoiceCard({
  invoice,
  currency,
}: DemoPublicInvoiceCardProps) {
  const [copied, setCopied] = useState(false);

  if (!invoice) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-3">
        <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
          <Share2 className="w-4 h-4 text-blue-600" />
          <span>Demo Public Invoice</span>
        </div>
        <p className="text-xs text-slate-500">
          Create an invoice to preview the shareable client view.
        </p>
      </div>
    );
  }

  const publicPath = `/invoice/${invoice.publicToken}`;

  const handleCopyLink = async () => {
    try {
      const fullUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${publicPath}`
          : publicPath;
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="bg-gradient-to-br from-blue-50/80 via-white to-slate-50 rounded-2xl border border-blue-200/80 shadow-xs p-6 space-y-4 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-600 text-white shadow-xs">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Demo Public Invoice</h2>
            <p className="text-2xs text-slate-500">Shareable client preview</p>
          </div>
        </div>

        <span className="px-2 py-0.5 rounded-full text-2xs font-semibold bg-emerald-100 text-emerald-800 font-mono">
          {invoice.invoiceNumber}
        </span>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        See how a client views, downloads, and pays a shared invoice without logging in.
      </p>

      <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-1">
        <div className="flex justify-between items-center text-slate-600">
          <span className="truncate max-w-[140px] font-medium">{invoice.clientName}</span>
          <span className="font-bold text-slate-900 font-mono">
            {formatCurrency(invoice.total, currency)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Link
          href={publicPath}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition shadow-xs cursor-pointer"
        >
          <span>View Public Invoice</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>

        <button
          type="button"
          onClick={handleCopyLink}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition cursor-pointer shadow-xs"
          title="Copy shareable link"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700 font-semibold">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              <span>Copy Link</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
