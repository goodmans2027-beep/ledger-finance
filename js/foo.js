const FOO = (() => {

    // 2025 IRS contribution limits
    const LIMITS = { rothIRA: 7000, k401: 23500 };

    // ── STEP DEFINITIONS ─────────────────────────────────────

    const STEPS = [
        {
            id: 1,
            title: 'Cover Your Deductibles',
            sub: 'Keep enough cash to cover your highest insurance deductible',
            guidance: 'Before anything else, make sure a surprise bill won\'t derail your finances. Find your highest deductible across health, auto, and home/renters insurance. Keep at least that amount in a liquid checking or savings account at all times. This cash buffer is your financial foundation — without it, one emergency wipes out months of progress.',
        },
        {
            id: 2,
            title: 'Capture the Employer Match',
            sub: 'Contribute enough to your 401(k) to collect every employer match dollar',
            guidance: 'An employer match is an immediate 50–100% return on your contribution — no investment in the market can beat that. If your employer matches up to 4% of your salary, contribute at least 4%. Doing anything else before capturing the full match means leaving guaranteed compensation on the table.',
        },
        {
            id: 3,
            title: 'Eliminate High-Interest Debt',
            sub: 'Pay off all debt above the threshold rate',
            guidance: 'High-interest debt creates a guaranteed negative return that most investments can\'t overcome. Attack it with the avalanche method (highest rate first) or snowball (smallest balance first for motivation). Credit cards, personal loans, and payday loans typically qualify. Your mortgage and low-rate student loans may not — those are addressed in Step 9.',
        },
        {
            id: 4,
            title: 'Build Emergency Reserves',
            sub: '3–6 months of living expenses in a high-yield savings account',
            guidance: 'Your emergency fund is insurance against life\'s surprises — job loss, medical bills, car repairs. Keep it accessible but separate from daily spending. A high-yield savings account earns meaningful interest while staying liquid. 3 months is the minimum; 6 months is better for variable income or if you have dependents. Don\'t invest this money — liquidity matters more than returns here.',
        },
        {
            id: 5,
            title: 'Maximize Your Roth IRA',
            sub: `Contribute up to $${LIMITS.rothIRA.toLocaleString()} per year (2025 limit)`,
            guidance: 'A Roth IRA offers tax-free growth and tax-free withdrawals in retirement — arguably the most powerful account available. The annual limit is $7,000 ($8,000 if age 50+). If your income is too high for a direct contribution, research the backdoor Roth strategy. Prioritize this over filling your 401(k) beyond the match: Roth IRAs have more investment options, no Required Minimum Distributions, and contributions can be withdrawn penalty-free.',
        },
        {
            id: 6,
            title: 'Max Your Employer Plan',
            sub: `Contribute up to $${LIMITS.k401.toLocaleString()} to your 401(k) or 403(b) (2025 limit)`,
            guidance: 'Now go back and fill your workplace retirement plan to the annual maximum. Pre-tax contributions reduce your taxable income dollar-for-dollar today. At $23,500/year in a tax-deferred account, compounding does heavy lifting over decades. If your plan offers a Roth 401(k) option, consider splitting between traditional and Roth based on your current vs. expected future tax bracket.',
        },
        {
            id: 7,
            title: 'Hyper-Accumulation',
            sub: 'Invest 25%+ of your gross income across all accounts',
            guidance: 'Once tax-advantaged accounts are maxed, direct additional savings into taxable brokerage accounts. The goal is a total savings rate of 25% or more of your gross income — combining 401(k), Roth, and taxable contributions. Income growth should go here, not into lifestyle inflation. Consistent high savings rates are the most reliable driver of early financial freedom.',
        },
        {
            id: 8,
            title: 'Prepay Future Expenses',
            sub: 'Fund 529 plans, vehicle replacement, and other known upcoming costs',
            guidance: 'Think ahead to large, predictable future expenses: a child\'s college education, a vehicle replacement, a home renovation, a career sabbatical. Fund 529 education savings plans for dependents — contributions grow tax-free for qualified education expenses. Set aside targeted savings for these goals now rather than funding them with debt when they arrive.',
        },
        {
            id: 9,
            title: 'Pay Off Low-Interest Debt',
            sub: 'Eliminate remaining debt and fine-tune your financial legacy',
            guidance: 'The final step covers everything left: prepaying a low-rate mortgage, paying off remaining low-interest loans, or optimizing your estate plan. At this point you\'re in excellent financial shape. Whether to accelerate a 3% mortgage vs. investing in the market is a personal decision based on your risk tolerance and emotional relationship with debt. There\'s no single right answer — you\'ve already won.',
        },
    ];

    // ── DATA ─────────────────────────────────────────────────

    function getSettings() {
        return Object.assign({
            deductibleAmount: 0,
            highInterestThreshold: 6,
            emergencyMonths: 6,
            hyperTarget: 25,
        }, (Data.get('foo') || {}).settings || {});
    }

    function getOverrides() {
        return (Data.get('foo') || {}).overrides || {};
    }

    // ── ACTIONS ──────────────────────────────────────────────

    function setOverride(stepId, status) {
        const d = Data.get('foo') || {};
        const overrides = { ...(d.overrides || {}) };
        if (status === null) {
            delete overrides[stepId];
        } else {
            overrides[stepId] = status;
        }
        Data.set('foo', { ...d, overrides });
        render();
    }

    function saveSettingsForm() {
        const settings = {
            deductibleAmount:      parseFloat(document.getElementById('foo-deductible')?.value)    || 0,
            highInterestThreshold: parseFloat(document.getElementById('foo-threshold')?.value)     || 6,
            emergencyMonths:       parseFloat(document.getElementById('foo-months')?.value)        || 6,
            hyperTarget:           parseFloat(document.getElementById('foo-hyper-target')?.value)  || 25,
        };
        Data.set('foo', { ...(Data.get('foo') || {}), settings });
        render();
        Toast.show('Settings saved');
    }

    function toggleSettings() {
        const p = document.getElementById('foo-settings-panel');
        if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
    }

    function toggleExpand(stepId) {
        const body = document.getElementById('foo-body-' + stepId);
        const chev = document.getElementById('foo-chev-' + stepId);
        if (!body) return;
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        if (chev) chev.style.transform = open ? '' : 'rotate(180deg)';
    }

    // ── HELPERS ──────────────────────────────────────────────

    function fmt(n) {
        return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    function checksPerYear(freq) {
        return { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }[freq] || 26;
    }

    function calcMonthlyExpenses() {
        const b = Data.get('budget');
        if (!b) return 0;
        const toMo = (amt, freq) => {
            const m = { weekly: 52/12, biweekly: 26/12, semimonthly: 2, monthly: 1, annual: 1/12, semiannual: 1/6 };
            return (amt || 0) * (m[freq] || 1);
        };
        let total = 0;
        (b.categories    || []).forEach(c => { total += toMo(c.amount, c.frequency || 'monthly'); });
        (b.subscriptions || []).forEach(s => { total += toMo(s.amount, s.frequency || 'monthly'); });
        return total;
    }

    // ── AUTO-DETECTION ───────────────────────────────────────

    function autoDetect(stepId, settings) {
        switch (stepId) {

            case 1: {
                // Prefer highest deductible from Insurance page; fall back to manual settings value
                const policies = Array.isArray(Data.get('insurance')) ? Data.get('insurance') : [];
                let target = settings.deductibleAmount || 0;
                let targetLabel = 'settings';
                if (policies.length > 0) {
                    const maxD = Math.max(...policies.map(p => p.deductible || 0));
                    if (maxD > 0) {
                        target = maxD;
                        const top = policies.find(p => (p.deductible || 0) === maxD);
                        targetLabel = top?.name || 'Insurance';
                    }
                }
                if (!target) {
                    return { status: 'manual', detail: 'Add insurance policies or enter your deductible in Settings.' };
                }
                const accs   = Data.get('bankAccounts') || [];
                const liquid = accs
                    .filter(a => ['checking', 'savings', 'money-market'].includes(a.type))
                    .reduce((s, a) => s + (a.balance || 0), 0);
                return {
                    status: liquid >= target ? 'complete' : 'in-progress',
                    detail: `Liquid: ${fmt(liquid)} / Highest deductible: ${fmt(target)} (${targetLabel})`,
                };
            }

            case 2: {
                const p = Data.get('paycheck');
                if (!p?.paychecks?.length) {
                    return { status: 'manual', detail: 'Add paycheck data to see retirement contributions.' };
                }
                const has = p.paychecks.some(pc =>
                    (pc.contrib401k || 0) > 0 ||
                    (pc.roth401k    || 0) > 0 ||
                    (pc.pretaxCustom  || []).some(i => /401|403|retirement/i.test(i.name || '')) ||
                    (pc.postTaxCustom || []).some(i => /roth.*40[13]|40[13].*roth/i.test(i.name || ''))
                );
                return {
                    status: 'manual',
                    detail: has
                        ? 'Retirement contributions detected in paycheck — verify you\'re getting the full match.'
                        : 'No 401(k) / Roth 401(k) contributions detected in paycheck.',
                };
            }

            case 3: {
                const customs = Data.get('debtPlanner')?.customDebts || [];
                const cards   = Data.get('creditCards') || [];
                const thr     = settings.highInterestThreshold;

                if (!customs.length && !cards.length) {
                    return { status: 'manual', detail: 'Add debt or credit card data to enable auto-detection.' };
                }
                const hiDebts = customs.filter(d => d.type !== 'mortgage' && (d.rate || 0) > thr);
                const hiCards = cards.filter(c => (c.balance || 0) > 0.01 && (c.apr || 0) > thr);
                const count   = hiDebts.length + hiCards.length;
                if (count === 0) {
                    return { status: 'complete', detail: `No debts above ${thr}% APR — great!` };
                }
                const bal = hiDebts.reduce((s, d) => s + (d.balance || 0), 0)
                          + hiCards.reduce((s, c) => s + (c.balance || 0), 0);
                return {
                    status: 'in-progress',
                    detail: `${count} item${count !== 1 ? 's' : ''} above ${thr}%: ${fmt(bal)} total balance`,
                };
            }

            case 4: {
                const goals = Data.get('savingsGoals') || [];
                const ef    = goals.find(g => /emergency|e.?fund/i.test(g.name || ''));
                if (!ef) {
                    const monthly = calcMonthlyExpenses();
                    const target  = monthly * settings.emergencyMonths;
                    const hint    = target > 0
                        ? ` Estimated target: ${fmt(target)} (${settings.emergencyMonths} mo × ${fmt(monthly)}/mo).`
                        : '';
                    return { status: 'manual', detail: `No emergency fund goal found.${hint} Create a Savings goal with "Emergency" in the name.` };
                }
                const pct = ef.targetAmount > 0
                    ? Math.min(100, Math.round(((ef.currentAmount || 0) / ef.targetAmount) * 100))
                    : 0;
                return {
                    status: pct >= 100 ? 'complete' : 'in-progress',
                    detail: `${ef.name}: ${fmt(ef.currentAmount || 0)} / ${fmt(ef.targetAmount || 0)} (${pct}%)`,
                };
            }

            case 5: {
                const roth = (Data.get('investments')?.holdings || []).filter(h => h.type === 'taxfree');
                if (!roth.length) {
                    return { status: 'manual', detail: 'No Tax-Free (Roth) holdings found in Investments.' };
                }
                const annual = roth.reduce((s, h) => s + (h.monthlyContrib || 0), 0) * 12;
                const pct    = Math.min(100, Math.round((annual / LIMITS.rothIRA) * 100));
                return {
                    status: annual >= LIMITS.rothIRA ? 'complete' : 'in-progress',
                    detail: `Roth contributions: ${fmt(annual)}/yr — Limit: ${fmt(LIMITS.rothIRA)}/yr (${pct}%)`,
                };
            }

            case 6: {
                let annual = 0;
                const p = Data.get('paycheck');
                if (p?.paychecks?.length) {
                    p.paychecks.forEach(pc => {
                        const n = checksPerYear(pc.payFrequency);
                        // Dedicated paycheck fields
                        annual += (pc.contrib401k || 0) * n;
                        annual += (pc.roth401k    || 0) * n;
                        // Custom line items (catches FSA-style manual entries)
                        (pc.pretaxCustom || []).forEach(item => {
                            if (/401|403|sep|simple|retirement/i.test(item.name || '')) {
                                annual += (item.amount || 0) * n;
                            }
                        });
                        (pc.postTaxCustom || []).forEach(item => {
                            if (/roth.*40[13]|40[13].*roth/i.test(item.name || '')) {
                                annual += (item.amount || 0) * n;
                            }
                        });
                    });
                }
                if (annual === 0) {
                    const holdings = Data.get('investments')?.holdings || [];
                    // pretax = traditional 401k/403b; taxfree includes Roth 401k and Roth IRA
                    // use both as a best-effort fallback when no paycheck data is available
                    annual = holdings
                        .filter(h => h.type === 'pretax' || h.type === 'taxfree')
                        .reduce((s, h) => s + (h.monthlyContrib || 0) * 12, 0);
                }
                if (annual === 0) {
                    return { status: 'manual', detail: 'No 401(k) / Roth 401(k) contributions detected.' };
                }
                const pct = Math.min(100, Math.round((annual / LIMITS.k401) * 100));
                return {
                    status: annual >= LIMITS.k401 ? 'complete' : 'in-progress',
                    detail: `Estimated 401(k) + Roth 401(k): ${fmt(annual)}/yr — Max: ${fmt(LIMITS.k401)}/yr (${pct}%)`,
                };
            }

            case 7: {
                const p = Data.get('paycheck');
                if (!p?.paychecks?.length) {
                    return { status: 'manual', detail: 'Add paycheck data to calculate your savings rate.' };
                }
                let gross = 0;
                p.paychecks.forEach(pc => { gross += (pc.grossPaycheck || 0) * checksPerYear(pc.payFrequency); });
                const invested = (Data.get('investments')?.holdings || [])
                    .reduce((s, h) => s + (h.monthlyContrib || 0) * 12, 0);
                if (gross === 0) return { status: 'manual', detail: 'Could not determine gross income from paycheck data.' };
                const rate = (invested / gross) * 100;
                return {
                    status: rate >= settings.hyperTarget ? 'complete' : 'in-progress',
                    detail: `Savings rate: ${rate.toFixed(1)}% of ${fmt(gross)} gross — Target: ${settings.hyperTarget}%`,
                };
            }

            case 8: {
                const goals  = Data.get('savingsGoals') || [];
                const future = goals.filter(g => !/emergency|e.?fund/i.test(g.name || ''));
                if (!future.length) {
                    return { status: 'manual', detail: 'Add savings goals for future expenses to track here.' };
                }
                const names = future.slice(0, 3).map(g => g.name).join(', ');
                return {
                    status: 'in-progress',
                    detail: `${future.length} future goal${future.length !== 1 ? 's' : ''}: ${names}`,
                };
            }

            case 9: {
                const customs = Data.get('debtPlanner')?.customDebts || [];
                const cards   = Data.get('creditCards') || [];
                if (!customs.length && !cards.length) {
                    return { status: 'manual', detail: 'Add debt data to track remaining balances.' };
                }
                const debtBal = customs.filter(d => d.type !== 'mortgage').reduce((s, d) => s + (d.balance || 0), 0);
                const cardBal = cards.reduce((s, c) => s + (c.balance || 0), 0);
                const total   = debtBal + cardBal;
                return {
                    status: total < 0.01 ? 'complete' : 'in-progress',
                    detail: total < 0.01
                        ? 'No remaining non-mortgage debt — excellent!'
                        : `Remaining: ${fmt(total)} (debts: ${fmt(debtBal)}, cards: ${fmt(cardBal)})`,
                };
            }
        }
        return { status: 'manual', detail: '' };
    }

    // ── RENDER ───────────────────────────────────────────────

    function render() {
        const settings  = getSettings();
        const overrides = getOverrides();

        const results = {};
        STEPS.forEach(s => {
            results[s.id] = overrides[s.id]
                ? { status: overrides[s.id], detail: '', override: true }
                : { ...autoDetect(s.id, settings), override: false };
        });

        const doneCount = STEPS.filter(s => results[s.id].status === 'complete').length;
        const progress  = Math.round((doneCount / STEPS.length) * 100);

        let focusId = null;
        for (const s of STEPS) {
            if (!['complete', 'skipped'].includes(results[s.id].status)) { focusId = s.id; break; }
        }

        document.getElementById('page-foo').innerHTML = `
            <div class="page-header" style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px;">
                <div>
                    <h2>Financial Order of Operations</h2>
                    <p>9-step framework for building wealth in the right order · The Money Guy Show</p>
                </div>
                <button class="btn btn-ghost" onclick="FOO.toggleSettings()" style="gap:6px; font-size:0.85rem; white-space:nowrap; margin-top:4px;">
                    <i data-lucide="settings-2" style="width:14px;height:14px;"></i>&nbsp;Settings
                </button>
            </div>

            <div id="foo-settings-panel" class="card" style="display:none; margin-bottom:16px; padding:16px 20px;">
                ${renderSettings(settings)}
            </div>

            <div class="card" style="padding:14px 18px; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-weight:600; font-size:0.9rem;">
                        ${focusId
                            ? `Focus: Step ${focusId} &mdash; ${STEPS.find(s => s.id === focusId).title}`
                            : '&#127881; All 9 steps complete!'}
                    </span>
                    <span style="font-size:0.82rem; color:var(--text-muted);">${doneCount} / ${STEPS.length} complete</span>
                </div>
                <div class="progress-bar-wrap">
                    <div class="progress-bar" style="width:${progress}%; background:var(--green);"></div>
                </div>
            </div>

            <div class="foo-steps">
                ${STEPS.map(s => renderStep(s, results[s.id], s.id === focusId)).join('')}
            </div>
        `;

        if (window.lucide) lucide.createIcons();
    }

    function renderSettings(s) {
        return `
            <div style="font-weight:600; font-size:0.88rem; margin-bottom:14px;">Auto-Detection Settings</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px;">
                <div class="form-group">
                    <label class="form-label">Highest Insurance Deductible ($)</label>
                    <input type="number" id="foo-deductible" class="form-input"
                           value="${s.deductibleAmount || ''}" placeholder="e.g. 2000" min="0" step="100">
                </div>
                <div class="form-group">
                    <label class="form-label">High-Interest Threshold (%)</label>
                    <input type="number" id="foo-threshold" class="form-input"
                           value="${s.highInterestThreshold}" min="1" max="30" step="0.5">
                </div>
                <div class="form-group">
                    <label class="form-label">Emergency Fund Target</label>
                    <select id="foo-months" class="form-select">
                        ${[3,4,5,6,9,12].map(m =>
                            `<option value="${m}"${s.emergencyMonths == m ? ' selected' : ''}>${m} months</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Hyper-Accumulation Target (%)</label>
                    <input type="number" id="foo-hyper-target" class="form-input"
                           value="${s.hyperTarget}" min="5" max="90" step="1">
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
                <button class="btn btn-ghost" onclick="FOO.toggleSettings()">Cancel</button>
                <button class="btn btn-primary" onclick="FOO.saveSettingsForm()">Save Settings</button>
            </div>
        `;
    }

    function renderStep(step, result, isFocus) {
        const { status, detail, override } = result;

        const circleClass = {
            complete:       'foo-circle-done',
            'in-progress':  'foo-circle-now',
            skipped:        'foo-circle-skip',
        }[status] || 'foo-circle-idle';

        const badgeHtml = {
            complete:       '<span class="badge badge-green">Complete</span>',
            'in-progress':  '<span class="badge badge-accent">In Progress</span>',
            skipped:        '<span class="badge badge-muted">Skipped</span>',
        }[status] || '';

        const overrideBadge = override
            ? `<span class="badge badge-muted" style="font-size:0.7rem; opacity:0.65;" title="Manually set">manual</span>`
            : '';

        const inner = status === 'complete'
            ? `<i data-lucide="check" style="width:16px;height:16px;"></i>`
            : step.id;

        return `
            <div class="foo-step${isFocus ? ' foo-step-focus' : ''}">
                <div class="foo-step-header" onclick="FOO.toggleExpand(${step.id})">
                    <div class="foo-circle ${circleClass}">${inner}</div>
                    <div class="foo-step-meta">
                        <div class="foo-step-title">
                            ${step.title}
                            ${badgeHtml}
                            ${overrideBadge}
                        </div>
                        <div class="foo-step-sub">${step.sub}</div>
                        ${detail ? `<div class="foo-step-detect">${detail}</div>` : ''}
                    </div>
                    <i data-lucide="chevron-down" id="foo-chev-${step.id}"
                       style="width:16px;height:16px; color:var(--text-faint); flex-shrink:0; transition:transform 0.2s; margin-top:3px;"></i>
                </div>
                <div class="foo-step-body" id="foo-body-${step.id}" style="display:none;">
                    <p class="foo-guidance">${step.guidance}</p>
                    <div class="foo-actions">
                        ${status !== 'complete' ? `
                            <button class="btn btn-ghost" style="font-size:0.8rem; padding:5px 11px; color:var(--green);"
                                    onclick="event.stopPropagation(); FOO.setOverride(${step.id},'complete')">
                                ✓ Mark Complete
                            </button>` : ''}
                        ${status !== 'in-progress' ? `
                            <button class="btn btn-ghost" style="font-size:0.8rem; padding:5px 11px; color:var(--accent);"
                                    onclick="event.stopPropagation(); FOO.setOverride(${step.id},'in-progress')">
                                → Mark In Progress
                            </button>` : ''}
                        ${status !== 'skipped' ? `
                            <button class="btn btn-ghost" style="font-size:0.8rem; padding:5px 11px;"
                                    onclick="event.stopPropagation(); FOO.setOverride(${step.id},'skipped')">
                                Skip
                            </button>` : ''}
                        ${override ? `
                            <button class="btn btn-ghost" style="font-size:0.8rem; padding:5px 11px; color:var(--text-faint);"
                                    onclick="event.stopPropagation(); FOO.setOverride(${step.id},null)">
                                ↺ Reset to Auto
                            </button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    function getSummary() {
        const settings  = getSettings();
        const overrides = getOverrides();
        let complete = 0, focusId = null;
        STEPS.forEach(s => {
            const result = overrides[s.id]
                ? { status: overrides[s.id] }
                : autoDetect(s.id, settings);
            if (['complete', 'skipped'].includes(result.status)) complete++;
            else if (!focusId) focusId = s.id;
        });
        return {
            complete,
            total: STEPS.length,
            focusId,
            focusStep: focusId ? STEPS.find(s => s.id === focusId) : null,
        };
    }

    return { render, setOverride, saveSettingsForm, toggleSettings, toggleExpand, getSummary };

})();
