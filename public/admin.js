const $ = id => document.getElementById(id);
let next = null, busy = false;

async function api(path, options = {}) {
	const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json' } });
	const data = await response.json();
	if (!response.ok) {
		if (response.status === 401) { $('login').hidden = false; $('desk').hidden = true; }
		throw new Error(data.error);
	}
	return data;
}

function message(text) { $('admin-status').textContent = text; }

async function load(append = false) {
	if (busy) return;
	busy = true;
	$('admin-more').disabled = true;
	try {
		const filter = $('status-filter').value;
		const data = await api(`/api/admin/entries?status=${filter}${append && next ? `&before=${next}` : ''}`);
		$('login').hidden = true;
		$('desk').hidden = false;
		if (!append) $('admin-entries').replaceChildren();
		data.entries.forEach(entry => {
			const card = document.createElement('article');
			card.className = 'entry';
			if (entry.hasPhoto) {
				const image = document.createElement('img');
				image.className = 'admin-entry-img';
				image.src = `/api/admin/photos/${entry.id}`;
				image.alt = `Photo from ${entry.name}`;
				card.append(image);
			}
			const text = document.createElement('p');
			text.className = 'entry-message';
			text.textContent = entry.message;
			const byline = document.createElement('div');
			byline.className = 'byline';
			byline.textContent = `${entry.name} · ${new Date(entry.createdAt).toLocaleString()}`;
			const actions = document.createElement('div');
			actions.className = 'admin-entry-actions';
			for (const action of [entry.status === 'pending' ? 'approve' : 'hide', 'delete']) {
				const button = document.createElement('button');
				button.type = 'button';
				button.textContent = { approve: 'APPROVE', hide: 'UNPUBLISH', delete: 'DELETE' }[action];
				if (action === 'delete') button.className = 'danger';
				button.onclick = async () => {
					if (action === 'delete' && !confirm('Permanently delete this message and its photo? This cannot be undone.')) return;
					button.disabled = true;
					try {
						await api('/api/admin/moderate', { method: 'POST', body: JSON.stringify({ id: entry.id, action }) });
						card.remove();
						message(action === 'approve' ? 'Published on the tribute.' : action === 'hide' ? 'Moved back to review.' : 'Message and photo deleted.');
					} catch (error) {
						message(error.message);
						button.disabled = false;
					}
				};
				actions.append(button);
			}
			card.append(text, byline, actions);
			$('admin-entries').append(card);
		});
		next = data.next;
		$('admin-more').hidden = !next;
		message($('admin-entries').children.length ? '' : 'No entries in this folder.');
	} catch (error) {
		message(error.message);
	} finally {
		busy = false;
		$('admin-more').disabled = false;
	}
}

$('login').onsubmit = async event => {
	event.preventDefault();
	const button = $('login').querySelector('button');
	button.disabled = true;
	try {
		await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('password').value }) });
		$('password').value = '';
		await load();
	} catch (error) {
		message(error.message);
	} finally {
		button.disabled = false;
	}
};

$('logout').onclick = async () => {
	try {
		await api('/api/admin/logout', { method: 'POST', body: '{}' });
		$('desk').hidden = true;
		$('login').hidden = false;
		$('admin-entries').replaceChildren();
		message('Signed out.');
	} catch (error) {
		message(error.message);
	}
};

$('status-filter').onchange = () => load();
$('refresh').onclick = () => load();
$('admin-more').onclick = () => load(true);
load();
