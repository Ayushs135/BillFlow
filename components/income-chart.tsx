/**
 * @file components/income-chart.tsx
 * @description 6-Month Income Analytics Bar Chart Component
 * 
 * Features:
 * - Pure SVG bar chart with interactive hover tooltips.
 * - Dynamic Y-axis scaling algorithm with clean tick intervals.
 * - Multi-currency support.
 */

'use client';

import { useState } from 'react';
import { TrendingUp, DollarSign } from 'lucide-react';
import { formatCurrency, getCurrencySymbol } from '@/lib/currencies';

export interface MonthlyIncome {
  month: string;
  year: number;
  label: string; // e.g., "Jan 2026"
  shortLabel: string; // e.g., "Jan"
  amount: number;
}

interface IncomeChartProps {
  data: MonthlyIncome[];
  currency: string;
}

function formatAxisTick(val: number, currency: string): string {
  if (val === 0) return `${getCurrencySymbol(currency)}0`;

  const symbol = getCurrencySymbol(currency);
  if (val >= 1_000_000) {
    const formatted = (val / 1_000_000).toFixed(val % 1_000_000 === 0 ? 0 : 1);
    return `${symbol}${formatted}M`;
  }
  if (val >= 1_000) {
    const formatted = (val / 1_000).toFixed(val % 1_000 === 0 ? 0 : 1);
    return `${symbol}${formatted}K`;
  }
  return `${symbol}${val}`;
}

export function getNiceYAxis(maxVal: number): { ceiling: number; ticks: number[] } {
  if (maxVal <= 0) return { ceiling: 1000, ticks: [1000, 750, 500, 250, 0] };

  // Calculate order of magnitude
  const targetSteps = 4;
  const roughStep = maxVal / targetSteps;
  const magnitude = Math.max(1, Math.pow(10, Math.floor(Math.log10(roughStep))));
  const normalizedStep = roughStep / magnitude;

  let niceStep: number;
  if (normalizedStep <= 1) {
    niceStep = 1 * magnitude;
  } else if (normalizedStep <= 2) {
    niceStep = 2 * magnitude;
  } else if (normalizedStep <= 5) {
    niceStep = 5 * magnitude;
  } else {
    niceStep = 10 * magnitude;
  }

  // Calculate ceiling with sensible headroom
  let ceiling = Math.ceil((maxVal * 1.08) / niceStep) * niceStep;
  if (ceiling <= maxVal) {
    ceiling += niceStep;
  }

  const ticks: number[] = [];
  for (let t = ceiling; t >= 0; t -= niceStep) {
    ticks.push(t);
  }

  if (ticks[ticks.length - 1] !== 0) {
    ticks.push(0);
  }

  return { ceiling, ticks };
}

export default function IncomeChart({ data, currency }: IncomeChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const rawMax = Math.max(...data.map((d) => d.amount), 0);
  const hasIncome = data.some((d) => d.amount > 0);
  const totalPeriodIncome = data.reduce((sum, d) => sum + d.amount, 0);

  const { ceiling, ticks } = getNiceYAxis(rawMax);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Income Over Time</h2>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-2xs font-semibold">
              Last 6 Months
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Total revenue collected from settled payments:{' '}
            <strong className="text-slate-800">{formatCurrency(totalPeriodIncome, currency)}</strong>
          </p>
        </div>

        {hasIncome && (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg self-start sm:self-auto">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Peak Month: {formatCurrency(rawMax, currency)}</span>
          </div>
        )}
      </div>

      {!hasIncome ? (
        <div className="py-14 text-center text-slate-400 space-y-2">
          <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <DollarSign className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-slate-700">No revenue collected yet in the last 6 months</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Income will automatically populate here as invoices transition to paid status.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Responsive Scaled Chart Area */}
          <div className="relative h-60 w-full flex items-stretch gap-2 pt-2">
            {/* Y-Axis Tick Labels */}
            <div className="flex flex-col justify-between items-end pr-2 text-2xs font-mono font-medium text-slate-400 pb-7 select-none shrink-0 w-12 sm:w-16">
              {ticks.map((tick, i) => (
                <span key={i} className="leading-none">
                  {formatAxisTick(tick, currency)}
                </span>
              ))}
            </div>

            {/* Grid & Bars Container */}
            <div className="relative flex-1 flex flex-col justify-between">
              {/* Background Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between pb-7 pointer-events-none">
                {ticks.map((_, i) => (
                  <div key={i} className="border-b border-slate-100 w-full" />
                ))}
              </div>

              {/* Bars Columns */}
              <div className="relative h-full flex items-end justify-around gap-2 sm:gap-4 px-2 pb-7">
                {data.map((item, idx) => {
                  const heightPercent =
                    ceiling > 0 && item.amount > 0
                      ? Math.min(100, Math.max(3, (item.amount / ceiling) * 100))
                      : 0;
                  const isHovered = hoveredIndex === idx;

                  return (
                    <div
                      key={`${item.year}-${item.month}`}
                      className="flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer z-10"
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      {/* Interactive Tooltip */}
                      {isHovered && (
                        <div className="absolute -top-12 z-30 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold shadow-xl whitespace-nowrap animate-fade-in pointer-events-none">
                          <span className="text-slate-300">{item.label}: </span>
                          <span className="text-emerald-400 font-mono font-bold">
                            {formatCurrency(item.amount, currency)}
                          </span>
                        </div>
                      )}

                      {/* Bar Column */}
                      <div className="w-full max-w-[42px] sm:max-w-[48px] bg-slate-100/60 rounded-t-lg overflow-hidden flex flex-col justify-end h-full">
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-t-lg transition-all duration-500 ease-out ${
                            item.amount > 0
                              ? isHovered
                                ? 'bg-blue-700 shadow-md ring-2 ring-blue-400/50'
                                : 'bg-blue-600 hover:bg-blue-500'
                              : 'bg-transparent'
                          }`}
                        />
                      </div>

                      {/* Month Label below bar */}
                      <span
                        className={`absolute -bottom-6 text-2xs font-semibold transition ${
                          isHovered ? 'text-blue-600 font-bold' : 'text-slate-500'
                        }`}
                      >
                        {item.shortLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
