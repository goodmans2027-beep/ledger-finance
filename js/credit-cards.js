/**
 * credit-cards.js — Credit Card Tracker
 * ----------------------------------------
 * Track balances, limits, APRs, and minimum payments across all your cards.
 * Per-card payoff projections at minimum payment vs. accelerated payment.
 * Auto-imported by the Debt Planner.
 *
 * CreditCards.render()             — render full page
 * CreditCards.toggleAddForm()      — show / hide add-card form
 * CreditCards.addCard()            — save new card from form
 * CreditCards.deleteCard(id)       — remove a card
 * CreditCards.updateCard(id, f, v) — inline field update
 */

const CreditCards = (() => {

    // ── HELPERS ──────────────────────────────

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }

    function fmt(n) {
        return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtShort(n) {
        const abs  = Math.abs(n);
        const sign = n < 0 ? '-' : '';
        if (abs >= 1_000_000) return sign + '$' + (abs / 1_000_000).toFixed(2) + 'M';
        if (abs >= 1_000)     return sign + '$' + (abs / 1_000).toFixed(1) + 'K';
        return sign + '$' + abs.toFixed(0);
    }

    // Default minimum payment: max($25, 2% of balance), capped at balance
    function defaultMin(balance) {
        if (!balance || balance <= 0) return 0;
        return Math.min(balance, Math.max(25, balance * 0.02));
    }

    // Payoff stats for a fixed monthly payment.
    // Returns { months, totalInterest } or null if balance is 0.
    function payoffStats(balance, apr, payment) {
        if (!balance || balance <= 0) return null;
        payment = Math.max(payment || 0, 0.01);
        const r  = (apr || 0) / 100 / 12;

        // If rate is 0 or payment covers interest, simple division
        if (r === 0) {
            const months = Math.ceil(balance / payment);
            return { months, totalInterest: 0 };
        }

        const monthlyInterest = balance * r;
        if (payment <= monthlyInterest) {
            // Payment doesn't cover interest — never paid off
            return { months: Infinity, totalInterest: Infinity };
        }

        // months = -log(1 - balance*r/payment) / log(1+r)
        const months = Math.ceil(-Math.log(1 - (balance * r) / payment) / Math.log(1 + r));
        const totalInterest = Math.max(0, payment * months - balance);
        return { months, totalInterest };
    }

    function utilColor(pct) {
        if (pct >= 80) return 'var(--red)';
        if (pct >= 50) return 'var(--accent)';
        if (pct >= 30) return '#D9B96B'; // gold
        return 'var(--green)';
    }

    function utilBadgeClass(pct) {
        if (pct >= 80) return 'badge-red';
        if (pct >= 50) return 'badge-accent';
        if (pct >= 30) return 'badge-muted';
        return 'badge-green';
    }

    function fmtMonths(m) {
        if (!isFinite(m) || m <= 0) return '—';
        if (m >= 1200) return '100+ yrs';
        const yr  = Math.floor(m / 12);
        const mo  = m % 12;
        if (yr === 0) return mo + ' mo';
        if (mo === 0) return yr + ' yr';
        return yr + ' yr ' + mo + ' mo';
    }

    // ── DATA ─────────────────────────────────

    function getCards() {
        const d = Data.get('creditCards');
        return Array.isArray(d) ? d : [];
    }

    function setCards(c) { Data.set('creditCards', c); }

    // ── RENDER ───────────────────────────────

    function render() {
        const cards = getCards();
        document.getElementById('page-credit-cards').innerHTML = buildPage(cards);
        CurrencyInput.applyAll();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── PAGE BUILDER ─────────────────────────

    function buildPage(cards) {
        const totalBalance = cards.reduce((s, c) => s + (c.balance || 0), 0);
        const totalLimit   = cards.reduce((s, c) => s + (c.creditLimit || 0), 0);
        const overallUtil  = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
        const totalMin     = cards.reduce((s, c) => s + (c.minPayment || defaultMin(c.balance)), 0);
        const totalInterestMin = cards.reduce((s, c) => {
            const min    = c.minPayment || defaultMin(c.balance);
            const stats  = payoffStats(c.balance, c.apr, min);
            return s + (stats && isFinite(stats.totalInterest) ? stats.totalInterest : 0);
        }, 0);

        const utilCls = overallUtil >= 50 ? 'value-red' : overallUtil >= 30 ? 'value-accent' : 'value-green';

        return `
        <div class="page-header">
            <h2>Credit Cards</h2>
            <p>Track balances, utilization, and payoff projections across all your cards</p>
        </div>

        <!-- ── SUMMARY ── -->
        <div class="summary-grid" style="grid-template-columns:repeat(4,1fr); margin-bottom:20px;">
            <div class="summary-card">
                <div class="label">Total Balance</div>
                <div class="value value-red">${fmt(totalBalance)}</div>
                <div class="sub">across ${cards.length} card${cards.length !== 1 ? 's' : ''}</div>
            </div>
            <div class="summary-card">
                <div class="label">Total Credit</div>
                <div class="value">${fmt(totalLimit)}</div>
                <div class="sub">combined limit</div>
            </div>
            <div class="summary-card">
                <div class="label">Overall Utilization</div>
                <div class="value ${utilCls}">${overallUtil.toFixed(1)}%</div>
                <div class="sub">${overallUtil < 30 ? 'good — under 30%' : overallUtil < 50 ? 'moderate' : 'high — aim for < 30%'}</div>
            </div>
            <div class="summary-card">
                <div class="label">Min Payments / Mo</div>
                <div class="value value-accent">${fmt(totalMin)}</div>
                <div class="sub">${isFinite(totalInterestMin) && totalInterestMin > 0 ? fmt(totalInterestMin) + ' est. interest' : 'total if paying minimums'}</div>
            </div>
        </div>

        <!-- ── CARDS TABLE ── -->
        <div class="card" style="margin-bottom:16px;">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Your Cards</span>
                <button class="btn btn-primary" style="font-size:0.78rem; padding:6px 14px;"
                        onclick="CreditCards.toggleAddForm()">+ Add Card</button>
            </div>

            <!-- Add card form -->
            <div id="cc-add-form"
                 style="display:none; margin-bottom:16px; padding:16px; background:var(--surface2); border-radius:var(--radius);">
                <div class="form-row-3">
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Card Name</label>
                        <input type="text" id="cc-name" placeholder="e.g. Chase Sapphire">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Issuer <span style="color:var(--text-faint);">(optional)</span></label>
                        <input type="text" id="cc-issuer" placeholder="e.g. Chase">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Last 4 Digits <span style="color:var(--text-faint);">(optional)</span></label>
                        <input type="text" id="cc-last4" placeholder="1234" maxlength="4"
                               style="font-family:var(--font-mono);">
                    </div>
                </div>
                <div class="form-row-3" style="margin-top:12px;">
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Current Balance</label>
                        <input type="text" inputmode="decimal" data-fmt="currency" id="cc-balance" placeholder="0.00">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Credit Limit</label>
                        <input type="text" inputmode="decimal" data-fmt="currency" id="cc-limit" placeholder="0.00">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label>APR (%)</label>
                        <input type="number" id="cc-apr" placeholder="e.g. 24.99" min="0" step="0.01">
                    </div>
                </div>
                <div class="form-row" style="max-width:50%; margin-top:12px;">
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Minimum Payment <span style="color:var(--text-faint);">(leave blank to auto-calculate)</span></label>
                        <input type="text" inputmode="decimal" data-fmt="currency" id="cc-min" placeholder="auto">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Statement Closing Day <span style="color:var(--text-faint);">(optional)</span></label>
                        <input type="number" id="cc-statement-day" placeholder="e.g. 15" min="1" max="31" step="1">
                    </div>
                </div>
                <div style="display:flex; gap:10px; margin-top:14px;">
                    <button class="btn btn-primary" onclick="CreditCards.addCard()">Add Card</button>
                    <button class="btn btn-ghost" onclick="CreditCards.toggleAddForm()">Cancel</button>
                </div>
            </div>

            ${cards.length === 0 ? `
            <div style="text-align:center; padding:40px 20px; color:var(--text-muted); font-size:0.84rem;">
                <div style="font-size:2rem; margin-bottom:12px;">💳</div>
                <div style="font-weight:500; color:var(--text); margin-bottom:6px;">No cards added yet</div>
                <div>Add your credit cards to track balances, utilization, and payoff timelines.</div>
            </div>` : `
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Card</th>
                            <th>Balance</th>
                            <th>Limit</th>
                            <th>Utilization</th>
                            <th>APR</th>
                            <th>Min Payment</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cards.map(buildCardRow).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td style="font-family:var(--font-mono); font-size:0.69rem; text-transform:uppercase;
                                       letter-spacing:0.07em; color:var(--text-muted); padding-top:14px;">Totals</td>
                            <td style="font-family:var(--font-mono); color:var(--red); font-weight:600; padding-top:14px;">${fmt(totalBalance)}</td>
                            <td style="font-family:var(--font-mono); padding-top:14px;">${fmt(totalLimit)}</td>
                            <td style="padding-top:14px;">
                                <span class="badge ${utilBadgeClass(overallUtil)}">${overallUtil.toFixed(1)}%</span>
                            </td>
                            <td style="padding-top:14px;"></td>
                            <td style="font-family:var(--font-mono); color:var(--accent); font-weight:600; padding-top:14px;">${fmt(totalMin)}/mo</td>
                            <td style="padding-top:14px;"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>`}
        </div>

        <!-- ── PAYOFF PROJECTIONS ── -->
        ${cards.length > 0 ? buildPayoffSection(cards) : ''}
        `;
    }

    // ── CARD TABLE ROW ────────────────────────

    function buildCardRow(c) {
        const balance  = c.balance || 0;
        const limit    = c.creditLimit || 0;
        const util     = limit > 0 ? Math.min(100, (balance / limit) * 100) : 0;
        const minPmt   = c.minPayment || defaultMin(balance);
        const color    = utilColor(util);

        return `
        <tr>
            <td>
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <input class="inline-edit" style="width:160px; font-weight:500;"
                           value="${c.name || ''}" placeholder="Card name"
                           onchange="CreditCards.updateCard('${c.id}', 'name', this.value)">
                    <div style="display:flex; gap:6px; align-items:center; margin-top:2px;">
                        ${c.issuer ? `<span style="font-size:0.72rem; color:var(--text-faint);">${c.issuer}</span>` : ''}
                        ${c.last4  ? `<span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-faint);">••••&nbsp;${c.last4}</span>` : ''}
                    </div>
                </div>
            </td>
            <td>
                <input class="inline-edit" data-fmt="currency" style="width:110px;"
                       value="${balance || ''}"
                       onchange="CreditCards.updateCard('${c.id}', 'balance', parseMoney(this.value))">
            </td>
            <td>
                <input class="inline-edit" data-fmt="currency" style="width:110px;"
                       value="${limit || ''}" placeholder="Limit"
                       onchange="CreditCards.updateCard('${c.id}', 'creditLimit', parseMoney(this.value))">
            </td>
            <td>
                ${limit > 0 ? `
                <div>
                    <span class="badge ${utilBadgeClass(util)}" style="margin-bottom:4px;">${util.toFixed(0)}%</span>
                    <div class="progress-bar-wrap" style="height:5px; width:80px; margin-top:4px;">
                        <div class="progress-bar" style="width:${util.toFixed(1)}%; background:${color};"></div>
                    </div>
                </div>` : '<span style="color:var(--text-faint); font-size:0.78rem;">—</span>'}
            </td>
            <td>
                <div style="display:flex; align-items:center; gap:4px;">
                    <input class="inline-edit" style="width:60px; font-family:var(--font-mono);"
                           value="${c.apr || ''}" placeholder="APR"
                           onchange="CreditCards.updateCard('${c.id}', 'apr', parseFloat(this.value) || 0)">
                    <span style="font-size:0.75rem; color:var(--text-faint);">%</span>
                </div>
            </td>
            <td>
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <input class="inline-edit" data-fmt="currency" style="width:100px;"
                           value="${c.minPayment || ''}" placeholder="${fmt(defaultMin(balance))}"
                           onchange="CreditCards.updateCard('${c.id}', 'minPayment', parseMoney(this.value))">
                    ${!c.minPayment && balance > 0 ? `<span style="font-size:0.67rem; color:var(--text-faint);">auto: ${fmt(defaultMin(balance))}</span>` : ''}
                </div>
            </td>
            <td>
                <button class="delete-row-btn" onclick="CreditCards.deleteCard('${c.id}')">✕</button>
            </td>
        </tr>`;
    }

    // ── PAYOFF PROJECTIONS ────────────────────

    function buildPayoffSection(cards) {
        const activeCards = cards.filter(c => (c.balance || 0) > 0);
        if (activeCards.length === 0) return '';

        const cardBlocks = activeCards.map(c => {
            const balance  = c.balance || 0;
            const apr      = c.apr || 0;
            const minPmt   = c.minPayment || defaultMin(balance);
            const limit    = c.creditLimit || 0;
            const util     = limit > 0 ? Math.min(100, (balance / limit) * 100) : 0;
            const color    = c._color || utilColor(util);

            const atMin    = payoffStats(balance, apr, minPmt);
            const at2x     = payoffStats(balance, apr, minPmt * 2);

            // Interest savings at 2x minimum
            const minInt   = atMin  && isFinite(atMin.totalInterest)  ? atMin.totalInterest  : null;
            const twoxInt  = at2x   && isFinite(at2x.totalInterest)   ? at2x.totalInterest   : null;
            const intSaved = (minInt !== null && twoxInt !== null) ? Math.max(0, minInt - twoxInt) : null;
            const mthSaved = (atMin && at2x && isFinite(atMin.months) && isFinite(at2x.months))
                ? Math.max(0, atMin.months - at2x.months) : null;

            return `
            <div style="background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius);
                        padding:18px 20px; border-top:3px solid ${utilColor(util)};">

                <!-- Card header -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <div>
                        <div style="font-weight:600; font-size:0.94rem;">${c.name || 'Card'}</div>
                        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px; font-family:var(--font-mono);">
                            ${apr > 0 ? apr.toFixed(2) + '% APR' : 'No APR set'}
                            ${c.issuer ? ' · ' + c.issuer : ''}
                            ${c.last4  ? ' · •••• ' + c.last4 : ''}
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-family:var(--font-serif); font-size:1.2rem; font-weight:600; color:var(--red);">${fmt(balance)}</div>
                        ${limit > 0 ? `<div style="font-size:0.72rem; color:var(--text-muted);">of ${fmt(limit)} limit</div>` : ''}
                    </div>
                </div>

                <!-- Utilization bar -->
                ${limit > 0 ? `
                <div style="margin-bottom:14px;">
                    <div class="progress-bar-wrap" style="height:6px;">
                        <div class="progress-bar" style="width:${util.toFixed(1)}%; background:${utilColor(util)};"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-top:4px;">
                        <span style="font-size:0.69rem; color:var(--text-muted);">${util.toFixed(0)}% utilized</span>
                        <span style="font-size:0.69rem; color:var(--text-muted);">${fmt(Math.max(0, limit - balance))} available</span>
                    </div>
                </div>` : ''}

                <!-- Payoff comparison -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <div style="background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:12px;">
                        <div style="font-size:0.66rem; font-family:var(--font-mono); text-transform:uppercase;
                                    letter-spacing:0.07em; color:var(--text-muted); margin-bottom:6px;">
                            At Min (${fmt(minPmt)}/mo)
                        </div>
                        ${atMin ? `
                        <div style="font-family:var(--font-mono); font-size:0.9rem; font-weight:600;
                                    color:${isFinite(atMin.months) ? 'var(--text)' : 'var(--red)'};">
                            ${fmtMonths(atMin.months)}
                        </div>
                        <div style="font-size:0.72rem; color:var(--red); margin-top:3px;">
                            ${isFinite(atMin.totalInterest) ? fmt(atMin.totalInterest) + ' interest' : 'Never paid off'}
                        </div>` : '<div style="color:var(--text-faint); font-size:0.78rem;">—</div>'}
                    </div>
                    <div style="background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:12px;
                                border-color:var(--green); background:rgba(107,191,142,0.05);">
                        <div style="font-size:0.66rem; font-family:var(--font-mono); text-transform:uppercase;
                                    letter-spacing:0.07em; color:var(--green); margin-bottom:6px;">
                            At 2× Min (${fmt(minPmt * 2)}/mo)
                        </div>
                        ${at2x ? `
                        <div style="font-family:var(--font-mono); font-size:0.9rem; font-weight:600; color:var(--green);">
                            ${fmtMonths(at2x.months)}
                        </div>
                        <div style="font-size:0.72rem; color:var(--green); margin-top:3px;">
                            ${intSaved !== null && intSaved > 0 ? fmt(intSaved) + ' saved' : isFinite(at2x.totalInterest) ? fmt(at2x.totalInterest) + ' interest' : ''}
                        </div>` : '<div style="color:var(--text-faint); font-size:0.78rem;">—</div>'}
                    </div>
                </div>
                ${mthSaved !== null && mthSaved > 0 ? `
                <div style="margin-top:8px; font-size:0.74rem; color:var(--green); font-family:var(--font-mono);">
                    Doubling minimum saves ${fmtMonths(mthSaved)}
                </div>` : ''}
            </div>`;
        }).join('');

        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Payoff Projections</span>
                <span style="font-size:0.74rem; color:var(--text-faint);">Fixed-payment estimates · actual minimums may vary</span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:14px;">
                ${cardBlocks}
            </div>
        </div>`;
    }

    // ── ACTIONS ───────────────────────────────

    function toggleAddForm() {
        const form = document.getElementById('cc-add-form');
        if (!form) return;
        const hidden = form.style.display === 'none' || form.style.display === '';
        form.style.display = hidden ? 'block' : 'none';
        if (hidden) {
            CurrencyInput.applyAll();
            const d = Data.get('creditCards_draft') || {};
            if (d.name) {
                document.getElementById('cc-name').value          = d.name       || '';
                document.getElementById('cc-issuer').value        = d.issuer     || '';
                document.getElementById('cc-last4').value         = d.last4      || '';
                document.getElementById('cc-balance').value       = d.balance    || '';
                document.getElementById('cc-limit').value         = d.limit      || '';
                document.getElementById('cc-apr').value           = d.apr        || '';
                document.getElementById('cc-min').value           = d.min        || '';
                document.getElementById('cc-statement-day').value = d.statDay    || '';
            }
            setTimeout(() => document.getElementById('cc-name')?.focus(), 50);
        }
    }

    function addCard() {
        const name         = document.getElementById('cc-name')?.value.trim();
        const issuer       = document.getElementById('cc-issuer')?.value.trim() || '';
        const last4        = document.getElementById('cc-last4')?.value.trim().replace(/\D/g, '').slice(-4) || '';
        const balance      = parseMoney(document.getElementById('cc-balance')?.value);
        const creditLimit  = parseMoney(document.getElementById('cc-limit')?.value);
        const apr          = parseFloat(document.getElementById('cc-apr')?.value) || 0;
        const minPayment   = parseMoney(document.getElementById('cc-min')?.value) || 0;
        const statementDay = parseInt(document.getElementById('cc-statement-day')?.value) || null;

        if (!name) { Toast.show('Please enter a card name.'); return; }

        const cards = getCards();
        cards.push({ id: uid(), name, issuer, last4, balance, creditLimit, apr, minPayment: minPayment || null, statementDay });
        setCards(cards);
        Data.set('creditCards_draft', {});
        render();
        Toast.show('Card added ✓');
    }

    function deleteCard(id) {
        if (!confirm('Remove this card?')) return;
        setCards(getCards().filter(c => c.id !== id));
        render();
        Toast.show('Card removed');
    }

    function updateCard(id, field, value) {
        const cards = getCards();
        const idx   = cards.findIndex(c => c.id === id);
        if (idx === -1) return;
        cards[idx][field] = value;
        setCards(cards);
        // Patch the inline display without full re-render to avoid focus loss
        // Only fields that affect other visible elements need a re-render
        if (field === 'balance' || field === 'creditLimit' || field === 'minPayment') {
            render();
        }
    }

    function autoSave() {
        try {
            const form = document.getElementById('cc-add-form');
            if (!form || (form.style.display === 'none' || form.style.display === '')) return;
            Data.set('creditCards_draft', {
                name:    document.getElementById('cc-name')?.value           || '',
                issuer:  document.getElementById('cc-issuer')?.value         || '',
                last4:   document.getElementById('cc-last4')?.value          || '',
                balance: document.getElementById('cc-balance')?.value        || '',
                limit:   document.getElementById('cc-limit')?.value          || '',
                apr:     document.getElementById('cc-apr')?.value            || '',
                min:     document.getElementById('cc-min')?.value            || '',
                statDay: document.getElementById('cc-statement-day')?.value  || '',
            });
        } catch (e) {}
    }

    // ── PUBLIC API ───────────────────────────
    return { render, autoSave, toggleAddForm, addCard, deleteCard, updateCard };

})();
