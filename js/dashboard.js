/**
 * dashboard.js — Dashboard Page
 * -------------------------------
 * Pulls summary data from all sections via Data.get()
 * and renders the key highlights panel.
 *
 * Dashboard.render() — called by navigate('dashboard')
 */

const Dashboard = (() => {

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
        if (abs >= 1000000) return sign + '$' + (abs / 1000000).toFixed(2) + 'M';
        if (abs >= 1000)    return sign + '$' + (abs / 1000).toFixed(1) + 'K';
        return sign + '$' + abs.toFixed(0);
    }

    function toMonthly(amount, frequency) {
        const map = {
            weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 24 / 12,
            monthly: 1, '2months': 1 / 2, quarterly: 1 / 3,
            '6months': 1 / 6, semiannual: 1 / 6, annual: 1 / 12
        };
        return (amount || 0) * (map[frequency] || 1);
    }

    function calcPayment(balance, annualRate, termMonths) {
        if (!balance || !termMonths) return 0;
        if (!annualRate) return balance / termMonths;
        const r = annualRate / 100 / 12;
        return balance * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
    }

    // ── DATA COLLECTORS ──────────────────────

    function getBudget() {
        const b = Data.get('budget') || {};
        const streams = Array.isArray(b.incomeStreams) ? b.incomeStreams : [];
        const cats    = Array.isArray(b.categories)   ? b.categories   : [];
        const subs    = Array.isArray(b.subscriptions) ? b.subscriptions : [];

        const monthlyIncome   = streams.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
        const monthlyCats     = cats.reduce((s, c) => s + toMonthly(c.amount, c.frequency), 0);
        const monthlySubs     = subs.reduce((s, sub) =>
            s + (sub.frequency === 'annual' ? (sub.amount || 0) / 12 : (sub.amount || 0)), 0);
        const monthlyExpenses = monthlyCats + monthlySubs;
        const monthlySurplus  = monthlyIncome - monthlyExpenses;
        const savingsRate     = monthlyIncome > 0 ? (monthlySurplus / monthlyIncome) * 100 : 0;
        const spendPct        = monthlyIncome > 0 ? Math.min(100, monthlyExpenses / monthlyIncome * 100) : 0;

        return { monthlyIncome, monthlyExpenses, monthlySurplus, savingsRate, spendPct, streamCount: streams.length };
    }

    function getCars() {
        const loans  = Array.isArray(Data.get('carLoan')) ? Data.get('carLoan') : [];
        const active = loans.filter(l => (l.currentBalance || 0) > 0);
        const totalBalance = active.reduce((s, l) => s + l.currentBalance, 0);
        const monthlyTotal = active.reduce((s, l) => {
            return s + (l.monthlyPayment || calcPayment(l.currentBalance, l.interestRate, l.termMonths));
        }, 0);
        return { totalBalance, monthlyTotal, count: active.length };
    }

    function getMortgage() {
        const mortgages      = Array.isArray(Data.get('mortgage')) ? Data.get('mortgage') : [];
        const active         = mortgages.filter(m => (m.currentBalance || 0) > 0);
        const totalBalance   = active.reduce((s, m) => s + m.currentBalance, 0);
        const totalHomeValue = active.reduce((s, m) => s + (m.homeValue || 0), 0);
        const totalEquity    = totalHomeValue - totalBalance;
        const equityPct      = totalHomeValue > 0 ? (totalEquity / totalHomeValue) * 100 : 0;
        const monthlyTotal   = active.reduce((s, m) => {
            return s + calcPayment(m.currentBalance, m.interestRate, m.termMonths)
                + (m.monthlyEscrow || 0) + (m.monthlyPMI || 0);
        }, 0);
        return { totalBalance, totalHomeValue, totalEquity, equityPct, monthlyTotal, count: active.length };
    }

    function getAccounts() {
        const accs     = Array.isArray(Data.get('bankAccounts')) ? Data.get('bankAccounts') : [];
        const total    = accs.reduce((s, a) => s + (a.balance || 0), 0);
        const checking = accs.filter(a => a.type === 'checking').reduce((s, a) => s + (a.balance || 0), 0);
        const savings  = accs.filter(a => a.type === 'savings' || a.type === 'money-market' || a.type === 'cd')
                             .reduce((s, a) => s + (a.balance || 0), 0);
        return { accs, total, checking, savings, count: accs.length };
    }

    function getInvestments() {
        const inv      = Data.get('investments') || {};
        const holdings = Array.isArray(inv.holdings) ? inv.holdings : [];
        const totalValue       = holdings.reduce((s, h) => s + (h.currentValue || 0), 0);
        const totalContributed = holdings.reduce((s, h) => s + (h.amountContributed || 0), 0);
        const totalGain        = totalValue - totalContributed;
        const gainPct          = totalContributed > 0 ? (totalGain / totalContributed) * 100 : 0;
        const blendedReturn    = totalValue > 0
            ? holdings.reduce((s, h) => s + (h.expectedReturn || 0) * (h.currentValue || 0), 0) / totalValue
            : 0;
        const monthlyContrib = holdings.reduce((s, h) => s + (h.monthlyContrib || 0), 0);
        return { totalValue, totalContributed, totalGain, gainPct, blendedReturn, monthlyContrib, count: holdings.length };
    }

    function getSavings() {
        const goals      = Array.isArray(Data.get('savingsGoals')) ? Data.get('savingsGoals') : [];
        const totalSaved  = goals.reduce((s, g) => s + (g.currentAmount || 0), 0);
        const totalTarget = goals.reduce((s, g) => s + (g.targetAmount || 0), 0);
        const complete    = goals.filter(g => (g.currentAmount || 0) >= (g.targetAmount || 0)).length;
        const monthly     = goals.reduce((s, g) => s + (g.monthlyContribution || 0), 0);
        const overallPct  = totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0;
        const active      = goals
            .filter(g => (g.currentAmount || 0) < (g.targetAmount || 0))
            .slice(0, 3);
        return { goals, active, totalSaved, totalTarget, complete, monthly, overallPct, count: goals.length };
    }

    function getDebtPlanner() {
        const s      = Data.get('debtPlanner') || {};
        const custom = Array.isArray(s.customDebts) ? s.customDebts : [];
        const totalBalance = custom.reduce((acc, d) => acc + (d.balance || 0), 0);
        const monthlyTotal = custom.reduce((acc, d) => acc + (d.minPayment || 0), 0);
        return {
            custom,
            totalBalance,
            monthlyTotal,
            method: s.method || 'avalanche',
            extra:  s.extraPayment || 0,
            count:  custom.length
        };
    }

    function getCreditCards() {
        const cards        = Array.isArray(Data.get('creditCards')) ? Data.get('creditCards') : [];
        const active       = cards.filter(c => (c.balance || 0) > 0.01);
        const totalBalance = active.reduce((s, c) => s + (c.balance || 0), 0);
        const totalLimit   = cards.reduce((s, c) => s + (c.creditLimit || 0), 0);
        const monthlyTotal = active.reduce((s, c) => s + (c.minPayment || Math.max(25, (c.balance || 0) * 0.02)), 0);
        const utilization  = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
        return { cards, active, totalBalance, totalLimit, monthlyTotal, utilization, count: cards.length };
    }

    function getTax() {
        if (typeof Tax === 'undefined' || typeof Tax.computeAll !== 'function') return null;
        const stored = Data.get('tax') || {};
        if (!stored.grossIncome) return null;
        try {
            const result = Tax.computeAll(stored);
            return {
                totalTax:        result.totalTax,
                federalTax:      result.federal.tax + result.ltcgTax,
                stateTax:        result.stateLocal.stateTax,
                effectiveRate:   result.effectiveFederal,
                takeHomeMonthly: result.takeHomeMonthly
            };
        } catch (e) { return null; }
    }

    function getPaycheck() {
        const s         = Data.get('paycheck') || {};
        const paychecks = Array.isArray(s.paychecks) ? s.paychecks : [];
        const active    = paychecks.filter(pc => (pc.grossPaycheck || 0) > 0);
        if (active.length === 0 || typeof Tax === 'undefined') return null;
        const taxData   = Data.get('tax') || {};
        const freqPPY   = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
        const freqLabel = { weekly: 'wk', biweekly: 'bi-wk', semimonthly: 'semi-mo', monthly: 'mo' };
        try {
            const results = active.map(pc => {
                const ppy       = freqPPY[pc.payFrequency] || 26;
                const state     = s.useTaxPage ? (taxData.state     || '') : (pc.state     || '');
                const localRate = s.useTaxPage ? (taxData.localRate || 0)  : (pc.localRate || 0);
                const customPre  = Array.isArray(pc.pretaxCustom)  ? pc.pretaxCustom.reduce((t, x)  => t + (x.amount||0), 0) : 0;
                const customPost = Array.isArray(pc.postTaxCustom) ? pc.postTaxCustom.reduce((t, x) => t + (x.amount||0), 0) : 0;
                const hp     = ((pc.medical||0) + (pc.dental||0) + (pc.vision||0) + (pc.hsa||0) + customPre) * ppy;
                const result = Tax.computeAll({
                    grossIncome: pc.grossPaycheck * ppy, filingStatus: pc.filingStatus || 'single',
                    state, localRate, healthPremiums: hp,
                    contrib401k: (pc.contrib401k || 0) * ppy, contribIRA: 0, contribHSA: 0,
                    deductionMethod: 'standard-2025', ltcg: 0, seIncome: 0, otherIncome: 0,
                });
                const preTax  = (pc.medical||0) + (pc.dental||0) + (pc.vision||0) + (pc.hsa||0) + (pc.contrib401k||0) + customPre;
                const postTax = (pc.roth401k||0) + (pc.rothIRA||0) + (pc.lifeInsurance||0) + customPost;
                const netCheck = Math.max(0, pc.grossPaycheck - preTax - result.totalTax / ppy - postTax);
                return { netCheck, ppy, freq: pc.payFrequency };
            });
            if (results.length === 1) {
                return { netCheck: results[0].netCheck, freqLabel: freqLabel[results[0].freq] || 'check' };
            }
            const monthlyNet = results.reduce((sum, r) => sum + r.netCheck * r.ppy / 12, 0);
            return { netCheck: monthlyNet, freqLabel: 'mo' };
        } catch (e) { return null; }
    }

    function getUpcomingBills() {
        const b    = Data.get('budget') || {};
        const cats = Array.isArray(b.categories)    ? b.categories    : [];
        const subs = Array.isArray(b.subscriptions) ? b.subscriptions : [];
        const todayMs = new Date();
        todayMs.setHours(0, 0, 0, 0);

        function nextDue(dueDay) {
            const d = parseInt(dueDay, 10);
            if (!d || d < 1 || d > 31) return null;
            const thisMonth = new Date(todayMs.getFullYear(), todayMs.getMonth(), d);
            return thisMonth >= todayMs ? thisMonth : new Date(todayMs.getFullYear(), todayMs.getMonth() + 1, d);
        }

        const bills = [];
        cats.forEach(c => {
            if (!c.dueDay) return;
            const due = nextDue(c.dueDay);
            if (!due) return;
            const daysAway = Math.round((due - todayMs) / 86400000);
            bills.push({ name: c.name, amount: toMonthly(c.amount, c.frequency), due, daysAway });
        });
        subs.forEach(s => {
            if (!s.dueDay) return;
            const due = nextDue(s.dueDay);
            if (!due) return;
            const daysAway = Math.round((due - todayMs) / 86400000);
            const monthlyAmt = s.frequency === 'annual' ? (s.amount || 0) / 12 : (s.amount || 0);
            bills.push({ name: s.name, amount: monthlyAmt, due, daysAway });
        });
        bills.sort((a, b) => a.due - b.due);
        return { bills: bills.slice(0, 7), total: bills.length };
    }

    // ── RENDER ───────────────────────────────

    function render() {
        const budget      = getBudget();
        const cars        = getCars();
        const mortgage    = getMortgage();
        const investments = getInvestments();
        const accounts    = getAccounts();
        const savings     = getSavings();
        const planner     = getDebtPlanner();
        const creditCards = getCreditCards();
        const tax         = getTax();
        const paycheck    = getPaycheck();
        const upcoming    = getUpcomingBills();
        const foo         = (typeof FOO !== 'undefined' && typeof FOO.getSummary === 'function')
                              ? FOO.getSummary() : null;

        const assets      = accounts.total + mortgage.totalHomeValue + investments.totalValue;
        const liabilities = mortgage.totalBalance + cars.totalBalance + creditCards.totalBalance + planner.totalBalance;
        const netWorth    = assets - liabilities;
        const totalDebt   = cars.totalBalance + mortgage.totalBalance + creditCards.totalBalance + planner.totalBalance;
        const monthlyDebt = cars.monthlyTotal + mortgage.monthlyTotal + creditCards.monthlyTotal + planner.monthlyTotal;

        const hasAnyData = budget.monthlyIncome > 0 || assets > 0 || liabilities > 0
            || investments.totalValue > 0 || savings.count > 0 || planner.count > 0
            || accounts.count > 0;

        const today = new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        document.getElementById('page-dashboard').innerHTML = hasAnyData
            ? buildFull({ budget, cars, mortgage, investments, accounts, savings, planner,
                          creditCards, tax, paycheck, upcoming, foo,
                          netWorth, assets, liabilities, totalDebt, monthlyDebt, today })
            : buildEmpty(today);

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── EMPTY STATE ──────────────────────────

    function buildEmpty(today) {
        return `
        <div class="page-header">
            <h2>Dashboard</h2>
            <p>${today}</p>
        </div>
        <div class="card" style="text-align:center; padding:56px 32px;">
            <div style="font-size:0.72rem; font-family:var(--font-mono); text-transform:uppercase;
                        letter-spacing:0.1em; color:var(--text-faint); margin-bottom:16px;">Welcome to Ledger</div>
            <div style="font-family:var(--font-serif); font-size:1.6rem; color:var(--text); margin-bottom:12px;">
                Your financial dashboard is empty.
            </div>
            <div style="font-size:0.88rem; color:var(--text-muted); max-width:460px; margin:0 auto 28px; line-height:1.7;">
                Fill in data across the pages below — everything rolls up here automatically.
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center; max-width:520px; margin:0 auto;">
                ${quickLink('wallet', 'Budget', 'budget', 'Income streams &amp; categories')}
                ${quickLink('piggy-bank', 'Savings Goals', 'savings', 'Track financial milestones')}
                ${quickLink('target', 'Debt Planner', 'debt', 'Avalanche or snowball')}
                ${quickLink('trending-up', 'Investments', 'investments', 'Portfolio &amp; projections')}
                ${quickLink('home', 'Mortgage', 'mortgage', 'Equity &amp; payoff timeline')}
                ${quickLink('receipt', 'Tax', 'tax', 'Estimated liability')}
            </div>
        </div>`;
    }

    function quickLink(icon, label, page, desc) {
        return `
        <div onclick="navigate('${page}')"
             style="display:flex; align-items:center; gap:10px; padding:12px 16px;
                    background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius);
                    cursor:pointer; transition:all 0.18s; text-align:left; min-width:200px; flex:1;"
             onmouseenter="this.style.borderColor='var(--accent)'"
             onmouseleave="this.style.borderColor='var(--border)'">
            <i data-lucide="${icon}" style="width:16px; height:16px; color:var(--accent); flex-shrink:0;"></i>
            <div>
                <div style="font-size:0.85rem; font-weight:500; color:var(--text);">${label}</div>
                <div style="font-size:0.72rem; color:var(--text-muted); margin-top:1px;">${desc}</div>
            </div>
        </div>`;
    }

    // ── FULL DASHBOARD ────────────────────────

    function buildFull({ budget, cars, mortgage, investments, accounts, savings, planner,
                         creditCards, tax, paycheck, upcoming, foo,
                         netWorth, assets, liabilities, totalDebt, monthlyDebt, today }) {

        const nwCls      = netWorth >= 0 ? 'value-green' : 'value-red';
        const surplusCls = budget.monthlySurplus >= 0 ? 'value-green' : 'value-red';
        const spendBarColor = budget.spendPct > 100 ? 'var(--red)' : 'var(--accent)';

        return `
        <div class="page-header">
            <h2>Dashboard</h2>
            <p>${today}</p>
        </div>

        <!-- ── NET WORTH HERO ── -->
        <div class="card" style="margin-bottom:16px; border-left:3px solid var(--accent);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
                <div>
                    <div class="card-title">Total Net Worth</div>
                    <div class="card-value ${nwCls}" style="font-size:3rem; line-height:1.1;">${fmtShort(netWorth)}</div>
                    <div style="font-size:0.78rem; color:var(--text-muted); margin-top:6px;">
                        <span style="color:var(--green);">Assets ${fmtShort(assets)}</span>
                        &nbsp;—&nbsp;
                        <span style="color:var(--red);">Liabilities ${fmtShort(liabilities)}</span>
                    </div>
                </div>
                <div style="display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start; padding-top:4px;">
                    ${accounts.total > 0            ? nwPill('Cash & Bank',  fmtShort(accounts.total),           'var(--green)') : ''}
                    ${mortgage.totalHomeValue > 0   ? nwPill('Home Equity',  fmtShort(mortgage.totalEquity),     'var(--green)') : ''}
                    ${investments.totalValue > 0    ? nwPill('Investments',  fmtShort(investments.totalValue),   'var(--green)') : ''}
                    ${mortgage.totalBalance > 0     ? nwPill('Mortgage',     fmtShort(mortgage.totalBalance),    'var(--red)')   : ''}
                    ${cars.totalBalance > 0         ? nwPill('Car Loans',    fmtShort(cars.totalBalance),        'var(--red)')   : ''}
                    ${creditCards.totalBalance > 0  ? nwPill('Credit Cards', fmtShort(creditCards.totalBalance), 'var(--red)')   : ''}
                    ${planner.totalBalance > 0      ? nwPill('Other Debt',   fmtShort(planner.totalBalance),     'var(--red)')   : ''}
                </div>
            </div>
        </div>

        <!-- ── QUICK STATS ── -->
        <div class="summary-grid" style="grid-template-columns:repeat(4,1fr); margin-bottom:16px;">
            <div class="summary-card">
                <div class="label">Monthly Income</div>
                <div class="value ${budget.monthlyIncome > 0 ? 'value-green' : ''}">${fmt(budget.monthlyIncome)}</div>
                <div class="sub">${budget.streamCount} stream${budget.streamCount !== 1 ? 's' : ''}</div>
            </div>
            <div class="summary-card">
                <div class="label">Monthly Expenses</div>
                <div class="value ${budget.monthlyExpenses > 0 ? 'value-red' : ''}">${fmt(budget.monthlyExpenses)}</div>
                <div class="sub">categories + subscriptions</div>
            </div>
            <div class="summary-card">
                <div class="label">Monthly Surplus</div>
                <div class="value ${surplusCls}">${fmt(budget.monthlySurplus)}</div>
                <div class="sub">income minus expenses</div>
            </div>
            <div class="summary-card">
                <div class="label">Savings Rate</div>
                <div class="value ${budget.savingsRate >= 20 ? 'value-green' : budget.savingsRate > 0 ? 'value-accent' : ''}">
                    ${budget.savingsRate.toFixed(1)}%
                </div>
                <div class="sub">${budget.savingsRate >= 20 ? 'on track' : budget.savingsRate > 0 ? 'keep building' : 'not yet set'}</div>
            </div>
        </div>

        <!-- ── BANK ACCOUNTS STRIP ── -->
        ${buildAccountsStrip(accounts)}

        <!-- ── ROW 1: FOO + Investments + Upcoming Bills ── -->
        <div class="grid-3" style="margin-bottom:16px;">
            ${buildFOOCard(foo)}
            ${buildInvestmentsCard(investments)}
            ${buildUpcomingBillsCard(upcoming)}
        </div>

        <!-- ── ROW 2: Budget Health + Savings Goals ── -->
        <div class="grid-2" style="margin-bottom:16px;">
            ${buildBudgetCard(budget, spendBarColor)}
            ${buildSavingsCard(savings)}
        </div>

        <!-- ── ROW 3: Debt Overview + Tax Snapshot ── -->
        <div class="grid-2" style="margin-bottom:16px;">
            ${buildDebtCard(cars, mortgage, planner, creditCards, totalDebt, monthlyDebt)}
            ${buildTaxCard(tax, paycheck)}
        </div>`;
    }

    // ── BANK ACCOUNTS STRIP ──────────────────

    function buildAccountsStrip(accounts) {
        if (accounts.count === 0) {
            return `
            <div class="card" style="margin-bottom:16px; padding:14px 24px;">
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <i data-lucide="landmark" style="width:18px; height:18px; color:var(--text-faint);"></i>
                        <span style="font-size:0.84rem; color:var(--text-muted);">
                            No bank accounts linked yet — add them on the
                            <span onclick="navigate('networth')"
                                  style="color:var(--accent); cursor:pointer; text-decoration:underline;">Net Worth</span>
                            page to include liquid assets in your calculations.
                        </span>
                    </div>
                    <button class="btn btn-ghost" style="font-size:0.76rem; padding:5px 12px; white-space:nowrap;"
                            onclick="navigate('networth')">Add Accounts →</button>
                </div>
            </div>`;
        }

        const COLORS     = { checking: 'var(--accent)', savings: 'var(--green)', 'money-market': 'var(--green)', cd: 'var(--blue)', hsa: 'var(--blue)', cash: 'var(--text-muted)', other: 'var(--text-muted)' };
        const TYPE_LABEL = { checking: 'Checking', savings: 'Savings', 'money-market': 'Money Mkt', cd: 'CD', hsa: 'HSA', cash: 'Cash', other: 'Other' };

        const preview = accounts.accs.slice(0, 5);
        const extra   = accounts.count - preview.length;

        const chips = preview.map(a => `
            <div style="display:flex; align-items:center; gap:8px; padding:6px 12px;
                        background:var(--surface2); border-radius:6px; white-space:nowrap;">
                <div style="width:7px; height:7px; border-radius:50%; background:${COLORS[a.type] || 'var(--text-muted)'}; flex-shrink:0;"></div>
                <div>
                    <div style="font-size:0.78rem; color:var(--text);">${a.name}</div>
                    <div style="font-size:0.68rem; font-family:var(--font-mono); color:var(--text-muted);">
                        ${TYPE_LABEL[a.type] || 'Account'} · ${fmtShort(a.balance || 0)}
                    </div>
                </div>
            </div>`
        ).join('');

        return `
        <div class="card" style="margin-bottom:16px; padding:14px 24px;">
            <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
                <div style="flex-shrink:0; min-width:120px;">
                    <div style="font-family:var(--font-mono); font-size:0.65rem; text-transform:uppercase;
                                letter-spacing:0.08em; color:var(--text-muted); margin-bottom:3px;">
                        Cash &amp; Bank · ${accounts.count} account${accounts.count !== 1 ? 's' : ''}
                    </div>
                    <div style="font-family:var(--font-serif); font-size:1.5rem; font-weight:600; color:var(--green);">
                        ${fmtShort(accounts.total)}
                    </div>
                </div>
                <div style="width:1px; height:40px; background:var(--border); flex-shrink:0;"></div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; flex:1;">
                    ${chips}
                    ${extra > 0 ? `
                    <div style="display:flex; align-items:center; padding:6px 12px;
                                background:var(--surface2); border-radius:6px;
                                font-size:0.76rem; color:var(--text-muted);">+${extra} more</div>` : ''}
                </div>
                <button class="btn btn-ghost" style="font-size:0.76rem; padding:5px 12px; white-space:nowrap; flex-shrink:0;"
                        onclick="navigate('networth')">Manage →</button>
            </div>
        </div>`;
    }

    // ── FOO CARD ──────────────────────────────

    function buildFOOCard(foo) {
        if (!foo) {
            return `
            <div class="card">
                <div class="section-header">
                    <span class="card-title" style="margin:0;">Financial Order of Ops</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; padding:16px 0 8px; gap:10px; text-align:center;">
                    <i data-lucide="list-ordered" class="empty-state-icon"></i>
                    <div style="font-size:0.84rem; color:var(--text-muted); line-height:1.5; max-width:220px;">
                        Track your progress through the 9 steps of the Financial Order of Operations.
                    </div>
                    <button class="btn btn-ghost" style="font-size:0.78rem; padding:7px 16px; margin-top:4px;"
                            onclick="navigate('foo')">Open FOO →</button>
                </div>
            </div>`;
        }

        const pct      = foo.total > 0 ? (foo.complete / foo.total) * 100 : 0;
        const barColor = pct >= 100 ? 'var(--green)' : 'var(--accent)';

        return `
        <div class="card">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Financial Order of Ops</span>
                <span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">${foo.complete}/${foo.total}</span>
            </div>
            <div style="margin-bottom:14px;">
                <div class="progress-bar-wrap" style="height:8px; margin-bottom:8px;">
                    <div class="progress-bar" style="width:${pct.toFixed(1)}%; background:${barColor};"></div>
                </div>
                <div style="font-size:0.72rem; font-family:var(--font-mono); color:var(--text-muted);">${pct.toFixed(0)}% of 9 steps complete</div>
            </div>
            <div style="background:var(--surface2); border-radius:var(--radius); padding:12px 14px; margin-bottom:12px; flex:1;">
                <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase;
                            letter-spacing:0.07em; color:var(--text-muted); margin-bottom:4px;">
                    ${foo.focusStep ? 'Next Focus' : 'Status'}
                </div>
                <div style="font-size:0.85rem; color:${foo.focusStep ? 'var(--text)' : 'var(--green)'};">
                    ${foo.focusStep ? foo.focusStep.title : 'All steps complete!'}
                </div>
            </div>
            <div style="text-align:right;">
                <button class="btn btn-ghost" style="font-size:0.76rem; padding:5px 12px;"
                        onclick="navigate('foo')">View FOO →</button>
            </div>
        </div>`;
    }

    // ── INVESTMENTS CARD ──────────────────────

    function buildInvestmentsCard(investments) {
        const gainCls   = investments.totalGain >= 0 ? 'var(--green)' : 'var(--red)';
        const gainArrow = investments.totalGain >= 0 ? '▲' : '▼';

        return `
        <div class="card">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Investment Portfolio</span>
                ${investments.count > 0
                    ? `<span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">${investments.count} holding${investments.count !== 1 ? 's' : ''}</span>`
                    : ''}
            </div>
            ${investments.totalValue > 0 ? `
            <div style="margin-bottom:14px;">
                <div style="font-family:var(--font-serif); font-size:1.9rem; font-weight:600;">${fmtShort(investments.totalValue)}</div>
                <div style="font-size:0.78rem; color:${gainCls}; margin-top:3px; font-family:var(--font-mono);">
                    ${gainArrow} ${fmtShort(Math.abs(investments.totalGain))} (${investments.gainPct.toFixed(1)}%)
                </div>
            </div>
            <div style="display:flex; border-top:1px solid var(--border); padding-top:12px;">
                ${statCell('Contributed',    fmtShort(investments.totalContributed), 'var(--text)')}
                ${statCell('Blended Return', investments.blendedReturn.toFixed(1) + '%', 'var(--accent)')}
                ${investments.monthlyContrib > 0
                    ? statCell('Monthly Contrib', fmt(investments.monthlyContrib), 'var(--text)')
                    : ''}
            </div>`
            : emptyCard('Add holdings on the', 'Investments', 'investments', 'page to track your portfolio.')}
        </div>`;
    }

    // ── UPCOMING BILLS CARD ───────────────────

    function buildUpcomingBillsCard(upcoming) {
        if (upcoming.bills.length === 0) {
            return `
            <div class="card">
                <div class="section-header">
                    <span class="card-title" style="margin:0;">Upcoming Bills</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; padding:16px 0 8px; gap:10px; text-align:center;">
                    <i data-lucide="calendar-clock" class="empty-state-icon"></i>
                    <div style="font-size:0.84rem; color:var(--text-muted); line-height:1.5; max-width:220px;">
                        Add a due day to budget categories or subscriptions to see upcoming bills here.
                    </div>
                    <button class="btn btn-ghost" style="font-size:0.78rem; padding:7px 16px; margin-top:4px;"
                            onclick="navigate('budget')">Open Budget →</button>
                </div>
            </div>`;
        }

        const rows = upcoming.bills.slice(0, 5).map(b => {
            const daysLabel  = b.daysAway === 0 ? 'Today' : b.daysAway === 1 ? 'Tomorrow' : `in ${b.daysAway}d`;
            const urgentColor = b.daysAway <= 3 ? 'var(--red)' : b.daysAway <= 7 ? 'var(--accent)' : 'var(--text-muted)';
            return `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 0;
                        border-bottom:1px solid var(--border);">
                <div>
                    <div style="font-size:0.82rem; color:var(--text);">${b.name}</div>
                    <div style="font-size:0.7rem; font-family:var(--font-mono); color:${urgentColor};">${daysLabel}</div>
                </div>
                <div style="font-family:var(--font-mono); font-size:0.82rem; color:var(--text);">${fmt(b.amount)}</div>
            </div>`;
        }).join('');

        return `
        <div class="card">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Upcoming Bills</span>
                ${upcoming.total > 5
                    ? `<span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">${upcoming.total} total</span>`
                    : ''}
            </div>
            <div>${rows}</div>
            <div style="text-align:right; margin-top:10px;">
                <button class="btn btn-ghost" style="font-size:0.76rem; padding:5px 12px;"
                        onclick="navigate('budget')">View Budget →</button>
            </div>
        </div>`;
    }

    // ── BUDGET HEALTH CARD ────────────────────

    function buildBudgetCard(budget, spendBarColor) {
        const healthLabel = budget.savingsRate >= 20 ? 'Healthy'
            : budget.savingsRate > 0 ? 'Fair'
            : budget.monthlyIncome > 0 ? 'Review' : 'No Data';
        const healthBadge = budget.savingsRate >= 20 ? 'badge-green'
            : budget.savingsRate > 0 ? 'badge-accent' : 'badge-muted';

        return `
        <div class="card" style="cursor:default;">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Budget Health</span>
                <span class="badge ${healthBadge}">${healthLabel}</span>
            </div>
            ${budget.monthlyIncome > 0 ? `
            <div style="margin-bottom:14px;">
                <div style="display:flex; justify-content:space-between; font-size:0.76rem;
                            color:var(--text-muted); margin-bottom:5px;">
                    <span>Spending ${budget.spendPct.toFixed(1)}% of income</span>
                    <span style="font-family:var(--font-mono);">${fmt(budget.monthlyExpenses)} / ${fmt(budget.monthlyIncome)}</span>
                </div>
                <div class="progress-bar-wrap">
                    <div class="progress-bar" style="width:${budget.spendPct.toFixed(1)}%; background:${spendBarColor};"></div>
                </div>
            </div>
            <div style="display:flex; border-top:1px solid var(--border); padding-top:12px;">
                ${statCell('Income',   fmt(budget.monthlyIncome),  'var(--green)')}
                ${statCell('Expenses', fmt(budget.monthlyExpenses), 'var(--red)')}
                ${statCell('Surplus',  fmt(budget.monthlySurplus),
                    budget.monthlySurplus >= 0 ? 'var(--green)' : 'var(--red)')}
            </div>`
            : emptyCard('Add income streams and spending categories on the', 'Budget', 'budget', 'page.')}
        </div>`;
    }

    // ── SAVINGS GOALS CARD ────────────────────

    function buildSavingsCard(savings) {
        if (savings.count === 0) {
            return `
            <div class="card">
                <div class="section-header">
                    <span class="card-title" style="margin:0;">Savings Goals</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; padding:16px 0 8px; gap:10px; text-align:center;">
                    <i data-lucide="piggy-bank" class="empty-state-icon"></i>
                    <div style="font-size:0.84rem; color:var(--text-muted); line-height:1.5; max-width:240px;">
                        No goals yet. Set targets for your emergency fund, vacation, down payment, and more.
                    </div>
                    <button class="btn btn-ghost" style="font-size:0.78rem; padding:7px 16px; margin-top:4px;"
                            onclick="navigate('savings')">Create a Goal →</button>
                </div>
            </div>`;
        }

        const pct      = savings.overallPct;
        const barColor = pct >= 100 ? 'var(--green)' : 'var(--accent)';

        const goalRows = savings.active.map(g => {
            const gPct  = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
            const color = g.color || '#D97757';
            return `
            <div style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:0.8rem; color:var(--text);">${g.emoji || '🎯'} ${g.name}</span>
                    <span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">
                        ${fmtShort(g.currentAmount)} / ${fmtShort(g.targetAmount)}
                    </span>
                </div>
                <div class="progress-bar-wrap" style="height:5px;">
                    <div class="progress-bar" style="width:${gPct.toFixed(1)}%; background:${color};"></div>
                </div>
            </div>`;
        }).join('');

        const remainingCount = savings.count - savings.active.length - savings.complete;

        return `
        <div class="card">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Savings Goals</span>
                <span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">
                    ${savings.complete > 0 ? savings.complete + ' complete · ' : ''}${savings.count} total
                </span>
            </div>
            <div style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
                    <span style="font-family:var(--font-serif); font-size:1.7rem; font-weight:600; color:var(--green);">
                        ${fmtShort(savings.totalSaved)}
                    </span>
                    <span style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-muted);">
                        of ${fmtShort(savings.totalTarget)} · ${pct.toFixed(0)}%
                    </span>
                </div>
                <div class="progress-bar-wrap" style="height:6px;">
                    <div class="progress-bar" style="width:${pct.toFixed(1)}%; background:${barColor};"></div>
                </div>
            </div>
            ${savings.active.length > 0 ? `
            <div style="border-top:1px solid var(--border); padding-top:12px; margin-bottom:4px;">
                ${goalRows}
            </div>
            ${remainingCount > 0
                ? `<div style="font-size:0.72rem; color:var(--text-faint); text-align:center; margin-top:4px;">+${remainingCount} more goal${remainingCount !== 1 ? 's' : ''}</div>`
                : ''}` : ''}
            <div style="display:flex; justify-content:space-between; align-items:center;
                        border-top:1px solid var(--border); padding-top:10px; margin-top:8px;">
                ${savings.monthly > 0
                    ? `<span style="font-family:var(--font-mono); font-size:0.76rem; color:var(--text-muted);">${fmt(savings.monthly)}/mo contributing</span>`
                    : '<span></span>'}
                <button class="btn btn-ghost" style="font-size:0.76rem; padding:5px 12px;"
                        onclick="navigate('savings')">View Goals →</button>
            </div>
        </div>`;
    }

    // ── DEBT OVERVIEW CARD ────────────────────

    function buildDebtCard(cars, mortgage, planner, creditCards, totalDebt, monthlyDebt) {
        const methodLabel = planner.method === 'avalanche'
            ? 'Avalanche — highest rate first'
            : 'Snowball — smallest balance first';

        if (totalDebt === 0) {
            return `
            <div class="card">
                <div class="section-header">
                    <span class="card-title" style="margin:0;">Debt Overview</span>
                </div>
                ${emptyCard('No balances entered. Add data on the', 'Car Loan', 'car-loan', 'or Mortgage pages, or add custom debts in the Debt Planner.')}
            </div>`;
        }

        return `
        <div class="card">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Debt Overview</span>
                <span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--red);">${fmtShort(totalDebt)} total</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
                ${mortgage.totalBalance > 0 ? debtRow(
                    'Mortgage' + (mortgage.count > 1 ? 's' : ''),
                    fmt(mortgage.monthlyTotal) + '/mo · ' + mortgage.equityPct.toFixed(1) + '% equity',
                    fmtShort(mortgage.totalBalance)
                ) : ''}
                ${cars.totalBalance > 0 ? debtRow(
                    'Car Loan' + (cars.count !== 1 ? 's' : ''),
                    fmt(cars.monthlyTotal) + '/mo · ' + cars.count + ' vehicle' + (cars.count !== 1 ? 's' : ''),
                    fmtShort(cars.totalBalance)
                ) : ''}
                ${creditCards.totalBalance > 0 ? debtRow(
                    'Credit Cards',
                    fmt(creditCards.monthlyTotal) + '/mo · ' + creditCards.utilization.toFixed(0) + '% utilization',
                    fmtShort(creditCards.totalBalance)
                ) : ''}
                ${planner.custom.slice(0, 2).map(d => debtRow(
                    d.name,
                    fmt(d.minPayment) + '/mo · ' + (d.rate ? d.rate.toFixed(1) + '% APR' : 'no rate'),
                    fmtShort(d.balance)
                )).join('')}
                ${planner.count > 2 ? `
                <div style="font-size:0.72rem; color:var(--text-faint); text-align:center; padding:4px;">
                    +${planner.count - 2} more in Debt Planner
                </div>` : ''}
            </div>
            <div style="background:var(--surface2); border-radius:6px; padding:9px 12px; margin-bottom:12px;
                        display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
                <div>
                    <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase;
                                letter-spacing:0.06em; color:var(--text-muted); margin-bottom:2px;">Strategy</div>
                    <div style="font-size:0.8rem; color:var(--text);">${methodLabel}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase;
                                letter-spacing:0.06em; color:var(--text-muted); margin-bottom:2px;">Extra Payment</div>
                    <div style="font-family:var(--font-mono); font-size:0.82rem; color:${planner.extra > 0 ? 'var(--green)' : 'var(--text-muted)'};">
                        ${planner.extra > 0 ? fmt(planner.extra) + '/mo' : 'None set'}
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;
                        padding-top:10px; border-top:1px solid var(--border);">
                <div>
                    <div style="font-family:var(--font-mono); font-size:0.69rem; text-transform:uppercase;
                                letter-spacing:0.06em; color:var(--text-muted); margin-bottom:2px;">Monthly Obligations</div>
                    <div style="font-family:var(--font-mono); color:var(--red);">${fmt(monthlyDebt)}</div>
                </div>
                <button class="btn btn-ghost" style="font-size:0.76rem; padding:5px 12px;"
                        onclick="navigate('debt')">Debt Planner →</button>
            </div>
        </div>`;
    }

    // ── TAX SNAPSHOT CARD ─────────────────────

    function buildTaxCard(tax, paycheck) {
        return `
        <div class="card">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Tax Snapshot</span>
                ${tax ? `<span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">Est. ${new Date().getFullYear()}</span>` : ''}
            </div>
            ${tax ? `
            <div style="margin-bottom:14px;">
                <div style="font-family:var(--font-serif); font-size:1.9rem; font-weight:600;">${fmtShort(tax.totalTax)}</div>
                <div style="font-size:0.78rem; color:var(--text-muted); margin-top:3px;">estimated annual tax liability</div>
            </div>
            <div style="display:flex; flex-wrap:wrap; border-top:1px solid var(--border); padding-top:12px;">
                ${statCell('Eff. Rate',    (tax.effectiveRate * 100).toFixed(1) + '%', 'var(--accent)')}
                ${statCell('Take-Home/Mo', fmt(tax.takeHomeMonthly),                   'var(--green)')}
                ${statCell('Federal',      fmtShort(tax.federalTax),                   'var(--text)')}
                ${paycheck ? statCell('Net/' + paycheck.freqLabel, fmt(paycheck.netCheck), 'var(--green)') : ''}
            </div>`
            : emptyCard('Enter gross income on the', 'Tax', 'tax', 'page to see your estimated liability.')}
        </div>`;
    }

    // ── SMALL COMPONENTS ─────────────────────

    function nwPill(label, value, color) {
        return `
        <div style="text-align:center; min-width:72px;">
            <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase;
                        letter-spacing:0.05em; color:var(--text-faint); margin-bottom:3px;">${label}</div>
            <div style="font-family:var(--font-mono); font-size:0.85rem; color:${color};">${value}</div>
        </div>`;
    }

    function statCell(label, value, color) {
        return `
        <div style="flex:1; padding:0 12px; border-right:1px solid var(--border);">
            <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase;
                        letter-spacing:0.05em; color:var(--text-faint); margin-bottom:3px;">${label}</div>
            <div style="font-family:var(--font-mono); font-size:0.85rem; color:${color};">${value}</div>
        </div>`;
    }

    function debtRow(title, sub, balance) {
        return `
        <div style="display:flex; justify-content:space-between; align-items:center;
                    padding:10px 12px; background:var(--surface2); border-radius:6px;">
            <div>
                <div style="font-size:0.82rem; font-weight:500;">${title}</div>
                <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">${sub}</div>
            </div>
            <div style="font-family:var(--font-mono); font-size:0.88rem; color:var(--red);">${balance}</div>
        </div>`;
    }

    function emptyCard(prefix, pageName, pageId, suffix) {
        return `
        <div style="color:var(--text-muted); font-size:0.83rem; padding:8px 0 4px; line-height:1.6;">
            ${prefix}
            <span onclick="navigate('${pageId}')"
                  style="color:var(--accent); cursor:pointer; text-decoration:underline;">${pageName}</span>
            ${suffix}
        </div>`;
    }

    return { render };

})();
