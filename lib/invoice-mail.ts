/**
 * @file lib/invoice-mail.ts
 * @description Email composition and URL generation utilities for invoices
 */

export interface InvoiceMailOptions {
  invoiceNumber: string;
  businessName: string;
  clientEmail?: string | null;
  publicToken: string;
  appUrl?: string | null;
}

export interface InvoiceMailData {
  to: string;
  subject: string;
  body: string;
  publicInvoiceUrl: string;
  gmailComposeUrl: string;
  mailtoUrl: string;
  hasClientEmail: boolean;
}

/**
 * Resolves the full public invoice URL using NEXT_PUBLIC_APP_URL, passed appUrl, or window.location.origin fallback.
 */
export function getPublicInvoiceUrl(publicToken: string, appUrl?: string | null): string {
  const base =
    appUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const cleanBase = base ? base.replace(/\/+$/, '') : '';
  return cleanBase ? `${cleanBase}/invoice/${publicToken}` : `/invoice/${publicToken}`;
}

/**
 * Builds email subject, body, and URL-encoded links for an invoice.
 */
export function buildInvoiceMailData(options: InvoiceMailOptions): InvoiceMailData {
  const { invoiceNumber, businessName, clientEmail, publicToken, appUrl } = options;
  const to = (clientEmail || '').trim();
  const hasClientEmail = to.length > 0;
  const publicInvoiceUrl = getPublicInvoiceUrl(publicToken, appUrl);

  const subject = `Invoice ${invoiceNumber} — ${businessName}`;
  const body = `Hello,\n\nPlease find your invoice ${invoiceNumber} from ${businessName}.\n\nYou can view the invoice online here:\n${publicInvoiceUrl}\n\nThank you,\n${businessName}`;

  const encodedTo = encodeURIComponent(to);
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);

  const gmailComposeUrl = hasClientEmail
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodedTo}&su=${encodedSubject}&body=${encodedBody}`
    : '';

  const mailtoUrl = hasClientEmail
    ? `mailto:${encodedTo}?subject=${encodedSubject}&body=${encodedBody}`
    : '';

  return {
    to,
    subject,
    body,
    publicInvoiceUrl,
    gmailComposeUrl,
    mailtoUrl,
    hasClientEmail,
  };
}
