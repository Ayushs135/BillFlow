/**
 * @file app/page.tsx
 * @description Public SaaS Landing Page
 * 
 * Features:
 * - Conversion-focused hero header with login/signup actions.
 * - Pre-login "View Demo Invoice" CTA allowing instant evaluation of a real public invoice without authentication.
 * - Highlights core platform capabilities: Auth & Sessions, Client Directory, Branding & Settings, Public Invoices.
 */

import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ArrowRight, ShieldCheck, Users, Settings, Sparkles, ExternalLink } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const demoToken = process.env.DEMO_PUBLIC_INVOICE_TOKEN || 'demo-token-inv-006-sent';

  const [user, demoInvoice] = await Promise.all([
    getCurrentUser(),
    prisma.invoice.findUnique({
      where: {
        publicToken: demoToken,
      },
      select: {
        invoiceNumber: true,
        publicToken: true,
        status: true,
        total: true,
        client: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              B
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              BillFlow
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition"
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition shadow-sm"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            Professional Invoicing Platform for Freelancers & Studios
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.15]">
            Simple invoicing for <span className="text-blue-600">freelancers</span>.
          </h1>

          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Manage your clients, customize business currencies and numbering, and authenticate securely with multi-tenant isolation.
          </p>

          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {user ? (
                <Link
                  href="/dashboard"
                  className="w-full sm:w-auto px-8 py-3.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition shadow-sm cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Open Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <>
                  <Link
                    href="/signup"
                    className="w-full sm:w-auto px-8 py-3.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition shadow-sm cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Get Started Free</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/login"
                    className="w-full sm:w-auto px-6 py-3.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 transition"
                  >
                    Sign In with Demo User
                  </Link>
                </>
              )}
            </div>

            {/* Evaluator Live Demo Public Invoice CTA (No Login Required) */}
            <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <span className="text-xs text-slate-500 font-medium">Want to see a sample invoice?</span>
              <Link
                href={`/invoice/${demoInvoice?.publicToken || demoToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition shadow-xs group"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 group-hover:rotate-12 transition-transform" />
                <span>View Demo Invoice</span>
                {demoInvoice?.invoiceNumber && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-2xs">
                    {demoInvoice.invoiceNumber}
                  </span>
                )}
                <ExternalLink className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-12 text-left max-w-5xl mx-auto">
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center gap-2 text-blue-600 mb-1">
                <ShieldCheck className="w-4 h-4" />
                <div className="text-xs font-semibold uppercase tracking-wider">Auth & Session</div>
              </div>
              <div className="font-semibold text-slate-800">Secure JWT Cookies</div>
              <div className="text-xs text-slate-500 mt-1">HTTP-only session tokens with bcryptjs password encryption.</div>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center gap-2 text-purple-600 mb-1">
                <Users className="w-4 h-4" />
                <div className="text-xs font-semibold uppercase tracking-wider">Client Directory</div>
              </div>
              <div className="font-semibold text-slate-800">Multi-Tenant CRUD</div>
              <div className="text-xs text-slate-500 mt-1">Add, edit, search, and delete client contacts with tenant isolation.</div>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center gap-2 text-indigo-600 mb-1">
                <Settings className="w-4 h-4" />
                <div className="text-xs font-semibold uppercase tracking-wider">Custom Settings</div>
              </div>
              <div className="font-semibold text-slate-800">Branding & Logo</div>
              <div className="text-xs text-slate-500 mt-1">PostgreSQL-backed logo storage, multi-currency, and prefix rules.</div>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center gap-2 text-emerald-600 mb-1">
                <Sparkles className="w-4 h-4" />
                <div className="text-xs font-semibold uppercase tracking-wider">Client Portal</div>
              </div>
              <div className="font-semibold text-slate-800">Public Invoices & PDF</div>
              <div className="text-xs text-slate-500 mt-1">Token-gated shareable links, simulated pay, and Unicode vector PDFs.</div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <div>© {new Date().getFullYear()} BillFlow Invoicing. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <span>Next.js 16</span>
            <span>•</span>
            <span>TypeScript</span>
            <span>•</span>
            <span>Prisma ORM</span>
            <span>•</span>
            <span>PostgreSQL</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
