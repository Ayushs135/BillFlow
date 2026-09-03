/**
 * @file app/(dashboard)/invoices/[id]/page.tsx
 * @description Authenticated Invoice Detail, Sharing & Management Page
 * 
 * Features:
 * - Printable invoice sheet with business branding and client info.
 * - Shareable public link copy banner.
 * - Vector PDF download and browser printing triggers.
 * - Status transition controls (e.g. "Mark as Sent", "Mark as Paid").
 * - Delete confirmation modal dialog.
 */

'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Send,
  Building2,
  Mail,
  Phone,
  MapPin,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Printer,
  Download,
  Share2,
} from 'lucide-react';
import InvoiceStatusBadge from '@/components/invoice-status-badge';
import { formatCurrency } from '@/lib/currencies';
import { roundToTwoDecimals } from '@/lib/money';
import { buildInvoiceMailData } from '@/lib/invoice-mail';

interface InvoiceDetailProps {
  params: Promise<{ id: string }>;
}

interface InvoiceData {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE';
  effectiveStatus: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE';
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  notes: string | null;
  publicToken: string;
  createdAt: string;
  client: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    address: string | null;
    phone: string | null;
  };
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
  user: {
    name: string;
    email: string;
    settings: {
      businessName: string | null;
      logoUrl: string | null;
      currency: string;
      invoicePrefix: string;
    } | null;
  };
}

export default function InvoiceDetailPage({ params }: InvoiceDetailProps) {
  const { id } = use(params);
  const router = useRouter();

  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    let ignore = false;

    async function loadInvoice() {
      try {
        const res = await fetch(`/api/invoices/${id}`);
        const data = await res.json();

        if (ignore) return;

        if (!res.ok) {
          setError(data.error || 'Invoice not found.');
          setLoading(false);
          return;
        }

        setInvoice(data.invoice);
      } catch {
        if (!ignore) {
          setError('Failed to load invoice details.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadInvoice();

    return () => {
      ignore = true;
    };
  }, [id]);

  const handleStatusChange = async (newStatus: 'SENT' | 'DRAFT') => {
    if (!invoice) return;
    setStatusUpdating(true);
    setError(null);

    try {
      const res = await fetch(`/api/invoices/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to update invoice status.');
        setStatusUpdating(false);
        return;
      }

      setInvoice((prev) => (prev ? { ...prev, ...data.invoice } : null));
      setToastMessage(`Invoice marked as ${newStatus}.`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch {
      setError('An error occurred while updating the invoice.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDeleteInvoice = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to delete invoice.');
        setIsDeleting(false);
        setDeleteModalOpen(false);
        return;
      }

      router.push('/invoices');
      router.refresh();
    } catch {
      setError('An error occurred while deleting the invoice.');
      setIsDeleting(false);
    }
  };

  const handleCopyPublicLink = () => {
    if (!invoice?.publicToken) return;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    const url = baseUrl
      ? `${baseUrl.replace(/\/$/, '')}/invoice/${invoice.publicToken}`
      : `/invoice/${invoice.publicToken}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setToastMessage('Public invoice link copied to clipboard.');
    setTimeout(() => {
      setCopiedLink(false);
      setToastMessage(null);
    }, 3500);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-600">Loading invoice details...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Invoice Not Found</h2>
        <p className="text-sm text-slate-500">{error || 'This invoice does not exist or you do not have permission to view it.'}</p>
        <Link
          href="/invoices"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Invoices</span>
        </Link>
      </div>
    );
  }

  const currency = invoice.user?.settings?.currency || 'USD';
  const businessName = invoice.user?.settings?.businessName || invoice.user?.name || 'BillFlow Invoicing';
  const logoUrl = invoice.user?.settings?.logoUrl;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const publicUrl = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/invoice/${invoice.publicToken}`
    : `/invoice/${invoice.publicToken}`;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const mailData = buildInvoiceMailData({
    invoiceNumber: invoice.invoiceNumber,
    businessName,
    clientEmail: invoice.client?.email,
    publicToken: invoice.publicToken,
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Invoices</span>
        </Link>

        {/* Actions Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {invoice.status === 'DRAFT' && (
            <button
              onClick={() => handleStatusChange('SENT')}
              disabled={statusUpdating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer shadow-xs"
            >
              {statusUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Mark as Sent</span>
            </button>
          )}

          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            download={`invoice-${invoice.invoiceNumber}.pdf`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF</span>
          </a>

          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print</span>
          </button>

          {mailData.hasClientEmail ? (
            <a
              href={mailData.gmailComposeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition shadow-xs"
              title={`Compose email to ${invoice.client.email}`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Mail</span>
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed shadow-xs"
              title="Client email is unavailable."
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Mail</span>
            </button>
          )}

          <Link
            href={`/invoices/${invoice.id}/edit`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition shadow-xs"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </Link>

          <button
            onClick={() => setDeleteModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 text-xs font-semibold hover:bg-rose-50 transition shadow-xs cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Public Sharing Toolbar Card */}
      <div className="bg-white rounded-2xl border border-blue-100 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 bg-gradient-to-r from-blue-50/50 to-indigo-50/30 print:hidden">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="p-2 rounded-xl bg-blue-100 text-blue-700 shrink-0">
            <Share2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-slate-900 block">Public Client Invoice Link</span>
            <span className="text-xs text-slate-500 font-mono truncate block max-w-xs sm:max-w-md">
              {publicUrl}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={handleCopyPublicLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer shadow-2xs"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
          </button>

          {mailData.hasClientEmail ? (
            <a
              href={mailData.gmailComposeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition shadow-2xs"
              title={`Compose email to ${invoice.client.email}`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Mail</span>
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 text-xs font-semibold cursor-not-allowed shadow-2xs"
              title="Client email is unavailable."
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Mail</span>
            </button>
          )}

          <Link
            href={`/invoice/${invoice.publicToken}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition shadow-2xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>View Public</span>
          </Link>
        </div>
      </div>

      {toastMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-emerald-800 text-sm animate-fade-in print:hidden">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Printable / Document Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-12 space-y-8 print:border-0 print:shadow-none print:p-0">
        {/* Invoice Header: Business Info & Invoice ID */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-slate-100 pb-8">
          {/* Business Info */}
          <div className="space-y-2">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Business Logo"
                className="h-12 w-auto max-w-[150px] object-contain rounded mb-2"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            )}
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 uppercase">
              {businessName}
            </h2>
            <p className="text-xs text-slate-500">{invoice.user?.email}</p>
          </div>

          {/* Invoice Meta */}
          <div className="sm:text-right space-y-2">
            <div className="inline-block">
              <InvoiceStatusBadge status={invoice.effectiveStatus} size="md" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-900">
              {invoice.invoiceNumber}
            </div>
            <div className="text-xs text-slate-500 space-y-1">
              <div>
                <span className="font-semibold text-slate-600">Issued:</span> {formatDate(invoice.issueDate)}
              </div>
              <div>
                <span className="font-semibold text-slate-600">Due:</span> {formatDate(invoice.dueDate)}
              </div>
            </div>
          </div>
        </div>

        {/* Bill To Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-100">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Billed To
            </span>
            <div className="font-bold text-slate-900 text-base">{invoice.client.name}</div>
            {invoice.client.company && (
              <div className="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>{invoice.client.company}</span>
              </div>
            )}
            {invoice.client.email && (
              <div className="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>{invoice.client.email}</span>
              </div>
            )}
            {invoice.client.phone && (
              <div className="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{invoice.client.phone}</span>
              </div>
            )}
          </div>

          {invoice.client.address && (
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Billing Address
              </span>
              <div className="text-xs text-slate-600 flex items-start gap-1.5 whitespace-pre-line leading-relaxed">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{invoice.client.address}</span>
              </div>
            </div>
          )}
        </div>

        {/* Line Items Table */}
        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th scope="col" className="py-3 px-2">Description</th>
                  <th scope="col" className="py-3 px-2 text-right">Qty</th>
                  <th scope="col" className="py-3 px-2 text-right">Rate</th>
                  <th scope="col" className="py-3 px-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {invoice.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3.5 px-2 font-medium text-slate-900">{item.description}</td>
                    <td className="py-3.5 px-2 text-right font-mono text-xs text-slate-600">{item.quantity}</td>
                    <td className="py-3.5 px-2 text-right font-mono text-xs text-slate-600">{formatCurrency(item.rate, currency)}</td>
                    <td className="py-3.5 px-2 text-right font-mono text-sm font-semibold text-slate-900">
                      {formatCurrency(item.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Breakdown Grid */}
          <div className="pt-4 flex justify-end">
            <div className="w-full sm:w-72 space-y-2 text-xs text-slate-600">
              <div className="flex justify-between py-1">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900 font-mono text-sm">
                  {formatCurrency(invoice.subtotal, currency)}
                </span>
              </div>
              {invoice.tax > 0 && (
                <div className="flex justify-between py-1">
                  <span>
                    Tax (
                    {invoice.subtotal > 0
                      ? roundToTwoDecimals((invoice.tax / invoice.subtotal) * 100)
                      : 0}
                    %)
                  </span>
                  <span className="font-semibold text-slate-900 font-mono text-sm">
                    +{formatCurrency(invoice.tax, currency)}
                  </span>
                </div>
              )}
              {invoice.discount > 0 && (
                <div className="flex justify-between py-1 text-emerald-700">
                  <span>
                    Discount (
                    {invoice.subtotal > 0
                      ? roundToTwoDecimals((invoice.discount / invoice.subtotal) * 100)
                      : 0}
                    %)
                  </span>
                  <span className="font-semibold font-mono text-sm">
                    -{formatCurrency(invoice.discount, currency)}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-200 flex justify-between text-base font-black text-slate-900">
                <span>Total</span>
                <span className="text-blue-600 font-mono text-lg">
                  {formatCurrency(invoice.total, currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes & Terms */}
        {invoice.notes && (
          <div className="pt-6 border-t border-slate-100 space-y-1.5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Notes & Payment Instructions
            </span>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line bg-slate-50 p-4 rounded-xl border border-slate-100">
              {invoice.notes}
            </p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Delete Invoice?</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Are you sure you want to delete invoice <strong>{invoice.invoiceNumber}</strong> for <strong>{invoice.client.name}</strong>?
                </p>
                <p className="text-xs text-rose-600 mt-2 font-medium">
                  This action cannot be undone and will permanently remove this invoice and its line items.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteInvoice}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-60 transition cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete Invoice</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
