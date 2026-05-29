/**
 * app.js — Navigation & App Init
 * --------------------------------
 * Handles sidebar navigation, page routing, and app startup.
 * Calls Data.load() on init, then renders the active page.
 *
 * navigate(pageId) — switch active page + sidebar highlight
 * initApp()        — called on DOMContentLoaded
 */

// Strip currency symbols/commas and parse as float.
// Used by all save functions that read from currency-formatted inputs.
function parseMoney(val) {
    return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
}

// Global currency input formatter.
// Inputs marked data-fmt="currency" show $1,200.00 at rest,
// strip to raw number on focus for editing.
const CurrencyInput = (() => {
    function fmtVal(n) {
        return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function apply(el) {
        if (!el || el.value === '') return;
        const raw = parseFloat(String(el.value).replace(/[^0-9.]/g, ''));
        if (!isNaN(raw)) el.value = fmtVal(raw);
    }

    function applyAll() {
        document.querySelectorAll('[data-fmt="currency"]').forEach(apply);
    }

    document.addEventListener('focus', function (e) {
        if (!e.target.dataset || e.target.dataset.fmt !== 'currency') return;
        const raw = parseFloat(String(e.target.value).replace(/[^0-9.]/g, ''));
        e.target.value = isNaN(raw) ? '' : String(raw);
    }, true);

    document.addEventListener('blur', function (e) {
        if (!e.target.dataset || e.target.dataset.fmt !== 'currency') return;
        apply(e.target);
    }, true);

    return { apply, applyAll };
})();

// This function is the heart of navigation.
// It takes a pageId string like "dashboard" or "car-loan"
// and updates both the sidebar and the visible page.
function navigate(pageId) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector('[data-page="' + pageId + '"]').classList.add('active');
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');

    if (pageId === 'dashboard') Dashboard.render();
    if (pageId === 'car-loan') CarLoan.render();
    if (pageId === 'mortgage') Mortgage.render();
    if (pageId === 'investments') Investments.render();
    if (pageId === 'budget') Budget.render();
    if (pageId === 'savings') Savings.render();
    if (pageId === 'credit-cards') CreditCards.render();
    if (pageId === 'debt') Debt.render();
    if (pageId === 'retirement') Retirement.render();
    if (pageId === 'networth') NetWorth.render();
    if (pageId === 'calendar') Cal.render();
    if (pageId === 'tax') Tax.render();
    if (pageId === 'paycheck') Paycheck.render();
    if (pageId === 'foo') FOO.render();
    if (pageId === 'insurance') Insurance.render();

    localStorage.setItem('ledger_activePage', pageId);
    CurrencyInput.applyAll();
}

// This runs once when the page loads.
// It finds every nav item and attaches a click listener to each one.
// When clicked, it reads that item's data-page attribute
// and passes it to navigate().
document.querySelectorAll('.nav-item').forEach(function (item) {
    item.addEventListener('click', function () {
        navigate(item.dataset.page);
    });
});

// Restore last active page, falling back to dashboard.
const _validPages = ['dashboard', 'car-loan', 'mortgage', 'credit-cards', 'investments', 'budget', 'savings', 'networth', 'tax', 'paycheck', 'debt', 'retirement', 'calendar'];
const _savedPage = localStorage.getItem('ledger_activePage');
navigate(_validPages.includes(_savedPage) ? _savedPage : 'dashboard');

// Apply saved theme on load
Theme.apply();

// Render Lucide icons
if (typeof lucide !== 'undefined') lucide.createIcons();

// Show app-only controls when running inside Electron
if (window.electronAPI && window.electronAPI.isElectron) {
    const sec = document.getElementById('gsettings-app-section');
    if (sec) sec.style.display = '';
}

// Wire up the theme toggle (now inside the settings panel)
document.getElementById('themeToggle').addEventListener('click', Theme.toggle);

// Global settings panel open / close
(function () {
    const btn   = document.getElementById('global-settings-btn');
    const panel = document.getElementById('global-settings-panel');

    btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const open = panel.style.display === 'block';
        panel.style.display = open ? 'none' : 'block';
        btn.classList.toggle('active', !open);
        if (!open && window.lucide) lucide.createIcons();
    });

    document.addEventListener('click', function (e) {
        if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            panel.style.display = 'none';
            btn.classList.remove('active');
        }
    });
}());

// Sidebar collapse
(function () {
    if (localStorage.getItem('ledger_sidebar_collapsed') === '1') {
        document.body.classList.add('sidebar-collapsed');
    }
    document.getElementById('sidebarToggle').addEventListener('click', function () {
        const collapsed = document.body.classList.toggle('sidebar-collapsed');
        localStorage.setItem('ledger_sidebar_collapsed', collapsed ? '1' : '0');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });
}());

// Auto-save: on any input change, silently persist the active page's form data.
// Uses `change` events (fires on blur for text, immediately for selects/checkboxes)
// so saves happen when the user leaves a field — no mid-typing re-renders.
(function () {
    const _saves = {
        'car-loan':    () => CarLoan.autoSave(),
        'mortgage':    () => Mortgage.autoSave(),
        'tax':         () => Tax.autoSave(),
        'paycheck':    () => Paycheck.autoSave(),
        'retirement':  () => Retirement.autoSave(),
        'budget':      () => Budget.autoSave(),
        'credit-cards':() => CreditCards.autoSave(),
        'networth':    () => NetWorth.autoSave(),
        'debt':        () => Debt.autoSave(),
    };
    let _t = null;
    document.addEventListener('change', function (e) {
        if (!e.target.matches('input, select, textarea')) return;
        const page = localStorage.getItem('ledger_activePage');
        const fn = _saves[page];
        if (!fn) return;
        clearTimeout(_t);
        _t = setTimeout(fn, 300);
    }, true);
}());

// Toast notification helper
const Toast = (() => {
    function show(msg) {
        const el = document.getElementById('toast');
        el.textContent = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 2800);
    }
    return { show };
})();