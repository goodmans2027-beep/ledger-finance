/**
 * mortgage.js — Mortgage Calculator (multi-property)
 * ----------------------------------------------------
 * Supports up to 5 properties via a tab interface.
 * Tracks loan amortization, equity, home value appreciation,
 * and extra payment impact.
 *
 * Mortgage.render()       — render full page, build tabs
 * Mortgage.save()         — save active tab form data
 * Mortgage.reset()        — clear active tab data
 * Mortgage.addTab()       — add new property (max 5)
 * Mortgage.removeTab(id)  — delete a property
 * Mortgage.switchTab(id)  — switch active property
 * Mortgage.exportCSV()    — export amortization schedule
 * Mortgage.exportPDF()    — export mortgage summary
 */

const Mortgage = (() => {

    let activeId = null;

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

    function fmtMonth(date) {
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    function calcMonthlyPayment(principal, annualRate, months) {
        if (annualRate === 0) return principal / months;
        const r = annualRate / 100 / 12;
        return principal * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
    }

    // Build amortization schedule with optional extra payment
    function buildSchedule(balance, annualRate, monthlyPayment, startDate, extraPayment, homeValue, appreciationRate) {
        const r = annualRate / 100 / 12;
        const monthlyApr = appreciationRate / 100 / 12;
        const schedule = [];
        let remaining = balance;
        let currentHomeValue = homeValue;
        let date = new Date(startDate + '-01');

        while (remaining > 0.01) {
            const interestPayment = remaining * r;
            let principalPayment = monthlyPayment - interestPayment + (extraPayment || 0);
            if (principalPayment > remaining) principalPayment = remaining;
            remaining -= principalPayment;
            currentHomeValue *= (1 + monthlyApr);

            schedule.push({
                date: new Date(date),
                payment: principalPayment + interestPayment,
                principal: principalPayment,
                interest: interestPayment,
                balance: Math.max(0, remaining),
                homeValue: currentHomeValue,
                equity: currentHomeValue - Math.max(0, remaining)
            });

            date.setMonth(date.getMonth() + 1);
            if (schedule.length > 600) break;
        }

        return schedule;
    }

    function getMortgages() {
        return Data.get('mortgage') || [];
    }

    function getActiveMortgage() {
        return getMortgages().find(m => m.id === activeId);
    }

    // ── TABS ─────────────────────────────────

    function renderTabs() {
        const mortgages = getMortgages();
        const tabBar = document.getElementById('mortgage-tab-bar');
        const atMax = mortgages.length >= 5;

        tabBar.innerHTML = mortgages.map(m => `
            <div class="tab ${m.id === activeId ? 'active' : ''}"
                 onclick="Mortgage.switchTab('${m.id}')">
                🏠 ${m.propertyAddress || m.lender || 'Property'}
                <span class="tab-close"
                      onclick="event.stopPropagation(); Mortgage.removeTab('${m.id}')">✕</span>
            </div>
        `).join('');

        tabBar.innerHTML += `
            <button class="tab-add" onclick="Mortgage.addTab()"
                    ${atMax ? 'disabled title="Maximum 5 properties"' : ''}>+</button>
        `;
    }

    function addTab() {
        const mortgages = getMortgages();
        if (mortgages.length >= 5) return;

        const newMortgage = {
            id: uid(),
            lender: '',
            propertyAddress: 'Property ' + (mortgages.length + 1),
            homeValue: 0,
            originalBalance: 0,
            currentBalance: 0,
            interestRate: 0,
            termMonths: 360,
            startDate: null,
            monthlyEscrow: 0,
            monthlyPMI: 0,
            extraPayment: 0,
            appreciationRate: 0
        };

        mortgages.push(newMortgage);
        Data.set('mortgage', mortgages);
        switchTab(newMortgage.id);
    }

    function removeTab(id) {
        let mortgages = getMortgages();
        if (mortgages.length === 1) {
            Toast.show('You need at least one property.');
            return;
        }
        if (!confirm('Remove this property?')) return;

        mortgages = mortgages.filter(m => m.id !== id);
        Data.set('mortgage', mortgages);
        activeId = mortgages[0].id;
        render();
    }

    function switchTab(id) {
        activeId = id;
        renderTabs();
        populateForm();
        const m = getActiveMortgage();
        if (m && m.currentBalance && m.interestRate && m.termMonths && m.startDate) {
            calculate(m);
        } else {
            clearResults();
        }
    }

    // ── FORM ─────────────────────────────────

    function populateForm() {
        const m = getActiveMortgage();
        if (!m) return;

        document.getElementById('mort-lender').value = m.lender || '';
        document.getElementById('mort-address').value = m.propertyAddress || '';
        document.getElementById('mort-home-value-input').value = m.homeValue || '';
        document.getElementById('mort-original-balance').value = m.originalBalance || '';
        document.getElementById('mort-current-balance').value = m.currentBalance || '';
        document.getElementById('mort-interest-rate').value = m.interestRate || '';
        document.getElementById('mort-term').value = m.termMonths || '';
        document.getElementById('mort-start-date').value = m.startDate || '';
        document.getElementById('mort-escrow').value = m.monthlyEscrow || '';
        document.getElementById('mort-pmi').value = m.monthlyPMI || '';
        document.getElementById('mort-extra-payment').value = m.extraPayment || '';
        document.getElementById('mort-appreciation').value = m.appreciationRate || '';
    }

    function clearResults() {
        const fields = [
            'mort-monthly-payment', 'mort-total-monthly', 'mort-remaining-balance',
            'mort-total-interest', 'mort-home-value', 'mort-equity',
            'mort-principal-paid', 'mort-interest-paid', 'mort-next-payment',
            'mort-months-saved', 'mort-interest-saved', 'mort-new-payoff'
        ];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = id.includes('payoff') || id.includes('saved') || id.includes('payment') ? '—' : '$0.00';
        });
        document.getElementById('mort-ltv').textContent = '0%';
        document.getElementById('mort-equity-pct').textContent = '0%';
        document.getElementById('mort-equity-bar').style.width = '0%';
        document.getElementById('mort-remaining-term').textContent = '— months';
        document.getElementById('mort-amortization-table').innerHTML = `
            <tr>
                <td colspan="9" style="text-align:center; color:var(--text-muted); padding:32px;">
                    Enter your mortgage details above to generate the schedule
                </td>
            </tr>`;
        if (window._mortChart) { window._mortChart.destroy(); window._mortChart = null; }
        if (window._mortChart2) { window._mortChart2.destroy(); window._mortChart2 = null; }
    }

    // ── CALCULATE ────────────────────────────

    function calculate(data) {
        const balance = parseFloat(data.currentBalance);
        const origBalance = parseFloat(data.originalBalance) || balance;
        const annualRate = parseFloat(data.interestRate);
        const termMonths = parseInt(data.termMonths);
        const startDate = data.startDate;
        const escrow = parseFloat(data.monthlyEscrow) || 0;
        const pmi = parseFloat(data.monthlyPMI) || 0;
        const extraPayment = parseFloat(data.extraPayment) || 0;
        const homeValue = parseFloat(data.homeValue) || 0;
        const appreciation = parseFloat(data.appreciationRate) || 0;

        const monthlyPI = calcMonthlyPayment(origBalance, annualRate, termMonths);
        const totalMonthly = monthlyPI + escrow + pmi;

        // Schedule without extra payment
        const scheduleNormal = buildSchedule(balance, annualRate, monthlyPI, startDate, 0, homeValue, appreciation);

        // Schedule with extra payment
        const scheduleExtra = extraPayment > 0
            ? buildSchedule(balance, annualRate, monthlyPI, startDate, extraPayment, homeValue, appreciation)
            : null;

        const totalInterest = scheduleNormal.reduce((s, r) => s + r.interest, 0);
        const payoffDate = scheduleNormal.length > 0 ? scheduleNormal[scheduleNormal.length - 1].date : null;

        // How much has been paid already
        const origSchedule = buildSchedule(origBalance, annualRate, monthlyPI, startDate, 0, homeValue, appreciation);
        const paidMonths = origSchedule.length - scheduleNormal.length;
        const interestPaid = origSchedule.slice(0, paidMonths).reduce((s, r) => s + r.interest, 0);
        const principalPaid = origBalance - balance;

        // Equity
        const equity = homeValue - balance;
        const equityPct = homeValue > 0 ? Math.round((equity / homeValue) * 100) : 0;
        const ltv = homeValue > 0 ? Math.round((balance / homeValue) * 100) : 0;

        // Next payment
        const nextPayment = scheduleNormal.length > 0 ? fmtMonth(scheduleNormal[0].date) : '—';

        // Extra payment impact
        let monthsSaved = '—';
        let interestSaved = '—';
        let newPayoffDate = '—';

        if (scheduleExtra) {
            const extraTotalInterest = scheduleExtra.reduce((s, r) => s + r.interest, 0);
            monthsSaved = (scheduleNormal.length - scheduleExtra.length) + ' months';
            interestSaved = fmt(totalInterest - extraTotalInterest);
            newPayoffDate = scheduleExtra.length > 0 ? fmtMonth(scheduleExtra[scheduleExtra.length - 1].date) : '—';
        }

        // ── Update summary cards ──
        document.getElementById('mort-monthly-payment').textContent = fmt(monthlyPI);
        document.getElementById('mort-total-monthly').textContent = fmt(totalMonthly);
        document.getElementById('mort-remaining-balance').textContent = fmt(balance);
        document.getElementById('mort-total-interest').textContent = fmt(totalInterest);
        document.getElementById('mort-home-value').textContent = fmt(homeValue);
        document.getElementById('mort-equity').textContent = fmt(equity);
        document.getElementById('mort-ltv').textContent = ltv + '%';
        document.getElementById('mort-payoff-date').textContent = payoffDate ? fmtMonth(payoffDate) : '—';

        // ── Update progress ──
        document.getElementById('mort-equity-pct').textContent = equityPct + '%';
        document.getElementById('mort-equity-bar').style.width = equityPct + '%';
        document.getElementById('mort-principal-paid').textContent = fmt(principalPaid);
        document.getElementById('mort-interest-paid').textContent = fmt(interestPaid);
        document.getElementById('mort-remaining-term').textContent = scheduleNormal.length + ' months';
        document.getElementById('mort-next-payment').textContent = nextPayment;

        // ── Update extra payment impact ──
        document.getElementById('mort-months-saved').textContent = monthsSaved;
        document.getElementById('mort-interest-saved').textContent = interestSaved;
        document.getElementById('mort-new-payoff').textContent = newPayoffDate;

        renderValueChart(scheduleNormal, scheduleExtra);
        renderAmortizationChart(scheduleNormal);
        renderTable(scheduleNormal, escrow);
    }

    // ── CHARTS ───────────────────────────────

    function renderValueChart(schedule, scheduleExtra) {
        const ctx = document.getElementById('mort-value-chart').getContext('2d');
        const sampled = schedule.filter((_, i) => i % 6 === 0);

        if (window._mortChart) window._mortChart.destroy();

        window._mortChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sampled.map(r => fmtMonth(r.date)),
                datasets: [
                    {
                        label: 'Home Value',
                        data: sampled.map(r => r.homeValue.toFixed(2)),
                        borderColor: 'rgba(107, 191, 142, 0.9)',
                        backgroundColor: 'rgba(107, 191, 142, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: 2
                    },
                    {
                        label: 'Loan Balance',
                        data: sampled.map(r => r.balance.toFixed(2)),
                        borderColor: 'rgba(217, 107, 107, 0.9)',
                        backgroundColor: 'rgba(217, 107, 107, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: 2
                    },
                    {
                        label: 'Equity',
                        data: sampled.map(r => r.equity.toFixed(2)),
                        borderColor: 'rgba(217, 119, 87, 0.9)',
                        backgroundColor: 'rgba(217, 119, 87, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: '#8A8580', font: { family: 'DM Mono', size: 10 } }
                    },
                    tooltip: { callbacks: { label: ctx => ' ' + fmt(ctx.raw) } }
                },
                scales: {
                    x: {
                        ticks: { color: '#8A8580', font: { family: 'DM Mono', size: 10 } },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        ticks: { color: '#8A8580', font: { family: 'DM Mono', size: 10 }, callback: v => v >= 1_000_000 ? '$' + (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? '$' + (v / 1_000).toFixed(0) + 'K' : '$' + v },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    }
                }
            }
        });
    }

    function renderAmortizationChart(schedule) {
        const ctx = document.getElementById('mort-amortization-chart').getContext('2d');
        const sampled = schedule.filter((_, i) => i % 6 === 0);

        if (window._mortChart2) window._mortChart2.destroy();

        window._mortChart2 = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sampled.map(r => fmtMonth(r.date)),
                datasets: [
                    {
                        label: 'Principal',
                        data: sampled.map(r => r.principal.toFixed(2)),
                        backgroundColor: 'rgba(217, 119, 87, 0.8)',
                        borderRadius: 3
                    },
                    {
                        label: 'Interest',
                        data: sampled.map(r => r.interest.toFixed(2)),
                        backgroundColor: 'rgba(217, 107, 107, 0.6)',
                        borderRadius: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ' ' + fmt(ctx.raw) } }
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: { color: '#8A8580', font: { family: 'DM Mono', size: 10 } },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        stacked: true,
                        ticks: { color: '#8A8580', font: { family: 'DM Mono', size: 10 }, callback: v => v >= 1_000_000 ? '$' + (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? '$' + (v / 1_000).toFixed(0) + 'K' : '$' + v },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    }
                }
            }
        });
    }

    // ── TABLE ────────────────────────────────

    function renderTable(schedule, escrow) {
        document.getElementById('mort-amortization-table').innerHTML = schedule.map((row, i) => `
            <tr>
                <td style="color:var(--text-muted); font-family:var(--font-mono);">${i + 1}</td>
                <td style="color:var(--text-muted);">${fmtMonth(row.date)}</td>
                <td style="font-family:var(--font-mono);">${fmt(row.payment + escrow)}</td>
                <td style="font-family:var(--font-mono); color:var(--accent);">${fmt(row.principal)}</td>
                <td style="font-family:var(--font-mono); color:var(--red);">${fmt(row.interest)}</td>
                <td style="font-family:var(--font-mono); color:var(--text-muted);">${fmt(escrow)}</td>
                <td style="font-family:var(--font-mono);">${fmt(row.balance)}</td>
                <td style="font-family:var(--font-mono); color:var(--green);">${fmt(row.homeValue)}</td>
                <td style="font-family:var(--font-mono); color:var(--accent);">${fmt(row.equity)}</td>
            </tr>
        `).join('');
    }

    // ── SAVE ─────────────────────────────────

    function save() {
        const mortgages = getMortgages();
        const index = mortgages.findIndex(m => m.id === activeId);
        if (index === -1) return;

        const updated = {
            ...mortgages[index],
            lender: document.getElementById('mort-lender').value.trim(),
            propertyAddress: document.getElementById('mort-address').value.trim() || mortgages[index].propertyAddress,
            homeValue: parseMoney(document.getElementById('mort-home-value-input').value),
            originalBalance: parseMoney(document.getElementById('mort-original-balance').value),
            currentBalance: parseMoney(document.getElementById('mort-current-balance').value),
            interestRate: parseFloat(document.getElementById('mort-interest-rate').value) || 0,
            termMonths: parseInt(document.getElementById('mort-term').value) || 360,
            startDate: document.getElementById('mort-start-date').value,
            monthlyEscrow: parseMoney(document.getElementById('mort-escrow').value),
            monthlyPMI: parseMoney(document.getElementById('mort-pmi').value),
            extraPayment: parseMoney(document.getElementById('mort-extra-payment').value),
            appreciationRate: parseFloat(document.getElementById('mort-appreciation').value) || 0
        };

        if (!updated.currentBalance || !updated.interestRate || !updated.termMonths || !updated.startDate) {
            alert('Please fill in balance, interest rate, term, and start date.');
            return;
        }

        mortgages[index] = updated;
        Data.set('mortgage', mortgages);
        renderTabs();
        calculate(updated);
        Toast.show('Mortgage saved ✓');
    }

    // ── RESET ────────────────────────────────

    function reset() {
        if (!confirm('Clear this property\'s data?')) return;
        const mortgages = getMortgages();
        const index = mortgages.findIndex(m => m.id === activeId);
        if (index === -1) return;

        mortgages[index] = {
            ...mortgages[index],
            lender: '', homeValue: 0, originalBalance: 0,
            currentBalance: 0, interestRate: 0, termMonths: 360,
            startDate: null, monthlyEscrow: 0, monthlyPMI: 0,
            extraPayment: 0, appreciationRate: 0
        };

        Data.set('mortgage', mortgages);
        populateForm();
        clearResults();
        Toast.show('Property data cleared.');
    }

    // ── EXPORT CSV ───────────────────────────

    function exportCSV() {
        const m = getActiveMortgage();
        if (!m || !m.currentBalance) { alert('No mortgage data to export.'); return; }

        const payment = calcMonthlyPayment(m.originalBalance, m.interestRate, m.termMonths);
        const schedule = buildSchedule(m.currentBalance, m.interestRate, payment, m.startDate, m.extraPayment, m.homeValue, m.appreciationRate);
        const escrow = m.monthlyEscrow || 0;

        const rows = [
            ['#', 'Date', 'Payment', 'Principal', 'Interest', 'Escrow', 'Balance', 'Home Value', 'Equity'],
            ...schedule.map((r, i) => [
                i + 1, fmtMonth(r.date),
                (r.payment + escrow).toFixed(2),
                r.principal.toFixed(2), r.interest.toFixed(2),
                escrow.toFixed(2), r.balance.toFixed(2),
                r.homeValue.toFixed(2), r.equity.toFixed(2)
            ])
        ];

        const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${m.propertyAddress || 'mortgage'}-amortization.csv`;
        a.click();
        Toast.show('CSV exported ✓');
    }

    // ── EXPORT PDF ───────────────────────────

    function exportPDF() {
        const m = getActiveMortgage();
        if (!m || !m.currentBalance) { alert('No mortgage data to export.'); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const payment = calcMonthlyPayment(m.originalBalance, m.interestRate, m.termMonths);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Mortgage Summary', 20, 20);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(`Property: ${m.propertyAddress || '—'}`, 20, 35);
        doc.text(`Lender:   ${m.lender || '—'}`, 20, 43);
        doc.text(`Balance:  $${m.currentBalance}`, 20, 51);
        doc.text(`Rate:     ${m.interestRate}%`, 20, 59);
        doc.text(`Term:     ${m.termMonths} months`, 20, 67);
        doc.text(`Monthly:  $${payment.toFixed(2)} P+I`, 20, 75);
        doc.text(`Escrow:   $${m.monthlyEscrow || 0}`, 20, 83);
        doc.text(`Home Val: $${m.homeValue}`, 20, 91);
        doc.text(`Equity:   $${(m.homeValue - m.currentBalance).toFixed(2)}`, 20, 99);

        doc.save(`${m.propertyAddress || 'mortgage'}-summary.pdf`);
        Toast.show('PDF exported ✓');
    }

    // ── RENDER (entry point) ─────────────────

    function render() {
        const mortgages = getMortgages();

        if (!mortgages.length) {
            Data.set('mortgage', [{
                id: uid(),
                lender: '',
                propertyAddress: 'Property 1',
                homeValue: 0,
                originalBalance: 0,
                currentBalance: 0,
                interestRate: 0,
                termMonths: 360,
                startDate: null,
                monthlyEscrow: 0,
                monthlyPMI: 0,
                extraPayment: 0,
                appreciationRate: 0
            }]);
        }

        const current = getMortgages();
        if (!activeId || !current.find(m => m.id === activeId)) {
            activeId = current[0].id;
        }

        renderTabs();
        populateForm();

        const m = getActiveMortgage();
        if (m && m.currentBalance && m.interestRate && m.termMonths && m.startDate) {
            calculate(m);
        } else {
            clearResults();
        }
    }

    // ── PUBLIC API ───────────────────────────
    function autoSave() {
        const mortgages = getMortgages();
        const index = mortgages.findIndex(m => m.id === activeId);
        if (index === -1) return;
        mortgages[index] = {
            ...mortgages[index],
            lender:          document.getElementById('mort-lender')?.value.trim()                    ?? mortgages[index].lender,
            propertyAddress: document.getElementById('mort-address')?.value.trim()                   || mortgages[index].propertyAddress,
            homeValue:       parseMoney(document.getElementById('mort-home-value-input')?.value      || ''),
            originalBalance: parseMoney(document.getElementById('mort-original-balance')?.value      || ''),
            currentBalance:  parseMoney(document.getElementById('mort-current-balance')?.value       || ''),
            interestRate:    parseFloat(document.getElementById('mort-interest-rate')?.value)        || 0,
            termMonths:      parseInt(document.getElementById('mort-term')?.value)                   || 360,
            startDate:       document.getElementById('mort-start-date')?.value                       || mortgages[index].startDate,
            monthlyEscrow:   parseMoney(document.getElementById('mort-escrow')?.value                || ''),
            monthlyPMI:      parseMoney(document.getElementById('mort-pmi')?.value                   || ''),
            extraPayment:    parseMoney(document.getElementById('mort-extra-payment')?.value         || ''),
            appreciationRate: parseFloat(document.getElementById('mort-appreciation')?.value)        || 0,
        };
        Data.set('mortgage', mortgages);
    }

    return { render, save, autoSave, reset, addTab, removeTab, switchTab, exportCSV, exportPDF };

})();