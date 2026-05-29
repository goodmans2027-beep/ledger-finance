/**
 * tax.js — Tax Estimator
 * -------------------------
 * 2025 federal income tax, FICA, long-term capital gains, and
 * flat-rate state income tax for all 50 states + DC.
 *
 * Reads/writes Data.get('tax'). Called by app.js navigate().
 *
 * Tax.render()     — render full page
 * Tax.calculate()  — read inputs, compute, persist, re-render
 * Tax.reset()      — clear inputs, re-render
 */

const Tax = (() => {

    // ── 2025 TAX CONSTANTS ───────────────────

    const BRACKETS = {
        single: [
            { rate: 0.10, upTo: 11925 },
            { rate: 0.12, upTo: 48475 },
            { rate: 0.22, upTo: 103350 },
            { rate: 0.24, upTo: 197300 },
            { rate: 0.32, upTo: 250525 },
            { rate: 0.35, upTo: 626350 },
            { rate: 0.37, upTo: Infinity }
        ],
        married: [
            { rate: 0.10, upTo: 23850 },
            { rate: 0.12, upTo: 96950 },
            { rate: 0.22, upTo: 206700 },
            { rate: 0.24, upTo: 394600 },
            { rate: 0.32, upTo: 501050 },
            { rate: 0.35, upTo: 751600 },
            { rate: 0.37, upTo: Infinity }
        ],
        head: [
            { rate: 0.10, upTo: 17000 },
            { rate: 0.12, upTo: 64850 },
            { rate: 0.22, upTo: 103350 },
            { rate: 0.24, upTo: 197300 },
            { rate: 0.32, upTo: 250500 },
            { rate: 0.35, upTo: 626350 },
            { rate: 0.37, upTo: Infinity }
        ]
    };

    const STANDARD_DEDUCTION = { single: 15000, married: 30000, head: 22500 };

    // Long-term capital gains thresholds (taxable income including LTCG)
    const LTCG_THRESHOLDS = {
        single:  [{ rate: 0,    upTo: 48350  }, { rate: 0.15, upTo: 533400 }, { rate: 0.20, upTo: Infinity }],
        married: [{ rate: 0,    upTo: 96700  }, { rate: 0.15, upTo: 600050 }, { rate: 0.20, upTo: Infinity }],
        head:    [{ rate: 0,    upTo: 64750  }, { rate: 0.15, upTo: 566700 }, { rate: 0.20, upTo: Infinity }]
    };

    // FICA 2025
    const FICA = {
        ssRate: 0.062,
        ssWageBase: 176100,
        medicareRate: 0.0145,
        addlMedicareRate: 0.009,
        addlMedicareThreshold: { single: 200000, married: 250000, head: 200000 }
    };

    // State income tax — flat-rate approximations for all 50 states + DC
    // Progressive states use a representative effective rate for a ~$75k earner.
    // Label: [name, rate%, no-tax flag]
    const STATES = [
        ['', '— Select State —', 0],
        ['AL', 'Alabama',              5.00],
        ['AK', 'Alaska (no tax)',      0.00],
        ['AZ', 'Arizona',              2.50],
        ['AR', 'Arkansas',             4.40],
        ['CA', 'California',           9.30],
        ['CO', 'Colorado',             4.40],
        ['CT', 'Connecticut',          5.00],
        ['DE', 'Delaware',             5.20],
        ['FL', 'Florida (no tax)',     0.00],
        ['GA', 'Georgia',              5.49],
        ['HI', 'Hawaii',               8.25],
        ['ID', 'Idaho',                5.80],
        ['IL', 'Illinois',             4.95],
        ['IN', 'Indiana',              3.05],
        ['IA', 'Iowa',                 6.00],
        ['KS', 'Kansas',               5.70],
        ['KY', 'Kentucky',             4.00],
        ['LA', 'Louisiana',            4.25],
        ['ME', 'Maine',                7.15],
        ['MD', 'Maryland',             5.75],
        ['MA', 'Massachusetts',        5.00],
        ['MI', 'Michigan',             4.05],
        ['MN', 'Minnesota',            7.85],
        ['MS', 'Mississippi',          5.00],
        ['MO', 'Missouri',             4.80],
        ['MT', 'Montana',              6.75],
        ['NE', 'Nebraska',             5.84],
        ['NV', 'Nevada (no tax)',      0.00],
        ['NH', 'New Hampshire (no tax)',0.00],
        ['NJ', 'New Jersey',           6.37],
        ['NM', 'New Mexico',           5.90],
        ['NY', 'New York',             6.85],
        ['NC', 'North Carolina',       4.50],
        ['ND', 'North Dakota',         2.50],
        ['OH', 'Ohio',                 3.99],
        ['OK', 'Oklahoma',             4.75],
        ['OR', 'Oregon',               9.90],
        ['PA', 'Pennsylvania',         3.07],
        ['RI', 'Rhode Island',         5.99],
        ['SC', 'South Carolina',       7.00],
        ['SD', 'South Dakota (no tax)',0.00],
        ['TN', 'Tennessee (no tax)',   0.00],
        ['TX', 'Texas (no tax)',       0.00],
        ['UT', 'Utah',                 4.65],
        ['VT', 'Vermont',              8.75],
        ['VA', 'Virginia',             5.75],
        ['WA', 'Washington (no tax)',  0.00],
        ['WV', 'West Virginia',        5.12],
        ['WI', 'Wisconsin',            7.65],
        ['WY', 'Wyoming (no tax)',     0.00],
        ['DC', 'Washington D.C.',      8.50]
    ];

    // ── HELPERS ──────────────────────────────

    function fmt(n) {
        return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function pct(r, decimals = 2) {
        return (r * 100).toFixed(decimals) + '%';
    }

    function filingKey(status) {
        if (!status) return 'single';
        const s = String(status).toLowerCase();
        if (s.includes('married')) return 'married';
        if (s.includes('head'))    return 'head';
        return 'single';
    }

    // ── STATE ─────────────────────────────────

    function getState() {
        const s = Data.get('tax') || {};
        // Migrate: old state used deductionType + stdDedPreset; new uses a single deductionMethod
        let deductionMethod = s.deductionMethod;
        if (!deductionMethod) {
            if (s.deductionType === 'itemized')    deductionMethod = 'itemized';
            else if (s.stdDedPreset === 'custom')  deductionMethod = 'standard-custom';
            else                                   deductionMethod = 'standard-2025';
        }
        return {
            grossIncome:      s.grossIncome      ?? 0,
            ltcg:             s.ltcg             ?? 0,
            seIncome:         s.seIncome         ?? 0,
            otherIncome:      s.otherIncome      ?? 0,
            filingStatus:     s.filingStatus     ?? 'single',
            state:            s.state            ?? '',
            localRate:        s.localRate        ?? 0,
            // 'standard-2025' | 'standard-custom' | 'itemized'
            deductionMethod,
            // Custom standard deduction amounts (used when deductionMethod = 'standard-custom')
            stdDedSingle:     s.stdDedSingle     ?? 0,
            stdDedMarried:    s.stdDedMarried    ?? 0,
            stdDedHead:       s.stdDedHead       ?? 0,
            // Itemized line items — update each year
            mortgageInterest: s.mortgageInterest ?? 0,
            saltPropertyTax:  s.saltPropertyTax  ?? 0,
            saltIncomeTax:    s.saltIncomeTax    ?? 0,
            charitable:       s.charitable       ?? 0,
            medicalExpenses:  s.medicalExpenses  ?? 0,
            otherItemized:    s.otherItemized    ?? 0,
            // Pre-tax contributions (reduce income tax, NOT FICA)
            contrib401k:      s.contrib401k      ?? 0,
            contribIRA:       s.contribIRA       ?? 0,
            contribHSA:       s.contribHSA       ?? 0,
            // Section 125 employer benefits (health / dental / vision)
            // Paid via payroll — reduces BOTH income tax AND FICA wages
            healthPremiums:   s.healthPremiums   ?? 0,
        };
    }

    // Returns the active standard deduction table (2025 preset or custom values).
    function getStdDedTable(s) {
        if (s.deductionMethod === 'standard-custom') {
            return {
                single:  Math.max(0, s.stdDedSingle  || 0),
                married: Math.max(0, s.stdDedMarried || 0),
                head:    Math.max(0, s.stdDedHead    || 0),
            };
        }
        return STANDARD_DEDUCTION; // 2025 IRS preset
    }

    function saveState(s) { Data.set('tax', s); }

    // ── COMPUTATION ───────────────────────────

    function computeFederal(taxableOrdinary, fkey) {
        const brackets = BRACKETS[fkey];
        let remaining = Math.max(0, taxableOrdinary);
        let tax = 0, prev = 0, marginalRate = 0;
        const slices = [];

        for (const b of brackets) {
            const width = b.upTo === Infinity ? remaining : Math.max(0, b.upTo - prev);
            const inBracket = Math.min(remaining, width);
            if (inBracket > 0) {
                const bracketTax = inBracket * b.rate;
                tax += bracketTax;
                remaining -= inBracket;
                marginalRate = b.rate;
                slices.push({ rate: b.rate, from: prev, to: b.upTo, income: inBracket, tax: bracketTax });
            } else {
                slices.push({ rate: b.rate, from: prev, to: b.upTo, income: 0, tax: 0 });
            }
            prev = b.upTo;
            if (remaining <= 0) break;
        }

        return { tax: Math.max(0, tax), marginalRate, slices };
    }

    function computeLTCG(ltcgAmount, ordinaryTaxable, fkey) {
        if (!ltcgAmount) return 0;
        // LTCG is stacked on top of ordinary income for threshold purposes
        const combined = ordinaryTaxable + ltcgAmount;
        const thresholds = LTCG_THRESHOLDS[fkey];
        let remaining = ltcgAmount;
        let tax = 0;
        // Ordinary income fills the bottom of the brackets first
        let alreadyFilled = ordinaryTaxable;

        for (const t of thresholds) {
            const bucketTop = t.upTo === Infinity ? Infinity : t.upTo;
            const available = Math.max(0, bucketTop - alreadyFilled);
            const inBucket  = Math.min(remaining, available);
            if (inBucket > 0) {
                tax += inBucket * t.rate;
                remaining -= inBucket;
                alreadyFilled += inBucket;
            }
            if (remaining <= 0) break;
        }
        return Math.max(0, tax);
    }

    function computeFICA(wages, seIncome, fkey) {
        const w = Math.max(0, wages);
        const se = Math.max(0, seIncome);
        // Employee SS + Medicare on W-2 wages
        const ssTax       = Math.min(w, FICA.ssWageBase) * FICA.ssRate;
        const medicareTax = w * FICA.medicareRate;
        // Additional Medicare surtax
        const addlThreshold = FICA.addlMedicareThreshold[fkey];
        const addlMedicare  = Math.max(0, w - addlThreshold) * FICA.addlMedicareRate;

        // Self-employment tax (both halves, but deduct half from gross)
        // Net SE income = SE * 0.9235
        const netSE      = se * 0.9235;
        const seSSTax    = Math.min(netSE, Math.max(0, FICA.ssWageBase - w)) * (FICA.ssRate * 2);
        const seMedTax   = netSE * (FICA.medicareRate * 2);
        const seTaxTotal = seSSTax + seMedTax;
        const seDeduction = seTaxTotal / 2; // deductible from income

        return {
            ssTax, medicareTax, addlMedicare,
            seTaxTotal, seDeduction,
            total: ssTax + medicareTax + addlMedicare + seTaxTotal
        };
    }

    function computeItemized(inputs, agi) {
        const mortgageInterest  = Math.max(0, inputs.mortgageInterest || 0);
        const saltPropertyTax   = Math.max(0, inputs.saltPropertyTax  || 0);
        const saltIncomeTax     = Math.max(0, inputs.saltIncomeTax    || 0);
        const charitable        = Math.max(0, inputs.charitable       || 0);
        const medicalExpenses   = Math.max(0, inputs.medicalExpenses  || 0);
        const otherItemized     = Math.max(0, inputs.otherItemized    || 0);

        const saltTotal         = saltPropertyTax + saltIncomeTax;
        const saltCapped        = Math.min(saltTotal, 10000);   // TCJA $10k cap
        const saltOverCap       = Math.max(0, saltTotal - 10000);
        const medicalFloor      = agi * 0.075;                   // 7.5% of AGI
        const medicalDeductible = Math.max(0, medicalExpenses - medicalFloor);
        const total             = mortgageInterest + saltCapped + charitable + medicalDeductible + otherItemized;

        return {
            mortgageInterest, saltPropertyTax, saltIncomeTax,
            saltTotal, saltCapped, saltOverCap,
            charitable, medicalExpenses, medicalFloor, medicalDeductible,
            otherItemized, total
        };
    }

    function computeStateTax(taxableIncome, stateCode, localRatePct) {
        const entry = STATES.find(s => s[0] === (stateCode || '').toUpperCase().trim());
        const stateRate = entry ? entry[2] / 100 : 0;
        const stateTax  = Math.max(0, taxableIncome * stateRate);
        const localTax  = Math.max(0, taxableIncome * ((localRatePct || 0) / 100));
        return { stateTax, stateRate, localTax };
    }

    function computeAll(inputs) {
        const fkey           = filingKey(inputs.filingStatus);
        const gross          = Math.max(0, inputs.grossIncome    || 0);
        const ltcg           = Math.max(0, inputs.ltcg           || 0);
        const seIncome       = Math.max(0, inputs.seIncome       || 0);
        const otherIncome    = Math.max(0, inputs.otherIncome    || 0);
        const healthPremiums = Math.max(0, inputs.healthPremiums || 0);
        const contrib401k    = Math.max(0, inputs.contrib401k    || 0);
        const contribIRA     = Math.max(0, inputs.contribIRA     || 0);
        const contribHSA     = Math.max(0, inputs.contribHSA     || 0);
        const pretaxTotal    = contrib401k + contribIRA + contribHSA;

        // Section 125 benefits reduce FICA wages; 401k/IRA/HSA do NOT
        const ficaWages = Math.max(0, gross - healthPremiums);
        const fica = computeFICA(ficaWages, seIncome, fkey);

        const totalGross = gross + ltcg + seIncome + otherIncome;

        // AGI: pretax + Section 125 benefits + SE deduction all reduce it
        const agi = Math.max(0, totalGross - pretaxTotal - healthPremiums - fica.seDeduction);

        // Deduction
        const standardDed       = getStdDedTable(inputs)[fkey];
        const itemizedBreakdown = computeItemized(inputs, agi);
        const deduction = inputs.deductionMethod === 'itemized'
            ? itemizedBreakdown.total
            : standardDed;

        const taxableOrdinary = Math.max(0, agi - deduction - ltcg);
        const taxableTotal    = Math.max(0, agi - deduction);

        const federal    = computeFederal(taxableOrdinary, fkey);
        const ltcgTax    = computeLTCG(ltcg, taxableOrdinary, fkey);
        const stateLocal = computeStateTax(taxableTotal, inputs.state, inputs.localRate);

        const totalTax        = federal.tax + ltcgTax + fica.total + stateLocal.stateTax + stateLocal.localTax;
        // Take-home is what hits your bank — after tax AND all pre-tax deductions
        const takeHomeAnnual  = Math.max(0, totalGross - totalTax - pretaxTotal - healthPremiums);
        const takeHomeMonthly = takeHomeAnnual / 12;

        return {
            gross, ltcg, seIncome, otherIncome, totalGross,
            healthPremiums, pretaxTotal, fica, agi,
            deduction, standardDed, deductionMethod: inputs.deductionMethod, itemizedBreakdown,
            taxableOrdinary, taxableTotal,
            federal, ltcgTax,
            stateLocal, state: inputs.state, localRate: inputs.localRate,
            totalTax, takeHomeAnnual, takeHomeMonthly,
            effectiveFederal: totalGross > 0 ? (federal.tax + ltcgTax) / totalGross : 0,
            effectiveTotal:   totalGross > 0 ? totalTax / totalGross : 0,
        };
    }

    // ── RENDER ───────────────────────────────

    function render() {
        const s = getState();
        const result = s.grossIncome > 0 ? computeAll(s) : null;

        document.getElementById('page-tax').innerHTML = buildPage(s, result);

        if (result) renderChart(result);
        CurrencyInput.applyAll();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── PAGE BUILDER ─────────────────────────

    function buildPage(s, result) {
        return `
        <div class="page-header">
            <h2>Tax Estimator</h2>
            <p>2025 federal brackets · FICA · long-term capital gains · all 50 states</p>
        </div>

        <div class="grid-2" style="gap:16px; align-items:start; margin-bottom:16px;">
            ${buildInputCard(s, result)}
            <div>
                ${result ? buildSummaryCards(result) : buildEmptyState()}
                ${result ? buildIncomeWaterfall(result) : ''}
            </div>
        </div>

        ${result ? `
        <div class="grid-2" style="gap:16px; margin-bottom:16px; align-items:start;">
            ${buildBracketWaterfall(result)}
            <div>
                ${buildTakeHomeCard(result)}
                ${buildRatesCard(result)}
            </div>
        </div>` : ''}

        ${result ? `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Tax Breakdown</div>
            <div style="display:flex; align-items:center; gap:32px; flex-wrap:wrap;">
                <div style="position:relative; width:180px; height:180px; flex-shrink:0;">
                    <canvas id="tax-donut-chart"></canvas>
                </div>
                <div id="tax-donut-legend" style="flex:1; display:flex; flex-direction:column; gap:10px; min-width:180px;"></div>
            </div>
        </div>` : ''}
        `;
    }

    // ── INPUT CARD ────────────────────────────

    function buildInputCard(s, result) {
        const fkey        = filingKey(s.filingStatus);
        const stdDedTable = getStdDedTable(s);
        const stdDed      = stdDedTable[fkey];
        const dm          = s.deductionMethod || 'standard-2025';
        const isItemized  = dm === 'itemized';
        const isCustomStd = dm === 'standard-custom';

        const stateOptions = STATES.map(([code, name]) =>
            `<option value="${code}" ${s.state === code ? 'selected' : ''}>${name || '— Select State —'}</option>`
        ).join('');

        // Format value for currency inputs (empty string when 0)
        function fv(n) {
            return n > 0 ? '$' + Number(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}) : '';
        }

        // ── Itemized line-items block ──
        let itemizedBlock = '';
        if (isItemized) {
            const ib = result ? result.itemizedBreakdown : null;
            const saltRaw  = (s.saltPropertyTax || 0) + (s.saltIncomeTax || 0);
            const saltOver = Math.max(0, saltRaw - 10000);

            const saltNote = saltOver > 0 ? `
                <div style="font-size:0.72rem; color:var(--orange); margin:-4px 0 8px; font-family:var(--font-mono);">
                    ⚠ SALT total ${fmt(saltRaw)} exceeds $10,000 cap — ${fmt(saltOver)} non-deductible
                </div>` : '';

            const medNote = (ib && s.medicalExpenses > 0) ? `
                <div style="font-size:0.72rem; color:var(--text-faint); margin:-4px 0 8px; font-family:var(--font-mono);">
                    Medical deductible: ${fmt(ib.medicalDeductible)}
                    <span style="color:var(--text-faint);">(7.5% AGI floor = ${fmt(ib.medicalFloor)})</span>
                </div>` : '';

            let cmpBadge = '';
            if (ib) {
                const diff = ib.total - stdDed;
                if (diff > 0) {
                    cmpBadge = `<div style="display:inline-flex; gap:6px; align-items:center; margin-top:8px; padding:5px 10px; border-radius:6px; background:rgba(90,190,90,0.12); color:var(--green); font-size:0.78rem; font-family:var(--font-mono);">
                        ✓ Itemizing saves ${fmt(diff)} vs standard ($${stdDed.toLocaleString()})
                    </div>`;
                } else {
                    cmpBadge = `<div style="display:inline-flex; gap:6px; align-items:center; margin-top:8px; padding:5px 10px; border-radius:6px; background:rgba(217,119,87,0.12); color:var(--orange); font-size:0.78rem; font-family:var(--font-mono);">
                        ⚠ Standard saves ${fmt(Math.abs(diff))} more — consider switching
                    </div>`;
                }
            }

            itemizedBlock = `
            <div class="form-row">
                <div class="form-group">
                    <label>Mortgage Interest</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-mortgage-interest"
                           value="${fv(s.mortgageInterest)}" placeholder="$0.00">
                </div>
                <div class="form-group">
                    <label>Charitable Donations</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-charitable"
                           value="${fv(s.charitable)}" placeholder="$0.00">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Property Tax <span style="font-size:0.67rem; color:var(--text-faint);">(SALT)</span></label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-salt-property"
                           value="${fv(s.saltPropertyTax)}" placeholder="$0.00">
                </div>
                <div class="form-group">
                    <label>State / Local Tax Paid <span style="font-size:0.67rem; color:var(--text-faint);">(SALT)</span></label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-salt-income"
                           value="${fv(s.saltIncomeTax)}" placeholder="$0.00">
                </div>
            </div>
            ${saltNote}
            <div class="form-row">
                <div class="form-group">
                    <label>Medical / Dental Expenses <span style="font-size:0.67rem; color:var(--text-faint);">(gross total)</span></label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-medical"
                           value="${fv(s.medicalExpenses)}" placeholder="$0.00">
                </div>
                <div class="form-group">
                    <label>Other Itemized</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-other-itemized"
                           value="${fv(s.otherItemized)}" placeholder="$0.00">
                </div>
            </div>
            ${medNote}
            ${cmpBadge}`;
        }

        return `
        <div class="card">
            <div class="card-title">Income &amp; Filing — Tax Year 2025</div>

            <!-- Income -->
            <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.08em; color:var(--text-faint); margin:0 0 10px;">Income</div>
            <div class="form-row">
                <div class="form-group">
                    <label>W-2 / Gross Income</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-gross"
                           value="${fv(s.grossIncome)}" placeholder="$0.00">
                </div>
                <div class="form-group">
                    <label>Self-Employment Income</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-se"
                           value="${fv(s.seIncome)}" placeholder="$0.00">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Long-Term Capital Gains</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-ltcg"
                           value="${fv(s.ltcg)}" placeholder="$0.00">
                </div>
                <div class="form-group">
                    <label>Other Income</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-other"
                           value="${fv(s.otherIncome)}" placeholder="$0.00">
                </div>
            </div>

            <!-- Pre-tax contributions -->
            <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.08em; color:var(--text-faint); margin:4px 0 10px;">
                Pre-Tax Contributions <span style="font-size:0.6rem; color:var(--text-faint); text-transform:none; letter-spacing:0;">(reduce AGI · do not reduce FICA)</span>
            </div>
            <div class="form-row-3">
                <div class="form-group">
                    <label>401(k) / 403(b)</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-401k"
                           value="${fv(s.contrib401k)}" placeholder="$0.00">
                </div>
                <div class="form-group">
                    <label>Traditional IRA</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-ira"
                           value="${fv(s.contribIRA)}" placeholder="$0.00">
                </div>
                <div class="form-group">
                    <label>HSA</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-hsa"
                           value="${fv(s.contribHSA)}" placeholder="$0.00">
                </div>
            </div>
            <!-- Section 125 benefits: reduce FICA wages AND income tax -->
            <div class="form-row" style="margin-top:0;">
                <div class="form-group" style="max-width:50%;">
                    <label>
                        Employer Benefits Premiums
                        <span style="display:block; font-size:0.67rem; color:var(--text-faint); font-weight:400; text-transform:none; letter-spacing:0; margin-top:2px;">
                            health · dental · vision (Section 125) — also reduces FICA wages
                        </span>
                    </label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-health"
                           value="${fv(s.healthPremiums)}" placeholder="$0.00">
                </div>
            </div>

            <!-- Filing + deductions -->
            <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.08em; color:var(--text-faint); margin:8px 0 10px;">Filing &amp; Deductions</div>
            <div class="form-row" style="margin-bottom:12px;">
                <div class="form-group">
                    <label>Filing Status</label>
                    <select id="tax-filing">
                        <option value="single"  ${s.filingStatus === 'single'  ? 'selected' : ''}>Single</option>
                        <option value="married" ${s.filingStatus === 'married' ? 'selected' : ''}>Married Filing Jointly</option>
                        <option value="head"    ${s.filingStatus === 'head'    ? 'selected' : ''}>Head of Household</option>
                    </select>
                </div>
            </div>

            <!-- Single segmented control replaces two separate dropdowns -->
            <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:7px;">Deduction Method</div>
            <div style="display:flex; border:1px solid var(--border); border-radius:8px; overflow:hidden; margin-bottom:14px;">
                ${[
                    ['standard-2025',   'Standard — 2025'],
                    ['standard-custom', 'Standard — Custom'],
                    ['itemized',        'Itemized'],
                ].map(([val, label], i, arr) => `
                <button onclick="Tax.setDeductionMethod('${val}')"
                        style="flex:1; padding:8px 6px; font-size:0.8rem; font-family:inherit; cursor:pointer; border:none;
                               ${i < arr.length - 1 ? 'border-right:1px solid var(--border);' : ''}
                               background:${dm === val ? 'var(--accent)' : 'transparent'};
                               color:${dm === val ? '#fff' : 'var(--text-muted)'};
                               font-weight:${dm === val ? '500' : '400'};">
                    ${label}
                </button>`).join('')}
            </div>

            <!-- Standard 2025 — IRS amounts shown as reference -->
            ${dm === 'standard-2025' ? `
            <div style="display:flex; gap:16px; font-size:0.78rem; font-family:var(--font-mono); color:var(--text-muted); margin-bottom:14px; flex-wrap:wrap;">
                <span>Single <strong style="color:var(--text);">$${STANDARD_DEDUCTION.single.toLocaleString()}</strong></span>
                <span style="color:var(--border);">·</span>
                <span>Married <strong style="color:var(--text);">$${STANDARD_DEDUCTION.married.toLocaleString()}</strong></span>
                <span style="color:var(--border);">·</span>
                <span>Head of HH <strong style="color:var(--text);">$${STANDARD_DEDUCTION.head.toLocaleString()}</strong></span>
            </div>` : ''}

            <!-- Standard Custom — enter next year's amounts -->
            ${isCustomStd ? `
            <div class="form-row-3">
                <div class="form-group">
                    <label>Single</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-std-single"
                           value="${fv(s.stdDedSingle)}" placeholder="$0.00">
                </div>
                <div class="form-group">
                    <label>Married Filing Jointly</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-std-married"
                           value="${fv(s.stdDedMarried)}" placeholder="$0.00">
                </div>
                <div class="form-group">
                    <label>Head of Household</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="tax-std-head"
                           value="${fv(s.stdDedHead)}" placeholder="$0.00">
                </div>
            </div>` : ''}

            <!-- Itemized line items -->
            ${isItemized ? itemizedBlock : ''}

            <!-- State & local -->
            <div style="font-size:0.68rem; font-family:var(--font-mono); text-transform:uppercase; letter-spacing:0.08em; color:var(--text-faint); margin:${isItemized ? '12px' : '4px'} 0 10px;">State &amp; Local</div>
            <div class="form-row">
                <div class="form-group">
                    <label>State</label>
                    <select id="tax-state">${stateOptions}</select>
                </div>
                <div class="form-group">
                    <label>Local Tax Rate (%)</label>
                    <input type="number" id="tax-local" value="${s.localRate || ''}"
                           placeholder="0.00" min="0" step="0.01">
                </div>
            </div>

            <div style="display:flex; gap:10px; margin-top:4px;">
                <button class="btn btn-primary" onclick="Tax.calculate()">Calculate</button>
                <button class="btn btn-ghost"   onclick="Tax.reset()">Reset</button>
            </div>

            <p style="font-size:0.7rem; color:var(--text-faint); margin-top:14px; line-height:1.6; margin-bottom:0;">
                State rates are flat-rate approximations. Medical requires exceeding 7.5% AGI. SALT capped at $10,000. Results are estimates — consult a tax professional for filing.
            </p>
        </div>`;
    }

    // ── SUMMARY CARDS ─────────────────────────

    function buildSummaryCards(r) {
        return `
        <div class="summary-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:16px;">
            <div class="summary-card">
                <div class="label">Total Gross Income</div>
                <div class="value">${fmt(r.totalGross)}</div>
                <div class="sub">before any deductions</div>
            </div>
            <div class="summary-card">
                <div class="label">Taxable Income</div>
                <div class="value value-accent">${fmt(r.taxableOrdinary)}</div>
                <div class="sub">after deductions &amp; pre-tax</div>
            </div>
            <div class="summary-card">
                <div class="label">Total Tax</div>
                <div class="value value-red">${fmt(r.totalTax)}</div>
                <div class="sub">${pct(r.effectiveTotal)} effective rate</div>
            </div>
        </div>
        <div class="summary-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:16px;">
            <div class="summary-card">
                <div class="label">Federal Income Tax</div>
                <div class="value">${fmt(r.federal.tax + r.ltcgTax)}</div>
                <div class="sub">marginal ${pct(r.federal.marginalRate, 0)} bracket</div>
            </div>
            <div class="summary-card">
                <div class="label">FICA</div>
                <div class="value">${fmt(r.fica.total)}</div>
                <div class="sub">SS + Medicare</div>
            </div>
            <div class="summary-card">
                <div class="label">State ${r.stateLocal.localTax > 0 ? '+ Local' : ''} Tax</div>
                <div class="value">${fmt(r.stateLocal.stateTax + r.stateLocal.localTax)}</div>
                <div class="sub">${r.state ? pct(r.stateLocal.stateRate) + ' state rate' : 'No state selected'}</div>
            </div>
        </div>`;
    }

    // ── INCOME WATERFALL ──────────────────────

    function buildIncomeWaterfall(r) {
        const rows = [
            { label: 'W-2 / Gross Income',              value: r.gross,              color: 'var(--text)' },
            r.seIncome       ? { label: '+ Self-Employment',            value: r.seIncome,           color: 'var(--text)' } : null,
            r.ltcg           ? { label: '+ Capital Gains (LT)',         value: r.ltcg,               color: 'var(--text)' } : null,
            r.otherIncome    ? { label: '+ Other Income',               value: r.otherIncome,        color: 'var(--text)' } : null,
            { label: '= Total Gross',                   value: r.totalGross,         color: 'var(--accent)', bold: true },
            r.pretaxTotal    ? { label: '− 401k / IRA / HSA',           value: -r.pretaxTotal,       color: 'var(--green)' } : null,
            r.healthPremiums ? { label: '− Benefits Premiums (Sec 125)',value: -r.healthPremiums,    color: 'var(--green)' } : null,
            r.fica.seDeduction ? { label: '− SE Tax Deduction',         value: -r.fica.seDeduction,  color: 'var(--green)' } : null,
            { label: '= Adjusted Gross Income',         value: r.agi,                color: 'var(--accent)', bold: true },
            { label: `− ${r.deductionMethod === 'itemized' ? 'Itemized' : 'Standard'} Deduction`,
                                                        value: -r.deduction,         color: 'var(--green)' },
            { label: '= Taxable Income',                value: r.taxableOrdinary,    color: 'var(--accent)', bold: true },
        ].filter(Boolean);

        const rowsHtml = rows.map(row => `
            <tr>
                <td style="font-size:0.82rem; color:${row.bold ? 'var(--text)' : 'var(--text-muted)'}; ${row.bold ? 'font-weight:600; padding-top:6px;' : ''}">
                    ${row.label}
                </td>
                <td style="font-family:var(--font-mono); font-size:0.82rem; text-align:right;
                           color:${row.value < 0 ? 'var(--green)' : row.color};
                           ${row.bold ? 'font-weight:600;' : ''}">
                    ${row.value < 0 ? '−' + fmt(Math.abs(row.value)) : fmt(row.value)}
                </td>
            </tr>`).join('');

        return `
        <div class="card" style="margin-bottom:0;">
            <div class="card-title">Income Breakdown</div>
            <table style="width:100%; border-collapse:collapse;">
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>`;
    }

    // ── FEDERAL BRACKET WATERFALL ─────────────

    function buildBracketWaterfall(r) {
        const maxIncome = r.taxableOrdinary;

        const rows = r.federal.slices.map(slice => {
            const filledPct = maxIncome > 0 ? Math.min(100, (slice.income / (slice.to === Infinity ? maxIncome + 1 : slice.to - slice.from)) * 100) : 0;
            const isEmpty   = slice.income === 0;
            const rangeStr  = slice.to === Infinity
                ? '$' + Number(slice.from).toLocaleString() + '+'
                : '$' + Number(slice.from).toLocaleString() + ' – $' + Number(slice.to).toLocaleString();

            return `<tr ${isEmpty ? 'style="opacity:0.38;"' : ''}>
                <td style="font-family:var(--font-mono); font-size:0.82rem; font-weight:600;
                           color:${isEmpty ? 'var(--text-faint)' : 'var(--accent)'}; white-space:nowrap;">
                    ${(slice.rate * 100).toFixed(0)}%
                </td>
                <td style="font-size:0.78rem; color:var(--text-muted); white-space:nowrap;">${rangeStr}</td>
                <td style="width:35%;">
                    <div style="background:var(--surface2); border-radius:4px; height:8px; overflow:hidden;">
                        <div style="height:100%; width:${filledPct.toFixed(1)}%; background:var(--accent);
                                    border-radius:4px; opacity:${isEmpty ? 0 : 1};"></div>
                    </div>
                </td>
                <td style="font-family:var(--font-mono); font-size:0.82rem; text-align:right; color:var(--text);">
                    ${isEmpty ? '—' : fmt(slice.income)}
                </td>
                <td style="font-family:var(--font-mono); font-size:0.82rem; text-align:right;
                           color:${isEmpty ? 'var(--text-faint)' : 'var(--red)'};">
                    ${isEmpty ? '—' : fmt(slice.tax)}
                </td>
            </tr>`;
        });

        // LTCG row if applicable
        let ltcgRow = '';
        if (r.ltcg > 0) {
            ltcgRow = `
            <tr style="border-top:1px solid var(--border);">
                <td style="font-family:var(--font-mono); font-size:0.82rem; font-weight:600; color:var(--blue);">LT CG</td>
                <td style="font-size:0.78rem; color:var(--text-muted);">Capital Gains</td>
                <td></td>
                <td style="font-family:var(--font-mono); font-size:0.82rem; text-align:right;">${fmt(r.ltcg)}</td>
                <td style="font-family:var(--font-mono); font-size:0.82rem; text-align:right; color:var(--red);">${fmt(r.ltcgTax)}</td>
            </tr>`;
        }

        return `
        <div class="card" style="margin-bottom:0;">
            <div class="card-title">Federal Tax Brackets</div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Rate</th>
                            <th>Bracket</th>
                            <th></th>
                            <th style="text-align:right;">Income</th>
                            <th style="text-align:right;">Tax</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.join('')}
                        ${ltcgRow}
                        <tr style="border-top:2px solid var(--border); font-weight:600;">
                            <td colspan="3" style="font-family:var(--font-mono); font-size:0.75rem;
                                                   color:var(--text-muted); padding-top:10px;">Total Federal</td>
                            <td style="font-family:var(--font-mono); font-size:0.82rem; text-align:right; padding-top:10px;">${fmt(r.taxableOrdinary + r.ltcg)}</td>
                            <td style="font-family:var(--font-mono); font-size:0.82rem; text-align:right; color:var(--red); padding-top:10px;">${fmt(r.federal.tax + r.ltcgTax)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    // ── TAKE-HOME & RATES ─────────────────────

    function buildTakeHomeCard(r) {
        const periods = [
            { label: 'Annually',    value: r.takeHomeAnnual },
            { label: 'Monthly',     value: r.takeHomeAnnual / 12 },
            { label: 'Bi-Weekly',   value: r.takeHomeAnnual / 26 },
            { label: 'Weekly',      value: r.takeHomeAnnual / 52 },
        ];
        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-title">Take-Home Pay</div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                ${periods.map((p, i) => `
                <div style="display:flex; justify-content:space-between; align-items:center;
                            padding-bottom:${i < periods.length - 1 ? '10px' : '0'};
                            ${i < periods.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
                    <span style="font-size:0.83rem; color:var(--text-muted);">${p.label}</span>
                    <span style="font-family:var(--font-mono); font-size:${i === 0 ? '1rem' : '0.88rem'};
                                 font-weight:${i === 0 ? '600' : '400'}; color:var(--green);">${fmt(p.value)}</span>
                </div>`).join('')}
            </div>
        </div>`;
    }

    function buildRatesCard(r) {
        const rateRows = [
            { label: 'Federal Marginal Rate',  value: pct(r.federal.marginalRate, 0),    color: 'var(--accent)' },
            { label: 'Federal Effective Rate', value: pct(r.effectiveFederal),            color: 'var(--text)' },
            { label: 'FICA Rate',              value: pct(r.fica.total / (r.totalGross || 1)), color: 'var(--text)' },
            r.stateLocal.stateRate ? { label: `${r.state || 'State'} Rate`, value: pct(r.stateLocal.stateRate), color: 'var(--text)' } : null,
            { label: 'Total Effective Rate',   value: pct(r.effectiveTotal),              color: 'var(--red)' },
        ].filter(Boolean);

        return `
        <div class="card" style="margin-bottom:0;">
            <div class="card-title">Effective Rates</div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                ${rateRows.map((row, i) => `
                <div style="display:flex; justify-content:space-between; align-items:center;
                            padding-bottom:${i < rateRows.length - 1 ? '10px' : '0'};
                            ${i < rateRows.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
                    <span style="font-size:0.83rem; color:var(--text-muted);">${row.label}</span>
                    <span style="font-family:var(--font-mono); font-size:0.88rem; color:${row.color}; font-weight:500;">${row.value}</span>
                </div>`).join('')}
            </div>
        </div>`;
    }

    // ── EMPTY STATE ───────────────────────────

    function buildEmptyState() {
        return `
        <div class="card" style="margin-bottom:0;">
            <div style="text-align:center; padding:48px 24px;">
                <div style="font-size:2.2rem; margin-bottom:14px;">🧾</div>
                <div style="font-size:0.95rem; font-weight:500; color:var(--text); margin-bottom:10px;">Enter your income to see your estimate</div>
                <div style="font-size:0.84rem; color:var(--text-muted); line-height:1.7;">
                    Fill in your gross income and filing status on the left, then hit <strong>Calculate</strong>.
                </div>
            </div>
        </div>`;
    }

    // ── DONUT CHART ───────────────────────────

    function renderChart(r) {
        const canvas = document.getElementById('tax-donut-chart');
        if (!canvas) return;
        if (window._taxDonut) { window._taxDonut.destroy(); window._taxDonut = null; }

        const segments = [
            { label: 'Federal Income Tax', value: r.federal.tax + r.ltcgTax, color: 'rgba(217,119,87,0.85)' },
            { label: 'Social Security',    value: r.fica.ssTax + (r.fica.seTaxTotal * 0.5), color: 'rgba(107,191,142,0.85)' },
            { label: 'Medicare',           value: r.fica.medicareTax + r.fica.addlMedicare + (r.fica.seTaxTotal * 0.5), color: 'rgba(107,159,217,0.85)' },
            { label: 'State Tax',          value: r.stateLocal.stateTax,  color: 'rgba(168,127,202,0.85)' },
            { label: 'Local Tax',          value: r.stateLocal.localTax,  color: 'rgba(138,133,128,0.85)' },
            { label: 'Take-Home',          value: r.takeHomeAnnual,       color: 'rgba(90,90,90,0.35)' },
        ].filter(s => s.value > 0.01);

        window._taxDonut = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: segments.map(s => s.label),
                datasets: [{
                    data: segments.map(s => s.value.toFixed(2)),
                    backgroundColor: segments.map(s => s.color),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.label}: ${fmt(parseFloat(ctx.raw))} (${pct(parseFloat(ctx.raw) / r.totalGross)})`
                        }
                    }
                }
            }
        });

        // Custom legend
        const legend = document.getElementById('tax-donut-legend');
        if (legend) {
            legend.innerHTML = segments.map(s => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="width:10px; height:10px; border-radius:2px; background:${s.color}; flex-shrink:0;"></div>
                    <span style="font-size:0.8rem; color:var(--text-muted);">${s.label}</span>
                </div>
                <div style="text-align:right;">
                    <div style="font-family:var(--font-mono); font-size:0.8rem;">${fmt(s.value)}</div>
                    <div style="font-size:0.7rem; color:var(--text-faint);">${pct(s.value / r.totalGross)}</div>
                </div>
            </div>`).join('');
        }
    }

    // ── ACTIONS ───────────────────────────────

    // Reads all current form values into state — used by both calculate() and setDeductionMethod()
    function readForm(s) {
        s.grossIncome      = parseMoney(document.getElementById('tax-gross')?.value             || '');
        s.seIncome         = parseMoney(document.getElementById('tax-se')?.value                || '');
        s.ltcg             = parseMoney(document.getElementById('tax-ltcg')?.value              || '');
        s.otherIncome      = parseMoney(document.getElementById('tax-other')?.value             || '');
        s.filingStatus     = document.getElementById('tax-filing')?.value                       || 'single';
        // Custom standard deduction (inputs only rendered when standard-custom is active)
        s.stdDedSingle     = parseMoney(document.getElementById('tax-std-single')?.value        || '');
        s.stdDedMarried    = parseMoney(document.getElementById('tax-std-married')?.value       || '');
        s.stdDedHead       = parseMoney(document.getElementById('tax-std-head')?.value          || '');
        // Itemized line items (inputs only rendered when itemized is active)
        s.mortgageInterest = parseMoney(document.getElementById('tax-mortgage-interest')?.value || '');
        s.saltPropertyTax  = parseMoney(document.getElementById('tax-salt-property')?.value     || '');
        s.saltIncomeTax    = parseMoney(document.getElementById('tax-salt-income')?.value       || '');
        s.charitable       = parseMoney(document.getElementById('tax-charitable')?.value        || '');
        s.medicalExpenses  = parseMoney(document.getElementById('tax-medical')?.value           || '');
        s.otherItemized    = parseMoney(document.getElementById('tax-other-itemized')?.value    || '');
        // Pre-tax contributions
        s.contrib401k      = parseMoney(document.getElementById('tax-401k')?.value              || '');
        s.contribIRA       = parseMoney(document.getElementById('tax-ira')?.value               || '');
        s.contribHSA       = parseMoney(document.getElementById('tax-hsa')?.value               || '');
        s.healthPremiums   = parseMoney(document.getElementById('tax-health')?.value            || '');
        // State & local
        s.state            = document.getElementById('tax-state')?.value                        || '';
        s.localRate        = parseFloat(document.getElementById('tax-local')?.value             || '') || 0;
        return s;
    }

    function calculate() {
        const s = readForm(getState());
        saveState(s);
        render();
    }

    // Switch deduction method (Standard 2025 / Standard Custom / Itemized) without
    // losing any data the user already entered in other fields.
    function setDeductionMethod(method) {
        const s = readForm(getState());
        s.deductionMethod = method;
        saveState(s);
        render();
    }

    function reset() {
        saveState({});
        render();
    }

    function autoSave() {
        try { saveState(readForm(getState())); } catch (e) {}
    }

    // ── PUBLIC API ───────────────────────────
    return { render, calculate, autoSave, reset, setDeductionMethod, computeAll };

})();
