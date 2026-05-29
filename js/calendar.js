/**
 * calendar.js — Financial Calendar
 * ----------------------------------
 * Monthly view of every paycheck, bill, subscription, and payment.
 * Income pulled from Paycheck page. Loans/mortgage pulled live.
 * Annual subscriptions shown in a distinct color.
 * Each event type can be individually toggled on/off via the filter bar.
 *
 * Cal.render()          — render full page
 * Cal.prevMonth()       — navigate to previous month
 * Cal.nextMonth()       — navigate to next month
 * Cal.goToToday()       — jump to current month
 * Cal.openDay(day)      — open day detail modal
 * Cal.closeDay()        — close day detail modal
 * Cal.toggleSettings()  — expand/collapse pay-schedule settings
 * Cal.saveSchedule()    — persist income/payment schedule config
 * Cal.toggleType(type)  — show/hide an event type and re-render
 */

const Cal = (() => {

    const _now = new Date();
    let viewYear  = _now.getFullYear();
    let viewMonth = _now.getMonth(); // 0-indexed

    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const DOW    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    // ── HELPERS ──────────────────────────────────

    function fmt(n) {
        return '$' + Number(Math.abs(n)).toLocaleString('en-US', {
            minimumFractionDigits: 2, maximumFractionDigits: 2
        });
    }

    function fmtShort(n) {
        const abs = Math.abs(n);
        if (abs >= 1_000_000) return '$' + (abs / 1_000_000).toFixed(1) + 'M';
        if (abs >= 1_000)     return '$' + (abs / 1_000).toFixed(1) + 'K';
        return '$' + abs.toFixed(0);
    }

    function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

    // Returns which calendar days in a given month land on a bi-weekly cycle anchored to refDateStr
    function getBiweeklyDays(refDateStr, year, month) {
        if (!refDateStr) return [];
        const ref    = new Date(refDateStr + 'T00:00:00');
        const total  = daysInMonth(year, month);
        const result = [];
        for (let d = 1; d <= total; d++) {
            const diff = Math.round((new Date(year, month, d) - ref) / 86400000);
            if (diff % 14 === 0) result.push(d);
        }
        return result;
    }

    function calcPmt(balance, annualRate, termMonths) {
        if (!balance || !termMonths) return 0;
        if (!annualRate) return balance / termMonths;
        const r = annualRate / 100 / 12;
        return balance * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
    }

    // ── CALENDAR SETTINGS ────────────────────────

    function getCalData() {
        const d = Data.get('calendar') || {};
        if (!d.incomeSchedules)   d.incomeSchedules   = {};
        if (!d.billDays)          d.billDays          = {};
        if (!d.hiddenTypes)       d.hiddenTypes       = [];
        if (!d.savingsSchedule)   d.savingsSchedule   = {};
        return d;
    }
    function setCalData(d) { Data.set('calendar', d); }

    // Returns paychecks from the Paycheck page that have gross pay configured.
    function getPaychecks() {
        const d = Data.get('paycheck') || {};
        return (d.paychecks || []).filter(pc => pc.grossPaycheck > 0);
    }

    // Returns day numbers (1-based) when a paycheck lands in the given month.
    function getPayDays(pc, year, month) {
        const cal   = getCalData();
        const sched = (cal.incomeSchedules || {})[pc.id] || {};
        const freq  = pc.payFrequency;
        const max   = daysInMonth(year, month);

        if (freq === 'monthly') {
            return [Math.min(sched.day || 1, max)];
        }
        if (freq === 'semimonthly') {
            const d1 = Math.min(sched.day1 || 1,  max);
            const d2 = Math.min(sched.day2 || 15, max);
            return d1 === d2 ? [d1] : [d1, d2];
        }
        if (freq === 'biweekly') {
            if (!sched.refDate) return [];
            const ref  = new Date(sched.refDate + 'T00:00:00');
            const days = [];
            let d = new Date(ref);
            const monthStart = new Date(year, month, 1);
            while (d >= monthStart) d = new Date(d.getTime() - 14 * 86400000);
            while (true) {
                d = new Date(d.getTime() + 14 * 86400000);
                if (d.getFullYear() > year || (d.getFullYear() === year && d.getMonth() > month)) break;
                if (d.getFullYear() === year && d.getMonth() === month) days.push(d.getDate());
            }
            return days;
        }
        if (freq === 'weekly') {
            const target = sched.weekDay ?? 5; // Friday default
            const days   = [];
            for (let day = 1; day <= max; day++) {
                if (new Date(year, month, day).getDay() === target) days.push(day);
            }
            return days;
        }
        return [];
    }

    // ── EVENT TYPES & COLORS ─────────────────────

    const COLORS = {
        income:               { bg: 'rgba(107,191,142,0.14)', fg: '#5aad78', border: 'rgba(107,191,142,0.35)' },
        subscription:         { bg: 'rgba(217,119,87,0.12)',  fg: '#d97757', border: 'rgba(217,119,87,0.35)'  },
        'subscription-annual':{ bg: 'rgba(201,162,39,0.13)',  fg: '#c9a227', border: 'rgba(201,162,39,0.38)'  },
        'credit-card':        { bg: 'rgba(107,159,217,0.12)', fg: '#6b9fd9', border: 'rgba(107,159,217,0.35)' },
        'loan-car':           { bg: 'rgba(217,107,107,0.12)', fg: '#d96b6b', border: 'rgba(217,107,107,0.35)' },
        'loan-mortgage':      { bg: 'rgba(196,127,58,0.12)',  fg: '#c47f3a', border: 'rgba(196,127,58,0.35)'  },
        savings:              { bg: 'rgba(168,127,202,0.12)', fg: '#a87fca', border: 'rgba(168,127,202,0.35)' },
        debt:                 { bg: 'rgba(180,100,120,0.12)', fg: '#b46478', border: 'rgba(180,100,120,0.35)' },
        'budget-bill':        { bg: 'rgba(90,168,160,0.12)',  fg: '#5aa8a0', border: 'rgba(90,168,160,0.35)'  },
    };

    const FILTER_LABELS = {
        income:               'Income',
        subscription:         'Monthly Subs',
        'subscription-annual':'Annual Subs',
        'credit-card':        'Credit Cards',
        'loan-car':           'Car Loans',
        'loan-mortgage':      'Mortgage',
        savings:              'Savings',
        debt:                 'Other Debts',
        'budget-bill':        'Budget Items',
    };

    // ── EVENT COLLECTION ─────────────────────────

    function getEventsForDay(year, month, day) {
        const events = [];
        const cal    = getCalData();
        const hidden = new Set(cal.hiddenTypes || []);
        const budget = Data.get('budget') || {};

        // ── Paychecks (from Paycheck page) ──────────────────────────────────────
        if (!hidden.has('income')) {
            for (const pc of getPaychecks()) {
                if (getPayDays(pc, year, month).includes(day)) {
                    events.push({
                        type:   'income',
                        name:   pc.name || 'Paycheck',
                        amount: pc.grossPaycheck,
                        sign:   '+',
                        note:   pc.payFrequency
                    });
                }
            }
        }

        // ── Monthly subscriptions ────────────────────────────────────────────────
        if (!hidden.has('subscription')) {
            for (const sub of (budget.subscriptions || [])) {
                if (sub.frequency === 'monthly' && sub.dueDay === day) {
                    events.push({
                        type:   'subscription',
                        name:   sub.name,
                        amount: sub.amount,
                        sign:   '-',
                        note:   'monthly'
                    });
                }
            }
        }

        // ── Annual subscriptions ─────────────────────────────────────────────────
        if (!hidden.has('subscription-annual')) {
            for (const sub of (budget.subscriptions || [])) {
                if (sub.frequency === 'annual' && sub.dueDate) {
                    const parsed = new Date(`${sub.dueDate} ${year}`);
                    if (!isNaN(parsed) && parsed.getMonth() === month && parsed.getDate() === day) {
                        events.push({
                            type:   'subscription-annual',
                            name:   sub.name,
                            amount: sub.amount,
                            sign:   '-',
                            note:   'annual renewal'
                        });
                    }
                }
                if (sub.frequency === 'semiannual' && sub.dueDate) {
                    const first = new Date(`${sub.dueDate} ${year}`);
                    if (!isNaN(first)) {
                        const second = new Date(first);
                        second.setMonth(second.getMonth() + 6);
                        const matchFirst  = first.getMonth()  === month && first.getDate()  === day;
                        const matchSecond = second.getMonth() === month && second.getDate() === day;
                        if (matchFirst || matchSecond) {
                            events.push({
                                type:   'subscription-annual',
                                name:   sub.name,
                                amount: sub.amount,
                                sign:   '-',
                                note:   'semi-annual'
                            });
                        }
                    }
                }
            }
        }

        // ── Credit cards (statement close day) ──────────────────────────────────
        if (!hidden.has('credit-card')) {
            for (const card of (Data.get('creditCards') || [])) {
                if (card.statementDay === day) {
                    events.push({
                        type:   'credit-card',
                        name:   card.name,
                        amount: card.minPayment || 0,
                        sign:   '-',
                        note:   'statement closes · min ' + fmt(card.minPayment || 0)
                    });
                }
            }
        }

        // ── Car loans (only active loans with a balance) ─────────────────────────
        if (!hidden.has('loan-car')) {
            for (const loan of (Data.get('carLoan') || [])) {
                if ((loan.currentBalance || 0) <= 0) continue;
                const payDay = (cal.billDays || {})[loan.id] || 1;
                if (payDay === day) {
                    const pmt = loan.monthlyPayment || calcPmt(loan.currentBalance, loan.interestRate, loan.termMonths);
                    events.push({
                        type:   'loan-car',
                        name:   loan.vehicleName || loan.lender || 'Car Loan',
                        amount: pmt,
                        sign:   '-',
                        note:   'car payment'
                    });
                }
            }
        }

        // ── Mortgages (only active with a balance) ───────────────────────────────
        if (!hidden.has('loan-mortgage')) {
            for (const m of (Data.get('mortgage') || [])) {
                if ((m.currentBalance || 0) <= 0) continue;
                const payDay = (cal.billDays || {})[m.id] || 1;
                if (payDay === day) {
                    const pmt = (m.monthlyPayment || calcPmt(m.currentBalance, m.interestRate, m.termMonths))
                        + (m.monthlyEscrow || 0)
                        + (m.monthlyPMI    || 0);
                    events.push({
                        type:   'loan-mortgage',
                        name:   m.lender || m.propertyAddress || 'Mortgage',
                        amount: pmt,
                        sign:   '-',
                        note:   'mortgage payment'
                    });
                }
            }
        }

        // ── Savings goals ────────────────────────────────────────────────────────
        if (!hidden.has('savings')) {
            for (const goal of (Data.get('savingsGoals') || [])) {
                if (!(goal.monthlyContribution > 0)) continue;
                const sched = (cal.savingsSchedule || {})[goal.id];
                const mode  = sched?.mode || 'day';

                let fire = false;
                let amount = goal.monthlyContribution;

                if (mode === 'biweekly') {
                    const days = getBiweeklyDays(sched?.refDate, year, month);
                    fire   = days.includes(day);
                    amount = +(goal.monthlyContribution * 12 / 26).toFixed(2);
                } else if (mode === 'semimonthly') {
                    const d1 = sched?.day1 ?? 1;
                    const d2 = sched?.day2 ?? 15;
                    fire   = (day === d1 || day === d2);
                    amount = +(goal.monthlyContribution / 2).toFixed(2);
                } else {
                    const payDay = sched?.day ?? (cal.billDays || {})[goal.id] ?? 1;
                    fire = (day === payDay);
                }

                if (fire) {
                    events.push({
                        type:   'savings',
                        name:   goal.name,
                        amount,
                        sign:   '-',
                        note:   'savings contribution'
                    });
                }
            }
        }

        // ── Custom debts (debt planner) ──────────────────────────────────────────
        if (!hidden.has('debt')) {
            for (const debt of (Data.get('debtPlanner')?.customDebts || [])) {
                const payDay = (cal.billDays || {})[debt.id] || 1;
                if (payDay === day) {
                    events.push({
                        type:   'debt',
                        name:   debt.name,
                        amount: debt.minimumPayment || 0,
                        sign:   '-',
                        note:   'debt payment'
                    });
                }
            }
        }

        // ── Budget categories with a due day set ─────────────────────────────────
        if (!hidden.has('budget-bill')) {
            for (const cat of (budget.categories || [])) {
                if (cat.frequency !== 'monthly') continue;
                if (!(cat.amount > 0)) continue;
                if (!cat.dueDay || cat.dueDay !== day) continue;
                events.push({
                    type:   'budget-bill',
                    name:   cat.name,
                    amount: cat.amount,
                    sign:   '-',
                    note:   'monthly bill'
                });
            }
        }

        return events;
    }

    function buildMonthMap(year, month) {
        const map = {};
        const max = daysInMonth(year, month);
        for (let d = 1; d <= max; d++) {
            const evts = getEventsForDay(year, month, d);
            if (evts.length) map[d] = evts;
        }
        return map;
    }

    // ── RENDER ───────────────────────────────────

    function render() {
        const map = buildMonthMap(viewYear, viewMonth);
        document.getElementById('page-calendar').innerHTML = buildPage(map);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── PAGE ─────────────────────────────────────

    function buildPage(map) {
        return `
        <div class="page-header">
            <h2>Financial Calendar</h2>
            <p>Every paycheck, bill, and payment across the month — all in one view</p>
        </div>
        ${buildSettings()}
        ${buildNav()}
        ${buildFilters()}
        <div style="display:grid; grid-template-columns:1fr 290px; gap:16px; align-items:start;">
            ${buildGrid(map)}
            ${buildSidebar(map)}
        </div>`;
    }

    // ── FILTER BAR ───────────────────────────────

    function buildFilters() {
        const cal    = getCalData();
        const hidden = new Set(cal.hiddenTypes || []);

        const chips = Object.entries(FILTER_LABELS).map(([type, label]) => {
            const c        = COLORS[type];
            const isHidden = hidden.has(type);
            return `<button onclick="Cal.toggleType('${type}')"
                style="display:inline-flex; align-items:center; gap:5px;
                       padding:4px 11px 4px 8px; border-radius:20px; cursor:pointer;
                       border:1px solid ${isHidden ? 'var(--border)' : c.border};
                       background:${isHidden ? 'transparent' : c.bg};
                       font-size:0.72rem; font-family:inherit;
                       color:${isHidden ? 'var(--text-faint)' : c.fg};
                       transition:all 0.15s; white-space:nowrap;">
                <div style="width:7px; height:7px; border-radius:50%; flex-shrink:0;
                            background:${isHidden ? 'var(--border)' : c.fg};"></div>
                ${label}
            </button>`;
        }).join('');

        return `
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;">
            ${chips}
        </div>`;
    }

    // Toggle a type's visibility and re-render.
    function toggleType(type) {
        const cal = getCalData();
        if (!cal.hiddenTypes) cal.hiddenTypes = [];
        const idx = cal.hiddenTypes.indexOf(type);
        if (idx >= 0) cal.hiddenTypes.splice(idx, 1);
        else cal.hiddenTypes.push(type);
        setCalData(cal);
        render();
    }

    // ── PAY SCHEDULE SETTINGS ────────────────────

    function buildSettings() {
        const cal       = getCalData();
        const paychecks = getPaychecks();
        const loans     = (Data.get('carLoan')  || []).filter(l => (l.currentBalance || 0) > 0);
        const mortgs    = (Data.get('mortgage') || []).filter(m => (m.currentBalance || 0) > 0);
        const goals     = (Data.get('savingsGoals') || []).filter(g => g.monthlyContribution > 0);
        const debts     = Data.get('debtPlanner')?.customDebts || [];

        // ── Paycheck schedule rows ────────────────
        const pcRows = paychecks.map(pc => {
            const sc   = (cal.incomeSchedules || {})[pc.id] || {};
            const freq = pc.payFrequency;
            let inp    = '';

            if (freq === 'monthly') {
                inp = `<input type="number" min="1" max="31" class="inline-edit" style="width:80px;"
                              id="cs-${pc.id}-day" value="${sc.day || ''}" placeholder="1–31">
                       <span style="font-size:0.72rem; color:var(--text-faint); margin-left:4px;">day of month</span>`;
            } else if (freq === 'semimonthly') {
                inp = `<input type="number" min="1" max="31" class="inline-edit" style="width:70px;"
                              id="cs-${pc.id}-day1" value="${sc.day1 ?? 1}" placeholder="1st">
                       <span style="color:var(--text-faint); padding:0 5px;">&amp;</span>
                       <input type="number" min="1" max="31" class="inline-edit" style="width:70px;"
                              id="cs-${pc.id}-day2" value="${sc.day2 ?? 15}" placeholder="2nd">
                       <span style="font-size:0.72rem; color:var(--text-faint); margin-left:4px;">days of month</span>`;
            } else if (freq === 'biweekly') {
                inp = `<input type="date" class="inline-edit" style="width:160px;"
                              id="cs-${pc.id}-ref" value="${sc.refDate || ''}">
                       <span style="font-size:0.72rem; color:var(--text-faint); margin-left:6px;">most recent pay date</span>`;
            } else if (freq === 'weekly') {
                const opts = DOW.map((d, i) =>
                    `<option value="${i}" ${(sc.weekDay ?? 5) === i ? 'selected' : ''}>${d}</option>`
                ).join('');
                inp = `<select class="inline-select" id="cs-${pc.id}-wd">${opts}</select>`;
            }

            return `<div style="display:flex; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border);">
                <span style="font-size:0.83rem; color:var(--text-muted); min-width:150px;">${pc.name || 'Paycheck'}</span>
                <span style="font-size:0.7rem; color:var(--text-faint); min-width:82px; font-family:var(--font-mono);">${freq}</span>
                <div style="display:flex; align-items:center; gap:4px;">${inp}</div>
            </div>`;
        }).join('');

        // ── Bill due-day rows ─────────────────────
        const billItems = [
            ...loans.map(l  => ({ id: l.id, name: l.vehicleName || l.lender || 'Car Loan', cat: 'car payment', isSavings: false })),
            ...mortgs.map(m => ({ id: m.id, name: m.lender || 'Mortgage',                  cat: 'mortgage',    isSavings: false })),
            ...debts.map(d  => ({ id: d.id, name: d.name,                                   cat: 'debt',        isSavings: false })),
            ...goals.map(g  => ({ id: g.id, name: g.name,                                   cat: 'savings',     isSavings: true  })),
        ];

        const billRows = billItems.map(item => {
            let inputs;
            if (item.isSavings) {
                const sched = (cal.savingsSchedule || {})[item.id] || {};
                const mode  = sched.mode || 'day';
                const day   = sched.day  ?? (cal.billDays || {})[item.id] ?? 1;
                const ref   = sched.refDate || '';
                const d1    = sched.day1 ?? 1;
                const d2    = sched.day2 ?? 15;

                inputs = `
                    <select class="inline-select" id="ctype-${item.id}"
                            onchange="Cal.onSavingsModeChange('${item.id}')">
                        <option value="day"         ${mode === 'day'         ? 'selected' : ''}>1 day / month</option>
                        <option value="biweekly"    ${mode === 'biweekly'    ? 'selected' : ''}>Bi-weekly · 26×/yr</option>
                        <option value="semimonthly" ${mode === 'semimonthly' ? 'selected' : ''}>Semi-monthly · 24×/yr</option>
                    </select>
                    <span id="cswrap-day-${item.id}"
                          style="display:${mode === 'day' ? 'inline-flex' : 'none'}; align-items:center; gap:4px;">
                        <input type="number" min="1" max="31" class="inline-edit" style="width:60px;"
                               id="csday-${item.id}" value="${day}" placeholder="1–31">
                        <span style="font-size:0.72rem; color:var(--text-faint);">of month</span>
                    </span>
                    <span id="cswrap-bi-${item.id}"
                          style="display:${mode === 'biweekly' ? 'inline-flex' : 'none'}; align-items:center; gap:6px;">
                        <span style="font-size:0.72rem; color:var(--text-faint);">ref date</span>
                        <input type="date" class="inline-edit" style="width:148px;"
                               id="csref-${item.id}" value="${ref}">
                    </span>
                    <span id="cswrap-semi-${item.id}"
                          style="display:${mode === 'semimonthly' ? 'inline-flex' : 'none'}; align-items:center; gap:4px;">
                        <input type="number" min="1" max="31" class="inline-edit" style="width:52px;"
                               id="csday1-${item.id}" value="${d1}" placeholder="1">
                        <span style="font-size:0.72rem; color:var(--text-faint);">&amp;</span>
                        <input type="number" min="1" max="31" class="inline-edit" style="width:52px;"
                               id="csday2-${item.id}" value="${d2}" placeholder="15">
                        <span style="font-size:0.72rem; color:var(--text-faint);">of month</span>
                    </span>`;
            } else {
                const day = (cal.billDays || {})[item.id] ?? 1;
                inputs = `
                    <input type="number" min="1" max="31" class="inline-edit" style="width:72px;"
                           id="cb-${item.id}" value="${day}" placeholder="1–31">
                    <span style="font-size:0.72rem; color:var(--text-faint);">day of month</span>`;
            }

            return `<div style="display:flex; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border);">
                <span style="font-size:0.83rem; color:var(--text-muted); min-width:190px;">${item.name}</span>
                <span style="font-size:0.7rem; color:var(--text-faint); min-width:70px; font-family:var(--font-mono);">${item.cat}</span>
                ${inputs}
            </div>`;
        }).join('');

        if (!paychecks.length && !billItems.length) {
            return `<div class="card" style="margin-bottom:16px; padding:14px 18px; font-size:0.84rem; color:var(--text-muted);">
                Add paychecks on the <strong>Paycheck</strong> page and loans/subscriptions on their pages to populate the calendar.
            </div>`;
        }

        return `
        <div class="card" style="margin-bottom:16px; padding:10px 18px;">
            <div class="section-header" style="cursor:pointer; margin:0;" onclick="Cal.toggleSettings()">
                <span style="font-size:0.78rem; font-weight:600; color:var(--text-muted);">Pay Schedule &amp; Due Dates</span>
                <span id="cal-cfg-arrow" style="font-size:0.72rem; color:var(--text-faint);">▼ configure</span>
            </div>
            <div id="cal-cfg-body" style="display:none; padding-top:14px; margin-top:10px; border-top:1px solid var(--border);">
                ${paychecks.length ? `
                <div style="font-size:0.65rem; font-family:var(--font-mono); text-transform:uppercase;
                            letter-spacing:0.08em; color:var(--text-faint); margin-bottom:6px;">Paychecks — Pay Days</div>
                ${pcRows}` : ''}
                ${billItems.length ? `
                <div style="font-size:0.65rem; font-family:var(--font-mono); text-transform:uppercase;
                            letter-spacing:0.08em; color:var(--text-faint); margin:14px 0 6px;">Bills &amp; Contributions — Due Day</div>
                ${billRows}` : ''}
                <button class="btn btn-primary" style="margin-top:14px;" onclick="Cal.saveSchedule()">Save Schedule</button>
            </div>
        </div>`;
    }

    // ── MONTH NAVIGATION ─────────────────────────

    function buildNav() {
        const today = new Date();
        const isCur = viewYear === today.getFullYear() && viewMonth === today.getMonth();
        return `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
            <div style="display:flex; align-items:center; gap:10px;">
                <button class="btn btn-ghost" style="padding:6px 14px; font-size:1rem; line-height:1;" onclick="Cal.prevMonth()">‹</button>
                <span style="font-size:1.05rem; font-weight:600; min-width:168px; text-align:center;">${MONTHS[viewMonth]} ${viewYear}</span>
                <button class="btn btn-ghost" style="padding:6px 14px; font-size:1rem; line-height:1;" onclick="Cal.nextMonth()">›</button>
            </div>
            ${!isCur ? `<button class="btn btn-ghost" style="font-size:0.8rem;" onclick="Cal.goToToday()">Today</button>` : ''}
        </div>`;
    }

    // ── CALENDAR GRID ────────────────────────────

    function buildGrid(map) {
        const today    = new Date();
        const firstDow = new Date(viewYear, viewMonth, 1).getDay();
        const total    = daysInMonth(viewYear, viewMonth);
        const cells    = Math.ceil((firstDow + total) / 7) * 7;

        const hdr = DOW.map(d => `
            <div style="text-align:center; font-size:0.65rem; font-family:var(--font-mono);
                        text-transform:uppercase; letter-spacing:0.08em; color:var(--text-faint); padding:6px 0;">${d}</div>
        `).join('');

        const grid = [];
        for (let i = 0; i < cells; i++) {
            const day = i - firstDow + 1;
            if (day < 1 || day > total) {
                grid.push(`<div style="min-height:92px; border-radius:6px; background:var(--surface); opacity:0.2;"></div>`);
                continue;
            }

            const isToday = viewYear === today.getFullYear()
                && viewMonth === today.getMonth()
                && day === today.getDate();
            const evts    = map[day] || [];
            const MAX     = 3;
            const shown   = evts.slice(0, MAX);
            const extra   = evts.length - MAX;

            const chips = shown.map(e => {
                const c = COLORS[e.type] || COLORS.subscription;
                return `<div style="font-size:0.62rem; line-height:1.5; white-space:nowrap; overflow:hidden;
                                    text-overflow:ellipsis; margin-bottom:2px; padding:1px 5px; border-radius:3px;
                                    background:${c.bg}; color:${c.fg}; border:1px solid ${c.border};">
                            ${e.sign}${fmtShort(e.amount)}&thinsp;${e.name}
                        </div>`;
            }).join('');

            const moreChip = extra > 0
                ? `<div style="font-size:0.6rem; color:var(--text-faint); padding-left:4px;">+${extra} more</div>` : '';

            grid.push(`
            <div onclick="${evts.length ? `Cal.openDay(${day})` : ''}"
                 style="min-height:92px; padding:6px; border-radius:6px;
                        background:${isToday ? 'rgba(217,119,87,0.08)' : 'var(--surface2)'};
                        border:1px solid ${isToday ? 'var(--accent)' : 'var(--border)'};
                        cursor:${evts.length ? 'pointer' : 'default'}; transition:background 0.1s;"
                 onmouseover="if(${evts.length ? 1 : 0})this.style.background='var(--surface3,rgba(255,255,255,0.04))'"
                 onmouseout="this.style.background='${isToday ? 'rgba(217,119,87,0.08)' : 'var(--surface2)'}'">
                <div style="font-size:0.78rem; font-weight:${isToday ? 700 : 500};
                            color:${isToday ? 'var(--accent)' : 'var(--text-muted)'}; margin-bottom:4px;">${day}</div>
                ${chips}${moreChip}
            </div>`);
        }

        return `
        <div class="card" style="padding:14px;">
            <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:3px; margin-bottom:3px;">${hdr}</div>
            <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:3px;">${grid.join('')}</div>
        </div>`;
    }

    // ── SIDEBAR ──────────────────────────────────

    function buildSidebar(map) {
        const all = [];
        for (const [d, evts] of Object.entries(map)) {
            for (const e of evts) all.push({ day: parseInt(d), ...e });
        }
        all.sort((a, b) => a.day - b.day);

        const today    = new Date();
        const todayDay = (viewYear === today.getFullYear() && viewMonth === today.getMonth())
            ? today.getDate() : 0;

        const totalIn  = all.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
        const totalOut = all.filter(e => e.type !== 'income').reduce((s, e) => s + e.amount, 0);
        const net      = totalIn - totalOut;
        const netColor = net >= 0 ? 'var(--green)' : 'var(--red)';

        const rows = all.map(e => {
            const c    = COLORS[e.type] || COLORS.subscription;
            const past = todayDay > 0 && e.day < todayDay;
            return `
            <div style="display:flex; justify-content:space-between; align-items:center;
                        padding:7px 0; border-bottom:1px solid var(--border); opacity:${past ? 0.45 : 1};">
                <div style="display:flex; align-items:center; gap:8px; min-width:0; overflow:hidden;">
                    <span style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-faint);
                                 min-width:18px; flex-shrink:0;">${e.day}</span>
                    <div style="width:6px; height:6px; border-radius:50%; background:${c.fg}; flex-shrink:0;"></div>
                    <span style="font-size:0.8rem; color:var(--text-muted); overflow:hidden;
                                 white-space:nowrap; text-overflow:ellipsis;">${e.name}</span>
                </div>
                <span style="font-family:var(--font-mono); font-size:0.8rem; color:${c.fg};
                             flex-shrink:0; margin-left:10px;">${e.sign}${fmtShort(e.amount)}</span>
            </div>`;
        }).join('');

        const empty = `<div style="text-align:center; padding:28px 0; color:var(--text-muted); font-size:0.82rem; line-height:1.6;">
            No events this month.<br>
            <span style="font-size:0.75rem; color:var(--text-faint);">Configure pay schedule above,<br>or add paychecks on the Paycheck page.</span>
        </div>`;

        return `
        <div>
            <div class="card" style="margin-bottom:12px; padding:14px 16px;">
                <div style="font-size:0.63rem; font-family:var(--font-mono); text-transform:uppercase;
                            letter-spacing:0.08em; color:var(--text-faint); margin-bottom:10px;">${MONTHS[viewMonth]} ${viewYear}</div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span style="font-size:0.82rem; color:var(--text-muted);">Income</span>
                    <span style="font-family:var(--font-mono); font-size:0.85rem; color:var(--green);">+${fmt(totalIn)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--border);">
                    <span style="font-size:0.82rem; color:var(--text-muted);">Bills &amp; Payments</span>
                    <span style="font-family:var(--font-mono); font-size:0.85rem; color:var(--red);">-${fmt(totalOut)}</span>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span style="font-size:0.83rem; font-weight:600;">Net Cash Flow</span>
                    <span style="font-family:var(--font-mono); font-size:0.9rem; font-weight:600; color:${netColor};">
                        ${net >= 0 ? '+' : ''}${fmt(net)}
                    </span>
                </div>
            </div>

            <div class="card" style="padding:14px 16px; max-height:480px; overflow-y:auto;">
                <div style="font-size:0.63rem; font-family:var(--font-mono); text-transform:uppercase;
                            letter-spacing:0.08em; color:var(--text-faint); margin-bottom:6px;">All Events</div>
                ${all.length ? rows : empty}
            </div>
        </div>`;
    }

    // ── DAY DETAIL MODAL ─────────────────────────

    function openDay(day) {
        const evts = getEventsForDay(viewYear, viewMonth, day);
        if (!evts.length) return;

        const existing = document.getElementById('cal-day-modal');
        if (existing) existing.remove();

        const dateStr = new Date(viewYear, viewMonth, day).toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        const totalIn  = evts.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
        const totalOut = evts.filter(e => e.type !== 'income').reduce((s, e) => s + e.amount, 0);
        const net      = totalIn - totalOut;
        const hasNet   = totalIn > 0 && totalOut > 0;

        const rows = evts.map(e => {
            const c = COLORS[e.type] || COLORS.subscription;
            return `
            <div style="display:flex; justify-content:space-between; align-items:center;
                        padding:11px 0; border-bottom:1px solid var(--border);">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:8px; height:8px; border-radius:50%; background:${c.fg}; flex-shrink:0;"></div>
                    <div>
                        <div style="font-size:0.86rem; color:var(--text);">${e.name}</div>
                        ${e.note ? `<div style="font-size:0.72rem; color:var(--text-faint);">${e.note}</div>` : ''}
                    </div>
                </div>
                <span style="font-family:var(--font-mono); font-size:0.92rem; font-weight:500;
                             color:${c.fg}; flex-shrink:0; margin-left:16px;">${e.sign}${fmt(e.amount)}</span>
            </div>`;
        }).join('');

        const overlay = document.createElement('div');
        overlay.id = 'cal-day-modal';
        overlay.className = 'modal-overlay open';
        overlay.innerHTML = `
        <div class="modal" style="width:420px; max-width:96vw;">
            <div class="modal-header">
                <span class="modal-title" style="font-size:0.88rem; font-weight:500;">${dateStr}</span>
                <button class="modal-close" onclick="Cal.closeDay()">✕</button>
            </div>
            ${rows}
            ${hasNet ? `
            <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px; margin-top:6px;">
                <span style="font-size:0.83rem; font-weight:600;">Net</span>
                <span style="font-family:var(--font-mono); font-size:0.95rem; font-weight:600;
                             color:${net >= 0 ? 'var(--green)' : 'var(--red)'};">
                    ${net >= 0 ? '+' : ''}${fmt(net)}
                </span>
            </div>` : ''}
            <div style="display:flex; justify-content:flex-end; margin-top:18px;">
                <button class="btn btn-ghost" onclick="Cal.closeDay()">Close</button>
            </div>
        </div>`;

        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) Cal.closeDay(); });
    }

    function closeDay() {
        const m = document.getElementById('cal-day-modal');
        if (m) m.remove();
    }

    // ── NAVIGATION ───────────────────────────────

    function prevMonth() {
        if (viewMonth === 0) { viewYear--; viewMonth = 11; } else viewMonth--;
        render();
    }

    function nextMonth() {
        if (viewMonth === 11) { viewYear++; viewMonth = 0; } else viewMonth++;
        render();
    }

    function goToToday() {
        const n  = new Date();
        viewYear  = n.getFullYear();
        viewMonth = n.getMonth();
        render();
    }

    function toggleSettings() {
        const body  = document.getElementById('cal-cfg-body');
        const arrow = document.getElementById('cal-cfg-arrow');
        if (!body) return;
        const open = body.style.display === 'none' || !body.style.display;
        body.style.display = open ? 'block' : 'none';
        if (arrow) arrow.textContent = open ? '▲ hide' : '▼ configure';
    }

    // ── SAVE SCHEDULE ────────────────────────────

    function saveSchedule() {
        const cal = getCalData();
        if (!cal.incomeSchedules) cal.incomeSchedules = {};
        if (!cal.billDays)        cal.billDays        = {};

        // Save paycheck pay-day settings
        for (const pc of getPaychecks()) {
            const sched = cal.incomeSchedules[pc.id] || {};
            const freq  = pc.payFrequency;

            if (freq === 'monthly') {
                const v = parseInt(document.getElementById(`cs-${pc.id}-day`)?.value);
                if (v >= 1 && v <= 31) sched.day = v;
            } else if (freq === 'semimonthly') {
                const v1 = parseInt(document.getElementById(`cs-${pc.id}-day1`)?.value);
                const v2 = parseInt(document.getElementById(`cs-${pc.id}-day2`)?.value);
                if (v1 >= 1 && v1 <= 31) sched.day1 = v1;
                if (v2 >= 1 && v2 <= 31) sched.day2 = v2;
            } else if (freq === 'biweekly') {
                const v = document.getElementById(`cs-${pc.id}-ref`)?.value;
                if (v) sched.refDate = v;
            } else if (freq === 'weekly') {
                const v = parseInt(document.getElementById(`cs-${pc.id}-wd`)?.value);
                if (!isNaN(v)) sched.weekDay = v;
            }
            cal.incomeSchedules[pc.id] = sched;
        }

        // Save bill due-day settings
        const billSources = [
            ...(Data.get('carLoan')  || []).filter(l => (l.currentBalance || 0) > 0),
            ...(Data.get('mortgage') || []).filter(m => (m.currentBalance || 0) > 0),
            ...(Data.get('debtPlanner')?.customDebts || []),
            ...(Data.get('savingsGoals') || []).filter(g => g.monthlyContribution > 0),
        ];
        if (!cal.savingsSchedule) cal.savingsSchedule = {};
        for (const item of billSources) {
            const ctypeEl = document.getElementById(`ctype-${item.id}`);
            if (ctypeEl) {
                // Savings goal — three-mode select
                const mode = ctypeEl.value;
                const entry = { mode };
                if (mode === 'day') {
                    const v = parseInt(document.getElementById(`csday-${item.id}`)?.value);
                    entry.day = (v >= 1 && v <= 31) ? v : 1;
                } else if (mode === 'biweekly') {
                    entry.refDate = document.getElementById(`csref-${item.id}`)?.value || '';
                } else if (mode === 'semimonthly') {
                    const v1 = parseInt(document.getElementById(`csday1-${item.id}`)?.value);
                    const v2 = parseInt(document.getElementById(`csday2-${item.id}`)?.value);
                    entry.day1 = (v1 >= 1 && v1 <= 31) ? v1 : 1;
                    entry.day2 = (v2 >= 1 && v2 <= 31) ? v2 : 15;
                }
                cal.savingsSchedule[item.id] = entry;
            } else {
                // Loan / mortgage / debt — day-only
                const v = parseInt(document.getElementById(`cb-${item.id}`)?.value);
                if (v >= 1 && v <= 31) cal.billDays[item.id] = v;
            }
        }

        setCalData(cal);
        render();
        Toast.show('Schedule saved ✓');
    }

    function onSavingsModeChange(id) {
        const mode = document.getElementById(`ctype-${id}`)?.value;
        if (!mode) return;
        document.getElementById(`cswrap-day-${id}`)?.style  && (document.getElementById(`cswrap-day-${id}`).style.display  = mode === 'day'         ? 'inline-flex' : 'none');
        document.getElementById(`cswrap-bi-${id}`)?.style   && (document.getElementById(`cswrap-bi-${id}`).style.display   = mode === 'biweekly'    ? 'inline-flex' : 'none');
        document.getElementById(`cswrap-semi-${id}`)?.style && (document.getElementById(`cswrap-semi-${id}`).style.display = mode === 'semimonthly' ? 'inline-flex' : 'none');
    }

    // ── PUBLIC API ───────────────────────────────

    return { render, prevMonth, nextMonth, goToToday, openDay, closeDay, toggleSettings, saveSchedule, toggleType, onSavingsModeChange };

})();
