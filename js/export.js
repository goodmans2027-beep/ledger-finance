/**
 * export.js — Backup & Restore
 * --------------------------------
 * All user data lives in a single localStorage key (ledger_v1).
 * Export dumps it as a formatted .json file; import restores it verbatim.
 * No transformation needed — the storage format IS the export format.
 *
 * Export.toJSON()        — download ledger-backup-YYYY-MM-DD.json
 * Export.fromJSON(file)  — restore from a .json backup file
 */

const Export = (() => {

    // ── EXPORT ───────────────────────────────

    function toJSON() {
        const data = Data.dump();
        data._exportedAt = new Date().toISOString();

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'ledger-backup-' + new Date().toISOString().split('T')[0] + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Toast.show('Backup downloaded ✓');
    }

    // ── IMPORT ───────────────────────────────

    // Known compatible major versions. Add to this list as new versions ship.
    const COMPATIBLE_VERSIONS = new Set(['1']);

    function fromJSON(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
            let data;
            try {
                data = JSON.parse(e.target.result);
            } catch {
                Toast.show('Could not parse file — not valid JSON.');
                return;
            }

            // Must be an object with a _version field to be a valid Ledger backup.
            if (!data || typeof data !== 'object' || !data._version) {
                Toast.show('Unrecognized file. Is this a Ledger backup?');
                return;
            }

            // Warn if the major version is outside the known-good set.
            const major = String(data._version).split('.')[0];
            if (!COMPATIBLE_VERSIONS.has(major)) {
                const proceed = confirm(
                    `This backup is version ${data._version}, which may not be fully compatible with the current app.\n\nImport anyway?`
                );
                if (!proceed) return;
            }

            const exportedAt = data._exportedAt
                ? new Date(data._exportedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : data._lastSaved
                    ? new Date(data._lastSaved).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'unknown date';

            if (!confirm(
                `Restore backup from ${exportedAt}?\n\nYour current data will be replaced. This cannot be undone.`
            )) return;

            Data.restore(data);
            Toast.show('Backup restored ✓');

            // Re-render the currently active page with the fresh data.
            const activePage = document.querySelector('.nav-item.active');
            const pageId = activePage ? activePage.dataset.page : 'dashboard';
            navigate(pageId);
        };

        reader.onerror = function () {
            Toast.show('Failed to read file.');
        };

        reader.readAsText(file);
    }

    return { toJSON, fromJSON };

})();
