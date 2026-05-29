/**
 * charts.js — Reusable Chart Rendering
 * --------------------------------------
 * Pure rendering functions. Takes data in, draws to canvas.
 * No data fetching — all data passed as arguments.
 * Uses Chart.js loaded via CDN in index.html.
 *
 * Charts.amortization(canvasId, schedule)   — area chart, principal vs interest over time
 * Charts.growthProjection(canvasId, data)   — line chart, investment value over 5/10/20/30yr
 * Charts.budgetDonut(canvasId, categories)  — donut chart, budget allocation breakdown
 * Charts.netWorthBar(canvasId, breakdown)   — stacked bar, assets vs liabilities
 * Charts.taxBreakdown(canvasId, taxData)    — bar chart, federal/state/local split
 */
