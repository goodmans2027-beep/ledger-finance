/**
 * budget.js — Budget Planner
 * ---------------------------
 * Manages income streams, budget categories, and subscriptions.
 * All amounts converted to monthly/annual for consistent totals.
 * Subscription calendar shows due dates visually.
 *
 * Budget.render()              — render full page
 * Budget.addIncomeStream()     — show income form
 * Budget.saveIncomeStream()    — save new income stream
 * Budget.addCategory()         — show category form
 * Budget.saveCategoryForm()    — save new category
 * Budget.saveSubscription()    — save new subscription
 * Budget.prevMonth/nextMonth() — navigate calendar
 */

const Budget = (() => {

    // ── HELPERS ──────────────────────────────

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }

    function fmt(n) {
        return '$' + Number(n).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function getBudget() {
        const b = Data.get('budget') || {};
        const categories = Array.isArray(b.categories) ? b.categories : [];
        const migratedCats = categories.map(c => ({
            ...c,
            parentId: c.parentId !== undefined ? c.parentId : null,
            groupId: c.groupId !== undefined ? c.groupId : null
        }));
        return {
            incomeStreams: Array.isArray(b.incomeStreams) ? b.incomeStreams : [],
            categories: migratedCats,
            groups: Array.isArray(b.groups) ? b.groups : [],
            subscriptions: Array.isArray(b.subscriptions) ? b.subscriptions : []
        };
    }

    function saveBudget(data) {
        Data.set('budget', data);
    }

    function buildCategoryTree(categories) {
        const cats = Array.isArray(categories) ? categories : [];
        const map = cats.reduce((acc, cat) => {
            acc[cat.id] = cat;
            return acc;
        }, {});
        const children = {};

        cats.forEach(cat => {
            const parentId = cat.parentId || null;
            if (parentId && map[parentId]) {
                children[parentId] = children[parentId] || [];
                children[parentId].push(cat);
            }
        });

        const roots = cats.filter(cat => !cat.parentId || !map[cat.parentId]);
        return { roots, children, map };
    }

    function populateGroupSelect() {
        const select = document.getElementById('bud-cat-parent');
        if (!select) return;
        const b = getBudget();
        select.innerHTML = `
            <option value="">No group</option>
            ${(b.groups || []).map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
        `;
    }

    function aggregateTopLevelCategories(categories) {
        const cats = Array.isArray(categories) ? categories : [];
        const map = cats.reduce((acc, cat) => {
            acc[cat.id] = { ...cat };
            return acc;
        }, {});

        function findRoot(cat) {
            let current = cat;
            const seen = new Set();
            while (current && current.parentId && map[current.parentId] && !seen.has(current.parentId)) {
                seen.add(current.parentId);
                current = map[current.parentId];
            }
            return current || cat;
        }

        const totals = {};
        cats.forEach(cat => {
            const root = findRoot(cat);
            const monthly = toMonthly(cat.amount, cat.frequency);
            totals[root.id] = totals[root.id] || { id: root.id, name: root.name, monthly: 0 };
            totals[root.id].monthly += monthly;
        });

        return Object.values(totals);
    }

    // Convert any frequency to monthly amount
    function toMonthly(amount, frequency) {
        const map = {
            weekly: 52 / 12,
            biweekly: 26 / 12,
            semimonthly: 24 / 12,
            monthly: 1,
            '2months': 1 / 2,
            quarterly: 1 / 3,
            '6months': 1 / 6,
            semiannual: 1 / 6,
            annual: 1 / 12
        };
        return amount * (map[frequency] || 1);
    }

    function toAnnual(amount, frequency) {
        return toMonthly(amount, frequency) * 12;
    }

    function ordinal(n) {
        const v = n % 100;
        const s = ['th', 'st', 'nd', 'rd'];
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
    }

    function frequencyLabel(freq) {
        const labels = {
            weekly: 'Weekly',
            biweekly: 'Bi-Weekly',
            semimonthly: 'Semi-Monthly',
            monthly: 'Monthly',
            '2months': 'Every 2 Mo',
            quarterly: 'Quarterly',
            '6months': 'Every 6 Mo',
            semiannual: 'Semi-Annual',
            annual: 'Annual'
        };
        return labels[freq] || freq;
    }

    // ── TOTALS ───────────────────────────────

    function calcTotals() {
        const b = getBudget();

        const monthlyIncome = b.incomeStreams.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
        const yearlylncome = monthlyIncome * 12;

        const monthlyCats = b.categories.reduce((s, c) => s + toMonthly(c.amount, c.frequency), 0);
        const monthlySubs = b.subscriptions.reduce((s, sub) => {
            return s + toMonthly(sub.amount, sub.frequency);
        }, 0);
        const monthlyExpenses = monthlyCats + monthlySubs;
        const yearlyExpenses = monthlyExpenses * 12;

        const monthlySavings = monthlyIncome - monthlyExpenses;
        const yearlySavings = monthlySavings * 12;
        const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0;

        return {
            monthlyIncome, yearlylncome,
            monthlyExpenses, yearlyExpenses,
            monthlySavings, yearlySavings,
            avgMonthlySavings: yearlySavings / 12,
            savingsRate
        };
    }

    // ── RENDER ───────────────────────────────

    function render() {
        renderSummaryCards();
        renderIncomeTable();
        renderCategoriesTable();
        renderSubscriptionsTable();
        renderBreakdown();
        renderDonut();
    }

    function renderSummaryCards() {
        const t = calcTotals();
        const savCls = t.monthlySavings >= 0 ? 'value-green' : 'value-red';
        const rateCls = t.savingsRate >= 0 ? 'value-green' : 'value-red';

        document.getElementById('bud-monthly-income').textContent = fmt(t.monthlyIncome);
        document.getElementById('bud-monthly-expenses').textContent = fmt(t.monthlyExpenses);
        document.getElementById('bud-monthly-savings').textContent = fmt(t.monthlySavings);
        document.getElementById('bud-monthly-savings').className = 'value ' + savCls;
        document.getElementById('bud-savings-rate').textContent = t.savingsRate.toFixed(1) + '%';
        document.getElementById('bud-savings-rate').className = 'value ' + rateCls;
        document.getElementById('bud-yearly-income').textContent = fmt(t.yearlylncome);
        document.getElementById('bud-yearly-expenses').textContent = fmt(t.yearlyExpenses);
        document.getElementById('bud-yearly-savings').textContent = fmt(t.yearlySavings);
        document.getElementById('bud-yearly-savings').className = 'value ' + savCls;
        document.getElementById('bud-avg-monthly-savings').textContent = fmt(t.avgMonthlySavings);
        document.getElementById('bud-avg-monthly-savings').className = 'value ' + savCls;
    }

    // ── INCOME ───────────────────────────────

    function renderIncomeTable() {
        const b = getBudget();
        const tbody = document.getElementById('bud-income-table');
        const tfoot = document.getElementById('bud-income-totals');

        if (!b.incomeStreams.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">
                        No income streams yet. Add one above.
                    </td>
                </tr>`;
            tfoot.innerHTML = '';
            return;
        }

        tbody.innerHTML = b.incomeStreams.map(s => {
            const monthly = toMonthly(s.amount, s.frequency);
            const annual = monthly * 12;
            return `<tr>
                <td>
                    <input class="inline-edit" style="width:160px;"
                           value="${s.name}"
                           onchange="Budget.updateIncomeField('${s.id}', 'name', this.value)">
                </td>
                <td>
                    <input class="inline-edit" type="text" inputmode="decimal" data-fmt="currency"
                           value="${s.amount ? fmt(s.amount) : ''}"
                           placeholder="0.00"
                           onchange="Budget.updateIncomeField('${s.id}', 'amount', parseMoney(this.value))">
                </td>
                <td>
                    <select class="inline-select"
                            onchange="Budget.updateIncomeField('${s.id}', 'frequency', this.value)">
                        <option value="weekly"      ${s.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                        <option value="biweekly"    ${s.frequency === 'biweekly' ? 'selected' : ''}>Bi-Weekly</option>
                        <option value="semimonthly" ${s.frequency === 'semimonthly' ? 'selected' : ''}>Semi-Monthly</option>
                        <option value="monthly"     ${s.frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                        <option value="annual"      ${s.frequency === 'annual' ? 'selected' : ''}>Annual</option>
                    </select>
                </td>
                <td style="font-family:var(--font-mono); color:var(--green);">${fmt(monthly)}</td>
                <td style="font-family:var(--font-mono); color:var(--green);">${fmt(annual)}</td>
                <td>
                    <button class="delete-row-btn"
                            onclick="Budget.removeIncomeStream('${s.id}')">✕</button>
                </td>
            </tr>`;
        }).join('');

        const totalMonthly = b.incomeStreams.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
        const totalAnnual = totalMonthly * 12;

        tfoot.innerHTML = `
            <tr style="border-top:2px solid var(--border); font-weight:600;">
                <td colspan="3" style="padding:12px 14px; font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">Totals</td>
                <td style="font-family:var(--font-mono); padding:12px 14px; color:var(--green);">${fmt(totalMonthly)}</td>
                <td style="font-family:var(--font-mono); padding:12px 14px; color:var(--green);">${fmt(totalAnnual)}</td>
                <td></td>
            </tr>`;
    }

    function toggleIncomeForm() {
        const form = document.getElementById('bud-income-form');
        const isShowing = form.style.display === 'none';
        form.style.display = isShowing ? 'block' : 'none';
        if (isShowing) _restoreDraft('income', { name: 'bud-inc-name', amount: 'bud-inc-amount', freq: 'bud-inc-frequency' });
    }

    function addIncomeStream() {
        const form = document.getElementById('bud-income-form');
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        _restoreDraft('income', { name: 'bud-inc-name', amount: 'bud-inc-amount', freq: 'bud-inc-frequency' });
        document.getElementById('bud-inc-name').focus();
    }

    function saveIncomeStream() {
        const name = document.getElementById('bud-inc-name').value.trim();
        const amount = parseMoney(document.getElementById('bud-inc-amount').value);
        const frequency = document.getElementById('bud-inc-frequency').value;
        _clearDraft('income');

        if (!name) { Toast.show('Please enter a name.'); return; }
        if (!amount) { Toast.show('Please enter an amount.'); return; }

        const b = getBudget();
        if (!Array.isArray(b.incomeStreams)) b.incomeStreams = [];
        b.incomeStreams.push({ id: uid(), name, amount, frequency });
        saveBudget(b);

        document.getElementById('bud-inc-name').value = '';
        document.getElementById('bud-inc-amount').value = '';
        document.getElementById('bud-income-form').style.display = 'none';

        render();
        document.getElementById('bud-income-table').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        Toast.show('Income stream added ✓');
    }

    function removeIncomeStream(id) {
        if (!confirm('Remove this income stream?')) return;
        const b = getBudget();
        b.incomeStreams = b.incomeStreams.filter(s => s.id !== id);
        saveBudget(b);
        render();
    }

    function updateIncomeField(id, field, value) {
        const b = getBudget();
        const index = b.incomeStreams.findIndex(s => s.id === id);
        if (index === -1) return;
        b.incomeStreams[index][field] = value;
        saveBudget(b);
        render();
    }

    // ── CATEGORIES ───────────────────────────

    function renderCategoriesTable() {
        const b = getBudget();
        const tbody = document.getElementById('bud-categories-table');
        const tfoot = document.getElementById('bud-categories-totals');
        const t = calcTotals();
        const categories = b.categories || [];
        const groups = b.groups || [];

        const totalMonthly = categories.reduce((s, c) => s + toMonthly(c.amount, c.frequency), 0);
        const totalAnnual = totalMonthly * 12;
        const allocPct = t.monthlyIncome > 0
            ? Math.min(100, (totalMonthly / t.monthlyIncome * 100)).toFixed(1) : 0;
        const barColor = allocPct > 100 ? 'var(--red)' : allocPct > 90 ? 'var(--accent)' : 'var(--green)';

        document.getElementById('bud-allocated-pct').textContent = allocPct + '% of income';
        document.getElementById('bud-allocated-bar').style.width = Math.min(100, allocPct) + '%';
        document.getElementById('bud-allocated-bar').style.background = barColor;

        const childrenOf = {};
        categories.forEach(c => {
            if (c.parentId) {
                childrenOf[c.parentId] = childrenOf[c.parentId] || [];
                childrenOf[c.parentId].push(c);
            }
        });

        function renderItemRow(c, depth) {
            const monthly = toMonthly(c.amount, c.frequency);
            const annual = monthly * 12;
            const pctInc = t.monthlyIncome > 0
                ? (monthly / t.monthlyIncome * 100).toFixed(1) : '0.0';
            const indent = depth ? `padding-left:${18 * depth}px;` : '';
            const labelStyle = depth === 0 ? 'font-weight:600;' : 'color:var(--text-muted);';
            const rowBackground = depth === 0 ? 'background:rgba(255,255,255,0.03);' : '';
            return `<tr style="${rowBackground}">
                <td>
                    <input class="inline-edit" style="width:100%; ${indent} ${labelStyle}"
                           value="${c.name}"
                           onchange="Budget.updateCategoryField('${c.id}', 'name', this.value)">
                </td>
                <td>
                    <input class="inline-edit" type="text" inputmode="decimal" data-fmt="currency"
                           value="${c.amount ? fmt(c.amount) : ''}"
                           placeholder="0.00"
                           onchange="Budget.updateCategoryField('${c.id}', 'amount', parseMoney(this.value))">
                </td>
                <td>
                    <select class="inline-select"
                            onchange="Budget.updateCategoryField('${c.id}', 'frequency', this.value)">
                        <option value="weekly"      ${c.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                        <option value="monthly"     ${c.frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                        <option value="2months"     ${c.frequency === '2months' ? 'selected' : ''}>Every 2 Mo</option>
                        <option value="quarterly"   ${c.frequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
                        <option value="6months"     ${c.frequency === '6months' ? 'selected' : ''}>Every 6 Mo</option>
                        <option value="annual"      ${c.frequency === 'annual' ? 'selected' : ''}>Annual</option>
                    </select>
                </td>
                <td style="text-align:center;">
                    ${c.frequency === 'monthly'
                        ? `<input class="inline-edit" type="number" min="1" max="31"
                                  style="width:54px; text-align:center;"
                                  value="${c.dueDay || ''}" placeholder="—"
                                  onchange="Budget.updateCategoryField('${c.id}', 'dueDay', parseInt(this.value)||null)">`
                        : `<span style="color:var(--text-faint); font-size:0.8rem;">—</span>`}
                </td>
                <td style="font-family:var(--font-mono);">${fmt(monthly)}</td>
                <td style="font-family:var(--font-mono);">${fmt(annual)}</td>
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="width:50px; height:4px; background:var(--surface2); border-radius:99px; overflow:hidden;">
                            <div style="height:100%; width:${Math.min(100, parseFloat(pctInc))}%; background:var(--accent); border-radius:99px;"></div>
                        </div>
                        <span style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">${pctInc}%</span>
                    </div>
                </td>
                <td>
                    <button class="delete-row-btn"
                            onclick="Budget.removeCategory('${c.id}')">✕</button>
                </td>
            </tr>`;
        }

        function renderItemWithChildren(c, depth) {
            let html = renderItemRow(c, depth);
            (childrenOf[c.id] || []).forEach(child => {
                html += renderItemWithChildren(child, depth + 1);
            });
            return html;
        }

        const topLevel = categories.filter(c => !c.parentId);
        let html = '';

        groups.forEach(group => {
            html += `<tr style="background:rgba(255,255,255,0.05);">
                <td colspan="8" style="padding:7px 14px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted);">${group.name}</span>
                        <button class="delete-row-btn" onclick="Budget.removeGroup('${group.id}')">✕</button>
                    </div>
                </td>
            </tr>`;
            const groupItems = topLevel.filter(c => c.groupId === group.id);
            if (groupItems.length) {
                groupItems.forEach(item => { html += renderItemWithChildren(item, 0); });
            } else {
                html += `<tr><td colspan="8" style="padding:8px 14px 10px 28px; font-size:0.78rem; font-style:italic; color:var(--text-muted);">No items yet — add a category and assign it to this group.</td></tr>`;
            }
        });

        const ungrouped = topLevel.filter(c => !c.groupId);
        ungrouped.forEach(item => { html += renderItemWithChildren(item, 0); });

        tbody.innerHTML = html || `
            <tr>
                <td colspan="8" style="text-align:center; color:var(--text-muted); padding:24px;">
                    No categories yet. Add one above.
                </td>
            </tr>`;

        tfoot.innerHTML = `
            <tr style="border-top:2px solid var(--border); font-weight:600;">
                <td colspan="5" style="padding:12px 14px; font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">Totals</td>
                <td style="font-family:var(--font-mono); padding:12px 14px;">${fmt(totalMonthly)}</td>
                <td style="font-family:var(--font-mono); padding:12px 14px;">${fmt(totalAnnual)}</td>
                <td></td>
            </tr>`;
    }

    function addCategory() {
        populateGroupSelect();
        const form = document.getElementById('bud-cat-form');
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        _restoreDraft('category', { name: 'bud-cat-name', amount: 'bud-cat-amount', freq: 'bud-cat-frequency' });
        document.getElementById('bud-cat-name').focus();
    }

    function toggleCategoryForm() {
        const form = document.getElementById('bud-cat-form');
        const isShowing = form.style.display === 'none';
        form.style.display = isShowing ? 'block' : 'none';
        if (isShowing) _restoreDraft('category', { name: 'bud-cat-name', amount: 'bud-cat-amount', freq: 'bud-cat-frequency' });
    }

    function saveCategoryForm() {
        const name = document.getElementById('bud-cat-name').value.trim();
        const amount = parseMoney(document.getElementById('bud-cat-amount').value);
        const frequency = document.getElementById('bud-cat-frequency').value;
        _clearDraft('category');
        const groupId = document.getElementById('bud-cat-parent')?.value || null;

        if (!name) { Toast.show('Please enter a category name.'); return; }

        const b = getBudget();
        if (!Array.isArray(b.categories)) b.categories = [];
        b.categories.push({ id: uid(), name, amount, frequency, groupId: groupId || null, parentId: null });
        saveBudget(b);

        document.getElementById('bud-cat-name').value = '';
        document.getElementById('bud-cat-amount').value = '';
        if (document.getElementById('bud-cat-parent')) document.getElementById('bud-cat-parent').value = '';
        document.getElementById('bud-cat-form').style.display = 'none';

        render();
        const rows = document.getElementById('bud-categories-table').querySelectorAll('tr');
        if (rows.length) rows[rows.length - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        Toast.show('Category added ✓');
    }

    function addGroup() {
        const form = document.getElementById('bud-group-form');
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        document.getElementById('bud-grp-name').focus();
    }

    function toggleGroupForm() {
        const form = document.getElementById('bud-group-form');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }

    function saveGroupForm() {
        const name = document.getElementById('bud-grp-name').value.trim();
        if (!name) { Toast.show('Please enter a group name.'); return; }

        const b = getBudget();
        if (!Array.isArray(b.groups)) b.groups = [];
        b.groups.push({ id: uid(), name });
        saveBudget(b);

        document.getElementById('bud-grp-name').value = '';
        document.getElementById('bud-group-form').style.display = 'none';

        render();
        Toast.show('Group added ✓');
    }

    function removeGroup(id) {
        if (!confirm('Remove this group? Items in it will become ungrouped.')) return;
        const b = getBudget();
        b.groups = (b.groups || []).filter(g => g.id !== id);
        b.categories = (b.categories || []).map(c => c.groupId === id ? { ...c, groupId: null } : c);
        saveBudget(b);
        render();
    }

    function removeCategory(id) {
        if (!confirm('Remove this category?')) return;
        const b = getBudget();
        b.categories = b.categories
            .map(c => c.parentId === id ? { ...c, parentId: null } : c)
            .filter(c => c.id !== id);
        saveBudget(b);
        render();
    }

    function updateCategoryField(id, field, value) {
        const b = getBudget();
        const index = b.categories.findIndex(c => c.id === id);
        if (index === -1) return;
        if (field === 'parentId' && value === '') value = null;
        b.categories[index][field] = value;
        saveBudget(b);
        renderSummaryCards();
        renderCategoriesTable();
        renderBreakdown();
        renderDonut();
    }

    // ── SUBSCRIPTIONS ────────────────────────

    function toggleSubForm() {
        const form = document.getElementById('bud-sub-form');
        const isShowing = form.style.display === 'none';
        form.style.display = isShowing ? 'block' : 'none';
        if (isShowing) {
            const d = (Data.get('budget_draft') || {}).subscription;
            if (d && d.name) {
                document.getElementById('bud-sub-name').value = d.name || '';
                document.getElementById('bud-sub-amount').value = d.amount || '';
                document.getElementById('bud-sub-frequency').value = d.freq || 'monthly';
                document.getElementById('bud-sub-day').value = d.day || '';
                document.getElementById('bud-sub-date').value = d.date || '';
                toggleSubDueDate();
            }
        }
    }

    function toggleSubDueDate() {
        const freq = document.getElementById('bud-sub-frequency').value;
        const dayGroup = document.getElementById('bud-sub-day-group');
        const dateGroup = document.getElementById('bud-sub-date-group');
        dayGroup.style.display = freq === 'monthly' ? 'block' : 'none';
        dateGroup.style.display = (freq === 'annual' || freq === 'semiannual') ? 'block' : 'none';
        const dateLabel = document.querySelector('#bud-sub-date-group label');
        const dateInput = document.getElementById('bud-sub-date');
        if (freq === 'semiannual') {
            dateLabel.textContent = 'First Due Date';
            dateInput.placeholder = 'e.g. Jan 15';
        } else if (freq === 'annual') {
            dateLabel.textContent = 'Due Date (Month & Day)';
            dateInput.placeholder = 'e.g. Mar 15';
        }
    }

    function saveSubscription() {
        const name = document.getElementById('bud-sub-name').value.trim();
        const amount = parseMoney(document.getElementById('bud-sub-amount').value);
        const frequency = document.getElementById('bud-sub-frequency').value;
        const day = document.getElementById('bud-sub-day').value;
        const date = document.getElementById('bud-sub-date').value;

        if (!name) { Toast.show('Please enter a subscription name.'); return; }
        if (!amount) { Toast.show('Please enter an amount.'); return; }
        _clearDraft('subscription');

        const b = getBudget();
        b.subscriptions.push({
            id: uid(), name, amount, frequency,
            dueDay: frequency === 'monthly' ? parseInt(day) || 1 : null,
            dueDate: (frequency === 'annual' || frequency === 'semiannual') ? date : null
        });
        saveBudget(b);

        ['bud-sub-name', 'bud-sub-amount', 'bud-sub-day', 'bud-sub-date']
            .forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('bud-sub-form').style.display = 'none';

        render();
        Toast.show('Subscription added ✓');
    }

    function removeSubscription(id) {
        if (!confirm('Remove this subscription?')) return;
        const b = getBudget();
        b.subscriptions = b.subscriptions.filter(s => s.id !== id);
        saveBudget(b);
        render();
    }

    function updateSubscriptionField(id, field, value) {
        const b = getBudget();
        const index = b.subscriptions.findIndex(s => s.id === id);
        if (index === -1) return;
        b.subscriptions[index][field] = value;
        if (field === 'frequency') {
            if (value === 'monthly')    { b.subscriptions[index].dueDate = null; }
            if (value === 'annual')     { b.subscriptions[index].dueDay  = null; }
            if (value === 'semiannual') { b.subscriptions[index].dueDay  = null; }
        }
        saveBudget(b);
        render();
    }

    function renderSubscriptionsTable() {
        const b = getBudget();
        const tbody = document.getElementById('bud-sub-table');
        const tfoot = document.getElementById('bud-sub-totals');

        if (!b.subscriptions.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">
                        No subscriptions yet.
                    </td>
                </tr>`;
            tfoot.innerHTML = '';
            return;
        }

        tbody.innerHTML = b.subscriptions.map(s => {
            const monthly = toMonthly(s.amount, s.frequency);
            const annual = monthly * 12;

            const dueField = s.frequency === 'monthly'
                ? `<input class="inline-edit" style="width:60px;"
                          value="${s.dueDay ? ordinal(s.dueDay) : ''}" placeholder="Day"
                          onfocus="this.value=parseInt(this.value)||''"
                          onblur="this.value=parseInt(this.value)?Budget.ordinal(parseInt(this.value)):''"
                          onchange="Budget.updateSubscriptionField('${s.id}', 'dueDay', parseInt(this.value)||null)">`
                : `<input class="inline-edit" style="width:90px;"
                          value="${s.dueDate || ''}" placeholder="${s.frequency === 'semiannual' ? 'e.g. Jan 15' : 'e.g. Mar 15'}"
                          onchange="Budget.updateSubscriptionField('${s.id}', 'dueDate', this.value.trim())">`;

            return `<tr>
                <td>
                    <input class="inline-edit" style="width:150px;"
                           value="${s.name}"
                           onchange="Budget.updateSubscriptionField('${s.id}', 'name', this.value)">
                </td>
                <td>
                    <select class="inline-select"
                            onchange="Budget.updateSubscriptionField('${s.id}', 'frequency', this.value)">
                        <option value="monthly"    ${s.frequency === 'monthly'    ? 'selected' : ''}>Monthly</option>
                        <option value="semiannual" ${s.frequency === 'semiannual' ? 'selected' : ''}>Semi-Annual</option>
                        <option value="annual"     ${s.frequency === 'annual'     ? 'selected' : ''}>Annual</option>
                    </select>
                </td>
                <td>
                    <input class="inline-edit" type="number" min="0" step="0.01"
                           value="${s.amount}"
                           onchange="Budget.updateSubscriptionField('${s.id}', 'amount', parseFloat(this.value)||0)">
                </td>
                <td>${dueField}</td>
                <td style="font-family:var(--font-mono);">${fmt(monthly)}</td>
                <td style="font-family:var(--font-mono);">${fmt(annual)}</td>
                <td>
                    <button class="delete-row-btn"
                            onclick="Budget.removeSubscription('${s.id}')">✕</button>
                </td>
            </tr>`;
        }).join('');

        const totalMonthly = b.subscriptions.reduce((s, sub) =>
            s + toMonthly(sub.amount, sub.frequency), 0);
        const totalAnnual = totalMonthly * 12;

        tfoot.innerHTML = `
            <tr style="border-top:2px solid var(--border); font-weight:600;">
                <td colspan="4" style="padding:12px 14px; font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">Totals</td>
                <td style="font-family:var(--font-mono); padding:12px 14px;">${fmt(totalMonthly)}</td>
                <td style="font-family:var(--font-mono); padding:12px 14px;">${fmt(totalAnnual)}</td>
                <td></td>
            </tr>`;
    }

    // ── BREAKDOWN + DONUT ────────────────────

    function renderBreakdown() {
        const b = getBudget();
        const t = calcTotals();
        const el = document.getElementById('bud-breakdown');
        const grouped = aggregateTopLevelCategories(b.categories).filter(c => c.monthly > 0);

        if (!grouped.length) {
            el.innerHTML = '<p style="color:var(--text-muted); font-size:0.83rem;">No allocations yet.</p>';
            return;
        }

        const sorted = [...grouped].sort((a, b) => b.monthly - a.monthly);
        const maxVal = sorted[0].monthly;

        el.innerHTML = sorted.map(c => {
            const monthly = c.monthly;
            const pct = t.monthlyIncome > 0
                ? (monthly / t.monthlyIncome * 100).toFixed(1) : 0;
            const barW = maxVal > 0 ? (monthly / maxVal * 100).toFixed(1) : 0;
            return `
                <div>
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:3px;">
                        <span style="color:var(--text-muted);">${c.name}</span>
                        <span style="font-family:var(--font-mono); font-size:0.78rem;">
                            ${fmt(monthly)} <span style="color:var(--text-faint);">${pct}%</span>
                        </span>
                    </div>
                    <div class="progress-bar-wrap">
                        <div class="progress-bar" style="width:${barW}%; background:var(--accent);"></div>
                    </div>
                </div>`;
        }).join('');
    }

    function renderDonut() {
        try {
            const b = getBudget();
            const canvas = document.getElementById('bud-donut-chart');
            const cats = b.categories ? aggregateTopLevelCategories(b.categories).filter(c => c.monthly > 0) : [];

            if (window._budDonut) { window._budDonut.destroy(); window._budDonut = null; }
            if (!cats.length || !canvas) return;

            const ctx = canvas.getContext('2d');
            const COLORS = [
                '#D97757', '#6BBF8E', '#6B9FD9', '#9471B1', '#D9B96B',
                '#D96B6B', '#5BBFB5', '#8E9AAF', '#E8A87C', '#A87FCA'
            ];

            window._budDonut = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: cats.map(c => c.name),
                    datasets: [{
                        data: cats.map(c => c.monthly.toFixed(2)),
                        backgroundColor: cats.map((_, i) => COLORS[i % COLORS.length]),
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: item => ` ${item.label}: ${fmt(parseFloat(item.raw))}/mo`
                            }
                        }
                    }
                }
            });
        } catch (e) {
            console.error('renderDonut:', e);
        }
    }

    // ── DRAFT HELPERS ────────────────────────

    function _restoreDraft(key, idMap) {
        const d = (Data.get('budget_draft') || {})[key];
        if (!d || !d.name) return;
        if (idMap.name   && d.name)   document.getElementById(idMap.name).value   = d.name;
        if (idMap.amount && d.amount) document.getElementById(idMap.amount).value = d.amount;
        if (idMap.freq   && d.freq)   document.getElementById(idMap.freq).value   = d.freq;
    }

    function _clearDraft(key) {
        try {
            const d = Data.get('budget_draft') || {};
            delete d[key];
            Data.set('budget_draft', d);
        } catch (e) {}
    }

    function autoSave() {
        try {
            const draft = Data.get('budget_draft') || {};
            const incomeForm = document.getElementById('bud-income-form');
            if (incomeForm && incomeForm.style.display !== 'none') {
                draft.income = {
                    name:   document.getElementById('bud-inc-name')?.value || '',
                    amount: document.getElementById('bud-inc-amount')?.value || '',
                    freq:   document.getElementById('bud-inc-frequency')?.value || 'monthly',
                };
            }
            const catForm = document.getElementById('bud-cat-form');
            if (catForm && catForm.style.display !== 'none') {
                draft.category = {
                    name:   document.getElementById('bud-cat-name')?.value || '',
                    amount: document.getElementById('bud-cat-amount')?.value || '',
                    freq:   document.getElementById('bud-cat-frequency')?.value || 'monthly',
                };
            }
            const subForm = document.getElementById('bud-sub-form');
            if (subForm && subForm.style.display !== 'none') {
                draft.subscription = {
                    name:   document.getElementById('bud-sub-name')?.value || '',
                    amount: document.getElementById('bud-sub-amount')?.value || '',
                    freq:   document.getElementById('bud-sub-frequency')?.value || 'monthly',
                    day:    document.getElementById('bud-sub-day')?.value || '',
                    date:   document.getElementById('bud-sub-date')?.value || '',
                };
            }
            Data.set('budget_draft', draft);
        } catch (e) {}
    }

    // ── PUBLIC API ───────────────────────────
    return {
        render, autoSave,
        addIncomeStream, saveIncomeStream, toggleIncomeForm,
        removeIncomeStream, updateIncomeField,
        addCategory, saveCategoryForm, toggleCategoryForm,
        removeCategory, updateCategoryField,
        addGroup, saveGroupForm, toggleGroupForm, removeGroup,
        toggleSubForm, toggleSubDueDate, saveSubscription, removeSubscription, updateSubscriptionField, ordinal
    };

})();