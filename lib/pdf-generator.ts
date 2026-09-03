/**
 * @file lib/pdf-generator.ts
 * @description Vector PDF Generation Engine
 * 
 * Generates professional, multi-page vector A4 invoice documents using `jspdf`.
 * 
 * Features:
 * - Direct embedding of PostgreSQL-backed business logos (PNG, JPEG, WebP base64).
 * - Unicode TrueType font embedding (NotoSans-Regular and NotoSans-Bold) supporting Indian Rupee (₹) and global currencies.
 * - Dynamic pagination for variable line items and multi-line notes.
 * - Client & server unified rendering.
 */

import fs from 'fs';
import path from 'path';
import { jsPDF } from 'jspdf';
import { formatCurrency } from './currencies';
import { roundToTwoDecimals } from './money';

export interface InvoicePdfData {
  invoiceNumber: string;
  issueDate: string | Date;
  dueDate: string | Date;
  status: string;
  effectiveStatus: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  notes?: string | null;
  currency: string;
  businessName: string;
  businessEmail?: string | null;
  logoData?: string | null;
  client: {
    name: string;
    company?: string | null;
    email: string;
    address?: string | null;
    phone?: string | null;
  };
  items: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
}

export async function getLogoBase64(logoUrl?: string | null): Promise<string | null> {
  if (!logoUrl || typeof logoUrl !== 'string') return null;

  try {
    if (logoUrl.startsWith('data:image/')) {
      return logoUrl;
    }

    if (logoUrl.startsWith('/uploads/') || logoUrl.startsWith('uploads/')) {
      const cleanPath = logoUrl.startsWith('/') ? logoUrl.slice(1) : logoUrl;
      const fullPath = path.join(process.cwd(), 'public', cleanPath);
      if (fs.existsSync(fullPath)) {
        const buf = await fs.promises.readFile(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return `data:${mime};base64,${buf.toString('base64')}`;
      }
    }

    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      const res = await fetch(logoUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        const mime = res.headers.get('content-type') || 'image/png';
        return `data:${mime};base64,${buf.toString('base64')}`;
      }
    }
  } catch (e) {
    console.error('Error resolving logo base64 for PDF:', e);
  }

  return null;
}

let regularFontBase64: string | null = null;
let boldFontBase64: string | null = null;

function loadUnicodeFonts(doc: jsPDF): boolean {
  try {
    if (!regularFontBase64 || !boldFontBase64) {
      const regPath = path.join(process.cwd(), 'lib', 'fonts', 'NotoSans-Regular.ttf');
      const boldPath = path.join(process.cwd(), 'lib', 'fonts', 'NotoSans-Bold.ttf');
      if (fs.existsSync(regPath) && fs.existsSync(boldPath)) {
        regularFontBase64 = fs.readFileSync(regPath).toString('base64');
        boldFontBase64 = fs.readFileSync(boldPath).toString('base64');
      }
    }

    if (regularFontBase64 && boldFontBase64) {
      doc.addFileToVFS('NotoSans-Regular.ttf', regularFontBase64);
      doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
      doc.addFileToVFS('NotoSans-Bold.ttf', boldFontBase64);
      doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');
      return true;
    }
  } catch (e) {
    console.error('Error loading Unicode fonts for PDF:', e);
  }
  return false;
}

export function generateInvoicePdf(data: InvoicePdfData): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const hasUnicodeFont = loadUnicodeFonts(doc);
  const fontName = hasUnicodeFont ? 'NotoSans' : 'helvetica';

  const currency = data.currency || 'USD';
  const margin = 15;
  const pageWidth = 210;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  // Format date helper
  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // --- LOGO (If present) ---
  if (data.logoData) {
    try {
      const imgProps = doc.getImageProperties(data.logoData);
      const aspect = imgProps.width / imgProps.height;
      let imgWidth = 36;
      let imgHeight = imgWidth / aspect;
      if (imgHeight > 16) {
        imgHeight = 16;
        imgWidth = imgHeight * aspect;
      }
      doc.addImage(data.logoData, margin, y, imgWidth, imgHeight);
      y += imgHeight + 5;
    } catch (e) {
      console.error('Error embedding logo in PDF:', e);
    }
  }

  // --- 1. HEADER (Business Name & Invoice Title) ---
  doc.setFont(fontName, 'bold');
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(data.businessName || 'BillFlow Invoicing', margin, y);

  doc.setFontSize(22);
  doc.setTextColor(37, 99, 235); // blue-600
  doc.text('INVOICE', pageWidth - margin, y, { align: 'right' });

  y += 7;
  doc.setFont(fontName, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // slate-500
  if (data.businessEmail) {
    doc.text(data.businessEmail, margin, y);
  }

  doc.setFont(fontName, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text(data.invoiceNumber, pageWidth - margin, y, { align: 'right' });

  y += 6;
  doc.setFont(fontName, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Status: ${data.effectiveStatus || data.status}`, pageWidth - margin, y, { align: 'right' });

  y += 10;
  // Horizontal divider
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);

  y += 8;

  // --- 2. BILL TO & DATES SECTION ---
  const col2X = 120;
  const startSectionY = y;

  // Bill To (Left Column)
  doc.setFont(fontName, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('BILLED TO', margin, y);

  y += 5;
  doc.setFont(fontName, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(data.client.name, margin, y);

  doc.setFont(fontName, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  if (data.client.company) {
    y += 4.5;
    doc.text(data.client.company, margin, y);
  }
  if (data.client.email) {
    y += 4.5;
    doc.text(data.client.email, margin, y);
  }
  if (data.client.phone) {
    y += 4.5;
    doc.text(data.client.phone, margin, y);
  }
  if (data.client.address) {
    y += 4.5;
    const splitAddress = doc.splitTextToSize(data.client.address, 90);
    doc.text(splitAddress, margin, y);
    y += (splitAddress.length - 1) * 4;
  }

  // Dates & Info (Right Column)
  let rightY = startSectionY;
  doc.setFont(fontName, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('INVOICE DETAILS', col2X, rightY);

  rightY += 5;
  doc.setFont(fontName, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Issue Date: ${formatDate(data.issueDate)}`, col2X, rightY);

  rightY += 4.5;
  doc.text(`Due Date:   ${formatDate(data.dueDate)}`, col2X, rightY);

  rightY += 4.5;
  doc.text(`Currency:   ${currency}`, col2X, rightY);

  y = Math.max(y, rightY) + 10;

  // --- 3. LINE ITEMS TABLE ---
  // Table Header Background
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(margin, y, contentWidth, 7, 'F');

  doc.setFont(fontName, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('DESCRIPTION', margin + 3, y + 4.8);
  doc.text('QTY', 125, y + 4.8, { align: 'right' });
  doc.text('RATE', 155, y + 4.8, { align: 'right' });
  doc.text('AMOUNT', pageWidth - margin - 3, y + 4.8, { align: 'right' });

  y += 7;

  // Line Item Rows
  doc.setFont(fontName, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);

  for (const item of data.items) {
    // Check if new page needed
    if (y > 260) {
      doc.addPage();
      y = 20;
    }

    const descLines = doc.splitTextToSize(item.description, 95);
    const rowHeight = Math.max(7, descLines.length * 4.5 + 2);

    doc.text(descLines, margin + 3, y + 4.5);
    doc.text(String(item.quantity), 125, y + 4.5, { align: 'right' });
    doc.text(formatCurrency(item.rate, currency), 155, y + 4.5, { align: 'right' });
    doc.text(formatCurrency(item.amount, currency), pageWidth - margin - 3, y + 4.5, { align: 'right' });

    y += rowHeight;
    doc.setDrawColor(241, 245, 249); // slate-100
    doc.line(margin, y, pageWidth - margin, y);
  }

  y += 4;

  // --- 4. FINANCIAL TOTALS BOX ---
  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  const totalsX = 120;
  const totalsValX = pageWidth - margin - 3;

  doc.setFont(fontName, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);

  doc.text('Subtotal:', totalsX, y + 4);
  doc.setFont(fontName, 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(formatCurrency(data.subtotal, currency), totalsValX, y + 4, { align: 'right' });
  y += 6;

  if (data.tax > 0) {
    const taxPercent = data.subtotal > 0 ? roundToTwoDecimals((data.tax / data.subtotal) * 100) : 0;
    doc.setFont(fontName, 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Tax (${taxPercent}%):`, totalsX, y + 4);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`+${formatCurrency(data.tax, currency)}`, totalsValX, y + 4, { align: 'right' });
    y += 6;
  }

  if (data.discount > 0) {
    const discountPercent = data.subtotal > 0 ? roundToTwoDecimals((data.discount / data.subtotal) * 100) : 0;
    doc.setFont(fontName, 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Discount (${discountPercent}%):`, totalsX, y + 4);
    doc.setFont(fontName, 'bold');
    doc.setTextColor(16, 185, 129); // emerald-600
    doc.text(`-${formatCurrency(data.discount, currency)}`, totalsValX, y + 4, { align: 'right' });
    y += 6;
  }

  doc.setDrawColor(203, 213, 225); // slate-300
  doc.line(totalsX, y + 1, pageWidth - margin, y + 1);
  y += 3;

  // Total
  doc.setFont(fontName, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Total:', totalsX, y + 5);
  doc.setFontSize(13);
  doc.setTextColor(37, 99, 235); // blue-600
  doc.text(formatCurrency(data.total, currency), totalsValX, y + 5, { align: 'right' });

  y += 14;

  // --- 5. NOTES SECTION ---
  if (data.notes) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    doc.setFont(fontName, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('NOTES & PAYMENT TERMS', margin, y);

    y += 4;
    doc.setFont(fontName, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    const splitNotes = doc.splitTextToSize(data.notes, contentWidth);
    doc.text(splitNotes, margin, y);
    y += splitNotes.length * 4;
  }

  // --- 6. FOOTER ---
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont(fontName, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Generated with BillFlow — Invoice Management', margin, 290);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, 290, { align: 'right' });
  }

  return doc;
}
