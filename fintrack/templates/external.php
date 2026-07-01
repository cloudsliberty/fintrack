<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>FinTrack — Add Transaction</title>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
	<style>
:root{--bg:#0f1117;--bg2:#161b27;--bg3:#1e2535;--border:#2a3450;--text:#e8eaf0;--text2:#9aa3b8;--text3:#5c6880;--accent:#4f8ef7;--accentd:rgba(79,142,247,0.15);--green:#2ecc8a;--red:#f05151;}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.wrap{width:100%;max-width:480px}
.hdr{text-align:center;margin-bottom:26px}
.logo{font-size:24px;font-weight:800;color:var(--text)}
.logo span{background:var(--accent);color:#fff;padding:2px 8px;border-radius:6px;margin-right:6px;font-size:16px}
.sub{color:var(--text3);font-size:13px;margin-top:5px}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:26px}
.fg{display:flex;flex-direction:column;gap:5px;margin-bottom:13px}
label{font-size:12px;font-weight:500;color:var(--text2)}
input,select,textarea{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 11px;color:var(--text);font-family:'Inter',sans-serif;font-size:13px;outline:none;width:100%}
input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 2px var(--accentd)}
select option{background:var(--bg2)}
textarea{resize:vertical;min-height:60px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.btn{display:block;width:100%;padding:11px;border-radius:6px;border:none;font-family:'Inter',sans-serif;font-size:13.5px;font-weight:600;cursor:pointer;margin-top:5px;transition:filter .15s}
.btn-p{background:var(--accent);color:#fff}.btn-p:hover{filter:brightness(1.1)}
.msg{border-radius:6px;padding:12px 14px;text-align:center;font-size:13.5px;font-weight:500;display:none;margin-top:14px}
.ok{background:rgba(46,204,138,.12);border:1px solid rgba(46,204,138,.3);color:var(--green)}
.er{background:rgba(240,81,81,.12);border:1px solid rgba(240,81,81,.3);color:var(--red)}
.type-tog{display:flex;border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:13px}
.tbtn{flex:1;padding:8px;border:none;font-family:'Inter',sans-serif;font-size:13px;font-weight:500;cursor:pointer;background:var(--bg);color:var(--text2);transition:all .15s}
.tbtn.ae{background:rgba(240,81,81,.12);color:var(--red)}
.tbtn.ai{background:rgba(46,204,138,.12);color:var(--green)}
.loading{text-align:center;color:var(--text3);padding:18px;font-size:13px}
.powered{text-align:center;font-size:12px;color:var(--text3);margin-top:14px}
	</style>
</head>
<body>
<?php
/**
 * External entry form — public page, no NC session.
 * Config is passed via data attributes to avoid inline JS (CSP compliance).
 *
 * @var array $_
 */
$token        = htmlspecialchars($_['token'], ENT_QUOTES, 'UTF-8');
$submitUrl    = htmlspecialchars($_['submitUrl'], ENT_QUOTES, 'UTF-8');
$accountsUrl  = htmlspecialchars($_['accountsUrl'], ENT_QUOTES, 'UTF-8');
$categoriesUrl = htmlspecialchars($_['categoriesUrl'], ENT_QUOTES, 'UTF-8');
?>
<div class="wrap">
	<div class="hdr">
		<div class="logo"><span>FT</span>FinTrack</div>
		<div class="sub">External Transaction Entry</div>
	</div>
	<div class="card"
		data-token="<?php echo $token; ?>"
		data-submit="<?php echo $submitUrl; ?>"
		data-accounts="<?php echo $accountsUrl; ?>"
		data-categories="<?php echo $categoriesUrl; ?>"
		id="ft-card">
		<div class="loading" id="loading">Loading accounts…</div>
		<div id="form" style="display:none">
			<input type="hidden" id="txtype" value="expense">
			<div class="type-tog">
				<button class="tbtn ae" id="btn-expense" type="button">Expense</button>
				<button class="tbtn"    id="btn-income"  type="button">Income</button>
			</div>
			<div class="row">
				<div class="fg"><label for="amount">Amount *</label><input type="number" id="amount" placeholder="0.00" step="0.01" min="0.01"></div>
				<div class="fg"><label for="date">Date *</label><input type="date" id="date"></div>
			</div>
			<div class="fg"><label for="account">Account *</label><select id="account"></select></div>
			<div class="fg"><label for="desc">Description</label><input type="text" id="desc" placeholder="What was this for?"></div>
			<div class="row">
				<div class="fg">
					<label for="cat">Category <a href="#" id="cat-quickadd-toggle" style="font-size:11px;font-weight:500">+ New</a></label>
					<select id="cat"><option value="">— None —</option></select>
				</div>
				<div class="fg"><label for="tags">Tags (comma-separated)</label><input type="text" id="tags" placeholder="food, monthly"></div>
			</div>
			<div class="fg" id="cat-quickadd" style="display:none;border:1px solid var(--border);border-radius:6px;padding:10px;background:var(--bg)">
				<div class="row">
					<div class="fg"><label for="cat-quickadd-name">New category name</label><input type="text" id="cat-quickadd-name" placeholder="e.g. Entertainment"></div>
					<div class="fg"><label for="cat-quickadd-type">Type</label>
						<select id="cat-quickadd-type">
							<option value="expense">Expense</option>
							<option value="income">Income</option>
						</select>
					</div>
				</div>
				<button class="btn btn-p" id="cat-quickadd-save" type="button" style="margin-top:2px">Add Category</button>
			</div>
			<div class="fg"><label for="notes">Notes</label><textarea id="notes" placeholder="Additional notes…"></textarea></div>
			<button class="btn btn-p" id="submit-btn" type="button">Submit Transaction</button>
			<div class="msg ok" id="ok">✓ Transaction submitted!</div>
			<div class="msg er" id="err"></div>
		</div>
	</div>
	<div class="powered">Powered by FinTrack for Nextcloud</div>
</div>
<?php
// CSP-compliant script loading: NC32's CSP for this page uses 'strict-dynamic' with a
// per-request nonce, which means the browser ignores host-based sources like 'self' for
// scripts entirely — only nonced (or script-created) scripts are trusted.
// A hand-written <script src="..."> tag never receives that nonce and gets blocked.
// \OCP\Util::addScript() registers the script through Nextcloud's own asset pipeline,
// which stamps the correct nonce automatically (same mechanism main.php already relies
// on for fintrack-main / fintrack-core).
\OCP\Util::addScript('fintrack', 'fintrack-external');
?>
</body>
</html>
