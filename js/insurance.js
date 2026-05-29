const Insurance = (() => {

    // ── CONFIGURATION ────────────────────────────────────────

    const TYPES = {
        medical:      { label: 'Medical',        icon: 'heart-pulse',  group: 'health',    badge: 'badge-red'     },
        dental:       { label: 'Dental',          icon: 'smile',        group: 'health',    badge: 'badge-accent'  },
        vision:       { label: 'Vision',          icon: 'eye',          group: 'health',    badge: 'badge-blue'    },
        'life-term':  { label: 'Life (Term)',      icon: 'shield',       group: 'life',      badge: 'badge-green'   },
        'life-whole': { label: 'Life (Whole)',     icon: 'shield-check', group: 'life',      badge: 'badge-green'   },
        disability:   { label: 'Disability',       icon: 'activity',     group: 'life',      badge: 'badge-muted'   },
        auto:         { label: 'Auto',             icon: 'car',          group: 'property',  badge: 'badge-accent'  },
        home:         { label: "Homeowner's",      icon: 'home',         group: 'property',  badge: 'badge-blue'    },
        renters:      { label: "Renter's",         icon: 'building-2',   group: 'property',  badge: 'badge-blue'    },
        umbrella:     { label: 'Umbrella',         icon: 'umbrella',     group: 'other',     badge: 'badge-magenta' },
        other:        { label: 'Other',            icon: 'file-text',    group: 'other',     badge: 'badge-muted'   },
    };

    const GROUPS = [
        { key: 'health',   label: 'Health',           types: ['medical', 'dental', 'vision'] },
        { key: 'property', label: 'Property',          types: ['auto', 'home', 'renters']     },
        { key: 'life',     label: 'Life & Disability', types: ['life-term', 'life-whole', 'disability'] },
        { key: 'other',    label: 'Other',             types: ['umbrella', 'other']            },
    ];

    // ── DATA ─────────────────────────────────────────────────

    function getPolicies() {
        const d = Data.get('insurance');
        return Array.isArray(d) ? d : [];
    }

    function savePolicies(arr) {
        Data.set('insurance', arr);
    }

    // ── HELPERS ──────────────────────────────────────────────

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }

    function fmt(n) {
        return '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    function fmtDec(n) {
        return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function toMonthly(amount, freq) {
        const m = { monthly: 1, annual: 1/12, semiannual: 1/6, biweekly: 26/12, semimonthly: 2, weekly: 52/12 };
        return (amount || 0) * (m[freq] || 1);
    }

    // Returns true when this coverage type has an out-of-pocket maximum field
    function hasOOP(type)      { return ['medical', 'dental', 'vision'].includes(type); }
    // Returns true when this coverage type has a coverage amount (face value) field
    function hasCoverage(type) { return ['life-term', 'life-whole', 'disability'].includes(type); }
    // Returns true when a term length field is relevant
    function hasTerm(type)     { return type === 'life-term'; }

    function readPolicy(prefix) {
        const type     = document.getElementById(prefix + '-type').value;
        const name     = document.getElementById(prefix + '-name').value.trim();
        const provider = document.getElementById(prefix + '-provider').value.trim();
        const premium  = parseMoney(document.getElementById(prefix + '-premium').value);
        const freq     = document.getElementById(prefix + '-freq').value;
        const deduct   = parseMoney(document.getElementById(prefix + '-deductible').value);
        const oopMax   = hasOOP(type)      ? parseMoney(document.getElementById(prefix + '-oop').value)      : 0;
        const coverage = hasCoverage(type) ? parseMoney(document.getElementById(prefix + '-coverage').value) : 0;
        const termYrs  = hasTerm(type)     ? parseInt(document.getElementById(prefix + '-term').value) || 0  : 0;
        const notes    = document.getElementById(prefix + '-notes').value.trim();
        return { type, name, provider, premium, premiumFreq: freq, deductible: deduct, oopMax, coverage, termYears: termYrs, notes };
    }

    // ── ACTIONS ──────────────────────────────────────────────

    function toggleAddForm() {
        const form = document.getElementById('ins-add-form');
        if (!form) return;
        const open = form.style.display !== 'none';
        form.style.display = open ? 'none' : 'block';
        const chev = document.getElementById('ins-add-chev');
        if (chev) chev.style.transform = open ? '' : 'rotate(45deg)';
        if (!open) updateFormFields('ins');
    }

    function updateFormFields(prefix) {
        const type = document.getElementById(prefix + '-type')?.value || '';
        const rows = {
            [prefix + '-oop-row']:  hasOOP(type),
            [prefix + '-cov-row']:  hasCoverage(type),
            [prefix + '-term-row']: hasTerm(type),
        };
        Object.entries(rows).forEach(([id, show]) => {
            const el = document.getElementById(id);
            if (el) el.style.display = show ? '' : 'none';
        });
    }

    function addPolicy() {
        const p = readPolicy('ins');
        if (!p.name) { Toast.show('Policy name is required'); return; }

        const policies = getPolicies();
        policies.push({ id: uid(), ...p });
        savePolicies(policies);

        // Clear form fields
        ['ins-name', 'ins-provider', 'ins-premium', 'ins-deductible',
         'ins-oop', 'ins-coverage', 'ins-term', 'ins-notes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('ins-type').value = 'medical';
        updateFormFields('ins');

        render();
        Toast.show('Policy added');
    }

    function deletePolicy(id) {
        savePolicies(getPolicies().filter(p => p.id !== id));
        render();
    }

    function openEditModal(id) {
        const p = getPolicies().find(p => p.id === id);
        if (!p) return;

        const overlay = document.getElementById('ins-edit-modal');
        overlay.innerHTML = `
            <div class="modal" style="max-width:640px; width:100%;">
                <div class="modal-header">
                    <span class="modal-title">Edit Policy</span>
                    <button class="modal-close" onclick="Insurance.closeEditModal()">✕</button>
                </div>
                <div style="padding:20px 24px;">
                    ${buildForm('ins-edit')}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-ghost" onclick="Insurance.closeEditModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="Insurance.saveEdit('${id}')">Save Changes</button>
                </div>
            </div>
        `;

        // Populate values
        document.getElementById('ins-edit-type').value       = p.type || 'other';
        document.getElementById('ins-edit-name').value       = p.name || '';
        document.getElementById('ins-edit-provider').value   = p.provider || '';
        document.getElementById('ins-edit-premium').value    = p.premium || '';
        document.getElementById('ins-edit-freq').value       = p.premiumFreq || 'monthly';
        document.getElementById('ins-edit-deductible').value = p.deductible || '';
        document.getElementById('ins-edit-oop').value        = p.oopMax || '';
        document.getElementById('ins-edit-coverage').value   = p.coverage || '';
        document.getElementById('ins-edit-term').value       = p.termYears || '';
        document.getElementById('ins-edit-notes').value      = p.notes || '';

        updateFormFields('ins-edit');
        CurrencyInput.applyAll();
        overlay.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
    }

    function closeEditModal() {
        const overlay = document.getElementById('ins-edit-modal');
        if (overlay) { overlay.style.display = 'none'; overlay.innerHTML = ''; }
    }

    function saveEdit(id) {
        const p = readPolicy('ins-edit');
        if (!p.name) { Toast.show('Policy name is required'); return; }

        const policies = getPolicies().map(pol =>
            pol.id === id ? { ...pol, ...p } : pol
        );
        savePolicies(policies);
        closeEditModal();
        render();
        Toast.show('Policy updated');
    }

    // ── FORM BUILDER ─────────────────────────────────────────

    function buildForm(prefix) {
        const typeOptions = Object.entries(TYPES)
            .map(([v, t]) => `<option value="${v}">${t.label}</option>`)
            .join('');

        return `
            <div class="form-row-3">
                <div class="form-group">
                    <label class="form-label">Coverage Type</label>
                    <select id="${prefix}-type" class="form-select"
                            onchange="Insurance.updateFormFields('${prefix}')">
                        ${typeOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Policy Name</label>
                    <input type="text" id="${prefix}-name" class="form-input"
                           placeholder="e.g. Blue Cross PPO">
                </div>
                <div class="form-group">
                    <label class="form-label">Provider / Carrier</label>
                    <input type="text" id="${prefix}-provider" class="form-input"
                           placeholder="e.g. Blue Cross">
                </div>
            </div>

            <div class="form-row-3" style="margin-top:12px;">
                <div class="form-group">
                    <label class="form-label">Premium</label>
                    <input type="text" inputmode="decimal" data-fmt="currency"
                           id="${prefix}-premium" class="form-input" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label class="form-label">Frequency</label>
                    <select id="${prefix}-freq" class="form-select">
                        <option value="monthly">Monthly</option>
                        <option value="biweekly">Bi-Weekly</option>
                        <option value="semimonthly">Semi-Monthly</option>
                        <option value="semiannual">Semi-Annual (2×/yr)</option>
                        <option value="annual">Annual</option>
                        <option value="weekly">Weekly</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Deductible</label>
                    <input type="text" inputmode="decimal" data-fmt="currency"
                           id="${prefix}-deductible" class="form-input" placeholder="0">
                </div>
            </div>

            <div id="${prefix}-oop-row" style="margin-top:12px; display:none;">
                <div class="form-group" style="max-width:220px;">
                    <label class="form-label">Out-of-Pocket Maximum</label>
                    <input type="text" inputmode="decimal" data-fmt="currency"
                           id="${prefix}-oop" class="form-input" placeholder="0">
                </div>
            </div>

            <div id="${prefix}-cov-row" style="margin-top:12px; display:none;">
                <div class="form-group" style="max-width:220px;">
                    <label class="form-label">Coverage Amount</label>
                    <input type="text" inputmode="decimal" data-fmt="currency"
                           id="${prefix}-coverage" class="form-input" placeholder="e.g. 500000">
                </div>
            </div>

            <div id="${prefix}-term-row" style="margin-top:12px; display:none;">
                <div class="form-group" style="max-width:160px;">
                    <label class="form-label">Term (years)</label>
                    <input type="number" id="${prefix}-term" class="form-input"
                           placeholder="e.g. 20" min="1" max="50">
                </div>
            </div>

            <div style="margin-top:12px;">
                <div class="form-group">
                    <label class="form-label">Notes <span style="color:var(--text-faint); font-weight:400;">(optional)</span></label>
                    <input type="text" id="${prefix}-notes" class="form-input"
                           placeholder="Network type, policy number, employer-sponsored, etc.">
                </div>
            </div>
        `;
    }

    // ── RENDER ───────────────────────────────────────────────

    function render() {
        const policies = getPolicies();
        const totalMonthly  = policies.reduce((s, p) => s + toMonthly(p.premium, p.premiumFreq), 0);
        const allDeductibles = policies.map(p => p.deductible || 0);
        const highestDeduct  = allDeductibles.length ? Math.max(...allDeductibles) : 0;
        const topPolicy      = highestDeduct > 0 ? policies.find(p => (p.deductible || 0) === highestDeduct) : null;

        document.getElementById('page-insurance').innerHTML = `
            <div class="page-header">
                <h2>Insurance</h2>
                <p>Track your coverages, premiums, and deductibles &mdash; highest deductible feeds into FOO Step 1</p>
            </div>

            <div class="summary-grid" style="grid-template-columns:repeat(3,1fr); margin-bottom:20px;">
                <div class="summary-card">
                    <div class="label">Monthly Premiums</div>
                    <div class="value">${fmtDec(totalMonthly)}</div>
                    <div class="sub">${fmtDec(totalMonthly * 12)} / year</div>
                </div>
                <div class="summary-card">
                    <div class="label">Highest Deductible</div>
                    <div class="value ${highestDeduct > 0 ? '' : 'value-muted'}">${highestDeduct > 0 ? fmt(highestDeduct) : '—'}</div>
                    <div class="sub">${topPolicy ? topPolicy.name : 'Add a policy to auto-populate FOO Step 1'}</div>
                </div>
                <div class="summary-card">
                    <div class="label">Active Policies</div>
                    <div class="value">${policies.length}</div>
                    <div class="sub">${GROUPS
                        .map(g => {
                            const n = policies.filter(p => TYPES[p.type]?.group === g.key).length;
                            return n > 0 ? `${n} ${g.label}` : '';
                        })
                        .filter(Boolean).join(' &middot; ') || 'None yet'}</div>
                </div>
            </div>

            <div class="card" style="margin-bottom:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none;"
                     onclick="Insurance.toggleAddForm()">
                    <span class="card-title" style="margin:0;">Add Policy</span>
                    <i data-lucide="plus" id="ins-add-chev"
                       style="width:16px;height:16px; color:var(--text-faint); transition:transform 0.2s;"></i>
                </div>
                <div id="ins-add-form" style="display:none; margin-top:16px; border-top:1px solid var(--border); padding-top:16px;">
                    ${buildForm('ins')}
                    <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:18px;">
                        <button class="btn btn-ghost" onclick="Insurance.toggleAddForm()">Cancel</button>
                        <button class="btn btn-primary" onclick="Insurance.addPolicy()">Add Policy</button>
                    </div>
                </div>
            </div>

            ${policies.length === 0
                ? `<div class="card empty-state">
                       <i data-lucide="shield-off" class="empty-state-icon"></i>
                       No policies yet — click <strong>Add Policy</strong> above to get started.
                   </div>`
                : GROUPS.map(g => {
                    const grpPolicies = policies.filter(p => TYPES[p.type]?.group === g.key);
                    if (!grpPolicies.length) return '';
                    return `
                        <div style="margin-bottom:24px;">
                            <div class="ins-group-label">${g.label}</div>
                            <div class="ins-grid">
                                ${grpPolicies.map(p => renderCard(p)).join('')}
                            </div>
                        </div>`;
                }).join('')}
        `;

        if (window.lucide) lucide.createIcons();
    }

    function renderCard(p) {
        const t       = TYPES[p.type] || TYPES.other;
        const monthly = toMonthly(p.premium, p.premiumFreq);

        const stats = [
            p.deductible > 0 ? { label: 'Deductible',  value: fmt(p.deductible) }    : null,
            monthly > 0      ? { label: 'Monthly',      value: fmtDec(monthly) }      : null,
            p.oopMax > 0     ? { label: 'OOP Max',      value: fmt(p.oopMax) }        : null,
            p.coverage > 0   ? { label: 'Coverage',     value: fmt(p.coverage) }      : null,
            p.termYears > 0  ? { label: 'Term',         value: p.termYears + ' yrs' } : null,
        ].filter(Boolean);

        return `
            <div class="card ins-card">
                <div class="ins-card-top">
                    <span class="badge ${t.badge}">${t.label}</span>
                    <div style="display:flex; gap:2px;">
                        <button class="edit-row-btn"   onclick="Insurance.openEditModal('${p.id}')" title="Edit">✎</button>
                        <button class="delete-row-btn" onclick="Insurance.deletePolicy('${p.id}')"  title="Remove">✕</button>
                    </div>
                </div>
                <div class="ins-card-name">${p.name}</div>
                ${p.provider ? `<div class="ins-card-provider">${p.provider}</div>` : ''}
                <div class="ins-card-stats">
                    ${stats.map(s => `
                        <div class="ins-stat">
                            <div class="ins-stat-label">${s.label}</div>
                            <div class="ins-stat-value">${s.value}</div>
                        </div>`).join('')}
                </div>
                ${p.notes ? `<div class="ins-card-notes">${p.notes}</div>` : ''}
            </div>
        `;
    }

    return {
        render,
        toggleAddForm,
        updateFormFields,
        addPolicy,
        deletePolicy,
        openEditModal,
        closeEditModal,
        saveEdit,
    };

})();
