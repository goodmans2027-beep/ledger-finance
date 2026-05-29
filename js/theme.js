const Theme = (() => {

    function apply() {
        const stored = localStorage.getItem('ledger_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', stored);
        updateIcon(stored);
    }

    function toggle() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('ledger_theme', next);
        updateIcon(next);
    }

    function updateIcon(theme) {
        const icon = document.getElementById('themeIcon');
        if (icon) icon.textContent = theme === 'dark' ? '☀' : '☽';
    }

    return { apply, toggle };

})();
