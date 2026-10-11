// FinTrack — Admin Settings → Reset PIN queue.
// Loaded only on the Admin Settings page (see AdminSettings::getForm());
// deliberately separate from fintrack-main.js/fintrack-core.js, which never
// run outside the main FinTrack app itself.
(function () {
'use strict';

document.addEventListener('DOMContentLoaded', function () {
	var table = document.getElementById('fintrack-admin-requests-table');
	if (!table) return;

	// The "Requested" column is stored/rendered as a raw unix timestamp
	// server-side (no locale/timezone logic in PHP) and formatted here
	// instead, same pattern as the rest of FinTrack's client-rendered dates.
	table.querySelectorAll('.fintrack-admin-request-time').forEach(function (el) {
		var ts = parseInt(el.dataset.timestamp, 10);
		if (ts) el.textContent = new Date(ts * 1000).toLocaleString();
	});

	function requestToken() {
		return (document.head && document.head.dataset && document.head.dataset.requesttoken)
			|| (typeof OC !== 'undefined' ? OC.requestToken : '')
			|| '';
	}

	// One-click "Approve & Clear PIN" — event-delegated so it keeps working
	// for rows already on the page without needing to rebind per-button.
	table.addEventListener('click', function (e) {
		var btn = e.target.closest('[data-fintrack-approve]');
		if (!btn) return;
		var id = btn.getAttribute('data-fintrack-approve');
		if (!id) return;

		btn.disabled = true;
		var originalLabel = btn.textContent;
		btn.textContent = 'Approving…';

		var url = (typeof OC !== 'undefined' && OC.generateUrl)
			? OC.generateUrl('/apps/fintrack/admin/lock-reset/{id}/approve', { id: id })
			: (window.location.origin + '/index.php/apps/fintrack/admin/lock-reset/' + encodeURIComponent(id) + '/approve');

		fetch(url, {
			method: 'POST',
			headers: { 'requesttoken': requestToken() },
		}).then(function (resp) {
			if (!resp.ok) throw new Error('Request failed');
			return resp.json();
		}).then(function () {
			var row = btn.closest('tr');
			if (row) row.remove();
			var remaining = table.querySelectorAll('tbody tr').length;
			if (remaining === 0) {
				table.style.display = 'none';
				var empty = document.getElementById('fintrack-admin-empty');
				if (empty) empty.style.display = '';
			}
		}).catch(function () {
			btn.disabled = false;
			btn.textContent = originalLabel;
			alert('Could not approve this request — it may have already been resolved. Reloading the page will refresh the list.');
		});
	});
});

})();
