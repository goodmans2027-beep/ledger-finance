/**
 * networth.js — Net Worth Tracker
 * ---------------------------------
 * Live net worth calculated from all modules + bank accounts.
 * Historical snapshots recorded manually by the user.
 *
 * NetWorth.render()              — render the full page
 * NetWorth.addAccount()          — save a new bank/cash account from the inline form
 * NetWorth.deleteAccount(id)     — remove a bank account
 * NetWorth.updateAccount(id,f,v) — field-level inline update
 * NetWorth.toggleAddAccount()    — show/hide the add-account form
 * NetWorth.showAddForm()         — open the snapshot form
 * NetWorth.hideAddForm()         — close the snapshot form
 * NetWorth.saveSnapshot()        — save a new snapshot
 * NetWorth.deleteSnapshot(id)    — delete a snapshot
 * NetWorth.updateFormTotals()    — live-update computed totals in the snapshot form
 * NetWorth.openEditModal(id)     — open edit modal for a snapshot
 * NetWorth.closeEditModal()      — close edit modal
 * NetWorth.updateEditTotals()    — live-update totals inside the edit modal
 * NetWorth.saveEdit()            — save snapshot edits
 */

const NetWorth = (() => {

    // ── HELPERS ──────────────────────────────

    function fmt(n) {
        return '$' + Number(n).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function fmtShort(n) {
        const abs = Math.abs(n);
        const sign = n < 0 ? '-' : '';
        if (abs >= 1_000_000) return sign + '$' + (abs / 1_000_000).toFixed(2) + 'M';
        if (abs >= 1_000)     return sign + '$' + (abs / 1_000).toFixed(1) + 'K';
        return sign + '$' + abs.toFixed(0);
    }

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }

    function calcPayment(balance, annualRate, termMonths) {
        if (!balance || !termMonths) return 0;
        if (!annualRate) return balance / termMonths;
        const r = annualRate / 100 / 12;
        return balance * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
    }

    const ACCOUNT_TYPES = {
        checking:     'Checking',
        savings:      'Savings',
        'money-market': 'Money Market',
        cd:           'CD',
        hsa:          'HSA',
        cash:         'Cash',
        other:        'Other'
    };

    // ── BANK ACCOUNT DATA ─────────────────────

    function getAccounts() {
        const d = Data.get('bankAccounts');
        return Array.isArray(d) ? d : [];
    }

    function setAccounts(list) {
        Data.set('bankAccounts', list);
    }

    function bankTotal() {
        return getAccounts().reduce((s, a) => s + (a.balance || 0), 0);
    }

    // ── SNAPSHOT DATA ─────────────────────────

    function getSnapshots() {
        const nw = Data.get('networth') || {};
        const list = Array.isArray(nw.snapshots) ? nw.snapshots : [];
        return list.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    function saveSnapshots(snapshots) {
        Data.set('networth', { snapshots });
    }

    // ── LIVE CALCULATION ──────────────────────

    function getLive() {
        // Bank accounts
        const accounts  = getAccounts();
        const cashTotal = accounts.reduce((s, a) => s + (a.balance || 0), 0);

        // Car loans
        const loans = Array.isArray(Data.get('carLoan')) ? Data.get('carLoan') : [];
        const carBalance = loans
            .filter(l => (l.currentBalance || 0) > 0)
            .reduce((s, l) => s + l.currentBalance, 0);
        const carMonthly = loans
            .filter(l => (l.currentBalance || 0) > 0)
            .reduce((s, l) => s + (l.monthlyPayment || calcPayment(l.currentBalance, l.interestRate, l.termMonths)), 0);

        // Mortgages
        const mortgages = Array.isArray(Data.get('mortgage')) ? Data.get('mortgage') : [];
        const activeMortgages = mortgages.filter(m => (m.currentBalance || 0) > 0);
        const mortgageBalance = activeMortgages.reduce((s, m) => s + m.currentBalance, 0);
        const homeValue       = activeMortgages.reduce((s, m) => s + (m.homeValue || 0), 0);
        const homeEquity      = homeValue - mortgageBalance;
        const mortgageMonthly = activeMortgages.reduce((s, m) => {
            const pmt = m.monthlyPayment || calcPayment(m.currentBalance, m.interestRate, m.termMonths);
            return s + pmt + (m.monthlyEscrow || 0) + (m.monthlyPMI || 0);
        }, 0);

        // Investments
        const inv = Data.get('investments') || {};
        const holdings = Array.isArray(inv.holdings) ? inv.holdings : [];
        const investmentValue = holdings.reduce((s, h) => s + (h.currentValue || 0), 0);

        // Savings goals total (informational only — user decides whether to include)
        const goals = Array.isArray(Data.get('savingsGoals')) ? Data.get('savingsGoals') : [];
        const savingsGoalTotal = goals.reduce((s, g) => s + (g.currentAmount || 0), 0);

        const totalAssets      = cashTotal + homeValue + investmentValue;
        const totalLiabilities = mortgageBalance + carBalance;
        const netWorth         = totalAssets - totalLiabilities;

        return {
            accounts, cashTotal,
            carBalance, carMonthly,
            mortgageBalance, homeValue, homeEquity, mortgageMonthly,
            investmentValue,
            savingsGoalTotal,
            totalAssets, totalLiabilities, netWorth
        };
    }

    // ── RENDER ───────────────────────────────

    function render() {
        const live      = getLive();
        const snapshots = getSnapshots();

        document.getElementById('page-networth').innerHTML = [
            buildHeader(),
            buildLiveHero(live),
            buildAccounts(live.accounts),
            buildChart(snapshots),
            buildProjectionCard(live),
            buildAddForm(live),
            buildHistory(snapshots)
        ].join('');

        renderChart(snapshots);
        renderProjectionChart();
        CurrencyInput.applyAll();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── HTML BUILDERS ────────────────────────

    function buildHeader() {
        return `
        <div class="page-header">
            <h2>Net Worth</h2>
            <p>Track your complete financial picture — accounts, assets, liabilities, and progress over time</p>
        </div>`;
    }

    function buildLiveHero(live) {
        const nwCls = live.netWorth >= 0 ? 'value-green' : 'value-red';
        return `
        <div id="nw-live-hero" class="card" style="margin-bottom:16px; border-left:3px solid var(--accent);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:22px;">
                <div>
                    <div class="card-title">Current Net Worth</div>
                    <div class="card-value ${nwCls}" style="font-size:3rem; line-height:1.1; margin-bottom:6px;">${fmtShort(live.netWorth)}</div>
                    <div style="font-size:0.78rem; color:var(--text-muted);">
                        <span style="color:var(--green);">Assets ${fmtShort(live.totalAssets)}</span>
                        &nbsp;—&nbsp;
                        <span style="color:var(--red);">Liabilities ${fmtShort(live.totalLiabilities)}</span>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="NetWorth.showAddForm()" style="align-self:flex-start;">
                    + Record Snapshot
                </button>
            </div>

            <div class="grid-2">
                <!-- Assets -->
                <div>
                    <div style="font-family:var(--font-mono); font-size:0.68rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:10px;">Assets</div>
                    ${live.cashTotal > 0 ? liveRow('Bank & Cash Accounts', fmt(live.cashTotal), 'var(--green)') : ''}
                    ${live.homeValue > 0 ? liveRow('Home Value',           fmt(live.homeValue),        'var(--green)') : ''}
                    ${live.homeValue > 0 ? liveRow('→ Home Equity',        fmt(live.homeEquity),        'var(--green)', true) : ''}
                    ${live.investmentValue > 0 ? liveRow('Investments',    fmt(live.investmentValue),   'var(--green)') : ''}
                    ${live.totalAssets === 0 ? `<div style="font-size:0.82rem; color:var(--text-faint); padding:8px 0;">No asset data yet. Add bank accounts below or enter mortgage / investment data.</div>` : ''}
                    <div style="display:flex; justify-content:space-between; padding:8px 0; border-top:1px solid var(--border); margin-top:6px;">
                        <span style="font-size:0.82rem; font-weight:500;">Total Assets</span>
                        <span style="font-family:var(--font-mono); color:var(--green); font-weight:500;">${fmt(live.totalAssets)}</span>
                    </div>
                </div>
                <!-- Liabilities -->
                <div>
                    <div style="font-family:var(--font-mono); font-size:0.68rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:10px;">Liabilities</div>
                    ${live.mortgageBalance > 0 ? liveRow('Mortgage Balance',  fmt(live.mortgageBalance),  'var(--red)') : ''}
                    ${live.mortgageBalance > 0 ? liveRow('→ Monthly Payment', fmt(live.mortgageMonthly) + '/mo', 'var(--text-muted)', true) : ''}
                    ${live.carBalance > 0 ? liveRow('Car Loan Balance', fmt(live.carBalance),    'var(--red)') : ''}
                    ${live.carBalance > 0 ? liveRow('→ Monthly Payment', fmt(live.carMonthly) + '/mo', 'var(--text-muted)', true) : ''}
                    ${live.totalLiabilities === 0 ? `<div style="font-size:0.82rem; color:var(--text-faint); padding:8px 0;">No liability data yet.</div>` : ''}
                    <div style="display:flex; justify-content:space-between; padding:8px 0; border-top:1px solid var(--border); margin-top:6px;">
                        <span style="font-size:0.82rem; font-weight:500;">Total Liabilities</span>
                        <span style="font-family:var(--font-mono); color:var(--red); font-weight:500;">${fmt(live.totalLiabilities)}</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ── BANK ACCOUNTS SECTION ─────────────────

    function buildAccounts(accounts) {
        const total = accounts.reduce((s, a) => s + (a.balance || 0), 0);
        const typeOptions = Object.entries(ACCOUNT_TYPES)
            .map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

        const rows = accounts.map(a => {
            const selectedType = Object.keys(ACCOUNT_TYPES)
                .map(v => `<option value="${v}" ${a.type === v ? 'selected' : ''}>${ACCOUNT_TYPES[v]}</option>`)
                .join('');
            return `
            <tr>
                <td>
                    <input class="inline-edit" style="width:150px;"
                           value="${a.name || ''}" placeholder="e.g. Chase Checking"
                           onchange="NetWorth.updateAccount('${a.id}', 'name', this.value)">
                </td>
                <td>
                    <select class="inline-select"
                            onchange="NetWorth.updateAccount('${a.id}', 'type', this.value)">
                        ${selectedType}
                    </select>
                </td>
                <td>
                    <input class="inline-edit" style="width:130px;"
                           value="${a.institution || ''}" placeholder="e.g. Chase"
                           onchange="NetWorth.updateAccount('${a.id}', 'institution', this.value)">
                </td>
                <td>
                    <input class="inline-edit" data-fmt="currency" style="width:120px;"
                           value="${a.balance || ''}"
                           onchange="NetWorth.updateAccount('${a.id}', 'balance', parseMoney(this.value))">
                </td>
                <td>
                    <button class="delete-row-btn" onclick="NetWorth.deleteAccount('${a.id}')">✕</button>
                </td>
            </tr>`;
        }).join('');

        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Bank &amp; Cash Accounts</span>
                <button class="btn btn-primary" style="font-size:0.78rem; padding:6px 14px;"
                        onclick="NetWorth.toggleAddAccount()">+ Add Account</button>
            </div>

            <!-- Add account form (hidden by default) -->
            <div id="nw-add-account-form"
                 style="display:none; margin-bottom:16px; padding:16px; background:var(--surface2); border-radius:var(--radius);">
                <div class="form-row-3">
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Account Name</label>
                        <input type="text" id="nw-acc-name" placeholder="e.g. Chase Checking">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Type</label>
                        <select id="nw-acc-type">${typeOptions}</select>
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Institution <span style="color:var(--text-faint);">(optional)</span></label>
                        <input type="text" id="nw-acc-institution" placeholder="e.g. Chase Bank">
                    </div>
                </div>
                <div class="form-row" style="max-width:50%; margin-top:12px;">
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Current Balance</label>
                        <input type="text" inputmode="decimal" data-fmt="currency"
                               id="nw-acc-balance" placeholder="0.00">
                    </div>
                </div>
                <div style="display:flex; gap:10px; margin-top:14px;">
                    <button class="btn btn-primary" onclick="NetWorth.addAccount()">Add Account</button>
                    <button class="btn btn-ghost" onclick="NetWorth.toggleAddAccount()">Cancel</button>
                </div>
            </div>

            ${accounts.length > 0 ? `
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Account Name</th>
                            <th>Type</th>
                            <th>Institution</th>
                            <th>Balance</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                    <tfoot>
                        <tr>
                            <td colspan="3" style="font-size:0.78rem; font-family:var(--font-mono);
                                                   text-transform:uppercase; letter-spacing:0.06em;
                                                   color:var(--text-muted); font-weight:500; padding-top:14px;">
                                Total Liquid
                            </td>
                            <td style="font-family:var(--font-mono); font-weight:600;
                                       color:var(--green); padding-top:14px;">${fmt(total)}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>` : `
            <div style="text-align:center; padding:28px; color:var(--text-muted); font-size:0.83rem;">
                No accounts added yet. Click <strong>+ Add Account</strong> to track your checking, savings, and cash balances.
                These feed directly into your net worth calculation.
            </div>`}
        </div>`;
    }

    function buildChart(snapshots) {
        const hasChart = snapshots.length >= 2;
        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Net Worth Over Time</span>
                ${hasChart ? `<span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">${snapshots.length} snapshots</span>` : ''}
            </div>
            ${hasChart
                ? `<div style="position:relative; height:240px;"><canvas id="nw-chart"></canvas></div>`
                : `<div style="text-align:center; color:var(--text-muted); font-size:0.83rem; padding:32px 0;">
                       Record at least 2 snapshots to see your progress trend.
                   </div>`}
        </div>`;
    }

    function buildAddForm(live) {
        const today = new Date().toISOString().split('T')[0];
        // Pre-fill: cash from bank accounts, home + investments from live data
        const initCash   = live.cashTotal;
        const initHome   = live.homeValue;
        const initInv    = live.investmentValue;
        const initMort   = live.mortgageBalance;
        const initCar    = live.carBalance;
        const initAssets = initCash + initHome + initInv;
        const initLiab   = initMort + initCar;
        const initNW     = initAssets - initLiab;
        const nwColor    = initNW >= 0 ? 'var(--green)' : 'var(--red)';

        return `
        <div id="nw-add-form" style="display:none; margin-bottom:16px;">
            <div class="card">
                <div class="card-title" style="margin-bottom:18px;">Record Net Worth Snapshot</div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Date</label>
                        <input type="date" id="nw-snap-date" value="${today}">
                    </div>
                    <div class="form-group">
                        <label>Label <span style="color:var(--text-faint); font-weight:400;">(optional)</span></label>
                        <input type="text" id="nw-snap-label" placeholder="e.g. Jan 2026 — Year Start">
                    </div>
                </div>

                <div class="grid-2" style="margin:4px 0 16px;">
                    <!-- Assets -->
                    <div>
                        <div style="font-family:var(--font-mono); font-size:0.68rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:12px;">Assets</div>
                        <div class="form-group">
                            <label>
                                Bank &amp; Cash Accounts
                                ${initCash > 0 ? `<span style="color:var(--text-faint); font-weight:400;">· auto-filled from accounts</span>` : ''}
                            </label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-snap-cash"
                                   value="${initCash ? fmt(initCash) : ''}" placeholder="0.00"
                                   oninput="NetWorth.updateFormTotals()">
                        </div>
                        <div class="form-group">
                            <label>Home / Property Value</label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-snap-home"
                                   value="${initHome ? fmt(initHome) : ''}" placeholder="0.00"
                                   oninput="NetWorth.updateFormTotals()">
                        </div>
                        <div class="form-group">
                            <label>Investment Portfolio</label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-snap-investments"
                                   value="${initInv ? fmt(initInv) : ''}" placeholder="0.00"
                                   oninput="NetWorth.updateFormTotals()">
                        </div>
                        <div class="form-group">
                            <label>Other Assets <span style="color:var(--text-faint); font-weight:400;">(vehicles, etc.)</span></label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-snap-other-assets"
                                   placeholder="0.00" oninput="NetWorth.updateFormTotals()">
                            <input type="text" id="nw-snap-other-assets-label"
                                   placeholder="What are these? e.g. Car, Jewelry"
                                   style="margin-top:5px; font-size:0.8rem; color:var(--text-muted); background:transparent; border:1px solid var(--border); border-radius:var(--radius); padding:5px 9px; width:100%; box-sizing:border-box; outline:none;">
                        </div>
                    </div>
                    <!-- Liabilities -->
                    <div>
                        <div style="font-family:var(--font-mono); font-size:0.68rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:12px;">Liabilities</div>
                        <div class="form-group">
                            <label>Mortgage Balance</label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-snap-mortgage"
                                   value="${initMort ? fmt(initMort) : ''}" placeholder="0.00"
                                   oninput="NetWorth.updateFormTotals()">
                        </div>
                        <div class="form-group">
                            <label>Car Loan Balance</label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-snap-car"
                                   value="${initCar ? fmt(initCar) : ''}" placeholder="0.00"
                                   oninput="NetWorth.updateFormTotals()">
                        </div>
                        <div class="form-group">
                            <label>Other Liabilities <span style="color:var(--text-faint); font-weight:400;">(credit cards, etc.)</span></label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-snap-other-liab"
                                   placeholder="0.00" oninput="NetWorth.updateFormTotals()">
                        </div>
                    </div>
                </div>

                <!-- Live totals -->
                <div style="background:var(--surface2); border-radius:8px; padding:14px 20px; display:flex; gap:36px; margin-bottom:16px; flex-wrap:wrap;">
                    <div>
                        <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.05em; color:var(--text-faint); margin-bottom:3px;">Total Assets</div>
                        <div id="nw-form-assets" style="font-family:var(--font-mono); color:var(--green);">${fmt(initAssets)}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.05em; color:var(--text-faint); margin-bottom:3px;">Total Liabilities</div>
                        <div id="nw-form-liab" style="font-family:var(--font-mono); color:var(--red);">${fmt(initLiab)}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.05em; color:var(--text-faint); margin-bottom:3px;">Net Worth</div>
                        <div id="nw-form-nw" style="font-family:var(--font-mono); font-weight:600; color:${nwColor};">${fmt(initNW)}</div>
                    </div>
                </div>

                <div style="display:flex; gap:10px;">
                    <button class="btn btn-primary" onclick="NetWorth.saveSnapshot()">Save Snapshot</button>
                    <button class="btn btn-ghost" onclick="NetWorth.hideAddForm()">Cancel</button>
                </div>
            </div>
        </div>`;
    }

    function buildHistory(snapshots) {
        const desc = [...snapshots].reverse();
        return `
        <div class="card">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Snapshot History</span>
                <span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">${snapshots.length} record${snapshots.length !== 1 ? 's' : ''}</span>
            </div>
            ${snapshots.length === 0
                ? `<div style="text-align:center; color:var(--text-muted); font-size:0.83rem; padding:32px;">
                       No snapshots yet. Click "Record Snapshot" to capture your current net worth.
                   </div>`
                : `<div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Label</th>
                                <th>Cash</th>
                                <th>Assets</th>
                                <th>Liabilities</th>
                                <th>Net Worth</th>
                                <th>Change</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${desc.map((snap, i) => {
                                const prev     = desc[i + 1];
                                const change   = prev ? snap.netWorth - prev.netWorth : null;
                                const chgStr   = change === null ? '—'
                                    : (change >= 0 ? '+' : '') + fmtShort(change);
                                const chgColor = change === null ? 'var(--text-faint)'
                                    : change >= 0 ? 'var(--green)' : 'var(--red)';
                                const pctChange = (change !== null && prev.netWorth !== 0)
                                    ? ((change / Math.abs(prev.netWorth)) * 100).toFixed(1)
                                    : null;
                                const pctStr = pctChange !== null
                                    ? `${Number(pctChange) >= 0 ? '+' : ''}${pctChange}%`
                                    : '';
                                const dateStr  = new Date(snap.date + 'T00:00:00').toLocaleDateString('en-US', {
                                    year: 'numeric', month: 'short', day: 'numeric'
                                });
                                const nwColor = snap.netWorth >= 0 ? 'var(--green)' : 'var(--red)';
                                const cashDisplay = (snap.cashValue || snap.cashTotal || 0) > 0
                                    ? fmtShort(snap.cashValue || snap.cashTotal)
                                    : '—';
                                return `<tr onclick="NetWorth.openDetailModal('${snap.id}')" style="cursor:pointer;"
                                         onmouseover="this.style.background='var(--surface2)'"
                                         onmouseout="this.style.background=''">
                                    <td style="font-family:var(--font-mono); font-size:0.82rem; white-space:nowrap;">${dateStr}</td>
                                    <td style="color:var(--text-muted); font-size:0.82rem;">${snap.label || '—'}</td>
                                    <td style="font-family:var(--font-mono); font-size:0.82rem; color:var(--text-muted);">${cashDisplay}</td>
                                    <td style="font-family:var(--font-mono); color:var(--green);">${fmtShort(snap.totalAssets)}</td>
                                    <td style="font-family:var(--font-mono); color:var(--red);">${fmtShort(snap.totalLiabilities)}</td>
                                    <td style="font-family:var(--font-mono); font-weight:600; color:${nwColor};">${fmtShort(snap.netWorth)}</td>
                                    <td style="font-family:var(--font-mono); font-size:0.82rem; color:${chgColor}; white-space:nowrap;">
                                        ${chgStr}
                                        ${pctStr ? `<div style="font-size:0.7rem; color:${chgColor}; opacity:0.7; margin-top:1px;">${pctStr}</div>` : ''}
                                    </td>
                                    <td onclick="event.stopPropagation()">
                                        <div style="display:flex; gap:6px;">
                                            <button class="edit-row-btn"
                                                    onclick="NetWorth.openEditModal('${snap.id}')"
                                                    title="Edit">✎</button>
                                            <button class="delete-row-btn"
                                                    onclick="NetWorth.deleteSnapshot('${snap.id}')">✕</button>
                                        </div>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`}
        </div>`;
    }

    // ── PROJECTED NET WORTH ──────────────────

    function getProjSettings() {
        return Data.get('nwProjectionSettings');
    }

    function saveProjSettings(s) {
        Data.set('nwProjectionSettings', s);
    }

    function projectionDefaults() {
        const budget = Data.get('budget') || {};
        const toM = (amt, freq) => {
            const m = { weekly: 52/12, biweekly: 26/12, semimonthly: 2, monthly: 1,
                        '2months': 0.5, quarterly: 1/3, '6months': 1/6, semiannual: 1/6, annual: 1/12 };
            return amt * (m[freq] || 1);
        };
        const monthlyIncome = (budget.incomeStreams || []).reduce((s, i) => s + toM(i.amount, i.frequency), 0);
        const monthlyCats   = (budget.categories    || []).reduce((s, c) => s + toM(c.amount, c.frequency), 0);
        const monthlySubs   = (budget.subscriptions || []).reduce((s, sub) =>
            s + (sub.frequency === 'annual' ? sub.amount / 12 : sub.amount), 0);
        const estimatedSavings = Math.max(0, monthlyIncome - monthlyCats - monthlySubs);

        const inv       = Data.get('investments') || {};
        const mortgages = (Data.get('mortgage') || []).filter(m => (m.currentBalance || 0) > 0);
        const appRate   = mortgages.length > 0 ? (Number(mortgages[0].appreciationRate) || 3) : 3;

        return {
            monthlySavings:   Math.round(estimatedSavings),
            monthlyInvContrib: inv.monthlyContribution || 0,
            investmentRate:   7.0,
            appreciationRate: appRate,
            years:            30
        };
    }

    function projectNetWorth(live, params) {
        const { monthlySavings, monthlyInvContrib, investmentRate, appreciationRate, years } = params;
        const monthlyInvReturn = investmentRate / 100 / 12;
        const monthlyAppRate   = appreciationRate / 100 / 12;

        let cash        = live.cashTotal;
        let homeValue   = live.homeValue;
        let investments = live.investmentValue;

        const mortgageLoans = (Data.get('mortgage') || [])
            .filter(m => (m.currentBalance || 0) > 0)
            .map(m => ({
                balance: m.currentBalance,
                rate:    (m.interestRate || 0) / 100 / 12,
                pmt:     m.monthlyPayment || calcPayment(m.currentBalance, m.interestRate, m.termMonths)
            }));
        const carLoans = (Data.get('carLoan') || [])
            .filter(l => (l.currentBalance || 0) > 0)
            .map(l => ({
                balance: l.currentBalance,
                rate:    (l.interestRate || 0) / 100 / 12,
                pmt:     l.monthlyPayment || calcPayment(l.currentBalance, l.interestRate, l.termMonths)
            }));

        const curYear = new Date().getFullYear();
        const points  = [{
            year: 0, label: String(curYear),
            netWorth: live.netWorth, assets: live.totalAssets, liabilities: live.totalLiabilities
        }];

        for (let month = 1; month <= years * 12; month++) {
            // Cash savings accumulate linearly
            cash += monthlySavings;
            // Investments compound + explicit monthly contribution
            investments = investments * (1 + monthlyInvReturn) + monthlyInvContrib;
            // Home appreciates
            homeValue = homeValue * (1 + monthlyAppRate);

            let mortgageBal = 0;
            for (const loan of mortgageLoans) {
                if (loan.balance <= 0) continue;
                const interest  = loan.balance * loan.rate;
                const principal = Math.min(Math.max(0, loan.pmt - interest), loan.balance);
                loan.balance   -= principal;
                mortgageBal    += loan.balance;
            }
            let carBal = 0;
            for (const loan of carLoans) {
                if (loan.balance <= 0) continue;
                const interest  = loan.balance * loan.rate;
                const principal = Math.min(Math.max(0, loan.pmt - interest), loan.balance);
                loan.balance   -= principal;
                carBal         += loan.balance;
            }

            if (month % 12 === 0) {
                const yr          = month / 12;
                const totalAssets = cash + homeValue + investments;
                const totalLiab   = mortgageBal + carBal;
                points.push({
                    year: yr, label: String(curYear + yr),
                    netWorth: totalAssets - totalLiab, assets: totalAssets, liabilities: totalLiab
                });
            }
        }
        return points;
    }

    function buildProjectionCard() {
        const saved = getProjSettings();
        const def   = projectionDefaults();
        const d     = saved ? { ...def, ...saved } : def;
        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Projected Net Worth</span>
            </div>

            <div style="display:flex; flex-wrap:wrap; gap:16px; margin:14px 0 16px;
                        padding:14px 18px; background:var(--surface2); border-radius:var(--radius);">
                <div>
                    <div style="${projLabelStyle()}">Monthly Cash Savings</div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <span style="font-size:0.82rem; color:var(--text-muted);">$</span>
                        <input type="number" id="proj-savings" value="${d.monthlySavings}" min="0" step="100"
                               oninput="NetWorth.updateProjection()"
                               style="${projInputStyle('90px')}" title="Net monthly amount added to cash / bank accounts">
                    </div>
                </div>
                <div>
                    <div style="${projLabelStyle()}">Monthly Inv. Contribution</div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <span style="font-size:0.82rem; color:var(--text-muted);">$</span>
                        <input type="number" id="proj-inv-contrib" value="${d.monthlyInvContrib}" min="0" step="50"
                               oninput="NetWorth.updateProjection()"
                               style="${projInputStyle('90px')}" title="Monthly amount invested (401k, brokerage, etc.) — compounds at the investment return rate">
                    </div>
                </div>
                <div>
                    <div style="${projLabelStyle()}">Investment Return</div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <input type="number" id="proj-inv-rate" value="${d.investmentRate}" min="0" max="30" step="0.5"
                               oninput="NetWorth.updateProjection()" style="${projInputStyle('62px')}">
                        <span style="font-size:0.8rem; color:var(--text-muted);">% / yr</span>
                    </div>
                </div>
                <div>
                    <div style="${projLabelStyle()}">Home Appreciation</div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <input type="number" id="proj-app-rate" value="${d.appreciationRate}" min="0" max="20" step="0.5"
                               oninput="NetWorth.updateProjection()" style="${projInputStyle('62px')}">
                        <span style="font-size:0.8rem; color:var(--text-muted);">% / yr</span>
                    </div>
                </div>
                <div>
                    <div style="${projLabelStyle()}">Horizon</div>
                    <select id="proj-years" onchange="NetWorth.updateProjection()"
                            style="padding:5px 8px; font-family:var(--font-mono); font-size:0.83rem;
                                   background:var(--surface); border:1px solid var(--border);
                                   border-radius:4px; color:var(--text); cursor:pointer;">
                        <option value="10" ${d.years === 10 ? 'selected' : ''}>10 years</option>
                        <option value="20" ${d.years === 20 ? 'selected' : ''}>20 years</option>
                        <option value="30" ${d.years === 30 ? 'selected' : ''}>30 years</option>
                        <option value="40" ${d.years === 40 ? 'selected' : ''}>40 years</option>
                    </select>
                </div>
            </div>

            <div id="proj-milestones" style="display:flex; border:1px solid var(--border);
                 border-radius:var(--radius); overflow:hidden; margin-bottom:16px;"></div>

            <div style="position:relative; height:280px;"><canvas id="nw-proj-chart"></canvas></div>
            <div style="font-size:0.7rem; color:var(--text-faint); margin-top:8px; line-height:1.5;">
                Debts pay down via amortization. Cash savings and investment contributions are independent flows. Past performance does not guarantee future results.
            </div>
        </div>`;
    }

    function projLabelStyle() {
        return 'font-size:0.63rem; font-family:var(--font-mono); text-transform:uppercase; ' +
               'letter-spacing:0.07em; color:var(--text-faint); margin-bottom:5px;';
    }

    function projInputStyle(w) {
        return `width:${w}; padding:5px 8px; font-family:var(--font-mono); font-size:0.83rem; ` +
               'background:var(--surface); border:1px solid var(--border); ' +
               'border-radius:4px; color:var(--text);';
    }

    function renderProjectionChart() {
        const canvas = document.getElementById('nw-proj-chart');
        if (!canvas) return;

        const live   = getLive();
        const params = {
            monthlySavings:    parseFloat(document.getElementById('proj-savings')?.value)     || 0,
            monthlyInvContrib: parseFloat(document.getElementById('proj-inv-contrib')?.value) || 0,
            investmentRate:    parseFloat(document.getElementById('proj-inv-rate')?.value)    || 7,
            appreciationRate:  parseFloat(document.getElementById('proj-app-rate')?.value)    || 3,
            years:             parseInt(document.getElementById('proj-years')?.value)          || 30,
        };
        const points = projectNetWorth(live, params);

        // Milestones
        const mYears = [5, 10, 20, params.years]
            .filter(y => y <= params.years)
            .filter((y, i, a) => a.indexOf(y) === i)
            .sort((a, b) => a - b);
        const milestonesEl = document.getElementById('proj-milestones');
        if (milestonesEl) {
            milestonesEl.innerHTML = mYears.map((y, i) => {
                const pt    = points.find(p => p.year === y) || points[points.length - 1];
                const color = pt.netWorth >= 0 ? 'var(--green)' : 'var(--red)';
                const sep   = i < mYears.length - 1 ? 'border-right:1px solid var(--border);' : '';
                return `<div style="flex:1; padding:12px 16px; text-align:center; ${sep}">
                    <div style="font-size:0.63rem; font-family:var(--font-mono); text-transform:uppercase;
                                letter-spacing:0.06em; color:var(--text-faint); margin-bottom:4px;">
                        ${y}yr · ${pt.label}
                    </div>
                    <div style="font-family:var(--font-mono); font-size:1rem; font-weight:600; color:${color};">
                        ${fmtShort(pt.netWorth)}
                    </div>
                </div>`;
            }).join('');
        }

        if (window._nwProjChart) { window._nwProjChart.destroy(); window._nwProjChart = null; }

        window._nwProjChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: points.map(p => p.label),
                datasets: [
                    {
                        label: 'Net Worth',
                        data: points.map(p => p.netWorth),
                        borderColor: '#D97757', backgroundColor: 'rgba(217,119,87,0.08)',
                        borderWidth: 2.5, fill: true, tension: 0.3,
                        pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: '#D97757'
                    },
                    {
                        label: 'Total Assets',
                        data: points.map(p => p.assets),
                        borderColor: '#6BBF8E', backgroundColor: 'transparent',
                        borderWidth: 1.5, borderDash: [5, 4], fill: false, tension: 0.3,
                        pointRadius: 2, pointBackgroundColor: '#6BBF8E'
                    },
                    {
                        label: 'Liabilities',
                        data: points.map(p => p.liabilities),
                        borderColor: '#D96B6B', backgroundColor: 'transparent',
                        borderWidth: 1.5, borderDash: [5, 4], fill: false, tension: 0.3,
                        pointRadius: 2, pointBackgroundColor: '#D96B6B'
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#8A8580', font: { family: 'DM Mono', size: 11 }, boxWidth: 14, padding: 18 }
                    },
                    tooltip: {
                        callbacks: {
                            title: items => items.length ? `Year ${items[0].label}` : '',
                            label: item => ` ${item.dataset.label}: ${fmt(item.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#8A8580', font: { family: 'DM Mono', size: 10 }, maxTicksLimit: 10 }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#8A8580', font: { family: 'DM Mono', size: 10 }, callback: v => fmtShort(v) }
                    }
                }
            }
        });
    }

    function updateProjection() {
        saveProjSettings({
            monthlySavings:    parseFloat(document.getElementById('proj-savings')?.value)     || 0,
            monthlyInvContrib: parseFloat(document.getElementById('proj-inv-contrib')?.value) || 0,
            investmentRate:    parseFloat(document.getElementById('proj-inv-rate')?.value)    || 7,
            appreciationRate:  parseFloat(document.getElementById('proj-app-rate')?.value)    || 3,
            years:             parseInt(document.getElementById('proj-years')?.value)          || 30,
        });
        renderProjectionChart();
    }

    // ── CHART ────────────────────────────────

    function renderChart(snapshots) {
        if (snapshots.length < 2) return;
        const canvas = document.getElementById('nw-chart');
        if (!canvas) return;

        if (window._nwChart) { window._nwChart.destroy(); window._nwChart = null; }

        function toTs(snap) { return new Date(snap.date + 'T00:00:00').getTime(); }
        function pt(snap, key) { return { x: toTs(snap), y: snap[key] }; }

        window._nwChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Net Worth',
                        data: snapshots.map(s => pt(s, 'netWorth')),
                        borderColor: '#D97757',
                        backgroundColor: 'rgba(217,119,87,0.08)',
                        borderWidth: 2.5,
                        fill: true, tension: 0, pointRadius: 5, pointHoverRadius: 7,
                        pointBackgroundColor: '#D97757'
                    },
                    {
                        label: 'Assets',
                        data: snapshots.map(s => pt(s, 'totalAssets')),
                        borderColor: '#6BBF8E',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5, borderDash: [5, 4],
                        fill: false, tension: 0, pointRadius: 3,
                        pointBackgroundColor: '#6BBF8E'
                    },
                    {
                        label: 'Liabilities',
                        data: snapshots.map(s => pt(s, 'totalLiabilities')),
                        borderColor: '#D96B6B',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5, borderDash: [5, 4],
                        fill: false, tension: 0, pointRadius: 3,
                        pointBackgroundColor: '#D96B6B'
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false, axis: 'x' },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#8A8580', font: { family: 'DM Mono', size: 11 }, boxWidth: 14, padding: 18 }
                    },
                    tooltip: {
                        callbacks: {
                            title: items => items.length
                                ? new Date(items[0].parsed.x).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                                : '',
                            label: item => ` ${item.dataset.label}: ${fmt(item.parsed.y)}`
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#8A8580', font: { family: 'DM Mono', size: 10 }, maxTicksLimit: 8,
                            callback: v => new Date(v).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
                        }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#8A8580', font: { family: 'DM Mono', size: 10 }, callback: v => fmtShort(v) }
                    }
                }
            }
        });
    }

    // ── BANK ACCOUNT ACTIONS ─────────────────

    function toggleAddAccount() {
        const form = document.getElementById('nw-add-account-form');
        if (!form) return;
        const isHidden = form.style.display === 'none' || form.style.display === '';
        form.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            setTimeout(() => document.getElementById('nw-acc-name')?.focus(), 50);
        }
    }

    function addAccount() {
        const name        = document.getElementById('nw-acc-name')?.value.trim();
        const type        = document.getElementById('nw-acc-type')?.value || 'checking';
        const institution = document.getElementById('nw-acc-institution')?.value.trim() || '';
        const balance     = parseMoney(document.getElementById('nw-acc-balance')?.value);

        if (!name) { Toast.show('Please enter an account name.'); return; }

        const accounts = getAccounts();
        accounts.push({ id: uid(), name, type, institution, balance });
        setAccounts(accounts);
        render();
        Toast.show('Account added ✓');
    }

    function deleteAccount(id) {
        if (!confirm('Remove this account?')) return;
        setAccounts(getAccounts().filter(a => a.id !== id));
        render();
        Toast.show('Account removed');
    }

    function updateAccount(id, field, value) {
        const accounts = getAccounts();
        const idx = accounts.findIndex(a => a.id === id);
        if (idx === -1) return;
        accounts[idx][field] = value;
        setAccounts(accounts);
        // Re-render only the hero totals, not the full page (avoids focus loss)
        _refreshHeroTotals();
    }

    function _refreshHeroTotals() {
        const el = document.getElementById('nw-live-hero');
        if (el) {
            el.outerHTML = buildLiveHero(getLive());
        } else {
            render();
        }
    }

    // ── SNAPSHOT ACTIONS ─────────────────────

    function showAddForm() {
        const form = document.getElementById('nw-add-form');
        if (!form) return;
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        CurrencyInput.applyAll();
        const d = Data.get('networth_draft') || {};
        if (d.date)        { const el = document.getElementById('nw-snap-date');         if (el) el.value = d.date; }
        if (d.label)       { const el = document.getElementById('nw-snap-label');        if (el) el.value = d.label; }
        if (d.cash)        { const el = document.getElementById('nw-snap-cash');         if (el) el.value = d.cash; }
        if (d.home)        { const el = document.getElementById('nw-snap-home');         if (el) el.value = d.home; }
        if (d.investments) { const el = document.getElementById('nw-snap-investments');  if (el) el.value = d.investments; }
        if (d.otherAssets) { const el = document.getElementById('nw-snap-other-assets'); if (el) el.value = d.otherAssets; }
        if (d.otherLabel)  { const el = document.getElementById('nw-snap-other-assets-label'); if (el) el.value = d.otherLabel; }
        if (d.mortgage)    { const el = document.getElementById('nw-snap-mortgage');     if (el) el.value = d.mortgage; }
        if (d.car)         { const el = document.getElementById('nw-snap-car');          if (el) el.value = d.car; }
        if (d.otherLiab)   { const el = document.getElementById('nw-snap-other-liab');   if (el) el.value = d.otherLiab; }
        if (Object.keys(d).length) updateFormTotals();
    }

    function hideAddForm() {
        const form = document.getElementById('nw-add-form');
        if (form) form.style.display = 'none';
    }

    function updateFormTotals() {
        const cash        = parseMoney(document.getElementById('nw-snap-cash')?.value);
        const home        = parseMoney(document.getElementById('nw-snap-home')?.value);
        const investments = parseMoney(document.getElementById('nw-snap-investments')?.value);
        const otherAssets = parseMoney(document.getElementById('nw-snap-other-assets')?.value);
        const mortgage    = parseMoney(document.getElementById('nw-snap-mortgage')?.value);
        const car         = parseMoney(document.getElementById('nw-snap-car')?.value);
        const otherLiab   = parseMoney(document.getElementById('nw-snap-other-liab')?.value);

        const totalAssets = cash + home + investments + otherAssets;
        const totalLiab   = mortgage + car + otherLiab;
        const nw          = totalAssets - totalLiab;

        document.getElementById('nw-form-assets').textContent = fmt(totalAssets);
        document.getElementById('nw-form-liab').textContent   = fmt(totalLiab);
        const nwEl = document.getElementById('nw-form-nw');
        nwEl.textContent = fmt(nw);
        nwEl.style.color = nw >= 0 ? 'var(--green)' : 'var(--red)';
    }

    function saveSnapshot() {
        const date = document.getElementById('nw-snap-date')?.value;
        if (!date) { Toast.show('Please select a date.'); return; }

        const cash        = parseMoney(document.getElementById('nw-snap-cash')?.value);
        const home        = parseMoney(document.getElementById('nw-snap-home')?.value);
        const investments      = parseMoney(document.getElementById('nw-snap-investments')?.value);
        const otherAssets      = parseMoney(document.getElementById('nw-snap-other-assets')?.value);
        const otherAssetsLabel = document.getElementById('nw-snap-other-assets-label')?.value.trim() || '';
        const mortgage         = parseMoney(document.getElementById('nw-snap-mortgage')?.value);
        const car              = parseMoney(document.getElementById('nw-snap-car')?.value);
        const otherLiab        = parseMoney(document.getElementById('nw-snap-other-liab')?.value);

        const totalAssets      = cash + home + investments + otherAssets;
        const totalLiabilities = mortgage + car + otherLiab;
        const netWorth         = totalAssets - totalLiabilities;

        const snapshots = getSnapshots();
        snapshots.push({
            id: uid(),
            date,
            label:            document.getElementById('nw-snap-label')?.value.trim(),
            cashValue:        cash,
            homeValue:        home,
            investmentValue:  investments,
            otherAssets,
            otherAssetsLabel,
            mortgageBalance:  mortgage,
            carBalance:       car,
            otherLiabilities: otherLiab,
            totalAssets,
            totalLiabilities,
            netWorth
        });
        saveSnapshots(snapshots);
        Data.set('networth_draft', {});
        render();
        Toast.show('Snapshot saved ✓');
    }

    function deleteSnapshot(id) {
        if (!confirm('Delete this snapshot?')) return;
        saveSnapshots(getSnapshots().filter(s => s.id !== id));
        render();
    }

    // ── EDIT MODAL ───────────────────────────

    function openEditModal(id) {
        const snap = getSnapshots().find(s => s.id === id);
        if (!snap) return;

        const existing = document.getElementById('nw-edit-modal');
        if (existing) existing.remove();

        const cashVal = snap.cashValue || snap.cashTotal || 0;
        const nwColor = snap.netWorth >= 0 ? 'var(--green)' : 'var(--red)';
        const overlay = document.createElement('div');
        overlay.id = 'nw-edit-modal';
        overlay.className = 'modal-overlay open';
        overlay.innerHTML = `
            <div class="modal" style="width:660px; max-width:96vw;">
                <div class="modal-header">
                    <span class="modal-title">Edit Snapshot</span>
                    <button class="modal-close" onclick="NetWorth.closeEditModal()">✕</button>
                </div>
                <input type="hidden" id="nw-edit-id" value="${snap.id}">
                <div class="form-row">
                    <div class="form-group">
                        <label>Date</label>
                        <input type="date" id="nw-edit-date" value="${snap.date}">
                    </div>
                    <div class="form-group">
                        <label>Label <span style="color:var(--text-faint); font-weight:400;">(optional)</span></label>
                        <input type="text" id="nw-edit-label" value="${snap.label || ''}" placeholder="e.g. Jan 2026 — Year Start">
                    </div>
                </div>
                <div class="grid-2" style="margin:4px 0 16px;">
                    <div>
                        <div style="font-family:var(--font-mono); font-size:0.68rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:12px;">Assets</div>
                        <div class="form-group">
                            <label>Bank &amp; Cash Accounts</label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-edit-cash"
                                   value="${cashVal ? fmt(cashVal) : ''}" placeholder="0.00"
                                   oninput="NetWorth.updateEditTotals()">
                        </div>
                        <div class="form-group">
                            <label>Home / Property Value</label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-edit-home"
                                   value="${snap.homeValue ? fmt(snap.homeValue) : ''}" placeholder="0.00"
                                   oninput="NetWorth.updateEditTotals()">
                        </div>
                        <div class="form-group">
                            <label>Investment Portfolio</label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-edit-investments"
                                   value="${snap.investmentValue ? fmt(snap.investmentValue) : ''}" placeholder="0.00"
                                   oninput="NetWorth.updateEditTotals()">
                        </div>
                        <div class="form-group">
                            <label>Other Assets</label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-edit-other-assets"
                                   value="${snap.otherAssets ? fmt(snap.otherAssets) : ''}" placeholder="0.00"
                                   oninput="NetWorth.updateEditTotals()">
                            <input type="text" id="nw-edit-other-assets-label"
                                   value="${snap.otherAssetsLabel || ''}"
                                   placeholder="e.g. Car, Jewelry"
                                   style="margin-top:5px; font-size:0.8rem; color:var(--text-muted); background:transparent; border:1px solid var(--border); border-radius:var(--radius); padding:5px 9px; width:100%; box-sizing:border-box; outline:none;">
                        </div>
                    </div>
                    <div>
                        <div style="font-family:var(--font-mono); font-size:0.68rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); margin-bottom:12px;">Liabilities</div>
                        <div class="form-group">
                            <label>Mortgage Balance</label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-edit-mortgage"
                                   value="${snap.mortgageBalance ? fmt(snap.mortgageBalance) : ''}" placeholder="0.00"
                                   oninput="NetWorth.updateEditTotals()">
                        </div>
                        <div class="form-group">
                            <label>Car Loan Balance</label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-edit-car"
                                   value="${snap.carBalance ? fmt(snap.carBalance) : ''}" placeholder="0.00"
                                   oninput="NetWorth.updateEditTotals()">
                        </div>
                        <div class="form-group">
                            <label>Other Liabilities</label>
                            <input type="text" inputmode="decimal" data-fmt="currency" id="nw-edit-other-liab"
                                   value="${snap.otherLiabilities ? fmt(snap.otherLiabilities) : ''}" placeholder="0.00"
                                   oninput="NetWorth.updateEditTotals()">
                        </div>
                    </div>
                </div>
                <div style="background:var(--surface2); border-radius:8px; padding:14px 20px; display:flex; gap:36px; flex-wrap:wrap; margin-bottom:16px;">
                    <div>
                        <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.05em; color:var(--text-faint); margin-bottom:3px;">Total Assets</div>
                        <div id="nw-edit-form-assets" style="font-family:var(--font-mono); color:var(--green);">${fmt(snap.totalAssets)}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.05em; color:var(--text-faint); margin-bottom:3px;">Total Liabilities</div>
                        <div id="nw-edit-form-liab" style="font-family:var(--font-mono); color:var(--red);">${fmt(snap.totalLiabilities)}</div>
                    </div>
                    <div>
                        <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.05em; color:var(--text-faint); margin-bottom:3px;">Net Worth</div>
                        <div id="nw-edit-form-nw" style="font-family:var(--font-mono); font-weight:600; color:${nwColor};">${fmt(snap.netWorth)}</div>
                    </div>
                </div>
                <div style="display:flex; gap:10px; justify-content:flex-end;">
                    <button class="btn btn-ghost" onclick="NetWorth.closeEditModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="NetWorth.saveEdit()">Save Changes</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) NetWorth.closeEditModal(); });
        CurrencyInput.applyAll();
    }

    function closeEditModal() {
        const modal = document.getElementById('nw-edit-modal');
        if (modal) modal.remove();
    }

    function updateEditTotals() {
        const cash        = parseMoney(document.getElementById('nw-edit-cash')?.value);
        const home        = parseMoney(document.getElementById('nw-edit-home')?.value);
        const investments = parseMoney(document.getElementById('nw-edit-investments')?.value);
        const otherAssets = parseMoney(document.getElementById('nw-edit-other-assets')?.value);
        const mortgage    = parseMoney(document.getElementById('nw-edit-mortgage')?.value);
        const car         = parseMoney(document.getElementById('nw-edit-car')?.value);
        const otherLiab   = parseMoney(document.getElementById('nw-edit-other-liab')?.value);

        const totalAssets = cash + home + investments + otherAssets;
        const totalLiab   = mortgage + car + otherLiab;
        const nw          = totalAssets - totalLiab;

        document.getElementById('nw-edit-form-assets').textContent = fmt(totalAssets);
        document.getElementById('nw-edit-form-liab').textContent   = fmt(totalLiab);
        const nwEl = document.getElementById('nw-edit-form-nw');
        nwEl.textContent = fmt(nw);
        nwEl.style.color = nw >= 0 ? 'var(--green)' : 'var(--red)';
    }

    function saveEdit() {
        const id   = document.getElementById('nw-edit-id')?.value;
        const date = document.getElementById('nw-edit-date')?.value;
        if (!date) { Toast.show('Please select a date.'); return; }

        const cash             = parseMoney(document.getElementById('nw-edit-cash')?.value);
        const home             = parseMoney(document.getElementById('nw-edit-home')?.value);
        const investments      = parseMoney(document.getElementById('nw-edit-investments')?.value);
        const otherAssets      = parseMoney(document.getElementById('nw-edit-other-assets')?.value);
        const otherAssetsLabel = document.getElementById('nw-edit-other-assets-label')?.value.trim() || '';
        const mortgage         = parseMoney(document.getElementById('nw-edit-mortgage')?.value);
        const car              = parseMoney(document.getElementById('nw-edit-car')?.value);
        const otherLiab        = parseMoney(document.getElementById('nw-edit-other-liab')?.value);

        const totalAssets      = cash + home + investments + otherAssets;
        const totalLiabilities = mortgage + car + otherLiab;
        const netWorth         = totalAssets - totalLiabilities;

        const snapshots = getSnapshots();
        const idx = snapshots.findIndex(s => s.id === id);
        if (idx === -1) return;

        snapshots[idx] = {
            ...snapshots[idx],
            date,
            label:            document.getElementById('nw-edit-label')?.value.trim(),
            cashValue:        cash,
            homeValue:        home,
            investmentValue:  investments,
            otherAssets,
            otherAssetsLabel,
            mortgageBalance:  mortgage,
            carBalance:       car,
            otherLiabilities: otherLiab,
            totalAssets,
            totalLiabilities,
            netWorth
        };

        saveSnapshots(snapshots);
        closeEditModal();
        render();
        Toast.show('Snapshot updated ✓');
    }

    // ── DETAIL MODAL ─────────────────────────

    function openDetailModal(id) {
        const snapshots = getSnapshots(); // ascending by date
        const idx = snapshots.findIndex(s => s.id === id);
        if (idx === -1) return;
        const snap = snapshots[idx];
        const prev = idx > 0 ? snapshots[idx - 1] : null;
        const hasDetailedPrev = prev && prev.cashValue !== undefined;

        const existing = document.getElementById('nw-detail-modal');
        if (existing) existing.remove();

        const dateStr = new Date(snap.date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'short', year: 'numeric', month: 'long', day: 'numeric'
        });

        const nwChange  = prev ? snap.netWorth - prev.netWorth : null;
        const nwPct     = (nwChange !== null && prev.netWorth !== 0)
            ? ((nwChange / Math.abs(prev.netWorth)) * 100).toFixed(1) : null;
        const nwColor   = snap.netWorth >= 0 ? 'var(--green)' : 'var(--red)';
        const nwChgClr  = nwChange === null ? 'var(--text-faint)' : nwChange >= 0 ? 'var(--green)' : 'var(--red)';
        const nwChgStr  = nwChange !== null
            ? `${nwChange >= 0 ? '+' : ''}${fmtShort(nwChange)}${nwPct !== null ? `  ·  ${Number(nwPct) >= 0 ? '+' : ''}${nwPct}%` : ''}`
            : '';

        function detailRow(label, value, prevVal, isLiability = false, note = '') {
            const valStr  = value > 0 ? fmt(value) : '—';
            let diffStr = prev ? '—' : '';
            let diffClr = 'var(--text-faint)';
            if (prev && prevVal !== undefined) {
                const diff = value - prevVal;
                if (diff !== 0) {
                    diffStr = (diff > 0 ? '+' : '') + fmtShort(diff);
                    diffClr = isLiability
                        ? (diff < 0 ? 'var(--green)' : 'var(--red)')
                        : (diff > 0 ? 'var(--green)' : 'var(--red)');
                }
            }
            const noteHtml = note
                ? `<span style="font-size:0.7rem; color:var(--text-faint); margin-left:6px; font-style:italic;">${note}</span>` : '';
            return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border);">
                <span style="font-size:0.83rem; color:var(--text-muted);">${label}${noteHtml}</span>
                <div style="display:flex; gap:20px; align-items:center; flex-shrink:0;">
                    <span style="font-family:var(--font-mono); font-size:0.83rem; color:var(--text);">${valStr}</span>
                    <span style="font-family:var(--font-mono); font-size:0.78rem; color:${diffClr}; min-width:68px; text-align:right;">${diffStr}</span>
                </div>
            </div>`;
        }

        function totalRow(label, value, prevVal, isLiability = false) {
            const diff   = (prev && prevVal !== undefined) ? value - prevVal : null;
            const diffClr = diff === null ? '' : isLiability
                ? (diff < 0 ? 'var(--green)' : diff > 0 ? 'var(--red)' : 'var(--text-faint)')
                : (diff > 0 ? 'var(--green)' : diff < 0 ? 'var(--red)' : 'var(--text-faint)');
            const diffStr = diff !== null && diff !== 0 ? (diff > 0 ? '+' : '') + fmtShort(diff) : diff === 0 ? '—' : '';
            return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0 2px; border-top:1px solid var(--border);">
                <span style="font-size:0.83rem; font-weight:600; color:var(--text);">${label}</span>
                <div style="display:flex; gap:20px; align-items:center; flex-shrink:0;">
                    <span style="font-family:var(--font-mono); font-size:0.83rem; font-weight:600; color:var(--text);">${fmt(value)}</span>
                    <span style="font-family:var(--font-mono); font-size:0.78rem; font-weight:600; color:${diffClr}; min-width:68px; text-align:right;">${diffStr}</span>
                </div>
            </div>`;
        }

        function sectionHead(label) {
            return `<div style="font-size:0.65rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.1em; color:var(--text-faint); padding:14px 0 6px; border-top:1px solid var(--border); margin-top:6px;">${label}</div>`;
        }

        const p = (key) => hasDetailedPrev ? (prev[key] || 0) : undefined;

        const overlay = document.createElement('div');
        overlay.id = 'nw-detail-modal';
        overlay.className = 'modal-overlay open';
        overlay.innerHTML = `
        <div class="modal" style="width:540px; max-width:96vw;">
            <div class="modal-header">
                <span class="modal-title">${snap.label || 'Snapshot Details'}</span>
                <button class="modal-close" onclick="NetWorth.closeDetailModal()">✕</button>
            </div>
            <div style="font-size:0.78rem; color:var(--text-faint); margin:-4px 0 18px; font-family:var(--font-mono);">${dateStr}</div>

            <div style="background:var(--surface2); border-radius:8px; padding:16px 20px; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div>
                    <div style="font-size:0.65rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.08em; color:var(--text-faint); margin-bottom:5px;">Net Worth</div>
                    <div style="font-family:var(--font-mono); font-size:1.6rem; font-weight:700; color:${nwColor};">${fmt(snap.netWorth)}</div>
                </div>
                ${nwChgStr
                    ? `<div style="text-align:right;">
                           <div style="font-size:0.65rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.08em; color:var(--text-faint); margin-bottom:5px;">vs. previous</div>
                           <div style="font-family:var(--font-mono); font-size:0.95rem; font-weight:600; color:${nwChgClr};">${nwChgStr}</div>
                       </div>`
                    : `<div style="font-size:0.75rem; color:var(--text-faint);">First snapshot</div>`}
            </div>

            ${sectionHead('Assets')}
            ${detailRow('Cash & Bank Accounts',  snap.cashValue      || 0, p('cashValue'))}
            ${detailRow('Home / Property Value',  snap.homeValue      || 0, p('homeValue'))}
            ${detailRow('Investments',            snap.investmentValue|| 0, p('investmentValue'))}
            ${(snap.otherAssets > 0 || snap.otherAssetsLabel)
                ? detailRow('Other Assets', snap.otherAssets || 0, p('otherAssets'), false, snap.otherAssetsLabel || '')
                : ''}
            ${totalRow('Total Assets', snap.totalAssets || 0, p('totalAssets'))}

            ${sectionHead('Liabilities')}
            ${detailRow('Mortgage Balance',    snap.mortgageBalance  || 0, p('mortgageBalance'),  true)}
            ${detailRow('Car Loan Balance',    snap.carBalance       || 0, p('carBalance'),        true)}
            ${detailRow('Other Liabilities',   snap.otherLiabilities || 0, p('otherLiabilities'), true)}
            ${totalRow('Total Liabilities', snap.totalLiabilities || 0, p('totalLiabilities'), true)}

            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px; padding-top:16px; border-top:1px solid var(--border);">
                <button class="btn btn-ghost" onclick="NetWorth.closeDetailModal(); NetWorth.openEditModal('${snap.id}')">✎ Edit</button>
                <button class="btn btn-ghost" onclick="NetWorth.closeDetailModal()">Close</button>
            </div>
        </div>`;

        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) NetWorth.closeDetailModal(); });
    }

    function closeDetailModal() {
        const modal = document.getElementById('nw-detail-modal');
        if (modal) modal.remove();
    }

    // ── SMALL COMPONENTS ────────────────────

    function liveRow(label, value, color, indented = false) {
        return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-top:1px solid var(--border);">
            <span style="font-size:0.82rem; color:${indented ? 'var(--text-faint)' : 'var(--text-muted)'}; ${indented ? 'padding-left:12px;' : ''}">${label}</span>
            <span style="font-family:var(--font-mono); font-size:0.82rem; color:${color};">${value}</span>
        </div>`;
    }

    function autoSave() {
        try {
            const form = document.getElementById('nw-add-form');
            if (!form || form.style.display === 'none' || form.style.display === '') return;
            Data.set('networth_draft', {
                date:        document.getElementById('nw-snap-date')?.value              || '',
                label:       document.getElementById('nw-snap-label')?.value             || '',
                cash:        document.getElementById('nw-snap-cash')?.value              || '',
                home:        document.getElementById('nw-snap-home')?.value              || '',
                investments: document.getElementById('nw-snap-investments')?.value       || '',
                otherAssets: document.getElementById('nw-snap-other-assets')?.value      || '',
                otherLabel:  document.getElementById('nw-snap-other-assets-label')?.value|| '',
                mortgage:    document.getElementById('nw-snap-mortgage')?.value          || '',
                car:         document.getElementById('nw-snap-car')?.value               || '',
                otherLiab:   document.getElementById('nw-snap-other-liab')?.value        || '',
            });
        } catch (e) {}
    }

    return {
        render, autoSave,
        toggleAddAccount, addAccount, deleteAccount, updateAccount,
        showAddForm, hideAddForm, saveSnapshot, deleteSnapshot, updateFormTotals,
        openEditModal, closeEditModal, updateEditTotals, saveEdit,
        openDetailModal, closeDetailModal,
        updateProjection
    };

})();
