/**
 * @file app/(dashboard)/invoices/[id]/edit/page.tsx
 * @description Invoice Editor Page
 * 
 * Features:
 * - Loads existing invoice and line items for editing.
 * - Dynamic line items modification with live Decimal recalculation.
 * - Date validation and tenant client selector.
 * - Atomically submits updates to `PUT /api/invoices/[id]`.
 */

'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Calendar,
  Building2,
  FileText,
  Loader2,
  AlertCircle,
  Save,
} from 'lucide-react';
import { formatCurrency, getCurrencySymbol } from '@/lib/currencies';
import { roundToTwoDecimals } from '@/lib/money';

interface EditInvoiceProps {
  params: Promise<{ id: string }>;
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
  email: string;
}

interface LineItemState {
  id: string;
  description: string;
  quantity: number | string;
  rate: number | string;
}

export default function EditInvoicePage({ params }: EditInvoiceProps) {
  const { id } = use(params);
  const router = useRouter();

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Form State
  const [clientId, setClientId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE'>('DRAFT');
  const [tax, setTax] = useState<number | string>(0);
  const [discount, setDiscount] = useState<number | string>(0);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItemState[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadData() {
      try {
        const [invoiceRes, clientsRes] = await Promise.all([
          fetch(`/api/invoices/${id}`),
          fetch('/api/clients'),
        ]);

        const [invoiceData, clientsData] = await Promise.all([
          invoiceRes.json(),
          clientsRes.json(),
        ]);

        if (ignore) return;

        if (!invoiceRes.ok || !invoiceData.invoice) {
          setError(invoiceData.error || 'Invoice not found.');
          setLoadingInitial(false);
          return;
        }

        const inv = invoiceData.invoice;
        setClientId(inv.clientId);
        setInvoiceNumber(inv.invoiceNumber);
        setIssueDate(inv.issueDate.split('T')[0]);
        setDueDate(inv.dueDate.split('T')[0]);
        setStatus(inv.status);
        const subtotalNum = inv.subtotal;
        const taxPercent = subtotalNum > 0 ? roundToTwoDecimals((inv.tax / subtotalNum) * 100) : 0;
        const discountPercent = subtotalNum > 0 ? roundToTwoDecimals((inv.discount / subtotalNum) * 100) : 0;
        setTax(taxPercent);
        setDiscount(discountPercent);
        setNotes(inv.notes || '');
        setCurrency(inv.user?.settings?.currency || 'USD');

        if (inv.items && inv.items.length > 0) {
          setItems(
            inv.items.map((it: { id: string; description: string; quantity: number; rate: number }) => ({
              id: it.id,
              description: it.description,
              quantity: it.quantity,
              rate: it.rate,
            }))
          );
        } else {
          setItems([{ id: '1', description: '', quantity: 1, rate: 0 }]);
        }

        if (clientsData.clients) {
          setClients(clientsData.clients);
        }
      } catch {
        if (!ignore) {
          setError('Failed to load invoice details.');
        }
      } finally {
        if (!ignore) {
          setLoadingInitial(false);
        }
      }
    }

    loadData();

    return () => {
      ignore = true;
    };
  }, [id]);

  const handleAddItem = () => {
    const newItem: LineItemState = {
      id: String(Date.now()),
      description: '',
      quantity: 1,
      rate: 0,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof LineItemState, value: string | number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    if (error) setError(null);
  };

  const calculateTotals = () => {
    let subtotal = 0;
    for (const item of items) {
      const qty = Math.max(0, typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity);
      const rate = Math.max(0, typeof item.rate === 'string' ? parseFloat(item.rate) || 0 : item.rate);
      subtotal += roundToTwoDecimals(qty * rate);
    }
    subtotal = roundToTwoDecimals(subtotal);

    const parsedTax = typeof tax === 'string' ? parseFloat(tax) : tax;
    const parsedDiscount = typeof discount === 'string' ? parseFloat(discount) : discount;

    const taxPercent = isNaN(parsedTax) ? 0 : Math.min(100, Math.max(0, parsedTax));
    const discountPercent = isNaN(parsedDiscount) ? 0 : Math.min(100, Math.max(0, parsedDiscount));

    const taxAmount = roundToTwoDecimals((subtotal * taxPercent) / 100);
    const discountAmount = roundToTwoDecimals((subtotal * discountPercent) / 100);

    let total = roundToTwoDecimals(subtotal + taxAmount - discountAmount);
    if (total < 0) total = 0;

    return { subtotal, taxPercent, discountPercent, taxAmount, discountAmount, total };
  };

  const totals = calculateTotals();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!clientId) {
      setError('Please select a client.');
      return;
    }

    if (!invoiceNumber.trim()) {
      setError('Invoice number is required.');
      return;
    }

    if (new Date(dueDate) < new Date(issueDate)) {
      setError('Due date cannot be before issue date.');
      return;
    }

    // Validate line items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.description.trim()) {
        setError(`Item #${i + 1} is missing a description.`);
        return;
      }
      const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
      if (isNaN(qty) || qty <= 0) {
        setError(`Item #${i + 1} must have a quantity greater than 0.`);
        return;
      }
      const rate = typeof item.rate === 'string' ? parseFloat(item.rate) : item.rate;
      if (isNaN(rate) || rate < 0) {
        setError(`Item #${i + 1} rate cannot be negative.`);
        return;
      }
    }

    const parsedTax = typeof tax === 'string' ? parseFloat(tax) : tax;
    if (isNaN(parsedTax) || parsedTax < 0 || parsedTax > 100) {
      setError('Tax percentage must be between 0% and 100%.');
      return;
    }

    const parsedDiscount = typeof discount === 'string' ? parseFloat(discount) : discount;
    if (isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
      setError('Discount percentage must be between 0% and 100%.');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        clientId,
        invoiceNumber,
        issueDate: new Date(issueDate),
        dueDate: new Date(dueDate),
        items: items.map((it) => ({
          description: it.description.trim(),
          quantity: typeof it.quantity === 'string' ? parseFloat(it.quantity) || 0 : it.quantity,
          rate: typeof it.rate === 'string' ? parseFloat(it.rate) || 0 : it.rate,
        })),
        tax: totals.taxPercent,
        discount: totals.discountPercent,
        notes: notes.trim() || null,
        status,
      };

      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to update invoice.');
        setSaving(false);
        return;
      }

      router.push(`/invoices/${id}`);
      router.refresh();
    } catch {
      setError('An unexpected network error occurred. Please try again.');
      setSaving(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-600">Loading invoice form...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <Link
          href={`/invoices/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Invoice</span>
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Edit Invoice {invoiceNumber}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Update invoice details, line items, notes, or status.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Info */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            General Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Client Selection */}
            <div>
              <label
                htmlFor="clientId"
                className="block text-sm font-semibold text-slate-800 mb-1"
              >
                Client <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  id="clientId"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition cursor-pointer"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company ? `(${c.company})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Invoice Number */}
            <div>
              <label
                htmlFor="invoiceNumber"
                className="block text-sm font-semibold text-slate-800 mb-1"
              >
                Invoice Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="invoiceNumber"
                  type="text"
                  required
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 font-mono text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Issue Date */}
            <div>
              <label
                htmlFor="issueDate"
                className="block text-sm font-semibold text-slate-800 mb-1"
              >
                Issue Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="issueDate"
                  type="date"
                  required
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Due Date */}
            <div>
              <label
                htmlFor="dueDate"
                className="block text-sm font-semibold text-slate-800 mb-1"
              >
                Due Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="dueDate"
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Status */}
            <div>
              <label
                htmlFor="status"
                className="block text-sm font-semibold text-slate-800 mb-1"
              >
                Invoice Status
              </label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE')}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition cursor-pointer"
              >
                <option value="DRAFT">DRAFT</option>
                <option value="SENT">SENT</option>
                <option value="PAID">PAID</option>
                <option value="OVERDUE">OVERDUE</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dynamic Line Items Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">Line Items</h2>
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item</span>
            </button>
          </div>

          {/* Desktop Table Headers */}
          <div className="hidden sm:grid grid-cols-12 gap-3 text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 py-1 bg-slate-50 rounded-lg">
            <div className="col-span-6">Description</div>
            <div className="col-span-2 text-right">Qty</div>
            <div className="col-span-2 text-right">Rate ({getCurrencySymbol(currency)})</div>
            <div className="col-span-2 text-right">Amount</div>
          </div>

          {/* Item Rows */}
          <div className="space-y-3">
            {items.map((item, index) => {
              const qty = Math.max(0, typeof item.quantity === 'string' ? parseFloat(item.quantity) || 0 : item.quantity);
              const rate = Math.max(0, typeof item.rate === 'string' ? parseFloat(item.rate) || 0 : item.rate);
              const rowAmount = roundToTwoDecimals(qty * rate);

              return (
                <div
                  key={item.id}
                  className="p-3 sm:p-2 rounded-xl bg-slate-50/70 sm:bg-transparent border border-slate-200 sm:border-0 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                >
                  {/* Description */}
                  <div className="sm:col-span-6">
                    <label className="sm:hidden block text-xs font-medium text-slate-600 mb-1">Description</label>
                    <input
                      type="text"
                      required
                      placeholder="Description of service or product"
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition bg-white"
                    />
                  </div>

                  {/* Quantity */}
                  <div className="grid grid-cols-2 sm:contents gap-3">
                    <div className="sm:col-span-2">
                      <label className="sm:hidden block text-xs font-medium text-slate-600 mb-1">Qty</label>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        required
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        className="w-full px-3 py-2 text-right rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition bg-white"
                      />
                    </div>

                    {/* Rate */}
                    <div className="sm:col-span-2">
                      <label className="sm:hidden block text-xs font-medium text-slate-600 mb-1">Rate ({getCurrencySymbol(currency)})</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        value={item.rate}
                        onChange={(e) => handleItemChange(index, 'rate', e.target.value)}
                        className="w-full px-3 py-2 text-right rounded-lg border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition bg-white"
                      />
                    </div>
                  </div>

                  {/* Amount & Delete */}
                  <div className="flex sm:col-span-2 items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-0 border-slate-200">
                    <span className="sm:hidden text-xs font-semibold text-slate-600">Row Total:</span>
                    <div className="font-semibold text-slate-900 text-sm">
                      {formatCurrency(rowAmount, currency)}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      disabled={items.length <= 1}
                      title="Delete Item"
                      className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400 rounded-lg transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleAddItem}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add another line item</span>
          </button>
        </div>

        {/* Notes and Financial Calculation Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Notes Column */}
          <div className="md:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Notes & Terms
            </h2>
            <div>
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Net 15 payment terms. Thank you for your business!"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
              />
            </div>
          </div>

          {/* Financial Summary Column */}
          <div className="md:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Financial Summary
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(totals.subtotal, currency)}
                </span>
              </div>

              {/* Tax */}
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="tax" className="text-slate-600 text-sm">
                  Tax (%)
                </label>
                <input
                  id="tax"
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  className="w-28 px-2.5 py-1 text-right rounded-md border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              {totals.taxPercent > 0 && (
                <div className="flex items-center justify-between text-xs text-slate-500 pl-2">
                  <span>Tax ({totals.taxPercent}%)</span>
                  <span>+{formatCurrency(totals.taxAmount, currency)}</span>
                </div>
              )}

              {/* Discount */}
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="discount" className="text-slate-600 text-sm">
                  Discount (%)
                </label>
                <input
                  id="discount"
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-28 px-2.5 py-1 text-right rounded-md border border-slate-300 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              {totals.discountPercent > 0 && (
                <div className="flex items-center justify-between text-xs text-emerald-600 pl-2">
                  <span>Discount ({totals.discountPercent}%)</span>
                  <span>-{formatCurrency(totals.discountAmount, currency)}</span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-base font-extrabold text-slate-900">
                <span>Total Amount</span>
                <span className="text-lg text-blue-600">
                  {formatCurrency(totals.total, currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Link
            href={`/invoices/${id}`}
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition cursor-pointer"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer shadow-sm"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving changes...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
