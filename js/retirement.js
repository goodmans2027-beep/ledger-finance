/**
 * retirement.js — Retirement Projector
 * ----------------------------------------
 * "Will I have enough when I want to retire?"
 *
 * The user picks a target retirement age (and their current age).
 * The projector answers:
 *   • What will my portfolio be worth on that date?
 *   • How does that compare to what I'll need?
 *   • What monthly contribution would close any gap?
 *
 * Auto-pulls from:
 *   Investments — portfolio value, monthly contributions, blended return
 *   Budget      — monthly expenses (used to size the nest egg target)
 *
 * All fields are overridable for scenario modelling.
 *
 * Retirement.render()         — render full page
 * Retirement.save()           — persist inputs and re-render
 * Retirement.resetOverrides() — clear overrides, re-render
 */

const Retirement = (() => {

    // ── HELPERS ──────────────────────────────

    function fmt(n) {
        return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Compact: $1.23M  /  $456K  /  $789
    function fmtC(n) {
        const abs = Math.abs(n);
        const sign = n < 0 ? '-' : '';
        if (abs >= 1_000_000) return sign + '$' + (abs / 1_000_000).toFixed(2) + 'M';
        if (abs >= 1_000)     return sign + '$' + (abs / 1_000).toFixed(1) + 'K';
        return sign + fmt(abs);
    }

    function retireYear(currentAge, retireAge) {
        const diff = retireAge - currentAge;
        return new Date().getFullYear() + diff;
    }

    // ── STATE ─────────────────────────────────

    function getState() {
        const s = Data.get('retirement') || {};
        return {
            currentAge:         s.currentAge         ?? null,
            retireAge:          s.retireAge           ?? 65,
            withdrawalRate:     s.withdrawalRate      ?? 4,
            growthRateOverride: s.growthRateOverride  ?? null,
            expensesOverride:   s.expensesOverride    ?? null,
            contribOverride:    s.contribOverride     ?? null,
        };
    }

    function saveState(s) { Data.set('retirement', s); }

    // ── DATA FROM OTHER MODULES ───────────────

    function getInvestmentData() {
        const holdings      = Data.get('investments')?.holdings || [];
        const totalValue    = holdings.reduce((s, h) => s + (h.currentValue   || 0), 0);
        const totalMonthly  = holdings.reduce((s, h) => s + (h.monthlyContrib || 0), 0);
        const blendedReturn = totalValue > 0
            ? holdings.reduce((s, h) => s + (h.expectedReturn || 0) * (h.currentValue || 0), 0) / totalValue
            : 0;
        return { totalValue, totalMonthly, blendedReturn, hasHoldings: holdings.length > 0 };
    }

    function getBudgetExpenses() {
        const b    = Data.get('budget') || {};
        const cats = Array.isArray(b.categories)    ? b.categories    : [];
        const subs = Array.isArray(b.subscriptions) ? b.subscriptions : [];
        const toMonthly = (amount, freq) => {
            const map = { weekly:52/12, biweekly:26/12, semimonthly:24/12, monthly:1,
                          '2months':0.5, quarterly:1/3, '6months':1/6, semiannual:1/6, annual:1/12 };
            return (amount || 0) * (map[freq] || 1);
        };
        const fromCats = cats.reduce((s, c) => s + toMonthly(c.amount, c.frequency), 0);
        const fromSubs = subs.reduce((s, sub) =>
            s + toMonthly(sub.amount || 0, sub.frequency), 0);
        return { total: fromCats + fromSubs, hasBudget: (cats.length + subs.length) > 0 };
    }

    // ── PROJECTION MATH ───────────────────────

    // Future value of lump-sum + monthly annuity
    function projectValue(start, annualReturn, monthlyContrib, months) {
        const r = annualReturn / 100 / 12;
        if (r === 0) return start + monthlyContrib * months;
        const growth = Math.pow(1 + r, months);
        return start * growth + monthlyContrib * ((growth - 1) / r);
    }

    // Monthly contribution required to hit target at end of months
    // Solved analytically: target = start*(1+r)^n + C*((1+r)^n-1)/r  →  C = ...
    function contribToHitTarget(start, annualReturn, months, target) {
        if (months <= 0) return null;
        const r = annualReturn / 100 / 12;
        const growth = r > 0 ? Math.pow(1 + r, months) : 1;
        const fvStart = start * growth;
        if (fvStart >= target) return 0; // already there with no contributions
        if (r === 0) return (target - fvStart) / months;
        return (target - fvStart) / ((growth - 1) / r);
    }

    // Build month-by-month series for chart (returns array of length months+1)
    function buildSeries(start, annualReturn, monthlyContrib, months) {
        const r   = annualReturn / 100 / 12;
        const pts = [start];
        let v = start;
        for (let m = 1; m <= months; m++) {
            v = r > 0 ? v * (1 + r) + monthlyContrib : v + monthlyContrib;
            pts.push(v);
        }
        return pts;
    }

    // ── RENDER ───────────────────────────────

    function render() {
        const state    = getState();
        const inv      = getInvestmentData();
        const expData  = getBudgetExpenses();

        // Effective values (override wins)
        const growthRate    = state.growthRateOverride ?? (inv.blendedReturn > 0 ? inv.blendedReturn : 7);
        const monthlyExp    = state.expensesOverride   ?? expData.total;
        const monthlyContrib = state.contribOverride   ?? inv.totalMonthly;
        const portfolio     = inv.totalValue;

        // Time to retirement
        const currentAge  = state.currentAge;
        const targetAge   = state.retireAge;
        const validAges   = currentAge && targetAge && targetAge > currentAge;
        const yearsToRetire  = validAges ? (targetAge - currentAge) : null;
        const monthsToRetire = yearsToRetire ? yearsToRetire * 12 : null;
        const targetYear     = validAges ? retireYear(currentAge, targetAge) : null;

        // Nest egg target (how much they need)
        const nestEgg = monthlyExp > 0
            ? (monthlyExp * 12) / (state.withdrawalRate / 100)
            : 0;

        // Projected portfolio at target date
        const projected = monthsToRetire
            ? projectValue(portfolio, growthRate, monthlyContrib, monthsToRetire)
            : null;

        // Gap / surplus
        const delta   = projected != null && nestEgg > 0 ? projected - nestEgg : null;
        const onTrack = delta != null && delta >= 0;

        // How much more per month to exactly hit nest egg
        const neededContrib = nestEgg > 0 && monthsToRetire
            ? contribToHitTarget(portfolio, growthRate, monthsToRetire, nestEgg)
            : null;
        const extraNeeded = neededContrib != null
            ? Math.max(0, neededContrib - monthlyContrib)
            : null;

        // Income from projected portfolio at retirement
        const projectedMonthlyIncome = projected
            ? projected * (state.withdrawalRate / 100) / 12
            : 0;

        const hasPortfolio = portfolio > 0 || monthlyContrib > 0;
        const canProject   = validAges && hasPortfolio;
        const hasNestEgg   = nestEgg > 0;

        document.getElementById('page-retirement').innerHTML = buildPage({
            state, inv, expData,
            growthRate, monthlyExp, monthlyContrib,
            portfolio, nestEgg, projected, delta, onTrack,
            yearsToRetire, monthsToRetire, targetYear, targetAge, currentAge,
            neededContrib, extraNeeded, projectedMonthlyIncome,
            canProject, hasPortfolio, hasNestEgg
        });

        if (canProject && hasNestEgg) {
            renderChart(portfolio, growthRate, monthlyContrib, nestEgg, monthsToRetire);
        }

        CurrencyInput.applyAll();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── PAGE ─────────────────────────────────

    function buildPage(d) {
        return `
        <div class="page-header">
            <h2>Retirement Projector</h2>
            <p>Set your target retirement age and see if your current savings will get you there</p>
        </div>

        ${buildAssumptions(d)}

        ${d.canProject && d.hasNestEgg
            ? buildSummary(d)
            : buildPrompt(d)}

        ${d.canProject && d.hasNestEgg ? buildOnTrackCard(d) : ''}

        ${d.canProject && d.hasNestEgg ? `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Portfolio Projection to Retirement</div>
            <div class="chart-container" style="height:300px;">
                <canvas id="retirement-chart"></canvas>
            </div>
            <div style="margin-top:10px; display:flex; gap:20px; flex-wrap:wrap; font-size:0.75rem; color:var(--text-faint);">
                <span style="display:flex; align-items:center; gap:6px;">
                    <span style="display:inline-block; width:16px; height:3px; background:rgba(107,191,142,0.9); border-radius:2px;"></span>
                    Projected portfolio
                </span>
                <span style="display:flex; align-items:center; gap:6px;">
                    <span style="display:inline-block; width:16px; height:2px; background:rgba(217,119,87,0.75);
                                 background-image:repeating-linear-gradient(90deg,rgba(217,119,87,0.75) 0,rgba(217,119,87,0.75) 6px,transparent 6px,transparent 11px);"></span>
                    Nest egg target
                </span>
                <span style="display:flex; align-items:center; gap:6px;">
                    <span style="display:inline-block; width:2px; height:12px; background:rgba(107,159,217,0.6);"></span>
                    Retirement date
                </span>
            </div>
        </div>` : ''}

        ${d.canProject && d.hasNestEgg ? buildSensitivity(d) : ''}
        `;
    }

    // ── ASSUMPTIONS CARD ─────────────────────

    function buildAssumptions(d) {
        const { state, inv, expData, growthRate, monthlyExp, monthlyContrib } = d;

        const autoExp    = expData.hasBudget
            ? '$' + expData.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '/mo'
            : 'No budget data';
        const autoContrib = inv.hasHoldings
            ? '$' + inv.totalMonthly.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '/mo'
            : 'No investment data';
        const autoGrowth  = inv.hasHoldings && inv.blendedReturn > 0
            ? inv.blendedReturn.toFixed(2) + '% blended'
            : '7% default';

        const expFmt    = state.expensesOverride  != null ? '$' + Number(state.expensesOverride ).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        const ctbFmt    = state.contribOverride   != null ? '$' + Number(state.contribOverride  ).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        const gFmt      = state.growthRateOverride != null ? state.growthRateOverride : '';

        // Years away helper text
        const yearsText = state.currentAge && state.retireAge && state.retireAge > state.currentAge
            ? `${state.retireAge - state.currentAge} years away`
            : state.currentAge && state.retireAge && state.retireAge <= state.currentAge
                ? 'Target age must be greater than current age'
                : '';

        return `
        <div class="card" style="margin-bottom:16px;">

            <!-- Target section -->
            <div style="display:flex; gap:20px; flex-wrap:wrap; align-items:flex-end; margin-bottom:20px; padding-bottom:20px; border-bottom:1px solid var(--border);">

                <div style="flex:0 0 auto; min-width:120px;">
                    <div class="ret-label">Current Age</div>
                    <input type="number" id="ret-current-age"
                           value="${state.currentAge ?? ''}"
                           placeholder="e.g. 35" min="1" max="99" style="width:100%;">
                </div>

                <div style="flex:0 0 auto; min-width:160px;">
                    <div class="ret-label">Target Retirement Age</div>
                    <input type="number" id="ret-retire-age"
                           value="${state.retireAge ?? ''}"
                           placeholder="e.g. 65" min="1" max="120" style="width:100%;">
                </div>

                ${yearsText ? `
                <div style="padding-bottom:10px; flex:0 0 auto;">
                    <div style="font-family:var(--font-mono); font-size:0.88rem;
                                color:${yearsText.includes('must') ? 'var(--red)' : 'var(--accent)'};
                                font-weight:600;">
                        ${yearsText}
                    </div>
                    ${d.targetYear ? `<div style="font-size:0.75rem; color:var(--text-muted);">Retiring in ${d.targetYear}</div>` : ''}
                </div>` : ''}

                <div style="flex:0 0 auto; min-width:120px;">
                    <div class="ret-label">Withdrawal Rate (%)</div>
                    <input type="number" id="ret-withdrawal"
                           value="${state.withdrawalRate}"
                           placeholder="4" min="1" max="20" step="0.1" style="width:100%;">
                </div>

            </div>

            <!-- Overrides section -->
            <div style="margin-bottom:12px; font-size:0.72rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.08em; color:var(--text-faint);">
                Auto-detected values &mdash; leave blank to use these, or enter a value to override
            </div>
            <div style="display:flex; gap:20px; flex-wrap:wrap; align-items:flex-end;">

                <div style="min-width:200px; flex:1;">
                    <div class="ret-label">
                        Monthly Expenses in Retirement
                        <span class="ret-auto">auto: ${autoExp}</span>
                    </div>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="ret-expenses"
                           value="${expFmt}" placeholder="Override…" style="width:100%;">
                </div>

                <div style="min-width:200px; flex:1;">
                    <div class="ret-label">
                        Monthly Contribution
                        <span class="ret-auto">auto: ${autoContrib}</span>
                    </div>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="ret-contrib"
                           value="${ctbFmt}" placeholder="Override…" style="width:100%;">
                </div>

                <div style="min-width:160px; flex:1;">
                    <div class="ret-label">
                        Annual Portfolio Return (%)
                        <span class="ret-auto">auto: ${autoGrowth}</span>
                    </div>
                    <input type="number" id="ret-growth" value="${gFmt}"
                           placeholder="Override…" min="0" max="30" step="0.1" style="width:100%;">
                </div>

                <div style="display:flex; gap:8px; flex-shrink:0; padding-bottom:1px;">
                    <button class="btn btn-primary" style="font-size:0.8rem; padding:10px 20px;"
                            onclick="Retirement.save()">Calculate</button>
                    <button class="btn btn-ghost" style="font-size:0.8rem; padding:10px 14px;"
                            onclick="Retirement.resetOverrides()" title="Clear overrides">Reset</button>
                </div>

            </div>
        </div>`;
    }

    // ── SUMMARY CARDS ────────────────────────

    function buildSummary(d) {
        const { projected, nestEgg, delta, onTrack, yearsToRetire, targetAge, targetYear,
                projectedMonthlyIncome, monthlyExp, monthlyContrib } = d;

        const deltaColor = onTrack ? 'value-green' : 'value-red';
        const deltaSign  = delta >= 0 ? '+' : '';
        const deltaLabel = onTrack ? 'surplus at retirement' : 'shortfall at retirement';

        return `
        <div class="summary-grid" style="grid-template-columns:repeat(5,1fr); margin-bottom:16px;">

            <div class="summary-card">
                <div class="label">Retire At</div>
                <div class="value value-accent" style="font-size:1.3rem;">${targetAge}</div>
                <div class="sub">${yearsToRetire} yrs away &middot; ${targetYear}</div>
            </div>

            <div class="summary-card">
                <div class="label">Projected Portfolio</div>
                <div class="value" style="font-size:1.25rem;">${fmtC(projected)}</div>
                <div class="sub">at age ${targetAge}</div>
            </div>

            <div class="summary-card">
                <div class="label">Nest Egg Target</div>
                <div class="value value-accent" style="font-size:1.25rem;">${fmtC(nestEgg)}</div>
                <div class="sub">${fmt(monthlyExp)}/mo × ${d.state.withdrawalRate}% rule</div>
            </div>

            <div class="summary-card">
                <div class="label">${onTrack ? 'Surplus' : 'Shortfall'}</div>
                <div class="value ${deltaColor}" style="font-size:1.25rem;">${deltaSign}${fmtC(delta)}</div>
                <div class="sub">${deltaLabel}</div>
            </div>

            <div class="summary-card">
                <div class="label">Monthly Income</div>
                <div class="value value-green">${fmt(projectedMonthlyIncome)}</div>
                <div class="sub">from portfolio at retirement</div>
            </div>

        </div>`;
    }

    // ── ON-TRACK CARD ─────────────────────────

    function buildOnTrackCard(d) {
        const { onTrack, delta, projected, nestEgg,
                monthlyContrib, neededContrib, extraNeeded,
                projectedMonthlyIncome, monthlyExp,
                yearsToRetire, targetAge } = d;

        const progressPct    = nestEgg > 0 ? Math.min(100, (projected / nestEgg) * 100) : 0;
        const progressColor  = onTrack ? 'var(--green)' : progressPct >= 75 ? 'var(--accent)' : 'var(--red)';

        let actionHtml = '';
        if (onTrack) {
            actionHtml = `
            <div style="display:flex; align-items:center; gap:10px; padding:14px 18px;
                        background:rgba(107,191,142,0.08); border:1px solid rgba(107,191,142,0.2);
                        border-radius:8px;">
                <span style="font-size:1.4rem;">✓</span>
                <div>
                    <div style="font-size:0.9rem; font-weight:500; color:var(--green);">You're on track!</div>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                        Your projected portfolio exceeds your nest egg target by <strong style="color:var(--green);">${fmtC(delta)}</strong>.
                        At retirement your portfolio would support <strong>${fmt(projectedMonthlyIncome)}/mo</strong>
                        — ${fmt(projectedMonthlyIncome - monthlyExp)} more than your estimated monthly expenses.
                    </div>
                </div>
            </div>`;
        } else if (extraNeeded !== null && extraNeeded > 0) {
            actionHtml = `
            <div style="display:flex; align-items:center; gap:10px; padding:14px 18px;
                        background:rgba(217,107,107,0.07); border:1px solid rgba(217,107,107,0.2);
                        border-radius:8px;">
                <span style="font-size:1.4rem;">↑</span>
                <div>
                    <div style="font-size:0.9rem; font-weight:500; color:var(--red);">Gap of ${fmtC(Math.abs(delta))}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                        To reach your nest egg by age ${targetAge}, you'd need to contribute
                        an additional <strong style="color:var(--accent);">${fmt(extraNeeded)}/mo</strong>
                        (total: ${fmt(neededContrib)}/mo). Or adjust your target retirement age in the settings above.
                    </div>
                </div>
            </div>`;
        } else if (neededContrib === 0) {
            actionHtml = `
            <div style="padding:14px 18px; background:rgba(107,191,142,0.08);
                        border:1px solid rgba(107,191,142,0.2); border-radius:8px;">
                <div style="font-size:0.9rem; font-weight:500; color:var(--green);">Already funded</div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                    Your current portfolio will reach your nest egg target without any additional contributions.
                </div>
            </div>`;
        }

        return `
        <div class="card" style="margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:12px;">
                <div class="card-title" style="margin:0;">Goal Progress at Retirement</div>
                <span style="font-family:var(--font-mono); font-size:0.9rem;
                             color:${progressColor}; font-weight:600;">${progressPct.toFixed(1)}%</span>
            </div>

            <!-- Progress bar: how much of nest egg the projected portfolio covers -->
            <div style="background:var(--surface2); border-radius:99px; height:12px;
                        overflow:hidden; position:relative; margin-bottom:8px;">
                <div style="height:100%; width:${Math.min(progressPct, 100)}%;
                            background:linear-gradient(90deg, ${progressColor}, ${onTrack ? 'var(--green)' : progressColor});
                            border-radius:99px; transition:width 0.5s ease;"></div>
                <!-- 100% target marker -->
                <div style="position:absolute; top:0; bottom:0; left:100%; width:2px;
                            background:rgba(255,255,255,0.15); transform:translateX(-1px);"></div>
            </div>
            <div style="display:flex; justify-content:space-between; font-family:var(--font-mono);
                        font-size:0.7rem; color:var(--text-faint); margin-bottom:16px;">
                <span>$0</span>
                <span>Projected: ${fmtC(projected)}</span>
                <span style="color:var(--accent);">Target: ${fmtC(nestEgg)}</span>
            </div>

            ${actionHtml}
        </div>`;
    }

    // ── SENSITIVITY TABLE ─────────────────────

    function buildSensitivity(d) {
        const { portfolio, growthRate, monthlyContrib, nestEgg, monthsToRetire, targetAge } = d;

        const returnRows  = [-2, 0, 2];
        const contribCols = [0, 250, 500, 1000];

        const rows = returnRows.map(rOff => {
            const rate   = Math.max(0, growthRate + rOff);
            const isBase = rOff === 0;
            const rLabel = rOff === 0
                ? `${rate.toFixed(1)}% ← current`
                : `${rate.toFixed(1)}% (${rOff > 0 ? '+' : ''}${rOff}%)`;

            const cells = contribCols.map(cAdd => {
                const val   = projectValue(portfolio, rate, monthlyContrib + cAdd, monthsToRetire);
                const gap   = val - nestEgg;
                const ok    = gap >= 0;
                const color = ok ? 'var(--green)' : Math.abs(gap) / nestEgg < 0.1 ? 'var(--accent)' : 'var(--red)';
                const sign  = gap >= 0 ? '+' : '';
                const bold  = isBase && cAdd === 0 ? 'font-weight:700;' : '';
                return `<td style="text-align:center; font-family:var(--font-mono); ${bold}">
                    <div style="color:${color}; font-size:0.83rem;">${fmtC(val)}</div>
                    <div style="font-size:0.7rem; color:${ok ? 'var(--green)' : 'var(--red)'}; margin-top:1px;">${sign}${fmtC(gap)}</div>
                </td>`;
            });

            return `<tr ${isBase ? 'style="background:var(--accent-dim);"' : ''}>
                <td style="font-family:var(--font-mono); font-size:0.8rem;
                           ${isBase ? 'color:var(--accent); font-weight:600;' : 'color:var(--text-muted);'}">
                    ${rLabel}
                </td>
                ${cells.join('')}
            </tr>`;
        });

        const colHeaders = contribCols.map((c, i) =>
            `<th style="text-align:center;">${i === 0 ? 'Current' : '+' + fmt(c).replace('.00','') + '/mo'}</th>`
        ).join('');

        return `
        <div class="card" style="margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:14px;">
                <div class="card-title" style="margin:0;">Scenario Analysis</div>
                <div style="font-size:0.75rem; color:var(--text-faint);">
                    Portfolio at age ${targetAge} &mdash; top line is value, bottom is gap/surplus vs target
                </div>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Annual Return</th>
                            ${colHeaders}
                        </tr>
                    </thead>
                    <tbody>${rows.join('')}</tbody>
                </table>
            </div>
            <div style="margin-top:10px; font-size:0.73rem; color:var(--text-faint); line-height:1.6;">
                Highlighted row = current assumptions.
                <span style="color:var(--green);">Green</span> = on track &nbsp;·&nbsp;
                <span style="color:var(--accent);">Orange</span> = within 10% of target &nbsp;·&nbsp;
                <span style="color:var(--red);">Red</span> = shortfall
            </div>
        </div>`;
    }

    // ── PROMPT / EMPTY STATES ─────────────────

    function buildPrompt(d) {
        const { canProject, hasPortfolio, hasNestEgg, d: _d } = d;

        // Figure out what's missing
        const msgs = [];
        if (!d.state.currentAge || !d.state.retireAge) {
            msgs.push('Enter your <strong>Current Age</strong> and <strong>Target Retirement Age</strong> above to start the projection.');
        } else if (d.state.retireAge <= d.state.currentAge) {
            msgs.push('Your target retirement age must be <strong>greater than</strong> your current age.');
        }
        if (!hasPortfolio) {
            msgs.push('Add holdings in <strong>Investments</strong> (or enter an override above) so your portfolio can be projected.');
        }
        if (!hasNestEgg) {
            msgs.push('Add categories in <strong>Budget</strong> (or enter a monthly expenses override above) to size your nest egg target.');
        }

        return `
        <div class="card" style="margin-bottom:16px;">
            <div style="text-align:center; padding:40px 24px;">
                <div style="font-size:2.2rem; margin-bottom:14px;">📈</div>
                <div style="font-size:0.95rem; font-weight:500; color:var(--text); margin-bottom:12px;">
                    ${msgs.length === 1 && msgs[0].includes('Current Age') ? 'Set your target to begin' : 'A few details needed'}
                </div>
                <div style="font-size:0.85rem; color:var(--text-muted); line-height:1.9;
                            max-width:480px; margin:0 auto; text-align:left;">
                    ${msgs.map(m => `<div style="display:flex; gap:8px;"><span style="color:var(--accent); flex-shrink:0;">→</span><span>${m}</span></div>`).join('')}
                </div>
            </div>
        </div>`;
    }

    // ── CHART ─────────────────────────────────

    function renderChart(portfolio, growthRate, monthlyContrib, nestEgg, monthsToRetire) {
        const canvas = document.getElementById('retirement-chart');
        if (!canvas) return;
        if (window._retChart) { window._retChart.destroy(); window._retChart = null; }

        // Show up to 10 years past retirement date
        const totalMonths = monthsToRetire + 120;
        const step = Math.max(1, Math.ceil(totalMonths / 60));

        const series = buildSeries(portfolio, growthRate, monthlyContrib, totalMonths);

        const labels       = [];
        const portfolioVals = [];
        const nestEggVals  = [];

        for (let m = 0; m <= totalMonths; m += step) {
            const d = new Date();
            d.setMonth(d.getMonth() + m);
            labels.push(d.getFullYear().toString());
            portfolioVals.push(Math.round(series[m] || 0));
            nestEggVals.push(Math.round(nestEgg));
        }

        // Find which label index corresponds to the retirement date
        const retireLabelYear = (() => {
            const d = new Date();
            d.setMonth(d.getMonth() + monthsToRetire);
            return d.getFullYear().toString();
        })();
        const retireIdx = labels.indexOf(retireLabelYear);

        // Custom plugin: draw a vertical line at the retirement date
        const retireLine = {
            id: 'retireLine',
            afterDraw(chart) {
                if (retireIdx < 0) return;
                const { ctx, chartArea, scales } = chart;
                const x = scales.x.getPixelForValue(retireIdx);
                if (!x || x < chartArea.left || x > chartArea.right) return;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, chartArea.top);
                ctx.lineTo(x, chartArea.bottom);
                ctx.strokeStyle = 'rgba(107,159,217,0.55)';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.stroke();
                // Label at top
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(107,159,217,0.8)';
                ctx.font = '10px DM Mono, monospace';
                ctx.textAlign = 'center';
                ctx.fillText('Retire', x, chartArea.top + 12);
                ctx.restore();
            }
        };

        window._retChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Projected Portfolio',
                        data: portfolioVals,
                        borderColor: 'rgba(107,191,142,0.9)',
                        backgroundColor: 'rgba(107,191,142,0.1)',
                        fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2.5
                    },
                    {
                        label: 'Nest Egg Target',
                        data: nestEggVals,
                        borderColor: 'rgba(217,119,87,0.75)',
                        backgroundColor: 'transparent',
                        fill: false, tension: 0, pointRadius: 0, borderWidth: 2,
                        borderDash: [8, 5]
                    }
                ]
            },
            plugins: [retireLine],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: item => ` ${item.dataset.label}: ${fmtC(item.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#8A8580', font: { family: 'DM Mono', size: 10 }, maxTicksLimit: 14 },
                        grid:  { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        ticks: {
                            color: '#8A8580', font: { family: 'DM Mono', size: 10 },
                            callback: v => v >= 1_000_000 ? '$' + (v/1_000_000).toFixed(1) + 'M'
                                        : v >= 1_000    ? '$' + (v/1_000).toFixed(0) + 'K'
                                        : '$' + v
                        },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    }
                }
            }
        });
    }

    // ── ACTIONS ───────────────────────────────

    function save() {
        const s = getState();

        s.currentAge = parseInt(document.getElementById('ret-current-age')?.value) || null;
        s.retireAge  = parseInt(document.getElementById('ret-retire-age')?.value)  || 65;
        s.withdrawalRate = parseFloat(document.getElementById('ret-withdrawal')?.value) || 4;

        const growthVal = document.getElementById('ret-growth')?.value?.trim();
        s.growthRateOverride = growthVal !== '' && growthVal != null
            ? (parseFloat(growthVal) ?? null) : null;

        const expVal = parseMoney(document.getElementById('ret-expenses')?.value || '');
        s.expensesOverride = expVal > 0 ? expVal : null;

        const ctbVal = parseMoney(document.getElementById('ret-contrib')?.value || '');
        s.contribOverride = ctbVal > 0 ? ctbVal : null;

        saveState(s);
        render();
    }

    function resetOverrides() {
        const s = getState();
        s.growthRateOverride = null;
        s.expensesOverride   = null;
        s.contribOverride    = null;
        saveState(s);
        render();
        Toast.show('Overrides cleared — using auto-detected values ✓');
    }

    function autoSave() {
        const s = getState();
        s.currentAge      = parseInt(document.getElementById('ret-current-age')?.value)  || null;
        s.retireAge       = parseInt(document.getElementById('ret-retire-age')?.value)   || 65;
        s.withdrawalRate  = parseFloat(document.getElementById('ret-withdrawal')?.value) || 4;
        const growthVal   = document.getElementById('ret-growth')?.value?.trim();
        s.growthRateOverride = growthVal ? (parseFloat(growthVal) ?? null) : null;
        const expVal = parseMoney(document.getElementById('ret-expenses')?.value || '');
        s.expensesOverride = expVal > 0 ? expVal : null;
        const ctbVal = parseMoney(document.getElementById('ret-contrib')?.value || '');
        s.contribOverride = ctbVal > 0 ? ctbVal : null;
        saveState(s);
    }

    // ── PUBLIC API ───────────────────────────
    return { render, save, autoSave, resetOverrides };

})();
