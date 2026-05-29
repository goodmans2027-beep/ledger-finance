/**
 * car-loan.js — Car Loan Calculator (multi-vehicle)
 * ---------------------------------------------------
 * Supports up to 5 vehicles via a tab interface.
 * Each vehicle is stored as an object in the carLoan array in data.js.
 *
 * CarLoan.render()       — render the full page, build tabs
 * CarLoan.save()         — save active tab's form data
 * CarLoan.reset()        — clear active tab's data
 * CarLoan.addTab()       — add a new vehicle (max 5)
 * CarLoan.removeTab(id)  — delete a vehicle
 * CarLoan.switchTab(id)  — switch active vehicle
 * CarLoan.exportCSV()    — export active vehicle amortization
 * CarLoan.exportPDF()    — export active vehicle summary
 */

const CarLoan = (() => {

    // Track which vehicle tab is active
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

    function buildSchedule(balance, annualRate, monthlyPayment, startDate) {
        const r = annualRate / 100 / 12;
        const schedule = [];
        let remaining = balance;
        let date = new Date(startDate + '-01');

        while (remaining > 0.01) {
            const interestPayment = remaining * r;
            let principalPayment = monthlyPayment - interestPayment;
            if (principalPayment > remaining) principalPayment = remaining;
            remaining -= principalPayment;

            schedule.push({
                date: new Date(date),
                payment: principalPayment + interestPayment,
                principal: principalPayment,
                interest: interestPayment,
                balance: Math.max(0, remaining)
            });

            date.setMonth(date.getMonth() + 1);
            if (schedule.length > 600) break;
        }

        return schedule;
    }

    function getLoans() {
        return Data.get('carLoan') || [];
    }

    function getActiveLoan() {
        return getLoans().find(l => l.id === activeId);
    }

    // ── TABS ─────────────────────────────────

    function renderTabs() {
        const loans = getLoans();
        const tabBar = document.getElementById('car-tab-bar');
        const atMax = loans.length >= 5;

        if (!loans.length) {
            tabBar.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:16px;
                            padding:18px 16px; border:1px solid var(--border); border-radius:var(--radius);
                            background:var(--surface);">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="font-size:1.45rem;">🚗</div>
                        <div>
                            <div style="font-weight:500; color:var(--text); margin-bottom:4px;">No car loans yet</div>
                            <div style="color:var(--text-muted); font-size:0.92rem; max-width:320px;">Add a vehicle to track your auto loans, balances, and payoff timeline.</div>
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="CarLoan.addTab()">+ Add Vehicle</button>
                </div>
            `;
            return;
        }

        tabBar.innerHTML = loans.map(loan => `
            <div class="tab ${loan.id === activeId ? 'active' : ''}"
                 onclick="CarLoan.switchTab('${loan.id}')">
                🚗 ${loan.vehicleName || 'Vehicle'}
                <span class="tab-close"
                      onclick="event.stopPropagation(); CarLoan.removeTab('${loan.id}')">✕</span>
            </div>
        `).join('');

        tabBar.innerHTML += `
            <button class="tab-add" onclick="CarLoan.addTab()" 
                    ${atMax ? 'disabled title="Maximum 5 vehicles"' : ''}>+</button>
        `;
    }

    function addTab() {
        const loans = getLoans();
        if (loans.length >= 5) return;

        const newLoan = {
            id: uid(),
            lender: '',
            vehicleName: 'Vehicle ' + (loans.length + 1),
            originalBalance: 0,
            currentBalance: 0,
            interestRate: 0,
            termMonths: 0,
            startDate: null,
            monthlyPayment: 0
        };

        loans.push(newLoan);
        Data.set('carLoan', loans);
        switchTab(newLoan.id);
    }

    function removeTab(id) {
        let loans = getLoans();
        if (!confirm('Remove this vehicle?')) return;

        loans = loans.filter(l => l.id !== id);
        Data.set('carLoan', loans);

        activeId = loans.length ? loans[0].id : null;
        render();
    }

    function switchTab(id) {
        activeId = id;
        renderTabs();
        populateForm();
        const loan = getActiveLoan();
        if (loan && loan.currentBalance && loan.interestRate && loan.termMonths && loan.startDate) {
            calculate(loan);
        } else {
            clearResults();
        }
    }

    // ── FORM ─────────────────────────────────

    function populateForm() {
        const loan = getActiveLoan();
        if (!loan) {
            clearForm();
            return;
        }

        document.getElementById('car-lender').value = loan.lender || '';
        document.getElementById('car-vehicle').value = loan.vehicleName || '';
        document.getElementById('car-original-balance').value = loan.originalBalance || '';
        document.getElementById('car-current-balance').value = loan.currentBalance || '';
        document.getElementById('car-interest-rate').value = loan.interestRate || '';
        document.getElementById('car-term').value = loan.termMonths || '';
        document.getElementById('car-start-date').value = loan.startDate || '';
        document.getElementById('car-payment-override').value = loan.monthlyPayment || '';
    }

    function clearForm() {
        document.getElementById('car-lender').value = '';
        document.getElementById('car-vehicle').value = '';
        document.getElementById('car-original-balance').value = '';
        document.getElementById('car-current-balance').value = '';
        document.getElementById('car-interest-rate').value = '';
        document.getElementById('car-term').value = '';
        document.getElementById('car-start-date').value = '';
        document.getElementById('car-payment-override').value = '';
    }

    function clearResults() {
        document.getElementById('car-monthly-payment').textContent = '$0.00';
        document.getElementById('car-remaining-balance').textContent = '$0.00';
        document.getElementById('car-total-interest').textContent = '$0.00';
        document.getElementById('car-payoff-date').textContent = '—';
        document.getElementById('car-progress-pct').textContent = '0%';
        document.getElementById('car-progress-bar').style.width = '0%';
        document.getElementById('car-amount-paid').textContent = '$0.00';
        document.getElementById('car-interest-paid').textContent = '$0.00';
        document.getElementById('car-principal-paid').textContent = '$0.00';
        document.getElementById('car-remaining-term').textContent = '— months';
        document.getElementById('car-next-payment').textContent = '—';
        document.getElementById('car-amortization-table').innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; color:var(--text-muted); padding:32px;">
                    Enter your loan details above to generate the schedule
                </td>
            </tr>`;
        if (window._carChart) {
            window._carChart.destroy();
            window._carChart = null;
        }
    }

    // ── CALCULATE ────────────────────────────

    function calculate(data) {
        const balance = parseFloat(data.currentBalance);
        const origBalance = parseFloat(data.originalBalance) || balance;
        const annualRate = parseFloat(data.interestRate);
        const termMonths = parseInt(data.termMonths);
        const startDate = data.startDate;
        const override = parseFloat(data.monthlyPayment);

        const monthlyPayment = override > 0
            ? override
            : calcMonthlyPayment(origBalance, annualRate, termMonths);

        const schedule = buildSchedule(balance, annualRate, monthlyPayment, startDate);
        const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
        const payoffDate = schedule.length > 0 ? schedule[schedule.length - 1].date : null;

        const origSchedule = buildSchedule(origBalance, annualRate, monthlyPayment, startDate);
        const paidMonths = origSchedule.length - schedule.length;
        const interestPaid = origSchedule.slice(0, paidMonths).reduce((s, r) => s + r.interest, 0);
        const principalPaid = origBalance - balance;
        const pctPaid = Math.round((principalPaid / origBalance) * 100);
        const nextPayment = schedule.length > 0 ? fmtMonth(schedule[0].date) : '—';

        // Summary cards
        document.getElementById('car-monthly-payment').textContent = fmt(monthlyPayment);
        document.getElementById('car-remaining-balance').textContent = fmt(balance);
        document.getElementById('car-total-interest').textContent = fmt(totalInterest);
        document.getElementById('car-payoff-date').textContent = payoffDate ? fmtMonth(payoffDate) : '—';

        // Progress
        document.getElementById('car-progress-pct').textContent = pctPaid + '%';
        document.getElementById('car-progress-bar').style.width = pctPaid + '%';
        document.getElementById('car-amount-paid').textContent = fmt(origBalance - balance + interestPaid);
        document.getElementById('car-interest-paid').textContent = fmt(interestPaid);
        document.getElementById('car-principal-paid').textContent = fmt(principalPaid);
        document.getElementById('car-remaining-term').textContent = schedule.length + ' months';
        document.getElementById('car-next-payment').textContent = nextPayment;

        renderChart(schedule);
        renderTable(schedule);
    }

    // ── CHART ────────────────────────────────

    function renderChart(schedule) {
        const ctx = document.getElementById('car-amortization-chart').getContext('2d');
        const sampled = schedule.filter((_, i) => i % 3 === 0);

        if (window._carChart) window._carChart.destroy();

        window._carChart = new Chart(ctx, {
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

    function renderTable(schedule) {
        document.getElementById('car-amortization-table').innerHTML = schedule.map((row, i) => `
            <tr>
                <td style="color:var(--text-muted); font-family:var(--font-mono);">${i + 1}</td>
                <td style="color:var(--text-muted);">${fmtMonth(row.date)}</td>
                <td style="font-family:var(--font-mono);">${fmt(row.payment)}</td>
                <td style="font-family:var(--font-mono); color:var(--accent);">${fmt(row.principal)}</td>
                <td style="font-family:var(--font-mono); color:var(--red);">${fmt(row.interest)}</td>
                <td style="font-family:var(--font-mono);">${fmt(row.balance)}</td>
            </tr>
        `).join('');
    }

    // ── SAVE ─────────────────────────────────

    function save() {
        const loans = getLoans();
        const index = loans.findIndex(l => l.id === activeId);
        if (index === -1) return;

        const updated = {
            ...loans[index],
            lender: document.getElementById('car-lender').value.trim(),
            vehicleName: document.getElementById('car-vehicle').value.trim() || loans[index].vehicleName,
            originalBalance: parseMoney(document.getElementById('car-original-balance').value),
            currentBalance: parseMoney(document.getElementById('car-current-balance').value),
            interestRate: parseFloat(document.getElementById('car-interest-rate').value) || 0,
            termMonths: parseInt(document.getElementById('car-term').value) || 0,
            startDate: document.getElementById('car-start-date').value,
            monthlyPayment: parseMoney(document.getElementById('car-payment-override').value)
        };

        if (!updated.currentBalance || !updated.interestRate || !updated.termMonths || !updated.startDate) {
            alert('Please fill in balance, interest rate, term, and start date.');
            return;
        }

        loans[index] = updated;
        Data.set('carLoan', loans);

        // Update tab label if vehicle name changed
        renderTabs();
        calculate(updated);
        Toast.show('Car loan saved ✓');
    }

    // ── RESET ────────────────────────────────

    function reset() {
        if (!confirm('Clear this vehicle\'s data?')) return;
        const loans = getLoans();
        const index = loans.findIndex(l => l.id === activeId);
        if (index === -1) return;

        loans[index] = {
            ...loans[index],
            lender: '', originalBalance: 0, currentBalance: 0,
            interestRate: 0, termMonths: 0, startDate: null, monthlyPayment: 0
        };

        Data.set('carLoan', loans);
        populateForm();
        clearResults();
        Toast.show('Vehicle data cleared.');
    }

    // ── EXPORT CSV ───────────────────────────

    function exportCSV() {
        const loan = getActiveLoan();
        if (!loan || !loan.currentBalance) { alert('No loan data to export.'); return; }

        const payment = loan.monthlyPayment ||
            calcMonthlyPayment(loan.originalBalance, loan.interestRate, loan.termMonths);
        const schedule = buildSchedule(loan.currentBalance, loan.interestRate, payment, loan.startDate);

        const rows = [
            ['#', 'Date', 'Payment', 'Principal', 'Interest', 'Balance'],
            ...schedule.map((r, i) => [
                i + 1, fmtMonth(r.date),
                r.payment.toFixed(2), r.principal.toFixed(2),
                r.interest.toFixed(2), r.balance.toFixed(2)
            ])
        ];

        const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${loan.vehicleName || 'car-loan'}-amortization.csv`;
        a.click();
        Toast.show('CSV exported ✓');
    }

    // ── EXPORT PDF ───────────────────────────

    function exportPDF() {
        const loan = getActiveLoan();
        if (!loan || !loan.currentBalance) { alert('No loan data to export.'); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Car Loan Summary', 20, 20);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(`Vehicle: ${loan.vehicleName || '—'}`, 20, 35);
        doc.text(`Lender:  ${loan.lender || '—'}`, 20, 43);
        doc.text(`Balance: $${loan.currentBalance}`, 20, 51);
        doc.text(`Rate:    ${loan.interestRate}%`, 20, 59);
        doc.text(`Term:    ${loan.termMonths} months`, 20, 67);

        doc.save(`${loan.vehicleName || 'car-loan'}-summary.pdf`);
        Toast.show('PDF exported ✓');
    }

    // ── RENDER (entry point) ─────────────────

    function render() {
        const loans = getLoans();

        // Set active tab to first if not set or invalid
        if (loans.length && (!activeId || !loans.find(l => l.id === activeId))) {
            activeId = loans[0].id;
        }
        if (!loans.length) {
            activeId = null;
        }

        renderTabs();
        populateForm();

        const loan = getActiveLoan();
        if (loan && loan.currentBalance && loan.interestRate && loan.termMonths && loan.startDate) {
            calculate(loan);
        } else {
            clearResults();
        }
    }

    // ── PUBLIC API ───────────────────────────
    function autoSave() {
        const loans = getLoans();
        const index = loans.findIndex(l => l.id === activeId);
        if (index === -1) return;
        loans[index] = {
            ...loans[index],
            lender:          document.getElementById('car-lender')?.value.trim() ?? loans[index].lender,
            vehicleName:     document.getElementById('car-vehicle')?.value.trim() || loans[index].vehicleName,
            originalBalance: parseMoney(document.getElementById('car-original-balance')?.value || ''),
            currentBalance:  parseMoney(document.getElementById('car-current-balance')?.value  || ''),
            interestRate:    parseFloat(document.getElementById('car-interest-rate')?.value)    || 0,
            termMonths:      parseInt(document.getElementById('car-term')?.value)               || 0,
            startDate:       document.getElementById('car-start-date')?.value                   || loans[index].startDate,
            monthlyPayment:  parseMoney(document.getElementById('car-payment-override')?.value  || ''),
        };
        Data.set('carLoan', loans);
    }

    return { render, save, autoSave, reset, addTab, removeTab, switchTab, exportCSV, exportPDF };

})();