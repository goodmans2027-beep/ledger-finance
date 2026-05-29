/**
 * investments.js — Investment Portfolio Tracker
 * -----------------------------------------------
 * Tracks holdings across pre-tax, tax-free, and taxable accounts.
 * Supports per-paycheck contributions with frequency conversion.
 * Projects compound growth with monthly contributions.
 */

const Investments = (() => {

    // Track whether add form is open
    let addFormOpen = true;

    // Drag-and-drop state
    let _dragId    = null;
    let _dragOverEl = null;

    // ── HELPERS ──────────────────────────────

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }

    function fmt(n) {
        return '$' + Number(n).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function getHoldings() {
        return Data.get('investments')?.holdings || [];
    }

    function saveHoldings(holdings) {
        Data.set('investments', {
            ...Data.get('investments'),
            holdings
        });
    }

    // Convert paycheck contribution to monthly based on frequency
    function toMonthly(amount, frequency) {
        const multipliers = {
            weekly: 52 / 12,
            biweekly: 26 / 12,
            semimonthly: 24 / 12,
            monthly: 1
        };
        return amount * (multipliers[frequency] || 1);
    }

    // Convert monthly contribution to per-paycheck amount
    function toPaycheck(monthly, frequency) {
        const divisors = {
            weekly: 52 / 12,
            biweekly: 26 / 12,
            semimonthly: 24 / 12,
            monthly: 1
        };
        return monthly / (divisors[frequency] || 1);
    }

    function frequencyLabel(freq) {
        const labels = {
            weekly: 'Weekly',
            biweekly: 'Bi-Weekly',
            semimonthly: 'Semi-Monthly',
            monthly: 'Monthly'
        };
        return labels[freq] || 'Monthly';
    }

    function typeLabel(type) {
        const labels = {
            pretax: 'Pre-Tax',
            taxfree: 'Tax-Free (Roth)',
            taxable: 'Taxable',
            hsa: 'HSA',
            annuity: 'Annuity',
            other: 'Other'
        };
        return labels[type] || type;
    }

    function typeBadge(type) {
        const badges = {
            pretax: 'badge-accent',
            taxfree: 'badge-green',
            taxable: 'badge-blue',
            hsa: 'badge-magenta',
            annuity: 'badge-muted',
            other: 'badge-muted'
        };
        return badges[type] || 'badge-muted';
    }

    // Project future value with monthly contributions
    function projectValue(currentValue, annualReturn, monthlyContrib, years) {
        const months = years * 12;
        const r = annualReturn / 100 / 12;
        if (r === 0) return currentValue + monthlyContrib * months;
        return currentValue * Math.pow(1 + r, months) +
            monthlyContrib * ((Math.pow(1 + r, months) - 1) / r);
    }

    // ── CONTRIBUTION SYNC ────────────────────

    // Sync paycheck ↔ monthly fields in the Add form
    function syncContribution(source) {
        const freq = document.getElementById('inv-pay-frequency').value;
        if (source === 'paycheck') {
            const per = parseMoney(document.getElementById('inv-paycheck-contrib').value);
            const monthly = toMonthly(per, freq);
            const el = document.getElementById('inv-monthly-contrib');
            el.value = monthly > 0 ? monthly.toFixed(2) : '';
            if (monthly > 0) CurrencyInput.apply(el);
        } else {
            const monthly = parseMoney(document.getElementById('inv-monthly-contrib').value);
            const paycheck = toPaycheck(monthly, freq);
            const el = document.getElementById('inv-paycheck-contrib');
            el.value = paycheck > 0 ? paycheck.toFixed(2) : '';
            if (paycheck > 0) CurrencyInput.apply(el);
        }
    }

    // Sync paycheck ↔ monthly fields in the Edit modal
    function syncEditContribution(source) {
        const freq = document.getElementById('inv-edit-pay-frequency').value;
        if (source === 'paycheck') {
            const per = parseMoney(document.getElementById('inv-edit-paycheck-contrib').value);
            const monthly = toMonthly(per, freq);
            const el = document.getElementById('inv-edit-monthly-contrib');
            el.value = monthly > 0 ? monthly.toFixed(2) : '';
            if (monthly > 0) CurrencyInput.apply(el);
        } else {
            const monthly = parseMoney(document.getElementById('inv-edit-monthly-contrib').value);
            const paycheck = toPaycheck(monthly, freq);
            const el = document.getElementById('inv-edit-paycheck-contrib');
            el.value = paycheck > 0 ? paycheck.toFixed(2) : '';
            if (paycheck > 0) CurrencyInput.apply(el);
        }
    }

    // ── TOGGLE ADD FORM ──────────────────────

    function toggleAddForm() {
        addFormOpen = !addFormOpen;
        const form = document.getElementById('inv-add-form');
        const chevron = document.getElementById('inv-add-chevron');
        form.style.display = addFormOpen ? 'block' : 'none';
        chevron.style.transform = addFormOpen ? 'rotate(0deg)' : 'rotate(-90deg)';
    }

    // ── RENDER ───────────────────────────────

    function render() {
        renderSummaryCards();
        renderHoldingsTable();
        renderDonutChart();
        renderComposition();
        renderProjectionChart();
        renderBucketChart();
    }

    function renderSummaryCards() {
        const holdings = getHoldings();

        const totalValue = holdings.reduce((s, h) => s + (h.currentValue || 0), 0);
        const totalContributed = holdings.reduce((s, h) => s + (h.amountContributed || 0), 0);
        const totalGain = totalValue - totalContributed;
        const blended = totalValue > 0
            ? holdings.reduce((s, h) => s + (h.expectedReturn || 0) * (h.currentValue || 0), 0) / totalValue
            : 0;

        const pretax = holdings.filter(h => h.type === 'pretax').reduce((s, h) => s + (h.currentValue || 0), 0);
        const taxfree = holdings.filter(h => h.type === 'taxfree').reduce((s, h) => s + (h.currentValue || 0), 0);
        const taxable = holdings.filter(h => !['pretax', 'taxfree'].includes(h.type)).reduce((s, h) => s + (h.currentValue || 0), 0);

        document.getElementById('inv-total-value').textContent = fmt(totalValue);
        document.getElementById('inv-total-contributed').textContent = fmt(totalContributed);
        document.getElementById('inv-total-gain').textContent = (totalGain >= 0 ? '+' : '') + fmt(totalGain);
        document.getElementById('inv-total-gain').className = 'value ' + (totalGain >= 0 ? 'value-green' : 'value-red');
        document.getElementById('inv-blended-return').textContent = blended.toFixed(2) + '%';
        document.getElementById('inv-pretax-total').textContent = fmt(pretax);
        document.getElementById('inv-taxfree-total').textContent = fmt(taxfree);
        document.getElementById('inv-taxable-total').textContent = fmt(taxable);
    }

    function renderHoldingsTable() {
        const holdings = getHoldings();
        const tbody = document.getElementById('inv-holdings-table');
        const tfoot = document.getElementById('inv-holdings-totals');

        if (!holdings.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" style="text-align:center; color:var(--text-muted); padding:32px;">
                        No holdings yet. Add your first investment above.
                    </td>
                </tr>`;
            tfoot.innerHTML = '';
            return;
        }

        tbody.innerHTML = holdings.map(h => {
            const gain = (h.currentValue || 0) - (h.amountContributed || 0);
            const gainPct = h.amountContributed > 0
                ? ((gain / h.amountContributed) * 100).toFixed(1) : '0.0';
            const gainCls = gain >= 0 ? 'value-green' : 'value-red';
            const gainPfx = gain >= 0 ? '+' : '';
            const monthly = h.monthlyContrib || 0;
            const paycheck = toPaycheck(monthly, h.payFrequency || 'biweekly');

            const barPct = h.currentValue > 0
                ? Math.min(100, Math.abs(gain) / h.currentValue * 100).toFixed(1) : 0;
            const barColor = gain >= 0 ? 'var(--green)' : 'var(--red)';

            return `<tr draggable="true" data-id="${h.id}">
                <td class="drag-handle" title="Drag to reorder">⠿</td>
                <td style="font-weight:500;">${h.name}
                    <div style="margin-top:4px; height:3px; background:var(--surface2); border-radius:99px; overflow:hidden; width:80px;">
                        <div style="height:100%; width:${barPct}%; background:${barColor}; border-radius:99px;"></div>
                    </div>
                </td>
                <td style="font-family:var(--font-mono); color:var(--text-muted);">${h.ticker ? h.ticker.toUpperCase() : '—'}</td>
                <td><span class="badge ${typeBadge(h.type)}">${typeLabel(h.type)}</span></td>
                <td style="font-family:var(--font-mono);">${fmt(h.amountContributed || 0)}</td>
                <td style="font-family:var(--font-mono);">${fmt(h.currentValue || 0)}</td>
                <td style="font-family:var(--font-mono);" class="${gainCls}">
                    ${gainPfx}${fmt(gain)}
                    <div style="font-size:0.72rem;">(${gainPfx}${gainPct}%)</div>
                </td>
                <td style="font-family:var(--font-mono); color:var(--accent);">${h.expectedReturn || 0}%</td>
                <td style="font-size:0.78rem; color:var(--text-muted);">${frequencyLabel(h.payFrequency || 'biweekly')}</td>
                <td style="font-family:var(--font-mono);">${fmt(paycheck)}</td>
                <td style="font-family:var(--font-mono);">${fmt(monthly)}</td>
                <td>
                    <div style="display:flex; gap:6px;">
                        <button class="edit-row-btn"
                                onclick="Investments.openEditModal('${h.id}')"
                                title="Edit">✎</button>
                        <button class="delete-row-btn"
                                onclick="Investments.removeHolding('${h.id}')">✕</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        attachDragListeners(tbody);

        // ── Totals footer ──
        const totalContributed = holdings.reduce((s, h) => s + (h.amountContributed || 0), 0);
        const totalValue = holdings.reduce((s, h) => s + (h.currentValue || 0), 0);
        const totalGain = totalValue - totalContributed;
        const totalMonthly = holdings.reduce((s, h) => s + (h.monthlyContrib || 0), 0);
        const gainCls = totalGain >= 0 ? 'value-green' : 'value-red';

        tfoot.innerHTML = `
            <tr style="border-top: 2px solid var(--border); font-weight:600;">
                <td colspan="4" style="padding:12px 14px; font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Totals</td>
                <td style="font-family:var(--font-mono); padding:12px 14px;">${fmt(totalContributed)}</td>
                <td style="font-family:var(--font-mono); padding:12px 14px;">${fmt(totalValue)}</td>
                <td style="font-family:var(--font-mono); padding:12px 14px;" class="${gainCls}">
                    ${totalGain >= 0 ? '+' : ''}${fmt(totalGain)}
                </td>
                <td colspan="3" style="padding:12px 14px;"></td>
                <td style="font-family:var(--font-mono); padding:12px 14px;">${fmt(totalMonthly)}</td>
                <td style="padding:12px 14px;"></td>
            </tr>`;
    }

    // ── DONUT CHART ──────────────────────────

    function renderDonutChart() {
        const holdings = getHoldings();
        const ctx = document.getElementById('inv-donut-chart').getContext('2d');

        if (window._invDonut) window._invDonut.destroy();
        if (!holdings.length) return;

        const buckets = {
            'Pre-Tax': { value: 0, color: 'rgba(217, 119, 87, 0.85)' },
            'Tax-Free (Roth)': { value: 0, color: 'rgba(107, 191, 142, 0.85)' },
            'Taxable': { value: 0, color: 'rgba(107, 159, 217, 0.85)' },
            'HSA': { value: 0, color: 'rgba(168, 127, 202, 0.85)' },
            'Other': { value: 0, color: 'rgba(138, 133, 128, 0.85)' }
        };

        holdings.forEach(h => {
            const key = typeLabel(h.type);
            if (buckets[key]) buckets[key].value += h.currentValue || 0;
            else if (buckets['Other']) buckets['Other'].value += h.currentValue || 0;
        });

        const active = Object.entries(buckets).filter(([_, b]) => b.value > 0);
        const total = active.reduce((s, [_, b]) => s + b.value, 0);

        window._invDonut = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: active.map(([label]) => label),
                datasets: [{
                    data: active.map(([_, b]) => b.value.toFixed(2)),
                    backgroundColor: active.map(([_, b]) => b.color),
                    borderWidth: 0,
                    borderColor: 'transparent'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.label}: ${fmt(parseFloat(ctx.raw))}`
                        }
                    }
                }
            }
        });

        // Custom legend
        const legend = document.getElementById('inv-donut-legend');
        legend.innerHTML = active.map(([label, b]) => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="width:10px; height:10px; border-radius:2px; background:${b.color}; flex-shrink:0;"></div>
                    <span style="font-size:0.78rem; color:var(--text-muted);">${label}</span>
                </div>
                <div style="text-align:right;">
                    <div style="font-family:var(--font-mono); font-size:0.78rem;">${fmt(b.value)}</div>
                    <div style="font-size:0.7rem; color:var(--text-faint);">${total > 0 ? ((b.value / total) * 100).toFixed(1) : 0}%</div>
                </div>
            </div>
        `).join('');
    }

    // ── COMPOSITION BARS ─────────────────────

    function renderComposition() {
        const holdings = getHoldings();
        const el = document.getElementById('inv-composition');
        if (!holdings.length) {
            el.innerHTML = '<p style="color:var(--text-muted); font-size:0.83rem;">No holdings yet.</p>';
            return;
        }

        const totalValue = holdings.reduce((s, h) => s + (h.currentValue || 0), 0);
        const colors = {
            pretax: 'var(--accent)',
            taxfree: 'var(--green)',
            taxable: 'var(--blue)',
            hsa: '#9471B1',
            annuity: 'var(--text-muted)',
            other: 'var(--text-faint)'
        };

        // Group by type
        const grouped = {};
        holdings.forEach(h => {
            if (!grouped[h.type]) grouped[h.type] = 0;
            grouped[h.type] += h.currentValue || 0;
        });

        // Use largest bucket as 100% of bar width
        const maxValue = Math.max(...Object.values(grouped));

        el.innerHTML = Object.entries(grouped)
            .sort((a, b) => b[1] - a[1])
            .map(([type, value]) => {
                const pctOfTotal = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : 0;
                const barWidth = maxValue > 0 ? ((value / maxValue) * 100).toFixed(1) : 0;
                const color = colors[type] || 'var(--accent)';
                return `
                <div>
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px;">
                        <span style="color:var(--text-muted);">${typeLabel(type)}</span>
                        <span style="font-family:var(--font-mono); color:${color};">
                            ${fmt(value)}
                            <span style="color:var(--text-faint); font-size:0.72rem;">${pctOfTotal}%</span>
                        </span>
                    </div>
                    <div class="progress-bar-wrap">
                        <div class="progress-bar" style="width:${barWidth}%; background:${color};"></div>
                    </div>
                </div>`;
            }).join('');
    }

    // ── PROJECTION CHARTS ────────────────────

    function renderProjectionChart() {
        const holdings = getHoldings();
        const years = parseInt(document.getElementById('inv-projection-years')?.value || 30);
        const ctx = document.getElementById('inv-projection-chart').getContext('2d');

        if (window._invChart) window._invChart.destroy();
        if (!holdings.length) return;

        const labels = Array.from({ length: years + 1 }, (_, i) =>
            (new Date().getFullYear() + i).toString()
        );

        const totalProjection = labels.map((_, i) =>
            holdings.reduce((sum, h) =>
                sum + projectValue(h.currentValue || 0, h.expectedReturn || 0, h.monthlyContrib || 0, i), 0)
        );

        const contributionLine = labels.map((_, i) => {
            const totalMonthly = holdings.reduce((s, h) => s + (h.monthlyContrib || 0), 0);
            const totalCurrent = holdings.reduce((s, h) => s + (h.currentValue || 0), 0);
            return totalCurrent + totalMonthly * i * 12;
        });

        window._invChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Projected Value',
                        data: totalProjection.map(v => v.toFixed(2)),
                        borderColor: 'rgba(107, 191, 142, 0.9)',
                        backgroundColor: 'rgba(107, 191, 142, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 2
                    },
                    {
                        label: 'Contributions Only',
                        data: contributionLine.map(v => v.toFixed(2)),
                        borderColor: 'rgba(217, 119, 87, 0.6)',
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.1,
                        borderDash: [5, 5],
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                layout: { padding: { left: 8 } },
                plugins: {
                    legend: { display: true, labels: { color: '#8A8580', font: { family: 'DM Mono', size: 10 } } },
                    tooltip: { callbacks: { label: ctx => ' ' + fmt(parseFloat(ctx.raw)) } }
                },
                scales: {
                    x: { ticks: { color: '#8A8580', font: { family: 'DM Mono', size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#8A8580', font: { family: 'DM Mono', size: 10 }, callback: v => v >= 1_000_000 ? '$' + (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? '$' + (v / 1_000).toFixed(0) + 'K' : '$' + v }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        });
    }

    function renderBucketChart() {
        const holdings = getHoldings();
        const years = parseInt(document.getElementById('inv-bucket-years')?.value || 30);
        const ctx = document.getElementById('inv-bucket-chart').getContext('2d');

        if (window._invBucketChart) window._invBucketChart.destroy();
        if (!holdings.length) return;

        const labels = Array.from({ length: years + 1 }, (_, i) => (new Date().getFullYear() + i).toString());
        const buckets = {
            pretax:  { label: 'Pre-Tax',        color: 'rgba(217, 119, 87,  0.8)', holdings: holdings.filter(h => h.type === 'pretax') },
            taxfree: { label: 'Tax-Free (Roth)', color: 'rgba(107, 191, 142, 0.8)', holdings: holdings.filter(h => h.type === 'taxfree') },
            taxable: { label: 'Taxable',         color: 'rgba(107, 159, 217, 0.8)', holdings: holdings.filter(h => h.type === 'taxable') },
            hsa:     { label: 'HSA',             color: 'rgba(168, 127, 202, 0.8)', holdings: holdings.filter(h => h.type === 'hsa') },
            other:   { label: 'Other',           color: 'rgba(138, 133, 128, 0.8)', holdings: holdings.filter(h => !['pretax', 'taxfree', 'taxable', 'hsa'].includes(h.type)) }
        };

        const datasets = Object.values(buckets)
            .filter(b => b.holdings.some(h => (h.currentValue || 0) > 0 || (h.monthlyContrib || 0) > 0))
            .map(b => ({
                label: b.label,
                data: labels.map((_, i) =>
                    b.holdings.reduce((sum, h) =>
                        sum + projectValue(h.currentValue || 0, h.expectedReturn || 0, h.monthlyContrib || 0, i), 0
                    ).toFixed(2)
                ),
                backgroundColor: b.color,
                borderRadius: 3,
                hidden: false
            }));

        const fmtK = v => {
            if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
            if (v >= 1_000)     return '$' + (v / 1_000).toFixed(0) + 'K';
            return '$' + v;
        };

        window._invBucketChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                layout: { padding: { left: 8 } },
                plugins: {
                    legend: { display: true, labels: { color: '#8A8580', font: { family: 'DM Mono', size: 10 } } },
                    tooltip: { callbacks: { label: ctx => ' ' + fmt(parseFloat(ctx.raw)) } }
                },
                scales: {
                    x: { stacked: true, ticks: { color: '#8A8580', font: { family: 'DM Mono', size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { stacked: true, ticks: { color: '#8A8580', font: { family: 'DM Mono', size: 10 }, callback: fmtK }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        });
    }

    // ── DRAG AND DROP ────────────────────────

    function attachDragListeners(tbody) {
        // Guard: only attach once per tbody element; re-renders reuse the same tbody
        if (tbody.dataset.dragReady) return;
        tbody.dataset.dragReady = '1';

        function clearOver() {
            if (_dragOverEl) { _dragOverEl.classList.remove('drag-over'); _dragOverEl = null; }
        }

        tbody.addEventListener('dragstart', function (e) {
            const row = e.target.closest('tr[data-id]');
            if (!row) return;
            _dragId = row.dataset.id;
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => row.classList.add('dragging'), 0);
        });

        tbody.addEventListener('dragend', function () {
            tbody.querySelectorAll('tr.dragging').forEach(r => r.classList.remove('dragging'));
            clearOver();
            _dragId = null;
        });

        tbody.addEventListener('dragover', function (e) {
            e.preventDefault();
            const row = e.target.closest('tr[data-id]');
            // No valid target or hovering over self — clear highlight and bail
            if (!row || row.dataset.id === _dragId) { clearOver(); return; }
            // Same row as before — skip all DOM work
            if (row === _dragOverEl) return;
            clearOver();
            _dragOverEl = row;
            row.classList.add('drag-over');
        });

        tbody.addEventListener('dragleave', function (e) {
            if (!tbody.contains(e.relatedTarget)) clearOver();
        });

        tbody.addEventListener('drop', function (e) {
            e.preventDefault();
            const toRow = e.target.closest('tr[data-id]');
            if (!toRow || !_dragId || toRow.dataset.id === _dragId) { clearOver(); return; }

            const holdings = getHoldings();
            const fromIdx = holdings.findIndex(h => h.id === _dragId);
            const toIdx   = holdings.findIndex(h => h.id === toRow.dataset.id);
            if (fromIdx === -1 || toIdx === -1) { clearOver(); return; }

            const [moved] = holdings.splice(fromIdx, 1);
            // When dragging DOWN, removing fromIdx shifts every later index by -1,
            // so the target slot is now at toIdx-1.
            holdings.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, moved);
            saveHoldings(holdings);
            clearOver();
            renderHoldingsTable();
        });
    }

    // ── ADD / REMOVE ─────────────────────────

    function addHolding() {
        const name = document.getElementById('inv-name').value.trim();
        const ticker = document.getElementById('inv-ticker').value.trim().toUpperCase();
        const institution = document.getElementById('inv-institution').value.trim();
        const type = document.getElementById('inv-type').value;
        const contributed = parseMoney(document.getElementById('inv-contributed').value);
        const currentValue = parseMoney(document.getElementById('inv-current-value').value);
        const returnRate = parseFloat(document.getElementById('inv-return-rate').value) || 0;
        const payFrequency = document.getElementById('inv-pay-frequency').value;
        const monthly = parseMoney(document.getElementById('inv-monthly-contrib').value);

        if (!name) { Toast.show('Please enter a holding name.'); return; }
        if (!currentValue) { Toast.show('Please enter a current value.'); return; }

        const holdings = getHoldings();
        holdings.push({
            id: uid(), name, ticker, institution, type,
            amountContributed: contributed,
            currentValue, expectedReturn: returnRate,
            payFrequency, monthlyContrib: monthly
        });

        saveHoldings(holdings);

        // Clear form
        ['inv-name', 'inv-ticker', 'inv-institution', 'inv-contributed',
            'inv-current-value', 'inv-return-rate', 'inv-paycheck-contrib', 'inv-monthly-contrib']
            .forEach(id => { document.getElementById(id).value = ''; });

        // Collapse form after adding
        if (addFormOpen) toggleAddForm();

        render();
        Toast.show('Holding added ✓');
    }

    function removeHolding(id) {
        if (!confirm('Remove this holding?')) return;
        saveHoldings(getHoldings().filter(h => h.id !== id));
        render();
        Toast.show('Holding removed.');
    }

    // ── EDIT MODAL ───────────────────────────

    function openEditModal(id) {
        const holding = getHoldings().find(h => h.id === id);
        if (!holding) return;

        const monthly = holding.monthlyContrib || 0;
        const freq = holding.payFrequency || 'biweekly';
        const paycheck = toPaycheck(monthly, freq);

        document.getElementById('inv-edit-id').value = holding.id;
        document.getElementById('inv-edit-name').value = holding.name || '';
        document.getElementById('inv-edit-ticker').value = holding.ticker || '';
        document.getElementById('inv-edit-institution').value = holding.institution || '';
        document.getElementById('inv-edit-type').value = holding.type || 'pretax';
        document.getElementById('inv-edit-contributed').value = holding.amountContributed || '';
        document.getElementById('inv-edit-current-value').value = holding.currentValue || '';
        document.getElementById('inv-edit-return-rate').value = holding.expectedReturn || '';
        document.getElementById('inv-edit-pay-frequency').value = freq;
        document.getElementById('inv-edit-paycheck-contrib').value = paycheck > 0 ? paycheck.toFixed(2) : '';
        document.getElementById('inv-edit-monthly-contrib').value = monthly > 0 ? monthly.toFixed(2) : '';

        document.getElementById('inv-edit-modal').classList.add('open');
        CurrencyInput.applyAll();
    }

    function closeEditModal() {
        document.getElementById('inv-edit-modal').classList.remove('open');
    }

    function saveEdit() {
        const id = document.getElementById('inv-edit-id').value;
        const holdings = getHoldings();
        const index = holdings.findIndex(h => h.id === id);
        if (index === -1) return;

        const name = document.getElementById('inv-edit-name').value.trim();
        if (!name) { Toast.show('Please enter a name.'); return; }

        holdings[index] = {
            ...holdings[index],
            name,
            ticker: document.getElementById('inv-edit-ticker').value.trim().toUpperCase(),
            institution: document.getElementById('inv-edit-institution').value.trim(),
            type: document.getElementById('inv-edit-type').value,
            amountContributed: parseMoney(document.getElementById('inv-edit-contributed').value),
            currentValue: parseMoney(document.getElementById('inv-edit-current-value').value),
            expectedReturn: parseFloat(document.getElementById('inv-edit-return-rate').value) || 0,
            payFrequency: document.getElementById('inv-edit-pay-frequency').value,
            monthlyContrib: parseMoney(document.getElementById('inv-edit-monthly-contrib').value)
        };

        saveHoldings(holdings);
        closeEditModal();
        render();
        Toast.show('Holding updated ✓');
    }

    // ── EXPORT CSV ───────────────────────────

    function exportCSV() {
        const holdings = getHoldings();
        if (!holdings.length) { alert('No holdings to export.'); return; }

        const rows = [
            ['Name', 'Ticker', 'Institution', 'Type', 'Contributed', 'Current Value',
                'Gain/Loss', 'Return %', 'Pay Frequency', 'Per Paycheck', 'Monthly Contrib'],
            ...holdings.map(h => {
                const gain = (h.currentValue || 0) - (h.amountContributed || 0);
                const monthly = h.monthlyContrib || 0;
                const paycheck = toPaycheck(monthly, h.payFrequency || 'biweekly');
                return [
                    h.name, h.ticker || '', h.institution || '',
                    typeLabel(h.type),
                    (h.amountContributed || 0).toFixed(2),
                    (h.currentValue || 0).toFixed(2),
                    gain.toFixed(2),
                    (h.expectedReturn || 0).toFixed(2),
                    frequencyLabel(h.payFrequency || 'biweekly'),
                    paycheck.toFixed(2),
                    monthly.toFixed(2)
                ];
            })
        ];

        const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'investments.csv';
        a.click();
        Toast.show('CSV exported ✓');
    }

    // ── EXPORT PDF ───────────────────────────

    function exportPDF() {
        const holdings = getHoldings();
        if (!holdings.length) { alert('No holdings to export.'); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Investment Portfolio Summary', 20, 20);

        const totalValue = holdings.reduce((s, h) => s + (h.currentValue || 0), 0);
        const totalContr = holdings.reduce((s, h) => s + (h.amountContributed || 0), 0);
        const totalMon = holdings.reduce((s, h) => s + (h.monthlyContrib || 0), 0);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(`Total Portfolio Value:    ${fmt(totalValue)}`, 20, 35);
        doc.text(`Total Contributed:        ${fmt(totalContr)}`, 20, 43);
        doc.text(`Total Gain/Loss:          ${fmt(totalValue - totalContr)}`, 20, 51);
        doc.text(`Total Monthly Contrib:    ${fmt(totalMon)}`, 20, 59);

        let y = 73;
        doc.setFont('helvetica', 'bold');
        doc.text('Holdings:', 20, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        holdings.forEach(h => {
            if (y > 270) { doc.addPage(); y = 20; }
            const monthly = h.monthlyContrib || 0;
            doc.text(
                `${h.name} (${typeLabel(h.type)}) — ${fmt(h.currentValue || 0)} @ ${h.expectedReturn || 0}% — ${fmt(monthly)}/mo`,
                20, y
            );
            y += 7;
        });

        doc.save('investment-portfolio.pdf');
        Toast.show('PDF exported ✓');
    }

    // ── PUBLIC API ───────────────────────────
    return {
        render, addHolding, removeHolding,
        toggleAddForm, syncContribution, syncEditContribution,
        renderProjectionChart, renderBucketChart,
        openEditModal, closeEditModal, saveEdit,
        exportCSV, exportPDF
    };

})();