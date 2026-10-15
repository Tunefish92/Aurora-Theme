// Page enhancements for the Aurora Theme: elements the stock webGUI does not have.
// Each enhancer checks for the page it belongs to and does nothing elsewhere.
(function () {
  'use strict';

  // ".../plugins/<plugin>/scripts/enhance.js" -> ".../plugins/<plugin>", for the plugin's endpoints.
  const PLUGIN_BASE = ((document.currentScript && document.currentScript.src) || '').replace(/\/scripts\/[^/]*$/, '');

  // Eyebrow and subtitle for the stock tabs; other tabs get a heading without them.
  const TABS = {
    Dashboard: ['Overview', 'Health, storage and services at a glance.'],
    Main: ['Storage', 'Array devices, pools and boot media.'],
    Shares: ['Storage', 'User shares and how they are exported and stored.'],
    Users: ['Access', 'Accounts that can reach shares and the web interface.'],
    Settings: ['Configuration', 'System, network service and preference settings.'],
    Plugins: ['Extensions', 'Installed plugins and the updates available for them.'],
    Docker: ['Applications', 'Manage containers, review resource use, and keep services healthy.'],
    VMs: ['Virtualisation', 'Virtual machines and the resources assigned to them.'],
    Apps: ['Community applications', 'Browse container templates and install them in one step.'],
    Stats: ['Monitoring', 'Processor, memory, network and disk activity over time.'],
    Tools: ['Maintenance', 'Diagnostics, system information and maintenance utilities.'],
  };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Opens a container's web interface the way Unraid's own context menu does (window.open).
  // The element is a link without href: Unraid shows its "external link" warning for real
  // links to other addresses, but not for its menu, so the WebUI buttons behave like the menu.
  function webuiOpener(node, url) {
    node.setAttribute('role', 'link');
    node.tabIndex = 0;
    node.dataset.url = url;
    const open = function (event) {
      event.preventDefault();
      event.stopPropagation();
      window.open(url, '_blank');
    };
    node.addEventListener('click', open);
    node.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') open(event); });
    return node;
  }

  function debounce(fn) {
    let timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, 150);
    };
  }

  // Unraid passes each container's details to its context menu in the icon's onclick call:
  // addDockerContainerContext(name, image, template, started, paused, update, autostart, webui, ...).
  // The arguments are read as text; nothing from the attribute is executed.
  function contextArguments(trigger) {
    const call = (trigger && trigger.getAttribute('onclick')) || '';
    const inner = call.slice(call.indexOf('(') + 1, call.lastIndexOf(')'));
    const pattern = /'((?:[^'\\]|\\.)*)'|([^,'\s][^,]*)/g;
    const values = [];
    let match;
    while ((match = pattern.exec(inner))) {
      values.push(match[1] !== undefined ? match[1].replace(/\\(.)/g, '$1') : match[2].trim());
    }
    return values;
  }

  // Themed dialog, used instead of the browser's prompt / confirm / alert boxes.
  //   modal({ title, message, input: { value, placeholder, maxLength }, validate, confirmLabel, danger, hideCancel })
  // Resolves with the entered text (or true when there is no input), or null when cancelled.
  // validate(text) may return a message to show under the input and keep the dialog open.
  function modal(options) {
    return new Promise(function (resolve) {
      const previousFocus = document.activeElement;
      const backdrop = element('div', 'tp-modal-backdrop');
      const box = element('div', 'tp-modal');
      const titleId = 'tp-modal-title-' + Date.now();
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-labelledby', titleId);
      const title = element('h2', 'tp-modal-title', options.title);
      title.id = titleId;
      box.append(title);
      if (options.message) box.append(element('p', 'tp-modal-message', options.message));

      let input = null;
      const problem = element('p', 'tp-modal-problem');
      problem.setAttribute('role', 'alert');
      if (options.input) {
        input = element('input', 'tp-modal-input');
        input.type = 'text';
        input.value = options.input.value || '';
        input.placeholder = options.input.placeholder || '';
        input.maxLength = options.input.maxLength || 200;
        input.setAttribute('aria-label', options.input.placeholder || options.title);
        box.append(input, problem);
      }

      const actions = element('div', 'tp-modal-actions');
      const cancel = element('button', 'tp-modal-button', 'Cancel');
      cancel.type = 'button';
      const confirm = element('button', 'tp-modal-button ' + (options.danger ? 'tp-modal-danger' : 'tp-modal-primary'), options.confirmLabel || 'OK');
      confirm.type = 'button';
      if (!options.hideCancel) actions.append(cancel);
      actions.append(confirm);
      box.append(actions);
      backdrop.append(box);

      function close(result) {
        document.removeEventListener('keydown', onKey, true);
        backdrop.remove();
        if (previousFocus && previousFocus.focus) previousFocus.focus();
        resolve(result);
      }
      function accept() {
        if (!input) return close(true);
        const text = input.value.trim();
        if (!text) return input.focus();
        const message = options.validate ? options.validate(text) : '';
        if (message) {
          problem.textContent = message;
          return input.focus();
        }
        close(text);
      }
      function onKey(event) {
        if (event.key === 'Escape') {
          event.stopPropagation();
          close(null);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          accept();
        } else if (event.key === 'Tab') {
          // Keep the focus inside the dialog.
          const stops = [input, options.hideCancel ? null : cancel, confirm].filter(Boolean);
          const index = stops.indexOf(document.activeElement);
          event.preventDefault();
          stops[(index + (event.shiftKey ? stops.length - 1 : 1)) % stops.length].focus();
        }
      }
      if (input) {
        const sync = function () {
          confirm.disabled = !input.value.trim();
          problem.textContent = '';
        };
        input.addEventListener('input', sync);
        sync();
      }
      cancel.addEventListener('click', function () { close(null); });
      confirm.addEventListener('click', accept);
      // A click on the dimmed area cancels; clicks inside the box must not reach the page.
      backdrop.addEventListener('click', function (event) {
        event.stopPropagation();
        if (event.target === backdrop) close(null);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.append(backdrop);
      (input || confirm).focus();
      if (input) input.select();
    });
  }

  // "Tower/DisplaySettings" in the page title gives the server name and the page name.
  function pageInfo() {
    const titleParts = document.title.split('/');
    const active = document.querySelector('#menu .nav-item.active a');
    const tab = active ? active.textContent.trim() : '';
    const path = location.pathname.split('/').filter(Boolean);
    const subPage = tab && path[0] === tab && path.length > 1 ? path[path.length - 1] : '';
    // A page with a single section is named after that section's title ("PHP Settings", not
    // "PHPsettings"); otherwise the address is split into words.
    const titles = subPage ? document.querySelectorAll('#displaybox div.title > span.left') : [];
    const sectionName = titles.length === 1 ? titles[0].textContent.replace(/\s+/g, ' ').trim() : '';
    return {
      server: titleParts.length > 1 ? titleParts[0] : '',
      tab: tab || (titleParts[1] || ''),
      // "DisplaySettings" reads better as "Display Settings".
      // ... and "VMTemplates" as "VM Templates".
      subPage: sectionName && sectionName.length <= 40 ? sectionName : subPage.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[._]/g, ' '),
    };
  }

  // Slim top bar: breadcrumb on the left, with the array state mirrored from the footer.
  function topBar(info) {
    const header = document.getElementById('header');
    if (!header || !info.tab || header.querySelector('.tp-crumb')) return;
    const crumb = element('div', 'tp-crumb');
    const trail = element('span');
    trail.append(info.server ? info.server + ' / ' : '', element('strong', '', info.subPage || info.tab));
    crumb.append(trail);
    header.prepend(crumb);

    const status = document.getElementById('statusbar');
    if (!status) return;
    const pill = element('span', 'tp-pill');
    crumb.append(pill);
    function mirror() {
      const text = status.textContent.trim();
      pill.hidden = !text;
      pill.textContent = text;
      pill.className = 'tp-pill' + (/started/i.test(text) ? ' tp-good' : /stopp|offline|invalid|error/i.test(text) ? ' tp-warn' : '');
    }
    new MutationObserver(mirror).observe(status, { childList: true, subtree: true, characterData: true });
    mirror();
  }

  // Top right: a sun / moon switch between the Black and White Dynamix themes. The choice is a
  // server setting, saved in two places so it holds on every page and in every browser:
  //   1. dynamix.cfg, through /update.php with the same form Display Settings submits;
  //   2. the Unraid API's own copy (customization.setTheme), when the API is running, because
  //      the API can otherwise write its older value back.
  // The page reloads once the server has answered. Other Dynamix themes do not show the switch.
  function themeSwitch() {
    const root = document.documentElement;
    const dark = root.classList.contains('Theme--black');
    if (!dark && !root.classList.contains('Theme--white')) return;

    // One round button showing the active theme: a moon while dark, a sun while light.
    const button = element('button', 'tp-theme-switch' + (dark ? ' tp-dark' : ''));
    button.type = 'button';
    button.title = dark ? 'Switch to the light theme (for all browsers)' : 'Switch to the dark theme (for all browsers)';
    button.setAttribute('aria-label', button.title);
    button.append(element('i', 'fa ' + (dark ? 'fa-moon-o' : 'fa-sun-o')));

    // Saves through a hidden form and frame, exactly like Display Settings.
    function saveConfig(theme) {
      return new Promise(function (resolve, reject) {
        const name = 'tp-theme-frame-' + Date.now();
        const frame = element('iframe');
        frame.name = name;
        frame.hidden = true;
        const form = element('form');
        form.method = 'POST';
        form.action = '/update.php';
        form.target = name;
        form.hidden = true;
        Object.entries({ '#file': 'dynamix/dynamix.cfg', '#section': 'display', theme: theme, csrf_token: window.csrf_token || '' }).forEach(function (pair) {
          const input = element('input');
          input.type = 'hidden';
          input.name = pair[0];
          input.value = pair[1];
          form.append(input);
        });
        const timer = setTimeout(function () { reject(new Error('no answer from /update.php')); }, 15000);
        frame.addEventListener('load', function () {
          clearTimeout(timer);
          let text = '';
          try { text = frame.contentDocument ? frame.contentDocument.body.textContent : ''; } catch (error) { text = ''; }
          if (/csrf_token/.test(text)) reject(new Error(text.trim()));
          else resolve();
        });
        document.body.append(frame, form);
        form.submit();
      });
    }

    // The Unraid API keeps a copy of the theme; it is told too when it is reachable.
    function saveApi(theme) {
      if (!window.apolloClient || !window.gql) return Promise.resolve();
      const mutation = window.gql('mutation setTheme($theme: ThemeName!) { customization { setTheme(theme: $theme) { name } } }');
      const call = window.apolloClient.mutate({ mutation: mutation, variables: { theme: theme } }).catch(function (error) {
        console.warn('Aurora Theme: the Unraid API did not take the theme', error);
      });
      return Promise.race([call, new Promise(function (resolve) { setTimeout(resolve, 4000); })]);
    }

    let busy = false;
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      busy = true;
      const next = dark ? 'white' : 'black';
      button.classList.toggle('tp-dark', !dark);
      button.classList.add('tp-busy');
      button.setAttribute('aria-busy', 'true');
      saveConfig(next)
        .then(function () { return saveApi(next); })
        .then(function () { location.reload(); })
        .catch(function (error) {
          console.error('Aurora Theme:', error);
          busy = false;
          button.classList.remove('tp-busy');
          button.removeAttribute('aria-busy');
          button.classList.toggle('tp-dark', dark);
          modal({ title: 'Theme not changed', message: 'The server did not accept the change (' + error.message + '). You can still pick the theme under Settings > Display Settings.', confirmLabel: 'OK', hideCancel: true });
        });
    });

    // The top right row is drawn by Unraid's profile component, which appears a moment after
    // the page; the switch goes in front of it and is put back if the component redraws. It is
    // never moved while the pointer is on it: moving it mid-click would swallow the click.
    let pointerOn = false;
    button.addEventListener('pointerenter', function () { pointerOn = true; });
    button.addEventListener('pointerleave', function () { pointerOn = false; place(); });
    function place() {
      const profile = document.getElementById('UserProfile');
      if (!profile || pointerOn) return;
      if (profile.firstElementChild === button) return;
      if (profile.contains(button) && button.parentElement === profile) return;
      profile.prepend(button);
    }
    place();
    new MutationObserver(place).observe(document.getElementById('header') || document.body, { childList: true, subtree: true });
  }

  // Sidebar: which server this browser is connected to.
  function serverCard(info) {
    const menu = document.getElementById('menu');
    if (!menu || !info.server || menu.querySelector('.tp-server')) return;
    const block = element('div', 'tp-server');
    const card = element('div', 'tp-server-card');
    card.append(element('b', '', info.server), element('span', '', location.host));
    block.append(element('span', 'tp-server-label', 'Connected server'), card);
    menu.prepend(block);
  }

  function pageHeading(info) {
    const box = document.getElementById('displaybox');
    if (!box || !info.tab || box.querySelector('.tp-heading')) return;
    const known = TABS[info.tab];
    const heading = element('div', 'tp-heading');
    const text = element('div', 'tp-heading-text');
    const eyebrow = info.subPage ? info.tab : known && known[0];
    if (eyebrow) text.append(element('p', 'tp-eyebrow', eyebrow));
    text.append(element('h1', '', info.subPage || info.tab));
    if (known && !info.subPage) text.append(element('p', 'tp-subtitle', known[1]));
    heading.append(text);
    box.prepend(heading);
  }

  function summaryStrip(id, label, items) {
    let strip = document.getElementById(id);
    if (!strip) {
      strip = element('section', 'tp-summary');
      strip.id = id;
      strip.setAttribute('aria-label', label);
    }
    strip.replaceChildren(...items.map(function (item) {
      const cell = element('div', 'tp-summary-item');
      const value = element('div', 'tp-summary-value' + (item.tone ? ' tp-' + item.tone : ''));
      value.append(element('span', '', item.value), element('span', 'tp-summary-detail', item.detail));
      cell.append(element('div', 'tp-summary-label', item.label), value);
      return cell;
    }));
    return strip;
  }

  // Docker tab: totals, filter tabs and search above the container table, kept current as
  // Unraid refreshes the rows.
  function docker() {
    const table = document.getElementById('docker_containers');
    const list = document.getElementById('docker_list');
    if (!table || !list) return;
    const anchor = table.closest('.TableContainer') || table;
    const filters = [['all', 'All'], ['running', 'Running'], ['stopped', 'Stopped'], ['updates', 'Updates']];
    let activeFilter = 'all';

    // Compact view: Unraid's ten columns in the order its table prints them. The view is only
    // offered while the table still has exactly these, so a changed Unraid release falls back to
    // the stock table instead of showing shuffled columns.
    const COLUMNS = ['name', 'version', 'network', 'ip', 'cport', 'ports', 'volumes', 'load', 'auto', 'uptime'];
    const headRow = table.querySelector('thead tr');
    const canCompact = Boolean(headRow) && headRow.children.length === COLUMNS.length;
    let compact = canCompact;
    try { compact = canCompact && localStorage.getItem('tft-docker-view') !== 'full'; } catch (error) { /* storage blocked */ }

    if (canCompact) {
      [...headRow.children].forEach(function (cell, index) { cell.classList.add('tp-c-' + COLUMNS[index]); });
      [['webui', 'WebUI'], ['status', 'Status'], ['cpu', 'CPU'], ['mem', 'Memory'], ['actions', '']].forEach(function (extra) {
        headRow.append(element('th', 'tp-extra tp-c-' + extra[0], extra[1]));
      });
    }

    function iconButton(icon, label, onClick, extraClass) {
      const button = element('button', 'tp-icon-button' + (extraClass ? ' ' + extraClass : ''));
      button.type = 'button';
      button.title = label;
      button.setAttribute('aria-label', label);
      button.append(element('i', 'fa fa-' + icon));
      button.addEventListener('click', onClick);
      return button;
    }

    // Adds the image name, a status cell and an actions cell to one of Unraid's rows. The actions
    // call the same functions as Unraid's own context menu. Rows are rebuilt on every refresh,
    // so this runs again for each new row.
    function decorate(row) {
      if (!canCompact || row.dataset.tpReady || row.children.length !== COLUMNS.length) return;
      row.dataset.tpReady = '1';
      [...row.children].forEach(function (cell, index) { cell.classList.add('tp-c-' + COLUMNS[index]); });

      const nameCell = row.querySelector('td.ct-name');
      const trigger = nameCell.querySelector('span.hand[id]');
      const nameLink = nameCell.querySelector('.appname');
      const name = nameLink ? nameLink.textContent.trim() : '';
      const id = trigger ? trigger.id : '';
      const state = nameCell.querySelector('.state');
      const running = Boolean(nameCell.querySelector('i.started'));
      const paused = Boolean(nameCell.querySelector('i.paused'));

      const repository = nameCell.querySelector('div.advanced a');
      const tag = row.querySelector('td.updatecolumn .fa-info-circle');
      const inner = nameCell.querySelector('.inner');
      if (inner && repository) {
        const tagText = tag && tag.parentElement ? tag.parentElement.textContent.trim() : '';
        inner.append(element('span', 'tp-image', repository.textContent.trim() + (tagText ? ':' + tagText : '')));
      }

      // WebUI: Unraid fills in the real address only while the container runs; a stopped
      // container still has placeholders like [IP] and [PORT:8080] in it.
      const webui = contextArguments(trigger)[7] || '';
      const webuiCell = element('td', 'tp-extra tp-c-webui');
      if (running && /^https?:\/\/[^\s\[\]'"<>]+$/.test(webui)) {
        const link = webuiOpener(element('a', 'tp-webui'), webui);
        link.title = 'Open ' + webui;
        link.setAttribute('aria-label', 'Open the web interface of ' + name);
        link.append(element('i', 'fa fa-external-link'));
        webuiCell.append(link);
      } else {
        webuiCell.append(element('span', 'tp-webui-none', '—'));
      }

      const statusCell = element('td', 'tp-extra tp-c-status');
      statusCell.append(element('span', 'tp-pill' + (running ? ' tp-good' : paused ? ' tp-warn' : ''), state ? state.textContent.trim() : ''));

      const actions = element('div', 'tp-actions');
      const control = function (action) {
        return function () { if (typeof window.eventControl === 'function') window.eventControl({ action: action, container: id }, 'loadlist'); };
      };
      actions.append(iconButton('navicon', 'View ' + name + ' logs', function () {
        if (typeof window.openTerminal === 'function') window.openTerminal('docker', name, '.log');
      }));
      if (paused) actions.append(iconButton('play', 'Resume ' + name, control('resume')));
      else if (running) actions.append(iconButton('refresh', 'Restart ' + name, control('restart')), iconButton('stop', 'Stop ' + name, control('stop'), 'tp-danger'));
      else actions.append(iconButton('play', 'Start ' + name, control('start'), 'tp-primary'));
      actions.append(iconButton('folder-o', 'Group for ' + name, function (event) {
        event.stopPropagation();
        openGroupMenu(event.currentTarget, name);
      }));
      // Unraid's full menu (WebUI, console, edit, remove, ...) opens from the container icon;
      // the click is passed on with this button's position so the menu appears next to it.
      actions.append(iconButton('ellipsis-h', 'More actions for ' + name, function (event) {
        event.stopPropagation();
        if (trigger) trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: event.clientX, clientY: event.clientY }));
      }));
      const actionsCell = element('td', 'tp-extra tp-c-actions');
      actionsCell.append(actions);
      row.append(webuiCell, statusCell, actionsCell);
    }

    const toolbar = element('div', 'tp-toolbar');
    const tabs = element('div', 'tp-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Filter containers');
    const search = element('input', 'tp-search');
    search.type = 'text';
    search.placeholder = 'Search containers';
    search.setAttribute('aria-label', 'Search containers');
    const counts = {};
    filters.forEach(function (filter) {
      const tab = element('button', 'tp-tab', filter[1] + ' ');
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.dataset.filter = filter[0];
      counts[filter[0]] = element('span', 'tp-tab-count', '0');
      tab.append(counts[filter[0]]);
      tab.addEventListener('click', function () {
        activeFilter = filter[0];
        render();
      });
      tabs.append(tab);
    });
    const tools = element('div', 'tp-tools');
    tools.append(search);
    if (canCompact) {
      const viewButton = element('button', 'tp-tab');
      viewButton.type = 'button';
      viewButton.setAttribute('aria-selected', 'true');
      viewButton.addEventListener('click', function () {
        compact = !compact;
        try { localStorage.setItem('tft-docker-view', compact ? 'compact' : 'full'); } catch (error) { /* storage blocked */ }
        render();
      });
      tools.append(viewButton);
      toolbar.tpViewButton = viewButton;
    }
    // Unraid's Basic / Advanced switch, shown as a two-part control in the toolbar. The original
    // switch stays in the page (hidden) and is clicked for real, so Unraid's own script still
    // does the switching and remembers the choice.
    const nativeToggle = document.querySelector('.ToggleViewMode input.advancedview');
    const nativeSwitch = nativeToggle && nativeToggle.parentElement.querySelector('.switch-button-background');
    let modeButtons = [];
    if (nativeToggle && nativeSwitch) {
      const segment = element('div', 'tp-segment');
      segment.setAttribute('role', 'group');
      segment.setAttribute('aria-label', 'Detail level');
      modeButtons = ['Basic', 'Advanced'].map(function (label, index) {
        const button = element('button', 'tp-tab', label);
        button.type = 'button';
        button.addEventListener('click', function () {
          if (nativeToggle.checked !== Boolean(index)) nativeSwitch.click();
          render();
        });
        segment.append(button);
        return button;
      });
      tools.append(segment);
      nativeToggle.closest('.ToggleViewMode').classList.add('tp-native-hidden');
    }
    if (toolbar.tpViewButton) tools.append(toolbar.tpViewButton);
    const newGroupButton = element('button', 'tp-tab', '+ Group');
    newGroupButton.type = 'button';
    newGroupButton.title = 'Create an application group';
    newGroupButton.setAttribute('aria-selected', 'true');
    newGroupButton.addEventListener('click', function () {
      createGroup().then(function (group) { if (group) saveGroups(); });
    });
    tools.append(newGroupButton);
    toolbar.append(tabs, tools);
    search.addEventListener('input', render);

    // ---- Application groups: named sets of containers, shown as collapsible sections.
    // Stored on the server (include/docker-groups.php) so every browser sees the same groups;
    // which sections are collapsed is remembered per browser.
    const GROUPS_URL = PLUGIN_BASE + '/include/docker-groups.php';
    const UNGROUPED = '\u0000ungrouped';
    let groups = [];
    let collapsed = [];
    try { collapsed = JSON.parse(localStorage.getItem('tft-docker-collapsed') || '[]'); } catch (error) { collapsed = []; }
    const groupRows = new Map();

    function loadGroups() {
      // Normally the page already carries the groups (AuroraTheme.page); otherwise they are fetched.
      if (Array.isArray(window.auroraDockerGroups)) {
        groups = window.auroraDockerGroups.filter(function (group) { return group && typeof group.name === 'string' && Array.isArray(group.containers); });
        render();
        return;
      }
      if (!PLUGIN_BASE) return;
      fetch(GROUPS_URL, { credentials: 'same-origin' })
        .then(function (response) { return response.json(); })
        .then(function (data) {
          groups = Array.isArray(data.groups) ? data.groups : [];
          render();
        })
        .catch(function (error) { console.error('Aurora Theme groups:', error); });
    }

    function saveGroups() {
      render();
      if (!PLUGIN_BASE) return;
      const body = new URLSearchParams({ groups: JSON.stringify(groups), csrf_token: window.csrf_token || '' });
      fetch(GROUPS_URL, { method: 'POST', credentials: 'same-origin', body: body })
        .then(function (response) {
          if (!response.ok) throw new Error('saving groups failed with status ' + response.status);
        })
        .catch(function (error) {
          console.error('Aurora Theme groups:', error);
          modal({ title: 'Group change not saved', message: 'The server did not accept the change. It will be lost when the page reloads.', confirmLabel: 'OK', hideCancel: true });
        });
    }

    function groupOf(containerName) {
      return groups.find(function (group) { return group.containers.includes(containerName); });
    }

    // Asks for a name; resolves with the new group, an existing group of that name, or null.
    function createGroup() {
      return modal({
        title: 'New application group',
        message: 'Give the group a name. Containers are added to it from their folder button.',
        input: { placeholder: 'Group name', maxLength: 60 },
        confirmLabel: 'Create group',
      }).then(function (name) {
        if (!name) return null;
        const existing = groups.find(function (group) { return group.name.toLowerCase() === name.toLowerCase(); });
        if (existing) return existing;
        const group = { name: name, containers: [] };
        groups.push(group);
        return group;
      });
    }

    function assign(containerName, group) {
      groups.forEach(function (other) {
        other.containers = other.containers.filter(function (entry) { return entry !== containerName; });
      });
      if (group) group.containers.push(containerName);
      saveGroups();
    }

    // Small menu next to a row's folder button: pick a group, make a new one, or leave the group.
    let groupMenu = null;
    function closeGroupMenu() {
      if (groupMenu) groupMenu.remove();
      groupMenu = null;
    }
    document.addEventListener('click', closeGroupMenu);
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeGroupMenu(); });

    function openGroupMenu(anchor, containerName) {
      closeGroupMenu();
      const current = groupOf(containerName);
      const menu = element('ul', 'dropdown-menu tp-group-menu');
      const entry = function (icon, text, onClick) {
        const item = element('li');
        const link = element('a');
        link.href = '#';
        link.append(element('i', 'fa fa-fw ' + icon), ' ' + text);
        link.addEventListener('click', function (event) {
          event.preventDefault();
          closeGroupMenu();
          onClick();
        });
        item.append(link);
        menu.append(item);
      };
      groups.forEach(function (group) {
        entry(group === current ? 'fa-check' : 'fa-folder-o', group.name, function () { assign(containerName, group); });
      });
      if (groups.length) menu.append(element('li', 'divider'));
      entry('fa-plus', 'New group…', function () {
        createGroup().then(function (group) { if (group) assign(containerName, group); });
      });
      if (current) entry('fa-times', 'Remove from group', function () { assign(containerName, null); });
      document.body.append(menu);
      const box = anchor.getBoundingClientRect();
      menu.style.cssText = 'display:block;position:fixed;z-index:10001;margin:0';
      menu.style.top = Math.min(box.bottom + 6, window.innerHeight - menu.offsetHeight - 8) + 'px';
      menu.style.left = Math.max(8, Math.min(box.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8)) + 'px';
      groupMenu = menu;
    }

    // Starts or stops several containers one after another, then lets Unraid reload the list once.
    function runAll(action, ids) {
      const jq = window.jQuery;
      if (!jq || !window.eventURL || !ids.length) return;
      jq('div.spinner.fixed').show('slow');
      let chain = Promise.resolve();
      ids.forEach(function (id) {
        chain = chain.then(function () {
          return new Promise(function (resolve) { jq.post(window.eventURL, { action: action, container: id }).always(resolve); });
        });
      });
      chain.then(function () {
        if (typeof window.loadlist === 'function') window.loadlist();
        else jq('div.spinner.fixed').hide('slow');
      });
    }

    function groupRow(key, group) {
      if (groupRows.has(key)) return groupRows.get(key);
      const row = element('tr', 'tp-group');
      const cell = element('td');
      cell.colSpan = 20;
      const head = element('div', 'tp-group-head');
      const toggle = element('button', 'tp-group-toggle');
      toggle.type = 'button';
      toggle.append(element('i', 'fa fa-chevron-down'), element('span', 'tp-group-name'), element('span', 'tp-group-count'));
      toggle.addEventListener('click', function () {
        collapsed = collapsed.includes(key) ? collapsed.filter(function (entry) { return entry !== key; }) : collapsed.concat(key);
        try { localStorage.setItem('tft-docker-collapsed', JSON.stringify(collapsed)); } catch (error) { /* storage blocked */ }
        render();
      });
      head.append(toggle);
      const actions = element('div', 'tp-actions');
      const members = function () { return row.tpItems || []; };
      actions.append(iconButton('play', 'Start all stopped containers in this section', function () {
        runAll('start', members().filter(function (item) { return !item.running && !item.paused; }).map(function (item) { return item.id; }));
      }));
      actions.append(iconButton('stop', 'Stop all running containers in this section', function () {
        const running = members().filter(function (item) { return item.running; });
        if (!running.length) return;
        modal({
          title: 'Stop ' + running.length + ' container' + (running.length === 1 ? '' : 's') + '?',
          message: 'All running containers in this section will be stopped: ' + running.map(function (item) { return item.name; }).join(', ') + '.',
          confirmLabel: 'Stop',
          danger: true,
        }).then(function (confirmed) {
          if (confirmed) runAll('stop', running.map(function (item) { return item.id; }));
        });
      }, 'tp-danger'));
      if (group) {
        actions.append(iconButton('pencil', 'Rename group', function () {
          modal({
            title: 'Rename group',
            input: { value: group.name, placeholder: 'Group name', maxLength: 60 },
            validate: function (name) {
              const taken = groups.some(function (other) { return other !== group && other.name.toLowerCase() === name.toLowerCase(); });
              return taken ? 'A group with that name already exists.' : '';
            },
            confirmLabel: 'Rename',
          }).then(function (name) {
            if (!name || name === group.name) return;
            groupRows.delete(key);
            row.remove();
            group.name = name;
            saveGroups();
          });
        }));
        actions.append(iconButton('trash-o', 'Delete group (its containers stay)', function () {
          modal({
            title: 'Delete "' + group.name + '"?',
            message: 'Only the group is removed. Its containers are kept and become ungrouped.',
            confirmLabel: 'Delete group',
            danger: true,
          }).then(function (confirmed) {
            if (!confirmed) return;
            groups = groups.filter(function (other) { return other !== group; });
            saveGroups();
          });
        }, 'tp-danger'));
      }
      head.append(actions);
      cell.append(head);
      row.append(cell);
      groupRows.set(key, row);
      return row;
    }

    // Text is only written when it changed: writing inside the list wakes the refresh observer.
    function setText(node, text) {
      if (node.textContent !== text) node.textContent = text;
    }

    // Puts the section headers and their containers in order at the top of the list. Runs after
    // every refresh, and moves nothing when the order is already right.
    function layoutGroups(rows) {
      const sections = groups.map(function (group) {
        return { key: 'g:' + group.name, group: group, title: group.name, items: rows.filter(function (item) { return group.containers.includes(item.name); }) };
      });
      if (sections.length) {
        const rest = rows.filter(function (item) { return !groupOf(item.name); });
        if (rest.length) sections.push({ key: UNGROUPED, group: null, title: 'Ungrouped', items: rest });
      }
      const wanted = new Set(sections.map(function (section) { return section.key; }));
      groupRows.forEach(function (row, key) {
        if (!wanted.has(key)) {
          row.remove();
          groupRows.delete(key);
        }
      });

      const order = [];
      sections.forEach(function (section) {
        const header = groupRow(section.key, section.group);
        header.tpItems = section.items;
        header.tpKey = section.key;
        const running = section.items.filter(function (item) { return item.running; }).length;
        setText(header.querySelector('.tp-group-name'), section.title);
        setText(header.querySelector('.tp-group-count'), section.items.length + (section.items.length === 1 ? ' container' : ' containers') + ' · ' + running + ' running');
        const isCollapsed = collapsed.includes(section.key);
        header.classList.toggle('tp-collapsed', isCollapsed);
        header.querySelector('.tp-group-toggle').setAttribute('aria-expanded', String(!isCollapsed));
        order.push(header);
        section.items.forEach(function (item) {
          item.collapsed = isCollapsed;
          order.push(item.row);
        });
      });
      order.forEach(function (node, index) {
        if (list.children[index] !== node) list.insertBefore(node, list.children[index] || null);
      });
    }

    function describe(row) {
      const name = row.querySelector('td.ct-name');
      const update = row.querySelector('td.updatecolumn');
      const appName = name.querySelector('.appname');
      const trigger = name.querySelector('span.hand[id]');
      return {
        row: row,
        name: appName ? appName.textContent.trim() : '',
        id: trigger ? trigger.id : '',
        collapsed: false,
        text: row.textContent.toLowerCase(),
        running: Boolean(name.querySelector('i.started')),
        paused: Boolean(name.querySelector('i.paused')),
        update: Boolean(update && (update.querySelector('.orange-text') || /update ready/i.test(update.textContent))),
      };
    }

    function render() {
      const rows = [...list.querySelectorAll('td.ct-name')].map(function (cell) { return describe(cell.parentElement); });
      if (!rows.length) return;
      rows.forEach(function (item) { decorate(item.row); });
      layoutGroups(rows);
      table.classList.toggle('tp-compact', compact);
      table.classList.toggle('tp-advanced', Boolean(nativeToggle && nativeToggle.checked));
      modeButtons.forEach(function (button, index) {
        button.setAttribute('aria-selected', String(Boolean(nativeToggle.checked) === Boolean(index)));
      });
      if (toolbar.tpViewButton) {
        toolbar.tpViewButton.textContent = compact ? 'All columns' : 'Compact view';
        toolbar.tpViewButton.title = compact ? 'Show every column of Unraid\'s table' : 'Show the compact container list';
      }
      const running = rows.filter(function (item) { return item.running; }).length;
      const paused = rows.filter(function (item) { return item.paused; }).length;
      const updates = rows.filter(function (item) { return item.update; }).length;
      const stopped = rows.length - running - paused;

      const strip = summaryStrip('tp-docker-summary', 'Docker summary', [
        { label: 'Containers', value: rows.length, detail: 'total' },
        { label: 'Running', value: running, detail: paused ? paused + ' paused' : 'started', tone: 'good' },
        { label: 'Stopped', value: stopped, detail: 'not running' },
        { label: 'Updates available', value: updates, detail: updates === 1 ? 'image' : 'images', tone: updates ? 'warn' : '' },
      ]);
      if (!strip.isConnected) anchor.before(strip);
      if (!toolbar.isConnected) anchor.before(toolbar);

      counts.all.textContent = rows.length;
      counts.running.textContent = running;
      counts.stopped.textContent = stopped;
      counts.updates.textContent = updates;
      tabs.querySelectorAll('.tp-tab').forEach(function (tab) {
        tab.setAttribute('aria-selected', String(tab.dataset.filter === activeFilter));
      });

      const query = search.value.trim().toLowerCase();
      rows.forEach(function (item) {
        const matchesFilter = activeFilter === 'all'
          || (activeFilter === 'running' && item.running)
          || (activeFilter === 'stopped' && !item.running && !item.paused)
          || (activeFilter === 'updates' && item.update);
        item.visible = matchesFilter && item.text.includes(query);
        item.row.classList.toggle('tp-filtered-out', !item.visible || item.collapsed);
      });
      // A section whose containers are all filtered away is hidden with them; an empty group
      // stays visible so it can be filled, unless a filter or search is active.
      groupRows.forEach(function (header) {
        const items = header.tpItems || [];
        const filtering = activeFilter !== 'all' || query !== '';
        const show = items.length ? items.some(function (item) { return item.visible; }) : !filtering;
        header.classList.toggle('tp-filtered-out', !show);
      });
    }

    // Rendered straight away when Unraid inserts its rows, before the browser paints them, so
    // the list never shows ungrouped. render() only moves or writes what changed, so its own
    // changes settle after one more pass. The list is shown once it is laid out (see
    // #docker_list.tp-ready in enhance.css, which also reveals it by itself after two seconds).
    new MutationObserver(function () {
      render();
      if (list.querySelector('td.ct-name')) list.classList.add('tp-ready');
    }).observe(list, { childList: true, subtree: true });
    loadGroups();
    render();
    if (list.querySelector('td.ct-name')) list.classList.add('tp-ready');
  }

  // Dashboard: uptime, CPU, memory and array at a glance, read from Unraid's own tiles and
  // refreshed whenever Unraid updates those values.
  function dashboardSummary() {
    const grid = document.querySelector('#displaybox div.frame');
    if (!grid || !document.getElementById('db_box1')) return;
    const text = function (selector) {
      const node = document.querySelector(selector);
      return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
    };
    const arrayHeader = document.querySelector('#array_list .tile-header-left .section > span');
    const memoryInfo = [...document.querySelectorAll('.head_info')].map(function (node) { return node.textContent; }).find(function (value) { return /Memory:/.test(value); }) || '';

    function render() {
      const uptime = text('span.uptime');
      const uptimeParts = uptime.match(/^(\d+\s+\w+),?\s*(.*)$/);
      const cpu = text('span.cpu.load');
      const memory = text('span.sys0_.load');
      const memorySize = (memoryInfo.match(/Memory:\s*([\d.,]+\s*\w+)/) || [])[1] || '';
      const array = arrayHeader ? arrayHeader.textContent.replace(/\s+/g, ' ').trim() : '';
      const arrayParts = array.match(/^(.*?)\s+used of\s+(.*?)\s*\(([\d.,]+)\s*%\)/);
      const items = [];
      if (uptime) items.push({ label: 'Uptime', value: uptimeParts ? uptimeParts[1] : uptime, detail: uptimeParts ? uptimeParts[2] : '' });
      if (cpu) items.push({ label: 'CPU load', value: cpu, detail: 'overall', tone: 'accent' });
      if (memory) items.push({ label: 'Memory', value: memory, detail: memorySize ? 'of ' + memorySize : 'in use', tone: 'accent' });
      if (arrayParts) items.push({ label: 'Array', value: arrayParts[3] + '%', detail: arrayParts[1] + ' of ' + arrayParts[2], tone: 'good' });
      if (!items.length) return;
      const strip = summaryStrip('tp-dashboard-summary', 'Server summary', items);
      if (!strip.isConnected) grid.before(strip);
    }

    const watch = new MutationObserver(debounce(render));
    ['span.uptime', 'span.cpu.load', 'span.sys0_.load'].forEach(function (selector) {
      const node = document.querySelector(selector);
      if (node) watch.observe(node, { childList: true, characterData: true, subtree: true });
    });
    if (arrayHeader) watch.observe(arrayHeader, { childList: true, characterData: true, subtree: true });
    render();
  }

  // Dashboard load charts are drawn by SmoothieCharts on a canvas, so CSS cannot colour them.
  // Their options are adjusted once: theme colours, a thicker smooth line with a soft fill.
  function dashboardCharts() {
    const styles = getComputedStyle(document.documentElement);
    const token = function (name, fallback) { return styles.getPropertyValue(name).trim() || fallback; };
    const primary = token('--tp-primary', '#4f8bff');
    const second = '#d97706';
    const grid = token('--tp-border', '#232833');
    const muted = token('--tp-muted', '#8b93a5');
    const soft = function (colour, alpha) {
      const hex = colour.replace('#', '');
      if (!/^[0-9a-f]{6}$/i.test(hex)) return 'transparent';
      return 'rgba(' + [0, 2, 4].map(function (index) { return parseInt(hex.slice(index, index + 2), 16); }).join(',') + ',' + alpha + ')';
    };
    [window.cpuchart, window.netchart].forEach(function (chart) {
      if (!chart || !chart.options || !Array.isArray(chart.seriesSet)) return;
      chart.options.interpolation = 'bezier';
      if (chart.options.grid) {
        chart.options.grid.strokeStyle = grid;
        chart.options.grid.fillStyle = 'transparent';
        chart.options.grid.borderVisible = false;
      }
      if (chart.options.labels) {
        chart.options.labels.fillStyle = muted;
        chart.options.labels.fontFamily = token('--tp-font-body', 'sans-serif');
      }
      chart.seriesSet.forEach(function (entry, index) {
        const colour = index === 0 ? primary : second;
        entry.options.strokeStyle = colour;
        entry.options.lineWidth = 2;
        entry.options.fillStyle = chart.seriesSet.length === 1 ? soft(colour, 0.12) : undefined;
      });
    });
  }

  // Dashboard, processor tile: Unraid fills it from the Unraid API's live feed only, so it shows
  // 0% and N/A whenever that service is not running. When no figures have come after a few
  // seconds, the plugin reads the processor counters itself and feeds them into the same
  // functions the live feed uses. It steps back as soon as the API delivers.
  function dashboardCpu() {
    const chart = window.cpuchart;
    if (!chart || typeof window.updateCPUBarCharts !== 'function' || !document.getElementById('cpu-total-power') || !PLUGIN_BASE) return;
    const URL_CPU = PLUGIN_BASE + '/include/cpu.php';
    let previous = null;
    let ours = null;
    let timer = null;
    let busy = false;

    const apiDelivers = function () {
      const data = chart.customData && chart.customData.cpuData;
      return Boolean(data) && data !== ours;
    };
    const percent = function (from, to) {
      const all = to[1] - from[1];
      return all > 0 ? Math.max(0, Math.min(100, (to[0] - from[0]) / all * 100)) : 0;
    };
    const setValue = function (node, text) {
      // "Total Power: N/A" keeps its icon and (translated) label; only the value changes.
      const last = node.lastChild;
      if (last && last.nodeType === Node.TEXT_NODE && last.textContent.includes(':')) {
        last.textContent = last.textContent.replace(/:.*$/, ': ' + text);
      } else {
        node.textContent = text;
      }
    };

    function show(sample) {
      if (!previous || !sample.total || !previous.total) return;
      const seconds = sample.t - previous.t;
      const cpus = sample.cpus.map(function (counters, index) {
        const before = previous.cpus[index] || counters;
        const all = counters[1] - before[1];
        return {
          percentTotal: percent(before, counters),
          percentUser: all > 0 ? Math.max(0, Math.min(100, (counters[2] - before[2]) / all * 100)) : 0,
        };
      });
      ours = { percentTotal: percent(previous.total, sample.total), cpus: cpus };
      chart.customData = chart.customData || {};
      chart.customData.cpuData = ours;
      chart.customData.cpuLoad = Math.floor(ours.percentTotal);
      if (typeof window.addChartCpu === 'function') window.addChartCpu(chart.customData.cpuLoad);
      window.updateCPUBarCharts();

      // Package power from the energy counters, and package temperatures, where the hardware has them.
      if (window.cpupower) return;
      if (seconds > 0 && sample.energy.length && sample.energy.length === previous.energy.length) {
        const watts = sample.energy.map(function (counter, index) {
          let used = counter[0] - previous.energy[index][0];
          if (used < 0) used += counter[1];
          return used / seconds / 1e6;
        });
        setValue(document.getElementById('cpu-total-power'), watts.reduce(function (sum, value) { return sum + value; }, 0).toFixed(2) + ' W');
        watts.forEach(function (value, index) {
          const node = document.getElementById('cpu-power' + index);
          if (node) node.textContent = value.toFixed(2) + ' W';
        });
      }
      sample.temps.forEach(function (celsius, index) {
        const node = document.getElementById('cpu-temp' + index);
        if (!node || celsius === null) return;
        const fahrenheit = window.tempunit === 'F';
        node.textContent = Math.round(fahrenheit ? celsius * 9 / 5 + 32 : celsius) + ' °' + (fahrenheit ? 'F' : 'C');
      });
    }

    function poll() {
      if (apiDelivers()) {
        clearInterval(timer);
        return;
      }
      if (busy || document.hidden) return;
      busy = true;
      fetch(URL_CPU, { credentials: 'same-origin', cache: 'no-store' })
        .then(function (response) {
          if (!response.ok) throw new Error('processor figures failed with status ' + response.status);
          return response.json();
        })
        .then(function (sample) {
          if (apiDelivers()) return;
          show(sample);
          previous = sample;
        })
        .catch(function (error) {
          clearInterval(timer);
          console.error('Aurora Theme processor figures:', error);
        })
        .finally(function () { busy = false; });
    }

    setTimeout(function () {
      if (apiDelivers()) return;
      poll();
      timer = setInterval(poll, 1500);
    }, 4000);
  }

  // Dashboard, Docker tile: a click on a container opens a dialog with its state and everything
  // Unraid's small context menu offers, as large buttons. The buttons call Unraid's own functions.
  function dashboardContainers() {
    const view = document.getElementById('docker_view');
    if (!view) return;
    const safeUrl = function (url) { return /^https?:\/\//i.test(url || '') ? url : ''; };

    function open(chip) {
      const trigger = chip.querySelector('span.hand[onclick*="addDockerContainerContext"]');
      const args = contextArguments(trigger);
      if (args.length < 11 || typeof window.eventControl !== 'function') return false;
      const ct = {
        name: args[0], image: args[1], template: args[2], started: args[3] === '1', paused: args[4] === '1',
        update: args[5], autostart: args[6] === 'true', webui: safeUrl(args[7]), tswebui: safeUrl(args[8]), shell: args[9],
        id: args[10], support: safeUrl(args[11]), project: safeUrl(args[12]), registry: safeUrl(args[13]),
        donate: safeUrl(args[14]), readme: safeUrl(args[15]),
      };
      const state = ct.started ? (ct.paused ? 'paused' : 'running') : 'stopped';
      const previousFocus = document.activeElement;

      const backdrop = element('div', 'tp-modal-backdrop');
      const box = element('div', 'tp-modal tp-ct-modal tp-ct-' + state);
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-labelledby', 'tp-ct-title');

      const head = element('div', 'tp-ct-head');
      const icon = element('div', 'tp-ct-icon');
      const picture = trigger.querySelector('img, i');
      if (picture) icon.append(picture.cloneNode(true));
      const text = element('div', 'tp-ct-text');
      const title = element('h2', 'tp-modal-title', ct.name);
      title.id = 'tp-ct-title';
      const meta = element('div', 'tp-ct-meta');
      meta.append(element('span', 'tp-ct-status', { running: 'Running', paused: 'Paused', stopped: 'Stopped' }[state]));
      meta.append(element('span', 'tp-ct-tag', ct.autostart ? 'Autostart on' : 'Autostart off'));
      if (ct.update === '1') meta.append(element('span', 'tp-ct-tag tp-ct-update', 'Update available'));
      text.append(title, meta);
      const closeButton = element('button', 'tp-ct-close');
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', 'Close');
      closeButton.append(element('i', 'fa fa-times'));
      head.append(icon, text, closeButton);
      box.append(head);

      function close() {
        document.removeEventListener('keydown', onKey, true);
        backdrop.remove();
        if (previousFocus && previousFocus.focus) previousFocus.focus();
      }
      function button(iconName, label, run, kind) {
        const node = element('button', 'tp-ct-action' + (kind ? ' tp-ct-' + kind : ''));
        node.type = 'button';
        node.append(element('i', 'fa fa-' + iconName), element('span', '', label));
        node.addEventListener('click', function () {
          close();
          run();
        });
        return node;
      }
      function link(iconName, label, url, webui) {
        const node = element('a', 'tp-ct-action tp-ct-link');
        if (webui) webuiOpener(node, url);
        else {
          node.href = url;
          node.target = '_blank';
          node.rel = 'noopener noreferrer';
        }
        node.append(element('i', 'fa fa-' + iconName), element('span', '', label));
        node.addEventListener('click', close);
        return node;
      }
      const control = function (action) { return function () { window.eventControl({ action: action, container: ct.id }, 'loadlist'); }; };
      const call = function (name) {
        const args = [].slice.call(arguments, 1);
        return function () { if (typeof window[name] === 'function') window[name].apply(window, args); };
      };

      const primary = element('div', 'tp-ct-primary');
      if (state === 'running') {
        if (ct.webui) primary.append(link('globe', 'Open WebUI', ct.webui, true));
        primary.append(button('stop', 'Stop', control('stop'), 'danger-soft'), button('refresh', 'Restart', control('restart')), button('pause', 'Pause', control('pause')));
      } else if (state === 'paused') {
        primary.append(button('play', 'Resume', control('resume'), 'go'), button('refresh', 'Restart', control('restart')), button('stop', 'Stop', control('stop'), 'danger-soft'));
      } else {
        primary.append(button('play', 'Start', control('start'), 'go'));
      }
      const firstPrimary = primary.firstElementChild;
      if (firstPrimary) firstPrimary.classList.add('tp-ct-main');
      box.append(primary);

      const tools = element('div', 'tp-ct-grid');
      if (state === 'running') tools.append(button('terminal', 'Console', call('openTerminal', 'docker', ct.name, ct.shell)));
      tools.append(button('align-left', 'Logs', call('openTerminal', 'docker', ct.name, '.log')));
      if (ct.update === '1') tools.append(button('cloud-download', 'Update', call('updateContainer', ct.name), 'accent'));
      if (ct.template) tools.append(button('pencil', 'Edit', call('editContainer', ct.name, ct.template)));
      tools.append(button('trash', 'Remove', call('rmContainer', ct.name, ct.image, ct.id), 'danger'));
      box.append(element('h3', 'tp-ct-section', 'Manage'), tools);

      const links = element('div', 'tp-ct-grid');
      if (state === 'running' && ct.tswebui) links.append(link('globe', 'Tailscale WebUI', ct.tswebui, true));
      if (ct.readme) links.append(link('book', 'Read me first', ct.readme));
      if (ct.project) links.append(link('life-ring', 'Project page', ct.project));
      if (ct.support) links.append(link('question-circle', 'Support', ct.support));
      if (ct.registry) links.append(link('info-circle', 'More info', ct.registry));
      if (ct.donate) links.append(link('heart', 'Donate', ct.donate));
      if (links.children.length) box.append(element('h3', 'tp-ct-section', 'Links'), links);

      function onKey(event) {
        if (event.key === 'Escape') {
          event.stopPropagation();
          close();
        } else if (event.key === 'Tab') {
          const stops = [...box.querySelectorAll('button, a[href]')];
          const index = stops.indexOf(document.activeElement);
          event.preventDefault();
          stops[(index + (event.shiftKey ? stops.length - 1 : 1) + stops.length) % stops.length].focus();
        }
      }
      closeButton.addEventListener('click', close);
      backdrop.addEventListener('click', function (event) {
        event.stopPropagation();
        if (event.target === backdrop) close();
      });
      document.addEventListener('keydown', onKey, true);
      backdrop.append(box);
      document.body.append(backdrop);
      (firstPrimary || closeButton).focus();
      return true;
    }

    // Captured before Unraid's own handler, which would open the small context menu instead.
    view.addEventListener('click', function (event) {
      const chip = event.target.closest('span.outer.apps');
      if (!chip || event.button !== 0) return;
      if (open(chip)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  // Dashboard, Processor tile: instead of a "Physical CPU n Power: ... Temperature: ..." line
  // and a full-width row for every core, the cores are a grid of small tiles (number, load, bar)
  // and power and temperature are chips. Unraid's own elements stay in place and keep being
  // updated by Unraid; package lines without readings (N/A, -1) are hidden.
  function dashboardCores() {
    const total = document.getElementById('cpu-total-power');
    const tile = total && total.closest('tbody');
    if (!tile || tile.classList.contains('tp-cpu-tile')) return;
    tile.classList.add('tp-cpu-tile');

    const missing = function (text) { return !text.trim() || /N\/A|^\s*-/.test(text); };
    // A chip that shows the value part ("12.3 W") of a source element and hides when there is none.
    const chip = function (icon, title, source, valueOf) {
      const node = element('span', 'tp-cpu-chip');
      const glyph = element('i', 'fa ' + icon);
      glyph.setAttribute('aria-hidden', 'true');
      const value = element('span', 'tp-cpu-chip-value');
      node.title = title;
      node.append(glyph, value);
      const sync = function () {
        const text = valueOf(source.textContent);
        node.hidden = missing(text);
        if (value.textContent !== text) value.textContent = text;
      };
      new MutationObserver(sync).observe(source, { childList: true, characterData: true, subtree: true });
      sync();
      return node;
    };
    const afterColon = function (text) { return text.includes(':') ? text.slice(text.lastIndexOf(':') + 1).trim() : text.trim(); };

    // Summary chips: total power and, with one processor, its temperature.
    const stats = element('div', 'tp-cpu-stats');
    stats.append(chip('fa-bolt', 'Total power', total, afterColon));
    const temp0 = document.getElementById('cpu-temp0');
    const headTemp = temp0 && temp0.closest('.head_info');
    if (headTemp) stats.append(chip('fa-thermometer-half', 'Temperature', temp0, function (text) { return text.trim(); }));
    const headInfo = total.closest('.head_info');
    if (headInfo) {
      headInfo.parentNode.insertBefore(stats, headInfo);
      headInfo.classList.add('tp-cpu-source');
      if (headTemp) headTemp.classList.add('tp-cpu-source');
    }

    // Per processor package: a short "CPU n" line with power and temperature chips.
    tile.querySelectorAll('span.cpu_open [id^="cpu-power"]').forEach(function (power) {
      const index = power.id.replace('cpu-power', '');
      const line = power.closest('span.cpu_open');
      const row = line.closest('tr');
      const temp = document.getElementById('cpu-temp' + index);
      const chips = [chip('fa-bolt', 'Power', power, function (text) { return text.trim(); })];
      if (temp && line.contains(temp)) chips.push(chip('fa-thermometer-half', 'Temperature', temp, function (text) { return text.trim(); }));
      [...line.childNodes].forEach(function (node) { node.remove(); });
      const hidden = element('span', 'tp-cpu-source');
      hidden.append(power);
      if (temp && chips.length > 1) hidden.append(temp);
      line.append(element('span', 'tp-cpu-pkg-name', 'CPU ' + index), ...chips, hidden);
      if (row) row.classList.add('tp-cpu-pkg');
      const update = function () {
        if (row) row.classList.toggle('tp-cpu-pkg-empty', chips.every(function (node) { return node.hidden; }));
      };
      chips.forEach(function (node) { new MutationObserver(update).observe(node, { attributes: true, attributeFilter: ['hidden'] }); });
      update();
    });
    tile.querySelectorAll('td.thin').forEach(function (cell) { cell.closest('tr').classList.add('tp-cpu-gap'); });

    // Core rows: "CPU 3" / "CPU 0 - HT 12" becomes "3" / "0 · 12", the full text stays as a tooltip.
    tile.querySelectorAll('tr.cpu_open').forEach(function (row) {
      row.classList.add('tp-core');
      const label = row.querySelector('span.w26');
      if (!label) return;
      const full = label.textContent.replace(/\s+/g, ' ').trim();
      const match = full.match(/^CPU\s+(\d+)\s*(\([^)]*\))?\s*(?:-\s*HT\s+(\d+))?/);
      if (!match) return;
      row.title = full;
      label.textContent = match[1] + (match[3] ? ' · ' + match[3] : '') + (match[2] ? ' ' + match[2].replace(/[()]/g, '') : '');
      if (match[3]) row.classList.add('tp-core-pair');
    });
  }

  // Dashboard, System tile: Unraid draws its four rings in grey from a colour list in the page
  // script. The list gets the theme's colours (RAM: system, free, VMs, Docker, ...), and the
  // boot, log and Docker rings are drawn by the theme in a colour that follows the usage level.
  function dashboardMemory() {
    const charts = document.querySelector('.tile-system-memory-charts');
    if (!charts) return;
    charts.classList.add('tp-rings');
    const styles = getComputedStyle(document.documentElement);
    const token = function (name, fallback) { return styles.getPropertyValue(name).trim() || fallback; };
    if (Array.isArray(window.colors)) {
      const palette = [token('--tp-primary', '#4f8bff'), token('--tp-ring-track', '#2a3140'), '#a78bfa', '#22d3ee', '#f472b6', '#fbbf24', '#34d399', '#fb7185', '#818cf8', '#2dd4bf', '#f97316', '#60a5fa'];
      palette.forEach(function (colour, index) { if (index < window.colors.length) window.colors[index] = colour; });
    }

    // Unraid colours the percentage green, orange or red; that colour gives the level.
    const levelOf = function (node) {
      const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(node.style.color || '');
      if (!match) return 'ok';
      const red = +match[1];
      const green = +match[2];
      if (red > 180 && green < 90) return 'critical';
      if (red > 180) return 'warning';
      return 'ok';
    };
    [...charts.querySelectorAll('div.pie[id^="sys"]')].forEach(function (pie) {
      const value = pie.querySelector('span[class^="sys"]');
      if (!value) return;
      const update = function () {
        pie.dataset.level = levelOf(value);
        const percent = parseFloat(value.textContent);
        if (!isNaN(percent)) pie.style.setProperty('--tp-p', Math.max(0, Math.min(100, percent)));
      };
      new MutationObserver(update).observe(value, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style'] });
      update();
    });
  }

  // Airflow tile: Unraid prints fan names and speeds as rows of three. They become one row of
  // small cards that wraps only when there are more fans than fit. The speed elements are moved,
  // not copied, so Unraid keeps updating them by their ids.
  function dashboardFans() {
    const firstSpeed = document.querySelector('table.dashboard td > span[id^="fan"]');
    if (!firstSpeed) return;
    const cell = firstSpeed.parentElement;
    if (cell.querySelector('.tp-fans')) return;
    const spans = [...cell.children].filter(function (node) { return node.tagName === 'SPAN'; });
    const speeds = spans.filter(function (node) { return /^fan\d+$/.test(node.id); });
    const names = spans.filter(function (node) { return !node.id; });
    if (!speeds.length || names.length !== speeds.length) return;

    const grid = element('div', 'tp-fans');
    speeds.forEach(function (speed, index) {
      const card = element('div', 'tp-fan');
      const icon = element('i', 'fa fa-asterisk tp-fan-icon');
      icon.setAttribute('aria-hidden', 'true');
      const text = element('div', 'tp-fan-text');
      speed.className = 'tp-fan-speed';
      text.append(element('span', 'tp-fan-name', names[index].textContent.trim()), speed);
      card.append(icon, text);
      grid.append(card);
      // A fan at 0 RPM is shown as stopped.
      const mark = function () { card.classList.toggle('tp-fan-idle', /^\s*0\s/.test(speed.textContent)); };
      new MutationObserver(mark).observe(speed, { childList: true, characterData: true, subtree: true });
      mark();
    });
    cell.replaceChildren(grid);
  }

  // Unraid's "External Link" dialog puts the address, the checkbox and its label in one bold
  // run of text. It is rearranged into an address box and a clickable label; the checkbox itself
  // is moved, not replaced, so Unraid still reads it when OK is pressed.
  function externalLinkDialog() {
    const arrange = function () {
      const box = document.getElementById('Link_Always_Allow');
      if (!box || box.dataset.tpArranged) return;
      const bold = box.closest('b');
      const holder = box.closest('span');
      if (!bold || !holder) return;
      box.dataset.tpArranged = '1';
      const address = bold.firstChild ? bold.firstChild.textContent.trim() : '';
      let rest = '';
      for (let node = box.nextSibling; node; node = node.nextSibling) rest += node.textContent;
      const label = element('label', 'tp-link-allow');
      label.append(box, rest.trim());
      bold.replaceWith(element('div', 'tp-link-url', address), label);
      holder.querySelectorAll('br').forEach(function (br) { br.remove(); });
    };
    new MutationObserver(arrange).observe(document.body, { childList: true, subtree: true });
    arrange();
  }

  // Tools pages: their help text is given a clearer structure. Paragraphs written all in
  // italics or starting with "NOTE" become notes, warnings ("DO NOT ...", red text) become
  // warning callouts, all-caps lines (the EULA's sections) become headings and "Name Copyright"
  // lines (Credits) become rows. On Diagnostics the list of collected files becomes cards.
  function toolText(info) {
    if (info.tab !== 'Tools' || !location.pathname.split('/')[2]) return;
    const content = document.querySelector('#displaybox .content');
    if (!content || content.classList.contains('tp-tool-text')) return;
    content.classList.add('tp-tool-text');
    const textOf = function (node) { return node.textContent.replace(/\s+/g, ' ').trim(); };
    content.querySelectorAll('p').forEach(function (p) {
      if (p.closest('.unapi, pre, table, blockquote, dd, dt')) return;
      const text = textOf(p);
      if (!text) return;
      const looseText = [...p.childNodes].filter(function (node) { return node.nodeType === 3; }).map(function (node) { return node.textContent; }).join('').trim();
      const red = p.querySelector(':scope > font[color=red], :scope > .red-text');
      const only = p.children.length === 1 && !looseText ? p.firstElementChild : null;
      if (p.matches('.warning, .notice, .red-text, .orange-text') || /^(DO NOT|WARNING|CAUTION|IMPORTANT)\b/.test(text) || (red && textOf(red) === text)) p.classList.add('tp-callout', 'tp-callout-warn');
      else if (p.matches('.blue-text') || /^NOTE\b/i.test(text) || (!looseText && p.querySelector(':scope > em, :scope > i:not(.fa)'))) p.classList.add('tp-callout');
      else if (only && only.matches('strong, b') && text.length < 80) p.classList.add('tp-text-subheading');
      else if (text.length < 90 && /[A-Z]{3}/.test(text) && text === text.toUpperCase()) p.classList.add('tp-text-heading');
      else if (p.firstChild && p.firstChild.nodeType === 1 && p.firstChild.matches('strong, b') && /copyright/i.test(text)) p.classList.add('tp-credit');
    });
    diagnosticsList(content);
  }

  // Diagnostics: "+ /config <br> copy all ..." in a pre block, rebuilt as one card per entry.
  function diagnosticsList(content) {
    const holder = content.querySelector('pre.pre > p');
    if (!holder || !/\/Diagnostics$/.test(location.pathname)) return;
    const items = [];
    let item = null;
    const addText = function (text) {
      if (item && text.trim()) item.desc.push(document.createTextNode(text.replace(/\s+/g, ' ')));
    };
    [...holder.childNodes].forEach(function (node) {
      if (node.nodeType === 3) {
        const parts = node.textContent.split('+');
        addText(parts[0]);
        parts.slice(1).forEach(function (part) {
          item = { title: '', desc: [] };
          items.push(item);
          addText(part);
        });
      } else if (!item || node.nodeType !== 1) {
        return;
      } else if (!item.title && node.matches('em')) {
        item.title = node.textContent.trim();
      } else if (node.matches('br')) {
        if (item.desc.length) item.desc.push(document.createElement('br'));
      } else {
        item.desc.push(node);
      }
    });
    if (items.length < 2 || items.some(function (entry) { return !entry.title; })) return;
    const icons = [[/^\/config$/, 'fa-cog'], [/^\/config\/shares/, 'fa-share-alt'], [/^syslog/i, 'fa-file-text-o'], [/^system/i, 'fa-microchip'], [/^smart/i, 'fa-hdd-o'], [/^docker/i, 'fa-cube']];
    const grid = element('div', 'tp-collect');
    items.forEach(function (entry) {
      const match = icons.find(function (pair) { return pair[0].test(entry.title); });
      const icon = element('i', 'fa ' + (match ? match[1] : 'fa-file-o'));
      icon.setAttribute('aria-hidden', 'true');
      const head = element('div', 'tp-collect-title');
      head.append(icon, element('span', '', entry.title));
      while (entry.desc.length && entry.desc[entry.desc.length - 1].nodeName === 'BR') entry.desc.pop();
      const desc = element('p', 'tp-collect-desc');
      desc.append(...entry.desc);
      const card = element('div', 'tp-collect-item');
      card.append(head, desc);
      grid.append(card);
    });
    holder.closest('pre').replaceWith(grid);
  }

  // Community Applications: its Change Log, Credits and Statistics view is shown as a modal by
  // the theme; a click on the dimmed backdrop closes it like its own close button. App names in
  // the search field are not spell-checked (no red underline).
  function caOverlay() {
    const search = document.getElementById('searchBox');
    if (search) search.spellcheck = false;
    const overlay = document.getElementById('alternateView');
    if (!overlay) return;
    overlay.addEventListener('click', function (event) {
      if (event.target !== overlay) return;
      const close = overlay.querySelector('.alternateViewClose');
      if (close) close.click();
    });
  }

  // Settings and Tools: a search field above the panels. Typing filters the panels by their
  // name (and page name); sections without a match are hidden with them.
  function panelSearch(info) {
    if (info.subPage || !/^(Settings|Tools)$/.test(info.tab)) return;
    const panels = [...document.querySelectorAll('#displaybox .Panels .Panel')];
    if (!panels.length || document.querySelector('.tp-panel-search')) return;

    const items = panels.map(function (panel) {
      const link = panel.querySelector('a');
      const page = link ? (link.getAttribute('href') || '').split('/').pop().replace(/([a-z0-9])([A-Z])/g, '$1 $2') : '';
      return { panel: panel, text: (panel.textContent + ' ' + page).toLowerCase() };
    });
    const wrap = element('div', 'tp-panel-search');
    const field = element('input', 'tp-panel-search-input');
    field.type = 'search';
    field.placeholder = 'Search ' + info.tab.toLowerCase() + '…';
    field.setAttribute('aria-label', 'Search ' + info.tab.toLowerCase());
    const count = element('span', 'tp-panel-search-count');
    count.setAttribute('aria-live', 'polite');
    wrap.append(field, count);
    const empty = element('p', 'tp-panel-search-empty', 'Nothing matches this search.');
    empty.hidden = true;

    const heading = document.querySelector('#displaybox .tp-heading');
    const firstGroup = panels[0].parentElement;
    const firstTitle = firstGroup.previousElementSibling && firstGroup.previousElementSibling.matches('div.title') ? firstGroup.previousElementSibling : firstGroup;
    if (heading) heading.append(wrap);
    else firstTitle.before(wrap);
    (document.querySelector('.tp-fav-title') || firstTitle).before(empty);

    function filter() {
      const words = field.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      items.forEach(function (item) {
        const match = words.every(function (word) { return item.text.includes(word); });
        item.panel.classList.toggle('tp-filtered-out', !match);
        if (match) shown += 1;
      });
      // Worked out each time: favourites move cards between sections.
      const groups = new Set(document.querySelectorAll('#displaybox .Panels'));
      groups.forEach(function (group) {
        // The Favourites section stays visible (with its hint) while nothing is searched.
        const visible = (!words.length && group.classList.contains('tp-fav-panels')) ||
          [...group.children].some(function (child) { return child.matches('.Panel') && !child.classList.contains('tp-filtered-out'); });
        group.classList.toggle('tp-filtered-out', !visible);
        const title = group.previousElementSibling;
        if (title && title.matches('div.title')) title.classList.toggle('tp-filtered-out', !visible);
      });
      count.textContent = words.length ? shown + ' of ' + items.length : '';
      empty.hidden = shown > 0;
    }
    field.addEventListener('input', filter);
    document.addEventListener('tp-panels-moved', filter);
    // "/" jumps to the search field, as on many sites; Escape clears it.
    document.addEventListener('keydown', function (event) {
      if (event.key === '/' && !/^(input|textarea|select)$/i.test(document.activeElement.tagName)) {
        event.preventDefault();
        field.focus();
      }
    });
    field.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        field.value = '';
        filter();
      }
    });
  }

  // Settings and Tools: a "Favourites" section above the others. Each card gets a star; a starred
  // card moves into Favourites and leaves its own section, and goes back to its old place when
  // the star is removed. The list is kept on the flash drive, so it is the same in every browser.
  function panelFavourites(info) {
    if (info.subPage || !/^(Settings|Tools)$/.test(info.tab)) return;
    const panels = [...document.querySelectorAll('#displaybox .Panels .Panel')];
    if (!panels.length || document.querySelector('.tp-fav-panels')) return;
    const URL_FAVOURITES = PLUGIN_BASE + '/include/favourites.php';

    const keyOf = function (panel) {
      const link = panel.querySelector('a[href]');
      if (!link) return '';
      try { return new URL(link.href, location.href).pathname.replace(/^\/+|\/+$/g, ''); } catch (error) { return ''; }
    };
    const cards = [];
    panels.forEach(function (panel, index) {
      const key = keyOf(panel);
      if (!key) return;
      cards.push({ panel: panel, key: key, home: panel.parentElement, order: index });
      const star = element('button', 'tp-fav-toggle');
      star.type = 'button';
      star.append(element('i', 'fa fa-star'));
      panel.append(star);
      star.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggle(key);
      });
    });
    if (!cards.length) return;

    const firstGroup = panels[0].parentElement;
    const firstTitle = firstGroup.previousElementSibling && firstGroup.previousElementSibling.matches('div.title') ? firstGroup.previousElementSibling : firstGroup;
    const title = element('div', 'title tp-fav-title');
    const left = element('span', 'left');
    left.append(element('i', 'fa fa-star title'), document.createTextNode('Favourites'));
    title.append(left);
    const hint = element('p', 'tp-fav-hint', 'Star a card to pin it here. Starred cards leave their own section until the star is removed.');
    const group = element('div', 'Panels tp-fav-panels');
    firstTitle.before(title, group, hint);

    let favourites = [];

    function place() {
      cards.forEach(function (card) {
        const starred = favourites.includes(card.key);
        const star = card.panel.querySelector('.tp-fav-toggle');
        const name = (card.panel.querySelector('.PanelText') || card.panel).textContent.trim();
        star.classList.toggle('tp-on', starred);
        star.setAttribute('aria-pressed', starred ? 'true' : 'false');
        star.title = (starred ? 'Remove ' : 'Add ') + name + (starred ? ' from favourites' : ' to favourites');
        star.setAttribute('aria-label', star.title);
        card.panel.classList.toggle('tp-fav', starred);
      });
      // Favourites in the order they were starred; every other card back at its old place.
      favourites.forEach(function (key) {
        const card = cards.find(function (item) { return item.key === key; });
        if (card) group.append(card.panel);
      });
      cards.filter(function (card) { return !favourites.includes(card.key); })
        .sort(function (a, b) { return a.order - b.order; })
        .forEach(function (card) { card.home.append(card.panel); });
      hint.hidden = group.children.length > 0;
      document.querySelectorAll('#displaybox .Panels').forEach(function (section) {
        const empty = section !== group && !section.querySelector('.Panel');
        section.classList.toggle('tp-empty-section', empty);
        const sectionTitle = section.previousElementSibling;
        if (sectionTitle && sectionTitle.matches('div.title')) sectionTitle.classList.toggle('tp-empty-section', empty);
      });
      document.dispatchEvent(new CustomEvent('tp-panels-moved'));
    }

    function toggle(key) {
      const before = favourites.slice();
      favourites = favourites.includes(key) ? favourites.filter(function (item) { return item !== key; }) : favourites.concat(key);
      place();
      if (!PLUGIN_BASE) return;
      const body = new URLSearchParams({ favourites: JSON.stringify(favourites), csrf_token: window.csrf_token || '' });
      fetch(URL_FAVOURITES, { method: 'POST', credentials: 'same-origin', body: body })
        .then(function (response) {
          if (!response.ok) throw new Error('saving favourites failed with status ' + response.status);
        })
        .catch(function (error) {
          console.error('Aurora Theme favourites:', error);
          favourites = before;
          place();
          modal({ title: 'Favourite not saved', message: 'The server did not accept the change, so the card is back where it was.', confirmLabel: 'OK', hideCancel: true });
        });
    }

    place();
    if (!PLUGIN_BASE) return;
    fetch(URL_FAVOURITES, { credentials: 'same-origin' })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        favourites = Array.isArray(data.favourites) ? data.favourites.filter(function (item) { return typeof item === 'string'; }) : [];
        place();
      })
      .catch(function (error) { console.error('Aurora Theme favourites:', error); });
  }

  // Drop-down lists: the open list of a <select> is drawn by the browser and cannot be styled,
  // so a themed list is shown in its place. The <select> stays the real control: choosing an
  // entry sets it and fires the events its page listens for. Touch devices keep the native
  // picker, which suits them better.
  function selectLists() {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
    let open = null;

    const usable = function (select) {
      return select.matches('select') && !select.multiple && !select.disabled && (!select.size || select.size <= 1) &&
        !select.closest('.tp-native-select') && select.options.length > 0;
    };

    function close(returnFocus) {
      if (!open) return;
      const current = open;
      open = null;
      current.panel.remove();
      current.select.classList.remove('tp-select-open');
      current.select.setAttribute('aria-expanded', 'false');
      if (returnFocus) current.select.focus({ preventScroll: true });
    }

    function choose(entry) {
      const select = open.select;
      const changed = select.selectedIndex !== entry.index;
      close(true);
      if (!changed) return;
      select.selectedIndex = entry.index;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function setActive(position) {
      const entries = open.entries;
      if (!entries.length) return;
      const next = Math.max(0, Math.min(entries.length - 1, position));
      if (open.active >= 0) entries[open.active].node.classList.remove('tp-active');
      open.active = next;
      entries[next].node.classList.add('tp-active');
      // Scrolled by hand: scrollIntoView could scroll the page too, and that closes the list.
      const node = entries[next].node;
      const panel = open.panel;
      if (node.offsetTop < panel.scrollTop) panel.scrollTop = node.offsetTop - 6;
      else if (node.offsetTop + node.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTop = node.offsetTop + node.offsetHeight - panel.clientHeight + 6;
    }

    function show(select) {
      close(false);
      const panel = element('div', 'tp-select-panel');
      panel.setAttribute('role', 'listbox');
      const entries = [];
      const addOption = function (option, parent) {
        const node = element('div', 'tp-select-option', option.textContent.trim() || ' ');
        node.setAttribute('role', 'option');
        if (option.disabled || (option.parentElement && option.parentElement.disabled)) {
          node.classList.add('tp-disabled');
          node.setAttribute('aria-disabled', 'true');
        }
        if (option.selected) {
          node.classList.add('tp-selected');
          node.setAttribute('aria-selected', 'true');
        }
        if (option.hidden || option.style.display === 'none') return;
        parent.append(node);
        if (node.classList.contains('tp-disabled')) return;
        const entry = { node: node, index: option.index };
        entries.push(entry);
        node.addEventListener('mousemove', function () { if (open && open.entries[open.active] !== entry) setActive(entries.indexOf(entry)); });
        node.addEventListener('click', function () { choose(entry); });
      };
      [...select.children].forEach(function (child) {
        if (child.matches('optgroup')) {
          panel.append(element('div', 'tp-select-group', child.label));
          [...child.children].forEach(function (option) { addOption(option, panel); });
        } else if (child.matches('option')) {
          addOption(child, panel);
        }
      });
      if (!entries.length) return;
      panel.addEventListener('mousedown', function (event) { event.preventDefault(); });
      document.body.append(panel);

      // Under the field, or above it when there is more room there.
      const rect = select.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upwards = below < 220 && above > below;
      panel.style.minWidth = rect.width + 'px';
      panel.style.maxHeight = Math.max(160, Math.min(360, upwards ? above : below)) + 'px';
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8));
      panel.style.left = left + 'px';
      if (upwards) panel.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
      else panel.style.top = (rect.bottom + 6) + 'px';
      panel.classList.add(upwards ? 'tp-upwards' : 'tp-downwards');

      select.classList.add('tp-select-open');
      select.setAttribute('aria-expanded', 'true');
      open = { select: select, panel: panel, entries: entries, active: -1, typed: '', typedAt: 0 };
      const selected = entries.findIndex(function (entry) { return entry.index === select.selectedIndex; });
      setActive(selected >= 0 ? selected : 0);
    }

    document.addEventListener('mousedown', function (event) {
      const select = event.target.closest && event.target.closest('select');
      if (open && open.panel.contains(event.target)) return;
      if (select && event.button === 0 && usable(select)) {
        event.preventDefault();
        if (open && open.select === select) close(true);
        else {
          select.focus({ preventScroll: true });
          show(select);
        }
        return;
      }
      close(false);
    }, true);

    document.addEventListener('keydown', function (event) {
      if (!open) {
        // Alt+Down, F4, Space or Enter on a focused list open the themed list as well.
        const select = document.activeElement;
        if (select && select.matches && select.matches('select') && usable(select) &&
            ((event.altKey && event.key === 'ArrowDown') || event.key === 'F4' || event.key === ' ' || event.key === 'Enter')) {
          event.preventDefault();
          show(select);
        }
        return;
      }
      const key = event.key;
      if (key === 'Escape' || key === 'Tab') {
        if (key === 'Escape') event.preventDefault();
        close(key === 'Escape');
      } else if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        setActive(open.active + (key === 'ArrowDown' ? 1 : -1));
      } else if (key === 'Home' || key === 'End' || key === 'PageUp' || key === 'PageDown') {
        event.preventDefault();
        const step = { Home: -1e6, End: 1e6, PageUp: -8, PageDown: 8 }[key];
        setActive(open.active + step);
      } else if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        if (open.active >= 0) choose(open.entries[open.active]);
      } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Type-ahead: jump to the first entry starting with the typed letters.
        event.preventDefault();
        const now = Date.now();
        open.typed = (now - open.typedAt > 700 ? '' : open.typed) + key.toLowerCase();
        open.typedAt = now;
        const match = open.entries.findIndex(function (entry) { return entry.node.textContent.trim().toLowerCase().startsWith(open.typed); });
        if (match >= 0) setActive(match);
      }
    }, true);

    window.addEventListener('resize', function () { close(false); });
    document.addEventListener('scroll', function (event) {
      if (open && !open.panel.contains(event.target)) close(false);
    }, true);
  }

  // Docker container editor (add, edit, install from Apps): every host port field is checked
  // while typing and shows a green tick or a red cross on its right, with the reason under it.
  // Checked: a number from 1 to 65535; not twice in this form; not used by another container
  // on the server's address (from Unraid's own list on the page); not taken by a program on the
  // server (include/ports.php). A container with its own address (custom network) can reuse
  // ports, so only the first two checks apply there; the port a container already has when it
  // is edited is accepted as well.
  function dockerPorts() {
    const form = document.querySelector('input[name="contName"]');
    if (!form || !document.getElementById('configLocation')) return;
    const nameField = form;
    const originalName = nameField.value.trim().toLowerCase();
    const network = document.querySelector('select[name="contNetwork"]');
    let listening = [];

    // Unraid's list: [{Name, Port: "<span>bridge</span><span>192.168.1.10</span><span>80, 443</span>"}]
    const allocations = (Array.isArray(window.Allocations) ? window.Allocations : []).map(function (entry) {
      const parts = [...new DOMParser().parseFromString(String(entry.Port || ''), 'text/html').querySelectorAll('span')].map(function (span) { return span.textContent.trim(); });
      return {
        name: String(entry.Name || ''),
        network: parts[0] || '',
        ip: parts[1] || '',
        ports: (parts[2] || '').split(/\s*,\s*/).map(Number).filter(function (port) { return port > 0; }),
      };
    });
    const hostAddresses = new Set([location.hostname]);
    allocations.forEach(function (entry) { if (/^(bridge|host)$/.test(entry.network) && entry.ip) hostAddresses.add(entry.ip); });

    const sharesHostAddress = function () {
      const mode = network ? network.value : 'bridge';
      return mode === 'bridge' || mode === 'host';
    };

    function portRows() {
      return [...document.querySelectorAll('#configLocation input[name="confType[]"]')]
        .filter(function (type) { return type.value === 'Port'; })
        .map(function (type) {
          const row = type.closest('[id^="ConfigNum"]');
          const field = row && row.querySelector('input[name="confValue[]"]');
          if (!field) return null;
          const value = function (name) { const node = row.querySelector('input[name="' + name + '"]'); return node ? node.value : ''; };
          return { row: row, field: field, name: value('confName[]'), proto: (value('confMode[]') || 'tcp').toLowerCase(), required: value('confRequired[]') === 'true' };
        })
        .filter(Boolean);
    }

    // Returns [ok, message]; ok is null for an empty optional field (no mark).
    function check(item, rows) {
      const text = item.field.value.trim();
      if (!text) return item.required ? [false, 'A port is required here.'] : [null, ''];
      // A single port, or a range such as 8000-8010.
      const match = /^(\d+)(?:-(\d+))?$/.exec(text);
      if (!match) return [false, 'Use a port number (1 to 65535) or a range such as 8000-8010.'];
      const first = Number(match[1]);
      const last = match[2] ? Number(match[2]) : first;
      if (first < 1 || last > 65535 || first > 65535) return [false, 'Ports go from 1 to 65535.'];
      if (last < first) return [false, 'A range starts with the lower port.'];
      const inRange = function (value) { return value >= first && value <= last; };
      const span = function (value) {
        const parts = /^(\d+)(?:-(\d+))?$/.exec(String(value).trim());
        return parts ? [Number(parts[1]), Number(parts[2] || parts[1])] : null;
      };
      const twin = rows.find(function (other) {
        const range = other !== item && other.proto === item.proto && span(other.field.value);
        return range && range[0] <= last && range[1] >= first;
      });
      if (twin) return [false, 'Also used for "' + (twin.name || 'another port') + '" in this container (' + item.proto.toUpperCase() + ').'];
      if (!sharesHostAddress()) return [true, 'Valid. This container has its own address, so the port cannot clash.'];
      const own = item.field.dataset.tpOriginal === text;
      const current = nameField.value.trim().toLowerCase();
      const user = allocations.find(function (entry) {
        const name = entry.name.toLowerCase();
        return name !== current && name !== originalName && hostAddresses.has(entry.ip) && entry.ports.some(inRange);
      });
      if (user) {
        const taken = user.ports.find(inRange);
        return [false, 'Port ' + taken + ' is already used by the container "' + user.name + '".'];
      }
      const program = !own && listening.find(function (entry) { return inRange(entry.port) && entry.proto === item.proto; });
      if (program) return [false, 'Port ' + program.port + ' is in use on the server' + (program.process ? ' by ' + program.process : '') + '.'];
      return [true, (first === last ? 'Port ' + first + ' is' : 'Ports ' + first + ' to ' + last + ' are') + ' free.'];
    }

    function decorate(item) {
      const field = item.field;
      if (field.dataset.tpPortReady) return;
      field.dataset.tpPortReady = '1';
      field.dataset.tpOriginal = field.value.trim();
      const wrap = element('span', 'tp-port-field');
      field.before(wrap);
      wrap.append(field);
      const mark = element('span', 'tp-port-mark');
      mark.setAttribute('aria-hidden', 'true');
      wrap.append(mark);
      const message = element('span', 'tp-port-message');
      message.id = 'tp-port-message-' + Math.random().toString(36).slice(2);
      message.setAttribute('aria-live', 'polite');
      field.setAttribute('aria-describedby', message.id);
      const line = wrap.closest('.flex-row') || wrap.parentElement;
      line.after(message);
      field.addEventListener('input', run);
    }

    function run() {
      const rows = portRows();
      rows.forEach(decorate);
      rows.forEach(function (item) {
        const result = check(item, rows);
        const wrap = item.field.parentElement;
        const message = document.getElementById(item.field.getAttribute('aria-describedby'));
        wrap.classList.toggle('tp-port-ok', result[0] === true);
        wrap.classList.toggle('tp-port-bad', result[0] === false);
        item.field.setAttribute('aria-invalid', result[0] === false ? 'true' : 'false');
        wrap.title = result[1];
        if (message) {
          message.textContent = result[0] === false ? result[1] : '';
          message.hidden = result[0] !== false;
        }
      });
      renderAllocations();
    }

    // The same check for the host port in the "Add / Edit Configuration" dialog.
    function dialogCheck(event) {
      const field = event.target;
      if (!field.matches || !field.matches('.ui-dialog input[name="Value"]')) return;
      const dialog = field.closest('.ui-dialog');
      const type = dialog.querySelector('select[name="Type"]');
      const wrap = field.closest('.tp-port-field');
      if (!type || type.value !== 'Port') {
        if (wrap) wrap.classList.remove('tp-port-ok', 'tp-port-bad');
        return;
      }
      let holder = wrap;
      if (!holder) {
        holder = element('span', 'tp-port-field');
        field.before(holder);
        holder.append(field, element('span', 'tp-port-mark'));
        field.focus();
      }
      const mode = dialog.querySelector('select[name="Mode"]');
      const editing = dialog.querySelector('.ui-dialog-title');
      const item = { field: field, name: '', proto: mode ? mode.value : 'tcp', required: true };
      const result = check(item, portRows().filter(function (row) {
        // When editing, the row being edited is not a duplicate of itself.
        return !(editing && /edit/i.test(editing.textContent) && row.field.dataset.tpOriginal === field.defaultValue);
      }));
      holder.classList.toggle('tp-port-ok', result[0] === true);
      holder.classList.toggle('tp-port-bad', result[0] === false);
      holder.title = result[1];
    }
    document.addEventListener('input', dialogCheck);

    // "Show docker allocations": Unraid's plain list becomes a filterable view with one row
    // per container: network badge, address and its ports as chips (runs of ports such as
    // 25500-25599 as one chip). Ports that clash with this form's ports are marked red.
    const allocationBox = document.getElementById('dockerAllocations');
    let allocationFilter = '';
    const portRanges = function (ports) {
      const sorted = [...new Set(ports)].sort(function (a, b) { return a - b; });
      const ranges = [];
      sorted.forEach(function (port) {
        const last = ranges[ranges.length - 1];
        if (last && port === last[1] + 1) last[1] = port;
        else ranges.push([port, port]);
      });
      return ranges;
    };
    const parseRange = function (text) {
      const parts = /^(\d+)(?:-(\d+))?$/.exec(String(text).trim());
      return parts ? [Number(parts[1]), Number(parts[2] || parts[1])] : null;
    };

    function renderAllocations() {
      if (!allocationBox || !allocations.length) return;
      let view = allocationBox.querySelector(':scope > .tp-alloc');
      if (!view) {
        view = element('div', 'tp-alloc');
        const head = element('div', 'tp-alloc-head');
        const search = element('input', 'tp-alloc-search');
        search.type = 'search';
        search.placeholder = 'Filter by container, network, address or port…';
        search.setAttribute('aria-label', 'Filter docker allocations');
        search.value = allocationFilter;
        search.addEventListener('input', function () {
          allocationFilter = search.value;
          renderAllocations();
        });
        head.append(search, element('span', 'tp-alloc-count'));
        const columns = element('div', 'tp-alloc-row tp-alloc-columns');
        ['Container', 'Network', 'Address', 'Ports'].forEach(function (label) { columns.append(element('span', '', label)); });
        view.append(head, columns, element('div', 'tp-alloc-list'));
        allocationBox.prepend(view);
      }
      allocationBox.querySelectorAll(':scope > dl').forEach(function (list) { list.hidden = true; });

      const current = nameField.value.trim().toLowerCase();
      const clashCheck = sharesHostAddress();
      const formRanges = portRows().map(function (item) { return parseRange(item.field.value); }).filter(Boolean);
      const words = allocationFilter.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const list = view.querySelector('.tp-alloc-list');
      list.replaceChildren();
      let shown = 0;
      allocations.forEach(function (entry) {
        const ranges = portRanges(entry.ports);
        const portText = ranges.map(function (range) { return range[0] === range[1] ? String(range[0]) : range[0] + '-' + range[1]; }).join(' ');
        const haystack = (entry.name + ' ' + entry.network + ' ' + entry.ip + ' ' + portText).toLowerCase();
        const match = words.every(function (word) {
          if (/^\d+$/.test(word) && ranges.some(function (range) { return Number(word) >= range[0] && Number(word) <= range[1]; })) return true;
          return haystack.includes(word);
        });
        if (!match) return;
        shown += 1;
        const self = entry.name.toLowerCase() === current || entry.name.toLowerCase() === originalName;
        const row = element('div', 'tp-alloc-row' + (self ? ' tp-alloc-self' : ''));
        const name = element('span', 'tp-alloc-name', entry.name);
        if (self) name.append(element('span', 'tp-alloc-badge', 'This container'));
        const kind = entry.network === 'bridge' ? 'bridge' : entry.network === 'host' ? 'host' : 'custom';
        const net = element('span', 'tp-alloc-net');
        net.append(element('span', 'tp-alloc-pill tp-net-' + kind, entry.network || '?'));
        const ports = element('span', 'tp-alloc-ports');
        if (!ranges.length) ports.append(element('span', 'tp-alloc-none', entry.network === 'host' ? 'Host network: uses the ports it opens' : 'No published ports'));
        ranges.forEach(function (range) {
          const chip = element('span', 'tp-alloc-port', range[0] === range[1] ? String(range[0]) : range[0] + '–' + range[1]);
          if (range[0] !== range[1]) {
            chip.classList.add('tp-alloc-range');
            chip.title = (range[1] - range[0] + 1) + ' ports';
          }
          const clash = clashCheck && !self && hostAddresses.has(entry.ip) && formRanges.some(function (own) { return own[0] <= range[1] && own[1] >= range[0]; });
          if (clash) {
            chip.classList.add('tp-alloc-clash');
            chip.title = 'Also used in this container\'s settings';
          }
          ports.append(chip);
        });
        row.append(name, net, element('span', 'tp-alloc-ip', entry.ip || '—'), ports);
        list.append(row);
      });
      if (!shown) list.append(element('p', 'tp-alloc-empty', 'No container matches this filter.'));
      view.querySelector('.tp-alloc-count').textContent = (words.length ? shown + ' of ' : '') + allocations.length + ' containers';
    }
    if (allocationBox) new MutationObserver(function () {
      // Unraid fills the box (again) with its own list; the view is put back on top.
      if (!allocationBox.querySelector(':scope > .tp-alloc') || allocationBox.querySelector(':scope > dl:not([hidden])')) renderAllocations();
    }).observe(allocationBox, { childList: true });

    if (network) network.addEventListener('change', run);
    nameField.addEventListener('input', run);
    // Ports added or removed through the dialog, and rows Unraid rebuilds.
    new MutationObserver(debounce(run)).observe(document.getElementById('configLocation'), { childList: true, subtree: true });
    run();
    if (!PLUGIN_BASE) return;
    fetch(PLUGIN_BASE + '/include/ports.php', { credentials: 'same-origin' })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        listening = Array.isArray(data.listening) ? data.listening : [];
        run();
      })
      .catch(function (error) { console.error('Aurora Theme ports:', error); });
  }

  // VMs: Unraid opens a VM's details (disks, interfaces, snapshots) when its name is clicked,
  // which is easy to miss. Each VM gets a chevron button in front of its icon that does the same,
  // and turns while the details are open. Unraid remembers which VMs are open.
  function vmDetails() {
    const list = document.getElementById('kvm_list');
    if (!list || typeof window.toggle_id !== 'function') return;

    function decorate() {
      list.querySelectorAll('tr[parent-id]').forEach(function (row) {
        if (row.dataset.tpExpand) return;
        const id = 'name-' + row.getAttribute('parent-id');
        const details = document.getElementById(id);
        const cell = row.querySelector('td.vm-name');
        if (!details || !cell) return;
        row.dataset.tpExpand = '1';
        const nameLink = cell.querySelector('.inner > a');
        const name = nameLink ? nameLink.textContent.trim() : 'this VM';
        const button = element('button', 'tp-vm-expand');
        button.type = 'button';
        button.setAttribute('aria-controls', id);
        button.append(element('i', 'fa fa-chevron-right'));
        button.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          window.toggle_id(id);
        });
        const outer = cell.querySelector('span.outer');
        if (outer) outer.before(button);
        else cell.prepend(button);
        // The details are this row and the rows after it, up to the next VM.
        for (let next = details; next && !next.hasAttribute('parent-id'); next = next.nextElementSibling) next.classList.add('tp-vm-details');

        snapshotTools(row, details);

        const sync = function () {
          const open = details.style.display !== 'none';
          button.classList.toggle('tp-open', open);
          row.classList.toggle('tp-vm-open', open);
          button.setAttribute('aria-expanded', open ? 'true' : 'false');
          button.title = (open ? 'Hide details of ' : 'Show disks, interfaces and snapshots of ') + name;
          button.setAttribute('aria-label', button.title);
        };
        new MutationObserver(sync).observe(details, { attributes: true, attributeFilter: ['style'] });
        sync();
      });
    }
    // Snapshots in the details: a "Create snapshot" button in the section heading (the section
    // is added when the VM has none yet), and Revert / Remove / more buttons on each snapshot.
    // Everything calls Unraid's own functions, the same ones its menus use.
    function snapshotTools(row, details) {
      const trigger = row.querySelector('[onclick*="addVMContext"]');
      const vm = contextArguments(trigger);
      const inner = details.querySelector('table');
      if (vm.length < 4 || !inner || typeof window.selectsnapshot !== 'function') return;
      const name = vm[0];
      const uuid = vm[1];
      const state = vm[3];
      const fstype = vm[7] || 'QEMU';
      const small = function (icon, label, run, extra) {
        const button = element('button', 'tp-snap-button' + (extra ? ' ' + extra : ''));
        button.type = 'button';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.append(element('i', 'fa fa-' + icon));
        button.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          run(event);
        });
        return button;
      };

      let heading = [...inner.querySelectorAll('thead th')].find(function (cell) { return cell.querySelector('i.fa-clone'); });
      if (!heading) {
        const head = element('thead', 'child tp-snap-added');
        const headRow = element('tr');
        heading = element('th');
        heading.colSpan = 6;
        heading.innerHTML = '<i class="fa fa-clone"></i> <b>Snapshots</b>';
        headRow.append(heading);
        head.append(headRow);
        const body = element('tbody', 'child tp-snap-added');
        const emptyRow = element('tr');
        const emptyCell = element('td', 'tp-snap-empty', 'No snapshots yet.');
        emptyCell.colSpan = 6;
        emptyRow.append(emptyCell);
        body.append(emptyRow);
        inner.append(head, body);
      }
      const create = element('button', 'tp-snap-create');
      create.type = 'button';
      create.append(element('i', 'fa fa-plus'), document.createTextNode(' Create snapshot'));
      create.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        window.selectsnapshot(uuid, name, '--generate', 'create', false, state, fstype);
      });
      heading.append(create);

      inner.querySelectorAll('[id^="vmsnap-"][onclick*="addVMSnapContext"]').forEach(function (span) {
        const snap = contextArguments(span);
        const cell = span.closest('td');
        if (snap.length < 5 || !cell || cell.querySelector('.tp-snap-actions')) return;
        const snapshot = snap[4];
        const method = snap[5] || 'QEMU';
        const busy = function () { if (window.jQuery) window.jQuery('#vm-' + uuid).find('i').removeClass('fa-play fa-square fa-pause').addClass('fa-refresh fa-spin'); };
        const actions = element('span', 'tp-snap-actions');
        actions.append(
          small('fast-backward', 'Revert ' + name + ' to snapshot ' + snapshot, function () { window.selectsnapshot(uuid, name, snapshot, 'revert', true, state, method); }),
          small('trash', 'Remove snapshot ' + snapshot, function () { busy(); window.selectsnapshot(uuid, name, snapshot, 'remove', true); }, 'tp-snap-danger'),
          // Block commit / pull and the rest stay in Unraid's menu, opened here as well.
          small('ellipsis-h', 'More actions for snapshot ' + snapshot, function (event) {
            span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY }));
          })
        );
        cell.append(actions);
      });
    }

    decorate();
    new MutationObserver(debounce(decorate)).observe(list, { childList: true });
  }

  // Main: temperatures and error counts in the device tables become small coloured chips.
  // Unraid redraws the rows every few seconds, so new rows are marked again as they come.
  function mainTables() {
    const tables = [...document.querySelectorAll('table.disk_status, table.usb_mounts')];
    if (!tables.length) return;
    const wrap = function (cell, text) {
      const chip = element('span', 'tp-chip');
      if (text !== undefined) chip.textContent = text;
      else while (cell.firstChild) chip.append(cell.firstChild);
      cell.replaceChildren(chip);
    };
    tables.forEach(function (table) {
      const headings = [...table.querySelectorAll('thead tr:first-child > td, thead tr:first-child > th')].map(function (cell) { return cell.textContent.trim().toLowerCase(); });
      const tempAt = headings.findIndex(function (text) { return text.startsWith('temp'); });
      const errorsAt = headings.indexOf('errors');
      const mark = function () {
        // The cell under a given heading, counting merged cells (colspan) as several columns.
        const cellAt = function (row, column) {
          let position = 0;
          for (const cell of row.children) {
            const span = cell.colSpan || 1;
            if (column < position + span) return span === 1 ? cell : null;
            position += span;
          }
          return null;
        };
        table.querySelectorAll('tbody tr').forEach(function (row) {
          const temp = tempAt >= 0 && cellAt(row, tempAt);
          if (temp && !temp.dataset.tpDone) {
            temp.dataset.tpDone = '1';
            const text = temp.textContent.trim();
            const match = /^(\d+(?:[.,]\d+)?)\s*°\s*([CF])$/.exec(text);
            if (match) {
              const celsius = match[2] === 'F' ? (parseFloat(match[1]) - 32) * 5 / 9 : parseFloat(match[1]);
              temp.classList.add('tp-temp');
              temp.dataset.level = celsius >= 55 ? 'hot' : celsius >= 45 ? 'warm' : 'ok';
              wrap(temp);
            } else if (text === '*') {
              // Unraid shows "*" for a disk in standby.
              temp.classList.add('tp-temp');
              temp.dataset.level = 'idle';
              temp.title = 'Spun down';
              wrap(temp, 'Standby');
            }
          }
          const errors = errorsAt >= 0 && cellAt(row, errorsAt);
          if (errors && !errors.dataset.tpDone) {
            errors.dataset.tpDone = '1';
            // Only the visible number counts; a warning icon's tooltip text may hold digits too.
            const visible = [...errors.childNodes].filter(function (node) { return node.nodeType === Node.TEXT_NODE; }).map(function (node) { return node.textContent; }).join('');
            const count = parseInt(visible.replace(/[^\d]/g, ''), 10);
            if (count > 0) {
              const tooltip = errors.querySelector('a.info > span');
              errors.classList.add('tp-errors');
              if (tooltip) errors.title = tooltip.textContent.trim();
              wrap(errors, String(count));
            }
          }
        });
      };
      mark();
      // Marked straight away, not after a delay: observer callbacks run before the browser
      // paints, so the redrawn rows never show unmarked (no flicker). Marked cells are skipped,
      // so the observer's own changes end the loop.
      new MutationObserver(mark).observe(table, { childList: true, subtree: true });
    });
  }

  // Main, Array Operation: Unraid lays the actions out as table rows (status, button,
  // explanation). The rows become cards in one grid, grouped by purpose, each with an icon and
  // a title: Array, Parity check, Last check, Disks, Mover, Power. Nothing is moved out of its
  // form, and the cells keep their ids, so Unraid's own scripts work unchanged.
  function arrayOperations() {
    const tables = [...document.querySelectorAll('#displaybox table.ArrayOperation-Table')];
    if (!tables.length || document.querySelector('.tp-ops')) return;
    const outer = function (table) { return table.closest('form') || table; };
    const first = outer(tables[0]);
    const last = outer(tables[tables.length - 1]);
    if (first.parentElement !== last.parentElement) return;
    const grid = element('div', 'tp-ops');
    first.before(grid);
    // Empty paragraphs left by Unraid's markdown would push the cards down.
    for (let node = grid.previousElementSibling; node && node.matches('p, script'); node = node.previousElementSibling) {
      if (node.matches('p') && !node.textContent.trim()) node.hidden = true;
    }
    for (let node = first; node;) {
      const next = node.nextSibling;
      grid.append(node);
      if (node === last) break;
      node = next;
    }

    // A running parity check (or rebuild, clear, read check) adds one row per figure: total
    // size, elapsed time, position, speed, finish, errors. They are gathered as tiles, with a
    // progress bar, into the card of the running operation. Unraid updates the figures by the
    // ids of their cells (#line0 ...), so the cells themselves are moved, ids intact.
    const statRows = [...grid.querySelectorAll('table.ArrayOperation-Table > tbody > tr')].filter(function (row) { return row.querySelector('td[id^="line"]'); });
    if (statRows.length) {
      const stats = element('td', 'tp-op-stats');
      const bar = element('div', 'tp-progress');
      const fill = element('span');
      const percent = element('span', 'tp-progress-label');
      bar.append(fill);
      const tiles = element('div', 'tp-stats');
      statRows.forEach(function (row) {
        const value = row.querySelector('td[id^="line"]');
        const tile = element('div', 'tp-stat');
        tile.append(element('span', 'tp-stat-label', row.children[0].textContent.trim().replace(/:$/, '')));
        value.classList.add('tp-stat-value');
        tile.append(value);
        tiles.append(tile);
        row.classList.add('tp-op-skip');
      });
      stats.append(percent, bar, tiles);
      const position = stats.querySelector('#line2');
      const progress = function () {
        const match = position && /([\d.,]+)\s*%/.exec(position.textContent);
        const value = match ? Math.max(0, Math.min(100, parseFloat(match[1].replace(',', '.')))) : null;
        bar.hidden = value === null;
        percent.textContent = value === null ? '' : value.toFixed(1) + ' %';
        if (value !== null) fill.style.width = value + '%';
      };
      if (position) new MutationObserver(progress).observe(position, { childList: true, characterData: true, subtree: true });
      progress();
      const host = grid.querySelector('#pauseButton, #cancelButton');
      if (host) host.closest('tr').append(stats);
      else {
        const row = element('tr');
        row.append(element('td'), element('td'), stats);
        statRows[0].before(row);
      }
    }

    // Mover status (Unraid 7.3.3 and later): up to five rows (file being processed, action,
    // progress, transfers) that Unraid shows and hides while the mover runs. They become tiles
    // in the Mover card that follow their row's hidden state; the cells keep their ids, which
    // Unraid writes to.
    const moverRows = [...grid.querySelectorAll('tr[id^="moverrow"]')];
    const moverButton = grid.querySelector('#mover-button');
    if (moverRows.length && moverButton) {
      const stats = element('td', 'tp-op-stats tp-op-mover-stats');
      const bar = element('div', 'tp-progress');
      const fill = element('span');
      const percent = element('span', 'tp-progress-label');
      bar.append(fill);
      const tiles = element('div', 'tp-stats');
      const syncs = [];
      moverRows.forEach(function (row, index) {
        const label = row.children[1];
        const value = row.children[2];
        if (!label || !value) return;
        const tile = element('div', 'tp-stat' + (index === 0 ? ' tp-stat-wide' : ''));
        label.classList.add('tp-stat-label');
        value.classList.add('tp-stat-value');
        tile.append(label, value);
        tiles.append(tile);
        row.classList.add('tp-op-skip');
        syncs.push(function () { tile.hidden = row.hidden; });
        new MutationObserver(update).observe(row, { attributes: true, attributeFilter: ['hidden'] });
        new MutationObserver(update).observe(value, { childList: true, characterData: true, subtree: true });
      });
      function update() {
        syncs.forEach(function (sync) { sync(); });
        const visible = [...tiles.children].some(function (tile) { return !tile.hidden; });
        stats.hidden = !visible;
        moverButton.closest('tr').classList.toggle('tp-op-busy', visible);
        const progress = grid.querySelector('#moverline2');
        const match = progress && /([\d.,]+)\s*%/.exec(progress.textContent);
        const value = match ? Math.max(0, Math.min(100, parseFloat(match[1].replace(',', '.')))) : null;
        bar.hidden = value === null;
        percent.textContent = value === null ? '' : value.toFixed(1) + ' %';
        if (value !== null) fill.style.width = value + '%';
      }
      stats.append(percent, bar, tiles);
      moverButton.closest('tr').append(stats);
      update();
    }

    const KINDS = [
      ['running', 'Operation in progress', 'tachometer', '#pauseButton, #cancelButton'],
      ['array', 'Array', 'hdd-o', '#stop-button, [name="cmdStart"], #cmdStart, [name="startMode"], [name="cmdStop"]'],
      ['parity', 'Parity check', 'shield', '[name="cmdCheck"], [name^="cmdCheck"], [name="cmdNoCheck"], [name="optionCorrect"]'],
      ['history', 'Last check', 'history', 'input[onclick*="parityHistory"]'],
      ['disks', 'Disks', 'refresh', '#spinup-button, #spindown-button'],
      ['mover', 'Mover', 'exchange', '#mover-button'],
      ['power', 'Power', 'power-off', '[name="reboot"], [name="shutdown"]'],
    ];
    const DANGER = /^(stop|reboot|shutdown|cancel)$/i;
    const PRIMARY = /^(start|check|move|resume)$/i;
    const blank = function (cell) { return !cell.textContent.trim() && !cell.querySelector('input, select, button, img, i'); };

    grid.querySelectorAll('table.ArrayOperation-Table > tbody > tr').forEach(function (row) {
      const cells = [...row.children];
      if (row.classList.contains('tp-op-skip') || row.querySelector('td.line') || cells.every(blank)) {
        row.classList.add('tp-op-skip');
        return;
      }
      let kind = KINDS.find(function (entry) { return row.querySelector(entry[3]); });
      if (!kind && row.id === 'clearstats') kind = ['stats', 'Statistics', 'eraser'];
      if (!kind) {
        const strong = row.querySelector('td:last-child strong, td:last-child b');
        const button = row.querySelector('input[type="button"], input[type="submit"], button');
        kind = row.querySelector('.tp-op-stats') ? ['running', 'Progress', 'tachometer'] : ['other', (strong && strong.textContent.trim()) || (button && button.value) || 'Action', 'cog'];
      }
      kind = kind.slice();
      if (kind[0] === 'running') {
        // "Parity-Check in progress." gives the card its title.
        const first = cells[0] ? cells[0].textContent.trim().replace(/\s+in progress\.?$/i, '') : '';
        if (first) kind[1] = first;
      }
      if (kind[0] === 'history' && /current operation/i.test(row.textContent)) kind[1] = 'History';
      row.classList.add('tp-op', 'tp-op-' + kind[0]);
      const roles = cells.length >= 3 ? ['state', 'actions', 'desc'] : ['actions', 'desc'];
      cells.forEach(function (cell, index) {
        if (cell.classList.contains('tp-op-stats')) return;
        cell.classList.add('tp-op-' + (roles[index] || 'desc'));
        if (blank(cell)) cell.classList.add('tp-op-blank');
      });
      const head = element('td', 'tp-op-head');
      const icon = element('span', 'tp-op-icon');
      icon.append(element('i', 'fa fa-' + kind[2]));
      head.append(icon, element('span', 'tp-op-title', kind[1]));
      row.prepend(head);
      row.querySelectorAll('input[type="button"], input[type="submit"]').forEach(function (button) {
        if (DANGER.test(button.value.trim())) button.classList.add('tp-op-danger');
        else if (PRIMARY.test(button.value.trim())) button.classList.add('tp-op-primary');
      });
      if (kind[0] === 'parity') {
        const state = row.querySelector('td.tp-op-state');
        if (state && state.textContent.trim()) state.classList.add(/invalid|error|disabled/i.test(state.textContent) ? 'tp-op-warn' : 'tp-op-good');
      }
    });
  }

  // Users tab: Unraid's avatar tiles become cards (avatar, name, role, description), grouped
  // as Administrators and Share users, with an overview strip, a search field in the heading
  // row and an "Add user" button. Default avatars become coloured initials. The cards stay
  // Unraid's links to each user's page; "Add user" submits Unraid's own form.
  function usersPage(info) {
    if (info.tab !== 'Users' || info.subPage) return;
    const cards = [...document.querySelectorAll('#displaybox .Panels > .user-list')];
    if (!cards.length || document.querySelector('.tp-users')) return;
    const box = document.getElementById('displaybox');

    // The "Users" title bar repeats the page heading.
    const firstTitle = box.querySelector(':scope > div.title, .content > div.title');
    if (firstTitle && /^users$/i.test(firstTitle.textContent.trim()) && box.querySelector('.tp-heading')) firstTitle.classList.add('tp-hidden-title');

    const form = [...box.querySelectorAll('form')].find(function (candidate) { return /UserAdd/.test(candidate.getAttribute('action') || ''); });
    const addSubmit = form && form.querySelector('input[type="submit"]');
    const addUser = function () {
      if (!form) return;
      if (form.requestSubmit) form.requestSubmit(addSubmit || undefined);
      else form.submit();
    };
    if (form) form.classList.add('tp-users-form');

    const palette = [['#4f8bff', '#22d3ee'], ['#a78bfa', '#f472b6'], ['#34d399', '#22d3ee'], ['#fb923c', '#f43f5e'], ['#f59e0b', '#84cc16'], ['#38bdf8', '#818cf8']];
    const hash = function (text) { let value = 0; for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0; return value; };
    const people = [];

    box.querySelectorAll('.Panels').forEach(function (group) {
      const items = [...group.children].filter(function (child) { return child.matches('.user-list'); });
      if (!items.length) return;
      const title = group.previousElementSibling && group.previousElementSibling.matches('div.title') ? group.previousElementSibling : null;
      const admin = title && /management/i.test(title.textContent);
      group.classList.add('tp-users');
      if (title) {
        title.classList.add('tp-users-title');
        const left = title.querySelector('.left') || title;
        const label = admin ? 'Administrators' : 'Share users';
        const icon = left.querySelector('i');
        left.replaceChildren();
        if (icon) left.append(icon);
        left.append(document.createTextNode(label), element('span', 'tp-users-count', String(items.length)));
        title.title = admin ? 'Can log in to the console and this web interface' : 'Can reach the shares they are given access to';
      }
      items.forEach(function (item) {
        const link = item.querySelector('a');
        if (!link) return;
        const picture = link.querySelector('img');
        const detail = link.querySelector('span');
        const description = detail ? detail.textContent.trim() : '';
        const name = [...link.childNodes].filter(function (node) { return node.nodeType === Node.TEXT_NODE; }).map(function (node) { return node.textContent; }).join(' ').trim();
        const avatar = element('span', 'tp-user-avatar');
        if (picture && !/\/user\.png(\?|$)/.test(picture.getAttribute('src') || '')) {
          picture.removeAttribute('width');
          picture.removeAttribute('height');
          avatar.append(picture);
        } else {
          const colours = palette[hash(name) % palette.length];
          avatar.classList.add('tp-user-initials');
          avatar.style.background = 'linear-gradient(135deg, ' + colours[0] + ', ' + colours[1] + ')';
          avatar.textContent = (name.match(/[A-Za-z0-9]/g) || ['?']).slice(0, 2).join('').toUpperCase();
        }
        const text = element('span', 'tp-user-text');
        const top = element('span', 'tp-user-top');
        top.append(element('strong', 'tp-user-name', name), element('span', 'tp-user-role' + (admin ? ' tp-admin' : ''), admin ? 'Administrator' : 'Share access'));
        text.append(top, element('span', 'tp-user-desc', description || (admin ? 'Console and web interface login' : 'No description')));
        if (!description) text.lastChild.classList.add('tp-user-desc-empty');
        const go = element('span', 'tp-user-go');
        go.append(element('i', 'fa fa-chevron-right'));
        link.className = 'tp-user-card';
        link.title = 'Edit ' + name;
        link.replaceChildren(avatar, text, go);
        item.classList.add('tp-user');
        people.push({ item: item, text: (name + ' ' + description).toLowerCase(), admin: admin });
      });
      if (!admin && form) {
        const add = element('button', 'tp-user-add');
        add.type = 'button';
        add.append(element('span', 'tp-user-add-icon', '+'), element('span', '', 'Add user'));
        add.addEventListener('click', addUser);
        group.append(add);
      }
    });

    const heading = box.querySelector('.tp-heading');
    const strip = summaryStrip('tp-users-summary', 'Users overview', [
      { label: 'Accounts', value: people.length, detail: 'in total' },
      { label: 'Administrators', value: people.filter(function (person) { return person.admin; }).length, detail: 'web interface' },
      { label: 'Share users', value: people.filter(function (person) { return !person.admin; }).length, detail: 'share access', tone: 'good' },
    ]);
    if (heading) heading.after(strip);

    if (heading) {
      const tools = element('div', 'tp-users-tools');
      const search = element('input', 'tp-panel-search-input tp-users-search');
      search.type = 'search';
      search.placeholder = 'Search users…';
      search.setAttribute('aria-label', 'Search users');
      const wrap = element('div', 'tp-panel-search');
      wrap.append(search);
      tools.append(wrap);
      if (form) {
        const add = element('button', 'tp-users-add');
        add.type = 'button';
        add.append(element('i', 'fa fa-user-plus'), document.createTextNode(' Add user'));
        add.addEventListener('click', addUser);
        tools.append(add);
      }
      heading.append(tools);
      search.addEventListener('input', function () {
        const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        people.forEach(function (person) {
          person.item.classList.toggle('tp-filtered-out', !words.every(function (word) { return person.text.includes(word); }));
        });
      });
    }
  }

  function start() {
    const info = pageInfo();
    [function () { topBar(info); }, themeSwitch, function () { serverCard(info); }, function () { pageHeading(info); }, function () { panelFavourites(info); }, function () { panelSearch(info); }, function () { usersPage(info); }, selectLists, docker, dockerPorts, vmDetails, mainTables, arrayOperations, dashboardSummary, dashboardCharts, dashboardCpu, dashboardCores, dashboardContainers, dashboardMemory, dashboardFans, externalLinkDialog, caOverlay, function () { toolText(info); }].forEach(function (enhancer) {
      // One failing enhancer must not stop the others or the page's own scripts.
      try { enhancer(); } catch (error) { console.error('Aurora Theme:', error); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
