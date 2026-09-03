/**
 * @file app/(dashboard)/settings/page.tsx
 * @description Business Profile, Branding & Numbering Configuration Page
 * 
 * Capabilities:
 * - Business/studio name customization.
 * - Multi-currency selection from 9 supported world currencies.
 * - Sequential invoice numbering prefix setup (e.g. `INV-`, `BILL-`).
 * - Logo upload with client-side format checks and live preview backed by PostgreSQL storage.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Building,
  DollarSign,
  FileCode,
  Upload,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { SUPPORTED_CURRENCIES } from '@/lib/currencies';

export default function SettingsPage() {
  const [formData, setFormData] = useState({
    businessName: '',
    currency: 'USD',
    invoicePrefix: 'INV-',
    logoUrl: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings');
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Failed to load business settings.');
          return;
        }

        const s = data.settings;
        if (s) {
          setFormData({
            businessName: s.businessName || '',
            currency: s.currency || 'USD',
            invoicePrefix: s.invoicePrefix || 'INV-',
            logoUrl: s.logoUrl || '',
          });
        }
      } catch {
        setError('Failed to load settings. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    if (error) setError(null);
    if (success) setSuccess(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Unsupported file format. Please upload a PNG, JPEG, or WebP image.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('File size exceeds the 2MB limit. Please upload a smaller image.');
      return;
    }

    setUploadingLogo(true);
    setError(null);

    try {
      const uploadData = new FormData();
      uploadData.append('file', file);

      const res = await fetch('/api/upload/logo', {
        method: 'POST',
        body: uploadData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to upload logo.');
        return;
      }

      setFormData((prev) => ({
        ...prev,
        logoUrl: data.url,
      }));
    } catch {
      setError('An error occurred while uploading the logo.');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = () => {
    setFormData((prev) => ({
      ...prev,
      logoUrl: '',
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!formData.invoicePrefix.trim()) {
      setError('Invoice number prefix cannot be empty.');
      return;
    }

    setSaving(true);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to save settings.');
        setSaving(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch {
      setError('An error occurred while saving settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-600">Loading business settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Business Settings
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Customize your business identity, default currency, and invoice numbering conventions.
        </p>
      </div>

      {/* Success / Error Alerts */}
      {success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3 text-emerald-800 text-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>Settings saved and applied successfully.</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Settings Form Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Business Name */}
          <div>
            <label
              htmlFor="businessName"
              className="block text-sm font-semibold text-slate-800 mb-1"
            >
              Business / Studio Name
            </label>
            <div className="relative">
              <Building className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="businessName"
                name="businessName"
                type="text"
                value={formData.businessName}
                onChange={handleChange}
                placeholder="e.g. Morgan Design & Development"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Appears on generated invoices and client-facing communication.
            </p>
          </div>

          {/* Currency & Invoice Prefix 2-Column Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Currency Selector */}
            <div>
              <label
                htmlFor="currency"
                className="block text-sm font-semibold text-slate-800 mb-1"
              >
                Default Currency
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  id="currency"
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition cursor-pointer"
                >
                  {SUPPORTED_CURRENCIES.map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.display}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Used for totals and financial formatting across the app.
              </p>
            </div>

            {/* Invoice Prefix */}
            <div>
              <label
                htmlFor="invoicePrefix"
                className="block text-sm font-semibold text-slate-800 mb-1"
              >
                Invoice Number Prefix
              </label>
              <div className="relative">
                <FileCode className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="invoicePrefix"
                  name="invoicePrefix"
                  type="text"
                  required
                  value={formData.invoicePrefix}
                  onChange={handleChange}
                  placeholder="INV-"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 text-sm placeholder-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                E.g., <code>INV-</code> produces <code>INV-001</code>, <code>BILL-</code> produces <code>BILL-001</code>.
              </p>
            </div>
          </div>

          {/* Business Logo Upload */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">
              Business Logo
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Upload your business or studio logo (PNG, JPEG, or WebP, up to 2MB).
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleLogoUpload}
              className="hidden"
            />

            {!formData.logoUrl ? (
              <div>
                <button
                  type="button"
                  disabled={uploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {uploadingLogo ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      <span>Uploading logo...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-slate-500" />
                      <span>Upload Logo</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={formData.logoUrl}
                    alt="Business Logo Preview"
                    className="h-14 w-auto max-w-[140px] object-contain rounded border border-slate-200 bg-white p-1.5 shadow-2xs"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-800 block">Logo Preview</span>
                    <span>Rendered on invoice headers and client portal.</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingLogo}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer shadow-xs disabled:opacity-60"
                  >
                    {uploadingLogo ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>Replace</span>
                  </button>
                  <button
                    type="button"
                    disabled={uploadingLogo}
                    onClick={handleRemoveLogo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-600 text-xs font-semibold hover:bg-rose-50 transition cursor-pointer shadow-xs disabled:opacity-60"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition cursor-pointer shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving settings...</span>
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

      {/* Info Card */}
      <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
        <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Settings are automatically scoped to your unique account. Any new invoice you create will adopt your selected currency and invoice numbering prefix.
        </p>
      </div>
    </div>
  );
}
