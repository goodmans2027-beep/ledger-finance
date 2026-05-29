/**
 * savings.js — Savings Goals
 * ----------------------------
 * Create and track progress toward personal savings goals.
 * Each goal has a name, target amount, current amount, monthly contribution,
 * optional target date, emoji, color, and notes.
 *
 * Savings.render()              — render full page
 * Savings.openAddModal()        — show add-goal modal
 * Savings.saveGoal()            — save new goal from modal
 * Savings.openEditModal(id)     — open edit modal for existing goal
 * Savings.saveEdit()            — save edits
 * Savings.openDepositModal(id)  — quick deposit / withdraw modal
 * Savings.saveDeposit()         — apply deposit or withdrawal
 * Savings.deleteGoal(id)        — remove a goal
 */

const Savings = (() => {

    // ── HELPERS ──────────────────────────────

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }

    function fmt(n) {
        return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtMonthYear(yyyymm) {
        if (!yyyymm) return '—';
        const [y, m] = yyyymm.split('-');
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return (months[parseInt(m, 10) - 1] || '') + ' ' + y;
    }

    // Projected completion date based on monthly contribution alone.
    function projectedCompletion(goal) {
        const remaining = goal.targetAmount - goal.currentAmount;
        if (remaining <= 0) return null; // already done
        if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return null;
        const months = Math.ceil(remaining / goal.monthlyContribution);
        const d = new Date();
        d.setMonth(d.getMonth() + months);
        return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    // Months from today to the target date.
    function monthsToTarget(goal) {
        if (!goal.targetDate) return null;
        const [ty, tm] = goal.targetDate.split('-').map(Number);
        const now = new Date();
        return (ty - now.getFullYear()) * 12 + (tm - (now.getMonth() + 1));
    }

    // 'complete' | 'on-track' | 'behind' | 'saving'
    function goalStatus(goal) {
        if (goal.currentAmount >= goal.targetAmount) return 'complete';
        if (!goal.targetDate) return 'saving';
        const mToTarget = monthsToTarget(goal);
        if (mToTarget <= 0) return 'behind';
        if (!goal.monthlyContribution || goal.monthlyContribution <= 0) return 'behind';
        const remaining = goal.targetAmount - goal.currentAmount;
        const mNeeded = Math.ceil(remaining / goal.monthlyContribution);
        return mNeeded <= mToTarget ? 'on-track' : 'behind';
    }

    const STATUS_LABEL = {
        complete:  '✓ Complete',
        'on-track': 'On Track',
        behind:    'Behind',
        saving:    'Saving'
    };
    const STATUS_BADGE = {
        complete:  'badge-green',
        'on-track': 'badge-accent',
        behind:    'badge-red',
        saving:    'badge-muted'
    };

    const PRESET_COLORS = [
        '#D97757', // accent orange
        '#6BBF8E', // green
        '#6B9FD9', // blue
        '#9471B1', // purple
        '#D9B96B', // gold
        '#D96B6B', // red
        '#5BBFB5', // teal
        '#8E9AAF'  // slate
    ];

    // ── STATE ─────────────────────────────────

    function getGoals() {
        const d = Data.get('savingsGoals');
        return Array.isArray(d) ? d : [];
    }

    function setGoals(g) { Data.set('savingsGoals', g); }

    // ── RENDER ───────────────────────────────

    function render() {
        const goals = getGoals();
        document.getElementById('page-savings').innerHTML = buildPage(goals);
        CurrencyInput.applyAll();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── PAGE BUILDER ─────────────────────────

    function buildPage(goals) {
        const totalSaved   = goals.reduce((s, g) => s + (g.currentAmount || 0), 0);
        const totalTarget  = goals.reduce((s, g) => s + (g.targetAmount || 0), 0);
        const complete     = goals.filter(g => (g.currentAmount || 0) >= (g.targetAmount || 0)).length;
        const monthlyTotal = goals.reduce((s, g) => s + (g.monthlyContribution || 0), 0);
        const overallPct   = totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0;

        return `
        <div class="page-header">
            <h2>Savings Goals</h2>
            <p>Set targets, track progress, and stay on schedule toward every financial milestone</p>
        </div>

        <!-- ── SUMMARY CARDS ── -->
        <div class="summary-grid" style="grid-template-columns:repeat(4,1fr); margin-bottom:20px;">
            <div class="summary-card">
                <div class="label">Total Saved</div>
                <div class="value value-green">${fmt(totalSaved)}</div>
                <div class="sub">across all goals</div>
            </div>
            <div class="summary-card">
                <div class="label">Total Target</div>
                <div class="value value-accent">${fmt(totalTarget)}</div>
                <div class="sub">combined goals</div>
            </div>
            <div class="summary-card">
                <div class="label">Goals Complete</div>
                <div class="value ${complete > 0 ? 'value-green' : ''}">${complete} / ${goals.length}</div>
                <div class="sub">${overallPct.toFixed(0)}% overall progress</div>
            </div>
            <div class="summary-card">
                <div class="label">Monthly Saving</div>
                <div class="value value-accent">${fmt(monthlyTotal)}</div>
                <div class="sub">total contributions</div>
            </div>
        </div>

        <!-- ── OVERALL PROGRESS BAR ── -->
        ${totalTarget > 0 ? `
        <div class="card" style="margin-bottom:16px; padding:16px 24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-family:var(--font-mono); font-size:0.68rem; text-transform:uppercase;
                             letter-spacing:0.08em; color:var(--text-muted);">Overall Progress</span>
                <span style="font-family:var(--font-mono); font-size:0.82rem; color:var(--text-muted);">
                    ${fmt(totalSaved)} of ${fmt(totalTarget)} &nbsp;·&nbsp; ${overallPct.toFixed(1)}%
                </span>
            </div>
            <div class="progress-bar-wrap" style="height:8px;">
                <div class="progress-bar" style="width:${overallPct.toFixed(1)}%; background:var(--green);"></div>
            </div>
        </div>` : ''}

        <!-- ── GOALS GRID ── -->
        <div class="card" style="padding-bottom:${goals.length ? '8px' : '22px'};">
            <div class="section-header">
                <span class="card-title" style="margin:0;">Your Goals</span>
                <button class="btn btn-primary" style="font-size:0.78rem; padding:6px 14px;"
                        onclick="Savings.openAddModal()">+ New Goal</button>
            </div>

            ${goals.length === 0 ? `
            <div style="text-align:center; padding:52px 20px; color:var(--text-muted);">
                <div style="font-size:2.6rem; margin-bottom:14px;">🎯</div>
                <div style="font-size:0.95rem; font-weight:500; color:var(--text); margin-bottom:8px;">No goals yet</div>
                <div style="font-size:0.84rem; max-width:340px; margin:0 auto; line-height:1.6;">
                    Create your first savings goal — emergency fund, vacation, down payment, anything that matters to you.
                </div>
            </div>
            ` : `
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px; margin-top:4px;">
                ${goals.map(buildGoalCard).join('')}
            </div>
            `}
        </div>`;
    }

    // ── GOAL CARD ─────────────────────────────

    function buildGoalCard(g) {
        const pct       = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
        const status    = goalStatus(g);
        const color     = g.color || PRESET_COLORS[0];
        const projected = projectedCompletion(g);
        const remaining = Math.max(0, g.targetAmount - g.currentAmount);
        const mToTarget = monthsToTarget(g);

        // What to show in the "projected" meta row
        let projLine = '';
        if (status === 'complete') {
            projLine = `<div style="display:flex; align-items:center; gap:5px;">
                <i data-lucide="check-circle" style="width:13px; height:13px; color:var(--green); flex-shrink:0;"></i>
                <span style="font-family:var(--font-mono); font-size:0.76rem; color:var(--green);">Goal reached!</span>
            </div>`;
        } else if (projected) {
            const isLate = g.targetDate && mToTarget !== null && mToTarget >= 0 && status === 'behind';
            projLine = `<div style="display:flex; align-items:center; gap:5px;">
                <i data-lucide="flag" style="width:13px; height:13px; color:${isLate ? 'var(--red)' : 'var(--text-faint)'}; flex-shrink:0;"></i>
                <span style="font-family:var(--font-mono); font-size:0.76rem; color:${isLate ? 'var(--red)' : 'var(--text-muted)'};">Projected: ${projected}</span>
            </div>`;
        }

        return `
        <div style="background:var(--surface2); border:1px solid var(--border); border-radius:var(--radius);
                    padding:20px; display:flex; flex-direction:column; gap:12px;
                    border-top:3px solid ${color};">

            <!-- Header -->
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
                <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                    <span style="font-size:1.5rem; flex-shrink:0; line-height:1;">${g.emoji || '🎯'}</span>
                    <div style="min-width:0;">
                        <div style="font-weight:600; font-size:0.96rem; color:var(--text);
                                    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${g.name}</div>
                        ${g.notes ? `<div style="font-size:0.74rem; color:var(--text-muted); margin-top:2px;
                                                  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${g.notes}</div>` : ''}
                    </div>
                </div>
                <span class="badge ${STATUS_BADGE[status]}" style="flex-shrink:0; white-space:nowrap;">
                    ${STATUS_LABEL[status]}
                </span>
            </div>

            <!-- Amount + progress -->
            <div>
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:7px;">
                    <span style="font-family:var(--font-serif); font-size:1.35rem; font-weight:600; color:${color};">${fmt(g.currentAmount)}</span>
                    <span style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-muted);">of ${fmt(g.targetAmount)}</span>
                </div>
                <div class="progress-bar-wrap" style="height:7px;">
                    <div class="progress-bar" style="width:${pct.toFixed(1)}%; background:${color};"></div>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:5px;">
                    <span style="font-family:var(--font-mono); font-size:0.71rem; color:var(--text-muted);">${pct.toFixed(0)}% complete</span>
                    <span style="font-family:var(--font-mono); font-size:0.71rem; color:var(--text-muted);">${fmt(remaining)} to go</span>
                </div>
            </div>

            <!-- Meta row (contribution · target date · projected) -->
            <div style="display:flex; flex-direction:column; gap:5px;">
                ${g.monthlyContribution ? `
                <div style="display:flex; align-items:center; gap:5px;">
                    <i data-lucide="trending-up" style="width:13px; height:13px; color:var(--text-faint); flex-shrink:0;"></i>
                    <span style="font-family:var(--font-mono); font-size:0.76rem; color:var(--text-muted);">${fmt(g.monthlyContribution)}/mo contribution</span>
                </div>` : ''}
                ${g.targetDate ? `
                <div style="display:flex; align-items:center; gap:5px;">
                    <i data-lucide="calendar" style="width:13px; height:13px; color:var(--text-faint); flex-shrink:0;"></i>
                    <span style="font-family:var(--font-mono); font-size:0.76rem; color:var(--text-muted);">Target: ${fmtMonthYear(g.targetDate)}</span>
                </div>` : ''}
                ${projLine}
            </div>

            <!-- Action buttons -->
            <div style="display:flex; gap:8px; padding-top:8px; border-top:1px solid var(--border); margin-top:auto;">
                <button class="btn btn-ghost" style="flex:1; font-size:0.78rem; padding:7px 10px;"
                        onclick="Savings.openDepositModal('${g.id}')">+ Add Funds</button>
                <button class="edit-row-btn"
                        onclick="Savings.openEditModal('${g.id}')"
                        title="Edit goal">✎</button>
                <button class="delete-row-btn"
                        style="padding:7px 10px; border:1px solid var(--border); border-radius:var(--radius);"
                        onclick="Savings.deleteGoal('${g.id}')" title="Delete goal">✕</button>
            </div>
        </div>`;
    }

    // ── COLOR SWATCH HELPERS ──────────────────

    function _buildColorSwatches(nameAttr, selectedIdx) {
        return PRESET_COLORS.map((c, i) => `
            <label style="cursor:pointer; display:inline-flex;">
                <input type="radio" name="${nameAttr}" value="${c}" ${i === selectedIdx ? 'checked' : ''}
                       style="display:none;" id="${nameAttr}-${i}">
                <span id="${nameAttr}-swatch-${i}"
                      onclick="Savings._selectSwatch('${nameAttr}',${i})"
                      style="display:inline-block; width:26px; height:26px; border-radius:50%;
                             background:${c}; cursor:pointer; transition:all 0.15s;
                             border:2px solid ${i === selectedIdx ? '#fff' : 'transparent'};
                             box-shadow:${i === selectedIdx ? '0 0 0 2px ' + c : 'none'};"></span>
            </label>`
        ).join('');
    }

    function _selectSwatch(nameAttr, idx) {
        PRESET_COLORS.forEach((c, i) => {
            const sw = document.getElementById(nameAttr + '-swatch-' + i);
            if (!sw) return;
            if (i === idx) {
                sw.style.border = '2px solid #fff';
                sw.style.boxShadow = '0 0 0 2px ' + c;
            } else {
                sw.style.border = '2px solid transparent';
                sw.style.boxShadow = 'none';
            }
            const radio = document.getElementById(nameAttr + '-' + i);
            if (radio) radio.checked = (i === idx);
        });
    }

    // ── MODAL UTILITIES ───────────────────────

    function _removeModal(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function _createModal(id, title, bodyHtml, onSave, onCancel) {
        _removeModal(id);
        const m = document.createElement('div');
        m.id = id;
        m.className = 'modal-overlay open';
        m.innerHTML = `
        <div class="modal" style="width:560px; max-width:96vw;">
            <div class="modal-header">
                <span class="modal-title">${title}</span>
                <button class="modal-close" onclick="(${onCancel})()">✕</button>
            </div>
            ${bodyHtml}
            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:16px;">
                <button class="btn btn-ghost" onclick="(${onCancel})()">Cancel</button>
                <button class="btn btn-primary" onclick="(${onSave})()">Save</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        m.addEventListener('click', e => { if (e.target === m) onCancel(); });
        CurrencyInput.applyAll();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ── ADD MODAL ────────────────────────────

    function openAddModal() {
        _removeModal('sav-add-modal');
        const m = document.createElement('div');
        m.id = 'sav-add-modal';
        m.className = 'modal-overlay open';
        m.innerHTML = `
        <div class="modal" style="width:560px; max-width:96vw;">
            <div class="modal-header">
                <span class="modal-title">New Savings Goal</span>
                <button class="modal-close" onclick="Savings.closeAddModal()">✕</button>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Goal Name</label>
                    <input type="text" id="sav-name" placeholder="e.g. Emergency Fund">
                </div>
                <div class="form-group" style="max-width:100px;">
                    <label>Emoji</label>
                    <input type="text" id="sav-emoji" placeholder="🎯" maxlength="2">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Target Amount</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="sav-target" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label>Amount Already Saved</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="sav-current" placeholder="0.00">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Monthly Contribution</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="sav-monthly" placeholder="0.00">
                </div>
                <div class="form-group">
                    <label>Target Date <span style="font-size:0.65rem; color:var(--text-faint);">(optional)</span></label>
                    <input type="month" id="sav-date">
                </div>
            </div>

            <div class="form-group">
                <label>Notes <span style="font-size:0.65rem; color:var(--text-faint);">(optional)</span></label>
                <input type="text" id="sav-notes" placeholder="e.g. 6 months of living expenses">
            </div>

            <div class="form-group" style="margin-bottom:0;">
                <label>Color</label>
                <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
                    ${_buildColorSwatches('sav-add-color', 0)}
                </div>
            </div>

            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
                <button class="btn btn-ghost" onclick="Savings.closeAddModal()">Cancel</button>
                <button class="btn btn-primary" onclick="Savings.saveGoal()">Create Goal</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        m.addEventListener('click', e => { if (e.target === m) Savings.closeAddModal(); });
        CurrencyInput.applyAll();
        setTimeout(() => document.getElementById('sav-name')?.focus(), 60);
    }

    function closeAddModal() { _removeModal('sav-add-modal'); }

    function saveGoal() {
        const name   = document.getElementById('sav-name')?.value.trim();
        const emoji  = document.getElementById('sav-emoji')?.value.trim() || '🎯';
        const target = parseMoney(document.getElementById('sav-target')?.value);
        const current = parseMoney(document.getElementById('sav-current')?.value);
        const monthly = parseMoney(document.getElementById('sav-monthly')?.value);
        const date   = document.getElementById('sav-date')?.value || null;
        const notes  = document.getElementById('sav-notes')?.value.trim() || '';
        const cr     = document.querySelector('input[name="sav-add-color"]:checked');
        const color  = cr ? cr.value : PRESET_COLORS[0];

        if (!name)   { Toast.show('Please enter a goal name.'); return; }
        if (!target) { Toast.show('Please enter a target amount.'); return; }

        const goals = getGoals();
        goals.push({
            id: uid(), name, emoji, targetAmount: target, currentAmount: current,
            monthlyContribution: monthly, targetDate: date, notes, color,
            createdAt: new Date().toISOString().slice(0, 7)
        });
        setGoals(goals);
        closeAddModal();
        render();
        Toast.show('Goal created ✓');
    }

    // ── EDIT MODAL ───────────────────────────

    function openEditModal(id) {
        const g = getGoals().find(x => x.id === id);
        if (!g) return;

        _removeModal('sav-edit-modal');
        const colorIdx = Math.max(0, PRESET_COLORS.indexOf(g.color));

        const m = document.createElement('div');
        m.id = 'sav-edit-modal';
        m.className = 'modal-overlay open';
        m.innerHTML = `
        <div class="modal" style="width:560px; max-width:96vw;">
            <div class="modal-header">
                <span class="modal-title">Edit Goal</span>
                <button class="modal-close" onclick="Savings.closeEditModal()">✕</button>
            </div>

            <input type="hidden" id="sav-edit-id" value="${g.id}">

            <div class="form-row">
                <div class="form-group">
                    <label>Goal Name</label>
                    <input type="text" id="sav-edit-name" value="${g.name}">
                </div>
                <div class="form-group" style="max-width:100px;">
                    <label>Emoji</label>
                    <input type="text" id="sav-edit-emoji" value="${g.emoji || '🎯'}" maxlength="2">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Target Amount</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="sav-edit-target" value="${g.targetAmount}">
                </div>
                <div class="form-group">
                    <label>Current Amount Saved</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="sav-edit-current" value="${g.currentAmount}">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Monthly Contribution</label>
                    <input type="text" inputmode="decimal" data-fmt="currency" id="sav-edit-monthly" value="${g.monthlyContribution || ''}">
                </div>
                <div class="form-group">
                    <label>Target Date <span style="font-size:0.65rem; color:var(--text-faint);">(optional)</span></label>
                    <input type="month" id="sav-edit-date" value="${g.targetDate || ''}">
                </div>
            </div>

            <div class="form-group">
                <label>Notes <span style="font-size:0.65rem; color:var(--text-faint);">(optional)</span></label>
                <input type="text" id="sav-edit-notes" value="${g.notes || ''}" placeholder="e.g. 6 months of living expenses">
            </div>

            <div class="form-group" style="margin-bottom:0;">
                <label>Color</label>
                <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
                    ${_buildColorSwatches('sav-edit-color', colorIdx)}
                </div>
            </div>

            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
                <button class="btn btn-ghost" onclick="Savings.closeEditModal()">Cancel</button>
                <button class="btn btn-primary" onclick="Savings.saveEdit()">Save Changes</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        m.addEventListener('click', e => { if (e.target === m) Savings.closeEditModal(); });
        CurrencyInput.applyAll();
    }

    function closeEditModal() { _removeModal('sav-edit-modal'); }

    function saveEdit() {
        const id     = document.getElementById('sav-edit-id')?.value;
        const name   = document.getElementById('sav-edit-name')?.value.trim();
        const emoji  = document.getElementById('sav-edit-emoji')?.value.trim() || '🎯';
        const target = parseMoney(document.getElementById('sav-edit-target')?.value);
        const current = parseMoney(document.getElementById('sav-edit-current')?.value);
        const monthly = parseMoney(document.getElementById('sav-edit-monthly')?.value);
        const date   = document.getElementById('sav-edit-date')?.value || null;
        const notes  = document.getElementById('sav-edit-notes')?.value.trim() || '';
        const cr     = document.querySelector('input[name="sav-edit-color"]:checked');
        const color  = cr ? cr.value : PRESET_COLORS[0];

        if (!name)   { Toast.show('Please enter a goal name.'); return; }
        if (!target) { Toast.show('Please enter a target amount.'); return; }

        const goals = getGoals();
        const idx = goals.findIndex(g => g.id === id);
        if (idx === -1) return;

        goals[idx] = {
            ...goals[idx], name, emoji,
            targetAmount: target, currentAmount: current,
            monthlyContribution: monthly, targetDate: date, notes, color
        };
        setGoals(goals);
        closeEditModal();
        render();
        Toast.show('Goal updated ✓');
    }

    // ── DEPOSIT / WITHDRAW MODAL ─────────────

    function openDepositModal(id) {
        const g = getGoals().find(x => x.id === id);
        if (!g) return;

        _removeModal('sav-dep-modal');
        const pct       = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
        const remaining = Math.max(0, g.targetAmount - g.currentAmount);
        const color     = g.color || PRESET_COLORS[0];

        const m = document.createElement('div');
        m.id = 'sav-dep-modal';
        m.className = 'modal-overlay open';
        m.innerHTML = `
        <div class="modal" style="width:400px; max-width:96vw;">
            <div class="modal-header">
                <span class="modal-title">${g.emoji || '🎯'} ${g.name}</span>
                <button class="modal-close" onclick="Savings.closeDepositModal()">✕</button>
            </div>

            <input type="hidden" id="sav-dep-id" value="${g.id}">

            <!-- Balance summary -->
            <div style="background:var(--surface2); border-radius:var(--radius); padding:16px; margin-bottom:20px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                    <span style="font-size:0.8rem; color:var(--text-muted);">Current Balance</span>
                    <span style="font-family:var(--font-mono); font-weight:600; color:var(--green);">${fmt(g.currentAmount)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span style="font-size:0.8rem; color:var(--text-muted);">Still Needed</span>
                    <span style="font-family:var(--font-mono); color:var(--text-muted);">${fmt(remaining)}</span>
                </div>
                <div class="progress-bar-wrap" style="height:6px;">
                    <div class="progress-bar" style="width:${pct.toFixed(1)}%; background:${color};"></div>
                </div>
            </div>

            <!-- Operation toggle -->
            <div class="form-group">
                <label>Operation</label>
                <div style="display:flex; border:1px solid var(--border); border-radius:8px; overflow:hidden; margin-top:4px;">
                    <button id="sav-dep-btn-add" onclick="Savings._setDepOp('add')"
                        style="flex:1; padding:10px; font-size:0.83rem; font-weight:600;
                               border:none; cursor:pointer; background:var(--green); color:#fff; transition:all 0.15s;">
                        + Deposit
                    </button>
                    <button id="sav-dep-btn-withdraw" onclick="Savings._setDepOp('withdraw')"
                        style="flex:1; padding:10px; font-size:0.83rem; font-weight:400;
                               border:none; border-left:1px solid var(--border); cursor:pointer;
                               background:transparent; color:var(--text-muted); transition:all 0.15s;">
                        − Withdraw
                    </button>
                </div>
                <input type="hidden" id="sav-dep-op" value="add">
            </div>

            <div class="form-group" style="margin-bottom:0;">
                <label>Amount</label>
                <input type="text" inputmode="decimal" data-fmt="currency" id="sav-dep-amount" placeholder="0.00">
            </div>

            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
                <button class="btn btn-ghost" onclick="Savings.closeDepositModal()">Cancel</button>
                <button class="btn btn-primary" onclick="Savings.saveDeposit()">Apply</button>
            </div>
        </div>`;
        document.body.appendChild(m);
        m.addEventListener('click', e => { if (e.target === m) Savings.closeDepositModal(); });
        CurrencyInput.applyAll();
        setTimeout(() => document.getElementById('sav-dep-amount')?.focus(), 60);
    }

    function closeDepositModal() { _removeModal('sav-dep-modal'); }

    function _setDepOp(op) {
        document.getElementById('sav-dep-op').value = op;
        const addBtn = document.getElementById('sav-dep-btn-add');
        const wdBtn  = document.getElementById('sav-dep-btn-withdraw');
        if (op === 'add') {
            addBtn.style.cssText += 'background:var(--green); color:#fff; font-weight:600;';
            wdBtn.style.cssText  += 'background:transparent; color:var(--text-muted); font-weight:400;';
        } else {
            wdBtn.style.cssText  += 'background:var(--red); color:#fff; font-weight:600;';
            addBtn.style.cssText += 'background:transparent; color:var(--text-muted); font-weight:400;';
        }
    }

    function saveDeposit() {
        const id     = document.getElementById('sav-dep-id')?.value;
        const op     = document.getElementById('sav-dep-op')?.value;
        const amount = parseMoney(document.getElementById('sav-dep-amount')?.value);

        if (!amount) { Toast.show('Please enter an amount.'); return; }

        const goals = getGoals();
        const idx = goals.findIndex(g => g.id === id);
        if (idx === -1) return;

        const prev = goals[idx].currentAmount || 0;
        goals[idx].currentAmount = op === 'add'
            ? Math.round((prev + amount) * 100) / 100
            : Math.max(0, Math.round((prev - amount) * 100) / 100);

        setGoals(goals);
        closeDepositModal();
        render();
        Toast.show(op === 'add' ? fmt(amount) + ' added ✓' : fmt(amount) + ' withdrawn');
    }

    // ── DELETE ────────────────────────────────

    function deleteGoal(id) {
        if (!confirm('Delete this savings goal? This cannot be undone.')) return;
        setGoals(getGoals().filter(g => g.id !== id));
        render();
        Toast.show('Goal removed');
    }

    // ── PUBLIC API ───────────────────────────
    return {
        render,
        openAddModal, closeAddModal, saveGoal,
        openEditModal, closeEditModal, saveEdit,
        openDepositModal, closeDepositModal, saveDeposit,
        deleteGoal,
        _selectSwatch, _setDepOp
    };

})();
