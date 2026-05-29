/**
 * debt.js — Debt Payoff Planner
 * --------------------------------
 * Avalanche (highest rate first) vs Snowball (lowest balance first).
 * Auto-imports car loans and mortgages. Supports manual debt entry.
 * Stacks freed minimum payments onto the next debt in line.
 *
 * Debt.render()        — render full page
 * Debt.setMethod()     — switch avalanche/snowball
 * Debt.setExtraPayment() — update extra monthly payment
 * Debt.showAddForm()   — reveal add-debt form
 * Debt.saveDebt()      — save a new custom debt
 * Debt.removeDebt()    — remove a custom debt
 */

const Debt = (() => {

    // ── HELPERS ──────────────────────────────

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }

    function fmt(n) {
        return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function calcMonthlyPayment(balance, annualRate, termMonths) {
        if (!balance || !termMonths) return 0;
        if (!annualRate) return balance / termMonths;
        const r = annualRate / 100 / 12;
        return balance * r * Math.pow(1 + r, termMonths) / (Math.pow(1 + r, termMonths) - 1);
    }

    function monthsToDate(months) {
        if (!months) return '—';
        const d = new Date();
        d.setMonth(d.getMonth() + months);
        return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    function typeLabel(type) {
        return ({
            car: 'Car Loan', mortgage: 'Mortgage',
            'credit-card': 'Credit Card', 'personal-loan': 'Personal Loan',
            'student-loan': 'Student Loan', other: 'Other'
        })[type] || type;
    }

    // ── STATE ─────────────────────────────────

    function getState() {
        const s = Data.get('debtPlanner') || {};
        return {
            method: s.method || 'avalanche',
            extraPayment: s.extraPayment || 0,
            customDebts: Array.isArray(s.customDebts) ? s.customDebts : [],
            excludeMortgage: s.excludeMortgage === true
        };
    }

    function saveState(s) { Data.set('debtPlanner', s); }

    // ── DEBT COLLECTION ──────────────────────

    function getAllDebts(state) {
        const debts = [];

        // Auto-import car loans
        const cars = Array.isArray(Data.get('carLoan')) ? Data.get('carLoan') : [];
        cars.filter(l => (l.currentBalance || 0) > 0.01).forEach(l => {
            const pmt = l.monthlyPayment || calcMonthlyPayment(l.currentBalance, l.interestRate, l.termMonths);
            if (pmt > 0) debts.push({
                id: 'car_' + l.id,
                name: l.vehicleName || l.lender || 'Car Loan',
                type: 'car',
                balance: l.currentBalance,
                rate: l.interestRate || 0,
                minPayment: pmt,
                source: 'car'
            });
        });

        // Auto-import mortgages (P+I only — escrow is not part of the debt payoff)
        const morts = Array.isArray(Data.get('mortgage')) ? Data.get('mortgage') : [];
        if (!state.excludeMortgage) morts.filter(m => (m.currentBalance || 0) > 0.01).forEach(m => {
            const pmt = calcMonthlyPayment(m.currentBalance, m.interestRate, m.termMonths);
            if (pmt > 0) debts.push({
                id: 'mort_' + m.id,
                name: m.propertyAddress || m.lender || 'Mortgage',
                type: 'mortgage',
                balance: m.currentBalance,
                rate: m.interestRate || 0,
                minPayment: pmt,
                source: 'mortgage'
            });
        });

        // Auto-import credit cards (non-zero balance)
        const creditCards = Array.isArray(Data.get('creditCards')) ? Data.get('creditCards') : [];
        creditCards.filter(c => (c.balance || 0) > 0.01).forEach(c => {
            const min = c.minPayment || Math.max(25, (c.balance || 0) * 0.02);
            debts.push({
                id: 'cc_' + c.id,
                name: c.name || 'Credit Card',
                type: 'credit-card',
                balance: c.balance,
                rate: c.apr || 0,
                minPayment: min,
                source: 'credit-card'
            });
        });

        // Custom debts (personal loans, etc.)
        (state.customDebts || []).forEach(d => debts.push({ ...d, source: 'custom' }));

        return debts;
    }

    // ── ALGORITHM ────────────────────────────

    function sortForMethod(debts, method) {
        return [...debts].sort(method === 'snowball'
            ? (a, b) => a.balance - b.balance
            : (a, b) => b.rate - a.rate);
    }

    // Simulate debt payoff month-by-month.
    // stack=true → freed minimum payments roll to next debt (avalanche/snowball mechanics).
    // stack=false → baseline "minimums only, no redirecting" scenario.
    function simulate(debts, extraPayment, stack) {
        if (!debts.length) return { payoffMonths: [], interestPaid: [], totalInterest: 0, totalMonths: 0, timeline: [] };

        const n = debts.length;
        const balances = debts.map(d => d.balance);
        const interestPaid = new Array(n).fill(0);
        const payoffMonths = new Array(n).fill(null);
        let freed = 0;
        const timeline = [{ month: 0, total: balances.reduce((s, b) => s + b, 0) }];
        let month = 0;

        while (balances.some(b => b > 0.005) && month < 600) {
            month++;
            const focus = balances.findIndex(b => b > 0.005);

            for (let i = 0; i < n; i++) {
                if (balances[i] <= 0.005) continue;

                const interest = balances[i] * (debts[i].rate / 100 / 12);
                interestPaid[i] += interest;
                balances[i] += interest;

                let pmt = debts[i].minPayment;
                if (i === focus) pmt += extraPayment + (stack ? freed : 0);
                pmt = Math.min(pmt, balances[i]);
                balances[i] -= pmt;
                if (balances[i] < 0.005) balances[i] = 0;

                if (balances[i] === 0 && payoffMonths[i] === null) {
                    payoffMonths[i] = month;
                    if (stack) freed += debts[i].minPayment;
                }
            }

            timeline.push({ month, total: balances.reduce((s, b) => s + b, 0) });
        }

        return {
            payoffMonths,
            interestPaid,
            totalInterest: interestPaid.reduce((s, v) => s + v, 0),
            totalMonths: month,
            timeline
        };
    }

    // ── RENDER ───────────────────────────────

    function render() {
        const state = getState();
        const allDebts = getAllDebts(state);
        const sorted = sortForMethod(allDebts, state.method);

        // Baseline: everyone pays minimums, no stacking, no extra
        const baseline = simulate(allDebts, 0, false);
        // Plan: sorted order, stacking freed payments, plus any extra
        const plan = simulate(sorted, state.extraPayment, true);

        const totalDebt = allDebts.reduce((s, d) => s + d.balance, 0);
        const interestSaved = Math.max(0, baseline.totalInterest - plan.totalInterest);
        const monthsSaved = Math.max(0, baseline.totalMonths - plan.totalMonths);

        document.getElementById('page-debt').innerHTML =
            buildPage(state, allDebts, sorted, baseline, plan, totalDebt, interestSaved, monthsSaved);

        if (allDebts.length) renderChart(baseline, plan, state.method);
        CurrencyInput.applyAll();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── PAGE BUILDER ─────────────────────────

    function buildPage(state, allDebts, sorted, baseline, plan, totalDebt, interestSaved, monthsSaved) {
        const hasDebts = allDebts.length > 0;
        return `
            <div class="page-header">
                <h2>Debt Payoff Planner</h2>
                <p>Choose a strategy, add any extra monthly payment, and see your path to debt freedom</p>
            </div>

            ${buildControls(state)}

            ${hasDebts ? buildSummary(state, baseline, plan, totalDebt, interestSaved, monthsSaved) : ''}

            ${hasDebts ? buildOrder(sorted, plan, state) : ''}

            ${hasDebts ? `
            <div class="card" style="margin-bottom:16px;">
                <div class="card-title">Payoff Timeline</div>
                <div class="chart-container" style="height:280px;">
                    <canvas id="debt-chart"></canvas>
                </div>
            </div>` : ''}

            ${buildDebtList(allDebts)}
        `;
    }

    function buildControls(state) {
        const isAv = state.method === 'avalanche';
        const exMort = state.excludeMortgage;
        const extraFmt = state.extraPayment
            ? '$' + Number(state.extraPayment).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : '';
        return `
        <div class="card" style="margin-bottom:16px;">
            <div style="display:flex; align-items:flex-start; gap:32px; flex-wrap:wrap;">

                <div>
                    <div style="font-size:0.72rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); margin-bottom:8px;">Strategy</div>
                    <div style="display:flex; border:1px solid var(--border); border-radius:8px; overflow:hidden;">
                        <button onclick="Debt.setMethod('avalanche')"
                            style="padding:10px 22px; font-size:0.83rem; font-weight:${isAv ? '600' : '400'}; border:none; cursor:pointer; transition:all 0.15s;
                                   background:${isAv ? 'var(--accent)' : 'transparent'};
                                   color:${isAv ? '#fff' : 'var(--text-muted)'};">
                            Avalanche
                        </button>
                        <button onclick="Debt.setMethod('snowball')"
                            style="padding:10px 22px; font-size:0.83rem; font-weight:${!isAv ? '600' : '400'}; border:none; border-left:1px solid var(--border); cursor:pointer; transition:all 0.15s;
                                   background:${!isAv ? 'var(--accent)' : 'transparent'};
                                   color:${!isAv ? '#fff' : 'var(--text-muted)'};">
                            Snowball
                        </button>
                    </div>
                </div>

                <div style="max-width:220px;">
                    <div style="font-size:0.72rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); margin-bottom:8px;">Extra Monthly Payment</div>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="debt-extra"
                           value="${extraFmt}" placeholder="$0.00" style="width:100%;"
                           onchange="Debt.setExtraPayment(parseMoney(this.value))">
                </div>

                <div>
                    <div style="font-size:0.72rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); margin-bottom:8px;">Mortgage</div>
                    <button onclick="Debt.toggleMortgage()"
                        title="${exMort ? 'Click to include mortgage in calculations' : 'Click to exclude mortgage from calculations'}"
                        style="display:flex; align-items:center; gap:8px; padding:10px 16px; font-size:0.83rem;
                               border:1px solid var(--border); border-radius:8px; cursor:pointer; transition:all 0.15s;
                               background:${exMort ? 'var(--bg-card)' : 'transparent'};
                               color:${exMort ? 'var(--text-muted)' : 'var(--text)'}; font-weight:${exMort ? '400' : '500'};">
                        <span style="display:inline-flex; width:32px; height:18px; border-radius:9px; align-items:center; padding:2px;
                                     background:${exMort ? 'var(--border)' : 'var(--accent)'}; transition:background 0.2s; flex-shrink:0;">
                            <span style="display:block; width:14px; height:14px; border-radius:50%; background:#fff;
                                         transform:translateX(${exMort ? '0px' : '14px'}); transition:transform 0.2s;"></span>
                        </span>
                        ${exMort ? 'Excluded' : 'Included'}
                    </button>
                </div>

                <div style="flex:1; min-width:200px; padding-top:28px;">
                    <p style="font-size:0.86rem; color:var(--text-muted); line-height:1.6; margin:0;">
                        ${isAv
                            ? '<strong style="color:var(--text);">Avalanche</strong> — target the highest interest rate first. Mathematically minimizes total interest paid.'
                            : '<strong style="color:var(--text);">Snowball</strong> — eliminate the smallest balance first. Builds momentum with fast early wins.'}
                    </p>
                </div>

            </div>
        </div>`;
    }

    function buildSummary(state, baseline, plan, totalDebt, interestSaved, monthsSaved) {
        const method = state.method === 'avalanche' ? 'Avalanche' : 'Snowball';
        const debtFreeDate = plan.totalMonths > 0 ? monthsToDate(plan.totalMonths) : '—';
        const sub = monthsSaved > 0
            ? monthsSaved + ' month' + (monthsSaved !== 1 ? 's' : '') + ' sooner'
            : plan.totalMonths + ' months total';
        return `
        <div class="summary-grid" style="grid-template-columns:repeat(5,1fr); margin-bottom:16px;">
            <div class="summary-card">
                <div class="label">Total Debt</div>
                <div class="value value-red">${fmt(totalDebt)}</div>
                <div class="sub">current balance</div>
            </div>
            <div class="summary-card">
                <div class="label">Minimums Only</div>
                <div class="value">${fmt(baseline.totalInterest)}</div>
                <div class="sub">total interest, no plan</div>
            </div>
            <div class="summary-card">
                <div class="label">With ${method}</div>
                <div class="value">${fmt(plan.totalInterest)}</div>
                <div class="sub">total interest</div>
            </div>
            <div class="summary-card">
                <div class="label">Interest Saved</div>
                <div class="value ${interestSaved > 0 ? 'value-green' : ''}">${fmt(interestSaved)}</div>
                <div class="sub">vs minimums only</div>
            </div>
            <div class="summary-card">
                <div class="label">Debt-Free</div>
                <div class="value value-green" style="font-size:1.05rem;">${debtFreeDate}</div>
                <div class="sub">${sub}</div>
            </div>
        </div>`;
    }

    function buildOrder(sorted, plan, state) {
        const COLORS = ['#D97757','#6BBF8E','#6B9FD9','#9471B1','#D9B96B','#D96B6B','#5BBFB5','#8E9AAF'];
        const subtitle = state.method === 'avalanche'
            ? 'Highest rate → Lowest rate'
            : 'Smallest balance → Largest balance';

        const rows = sorted.map((d, i) => {
            const payoffDate = plan.payoffMonths[i] ? monthsToDate(plan.payoffMonths[i]) : '—';
            const interest = plan.interestPaid[i] || 0;
            const sourceBadge = d.source !== 'custom'
                ? `<span class="badge badge-blue" style="font-size:0.65rem; margin-left:6px;">${d.source === 'car' ? 'Car' : 'Mortgage'}</span>`
                : '';
            return `<tr>
                <td>
                    <span style="display:inline-flex; width:22px; height:22px; border-radius:50%;
                                 background:${COLORS[i % COLORS.length]}; color:#fff;
                                 font-size:0.72rem; font-weight:700; align-items:center; justify-content:center;">${i + 1}</span>
                </td>
                <td>
                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:2px;">
                        <span style="font-weight:500;">${d.name}</span>${sourceBadge}
                    </div>
                    <div style="font-size:0.72rem; color:var(--text-muted); margin-top:1px;">${typeLabel(d.type)}</div>
                </td>
                <td style="font-family:var(--font-mono);">${fmt(d.balance)}</td>
                <td style="font-family:var(--font-mono);">${d.rate.toFixed(2)}%</td>
                <td style="font-family:var(--font-mono);">${fmt(d.minPayment)}/mo</td>
                <td style="font-family:var(--font-mono); color:var(--red);">${fmt(interest)}</td>
                <td style="font-family:var(--font-mono); color:var(--green); font-weight:500;">${payoffDate}</td>
            </tr>`;
        }).join('');

        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Payoff Order</span>
                <span style="font-size:0.78rem; color:var(--text-muted);">${subtitle}</span>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Debt</th>
                            <th>Balance</th>
                            <th>Rate</th>
                            <th>Min Payment</th>
                            <th>Est. Interest</th>
                            <th>Payoff Date</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
    }

    function renderChart(baseline, plan, method) {
        const canvas = document.getElementById('debt-chart');
        if (!canvas) return;
        if (window._debtChart) { window._debtChart.destroy(); window._debtChart = null; }

        const maxM = Math.max(baseline.totalMonths, plan.totalMonths, 1);
        const step = Math.max(1, Math.ceil(maxM / 60));

        const labels = [], baseData = [], planData = [];

        for (let m = 0; m <= maxM; m += step) {
            labels.push(m === 0 ? 'Today' : monthsToDate(m));
            const bs = baseline.timeline.find(t => t.month >= m);
            const ps = plan.timeline.find(t => t.month >= m);
            baseData.push(Math.max(0, Math.round(bs ? bs.total : 0)));
            planData.push(Math.max(0, Math.round(ps ? ps.total : 0)));
        }
        // Ensure final point is 0
        if (baseData[baseData.length - 1] > 0) { labels.push(monthsToDate(baseline.totalMonths)); baseData.push(0); planData.push(0); }

        const methodLabel = method === 'avalanche' ? 'Avalanche Plan' : 'Snowball Plan';

        window._debtChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Minimums Only',
                        data: baseData,
                        borderColor: '#D96B6B',
                        backgroundColor: 'rgba(217,107,107,0.08)',
                        fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2
                    },
                    {
                        label: methodLabel,
                        data: planData,
                        borderColor: '#6BBF8E',
                        backgroundColor: 'rgba(107,191,142,0.12)',
                        fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2.5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#8A8580', font: { family: 'DM Mono', size: 11 }, boxWidth: 14 } },
                    tooltip: { callbacks: { label: item => ` ${item.dataset.label}: ${fmt(item.raw)}` } }
                },
                scales: {
                    x: {
                        ticks: { color: '#8A8580', font: { family: 'DM Mono', size: 10 }, maxTicksLimit: 12 },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        ticks: {
                            color: '#8A8580', font: { family: 'DM Mono', size: 10 },
                            callback: v => v >= 1_000_000 ? '$' + (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? '$' + (v / 1_000).toFixed(0) + 'K' : '$' + v
                        },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    }
                }
            }
        });
    }

    function buildDebtList(allDebts) {
        const rows = allDebts.map(d => `
            <tr>
                <td style="font-weight:500;">${d.name}</td>
                <td>
                    <span class="badge ${d.source !== 'custom' ? 'badge-blue' : 'badge-accent'}">${typeLabel(d.type)}</span>
                </td>
                <td style="font-family:var(--font-mono);">${fmt(d.balance)}</td>
                <td style="font-family:var(--font-mono);">${d.rate.toFixed(2)}%</td>
                <td style="font-family:var(--font-mono);">${fmt(d.minPayment)}/mo</td>
                <td style="font-size:0.75rem; color:var(--text-faint);">
                    ${d.source !== 'custom' ? 'Auto-imported' : 'Manual'}
                </td>
                <td>
                    ${d.source === 'custom'
                        ? `<button class="delete-row-btn" onclick="Debt.removeDebt('${d.id}')">✕</button>`
                        : ''}
                </td>
            </tr>`).join('');

        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Your Debts</span>
                <button class="btn btn-primary" style="font-size:0.78rem; padding:6px 14px;"
                        onclick="Debt.showAddForm()">+ Add Debt</button>
            </div>

            ${allDebts.length ? `
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Name</th><th>Type</th><th>Balance</th>
                            <th>Rate</th><th>Min Payment</th><th>Source</th><th></th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>` : `
            <p style="text-align:center; padding:28px; color:var(--text-muted); font-size:0.88rem; margin:0;">
                Car loans and mortgages are imported automatically. Add credit cards or other debts with the button above.
            </p>`}

            <!-- Add debt inline form -->
            <div id="debt-add-form" style="display:none; margin-top:16px; padding-top:16px; border-top:1px solid var(--border);">
                <div class="form-row-3">
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" id="debt-name" placeholder="e.g. Visa Card">
                    </div>
                    <div class="form-group">
                        <label>Type</label>
                        <select id="debt-type">
                            <option value="credit-card">Credit Card</option>
                            <option value="personal-loan">Personal Loan</option>
                            <option value="student-loan">Student Loan</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Current Balance</label>
                        <input type="text" inputmode="decimal" data-fmt="currency" id="debt-balance" placeholder="0.00">
                    </div>
                </div>
                <div class="form-row" style="max-width:66%;">
                    <div class="form-group">
                        <label>Interest Rate (%)</label>
                        <input type="number" id="debt-rate" placeholder="e.g. 22.99" min="0" step="0.01">
                    </div>
                    <div class="form-group">
                        <label>Minimum Monthly Payment</label>
                        <input type="text" inputmode="decimal" data-fmt="currency" id="debt-min-payment" placeholder="0.00">
                    </div>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="btn btn-primary" onclick="Debt.saveDebt()">Add Debt</button>
                    <button class="btn btn-ghost" onclick="Debt.hideAddForm()">Cancel</button>
                </div>
            </div>
        </div>`;
    }

    // ── ACTIONS ───────────────────────────────

    function setMethod(method) {
        const s = getState();
        s.method = method;
        saveState(s);
        render();
    }

    function setExtraPayment(amount) {
        const s = getState();
        s.extraPayment = amount;
        saveState(s);
        render();
    }

    function toggleMortgage() {
        const s = getState();
        s.excludeMortgage = !s.excludeMortgage;
        saveState(s);
        render();
        Toast.show(s.excludeMortgage ? 'Mortgage excluded from calculations' : 'Mortgage included in calculations');
    }

    function showAddForm() {
        const form = document.getElementById('debt-add-form');
        if (!form) return;
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        CurrencyInput.applyAll();
        const d = Data.get('debt_draft') || {};
        if (d.name) {
            document.getElementById('debt-name').value        = d.name    || '';
            document.getElementById('debt-type').value        = d.type    || 'credit-card';
            document.getElementById('debt-balance').value     = d.balance || '';
            document.getElementById('debt-rate').value        = d.rate    || '';
            document.getElementById('debt-min-payment').value = d.min     || '';
        }
        document.getElementById('debt-name')?.focus();
    }

    function hideAddForm() {
        const form = document.getElementById('debt-add-form');
        if (form) form.style.display = 'none';
    }

    function saveDebt() {
        const name = document.getElementById('debt-name')?.value.trim();
        const type = document.getElementById('debt-type')?.value;
        const balance = parseMoney(document.getElementById('debt-balance')?.value);
        const rate = parseFloat(document.getElementById('debt-rate')?.value) || 0;
        const minPayment = parseMoney(document.getElementById('debt-min-payment')?.value);

        if (!name) { Toast.show('Please enter a name.'); return; }
        if (!balance) { Toast.show('Please enter a balance.'); return; }
        if (!minPayment) { Toast.show('Please enter a minimum payment.'); return; }

        const s = getState();
        s.customDebts.push({ id: uid(), name, type, balance, rate, minPayment });
        saveState(s);
        Data.set('debt_draft', {});
        render();
        Toast.show('Debt added ✓');
    }

    function removeDebt(id) {
        if (!confirm('Remove this debt?')) return;
        const s = getState();
        s.customDebts = s.customDebts.filter(d => d.id !== id);
        saveState(s);
        render();
    }

    function autoSave() {
        try {
            const form = document.getElementById('debt-add-form');
            if (!form || form.style.display === 'none' || form.style.display === '') return;
            Data.set('debt_draft', {
                name:    document.getElementById('debt-name')?.value        || '',
                type:    document.getElementById('debt-type')?.value        || 'credit-card',
                balance: document.getElementById('debt-balance')?.value     || '',
                rate:    document.getElementById('debt-rate')?.value        || '',
                min:     document.getElementById('debt-min-payment')?.value || '',
            });
        } catch (e) {}
    }

    // ── PUBLIC API ───────────────────────────
    return { render, autoSave, setMethod, setExtraPayment, toggleMortgage, showAddForm, hideAddForm, saveDebt, removeDebt };

})();
