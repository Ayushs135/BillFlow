/**
 * @file app/invoice/[token]/page.tsx
 * @description Public Client Invoice Portal Page
 * 
 * Features:
 * - Unauthenticated, secure client billing view accessed via unique `publicToken`.
 * - Responsive paper invoice layout with business branding, client info, itemized table, and notes.
 * - Print-friendly CSS (`@media print`) and vector PDF download button.
 * - Interactive demo payment sandbox transitioning status to `PAID`.
 */

'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Printer,
  Download,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Lock,
  Sparkles,
} from 'lucide-react';
import InvoiceStatusBadge from '@/components/invoice-status-badge';
import { formatCurrency } from '@/lib/currencies';
import { roundToTwoDecimals } from '@/lib/money';

interface PublicInvoicePageProps {
  params: Promise<{ token: string }>;
}

interface PublicInvoiceData {
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
  business: {
    name: string;
    email?: string;
    logoUrl?: string | null;
    currency: string;
  };
  client: {
    name: string;
    company?: string | null;
    email: string;
    address?: string | null;
    phone?: string | null;
  };
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
}

export default function PublicInvoicePage({ params }: PublicInvoicePageProps) {
  const { token } = use(params);

  const [invoice, setInvoice] = useState<PublicInvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Payment Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [cardName, setCardName] = useState('Alex Demo');
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/30');
  const [cvv, setCvv] = useState('123');
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadInvoice() {
      try {
        const res = await fetch(`/api/public/invoices/${token}`);
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
          setError('Unable to load invoice. Please check the link and try again.');
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
  }, [token]);

  const handlePrint = () => {
    window.print();
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaying(true);
    setPaymentError(null);

    try {
      const res = await fetch(`/api/public/invoices/${token}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (!res.ok) {
        setPaymentError(data.error || 'Payment failed. Please try again.');
        setPaying(false);
        return;
      }

      // Transition local state to PAID
      setInvoice((prev) =>
        prev
          ? {
              ...prev,
              status: 'PAID',
              effectiveStatus: 'PAID',
            }
          : null
      );

      setPaymentModalOpen(false);
      setPaymentSuccessMessage(`Payment successful! Invoice ${invoice?.invoiceNumber} has been marked as paid.`);
    } catch {
      setPaymentError('An error occurred while communicating with the payment server.');
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center max-w-md w-full">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900">Loading Invoice</h2>
          <p className="text-xs text-slate-500 mt-1">Retrieving secure invoice document...</p>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center max-w-md w-full space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Invoice Not Found</h1>
            <p className="text-sm text-slate-500 mt-1">
              {error || 'This invoice link is invalid, expired, or does not exist.'}
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition"
          >
            Go to BillFlow Home
          </Link>
        </div>
      </div>
    );
  }

  const currency = invoice.business?.currency || 'USD';
  const isPaid = invoice.effectiveStatus === 'PAID';

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 py-8 px-4 sm:px-6 print:bg-white print:p-0">
      {/* Top Floating Action Bar (Hidden during print) */}
      <div className="max-w-4xl mx-auto mb-6 print:hidden">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Left Brand Identity */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-sm">
              BF
            </div>
            <div>
              <span className="font-bold text-slate-900 text-sm">BillFlow Public Portal</span>
              <span className="text-xs text-slate-500 block">Secure payment & invoice view</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            <a
              href={`/api/public/invoices/${token}/pdf`}
              download={`invoice-${invoice.invoiceNumber}.pdf`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </a>

            {!isPaid ? (
              <button
                onClick={() => setPaymentModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition cursor-pointer shadow-xs"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Pay Invoice ({formatCurrency(invoice.total, currency)})</span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Invoice Paid</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {paymentSuccessMessage && (
        <div className="max-w-4xl mx-auto mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-emerald-900 text-sm animate-fade-in print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold">Payment Processed Successfully</div>
              <div className="text-xs text-emerald-700">{paymentSuccessMessage}</div>
            </div>
          </div>
          <button onClick={() => setPaymentSuccessMessage(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Paper Invoice Document Card */}
      <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-8 sm:p-12 space-y-8 print:border-0 print:shadow-none print:p-0">
        {/* Invoice Header: Business & Invoice ID */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-slate-100 pb-8">
          {/* Business Info */}
          <div className="space-y-2">
            {invoice.business.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={invoice.business.logoUrl}
                alt="Business Logo"
                className="h-12 w-auto max-w-[150px] object-contain rounded mb-2"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            )}
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 uppercase">
              {invoice.business.name}
            </h1>
            {invoice.business.email && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>{invoice.business.email}</span>
              </p>
            )}
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
                    <td className="py-3.5 px-2 text-right font-mono text-xs text-slate-600">
                      {formatCurrency(item.rate, currency)}
                    </td>
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
                <span>Total Due</span>
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

        {/* Public Footer */}
        <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div>Generated with BillFlow Invoicing Platform</div>
          <div>Secure 256-bit encrypted invoice portal</div>
        </div>
      </div>

      {/* Simulated Payment Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Simulated Payment</h2>
                  <p className="text-xs text-slate-500">Demo sandbox mode</p>
                </div>
              </div>
              <button
                onClick={() => setPaymentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sandbox Notice */}
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-2.5 text-blue-800 text-xs leading-relaxed">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                <strong>Demo Sandbox:</strong> No real payment gateway is connected. Any dummy card details will securely trigger an atomic status transition to <strong>PAID</strong>.
              </span>
            </div>

            {/* Invoice Payment Amount Summary */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 block">Invoice #{invoice.invoiceNumber}</span>
                <span className="text-xs text-slate-600">{invoice.client.name}</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold text-slate-500 block">Amount Due</span>
                <span className="text-lg font-black font-mono text-slate-900">
                  {formatCurrency(invoice.total, currency)}
                </span>
              </div>
            </div>

            {paymentError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            {/* Simulated Payment Form */}
            <form onSubmit={handlePaySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cardholder Name
                </label>
                <input
                  type="text"
                  required
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Card Number
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                    placeholder="4242 4242 4242 4242"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="text"
                    required
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white text-center"
                    placeholder="MM/YY"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    CVV / CVC
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      maxLength={4}
                      required
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white text-center"
                      placeholder="123"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  disabled={paying}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-60 transition cursor-pointer shadow-sm"
                >
                  {paying ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>Pay {formatCurrency(invoice.total, currency)}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
