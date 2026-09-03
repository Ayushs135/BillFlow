/**
 * @file lib/currencies.ts
 * @description Multi-Currency Formatting & Metadata Catalog
 * 
 * Supports 9 major international currencies (USD, EUR, GBP, INR, CAD, AUD, JPY, SGD, AED)
 * with robust `Intl.NumberFormat` localization and fallback symbol mapping.
 */

export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
  display: string;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', display: 'USD ($) - US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro', display: 'EUR (€) - Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound', display: 'GBP (£) - British Pound' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', display: 'INR (₹) - Indian Rupee' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', display: 'CAD (CA$) - Canadian Dollar' },
  { code: 'AUD', symbol: 'AU$', name: 'Australian Dollar', display: 'AUD (AU$) - Australian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', display: 'JPY (¥) - Japanese Yen' },
  { code: 'SGD', symbol: 'SG$', name: 'Singapore Dollar', display: 'SGD (SG$) - Singapore Dollar' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', display: 'AED (AED) - UAE Dirham' },
];

export function getCurrencySymbol(code: string): string {
  const match = SUPPORTED_CURRENCIES.find((c) => c.code.toUpperCase() === code.toUpperCase());
  return match ? match.symbol : code;
}

export function formatCurrency(amount: number | string, currencyCode: string = 'USD'): string {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numericAmount)) return '0.00';
  
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  } catch {
    const symbol = getCurrencySymbol(currencyCode);
    return `${symbol}${numericAmount.toFixed(2)}`;
  }
}
