// "Aurora Theme updated": shown once on the first page opened after the plugin's version changed
// (an automatic update, "Update now", the Plugins page). include/updated.php gives the versions
// and the release notes of every release since the previous version, so nothing is missed when
// several were skipped; closing the dialog tells it so, and it is not shown again. Loaded by AuroraTheme.page only while that record exists.
(function () {
  'use strict';
  const endpoint = '/plugins/Aurora-Theme/include/updated.php';

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Bold, code and links of one line of the release notes, as nodes (never as HTML).
  function inline(text) {
    const fragment = document.createDocumentFragment();
    const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;
    let last = 0;
    let match;
    while ((match = pattern.exec(text))) {
      fragment.append(text.slice(last, match.index));
      if (match[1] !== undefined) fragment.append(element('strong', '', match[1]));
      else if (match[2] !== undefined) fragment.append(element('code', '', match[2]));
      else {
        const link = element('a', '', match[3]);
        link.href = match[4];
        link.target = '_blank';
        link.rel = 'noopener';
        fragment.append(link);
      }
      last = pattern.lastIndex;
    }
    fragment.append(text.slice(last));
    return fragment;
  }

  // The release notes (Markdown): headings, lists and paragraphs.
  function notes(markdown) {
    const box = element('div', 'tp-upd-notes');
    let list = null;
    let paragraph = null;
    markdown.replace(/\r/g, '').split('\n').forEach(function (raw) {
      const line = raw.trim();
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      const item = /^[-*+]\s+(.*)$/.exec(line);
      if (!line) { list = null; paragraph = null; return; }
      if (heading) {
        list = null; paragraph = null;
        // The section title already says it.
        if (/^what['’]?s new$/i.test(heading[1].replace(/\*\*/g, '').trim())) return;
        box.append(element('h4', '', heading[1].replace(/\*\*/g, '')));
      } else if (item) {
        paragraph = null;
        if (!list) { list = element('ul'); box.append(list); }
        const li = element('li');
        li.append(inline(item[1]));
        list.append(li);
      } else if (list && /^\s{2,}/.test(raw)) {
        list.lastElementChild.append(' ', inline(line));
      } else {
        list = null;
        if (!paragraph) { paragraph = element('p'); box.append(paragraph); } else paragraph.append(' ');
        paragraph.append(inline(line));
      }
    });
    return box;
  }

  function when(seconds) {
    if (!seconds) return '';
    const date = new Date(seconds * 1000);
    const today = new Date();
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === today.toDateString()) return 'today, ' + time;
    return date.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ', ' + time;
  }

  function show(info) {
    const back = info.to < info.from;
    const backdrop = element('div', 'tp-upd-backdrop');
    const dialog = element('div', 'tp-upd');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'tp-upd-title');

    const head = element('div', 'tp-upd-head');
    const badge = element('span', 'tp-upd-badge');
    badge.append(element('i', 'fa fa-' + (back ? 'undo' : 'magic')));
    const heading = element('div', 'tp-upd-heading');
    heading.append(
      element('span', 'tp-upd-eyebrow', back ? 'Aurora Theme changed' : 'Aurora Theme updated'),
      element('h2', 'tp-upd-title', 'Version ' + info.to)
    );
    heading.lastChild.id = 'tp-upd-title';
    head.append(badge, heading);

    const facts = element('div', 'tp-upd-facts');
    const fact = function (icon, text) {
      const chip = element('span', 'tp-upd-fact');
      chip.append(element('i', 'fa fa-' + icon), text);
      facts.append(chip);
    };
    fact('code-fork', (back ? 'back from ' : 'from ') + info.from);
    if (info.time) fact('clock-o', when(info.time));
    fact(info.automatic ? 'refresh' : 'hand-pointer-o', info.automatic ? 'automatic update' : 'installed by hand');

    // One release: its notes. Several (versions were skipped): each with its version and date,
    // newest first.
    const releases = Array.isArray(info.releases) ? info.releases : null;
    const body = element('div', 'tp-upd-body');
    body.append(element('div', 'tp-upd-section', releases && releases.length > 1 ? "What's new in " + releases.length + ' versions' : "What's new"));
    if (!releases) body.append(element('p', 'tp-upd-empty', 'The release notes could not be loaded from GitHub just now.'));
    else if (!releases.length) body.append(element('p', 'tp-upd-empty', 'There are no release notes for this version on GitHub.'));
    else if (releases.length === 1) body.append(releases[0].notes ? notes(releases[0].notes) : element('p', 'tp-upd-empty', 'This release has no notes.'));
    else releases.forEach(function (release) {
      const block = element('section', 'tp-upd-release');
      const title = element('div', 'tp-upd-release-head');
      const name = element('a', 'tp-upd-release-version', release.version);
      name.href = release.page || 'https://github.com/@@GITHUB_REPO@@/releases';
      name.target = '_blank';
      name.rel = 'noopener';
      title.append(name);
      const date = release.date ? new Date(release.date) : null;
      if (date && !isNaN(date)) title.append(element('span', 'tp-upd-release-date', date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })));
      if (release.version === info.to) title.append(element('span', 'tp-upd-release-tag', 'installed now'));
      block.append(title, release.notes ? notes(release.notes) : element('p', 'tp-upd-empty', 'This release has no notes.'));
      body.append(block);
    });

    const actions = element('div', 'tp-upd-actions');
    const link = element('a', 'tp-upd-button', 'Release notes on GitHub');
    link.href = info.page || 'https://github.com/@@GITHUB_REPO@@/releases';
    link.target = '_blank';
    link.rel = 'noopener';
    const settings = element('a', 'tp-upd-button', 'Settings');
    settings.href = '/Settings/AuroraThemeSettings';
    const ok = element('button', 'tp-upd-button tp-upd-primary', 'Got it');
    ok.type = 'button';
    actions.append(link, settings, ok);

    dialog.append(head, facts, body, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    ok.focus();

    let closed = false;
    const close = function () {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', key, true);
      backdrop.classList.add('tp-upd-leaving');
      setTimeout(function () { backdrop.remove(); }, 180);
      fetch(endpoint, { method: 'POST', body: new URLSearchParams({ csrf_token: window.csrf_token || '' }) }).catch(function () {});
    };
    const key = function (event) {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
    };
    document.addEventListener('keydown', key, true);
    ok.addEventListener('click', close);
    settings.addEventListener('click', close);
    backdrop.addEventListener('click', function (event) { if (event.target === backdrop) close(); });
  }

  function start() {
    fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' })
      .then(function (response) { return response.ok ? response.json() : {}; })
      .then(function (info) { if (info && info.to && info.from) show(info); })
      .catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
