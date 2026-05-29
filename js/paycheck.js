/**
 * paycheck.js — Paycheck Breakdown
 * ----------------------------------
 * Supports multiple paychecks (tabbed). Each has fixed pre-tax / post-tax fields
 * plus dynamic custom items. Taxes estimated via Tax.computeAll().
 *
 * Paycheck.render()               — render full page
 * Paycheck.switchTab(idx)         — change active paycheck tab (-1 = combined)
 * Paycheck.addPaycheck()          — add a new paycheck entry
 * Paycheck.deletePaycheck(id)     — remove a paycheck entry
 * Paycheck.calculate()            — read form, save, re-render
 * Paycheck.reset()                — reset current tab to defaults
 * Paycheck.toggleTaxSource()      — show/hide manual state/local fields
 * Paycheck.toggleAddPreTax()      — show/hide custom pre-tax add form
 * Paycheck.addPreTaxItem()        — save custom pre-tax item and re-render
 * Paycheck.removePreTaxItem(id)   — remove custom pre-tax item and re-render
 * Paycheck.toggleAddPostTax()     — show/hide custom post-tax add form
 * Paycheck.addPostTaxItem()       — save custom post-tax item and re-render
 * Paycheck.removePostTaxItem(id)  — remove custom post-tax item and re-render
 * Paycheck.addToBudget(id?)       — push net as a Budget income stream
 */

const Paycheck = (() => {

    // ── CONSTANTS ─────────────────────────────

    const PPY = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

    const FREQ_LABEL = {
        weekly: 'Weekly', biweekly: 'Bi-Weekly',
        semimonthly: 'Semi-Monthly', monthly: 'Monthly'
    };

    const FREQ_SHORT = { weekly: 'wk', biweekly: 'bi-wk', semimonthly: 'semi-mo', monthly: 'mo' };

    const STATES = [
        ['', '— Select State —'],
        ['AL','Alabama'],['AK','Alaska (no tax)'],['AZ','Arizona'],['AR','Arkansas'],
        ['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],
        ['FL','Florida (no tax)'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],
        ['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],
        ['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
        ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],
        ['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada (no tax)'],
        ['NH','New Hampshire (no tax)'],['NJ','New Jersey'],['NM','New Mexico'],
        ['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
        ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],
        ['SC','South Carolina'],['SD','South Dakota (no tax)'],['TN','Tennessee (no tax)'],
        ['TX','Texas (no tax)'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],
        ['WA','Washington (no tax)'],['WV','West Virginia'],['WI','Wisconsin'],
        ['WY','Wyoming (no tax)'],['DC','Washington D.C.']
    ];

    const PC_DEFAULTS = {
        grossPaycheck: 0, payFrequency: 'biweekly', filingStatus: 'single',
        state: '', localRate: 0,
        medical: 0, dental: 0, vision: 0, hsa: 0, contrib401k: 0,
        pretaxCustom: [],
        roth401k: 0, rothIRA: 0, lifeInsurance: 0,
        postTaxCustom: [],
        deposits: [],
    };

    // ── MODULE STATE ──────────────────────────

    let _tab = 0;               // active tab index; -1 = combined view
    let _editingDepositId = null; // id of deposit row currently in edit mode
    let _dragId = null;           // id of deposit row being dragged

    // ── HELPERS ───────────────────────────────

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }

    function fmt(n) {
        return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtShort(n) {
        const a = Math.abs(n), sign = n < 0 ? '-' : '';
        if (a >= 1_000_000) return sign + '$' + (a / 1_000_000).toFixed(2) + 'M';
        if (a >= 1_000)     return sign + '$' + (a / 1_000).toFixed(1) + 'K';
        return sign + '$' + a.toFixed(0);
    }

    // ── STATE ─────────────────────────────────

    function getState() {
        const d = Data.get('paycheck') || {};

        // Migrate old flat format → new array format
        if (!Array.isArray(d.paychecks)) {
            const pc = Object.assign({}, PC_DEFAULTS, {
                id: uid(), name: 'My Paycheck',
                grossPaycheck: d.grossPaycheck || 0,
                payFrequency:  d.payFrequency  || 'biweekly',
                filingStatus:  d.filingStatus  || 'single',
                state:         d.state         || '',
                localRate:     d.localRate     || 0,
                medical:       d.medical       || 0,
                dental:        d.dental        || 0,
                vision:        d.vision        || 0,
                hsa:           d.hsa           || 0,
                contrib401k:   d.contrib401k   || 0,
                pretaxCustom:  [],
                roth401k:      d.roth401k || d.rothContrib || 0,
                rothIRA:       d.rothIRA  || 0,
                lifeInsurance: d.lifeInsurance || 0,
                postTaxCustom: (d.savingsTransfer > 0)
                    ? [{ id: uid(), name: 'Savings Transfer', amount: d.savingsTransfer }]
                    : [],
            });
            return { useTaxPage: d.useTaxPage !== false, paychecks: [pc] };
        }

        return { useTaxPage: d.useTaxPage !== false, paychecks: d.paychecks || [] };
    }

    function saveState(s) { Data.set('paycheck', s); }

    function getActivePC(s) {
        return s.paychecks[_tab] || null;
    }

    // ── COMPUTATION ───────────────────────────

    function computePaycheck(pc, useTaxPage) {
        const ppy = PPY[pc.payFrequency] || 26;

        let state = pc.state || '';
        let localRate = pc.localRate || 0;
        if (useTaxPage) {
            const td = Data.get('tax') || {};
            state     = td.state     || '';
            localRate = td.localRate || 0;
        }

        const customPreTaxAmt  = (pc.pretaxCustom  || []).reduce((s, i) => s + (i.amount || 0), 0);
        const customPostTaxAmt = (pc.postTaxCustom || []).reduce((s, i) => s + (i.amount || 0), 0);

        // Section 125 (reduces FICA wages AND AGI): health premiums + HSA + custom pre-tax
        const annualHP = ((pc.medical||0) + (pc.dental||0) + (pc.vision||0)
                          + (pc.hsa||0) + customPreTaxAmt) * ppy;

        const result = Tax.computeAll({
            grossIncome:     (pc.grossPaycheck || 0) * ppy,
            filingStatus:    pc.filingStatus || 'single',
            state,           localRate,
            healthPremiums:  annualHP,
            contrib401k:     (pc.contrib401k || 0) * ppy,
            contribIRA:      0,  contribHSA: 0,
            deductionMethod: 'standard-2025',
            ltcg: 0, seIncome: 0, otherIncome: 0,
        });

        const federalTax   = result.federal.tax / ppy;
        const ssTax        = result.fica.ssTax / ppy;
        const medicareTax  = result.fica.medicareTax / ppy;
        const addlMedicare = result.fica.addlMedicare / ppy;
        const stateTax     = result.stateLocal.stateTax / ppy;
        const localTax     = result.stateLocal.localTax / ppy;
        const totalTaxes   = federalTax + ssTax + medicareTax + addlMedicare + stateTax + localTax;

        const preTaxTotal  = (pc.medical||0) + (pc.dental||0) + (pc.vision||0)
                           + (pc.hsa||0) + (pc.contrib401k||0) + customPreTaxAmt;
        const postTaxTotal = (pc.roth401k||0) + (pc.lifeInsurance||0) + customPostTaxAmt;

        const gross    = pc.grossPaycheck || 0;
        const netCheck = Math.max(0, gross - preTaxTotal - totalTaxes - postTaxTotal);

        return {
            ppy, resolvedState: state, localRate,
            federalTax, ssTax, medicareTax, addlMedicare, stateTax, localTax, totalTaxes,
            preTaxTotal, customPreTaxAmt, postTaxTotal, customPostTaxAmt,
            netCheck,
            netMonthly:   netCheck * ppy / 12,
            netAnnual:    netCheck * ppy,
            preTaxPct:    gross > 0 ? preTaxTotal  / gross * 100 : 0,
            taxPct:       gross > 0 ? totalTaxes   / gross * 100 : 0,
            postTaxPct:   gross > 0 ? postTaxTotal / gross * 100 : 0,
            netPct:       gross > 0 ? netCheck     / gross * 100 : 0,
            marginalRate:  result.federal.marginalRate,
            effectiveRate: result.effectiveTotal,
            overDeducted:  (preTaxTotal + totalTaxes + postTaxTotal) > gross,
        };
    }

    // ── RENDER ───────────────────────────────

    function render() {
        const el = document.getElementById('page-paycheck');
        if (!el) return;

        const s = getState();
        // Clamp active tab
        if (_tab >= s.paychecks.length) _tab = Math.max(0, s.paychecks.length - 1);

        el.innerHTML = buildPage(s);
        CurrencyInput.applyAll();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── PAGE BUILDER ─────────────────────────

    function buildPage(s) {
        if (s.paychecks.length === 0) return buildEmpty();

        const showCombined = s.paychecks.length > 1 && _tab === -1;
        const pc = _tab >= 0 ? s.paychecks[_tab] : null;
        const r  = (pc && pc.grossPaycheck > 0 && typeof Tax !== 'undefined')
            ? computePaycheck(pc, s.useTaxPage) : null;

        return [
            buildHeader(s, pc, r),
            buildTabBar(s),
            showCombined
                ? buildCombinedView(s)
                : buildSingleView(s, pc, r),
        ].join('');
    }

    function buildEmpty() {
        return `
        <div class="page-header">
            <h2>Paycheck Breakdown</h2>
            <p>Visualize gross pay → deductions → taxes → net take-home</p>
        </div>
        <div class="card" style="text-align:center; padding:56px 32px;">
            <i data-lucide="banknote" class="empty-state-icon"></i>
            <div style="font-family:var(--font-serif); font-size:1.4rem; color:var(--text); margin-bottom:10px;">
                No paychecks configured yet
            </div>
            <div style="font-size:0.88rem; color:var(--text-muted); margin-bottom:24px; line-height:1.6; max-width:360px; margin-left:auto; margin-right:auto;">
                Add your paycheck to see a breakdown from gross pay to what actually hits your account.
            </div>
            <button class="btn btn-primary" onclick="Paycheck.addPaycheck()">+ Add My Paycheck</button>
        </div>`;
    }

    function buildHeader(s, pc, r) {
        let sub = 'Gross pay → pre-tax deductions → taxes → post-tax deductions → net take-home';
        if (r && pc) sub = `${FREQ_LABEL[pc.payFrequency] || 'Bi-Weekly'} · ${fmt(pc.grossPaycheck)} gross · ${fmt(r.netCheck)} net`;
        if (_tab === -1 && s.paychecks.length > 1) {
            const totals = combinedTotals(s);
            sub = `${s.paychecks.length} paychecks · ${fmt(totals.grossTotal)} gross · ${fmt(totals.netTotal)} combined net`;
        }
        return `
        <div class="page-header">
            <h2>Paycheck Breakdown</h2>
            <p>${sub}</p>
        </div>`;
    }

    function buildTabBar(s) {
        const tabs = s.paychecks.map((pc, i) => `
            <div class="tab${_tab === i ? ' active' : ''}" onclick="Paycheck.switchTab(${i})"
                 style="display:flex; align-items:center; gap:8px;">
                <span>${pc.name || ('Paycheck ' + (i + 1))}</span>
                ${s.paychecks.length > 1 ? `
                <button class="delete-row-btn" style="font-size:0.72rem; padding:1px 4px;"
                        onclick="event.stopPropagation(); Paycheck.deletePaycheck('${pc.id}')"
                        title="Remove paycheck">✕</button>` : ''}
            </div>`).join('');

        const combinedTab = s.paychecks.length > 1 ? `
            <div class="tab${_tab === -1 ? ' active' : ''}" onclick="Paycheck.switchTab(-1)">
                Combined
            </div>` : '';

        return `
        <div class="tab-bar" style="margin-bottom:16px;">
            ${tabs}
            ${combinedTab}
            <div class="tab" onclick="Paycheck.addPaycheck()"
                 style="color:var(--accent); cursor:pointer;">+ Add</div>
        </div>`;
    }

    function buildSingleView(s, pc, r) {
        return `
        ${r ? buildSummaryCards(pc, r) : ''}
        <div class="grid-2" style="margin-bottom:16px;">
            ${buildForm(s, pc)}
            <div>
                ${r ? buildWaterfallCard(pc, r) : buildEmptyRight()}
                ${r ? buildDepositsCard(pc, r) : ''}
            </div>
        </div>
        ${r ? buildTakeHomeCard(pc, r) : ''}`;
    }

    // ── SUMMARY CARDS ────────────────────────

    function buildSummaryCards(pc, r) {
        const netCls = r.overDeducted ? 'value-red' : 'value-green';
        return `
        <div class="summary-grid" style="grid-template-columns:repeat(4,1fr); margin-bottom:16px;">
            <div class="summary-card">
                <div class="label">Gross Per Check</div>
                <div class="value value-accent">${fmt(pc.grossPaycheck)}</div>
                <div class="sub">${FREQ_LABEL[pc.payFrequency] || ''} · ${r.ppy}×/yr</div>
            </div>
            <div class="summary-card">
                <div class="label">Pre-Tax Deductions</div>
                <div class="value value-red">${fmt(r.preTaxTotal)}</div>
                <div class="sub">${r.preTaxPct.toFixed(1)}% of gross</div>
            </div>
            <div class="summary-card">
                <div class="label">Tax Withholding</div>
                <div class="value value-red">${fmt(r.totalTaxes)}</div>
                <div class="sub">${r.taxPct.toFixed(1)}% · eff. ${(r.effectiveRate * 100).toFixed(1)}%</div>
            </div>
            <div class="summary-card">
                <div class="label">Net Take-Home</div>
                <div class="value ${netCls}">${fmt(r.netCheck)}</div>
                <div class="sub">${r.netPct.toFixed(1)}% of gross</div>
            </div>
        </div>`;
    }

    // ── FORM ─────────────────────────────────

    function buildForm(s, pc) {
        if (!pc) return '<div class="card"></div>';

        const taxData  = Data.get('tax') || {};
        const showManual = !s.useTaxPage;
        const taxStateNote = s.useTaxPage
            ? (taxData.state
                ? `<span style="font-family:var(--font-mono); font-size:0.74rem; color:var(--text-muted); margin-left:6px;">· ${taxData.state}</span>`
                : `<span style="font-size:0.74rem; color:var(--text-faint); margin-left:6px;">· Tax page has no state set</span>`)
            : '';

        const stateOpts = STATES.map(([c, n]) =>
            `<option value="${c}" ${pc.state === c ? 'selected' : ''}>${n}</option>`).join('');

        // Custom pre-tax rows
        const pretaxCustomRows = (pc.pretaxCustom || []).map(item => `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; padding:6px 10px;
                        background:var(--surface2); border-radius:var(--radius);">
                <span style="flex:1; font-size:0.84rem; color:var(--text);">${item.name}</span>
                <span style="font-family:var(--font-mono); font-size:0.82rem; color:var(--text-muted);">${fmt(item.amount)}/check</span>
                <button class="delete-row-btn"
                        onclick="Paycheck.removePreTaxItem('${item.id}')"
                        title="Remove">✕</button>
            </div>`).join('');

        // Custom post-tax rows
        const postTaxCustomRows = (pc.postTaxCustom || []).map(item => `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; padding:6px 10px;
                        background:var(--surface2); border-radius:var(--radius);">
                <span style="flex:1; font-size:0.84rem; color:var(--text);">${item.name}</span>
                <span style="font-family:var(--font-mono); font-size:0.82rem; color:var(--text-muted);">${fmt(item.amount)}/check</span>
                <button class="delete-row-btn"
                        onclick="Paycheck.removePostTaxItem('${item.id}')"
                        title="Remove">✕</button>
            </div>`).join('');

        return `
        <div class="card">
            <!-- Paycheck name -->
            <div class="form-row" style="margin-bottom:12px;">
                <div class="form-group">
                    <label>Paycheck Label</label>
                    <input type="text" id="pc-name" value="${pc.name || ''}" placeholder="e.g. My Paycheck, Jane's Paycheck">
                </div>
            </div>

            <div style="${sectionLabelStyle()}">Paycheck Setup</div>
            <div class="form-row">
                <div class="form-group">
                    <label>Gross Pay Per Check</label>
                    <input type="text" inputmode="decimal" data-fmt="currency"
                           id="pc-gross" value="${pc.grossPaycheck || ''}" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label>Pay Frequency</label>
                    <select id="pc-frequency">
                        <option value="weekly"      ${pc.payFrequency === 'weekly'      ? 'selected' : ''}>Weekly (52×/yr)</option>
                        <option value="biweekly"    ${pc.payFrequency === 'biweekly'    ? 'selected' : ''}>Bi-Weekly (26×/yr)</option>
                        <option value="semimonthly" ${pc.payFrequency === 'semimonthly' ? 'selected' : ''}>Semi-Monthly (24×/yr)</option>
                        <option value="monthly"     ${pc.payFrequency === 'monthly'     ? 'selected' : ''}>Monthly (12×/yr)</option>
                    </select>
                </div>
            </div>
            <div class="form-row" style="margin-bottom:20px;">
                <div class="form-group" style="max-width:50%;">
                    <label>Filing Status</label>
                    <select id="pc-filing">
                        <option value="single"  ${pc.filingStatus === 'single'  ? 'selected' : ''}>Single</option>
                        <option value="married" ${pc.filingStatus === 'married' ? 'selected' : ''}>Married Filing Jointly</option>
                        <option value="head"    ${pc.filingStatus === 'head'    ? 'selected' : ''}>Head of Household</option>
                    </select>
                </div>
            </div>

            <div style="${sectionLabelStyle()}">Pre-Tax Deductions <span style="text-transform:none; letter-spacing:0; font-size:0.69rem;">(per paycheck)</span></div>
            <div class="form-row">
                <div class="form-group">
                    <label>Medical / Health Premium</label>
                    <input type="text" inputmode="decimal" data-fmt="currency"
                           id="pc-medical" value="${pc.medical || ''}" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label>Dental Premium</label>
                    <input type="text" inputmode="decimal" data-fmt="currency"
                           id="pc-dental" value="${pc.dental || ''}" placeholder="0.00">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Vision Premium</label>
                    <input type="text" inputmode="decimal" data-fmt="currency"
                           id="pc-vision" value="${pc.vision || ''}" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label>HSA (via payroll)</label>
                    <input type="text" inputmode="decimal" data-fmt="currency"
                           id="pc-hsa" value="${pc.hsa || ''}" placeholder="0.00">
                </div>
            </div>
            <div class="form-row" style="margin-bottom:12px;">
                <div class="form-group" style="max-width:50%;">
                    <label>401(k) Traditional</label>
                    <input type="text" inputmode="decimal" data-fmt="currency"
                           id="pc-401k" value="${pc.contrib401k || ''}" placeholder="0.00">
                </div>
            </div>

            <!-- Custom pre-tax items -->
            ${pretaxCustomRows}
            <div id="pc-pretax-add-form" style="display:none; margin-bottom:10px; padding:10px;
                 background:var(--surface2); border-radius:var(--radius);">
                <div class="form-row" style="margin-bottom:8px;">
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" id="pc-pretax-add-name" placeholder="e.g. FSA, Commuter">
                    </div>
                    <div class="form-group">
                        <label>Per Paycheck</label>
                        <input type="text" inputmode="decimal" data-fmt="currency"
                               id="pc-pretax-add-amount" placeholder="0.00">
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-primary" style="font-size:0.78rem; padding:5px 12px;"
                            onclick="Paycheck.addPreTaxItem()">Add</button>
                    <button class="btn btn-ghost" style="font-size:0.78rem; padding:5px 12px;"
                            onclick="Paycheck.toggleAddPreTax()">Cancel</button>
                </div>
            </div>
            <button class="btn btn-ghost" style="font-size:0.76rem; padding:5px 12px; margin-bottom:20px;"
                    onclick="Paycheck.toggleAddPreTax()">+ Custom pre-tax item</button>

            <div style="${sectionLabelStyle()}">Post-Tax: Retirement <span style="text-transform:none; letter-spacing:0; font-size:0.69rem;">(per paycheck)</span></div>
            <div class="form-row" style="margin-bottom:20px;">
                <div class="form-group" style="max-width:50%;">
                    <label>Roth 401(k)</label>
                    <input type="text" inputmode="decimal" data-fmt="currency"
                           id="pc-roth401k" value="${pc.roth401k || ''}" placeholder="0.00">
                </div>
            </div>

            <div style="${sectionLabelStyle()}">Post-Tax: Other <span style="text-transform:none; letter-spacing:0; font-size:0.69rem;">(per paycheck)</span></div>
            <div class="form-row" style="margin-bottom:12px;">
                <div class="form-group" style="max-width:50%;">
                    <label>Life Insurance</label>
                    <input type="text" inputmode="decimal" data-fmt="currency"
                           id="pc-life" value="${pc.lifeInsurance || ''}" placeholder="0.00">
                </div>
            </div>

            <!-- Custom post-tax items -->
            ${postTaxCustomRows}
            <div id="pc-posttax-add-form" style="display:none; margin-bottom:10px; padding:10px;
                 background:var(--surface2); border-radius:var(--radius);">
                <div class="form-row" style="margin-bottom:8px;">
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" id="pc-posttax-add-name" placeholder="e.g. Savings, 529 Plan">
                    </div>
                    <div class="form-group">
                        <label>Per Paycheck</label>
                        <input type="text" inputmode="decimal" data-fmt="currency"
                               id="pc-posttax-add-amount" placeholder="0.00">
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-primary" style="font-size:0.78rem; padding:5px 12px;"
                            onclick="Paycheck.addPostTaxItem()">Add</button>
                    <button class="btn btn-ghost" style="font-size:0.78rem; padding:5px 12px;"
                            onclick="Paycheck.toggleAddPostTax()">Cancel</button>
                </div>
            </div>
            <button class="btn btn-ghost" style="font-size:0.76rem; padding:5px 12px; margin-bottom:20px;"
                    onclick="Paycheck.toggleAddPostTax()">+ Custom post-tax item</button>

            <div style="${sectionLabelStyle()}">Tax Settings</div>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;
                        padding:10px 12px; background:var(--surface2); border-radius:var(--radius);">
                <input type="checkbox" id="pc-use-tax" ${s.useTaxPage ? 'checked' : ''}
                       onchange="Paycheck.toggleTaxSource()"
                       style="width:16px; height:16px; cursor:pointer; accent-color:var(--accent); flex-shrink:0;">
                <label for="pc-use-tax" style="font-size:0.84rem; cursor:pointer; margin:0; line-height:1.4;">
                    Pull state &amp; local rates from Tax page${taxStateNote}
                </label>
            </div>
            <div id="pc-manual-tax" style="display:${showManual ? 'block' : 'none'};">
                <div class="form-row" style="margin-bottom:16px;">
                    <div class="form-group">
                        <label>State</label>
                        <select id="pc-state">${stateOpts}</select>
                    </div>
                    <div class="form-group">
                        <label>Local Tax Rate (%)</label>
                        <input type="number" id="pc-local-rate"
                               value="${pc.localRate || ''}" placeholder="0.00" min="0" step="0.01">
                    </div>
                </div>
            </div>

            <div style="display:flex; gap:10px; margin-top:8px;">
                <button class="btn btn-primary" onclick="Paycheck.calculate()">Calculate</button>
                <button class="btn btn-ghost"   onclick="Paycheck.reset()">Reset</button>
            </div>
        </div>`;
    }

    function sectionLabelStyle() {
        return 'font-size:0.69rem; font-family:var(--font-mono); text-transform:uppercase; ' +
               'letter-spacing:0.1em; color:var(--text-faint); margin-bottom:10px;';
    }

    // ── WATERFALL ────────────────────────────

    function buildWaterfallCard(pc, r) {
        function wfSection(label) {
            return `<tr><td colspan="2" style="padding:14px 0 4px; font-size:0.69rem;
                font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.08em;
                color:var(--text-faint);">${label}</td></tr>`;
        }
        function wfRow(label, amount) {
            return `<tr>
                <td style="padding:5px 0 5px 10px; font-size:0.84rem; color:var(--text-muted);">
                    <span style="font-family:var(--font-mono); color:var(--red); margin-right:6px;">−</span>${label}
                </td>
                <td style="padding:5px 0; text-align:right; font-family:var(--font-mono);
                           font-size:0.84rem; color:var(--red);">${fmt(amount)}</td>
            </tr>`;
        }
        function wfSubtotal(label, amount) {
            return `<tr style="border-top:1px solid var(--border);">
                <td style="padding:8px 0; font-size:0.85rem; font-weight:600; color:var(--text);">${label}</td>
                <td style="padding:8px 0; text-align:right; font-family:var(--font-mono);
                           font-size:0.85rem; font-weight:600; color:var(--text);">${fmt(amount)}</td>
            </tr>`;
        }

        const hasMedical  = (pc.medical     || 0) > 0;
        const hasDental   = (pc.dental      || 0) > 0;
        const hasVision   = (pc.vision      || 0) > 0;
        const hasHSA      = (pc.hsa         || 0) > 0;
        const has401k     = (pc.contrib401k || 0) > 0;
        const hasRoth401k = (pc.roth401k    || 0) > 0;
        const hasLife     = (pc.lifeInsurance || 0) > 0;
        const hasPreCustom  = (pc.pretaxCustom  || []).some(i => i.amount > 0);
        const hasPostCustom = (pc.postTaxCustom || []).some(i => i.amount > 0);
        const hasPreTax  = hasMedical || hasDental || hasVision || hasHSA || has401k || hasPreCustom;
        const hasPostTax = hasRoth401k || hasLife || hasPostCustom;

        const stateLabel = r.resolvedState ? `State Tax (${r.resolvedState})` : 'State Tax';
        const afterPreTax = (pc.grossPaycheck || 0) - r.preTaxTotal;
        const afterTax    = afterPreTax - r.totalTaxes;
        const netColor    = r.overDeducted ? 'var(--red)' : 'var(--green)';

        const pretaxCustomRows = (pc.pretaxCustom || [])
            .filter(i => (i.amount || 0) > 0)
            .map(i => wfRow(i.name, i.amount)).join('');

        const postTaxCustomRows = (pc.postTaxCustom || [])
            .filter(i => (i.amount || 0) > 0)
            .map(i => wfRow(i.name, i.amount)).join('');

        return `
        <div class="card">
            <div class="card-title" style="margin-bottom:4px;">Paycheck Waterfall</div>
            <div style="font-size:0.74rem; color:var(--text-muted); margin-bottom:16px;">
                ${FREQ_LABEL[pc.payFrequency] || 'Bi-Weekly'} · 2025 brackets + standard deduction
            </div>
            <table style="width:100%; border-collapse:collapse;"><tbody>
                <tr>
                    <td style="padding:6px 0; font-size:0.9rem; font-weight:600; color:var(--text);">Gross Pay</td>
                    <td style="padding:6px 0; text-align:right; font-family:var(--font-mono);
                               font-size:0.9rem; font-weight:600; color:var(--text);">${fmt(pc.grossPaycheck)}</td>
                </tr>

                ${hasPreTax ? [
                    wfSection('Pre-Tax Deductions'),
                    hasMedical  ? wfRow('Medical / Health Premium', pc.medical)     : '',
                    hasDental   ? wfRow('Dental Premium',           pc.dental)      : '',
                    hasVision   ? wfRow('Vision Premium',           pc.vision)      : '',
                    hasHSA      ? wfRow('HSA (via payroll)',         pc.hsa)         : '',
                    has401k     ? wfRow('401(k) Traditional',        pc.contrib401k) : '',
                    pretaxCustomRows,
                    wfSubtotal('After Pre-Tax', afterPreTax),
                ].join('') : ''}

                ${wfSection('Tax Withholding (Est.)')}
                ${wfRow('Federal Income Tax',      r.federalTax)}
                ${wfRow('Social Security (6.2%)',  r.ssTax)}
                ${wfRow('Medicare (1.45%)',         r.medicareTax)}
                ${r.addlMedicare > 0 ? wfRow('Additional Medicare (0.9%)', r.addlMedicare) : ''}
                ${r.stateTax > 0 ? wfRow(stateLabel, r.stateTax) : ''}
                ${r.localTax  > 0 ? wfRow('Local Tax',             r.localTax)  : ''}
                ${wfSubtotal('After-Tax Pay', afterTax)}

                ${hasPostTax ? [
                    wfSection('Post-Tax: Retirement'),
                    hasRoth401k ? wfRow('Roth 401(k)',  pc.roth401k)     : '',
                    (hasLife || hasPostCustom) ? wfSection('Post-Tax: Other') : '',
                    hasLife     ? wfRow('Life Insurance', pc.lifeInsurance): '',
                    postTaxCustomRows,
                ].join('') : ''}

                <tr style="border-top:2px solid var(--accent);">
                    <td style="padding:12px 0 4px; font-size:0.92rem; font-weight:700; color:${netColor};">
                        Net Take-Home
                    </td>
                    <td style="padding:12px 0 4px; text-align:right; font-family:var(--font-serif);
                               font-size:1.3rem; font-weight:700; color:${netColor};">
                        ${fmt(r.netCheck)}
                    </td>
                </tr>
                ${r.overDeducted ? `<tr><td colspan="2" style="padding-bottom:6px;">
                    <span style="color:var(--red); font-size:0.74rem;">
                        ⚠ Deductions exceed gross pay — check your entries
                    </span></td></tr>` : ''}
            </tbody></table>
        </div>`;
    }

    function buildEmptyRight() {
        return `
        <div class="card" style="display:flex; flex-direction:column; align-items:center;
                                 justify-content:center; padding:40px 24px; text-align:center; gap:12px;">
            <i data-lucide="banknote" class="empty-state-icon"></i>
            <div style="font-size:0.88rem; color:var(--text-muted); line-height:1.6; max-width:260px;">
                Fill in your gross pay and click <strong>Calculate</strong> to see your breakdown.
            </div>
        </div>`;
    }

    // ── TAKE-HOME CARD ───────────────────────

    function buildTakeHomeCard(pc, r) {
        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Take-Home Summary</span>
                <button class="btn btn-ghost" style="font-size:0.78rem; padding:6px 14px;"
                        onclick="Paycheck.addToBudget()">+ Add to Budget</button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:0;
                        border:1px solid var(--border); border-radius:var(--radius);
                        overflow:hidden; margin-top:12px;">
                <div style="padding:16px 20px; border-right:1px solid var(--border);">
                    <div style="${statLabelStyle()}">Per Paycheck</div>
                    <div style="font-family:var(--font-serif); font-size:1.6rem; font-weight:600; color:var(--green);">${fmt(r.netCheck)}</div>
                    <div style="font-size:0.74rem; color:var(--text-muted); margin-top:3px;">${FREQ_LABEL[pc.payFrequency]}</div>
                </div>
                <div style="padding:16px 20px; border-right:1px solid var(--border);">
                    <div style="${statLabelStyle()}">Monthly</div>
                    <div style="font-family:var(--font-serif); font-size:1.6rem; font-weight:600; color:var(--green);">${fmt(r.netMonthly)}</div>
                    <div style="font-size:0.74rem; color:var(--text-muted); margin-top:3px;">${r.ppy}× per year ÷ 12</div>
                </div>
                <div style="padding:16px 20px;">
                    <div style="${statLabelStyle()}">Annual</div>
                    <div style="font-family:var(--font-serif); font-size:1.6rem; font-weight:600; color:var(--green);">${fmt(r.netAnnual)}</div>
                    <div style="font-size:0.74rem; color:var(--text-muted); margin-top:3px;">${r.ppy}× per year</div>
                </div>
            </div>
            <div style="margin-top:12px; font-size:0.76rem; color:var(--text-muted); display:flex; gap:20px; flex-wrap:wrap;">
                <span><span style="color:var(--text-faint);">Eff. tax rate: </span>
                      <span style="font-family:var(--font-mono); color:var(--accent);">${(r.effectiveRate * 100).toFixed(1)}%</span></span>
                <span><span style="color:var(--text-faint);">Marginal rate: </span>
                      <span style="font-family:var(--font-mono);">${(r.marginalRate * 100).toFixed(0)}%</span></span>
                <span><span style="color:var(--text-faint);">Post-tax deductions: </span>
                      <span style="font-family:var(--font-mono);">${fmt(r.postTaxTotal)}</span></span>
            </div>
        </div>`;
    }

    function statLabelStyle() {
        return 'font-size:0.69rem; font-family:var(--font-mono); text-transform:uppercase; ' +
               'letter-spacing:0.08em; color:var(--text-muted); margin-bottom:5px;';
    }

    // ── COMBINED VIEW ─────────────────────────

    function combinedTotals(s) {
        let grossTotal = 0, preTaxTotal = 0, taxTotal = 0, postTaxTotal = 0, netTotal = 0;
        const rows = s.paychecks.map(pc => {
            if (!pc.grossPaycheck || typeof Tax === 'undefined') {
                return { pc, r: null };
            }
            try {
                const r = computePaycheck(pc, s.useTaxPage);
                grossTotal   += pc.grossPaycheck;
                preTaxTotal  += r.preTaxTotal;
                taxTotal     += r.totalTaxes;
                postTaxTotal += r.postTaxTotal;
                netTotal     += r.netCheck;
                return { pc, r };
            } catch (e) {
                return { pc, r: null };
            }
        });
        return { rows, grossTotal, preTaxTotal, taxTotal, postTaxTotal, netTotal };
    }

    function buildCombinedView(s) {
        const { rows, grossTotal, preTaxTotal, taxTotal, postTaxTotal, netTotal } = combinedTotals(s);

        const pcRows = rows.map(({ pc, r }) => {
            if (!r) return `
                <tr>
                    <td style="padding:8px 12px; font-size:0.84rem; color:var(--text);">${pc.name || 'Paycheck'}</td>
                    <td colspan="5" style="padding:8px; text-align:center; font-size:0.78rem; color:var(--text-faint);">Enter gross pay to calculate</td>
                </tr>`;
            return `
                <tr style="border-top:1px solid var(--border);">
                    <td style="padding:10px 12px; font-size:0.84rem; color:var(--text);">${pc.name || 'Paycheck'}</td>
                    <td style="padding:10px 8px; text-align:right; font-family:var(--font-mono); font-size:0.82rem;">${fmt(pc.grossPaycheck)}</td>
                    <td style="padding:10px 8px; text-align:right; font-family:var(--font-mono); font-size:0.82rem; color:var(--red);">(${fmt(r.preTaxTotal)})</td>
                    <td style="padding:10px 8px; text-align:right; font-family:var(--font-mono); font-size:0.82rem; color:var(--red);">(${fmt(r.totalTaxes)})</td>
                    <td style="padding:10px 8px; text-align:right; font-family:var(--font-mono); font-size:0.82rem; color:var(--red);">(${fmt(r.postTaxTotal)})</td>
                    <td style="padding:10px 12px; text-align:right; font-family:var(--font-mono); font-size:0.82rem; font-weight:600; color:var(--green);">${fmt(r.netCheck)}</td>
                </tr>`;
        }).join('');

        // Net monthly and annual for combined
        const combinedMonthly = rows.reduce((sum, { pc, r }) => {
            if (!r) return sum;
            const ppy = PPY[pc.payFrequency] || 26;
            return sum + r.netCheck * ppy / 12;
        }, 0);
        const combinedAnnual = rows.reduce((sum, { pc, r }) => {
            if (!r) return sum;
            const ppy = PPY[pc.payFrequency] || 26;
            return sum + r.netCheck * ppy;
        }, 0);

        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Household Paycheck Summary</span>
            </div>
            <div class="table-wrap" style="margin-top:12px;">
                <table>
                    <thead>
                        <tr>
                            <th>Paycheck</th>
                            <th style="text-align:right;">Gross/Check</th>
                            <th style="text-align:right;">Pre-Tax</th>
                            <th style="text-align:right;">Taxes</th>
                            <th style="text-align:right;">Post-Tax</th>
                            <th style="text-align:right;">Net/Check</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pcRows}
                        <tr style="border-top:2px solid var(--accent); background:var(--surface2);">
                            <td style="padding:10px 12px; font-weight:600; font-size:0.84rem;">Total</td>
                            <td style="padding:10px 8px; text-align:right; font-family:var(--font-mono); font-size:0.82rem; font-weight:600;">${fmt(grossTotal)}</td>
                            <td style="padding:10px 8px; text-align:right; font-family:var(--font-mono); font-size:0.82rem; font-weight:600; color:var(--red);">(${fmt(preTaxTotal)})</td>
                            <td style="padding:10px 8px; text-align:right; font-family:var(--font-mono); font-size:0.82rem; font-weight:600; color:var(--red);">(${fmt(taxTotal)})</td>
                            <td style="padding:10px 8px; text-align:right; font-family:var(--font-mono); font-size:0.82rem; font-weight:600; color:var(--red);">(${fmt(postTaxTotal)})</td>
                            <td style="padding:10px 12px; text-align:right; font-family:var(--font-mono); font-size:0.82rem; font-weight:600; color:var(--green);">${fmt(netTotal)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Household Take-Home</span>
                <button class="btn btn-ghost" style="font-size:0.78rem; padding:6px 14px;"
                        onclick="Paycheck.addToBudget('combined')">+ Add Combined to Budget</button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:0;
                        border:1px solid var(--border); border-radius:var(--radius);
                        overflow:hidden; margin-top:12px;">
                <div style="padding:20px 24px; border-right:1px solid var(--border);">
                    <div style="${statLabelStyle()}">Monthly (Combined)</div>
                    <div style="font-family:var(--font-serif); font-size:2rem; font-weight:600; color:var(--green);">
                        ${fmt(combinedMonthly)}
                    </div>
                    <div style="font-size:0.74rem; color:var(--text-muted); margin-top:4px;">household take-home per month</div>
                </div>
                <div style="padding:20px 24px;">
                    <div style="${statLabelStyle()}">Annual (Combined)</div>
                    <div style="font-family:var(--font-serif); font-size:2rem; font-weight:600; color:var(--green);">
                        ${fmt(combinedAnnual)}
                    </div>
                    <div style="font-size:0.74rem; color:var(--text-muted); margin-top:4px;">household take-home per year</div>
                </div>
            </div>
        </div>`;
    }

    // ── DIRECT DEPOSIT CARD ──────────────────

    function buildDepositsCard(pc, r) {
        const deposits     = pc.deposits || [];
        const net          = r.netCheck;
        const hasRemainder = deposits.some(d => d.type === 'remainder');

        function resolveAmt(d) {
            if (d.type === 'fixed')     return d.amount || 0;
            if (d.type === 'percent')   return Math.max(0, (d.amount || 0) / 100 * net);
            if (d.type === 'remainder') {
                const fixed  = deposits.filter(x => x.type === 'fixed').reduce((s, x) => s + (x.amount || 0), 0);
                const pctAmt = deposits.filter(x => x.type === 'percent').reduce((s, x) => s + (x.amount || 0) / 100 * net, 0);
                return Math.max(0, net - fixed - pctAmt);
            }
            return 0;
        }

        const fixedSum  = deposits.filter(d => d.type === 'fixed').reduce((s, d) => s + (d.amount || 0), 0);
        const pctSum    = deposits.filter(d => d.type === 'percent').reduce((s, d) => s + (d.amount || 0) / 100 * net, 0);
        const unalloc   = Math.max(0, net - fixedSum - pctSum);
        const overLimit = (fixedSum + pctSum) > net + 0.01;

        const inlineStyle = 'width:100%; padding:5px 8px; background:var(--surface); ' +
                            'border:1px solid var(--border); border-radius:4px; ' +
                            'color:var(--text); font-size:0.82rem;';

        const rows = deposits.map(d => {
            if (d.id === _editingDepositId) {
                // Remainder option: allow if this entry IS a remainder, or no OTHER entry is
                const otherHasRemainder = deposits.some(x => x.id !== d.id && x.type === 'remainder');
                const showRemainder     = !otherHasRemainder;
                const editAmtVal  = d.type === 'fixed'   ? (d.amount || '') : d.type === 'percent' ? (d.amount || '') : '';
                const editAmtFmt  = d.type === 'fixed'   ? 'data-fmt="currency"' : '';
                const editAmtHide = d.type === 'remainder' ? 'display:none;' : '';
                const editAmtLbl  = d.type === 'percent' ? '% of Net' : 'Per Check';
                return `
                <tr style="border-top:1px solid var(--border); background:var(--surface2);">
                    <td colspan="6" style="padding:8px 12px;">
                        <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap;">
                            <div style="flex:2; min-width:130px;">
                                <div style="font-size:0.69rem; color:var(--text-faint); margin-bottom:3px; text-transform:uppercase; letter-spacing:0.06em;">Account</div>
                                <input type="text" id="pc-deposit-edit-name" value="${d.name}"
                                       style="${inlineStyle}">
                            </div>
                            <div style="flex:1; min-width:110px;">
                                <div style="font-size:0.69rem; color:var(--text-faint); margin-bottom:3px; text-transform:uppercase; letter-spacing:0.06em;">Type</div>
                                <select id="pc-deposit-edit-type" onchange="Paycheck.toggleDepositEditType()"
                                        style="${inlineStyle}">
                                    <option value="fixed"     ${d.type === 'fixed'     ? 'selected' : ''}>Fixed Amount</option>
                                    <option value="percent"   ${d.type === 'percent'   ? 'selected' : ''}>% of Net</option>
                                    ${showRemainder ? `<option value="remainder" ${d.type === 'remainder' ? 'selected' : ''}>Remainder</option>` : ''}
                                </select>
                            </div>
                            <div id="pc-deposit-edit-amount-wrap" style="flex:1; min-width:90px; ${editAmtHide}">
                                <div id="pc-deposit-edit-amount-label" style="font-size:0.69rem; color:var(--text-faint); margin-bottom:3px; text-transform:uppercase; letter-spacing:0.06em;">${editAmtLbl}</div>
                                <input type="text" inputmode="decimal" ${editAmtFmt}
                                       id="pc-deposit-edit-amount" value="${editAmtVal}"
                                       placeholder="0.00" style="${inlineStyle}">
                            </div>
                            <div style="display:flex; gap:6px; padding-bottom:1px;">
                                <button class="btn btn-primary" style="font-size:0.76rem; padding:5px 12px;"
                                        onclick="Paycheck.saveDepositEdit('${d.id}')">Save</button>
                                <button class="btn btn-ghost" style="font-size:0.76rem; padding:5px 12px;"
                                        onclick="Paycheck.cancelDepositEdit()">Cancel</button>
                            </div>
                        </div>
                    </td>
                </tr>`;
            }

            const amt = resolveAmt(d);
            const pct = net > 0 ? amt / net * 100 : 0;
            const typeTag = d.type === 'fixed' ? 'Fixed' : d.type === 'percent' ? d.amount + '%' : 'Remainder';
            return `
            <tr id="dep-row-${d.id}" draggable="true"
                ondragstart="Paycheck._dragStart(event,'${d.id}')"
                ondragover="Paycheck._dragOver(event,'${d.id}')"
                ondragleave="Paycheck._dragLeave('${d.id}')"
                ondrop="Paycheck._drop('${d.id}')"
                ondragend="Paycheck._dragEnd()"
                style="border-top:1px solid var(--border);">
                <td style="padding:9px 4px 9px 10px; color:var(--text-faint); cursor:grab;
                           font-size:0.8rem; user-select:none;" title="Drag to reorder">⠿</td>
                <td style="padding:9px 12px; font-size:0.84rem; color:var(--text);">${d.name}</td>
                <td style="padding:9px 8px; font-size:0.74rem; font-family:var(--font-mono); color:var(--text-muted); white-space:nowrap;">${typeTag}</td>
                <td style="padding:9px 8px; text-align:right; font-family:var(--font-mono); font-size:0.84rem; color:var(--green);">${fmt(amt)}</td>
                <td style="padding:9px 8px; text-align:right; font-family:var(--font-mono); font-size:0.74rem; color:var(--text-muted);">${pct.toFixed(1)}%</td>
                <td style="padding:9px 10px; text-align:right; white-space:nowrap;">
                    <button class="edit-row-btn"
                            onclick="Paycheck.editDeposit('${d.id}')"
                            title="Edit">✎</button>
                    <button class="delete-row-btn"
                            onclick="Paycheck.removeDeposit('${d.id}')"
                            title="Remove">✕</button>
                </td>
            </tr>`;
        }).join('');

        const unallocRow = (!hasRemainder && deposits.length > 0 && unalloc > 0.01) ? `
            <tr style="border-top:1px dashed var(--border);">
                <td></td>
                <td style="padding:8px 12px; font-size:0.8rem; color:var(--text-faint); font-style:italic;">Unallocated</td>
                <td style="padding:8px 8px; font-size:0.74rem; color:var(--text-faint);">—</td>
                <td style="padding:8px 8px; text-align:right; font-family:var(--font-mono); font-size:0.8rem; color:var(--text-faint);">${fmt(unalloc)}</td>
                <td style="padding:8px 8px; text-align:right; font-family:var(--font-mono); font-size:0.74rem; color:var(--text-faint);">${net > 0 ? (unalloc/net*100).toFixed(1) : 0}%</td>
                <td></td>
            </tr>` : '';

        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Direct Deposit Distribution</span>
                <span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">Net ${fmt(net)}</span>
            </div>

            ${deposits.length > 0 ? `
            <div class="table-wrap" style="margin-bottom:12px; margin-top:4px;">
                <table>
                    <thead>
                        <tr>
                            <th style="width:18px;"></th>
                            <th>Account / Destination</th>
                            <th>Type</th>
                            <th style="text-align:right;">Per Check</th>
                            <th style="text-align:right;">% of Net</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                        ${unallocRow}
                        ${overLimit ? `<tr><td colspan="6" style="padding:6px 12px;">
                            <span style="color:var(--red); font-size:0.74rem;">
                                ⚠ Fixed + percentage allocations exceed net take-home
                            </span></td></tr>` : ''}
                    </tbody>
                </table>
            </div>` : `
            <p style="font-size:0.84rem; color:var(--text-muted); margin:10px 0 14px; line-height:1.6;">
                Specify where your net take-home gets deposited — primary checking, savings, investment
                accounts, etc. Use <em>Remainder</em> for the account that gets whatever's left over.
            </p>`}

            <!-- Add destination form -->
            <div id="pc-deposit-add-form" style="display:none; margin-bottom:12px; padding:12px;
                 background:var(--surface2); border-radius:var(--radius);">
                <div class="form-row" style="margin-bottom:8px;">
                    <div class="form-group">
                        <label>Account / Destination</label>
                        <input type="text" id="pc-deposit-name" placeholder="e.g. Primary Checking, Emergency Fund">
                    </div>
                    <div class="form-group">
                        <label>Type</label>
                        <select id="pc-deposit-type" onchange="Paycheck.toggleDepositType()">
                            <option value="fixed">Fixed Amount</option>
                            <option value="percent">Percentage of Net</option>
                            ${!hasRemainder ? '<option value="remainder">Remainder (everything left)</option>' : ''}
                        </select>
                    </div>
                </div>
                <div id="pc-deposit-amount-wrap" class="form-row" style="margin-bottom:8px;">
                    <div class="form-group" style="max-width:50%;">
                        <label id="pc-deposit-amount-label">Amount Per Check</label>
                        <input type="text" inputmode="decimal" data-fmt="currency"
                               id="pc-deposit-amount" placeholder="0.00">
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-primary" style="font-size:0.78rem; padding:5px 12px;"
                            onclick="Paycheck.addDeposit()">Add</button>
                    <button class="btn btn-ghost" style="font-size:0.78rem; padding:5px 12px;"
                            onclick="Paycheck.toggleAddDeposit()">Cancel</button>
                </div>
            </div>

            <button class="btn btn-ghost" style="font-size:0.76rem; padding:5px 12px;"
                    onclick="Paycheck.toggleAddDeposit()">+ Add Destination</button>
        </div>`;
    }

    // ── READ FORM ─────────────────────────────

    function readFormIntoState(s) {
        const pc = s.paychecks[_tab];
        if (!pc) return;
        const el = id => document.getElementById(id);

        pc.name           = (el('pc-name')?.value || '').trim() || ('Paycheck ' + (_tab + 1));
        pc.grossPaycheck  = parseMoney(el('pc-gross')?.value    || 0);
        pc.payFrequency   = el('pc-frequency')?.value           || 'biweekly';
        pc.filingStatus   = el('pc-filing')?.value              || 'single';
        pc.medical        = parseMoney(el('pc-medical')?.value  || 0);
        pc.dental         = parseMoney(el('pc-dental')?.value   || 0);
        pc.vision         = parseMoney(el('pc-vision')?.value   || 0);
        pc.hsa            = parseMoney(el('pc-hsa')?.value      || 0);
        pc.contrib401k    = parseMoney(el('pc-401k')?.value     || 0);
        pc.roth401k       = parseMoney(el('pc-roth401k')?.value || 0);
        pc.lifeInsurance  = parseMoney(el('pc-life')?.value     || 0);

        const useTaxEl  = el('pc-use-tax');
        s.useTaxPage    = useTaxEl ? useTaxEl.checked : true;
        if (!s.useTaxPage) {
            pc.state    = el('pc-state')?.value      || '';
            pc.localRate = parseFloat(el('pc-local-rate')?.value) || 0;
        }
    }

    // ── PUBLIC ACTIONS ─────────────────────────

    function calculate() {
        const s = getState();
        readFormIntoState(s);
        saveState(s);
        render();
    }

    function reset() {
        const s = getState();
        const pc = s.paychecks[_tab];
        if (!pc) return;
        const id   = pc.id;
        const name = pc.name;
        s.paychecks[_tab] = Object.assign({}, PC_DEFAULTS, { id, name, pretaxCustom: [], postTaxCustom: [] });
        saveState(s);
        render();
    }

    function switchTab(idx) {
        _tab = idx;
        render();
    }

    function addPaycheck() {
        const s = getState();
        const n = s.paychecks.length + 1;
        s.paychecks.push(Object.assign({}, PC_DEFAULTS, {
            id: uid(), name: 'Paycheck ' + n,
            pretaxCustom: [], postTaxCustom: [],
        }));
        _tab = s.paychecks.length - 1;
        saveState(s);
        render();
    }

    function deletePaycheck(id) {
        const s = getState();
        if (s.paychecks.length <= 1) { Toast.show('Cannot remove the last paycheck.'); return; }
        s.paychecks = s.paychecks.filter(p => p.id !== id);
        _tab = Math.min(_tab, s.paychecks.length - 1);
        saveState(s);
        render();
    }

    function toggleTaxSource() {
        const checked   = document.getElementById('pc-use-tax')?.checked;
        const manualDiv = document.getElementById('pc-manual-tax');
        if (manualDiv) manualDiv.style.display = checked ? 'none' : 'block';

        if (!checked) {
            const taxData = Data.get('tax') || {};
            const stateEl = document.getElementById('pc-state');
            if (stateEl && taxData.state && !stateEl.value) stateEl.value = taxData.state;
        }

        const s = getState();
        s.useTaxPage = !!checked;
        saveState(s);
    }

    function toggleAddPreTax() {
        const f = document.getElementById('pc-pretax-add-form');
        if (f) { f.style.display = f.style.display === 'none' ? 'block' : 'none'; }
        const n = document.getElementById('pc-pretax-add-name');
        if (n) n.focus();
    }

    function addPreTaxItem() {
        const name   = (document.getElementById('pc-pretax-add-name')?.value || '').trim();
        const amount = parseMoney(document.getElementById('pc-pretax-add-amount')?.value || 0);
        if (!name || !amount) { Toast.show('Enter a name and amount.'); return; }

        const s = getState();
        readFormIntoState(s);
        const pc = s.paychecks[_tab];
        if (!pc) return;
        if (!Array.isArray(pc.pretaxCustom)) pc.pretaxCustom = [];
        pc.pretaxCustom.push({ id: uid(), name, amount });
        saveState(s);
        render();
    }

    function removePreTaxItem(itemId) {
        const s  = getState();
        const pc = s.paychecks[_tab];
        if (!pc) return;
        pc.pretaxCustom = (pc.pretaxCustom || []).filter(i => i.id !== itemId);
        saveState(s);
        render();
    }

    function toggleAddPostTax() {
        const f = document.getElementById('pc-posttax-add-form');
        if (f) { f.style.display = f.style.display === 'none' ? 'block' : 'none'; }
        const n = document.getElementById('pc-posttax-add-name');
        if (n) n.focus();
    }

    function addPostTaxItem() {
        const name   = (document.getElementById('pc-posttax-add-name')?.value || '').trim();
        const amount = parseMoney(document.getElementById('pc-posttax-add-amount')?.value || 0);
        if (!name || !amount) { Toast.show('Enter a name and amount.'); return; }

        const s = getState();
        readFormIntoState(s);
        const pc = s.paychecks[_tab];
        if (!pc) return;
        if (!Array.isArray(pc.postTaxCustom)) pc.postTaxCustom = [];
        pc.postTaxCustom.push({ id: uid(), name, amount });
        saveState(s);
        render();
    }

    function removePostTaxItem(itemId) {
        const s  = getState();
        const pc = s.paychecks[_tab];
        if (!pc) return;
        pc.postTaxCustom = (pc.postTaxCustom || []).filter(i => i.id !== itemId);
        saveState(s);
        render();
    }

    function addToBudget(mode) {
        const s = getState();
        const budget  = Data.get('budget') || {};
        const streams = Array.isArray(budget.incomeStreams) ? budget.incomeStreams : [];

        if (mode === 'combined') {
            // Add each paycheck's net as a separate income stream
            let added = 0;
            s.paychecks.forEach(pc => {
                if (!pc.grossPaycheck || typeof Tax === 'undefined') return;
                try {
                    const r = computePaycheck(pc, s.useTaxPage);
                    streams.push({
                        id: uid(), name: (pc.name || 'Paycheck') + ' (Net)',
                        amount: r.netCheck, frequency: pc.payFrequency
                    });
                    added++;
                } catch (e) {}
            });
            budget.incomeStreams = streams;
            Data.set('budget', budget);
            Toast.show(`Added ${added} paycheck stream${added !== 1 ? 's' : ''} to Budget.`);
        } else {
            const pc = s.paychecks[_tab];
            if (!pc || !pc.grossPaycheck) { Toast.show('Enter gross pay first.'); return; }
            const r = computePaycheck(pc, s.useTaxPage);
            streams.push({ id: uid(), name: (pc.name || 'Paycheck') + ' (Net)',
                           amount: r.netCheck, frequency: pc.payFrequency });
            budget.incomeStreams = streams;
            Data.set('budget', budget);
            Toast.show(`Added "${pc.name || 'Paycheck'} (Net)" to Budget income streams.`);
        }
    }

    function toggleAddDeposit() {
        const f = document.getElementById('pc-deposit-add-form');
        if (!f) return;
        const opening = f.style.display === 'none';
        f.style.display = opening ? 'block' : 'none';
        if (opening) {
            // Reset form to fixed-amount state
            const typeEl = document.getElementById('pc-deposit-type');
            if (typeEl) { typeEl.value = 'fixed'; toggleDepositType(); }
            document.getElementById('pc-deposit-name')?.focus();
        }
    }

    function toggleDepositType() {
        const type  = document.getElementById('pc-deposit-type')?.value;
        const wrap  = document.getElementById('pc-deposit-amount-wrap');
        const label = document.getElementById('pc-deposit-amount-label');
        const input = document.getElementById('pc-deposit-amount');
        if (!wrap) return;
        if (type === 'remainder') {
            wrap.style.display = 'none';
            return;
        }
        wrap.style.display = '';
        if (type === 'percent') {
            if (label) label.textContent = 'Percentage of Net (%)';
            if (input) { input.placeholder = '10'; input.removeAttribute('data-fmt'); input.value = ''; }
        } else {
            if (label) label.textContent = 'Amount Per Check';
            if (input) { input.placeholder = '0.00'; input.setAttribute('data-fmt', 'currency'); input.value = ''; }
        }
    }

    function addDeposit() {
        const name  = (document.getElementById('pc-deposit-name')?.value || '').trim();
        const type  = document.getElementById('pc-deposit-type')?.value || 'fixed';
        const rawAmt = document.getElementById('pc-deposit-amount')?.value || '';
        const amount = type === 'percent' ? (parseFloat(rawAmt) || 0) : parseMoney(rawAmt);

        if (!name) { Toast.show('Enter an account name.'); return; }
        if (type !== 'remainder' && amount <= 0) { Toast.show('Enter an amount greater than zero.'); return; }

        const s = getState();
        readFormIntoState(s);
        const pc = s.paychecks[_tab];
        if (!pc) return;
        if (!Array.isArray(pc.deposits)) pc.deposits = [];
        if (type === 'remainder' && pc.deposits.some(d => d.type === 'remainder')) {
            Toast.show('Only one Remainder destination is allowed.'); return;
        }
        pc.deposits.push({ id: uid(), name, type, amount: type === 'remainder' ? 0 : amount });
        saveState(s);
        render();
    }

    function editDeposit(depositId) {
        _editingDepositId = depositId;
        render();
    }

    function cancelDepositEdit() {
        _editingDepositId = null;
        render();
    }

    function toggleDepositEditType() {
        const type  = document.getElementById('pc-deposit-edit-type')?.value;
        const wrap  = document.getElementById('pc-deposit-edit-amount-wrap');
        const label = document.getElementById('pc-deposit-edit-amount-label');
        const input = document.getElementById('pc-deposit-edit-amount');
        if (!wrap) return;
        if (type === 'remainder') {
            wrap.style.display = 'none';
            return;
        }
        wrap.style.display = '';
        if (type === 'percent') {
            if (label) label.textContent = '% of Net';
            if (input) { input.placeholder = '10'; input.removeAttribute('data-fmt'); }
        } else {
            if (label) label.textContent = 'Per Check';
            if (input) { input.placeholder = '0.00'; input.setAttribute('data-fmt', 'currency'); }
        }
    }

    function saveDepositEdit(depositId) {
        const name  = (document.getElementById('pc-deposit-edit-name')?.value  || '').trim();
        const type  = document.getElementById('pc-deposit-edit-type')?.value   || 'fixed';
        const rawAmt = document.getElementById('pc-deposit-edit-amount')?.value || '';
        const amount = type === 'percent' ? (parseFloat(rawAmt) || 0) : parseMoney(rawAmt);

        if (!name) { Toast.show('Account name cannot be empty.'); return; }
        if (type !== 'remainder' && amount <= 0) { Toast.show('Enter an amount greater than zero.'); return; }

        const s  = getState();
        const pc = s.paychecks[_tab];
        if (!pc) return;
        const idx = (pc.deposits || []).findIndex(d => d.id === depositId);
        if (idx === -1) return;

        // Guard: if switching TO remainder, make sure no other entry already is
        if (type === 'remainder' && pc.deposits.some(d => d.id !== depositId && d.type === 'remainder')) {
            Toast.show('Only one Remainder destination is allowed.'); return;
        }

        pc.deposits[idx] = { ...pc.deposits[idx], name, type, amount: type === 'remainder' ? 0 : amount };
        _editingDepositId = null;
        saveState(s);
        render();
    }

    function removeDeposit(depositId) {
        _editingDepositId = null;
        const s  = getState();
        const pc = s.paychecks[_tab];
        if (!pc) return;
        pc.deposits = (pc.deposits || []).filter(d => d.id !== depositId);
        saveState(s);
        render();
    }

    function _dragStart(e, id) {
        _dragId = id;
        e.dataTransfer.effectAllowed = 'move';
    }

    function _dragOver(e, id) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (id === _dragId) return;
        document.querySelectorAll('[id^="dep-row-"]').forEach(r => r.style.borderTop = '');
        const row = document.getElementById('dep-row-' + id);
        if (row) row.style.borderTop = '2px solid var(--accent)';
    }

    function _dragLeave(id) {
        const row = document.getElementById('dep-row-' + id);
        if (row) row.style.borderTop = '';
    }

    function _drop(targetId) {
        document.querySelectorAll('[id^="dep-row-"]').forEach(r => r.style.borderTop = '');
        if (!_dragId || _dragId === targetId) { _dragId = null; return; }
        const s  = getState();
        const pc = s.paychecks[_tab];
        if (!pc?.deposits) { _dragId = null; return; }
        const from = pc.deposits.findIndex(d => d.id === _dragId);
        const to   = pc.deposits.findIndex(d => d.id === targetId);
        if (from === -1 || to === -1) { _dragId = null; return; }
        const [item] = pc.deposits.splice(from, 1);
        pc.deposits.splice(to, 0, item);
        _dragId = null;
        saveState(s);
        render();
    }

    function _dragEnd() {
        _dragId = null;
        document.querySelectorAll('[id^="dep-row-"]').forEach(r => r.style.borderTop = '');
    }

    function autoSave() {
        if (_tab < 0) return;
        const s = getState();
        readFormIntoState(s);
        saveState(s);
    }

    return {
        render, calculate, autoSave, reset, switchTab, addPaycheck, deletePaycheck,
        toggleTaxSource, toggleAddPreTax, addPreTaxItem, removePreTaxItem,
        toggleAddPostTax, addPostTaxItem, removePostTaxItem, addToBudget,
        toggleAddDeposit, toggleDepositType, addDeposit, removeDeposit,
        editDeposit, cancelDepositEdit, toggleDepositEditType, saveDepositEdit,
        _dragStart, _dragOver, _dragLeave, _drop, _dragEnd,
    };
})();
