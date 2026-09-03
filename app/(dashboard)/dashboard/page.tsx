/**
 * @file app/(dashboard)/dashboard/page.tsx
 * @description Authenticated Financial Dashboard & Analytics Page
 * 
 * Features:
 * - 3 summary cards: Total Earned (PAID), Outstanding (active SENT), and Overdue (past due date unpaid).
 * - 6-month monthly revenue distribution chart.
 * - Recent 5 invoices table with direct detail links.
 * - Quick action workflows and business profile summary.
 */

import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import {
  Clock,
  AlertTriangle,
  Users,
  FileText,
  Plus,
  ArrowRight,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { formatCurrency, getCurrencySymbol } from '@/lib/currencies';
import { getEffectiveStatus } from '@/lib/money';
import InvoiceStatusBadge from '@/components/invoice-status-badge';
import IncomeChart, { MonthlyIncome } from '@/components/income-chart';
import DemoPublicInvoiceCard from '@/components/demo-public-invoice-card';

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // Six months ago start date for income chart
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);

  // Scoped queries for current user
  const [
    earnedAggregate,
    outstandingAggregate,
    overdueAggregate,
    clientCount,
    invoiceCount,
    settings,
    recentInvoices,
    paidInvoicesPeriod,
    demoInvoice,
  ] = await Promise.all([
    // 1. Earned: Sum of PAID invoices
    prisma.invoice.aggregate({
      where: {
        userId: user.id,
        status: 'PAID',
      },
      _sum: { total: true },
    }),

    // 2. Outstanding: Sum of SENT invoices (not overdue)
    prisma.invoice.aggregate({
      where: {
        userId: user.id,
        status: 'SENT',
        dueDate: { gte: startOfToday },
      },
      _sum: { total: true },
    }),

    // 3. Overdue: Sum of unpaid invoices past due date
    prisma.invoice.aggregate({
      where: {
        userId: user.id,
        status: { not: 'PAID' },
        dueDate: { lt: startOfToday },
      },
      _sum: { total: true },
    }),

    // 4. Client count
    prisma.client.count({ where: { userId: user.id } }),

    // 5. Total invoice count
    prisma.invoice.count({ where: { userId: user.id } }),

    // 6. User Settings
    prisma.settings.findUnique({ where: { userId: user.id } }),

    // 7. Recent 5 invoices
    prisma.invoice.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        client: {
          select: { name: true, company: true },
        },
      },
    }),

    // 8. Paid invoices for the last 6 months for the chart
    prisma.invoice.findMany({
      where: {
        userId: user.id,
        status: 'PAID',
        createdAt: { gte: sixMonthsAgo },
      },
      select: {
        total: true,
        createdAt: true,
      },
    }),

    // 9. Public demo invoice for quick evaluation (prefer SENT, then PAID, then any)
    prisma.invoice.findFirst({
      where: {
        userId: user.id,
        status: { in: ['SENT', 'PAID'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        publicToken: true,
        status: true,
        total: true,
        client: { select: { name: true } },
      },
    }),
  ]);

  const currency = settings?.currency || 'USD';
  const earnedTotal = earnedAggregate._sum.total?.toNumber() || 0;
  const outstandingTotal = outstandingAggregate._sum.total?.toNumber() || 0;
  const overdueTotal = overdueAggregate._sum.total?.toNumber() || 0;

  // Compute 6-month monthly income breakdown
  const monthlyData: MonthlyIncome[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthIndex = d.getMonth();
    const year = d.getFullYear();
    const shortLabel = d.toLocaleString('en-US', { month: 'short' });
    const fullLabel = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });

    // Sum paid invoices matching this month and year
    let monthlySum = 0;
    for (const inv of paidInvoicesPeriod) {
      const invDate = new Date(inv.createdAt);
      if (invDate.getMonth() === monthIndex && invDate.getFullYear() === year) {
        monthlySum += inv.total.toNumber();
      }
    }

    monthlyData.push({
      month: String(monthIndex + 1),
      year,
      label: fullLabel,
      shortLabel,
      amount: monthlySum,
    });
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Welcome back, {user.name}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Financial analytics, cash flow metrics, and invoice management overview.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/invoices/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Invoice</span>
          </Link>
          <Link
            href="/clients/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium text-sm hover:bg-slate-50 transition"
          >
            <Users className="w-4 h-4" />
            <span>Add Client</span>
          </Link>
        </div>
      </div>

      {/* Main 3 Financial Summary Cards (Earned, Outstanding, Overdue) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 1. Earned Card */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Earned</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black font-mono tracking-tight text-slate-900">
              {formatCurrency(earnedTotal, currency)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Collected from all completed & paid client invoices.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-2xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
              Settled Funds
            </span>
            <Link
              href="/invoices?status=PAID"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              View paid <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* 2. Outstanding Card */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Outstanding</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black font-mono tracking-tight text-slate-900">
              {formatCurrency(outstandingTotal, currency)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Active sent invoices awaiting client payment.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-2xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
              Awaiting Payment
            </span>
            <Link
              href="/invoices?status=SENT"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              View active <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* 3. Overdue Card */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overdue</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black font-mono tracking-tight text-rose-600">
              {formatCurrency(overdueTotal, currency)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Unpaid invoices exceeding their scheduled due date.
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-2xs font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
              Requires Attention
            </span>
            <Link
              href="/invoices?status=OVERDUE"
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 inline-flex items-center gap-1"
            >
              View overdue <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Income Over Time Chart */}
      <IncomeChart data={monthlyData} currency={currency} />

      {/* Recent Invoices & Quick Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Invoices (8 Cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent Invoices</h2>
              <p className="text-xs text-slate-500">Latest billing activity</p>
            </div>
            <Link
              href="/invoices"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              View all ({invoiceCount}) <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentInvoices.length === 0 ? (
            <div className="py-8 text-center text-slate-400 space-y-2">
              <FileText className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-medium text-slate-600">No invoices created yet</p>
              <Link
                href="/invoices/new"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
              >
                Create your first invoice
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead>
                  <tr className="border-b border-slate-100 text-2xs font-semibold text-slate-400 uppercase tracking-wider">
                    <th scope="col" className="pb-2">Invoice</th>
                    <th scope="col" className="pb-2">Client</th>
                    <th scope="col" className="pb-2">Date</th>
                    <th scope="col" className="pb-2">Amount</th>
                    <th scope="col" className="pb-2">Status</th>
                    <th scope="col" className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentInvoices.map((inv) => {
                    const effectiveStatus = getEffectiveStatus(inv.status, inv.dueDate);
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 font-mono font-bold text-slate-900 text-xs">
                          <Link href={`/invoices/${inv.id}`} className="hover:text-blue-600">
                            {inv.invoiceNumber}
                          </Link>
                        </td>
                        <td className="py-3 text-xs font-medium text-slate-900">
                          <div>{inv.client.name}</div>
                          {inv.client.company && (
                            <div className="text-2xs text-slate-400 font-normal">{inv.client.company}</div>
                          )}
                        </td>
                        <td className="py-3 text-2xs text-slate-500">
                          {formatDate(inv.issueDate)}
                        </td>
                        <td className="py-3 font-mono font-bold text-xs text-slate-900">
                          {formatCurrency(inv.total.toNumber(), currency)}
                        </td>
                        <td className="py-3">
                          <InvoiceStatusBadge status={effectiveStatus} size="sm" />
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            href={`/invoices/${inv.id}`}
                            className="p-1.5 inline-flex text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="View Invoice"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Overview, Demo Link & Quick Links (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          <DemoPublicInvoiceCard
            invoice={
              demoInvoice
                ? {
                    id: demoInvoice.id,
                    invoiceNumber: demoInvoice.invoiceNumber,
                    publicToken: demoInvoice.publicToken,
                    status: demoInvoice.status,
                    total: demoInvoice.total.toNumber(),
                    clientName: demoInvoice.client.name,
                  }
                : null
            }
            currency={currency}
          />

          {/* Business & Multi-Tenant Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Business Profile
            </h2>
            <div className="space-y-3 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Business Name</span>
                <span className="font-bold text-slate-900 truncate max-w-[160px]">
                  {settings?.businessName || user.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Currency</span>
                <span className="font-bold text-slate-900 font-mono">
                  {currency} ({getCurrencySymbol(currency)})
                </span>
              </div>
              <div className="flex justify-between">
                <span>Invoice Prefix</span>
                <span className="font-bold text-slate-900 font-mono">
                  {settings?.invoicePrefix || 'INV-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total Clients</span>
                <span className="font-bold text-slate-900 font-mono">{clientCount}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <Link
                href="/settings"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              >
                Edit business settings <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Quick Actions Shortcuts */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-sm font-bold">Quick Actions</h2>
              <p className="text-2xs text-slate-400 mt-0.5">Streamline billing workflows</p>
            </div>

            <div className="space-y-2">
              <Link
                href="/invoices/new"
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 transition text-xs font-semibold"
              >
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-400" />
                  <span>Create Invoice</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>

              <Link
                href="/clients/new"
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 transition text-xs font-semibold"
              >
                <span className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  <span>Add New Client</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>

              <Link
                href="/invoices"
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 transition text-xs font-semibold"
              >
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Manage Invoices</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
