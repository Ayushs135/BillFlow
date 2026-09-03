/**
 * @file app/(dashboard)/invoices/page.tsx
 * @description Invoices Directory, Search, Filtering & Pagination Page
 * 
 * Features:
 * - Debounced server-side search across invoice numbers, client names, and companies.
 * - Status filter tabs: ALL, DRAFT, SENT, PAID, OVERDUE.
 * - Client dropdown filtering.
 * - Server-side sorting (newest, oldest, dueDate, amountHigh, amountLow) and pagination.
 * - Quick action controls: View, Edit, Send, and Cascade Delete modal.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Eye,
  Send,
  Loader2,
  AlertCircle,
  AlertTriangle,
  X,
  CheckCircle2,
} from 'lucide-react';
import InvoiceStatusBadge from '@/components/invoice-status-badge';
import { formatCurrency } from '@/lib/currencies';

interface InvoiceListItem {
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
  client: {
    id: string;
    name: string;
    company: string | null;
    email: string;
  };
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
}

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

const STATUS_TABS = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Sent', value: 'SENT' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Overdue', value: 'OVERDUE' },
];

const SORT_OPTIONS = [
  { label: 'Newest First', value: 'newest' },
  { label: 'Oldest First', value: 'oldest' },
  { label: 'Due Date', value: 'dueDate' },
  { label: 'Highest Amount', value: 'amountHigh' },
  { label: 'Lowest Amount', value: 'amountLow' },
];

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 15,
    totalCount: 0,
    totalPages: 1,
  });

  // Filters State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [clientFilter, setClientFilter] = useState('');
  const [sortOption, setSortOption] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Delete modal state
  const [invoiceToDelete, setInvoiceToDelete] = useState<InvoiceListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1); // Reset page on search change
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Load clients and settings once
  useEffect(() => {
    let ignore = false;
    async function loadMeta() {
      try {
        const [cRes, sRes] = await Promise.all([
          fetch('/api/clients'),
          fetch('/api/settings'),
        ]);
        const [cData, sData] = await Promise.all([cRes.json(), sRes.json()]);

        if (ignore) return;
        if (cData.clients) setClients(cData.clients);
        if (sData.settings?.currency) setCurrency(sData.settings.currency);
      } catch {
        // Ignored
      }
    }
    loadMeta();
    return () => {
      ignore = true;
    };
  }, []);

  // Fetch Invoices with server-side filters, search, sort, and pagination
  useEffect(() => {
    let ignore = false;

    async function loadInvoices() {
      try {
        const params = new URLSearchParams();
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
        if (clientFilter) params.set('clientId', clientFilter);
        if (sortOption) params.set('sort', sortOption);
        params.set('page', String(currentPage));
        params.set('pageSize', '15');

        const res = await fetch(`/api/invoices?${params.toString()}`);
        const data = await res.json();

        if (ignore) return;

        if (!res.ok) {
          setError(data.error || 'Failed to load invoices.');
          setLoading(false);
          return;
        }

        setInvoices(data.invoices || []);
        if (data.pagination) {
          setPagination(data.pagination);
        }
        setError(null);
      } catch {
        if (!ignore) {
          setError('An error occurred while loading invoices.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadInvoices();

    return () => {
      ignore = true;
    };
  }, [debouncedSearch, statusFilter, clientFilter, sortOption, currentPage, refreshTrigger]);

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/invoices/${invoiceToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to delete invoice.');
        setIsDeleting(false);
        setInvoiceToDelete(null);
        return;
      }

      setToastMessage(`Invoice "${invoiceToDelete.invoiceNumber}" deleted successfully.`);
      setInvoiceToDelete(null);
      setRefreshTrigger((v) => v + 1);
      setTimeout(() => setToastMessage(null), 4000);
    } catch {
      setError('An error occurred while deleting the invoice.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleQuickMarkSent = async (inv: InvoiceListItem) => {
    try {
      const res = await fetch(`/api/invoices/${inv.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SENT' }),
      });
      const data = await res.json();
      if (res.ok) {
        setToastMessage(`Invoice ${inv.invoiceNumber} marked as SENT.`);
        setRefreshTrigger((v) => v + 1);
        setTimeout(() => setToastMessage(null), 3000);
      } else {
        setError(data.error || 'Failed to update status.');
      }
    } catch {
      setError('Failed to update status.');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Invoices
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Create, track, and manage client billings with real-time status updates.
          </p>
        </div>

        <Link
          href="/invoices/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Invoice</span>
        </Link>
      </div>

      {/* Toast Alert Feedback */}
      {toastMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-emerald-800 text-sm animate-fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-600 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between text-rose-800 text-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter & Search Bar Container */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => {
                  setStatusFilter(tab.value);
                  setCurrentPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search, Client Filter, and Sort Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Box */}
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice #, client name, company, or email..."
              className="w-full pl-9 pr-9 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Client Filter Dropdown */}
          <div className="sm:col-span-3">
            <select
              value={clientFilter}
              onChange={(e) => {
                setClientFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition cursor-pointer"
            >
              <option value="">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.company ? `(${c.company})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="sm:col-span-3">
            <select
              value={sortOption}
              onChange={(e) => {
                setSortOption(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Sort: {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600">Loading invoices...</p>
        </div>
      ) : invoices.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
          {search || statusFilter !== 'ALL' || clientFilter ? (
            <div className="max-w-md mx-auto space-y-3">
              <Search className="w-10 h-10 text-slate-300 mx-auto" />
              <h2 className="text-lg font-bold text-slate-800">No matching invoices</h2>
              <p className="text-sm text-slate-500">
                No invoices found matching your filter criteria. Try clearing search filters.
              </p>
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('ALL');
                  setClientFilter('');
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 transition cursor-pointer"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">No invoices yet</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Create your first invoice to start itemizing billables and tracking payments.
                </p>
              </div>
              <Link
                href="/invoices/new"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Your First Invoice</span>
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Invoice #</th>
                  <th scope="col" className="px-6 py-3.5">Client</th>
                  <th scope="col" className="px-6 py-3.5">Issue Date</th>
                  <th scope="col" className="px-6 py-3.5">Due Date</th>
                  <th scope="col" className="px-6 py-3.5">Amount</th>
                  <th scope="col" className="px-6 py-3.5">Status</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">
                      <Link href={`/invoices/${inv.id}`} className="hover:text-blue-600 transition">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      <div>{inv.client.name}</div>
                      {inv.client.company && (
                        <div className="text-xs text-slate-400 font-normal">{inv.client.company}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {formatDate(inv.issueDate)}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {formatDate(inv.dueDate)}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">
                      {formatCurrency(inv.total, currency)}
                    </td>
                    <td className="px-6 py-4">
                      <InvoiceStatusBadge status={inv.effectiveStatus} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {inv.status === 'DRAFT' && (
                          <button
                            onClick={() => handleQuickMarkSent(inv)}
                            title="Mark as Sent"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        <Link
                          href={`/invoices/${inv.id}`}
                          title="View Invoice"
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          href={`/invoices/${inv.id}/edit`}
                          title="Edit Invoice"
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => setInvoiceToDelete(inv)}
                          title="Delete Invoice"
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="grid grid-cols-1 gap-4 md:hidden">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="font-mono font-bold text-slate-900 text-base hover:text-blue-600"
                    >
                      {inv.invoiceNumber}
                    </Link>
                    <div className="text-sm font-medium text-slate-800 mt-0.5">{inv.client.name}</div>
                  </div>
                  <InvoiceStatusBadge status={inv.effectiveStatus} />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <div>
                    <span>Due: {formatDate(inv.dueDate)}</span>
                  </div>
                  <div className="text-sm font-mono font-bold text-slate-900">
                    {formatCurrency(inv.total, currency)}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  {inv.status === 'DRAFT' && (
                    <button
                      onClick={() => handleQuickMarkSent(inv)}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700"
                    >
                      Mark Sent
                    </button>
                  )}
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700"
                  >
                    View
                  </Link>
                  <Link
                    href={`/invoices/${inv.id}/edit`}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => setInvoiceToDelete(inv)}
                    className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between bg-white px-5 py-3.5 rounded-2xl border border-slate-200 shadow-xs text-sm text-slate-600">
              <div>
                Showing page <strong>{pagination.page}</strong> of{' '}
                <strong>{pagination.totalPages}</strong> ({pagination.totalCount} total)
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <button
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Modal */}
      {invoiceToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Delete Invoice?</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Are you sure you want to delete invoice <strong>{invoiceToDelete.invoiceNumber}</strong>?
                </p>
                <p className="text-xs text-rose-600 mt-2 font-medium">
                  This action will permanently delete this invoice and all associated line items.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setInvoiceToDelete(null)}
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
