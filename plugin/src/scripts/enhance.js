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

  function iconButton(icon, label, onClick, extraClass) {
    const button = element('button', 'tp-icon-button' + (extraClass ? ' ' + extraClass : ''));
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(element('i', 'fa fa-' + icon));
    button.addEventListener('click', onClick);
    return button;
  }

  // FolderView (folder.view, .view2, .view3) arranges the Docker list and the Dashboard's Docker
  // tile, unless the switch above the Docker list is set to the theme's view (AuroraTheme.page
  // then keeps FolderView out of the list).
  function folderViewActive() {
    const view = window.auroraDockerView;
    if (folderViewPlus()) return true;
    if (view && view.mode === 'aurora') return false;
    return Boolean(document.querySelector('script[src*="/folder.view"]'));
  }

  // FolderView Plus (folderview.plus) owns its lists outright: the theme leaves its folders, rows
  // and chips alone (no view switch, no clicks taken over, nothing moved or rewritten) and keeps
  // to colours and layout. AuroraTheme.page tells when it is installed; its scripts tell too.
  function folderViewPlus() {
    const view = window.auroraDockerView;
    return Boolean((view && view.plus) || document.querySelector('script[src*="/plugins/folderview.plus/"]'));
  }

  // A group's apps (containers or VMs) as small icons: running and paused ones first with a
  // status dot (green, amber), then the stopped ones greyed out, each part in the list's order.
  // The first `max` of them are shown and "+n" for the rest; each icon's tooltip is the app's
  // name. An app with a target (the element whose click opens its menu) opens that menu when
  // its icon is clicked. The strip is only rebuilt when the apps or their states change.
  //   apps: [{ name, src, state: 'running' | 'paused' | 'stopped', update, target }]
  const STRIP_ORDER = { running: 0, paused: 1, stopped: 2 };
  function appStrip(strip, list, max) {
    // Apps with an update first, so the limit never hides their dot; then running, paused, stopped.
    const apps = list.slice().sort(function (a, b) { return (b.update ? 1 : 0) - (a.update ? 1 : 0) || STRIP_ORDER[a.state] - STRIP_ORDER[b.state]; });
    // The targets are replaced on every call: Unraid rebuilds its rows and chips on refresh.
    strip.tpTargets = new Map(apps.map(function (app) { return [app.name, app.target]; }));
    if (!strip.tpBound) {
      strip.tpBound = true;
      strip.addEventListener('click', openFromStrip);
      strip.addEventListener('keydown', openFromStrip);
    }
    const signature = apps.map(function (app) { return app.name + ':' + app.state + (app.update ? ':u' : '') + (app.target ? '' : ':-'); }).join('|');
    if (strip.dataset.apps === signature) return;
    strip.dataset.apps = signature;
    const shown = apps.slice(0, max).map(function (app) {
      const item = element('span', 'tp-app-icon tp-app-' + app.state + (app.update ? ' tp-app-update' : ''));
      item.dataset.name = app.name;
      item.title = app.name + (app.state === 'running' ? '' : ' (' + app.state + ')') + (app.update ? ', update available' : '');
      if (app.target) {
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
      }
      const image = element('img');
      image.src = app.src || '/plugins/dynamix.docker.manager/images/question.png';
      image.alt = '';
      image.loading = 'lazy';
      item.append(image);
      return item;
    });
    if (apps.length > max) shown.push(element('span', 'tp-app-more', '+' + (apps.length - max)));
    strip.replaceChildren(...shown);
    strip.hidden = !apps.length;
  }

  // A click (or Enter) on an icon of a strip: the click is passed on to the app's own element,
  // at the icon's position, so its menu opens there, and it goes no further (the strip sits
  // inside a group's header or chip, which would open or close the group).
  function openFromStrip(event) {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    const icon = event.target.closest('.tp-app-icon');
    const target = icon && event.currentTarget.tpTargets && event.currentTarget.tpTargets.get(icon.dataset.name);
    if (!target || !target.isConnected) return;
    event.preventDefault();
    event.stopPropagation();
    const box = icon.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window,
      clientX: event.clientX || box.left, clientY: event.clientY || box.bottom,
    }));
  }

  // ---- Application groups: named sets of containers (type 'docker') or VMs (type 'vm'),
  // shown as collapsible sections on the Docker and VMs tabs and on the Dashboard. Stored on the
  // server (include/docker-groups.php) so every browser sees the same groups, in the order they
  // are arranged in; members are kept by name, in "containers" for both kinds.
  function validGroups(list) {
    return Array.isArray(list) ? list.filter(function (group) { return group && typeof group.name === 'string' && Array.isArray(group.containers); }) : [];
  }

  // Which sections are collapsed, remembered per browser (shared by the tab and the Dashboard).
  function collapsedState(storageKey) {
    const read = function () {
      try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch (error) { return []; }
    };
    return {
      has: function (key) { return read().includes(key); },
      toggle: function (key) {
        const keys = read();
        const next = keys.includes(key) ? keys.filter(function (entry) { return entry !== key; }) : keys.concat(key);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch (error) { /* storage blocked */ }
      },
    };
  }

  // changed() redraws after the groups changed; saved(), if given, runs after a change was
  // drawn (the tabs save Unraid's order there, see saveUnraidOrder).
  function groupStore(type, changed, saved) {
    const url = PLUGIN_BASE + '/include/docker-groups.php' + (type === 'vm' ? '?type=vm' : '');
    const noun = type === 'vm' ? 'VMs' : 'containers';
    let menu = null;
    const closeMenu = function () {
      if (menu) menu.remove();
      menu = null;
    };
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeMenu(); });

    const store = {
      groups: [],
      load: function () {
        // Normally the page already carries the groups (AuroraTheme.page); otherwise they are fetched.
        const preset = type === 'vm' ? window.auroraVmGroups : window.auroraDockerGroups;
        if (Array.isArray(preset)) {
          store.groups = validGroups(preset);
          changed();
          return;
        }
        if (!PLUGIN_BASE) return;
        fetch(url, { credentials: 'same-origin' })
          .then(function (response) { return response.json(); })
          .then(function (data) {
            store.groups = validGroups(data.groups);
            changed();
          })
          .catch(function (error) { console.error('Aurora Theme groups:', error); });
      },
      save: function () {
        changed();
        if (saved) saved();
        if (!PLUGIN_BASE) return;
        const body = new URLSearchParams({ groups: JSON.stringify(store.groups), csrf_token: window.csrf_token || '' });
        fetch(url, { method: 'POST', credentials: 'same-origin', body: body })
          .then(function (response) {
            if (!response.ok) throw new Error('saving groups failed with status ' + response.status);
          })
          .catch(function (error) {
            console.error('Aurora Theme groups:', error);
            modal({ title: 'Group change not saved', message: 'The server did not accept the change. It will be lost when the page reloads.', confirmLabel: 'OK', hideCancel: true });
          });
      },
      of: function (name) {
        return store.groups.find(function (group) { return group.containers.includes(name); }) || null;
      },
      // Asks for a name; resolves with the new group, an existing group of that name, or null.
      create: function () {
        return modal({
          title: 'New group',
          message: 'Give the group a name. ' + (type === 'vm' ? 'VMs' : 'Containers') + ' are added to it from their folder button, or by dragging them into it while the list is unlocked.',
          input: { placeholder: 'Group name', maxLength: 60 },
          confirmLabel: 'Create group',
        }).then(function (name) {
          if (!name) return null;
          const existing = store.groups.find(function (group) { return group.name.toLowerCase() === name.toLowerCase(); });
          if (existing) return existing;
          const group = { name: name, containers: [] };
          store.groups.push(group);
          return group;
        });
      },
      assign: function (name, group) {
        store.groups.forEach(function (other) {
          other.containers = other.containers.filter(function (entry) { return entry !== name; });
        });
        if (group) group.containers.push(name);
        store.save();
      },
      // One place up (-1) or down (1) in the order of the groups.
      move: function (group, step) {
        const from = store.groups.indexOf(group);
        const to = from + step;
        if (from < 0 || to < 0 || to >= store.groups.length) return;
        store.groups.splice(to, 0, store.groups.splice(from, 1)[0]);
        store.save();
      },
      rename: function (group) {
        modal({
          title: 'Rename group',
          input: { value: group.name, placeholder: 'Group name', maxLength: 60 },
          validate: function (name) {
            const taken = store.groups.some(function (other) { return other !== group && other.name.toLowerCase() === name.toLowerCase(); });
            return taken ? 'A group with that name already exists.' : '';
          },
          confirmLabel: 'Rename',
        }).then(function (name) {
          if (!name || name === group.name) return;
          group.name = name;
          store.save();
        });
      },
      remove: function (group) {
        modal({
          title: 'Delete "' + group.name + '"?',
          message: 'Only the group is removed. Its ' + noun + ' are kept and become ungrouped.',
          confirmLabel: 'Delete group',
          danger: true,
        }).then(function (confirmed) {
          if (!confirmed) return;
          store.groups = store.groups.filter(function (other) { return other !== group; });
          store.save();
        });
      },
      // Small menu next to a folder button: pick a group, make a new one, or leave the group.
      openMenu: function (anchor, name) {
        closeMenu();
        const current = store.of(name);
        const list = element('ul', 'dropdown-menu tp-group-menu');
        const entry = function (icon, text, onClick) {
          const item = element('li');
          const link = element('a');
          link.href = '#';
          link.append(element('i', 'fa fa-fw ' + icon), ' ' + text);
          link.addEventListener('click', function (event) {
            event.preventDefault();
            closeMenu();
            onClick();
          });
          item.append(link);
          list.append(item);
        };
        store.groups.forEach(function (group) {
          entry(group === current ? 'fa-check' : 'fa-folder-o', group.name, function () { store.assign(name, group); });
        });
        if (store.groups.length) list.append(element('li', 'divider'));
        entry('fa-plus', 'New group…', function () {
          store.create().then(function (group) { if (group) store.assign(name, group); });
        });
        if (current) entry('fa-times', 'Remove from group', function () { store.assign(name, null); });
        document.body.append(list);
        const box = anchor.getBoundingClientRect();
        list.style.cssText = 'display:block;position:fixed;z-index:10001;margin:0';
        list.style.top = Math.min(box.bottom + 6, window.innerHeight - list.offsetHeight - 8) + 'px';
        list.style.left = Math.max(8, Math.min(box.right - list.offsetWidth, window.innerWidth - list.offsetWidth - 8)) + 'px';
        menu = list;
      },
    };
    return store;
  }

  // A section's header row on the Docker or VMs tab: open / close with the name and count, the
  // members' icons, and buttons to start or stop the whole section, move the group up or down,
  // rename or delete it (the last four not for "Ungrouped"). The row's tpItems are the section's
  // members ({ name, running, paused }), set by the tab on every refresh.
  //   options: { noun ('container' / 'VM'), onToggle(), start(stopped items), stop(running items), load,
  //              removeAll(items): a "Remove all" button instead of start and stop (Docker's orphan images) }
  function sectionHeader(store, group, options) {
    const row = element('tr', 'tp-group');
    const cell = element('td');
    cell.colSpan = 20;
    const head = element('div', 'tp-group-head');
    const toggle = element('button', 'tp-group-toggle');
    toggle.type = 'button';
    toggle.append(element('i', 'fa fa-chevron-down'), element('span', 'tp-group-name'), element('span', 'tp-group-count'));
    toggle.addEventListener('click', options.onToggle);
    if (group) {
      row.tpGroup = group;
      const grip = element('span', 'tp-group-grip');
      grip.title = 'Drag to move the group';
      grip.setAttribute('aria-hidden', 'true');
      grip.append(element('i', 'fa fa-arrows-v'));
      dragGroup(row, grip, store);
      head.append(grip);
    }
    head.append(toggle, element('span', 'tp-group-apps'));
    if (options.load) {
      const load = element('span', 'tp-group-load');
      load.append(element('span', 'tp-group-cpu'), element('span', 'tp-group-mem'));
      head.append(load);
    }
    const actions = element('div', 'tp-actions');
    const members = function () { return row.tpItems || []; };
    const plural = options.noun + 's';
    if (options.removeAll) {
      const remove = element('button', 'tp-group-remove-all');
      remove.type = 'button';
      remove.title = 'Remove all ' + plural + ' in this section';
      remove.append(element('i', 'fa fa-trash'), element('span', '', 'Remove all'));
      remove.addEventListener('click', function () { if (members().length) options.removeAll(members()); });
      actions.append(remove);
    } else {
      actions.append(iconButton('play', 'Start all stopped ' + plural + ' in this section', function () {
        options.start(members().filter(function (item) { return !item.running && !item.paused; }));
      }));
      actions.append(iconButton('stop', 'Stop all running ' + plural + ' in this section', function () {
        const running = members().filter(function (item) { return item.running; });
        if (!running.length) return;
        modal({
          title: 'Stop ' + running.length + ' ' + (running.length === 1 ? options.noun : plural) + '?',
          message: 'All running ' + plural + ' in this section will be stopped: ' + running.map(function (item) { return item.name; }).join(', ') + '.',
          confirmLabel: 'Stop',
          danger: true,
        }).then(function (confirmed) {
          if (confirmed) options.stop(running);
        });
      }, 'tp-danger'));
    }
    if (group) {
      row.tpUp = iconButton('arrow-up', 'Move group up', function () { store.move(group, -1); }, 'tp-group-move');
      row.tpDown = iconButton('arrow-down', 'Move group down', function () { store.move(group, 1); }, 'tp-group-move');
      actions.append(row.tpUp, row.tpDown);
      actions.append(iconButton('pencil', 'Rename group', function () { store.rename(group); }));
      actions.append(iconButton('trash-o', 'Delete group (its ' + plural + ' stay)', function () { store.remove(group); }, 'tp-danger'));
    }
    head.append(actions);
    cell.append(head);
    row.append(cell);
    return row;
  }

  // Unraid's lock button (in the menu) turns rearranging the Docker and VM lists on and off and
  // remembers "unlocked" in its lockbutton cookie. The groups' move controls (grip, up, down)
  // follow it: html.tp-unlocked is set while the lists can be rearranged (enhance.css shows the
  // controls only then).
  function listsUnlocked() {
    return /(?:^|;\s*)lockbutton=/.test(document.cookie);
  }

  function lockState() {
    const sync = function () { document.documentElement.classList.toggle('tp-unlocked', listsUnlocked()); };
    sync();
    // The Docker and VMs pages clear the cookie when they start (every visit begins locked), in
    // a jQuery ready handler that may run after this one.
    if (window.jQuery) window.jQuery(function () { setTimeout(sync); });
    if (typeof window.LockButton === 'function' && !window.LockButton.tpWrapped) {
      const original = window.LockButton;
      window.LockButton = function () {
        const result = original.apply(this, arguments);
        sync();
        return result;
      };
      window.LockButton.tpWrapped = true;
    }
  }

  // Moves a group by dragging its header's grip (mouse, pen or touch) above or below another
  // group; its members move with it. A line shows where it will go. "Ungrouped" stays last.
  function dragGroup(row, grip, store) {
    grip.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || !listsUnlocked()) return;
      const list = row.parentElement;
      const others = list ? [...list.querySelectorAll(':scope > tr.tp-group')].filter(function (header) { return header.tpGroup && header !== row; }) : [];
      if (!others.length) return;
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      row.classList.add('tp-group-dragging');
      const line = element('div', 'tp-group-drop-line');
      document.body.append(line);
      let place = -1;
      // place: how many of the other groups come before the dragged one.
      const update = function (y) {
        place = others.filter(function (header) {
          const box = header.getBoundingClientRect();
          return box.top + box.height / 2 < y;
        }).length;
        // The line goes above the group that will follow, or under the last group's section.
        const next = others[place];
        let lineY;
        if (next) {
          lineY = next.getBoundingClientRect().top;
        } else {
          let end = others[others.length - 1];
          for (let sibling = end.nextElementSibling; sibling && !(sibling.classList.contains('tp-group') && sibling !== row); sibling = sibling.nextElementSibling) {
            if (sibling.offsetParent && sibling !== row) end = sibling;
          }
          lineY = end.getBoundingClientRect().bottom;
        }
        const box = list.getBoundingClientRect();
        line.style.cssText = 'top:' + (lineY - 1) + 'px;left:' + box.left + 'px;width:' + box.width + 'px';
      };
      const onMove = function (moveEvent) {
        if (moveEvent.clientY < 60) window.scrollBy(0, -12);
        else if (moveEvent.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
        update(moveEvent.clientY);
      };
      const finish = function (endEvent) {
        grip.removeEventListener('pointermove', onMove);
        grip.removeEventListener('pointerup', finish);
        grip.removeEventListener('pointercancel', finish);
        row.classList.remove('tp-group-dragging');
        line.remove();
        if (endEvent.type !== 'pointerup' || place < 0) return;
        const group = row.tpGroup;
        const order = others.map(function (header) { return header.tpGroup; });
        order.splice(place, 0, group);
        const current = store.groups.filter(function (entry) { return order.includes(entry); });
        if (order.every(function (entry, index) { return entry === current[index]; })) return;
        store.groups = order.concat(store.groups.filter(function (entry) { return !order.includes(entry); }));
        store.save();
      };
      grip.addEventListener('pointermove', onMove);
      grip.addEventListener('pointerup', finish);
      grip.addEventListener('pointercancel', finish);
      update(event.clientY);
    });
  }

  // Fills in a section header: name, count, icons, open or closed, and which move buttons work.
  function updateSectionHeader(header, section, options) {
    const running = section.items.filter(function (item) { return item.running; }).length;
    const setText = function (node, text) { if (node.textContent !== text) node.textContent = text; };
    setText(header.querySelector('.tp-group-name'), section.title);
    const toggle = header.querySelector('.tp-group-toggle');
    if (toggle.title !== section.title) toggle.title = section.title;
    setText(header.querySelector('.tp-group-count'), section.items.length + ' ' + (section.items.length === 1 ? options.noun : options.noun + 's') + (options.noRunning ? '' : ' · ' + running + ' running'));
    appStrip(header.querySelector('.tp-group-apps'), section.items.map(options.app), 8);
    header.classList.toggle('tp-collapsed', section.collapsed);
    header.querySelector('.tp-group-toggle').setAttribute('aria-expanded', String(!section.collapsed));
    if (header.tpUp) {
      header.tpUp.disabled = section.index === 0;
      header.tpDown.disabled = section.index === options.groupCount - 1;
    }
  }

  // Unraid's own order of the Docker or VM list: the one its lock button lets you drag, which is
  // also the order the containers start in and the Dashboard shows. Saved from the list as it now
  // stands (sections and all), the way Unraid's drag and drop saves it.
  function saveUnraidOrder(type, list) {
    const jq = window.jQuery;
    if (!jq || !list) return;
    const names = [...list.querySelectorAll(type === 'vm' ? ':scope > tr[parent-id] > td.vm-name .inner > a' : 'td.ct-name:not(.folder-name) .appname')]
      .map(function (node) { return node.textContent.trim(); })
      .filter(Boolean);
    if (!names.length) return;
    jq.post('/plugins/dynamix.' + (type === 'vm' ? 'vm' : 'docker') + '.manager/include/UserPrefs.php', {
      names: names.join(';') + ';',
      index: names.map(function (name, index) { return index; }).join(';') + ';',
    });
  }

  // Unraid's drag and drop keeps a dragged row within the list's rows. A row taller than the
  // first one (a FolderView folder) then never gets far enough up to go before it, so the
  // dragged row may also move over the table's header. Applied whenever Unraid's lock button
  // turns dragging on (and at once if it already is).
  function roomToDragToTop(list) {
    const jq = window.jQuery;
    const table = list.closest('table');
    if (!jq || !table) return;
    const widen = function () {
      if (jq(list).data('ui-sortable')) jq(list).sortable('option', 'containment', table);
    };
    jq(list).on('sortcreate', widen);
    widen();
  }

  // Unraid's drag and drop (unlocked with the lock button in the menu) moves a row and saves the
  // order itself. Dropped in another group's section, the container or VM joins that group (or
  // leaves its group in "Ungrouped"); the section is read right at the drop, before the list is
  // laid out again. While a row is dragged, list.tpSorting is set and the tab leaves the list
  // alone (its placeholder row would be moved away); redraw() runs once the row is dropped.
  function dropIntoSections(list, store, nameOfRow, ungroupedKey, redraw) {
    const jq = window.jQuery;
    if (!jq) return;
    jq(list).on('sortstart', function () { list.tpSorting = true; });
    jq(list).on('sortstop', function () {
      list.tpSorting = false;
      setTimeout(redraw);
    });
    jq(list).on('sortupdate', function (event, ui) {
      const row = ui && ui.item && ui.item[0];
      if (!row || !store.groups.length) return;
      let header = row.previousElementSibling;
      while (header && !header.classList.contains('tp-group')) header = header.previousElementSibling;
      header = header || list.querySelector(':scope > tr.tp-group');
      if (!header || !header.tpKey) return;
      const name = nameOfRow(row);
      const target = header.tpKey === ungroupedKey ? null : store.groups.find(function (group) { return 'g:' + group.name === header.tpKey; }) || null;
      if (name && target !== store.of(name)) store.assign(name, target);
    });
  }


  // Opens Unraid's menu for a container or VM (the click on its icon) from a button at the end of
  // its row. Unraid opens the menu at the click's position and does not keep it on screen, so the
  // click is placed left of the button: the menu then ends at the button instead of past the edge.
  function openMenuFrom(trigger, button) {
    const box = button.getBoundingClientRect();
    trigger.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window,
      clientX: Math.max(8, box.right - 260), clientY: box.bottom,
    }));
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
  //   modal({ title, message, input: { value, placeholder, maxLength }, validate, confirmLabel, cancelLabel, danger, hideCancel })
  // message may be a list of paragraphs.
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
      (Array.isArray(options.message) ? options.message : [options.message]).forEach(function (text) {
        if (text) box.append(element('p', 'tp-modal-message', text));
      });

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
      const cancel = element('button', 'tp-modal-button', options.cancelLabel || 'Cancel');
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
    // The page's own title from Unraid (AuroraTheme.page) comes first: the address split into
    // words read "CP Uset" for CPU Pinning and "UP Ssettings" for UPS Settings.
    const pageTitle = subPage && typeof window.auroraPageTitle === 'string' ? window.auroraPageTitle : '';
    return {
      server: titleParts.length > 1 ? titleParts[0] : '',
      tab: tab || (titleParts[1] || ''),
      // "DisplaySettings" reads better as "Display Settings".
      // ... and "VMTemplates" as "VM Templates".
      subPage: pageTitle || (sectionName && sectionName.length <= 40 ? sectionName : subPage.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[._]/g, ' ')),
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
  //   1. dynamix.cfg, through include/theme.php, which changes only the theme key;
  //   2. the Unraid API's own copy (customization.setTheme), when the API is running, because
  //      the API can otherwise write its older value back.
  // The API rewrites dynamix.cfg itself a moment later, so theme.php is asked once more to check
  // that nothing went missing in between and to put back anything that did (issue #22).
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

    // step "save" changes the theme; step "verify" puts back keys lost since "save".
    function saveConfig(theme, step) {
      const body = new URLSearchParams({ theme: theme, step: step, csrf_token: window.csrf_token || '' });
      return fetch(PLUGIN_BASE + '/include/theme.php', { method: 'POST', credentials: 'same-origin', body: body })
        .then(function (response) {
          return response.json().catch(function () { return { error: 'unexpected answer from the server, status ' + response.status }; });
        })
        .then(function (data) {
          if (data.error) throw new Error(data.error);
          if (data.restored) console.warn('Aurora Theme: put back ' + data.restored + ' dynamix.cfg settings lost while the theme changed');
        });
    }

    // The Unraid API keeps a copy of the theme; it is told too when it is reachable.
    function saveApi(theme) {
      if (!window.apolloClient || !window.gql) return Promise.resolve(false);
      const mutation = window.gql('mutation setTheme($theme: ThemeName!) { customization { setTheme(theme: $theme) { name } } }');
      const call = window.apolloClient.mutate({ mutation: mutation, variables: { theme: theme } }).then(function () { return true; }, function (error) {
        console.warn('Aurora Theme: the Unraid API did not take the theme', error);
        return true;
      });
      return Promise.race([call, new Promise(function (resolve) { setTimeout(function () { resolve(true); }, 4000); })]);
    }

    // Gives the API time to write its copy of dynamix.cfg before it is checked.
    function settle(apiCalled) {
      return new Promise(function (resolve) { setTimeout(resolve, apiCalled ? 1500 : 0); });
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
      saveConfig(next, 'save')
        .then(function () { return saveApi(next); })
        .then(settle)
        .then(function () {
          // The theme is saved by now: a failed check gets its own message, then the page
          // reloads with the new theme all the same.
          return saveConfig(next, 'verify').catch(function (error) {
            console.error('Aurora Theme:', error);
            return modal({ title: 'Theme changed, settings not confirmed', message: ['The theme was changed, but Aurora could not confirm that your other settings in dynamix.cfg are intact (' + error.message + ').', 'Please check Settings > Display Settings and your notification and parity settings.'], confirmLabel: 'OK', hideCancel: true });
          });
        })
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

  // Sidebar: which server this browser is connected to. Only its name; the address is in the
  // browser's own address bar (and the card's tooltip).
  function serverCard(info) {
    const menu = document.getElementById('menu');
    if (!menu || !info.server || menu.querySelector('.tp-server')) return;
    const block = element('div', 'tp-server');
    const card = element('div', 'tp-server-card');
    card.title = location.host;
    card.append(element('b', '', info.server));
    block.append(element('span', 'tp-server-label', 'Connected server'), card);
    menu.prepend(block);
  }

  function pageHeading(info) {
    const box = document.getElementById('displaybox');
    if (!box || !info.tab || box.querySelector('.tp-heading')) return;
    const known = TABS[info.tab];
    const heading = element('div', 'tp-heading');
    // The Apps tab's search bar sits above the heading on phones (theme.css adds the space).
    if (document.querySelector('.searchAreaHolder')) heading.classList.add('tp-heading-below-search');
    const text = element('div', 'tp-heading-text');
    const eyebrow = info.subPage ? info.tab : known && known[0];
    if (eyebrow) text.append(element('p', 'tp-eyebrow', eyebrow));
    text.append(element('h1', '', info.subPage || info.tab));
    if (known && !info.subPage) text.append(element('p', 'tp-subtitle', known[1]));
    heading.append(text);
    box.prepend(heading);
  }

  // Docker and VMs tabs with a folder plugin (FolderView3, FolderView Plus): a "beta" chip in the
  // top bar (next to the page heading where the top bar has no breadcrumb: top layout, narrow
  // windows). A click explains that their support is not finished yet.
  // With FolderView Plus and FolderView3 (or FolderView2) installed together, a warning instead,
  // also on the Dashboard and the Plugins page: Plus does not support it (it pauses its folders,
  // "safe mode", and asks to remove the other plugin), and Aurora then follows FolderView3.
  function folderViewBeta(info) {
    const view = window.auroraDockerView || (window.auroraFolderViewConflict ? { folderView: true, both: true, name: window.auroraFolderViewConflict } : null);
    if (!(view && view.folderView) || info.subPage) return;
    const both = Boolean(view.both);
    if (!(both ? ['Docker', 'VMs', 'Dashboard', 'Plugins'] : ['Docker', 'VMs']).includes(info.tab)) return;
    const name = view.name || 'FolderView';
    const chip = function () {
      const button = element('button', 'tp-fv-beta' + (both ? ' tp-fv-conflict' : ''));
      button.type = 'button';
      // The plugin's name with "support" (left out in a narrow top bar) and a small tag.
      const text = element('span', 'tp-fv-beta-text', both ? name + ' + Plus' : name);
      if (!both) text.append(element('span', 'tp-fv-beta-word', ' support'));
      if (both) {
        button.title = name + ' and FolderView Plus are both installed. This is not supported. Click for details.';
        button.append(element('i', 'fa fa-exclamation-triangle'), text, element('span', 'tp-fv-beta-tag', 'Not supported'));
      } else {
        button.title = name + ' support is in beta and still has compatibility issues. Click for details.';
        button.append(element('i', 'fa fa-info-circle'), text, element('span', 'tp-fv-beta-tag', 'Beta'));
      }
      button.addEventListener('click', function () {
        if (both) {
          modal({
            title: name + ' and FolderView Plus are both installed',
            message: [
              'Running both folder plugins at the same time is not supported. FolderView Plus says so itself: while ' + name + ' is installed it pauses its own folders ("safe mode") and asks to remove the other plugin.',
              'Aurora then follows ' + name + '. Keep the one you want to use and remove the other under Plugins.',
            ],
            confirmLabel: 'Open Plugins',
            cancelLabel: 'Close',
          }).then(function (open) {
            if (open) location.href = '/Plugins';
          });
          return;
        }
        modal({
          title: name + ' support is in beta',
          message: [
            'Aurora works with FolderView3 and FolderView Plus, but their support is still in beta: some pages and settings can still show compatibility issues.',
            'I am working on full support. If something looks wrong, please report it on GitHub (Settings > User Utilities > Aurora Theme has a form for it).',
          ],
          confirmLabel: 'OK',
          hideCancel: true,
        });
      });
      return button;
    };
    const crumb = document.querySelector('#header .tp-crumb');
    if (crumb && !crumb.querySelector('.tp-fv-beta')) crumb.append(chip());
    const heading = document.querySelector('#displaybox .tp-heading-text');
    if (heading && !heading.querySelector('.tp-fv-beta')) heading.append(chip());
  }

  function summaryStrip(id, label, items) {
    let strip = document.getElementById(id);
    if (!strip) {
      strip = element('section', 'tp-summary');
      strip.id = id;
      strip.setAttribute('aria-label', label);
    }
    // Only redrawn when a value changed: the callers run on every change of the lists and
    // tiles, and other scripts watching the page (FolderView Plus) react to each redraw.
    const signature = JSON.stringify(items);
    if (strip.tpSignature === signature) return strip;
    strip.tpSignature = signature;
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
  // With FolderView installed: a switch between Aurora's view (columns, groups, filters) and
  // FolderView's folders, for the Docker and VMs tabs alike. Stored on the server for every
  // browser (include/docker-view.php); the page reloads to apply it. Null without FolderView.
  function folderViewSwitch() {
    if (!(window.auroraDockerView && window.auroraDockerView.folderView && PLUGIN_BASE) || folderViewPlus()) return null;
    const viewSwitch = element('div', 'tp-segment tp-view-switch');
    viewSwitch.setAttribute('role', 'group');
    viewSwitch.setAttribute('aria-label', 'List view');
    [['aurora', 'Aurora'], ['folderview', 'FolderView3']].forEach(function (option) {
      const button = element('button', 'tp-tab', option[1]);
      button.type = 'button';
      const active = (window.auroraDockerView.mode === 'aurora') === (option[0] === 'aurora');
      button.setAttribute('aria-selected', String(active));
      button.title = option[0] === 'aurora' ? 'Aurora\'s list: columns, groups, filters and search' : 'The FolderView3 plugin\'s folders';
      const save = function () {
        button.disabled = true;
        const body = new URLSearchParams({ view: option[0], csrf_token: window.csrf_token || '' });
        fetch(PLUGIN_BASE + '/include/docker-view.php', { method: 'POST', credentials: 'same-origin', body: body })
          .then(function (response) {
            if (!response.ok) throw new Error('saving the view failed with status ' + response.status);
            location.reload();
          })
          .catch(function (error) {
            console.error('Aurora Theme view:', error);
            button.disabled = false;
            modal({ title: 'View not changed', message: 'The server did not accept the change.', confirmLabel: 'OK', hideCancel: true });
          });
      };
      button.addEventListener('click', function () {
        if (active) return;
        if (option[0] !== 'folderview') {
          save();
          return;
        }
        // FolderView's folders are fitted to the theme, but not all of the plugin is.
        modal({
          title: 'Switch to FolderView3?',
          message: [
            'Your containers and VMs will be shown in FolderView3\'s folders, fitted to the Aurora look, and a folder opens with a single click.',
            'Aurora doesn\'t support every feature of the FolderView3 plugin yet. Some of its options and layouts may look a little different here, or not appear at all.',
            'You can switch back to Aurora\'s view at any time with the same switch.',
          ],
          cancelLabel: 'Stay with Aurora',
          confirmLabel: 'Switch to FolderView3',
        }).then(function (confirmed) {
          if (confirmed) save();
        });
      });
      viewSwitch.append(button);
    });
    return viewSwitch;
  }

  // VMs tab: the same switch, beside the page's title: the "Virtual Machines" tab, or the
  // title above the list when the page has no tabs (Display Settings).
  function vmViewSwitch() {
    const table = document.getElementById('kvm_table');
    const viewSwitch = table && folderViewSwitch();
    if (!viewSwitch) return;
    viewSwitch.classList.add('tp-title-switch');
    const anchor = table.closest('.TableContainer') || table;
    let title = anchor.previousElementSibling;
    while (title && !title.matches('div.title')) title = title.previousElementSibling;
    const tabs = document.querySelector('#displaybox nav.tabs');
    if (title) {
      const left = title.querySelector('span.left');
      if (left) left.after(viewSwitch); else title.append(viewSwitch);
    } else if (tabs) {
      tabs.append(viewSwitch);
    } else {
      anchor.before(viewSwitch);
    }
  }

  function docker() {
    const table = document.getElementById('docker_containers');
    const list = document.getElementById('docker_list');
    if (!table || !list) return;
    // FolderView Plus has the Docker tab to itself, toolbar and counts included. It also watches
    // the whole page, so even the theme's summary above the table, redrawn on each change of the
    // list, kept it busy (the tab hung). The tab is left alone entirely.
    if (folderViewPlus()) return;
    const anchor = table.closest('.TableContainer') || table;
    const filters = [['all', 'All'], ['running', 'Running'], ['stopped', 'Stopped'], ['updates', 'Updates']];
    let activeFilter = 'all';
    // FolderView (folder.view, .view2, .view3) turns rows into folders and keeps the members of
    // closed folders inside the folder's row. Then the theme leaves the rows to it: no compact
    // columns, groups, filters or search (they would pull containers out of their folders), only
    // the summary above the table.
    const folderView = folderViewActive();

    // Compact view: Unraid's ten columns in the order its table prints them. The view is only
    // offered while the table still has exactly these, so a changed Unraid release falls back to
    // the stock table instead of showing shuffled columns.
    const COLUMNS = ['name', 'version', 'network', 'ip', 'cport', 'ports', 'volumes', 'load', 'auto', 'uptime'];
    const headRow = table.querySelector('thead tr');
    const canCompact = !folderView && Boolean(headRow) && headRow.children.length === COLUMNS.length;
    let compact = canCompact;
    try { compact = canCompact && localStorage.getItem('tft-docker-view') !== 'full'; } catch (error) { /* storage blocked */ }

    if (canCompact) {
      [...headRow.children].forEach(function (cell, index) { cell.classList.add('tp-c-' + COLUMNS[index]); });
      [['webui', 'WebUI'], ['status', 'Status'], ['cpu', 'CPU'], ['mem', 'Memory'], ['actions', '']].forEach(function (extra) {
        headRow.append(element('th', 'tp-extra tp-c-' + extra[0], extra[1]));
      });
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

      // Phones show the addresses and mounts under the card (enhance.css), without an empty line
      // for a container that has none. Long paths may break after a "/" only, not inside a
      // folder name.
      row.querySelectorAll('td.tp-c-ports, td.tp-c-volumes').forEach(function (cell) {
        cell.classList.toggle('tp-c-empty', !cell.textContent.trim());
      });
      row.querySelectorAll('td.tp-c-volumes .docker_readmore').forEach(function (box) {
        const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
        const texts = [];
        while (walker.nextNode()) texts.push(walker.currentNode);
        texts.forEach(function (node) {
          const parts = node.nodeValue.split(/(?<=\/)(?=.)/);
          if (parts.length < 2) return;
          const pieces = [];
          parts.forEach(function (part, index) {
            if (index) pieces.push(document.createElement('wbr'));
            pieces.push(document.createTextNode(part));
          });
          node.replaceWith(...pieces);
        });
      });

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
        store.openMenu(event.currentTarget, name);
      }));
      // Unraid's full menu (WebUI, console, edit, remove, ...) opens from the container icon;
      // the click is passed on with this button's position so the menu appears next to it.
      actions.append(iconButton('ellipsis-h', 'More actions for ' + name, function (event) {
        event.stopPropagation();
        if (trigger) openMenuFrom(trigger, event.currentTarget);
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
      store.create().then(function (group) { if (group) store.save(); });
    });
    if (!folderView) tools.append(newGroupButton);
    // With FolderView installed: Aurora's view or FolderView's folders (viewSwitch), beside the
    // "Docker Containers" title above the table; in the toolbar if there is none.
    const viewSwitch = folderViewSwitch();
    if (viewSwitch) {
      let title = anchor.previousElementSibling;
      while (title && !title.matches('div.title')) title = title.previousElementSibling;
      if (title) {
        viewSwitch.classList.add('tp-title-switch');
        const left = title.querySelector('span.left');
        if (left) left.after(viewSwitch); else title.append(viewSwitch);
      } else {
        tools.prepend(viewSwitch);
      }
    }
    if (folderView) {
      tabs.hidden = true;
      search.hidden = true;
    }
    toolbar.append(tabs, tools);
    search.addEventListener('input', render);

    // ---- Application groups (groupStore): collapsible sections in the list, each with its
    // containers in Unraid's order. Changing the groups saves Unraid's order as the list now
    // shows it, so the containers start in the order they are listed.
    const UNGROUPED = '\u0000ungrouped';
    // Unraid lists images no container uses as "(orphan image)" rows after the containers; the
    // Aurora view collects them in an "Orphans" section at the end, with a button removing all.
    const ORPHANS = '\u0000orphans';
    const collapsed = collapsedState('tft-docker-collapsed');
    const groupRows = new Map();
    const store = groupStore('docker', render, function () { if (!folderView) saveUnraidOrder('docker', list); });

    // Starts or stops several containers (or removes images, with key "image") one after
    // another, then lets Unraid reload the list once.
    function runAll(action, ids, key) {
      const jq = window.jQuery;
      if (!jq || !window.eventURL || !ids.length) return;
      jq('div.spinner.fixed').show('slow');
      let chain = Promise.resolve();
      ids.forEach(function (id) {
        chain = chain.then(function () {
          return new Promise(function (resolve) { jq.post(window.eventURL, { action: action, [key || 'container']: id }).always(resolve); });
        });
      });
      chain.then(function () {
        if (typeof window.loadlist === 'function') window.loadlist();
        else jq('div.spinner.fixed').hide('slow');
      });
    }

    function groupRow(key, group) {
      if (groupRows.has(key)) return groupRows.get(key);
      const onToggle = function () {
        collapsed.toggle(key);
        render();
      };
      const row = key === ORPHANS ? sectionHeader(store, null, {
        noun: 'orphan image',
        onToggle: onToggle,
        removeAll: removeImages,
      }) : sectionHeader(store, group, {
        noun: 'container',
        load: true,
        onToggle: onToggle,
        start: function (items) { runAll('start', items.map(function (item) { return item.id; })); },
        stop: function (items) { runAll('stop', items.map(function (item) { return item.id; })); },
      });
      if (key === ORPHANS) row.classList.add('tp-group-orphans');
      groupRows.set(key, row);
      return row;
    }

    // "Remove all" in the Orphans section: Unraid's own "remove_image" for each, after asking.
    function removeImages(items) {
      modal({
        title: 'Remove ' + items.length + ' orphan ' + (items.length === 1 ? 'image' : 'images') + '?',
        message: 'No container uses ' + (items.length === 1 ? 'this image' : 'these images') + '. ' + (items.length === 1 ? 'It' : 'They') + ' will be deleted from Docker: ' + items.map(function (item) { return item.name; }).join(', ') + '.',
        confirmLabel: 'Remove all',
        danger: true,
      }).then(function (confirmed) {
        if (confirmed) runAll('remove_image', items.map(function (item) { return item.id; }), 'image');
      });
    }

    // Unraid's orphan image rows: the image's id (its icon's id), tags and icon.
    function orphanRows() {
      return [...list.querySelectorAll(':scope > tr > td span.hand[onclick*="addDockerImageContext"]')].map(function (trigger) {
        const row = trigger.closest('tr');
        const tags = contextArguments(trigger)[1] || '';
        const image = trigger.querySelector('img');
        row.classList.add('tp-orphan');
        return {
          row: row,
          id: trigger.id,
          name: tags.split(',').filter(function (tag) { return tag && tag !== '<none>:<none>'; }).join(', ') || trigger.id.replace(/^sha256:/, '').slice(0, 12),
          src: image && image.src,
          trigger: trigger,
          get text() { return row.textContent.toLowerCase(); },
          running: false,
          paused: false,
        };
      });
    }

    // Text is only written when it changed: writing inside the list wakes the refresh observer.
    function setText(node, text) {
      if (node.textContent !== text) node.textContent = text;
    }

    // Puts the section headers and their containers in order at the top of the list: the groups
    // in their saved order, then "Ungrouped"; the containers in each section (and the whole list
    // when there are no groups) in Unraid's order. Runs after every refresh, and moves nothing
    // when the order is already right.
    function layoutGroups(rows, orphans) {
      const sections = store.groups.map(function (group) {
        return { key: 'g:' + group.name, group: group, title: group.name, items: rows.filter(function (item) { return group.containers.includes(item.name); }) };
      });
      const grouped = sections.length > 0;
      if (grouped) {
        const rest = rows.filter(function (item) { return !store.of(item.name); });
        if (rest.length) sections.push({ key: UNGROUPED, group: null, title: 'Ungrouped', items: rest });
      }
      if (orphans.length) sections.push({ key: ORPHANS, group: null, title: 'Orphans', items: orphans, orphans: true });
      const wanted = new Set(sections.map(function (section) { return section.key; }));
      groupRows.forEach(function (row, key) {
        if (!wanted.has(key)) {
          row.remove();
          groupRows.delete(key);
        }
      });

      // Without groups the containers come first, as a plain list.
      const order = grouped ? [] : rows.map(function (item) { return item.row; });
      sections.forEach(function (section, index) {
        const header = groupRow(section.key, section.group);
        header.tpItems = section.items;
        header.tpKey = section.key;
        section.index = index;
        section.collapsed = collapsed.has(section.key);
        if (section.orphans) {
          updateSectionHeader(header, section, {
            noun: 'orphan image',
            noRunning: true,
            app: function (item) { return { name: item.name, src: item.src, state: 'stopped', target: item.trigger }; },
          });
          order.push(header);
          section.items.forEach(function (item) {
            item.collapsed = section.collapsed;
            order.push(item.row);
          });
          return;
        }
        updateSectionHeader(header, section, {
          noun: 'container',
          groupCount: store.groups.length,
          app: function (item) {
            const image = item.row.querySelector('td.ct-name img.img');
            const trigger = item.row.querySelector('td.ct-name span.hand[id]');
            return { name: item.name, src: image && image.src, state: item.paused ? 'paused' : item.running ? 'running' : 'stopped', update: item.update, target: trigger };
          },
        });
        const load = sectionLoad(section.items);
        setText(header.querySelector('.tp-group-cpu'), load.cpu);
        setText(header.querySelector('.tp-group-mem'), load.mem);
        header.querySelector('.tp-group-mem').hidden = !load.mem;
        header.querySelector('.tp-group-load').hidden = !load.cpu;
        order.push(header);
        section.items.forEach(function (item) {
          item.collapsed = section.collapsed;
          order.push(item.row);
        });
      });
      if (!sections.length) return;
      order.forEach(function (node, index) {
        if (list.children[index] !== node) list.insertBefore(node, list.children[index] || null);
      });
    }

    // CPU and memory of a section's containers added up ({ cpu: "3.20%", mem: "1.4GiB / 15.2GiB" }), from
    // the values Unraid writes into each row every few seconds ("1.5%", "464KiB / 15.2GiB"; the
    // decimal mark follows Display Settings). Empty while nothing in the section runs. In the
    // compact view they sit in the table's CPU and Memory columns (enhance.css).
    const UNITS = { B: 1, KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };
    const number = function (text) { return parseFloat(String(text).replace(',', '.')) || 0; };
    // CPU values with two decimals ("0.00%", "1.50%") in the decimal mark Unraid uses for them
    // (Display Settings, Number format).
    let decimalMark = window.auroraDecimalMark === ',' ? ',' : '.';
    function cpuText(value) {
      return value.toFixed(2).replace('.', decimalMark) + '%';
    }
    // Unraid writes a container's CPU as "0%" or "1.5%" every few seconds; it is rewritten with
    // two decimals like the groups' sums. Only text that differs is written, so the list's
    // observer settles after one more pass.
    function formatCpu(rows) {
      rows.forEach(function (item) {
        const cell = item.row.querySelector('[class^="cpu-"]');
        if (!cell) return;
        const text = cell.textContent.trim();
        if (!/^[\d.,]+%$/.test(text)) return;
        if (text.includes(',')) decimalMark = ',';
        const formatted = cpuText(number(text));
        if (text !== formatted) cell.textContent = formatted;
      });
    }

    function sectionLoad(items) {
      let cpu = 0;
      let bytes = 0;
      let limit = 0;
      let running = 0;
      const toBytes = function (text) {
        const value = String(text).trim().match(/^([\d.,]+)\s*([KMGT]?i?B)$/i);
        return value ? number(value[1]) * (UNITS[value[2].toUpperCase()] || 1) : 0;
      };
      items.forEach(function (item) {
        if (!item.running) return;
        running++;
        const cpuCell = item.row.querySelector('[class^="cpu-"]');
        const memCell = item.row.querySelector('[class^="mem-"]');
        if (cpuCell) cpu += number(cpuCell.textContent);
        // "464KiB / 15.2GiB": used and the container's limit (the server's memory unless set).
        const parts = memCell ? memCell.textContent.split('/') : [];
        bytes += toBytes(parts[0] || '');
        limit = Math.max(limit, toBytes(parts[1] || ''));
      });
      if (!running) return { cpu: '', mem: '' };
      // Written like Unraid's own values: "2.3MiB / 15.2GiB".
      const size = function (value) {
        const unit = ['TiB', 'GiB', 'MiB', 'KiB'].find(function (name) { return value >= UNITS[name.toUpperCase()]; }) || 'B';
        const amount = value / UNITS[unit.toUpperCase()];
        return (amount >= 100 || unit === 'B' ? String(Math.round(amount)) : amount.toFixed(1).replace('.', decimalMark)) + unit;
      };
      // Nothing to add up (Unraid shows "0 / 0" while it has no reading): no memory total.
      return { cpu: cpuText(cpu), mem: bytes ? size(bytes) + (limit ? ' / ' + size(limit) : '') : '' };
    }

    // FolderView: the list stays in FolderView's order (folders and containers where they were
    // dragged to, an open folder's containers under it). A container right after a folder (or
    // after an open folder's containers) is marked, so enhance.css can set the folder apart
    // from it, and a long folder name gets its full name as the tooltip.
    function arrangeFolders() {
      let afterFolder = false;
      [...list.children].forEach(function (row) {
        const isFolder = row.classList.contains('folder');
        const inFolder = row.classList.contains('folder-element');
        const loose = !isFolder && !inFolder && Boolean(row.querySelector(':scope > td.ct-name'));
        row.classList.toggle('tp-after-folders', loose && afterFolder);
        if (isFolder || inFolder) afterFolder = true;
        else if (loose) afterFolder = false;
        const folderName = isFolder && row.querySelector('.folder-appname');
        if (folderName && folderName.title !== folderName.textContent.trim()) folderName.title = folderName.textContent.trim();
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
        // Read only when searched or filtered (Aurora's view): the whole row's text is costly to
        // read again on every change of a long list.
        get text() { return row.textContent.toLowerCase(); },
        running: Boolean(name.querySelector('i.started')),
        paused: Boolean(name.querySelector('i.paused')),
        // "update ready" (and "rebuild ready") carry a flash icon; "not available" (no update
        // information, e.g. a container without a template) is orange too, but not an update.
        update: Boolean(update && (update.querySelector('.orange-text .fa-flash') || /update ready/i.test(update.textContent))),
      };
    }

    function render() {
      if (list.tpSorting) return;
      // Containers only: a FolderView folder row has a name cell of its own (td.folder-name).
      const rows = [...list.querySelectorAll('td.ct-name:not(.folder-name)')].map(function (cell) { return describe(cell.parentElement); });
      if (!rows.length) return;
      formatCpu(rows);
      // Long names end in "…" (enhance.css); the whole name is the tooltip. A container with
      // an update gets the orange dot on its icon.
      rows.forEach(function (item) {
        const name = item.row.querySelector('td.ct-name .appname');
        if (name && name.title !== item.name) name.title = item.name;
        item.row.classList.toggle('tp-update', item.update);
      });
      const orphans = folderView ? [] : orphanRows();
      if (folderView) {
        arrangeFolders();
      } else {
        rows.forEach(function (item) { decorate(item.row); });
        layoutGroups(rows, orphans);
      }
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
      if (folderView) return;
      rows.forEach(function (item) {
        const matchesFilter = activeFilter === 'all'
          || (activeFilter === 'running' && item.running)
          || (activeFilter === 'stopped' && !item.running && !item.paused)
          || (activeFilter === 'updates' && item.update);
        item.visible = matchesFilter && item.text.includes(query);
        item.row.classList.toggle('tp-filtered-out', !item.visible || item.collapsed);
      });
      // Orphan images are no containers: they show with "All" only.
      orphans.forEach(function (item) {
        item.visible = activeFilter === 'all' && item.text.includes(query);
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

    // FolderView: a click anywhere on a folder's row opens or closes it, its name included
    // (FolderView only does that with the arrow button). Its icon keeps FolderView's menu (Edit,
    // Start, ...), and the preview icons, buttons and switches keep doing their own thing.
    if (folderView) {
      list.addEventListener('click', function (event) {
        const row = event.target.closest('tr.folder');
        if (!row || row.parentElement !== list || event.button !== 0) return;
        if (event.target.closest('button, input, select, label, span.hand, .folder-preview, .switch-button-background')) return;
        const arrow = row.querySelector('button.folder-dropdown');
        if (!arrow) return;
        event.preventDefault();
        event.stopPropagation();
        arrow.click();
      }, true);
    }

    // Status under the table header while Unraid asks Docker for the list; with many containers
    // that can take a while, and a longer wait gets a message saying so.
    const loading = element('div', 'tp-docker-loading');
    loading.setAttribute('role', 'status');
    const loadingText = element('span', 'tp-docker-loading-text', 'Loading containers…');
    loading.append(element('span', 'tp-loader'), loadingText);
    table.after(loading);
    // Unraid's own spinner would show over it after half a second (see enhance.css).
    document.body.classList.add('tp-docker-loading-on');
    const loadingTimers = [
      [3000, 'Still loading. Docker is taking a moment to list the containers.'],
      [10000, 'Docker has not answered yet. The service may still be starting, or a container is busy.'],
    ].map(function (step) {
      return setTimeout(function () { loadingText.textContent = step[1]; }, step[0]);
    });

    // The list is ready once Unraid replaced its empty placeholder row with containers or with
    // its "No Docker containers installed" row.
    function markReady() {
      if (list.classList.contains('tp-ready') || !(list.querySelector('td.ct-name') || list.textContent.trim())) return;
      list.classList.add('tp-ready');
      loadingTimers.forEach(clearTimeout);
      loading.remove();
      document.body.classList.remove('tp-docker-loading-on');
    }

    // Rendered straight away when Unraid inserts its rows, before the browser paints them, so
    // the list never shows ungrouped. render() only moves or writes what changed, so its own
    // changes settle after one more pass. The list is shown once it is laid out (see
    // #docker_list.tp-ready in enhance.css, which also reveals it by itself after two seconds).
    // With FolderView, which builds its folders in many small steps and has nothing for the
    // theme to group, render() waits until the list has been still for a moment (debounce):
    // running it on every step made a list of 300 containers settle half a second later.
    const update = function () {
      render();
      markReady();
    };
    new MutationObserver(folderView ? debounce(update) : update).observe(list, { childList: true, subtree: true });
    roomToDragToTop(list);
    if (!folderView) {
      store.load();
      dropIntoSections(list, store, function (row) { const name = row.querySelector('td.ct-name .appname'); return name ? name.textContent.trim() : ''; }, UNGROUPED, render);
    } else if (window.jQuery) {
      // FolderView's list is dragged by Unraid's own drag and drop too; it is left alone meanwhile.
      window.jQuery(list).on('sortstart', function () { list.tpSorting = true; });
      window.jQuery(list).on('sortstop', function () {
        list.tpSorting = false;
        setTimeout(render);
      });
    }
    render();
    markReady();
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

  // Docker tab and Dashboard: the container list is loaded again when Unraid's record of image
  // updates changes while the page is open (include/docker-updates.php), so a container updated
  // in the background (CA Auto Update, "Update All" in another tab, the scheduled check) no
  // longer shows "update ready". Updates started on the page itself already reload the list
  // when their dialog is closed; the record is read again after every list load, so those do
  // not load it twice. Checked every 20 seconds while the page is visible, and when it is
  // shown again.
  // Never while a check or an update is still running (the server's "busy", or "checking..."
  // in the list after "Check for Updates" here): the list would show half the results, and
  // Unraid's list code running beside the check could save the old results over the new ones.
  // It is then asked again after a few seconds.
  function dockerUpdateWatch() {
    const list = document.getElementById('docker_list') || document.getElementById('docker_view');
    if (!list || typeof window.loadlist !== 'function') return;
    const url = PLUGIN_BASE + '/include/docker-updates.php';
    let known = null;
    let busy = false;
    let soon = 0;
    function read() {
      return fetch(url, { credentials: 'same-origin', cache: 'no-store' })
        .then(function (response) { return response.ok ? response.json() : {}; })
        .then(function (data) { return typeof data.stamp === 'string' ? data : null; });
    }
    function waiting() {
      if (list.querySelector('.updatecolumn .fa-spin') || list.tpSorting) return true;
      const dialog = document.querySelector('.sweet-alert.showSweetAlert, .sweet-alert.visible');
      return Boolean(dialog && dialog.offsetParent !== null);
    }
    function check() {
      if (busy || document.hidden) return;
      busy = true;
      read()
        .then(function (data) {
          if (!data) return;
          if (known === null || data.stamp === known) { known = data.stamp; return; }
          if (data.busy || waiting()) {
            clearTimeout(soon);
            soon = setTimeout(check, 6000);
            return;
          }
          known = data.stamp;
          window.loadlist();
        })
        .catch(function () {})
        .finally(function () { busy = false; });
    }
    if (window.jQuery) {
      window.jQuery(document).on('ajaxComplete', function (event, xhr, settings) {
        if (/DockerContainers\.php|DashboardApps\.php/.test((settings && settings.url) || '')) {
          read().then(function (data) { if (data) known = data.stamp; }).catch(function () {});
        }
      });
    }
    check();
    setInterval(check, 20000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
  }

  // Dashboard, Docker tile: an orange dot on the icon of every container with an update ready,
  // running or not (issue #24). Unraid redraws the tile's chips on each refresh.
  function dashboardUpdates() {
    const view = document.getElementById('docker_view');
    // FolderView Plus marks updates on its own tile.
    if (!view || folderViewPlus()) return;
    const mark = function () {
      view.querySelectorAll('span.outer.apps').forEach(function (chip) {
        // A closed FolderView folder keeps its containers' chips in a hidden store; they are
        // FolderView's and stay as they are.
        if (chip.closest('.folder-storage')) return;
        const update = chipUpdate(chip);
        if (chip.classList.contains('tp-update') !== update) chip.classList.toggle('tp-update', update);
        // The tooltip is only taken away again if it is ours.
        const hand = chip.querySelector(':scope > span.hand');
        if (hand && update && !hand.title) hand.title = 'Update available';
        else if (hand && !update && hand.title === 'Update available') hand.removeAttribute('title');
      });
    };
    // Not debounced: marked before the next paint, so a stopped container with an update that
    // Unraid has just hidden (enhance.css shows it again) does not flicker.
    mark();
    new MutationObserver(mark).observe(view, { childList: true, subtree: true });
  }

  // Dashboard, Docker tile: a click on a container opens a dialog with its state and everything
  // Unraid's small context menu offers, as large buttons. The buttons call Unraid's own functions.
  function dashboardContainers() {
    const view = document.getElementById('docker_view');
    // FolderView Plus handles clicks on its tile itself; Unraid's own menu stays.
    if (!view || folderViewPlus()) return;
    const safeUrl = function (url) { return /^https?:\/\//i.test(url || '') ? url : ''; };

    function open(chip) {
      // Only the chip's own icon: a FolderView folder holds its containers' chips inside it, and
      // a folder keeps its own menu (Expand, Stop, ...).
      if (chip.matches('[class*="folder-"]')) return false;
      const trigger = chip.querySelector(':scope > span.hand[onclick*="addDockerContainerContext"]');
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

    // FolderView folder: a click opens or closes it in place (FolderView's own expandFolderDocker);
    // its menu (Stop all, Edit, ...) moves to the right click or a long press.
    const folderId = function (chip) {
      const hand = chip.matches('[class*="folder-docker"]') && chip.querySelector(':scope > span.hand[id^="folder-id-"]');
      return hand ? hand.id.slice('folder-id-'.length) : '';
    };
    // The menu is shown by Unraid's menu script on the click that builds it, so the right click
    // sends the folder icon a click of its own, which the handler below lets through.
    let menuClick = false;
    view.addEventListener('contextmenu', function (event) {
      const chip = event.target.closest('span.outer.apps');
      const hand = chip && folderId(chip) && chip.querySelector(':scope > span.hand');
      if (!hand) return;
      event.preventDefault();
      menuClick = true;
      hand.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: event.clientX, clientY: event.clientY }));
      menuClick = false;
    });

    // Captured before Unraid's own handler, which would open the small context menu instead.
    view.addEventListener('click', function (event) {
      const chip = event.target.closest('span.outer.apps');
      if (!chip || event.button !== 0 || menuClick) return;
      const id = folderId(chip);
      if (id && typeof expandFolderDocker === 'function') {
        event.preventDefault();
        event.stopPropagation();
        expandFolderDocker(id);
        return;
      }
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
    // Intel hybrid CPUs add "(P-Core)" / "(E-Core)"; that becomes a small "P" / "E" badge, as the
    // written-out type made the tile wider than its column.
    tile.querySelectorAll('tr.cpu_open').forEach(function (row) {
      row.classList.add('tp-core');
      const label = row.querySelector('span.w26');
      if (!label) return;
      const full = label.textContent.replace(/\s+/g, ' ').trim();
      const match = full.match(/^CPU\s+(\d+)\s*(\([^)]*\))?\s*(?:-\s*HT\s+(\d+))?/);
      if (!match) return;
      row.title = full;
      label.textContent = match[1] + (match[3] ? ' · ' + match[3] : '');
      if (match[2]) {
        const type = match[2].replace(/[()]/g, '').trim();
        const badge = element('span', 'tp-core-type', type.split('-')[0] || type);
        badge.title = type;
        label.append(badge);
      }
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

  // Dashboard, GPU Statistics plugin (one tile per GPU, #tblGPUDash1, 2, ...): its title is loose
  // text in the line below the icon, and vendor, driver and device sit in a little table of
  // their own under the header. The title becomes the tile heading, the device follows it as one
  // line, and load, temperature and processes become a short line under that; the readings get
  // their layout in enhance.css. The plugin's script finds its values by class, so the elements
  // are moved, not copied.
  function dashboardGpu() {
    document.querySelectorAll('table.dashboard > tbody[id^="tblGPUDash"]:not(.tp-gpu)').forEach(function (tile) {
      const section = tile.querySelector('.tile-header-left > .section');
      if (!section) return;
      tile.classList.add('tp-gpu');
      const name = section.firstChild;
      if (name && name.nodeType === Node.TEXT_NODE && name.textContent.trim()) {
        name.replaceWith(element('h3', 'tile-header-main', name.textContent.trim()));
      }
      section.querySelectorAll(':scope > br').forEach(function (br) { br.remove(); });
      const meta = section.querySelector(':scope > span');
      if (meta) meta.classList.add('tp-gpu-meta');

      // The device name under the heading; vendor and driver ("Intel i915") lead the readings line.
      const find = function (key) {
        return tile.querySelector('[class^="gpu-' + key + '"], [class*=" gpu-' + key + '"]');
      };
      const device = element('span', 'tp-gpu-device');
      const driver = element('span', 'tp-gpu-driver');
      [[find('name'), device], [find('vendor'), driver], [find('driver'), driver]].forEach(function (pair) {
        if (!pair[0]) return;
        const row = pair[0].closest('tr');
        if (row) row.classList.add('tp-gpu-moved');
        pair[1].append(pair[0]);
      });
      if (device.childElementCount || driver.childElementCount) {
        const heading = section.querySelector('.tile-header-main');
        if (heading) heading.after(device); else section.prepend(device);
        if (meta) meta.prepend(driver); else device.after(driver);
        const header = tile.querySelector('tr.header');
        if (header) header.classList.add('tp-gpu-moved');
      }

      // Cells by what they hold, for enhance.css: a label (span.w36), a reading with a label
      // (span.w26) and a usage bar (span.w44 with .usage-disk). Classes rather than :has()
      // in the stylesheet: a :has() rule on every td is checked again on each change of any
      // page, which slowed down busy pages (FolderView Plus's Docker list). Marked again if the
      // plugin adds rows.
      const markCells = function () {
        tile.querySelectorAll(':scope > tr > td').forEach(function (cell) {
          cell.classList.toggle('tp-gpu-w36', Boolean(cell.querySelector(':scope > span.w36')));
          cell.classList.toggle('tp-gpu-w26', Boolean(cell.querySelector(':scope > span.w26')));
        });
        tile.querySelectorAll(':scope > tr > td > span.w44').forEach(function (span) {
          span.classList.toggle('tp-gpu-bar', Boolean(span.querySelector(':scope > .usage-disk')));
        });
      };
      markCells();
      new MutationObserver(markCells).observe(tile, { childList: true });

      // A clock of 0 means the GPU is idle: an Intel GPU with nothing to do stops its clock
      // (power saving). It reads "idle" instead (enhance.css). The plugin rewrites the value
      // every few seconds, so it is watched and only marked, not replaced.
      tile.querySelectorAll('[class^="gpu-clock"], [class*=" gpu-clock"]').forEach(function (clock) {
        const mark = function () { clock.toggleAttribute('data-tp-idle', /^0(\.0+)?(\s*[MG]Hz)?$/i.test(clock.textContent.trim())); };
        new MutationObserver(mark).observe(clock, { childList: true, characterData: true, subtree: true });
        mark();
      });
    });
  }

  // Dashboard, Docker tile. With the theme's groups: see dashboardGroups. With FolderView's
  // folders: the tile keeps FolderView's order, a line sets each folder apart from the
  // containers after it, and each folder chip shows its apps' icons.
  function dashboardDockerOrder() {
    const view = document.getElementById('docker_view');
    if (!view) return;
    if (!folderViewActive()) {
      dashboardGroups(view, 'docker');
      return;
    }
    // FolderView Plus lays out its folders on the tile itself.
    if (folderViewPlus()) return;
    // A line between a folder and the containers right after it, wherever the folder is (the
    // tile follows FolderView's order). Lines are only added or removed where that changed, so
    // the tile's observer settles.
    const dividers = function (cell) {
      [...cell.querySelectorAll(':scope > .tp-chip-divider')].forEach(function (line) {
        const before = line.previousElementSibling;
        const after = line.nextElementSibling;
        if (!(before && before.classList.contains('folder-showcase-outer') && after && after.matches('span.outer.apps'))) line.remove();
      });
      [...cell.querySelectorAll(':scope > span.outer.apps')].forEach(function (chip) {
        const before = chip.previousElementSibling;
        if (!before || !before.classList.contains('folder-showcase-outer')) return;
        const line = element('div', 'tp-chip-divider');
        line.setAttribute('aria-hidden', 'true');
        chip.before(line);
      });
    };
    const arrange = function () {
      const first = view.querySelector('td > span.outer.apps, td > .folder-showcase-outer');
      if (!first) return;
      const cell = first.parentElement;
      const folders = [...cell.children].filter(function (node) { return node.classList.contains('folder-showcase-outer'); });
      folders.forEach(function (folder) {
        // A closed folder keeps its containers' chips in its hidden store, an open one in its panel.
        const inner = folder.querySelector(':scope > span.outer > .inner');
        if (!inner) return;
        let strip = inner.querySelector(':scope > .tp-group-apps');
        if (!strip) {
          strip = element('span', 'tp-group-apps');
          inner.append(strip);
        }
        appStrip(strip, chipApps([...folder.querySelectorAll('.folder-storage > span.outer, .folder-showcase > span.outer')]), 4);
      });
      dividers(cell);
      nameTooltips(cell);
    };
    let queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; arrange(); });
    }).observe(view, { childList: true, subtree: true });
    arrange();
  }

  // Dashboard, Virtual Machines tile: the theme's VM groups (not while FolderView arranges it).
  function dashboardVmGroups() {
    const view = document.getElementById('vm_view');
    if (view && !folderViewActive()) dashboardGroups(view, 'vm');
  }

  // A Dashboard chip's name: the container's name element, or the VM's name text.
  function chipName(chip) {
    const inner = chip.querySelector('.inner');
    const named = inner && inner.querySelector('.appname');
    if (named) return named.textContent.trim();
    return inner && inner.firstChild ? inner.firstChild.textContent.trim() : '';
  }

  // Whether a Dashboard container chip has an image update ready (the "update" argument of its
  // icon's addDockerContainerContext call is 1). VM chips have none.
  function chipUpdate(chip) {
    const trigger = chip.querySelector(':scope > span.hand[onclick*="addDockerContainerContext"]');
    return Boolean(trigger) && contextArguments(trigger)[5] === '1';
  }

  // Dashboard chips as apps for an icon strip; a click on an icon is a click on the chip's icon.
  function chipApps(chips) {
    return chips.map(function (chip) {
      const hand = chip.querySelector(':scope > span.hand');
      const image = hand && hand.querySelector('img');
      const state = chip.classList.contains('paused') ? 'paused' : chip.classList.contains('started') ? 'running' : 'stopped';
      return { name: chipName(chip), src: image && image.src, state: state, update: chipUpdate(chip), target: hand };
    });
  }

  // Long names end in "…" (enhance.css); the whole name is the tooltip.
  function nameTooltips(cell) {
    cell.querySelectorAll('span.outer:not(.tp-group-chip) .inner').forEach(function (inner) {
      const name = chipName(inner.parentElement);
      if (name && inner.title !== name) inner.title = name;
    });
  }

  // Dashboard, Docker or Virtual Machines tile: the theme's groups as chips that open and close a
  // panel with their members, in the groups' order and then "Ungrouped" (only while there are
  // groups, as on the tabs); the members in Unraid's order. Each group chip shows its members'
  // icons, which open their menus. Open and closed is shared with the tab.
  function dashboardGroups(view, type) {
    const kind = type === 'vm' ? 'vms' : 'apps';
    const noun = type === 'vm' ? 'VM' : 'container';
    const collapsed = collapsedState(type === 'vm' ? 'tft-vm-collapsed' : 'tft-docker-collapsed');
    const UNGROUPED_KEY = '\u0000ungrouped'; // the tabs' key for their "Ungrouped" section
    const divider = element('div', 'tp-chip-divider');
    divider.setAttribute('aria-hidden', 'true');
    const parts = new Map();
    // key: the collapsed-state key shared with the tab ('g:' + name, or UNGROUPED_KEY).
    const groupPart = function (name, key) {
      if (parts.has(key)) return parts.get(key);
      const chip = element('span', 'outer solid ' + kind + ' tp-group-chip');
      chip.setAttribute('role', 'button');
      chip.tabIndex = 0;
      const icon = element('span', 'tp-group-chip-icon');
      icon.append(element('i', 'fa fa-folder-open'));
      const inner = element('span', 'inner');
      inner.append(element('span', 'tp-group-chip-name', name), element('span', 'tp-group-chip-count'), element('span', 'tp-group-apps'));
      chip.append(icon, inner, element('i', 'fa fa-chevron-down tp-group-chip-caret'));
      const panel = element('div', 'tp-group-panel');
      const toggle = function () {
        collapsed.toggle(key);
        arrange();
      };
      chip.addEventListener('click', toggle);
      chip.addEventListener('keydown', function (event) {
        if (event.target === chip && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); toggle(); }
      });
      const part = { chip: chip, panel: panel, name: inner.firstChild, icon: icon.firstChild, count: inner.children[1], apps: inner.children[2] };
      parts.set(key, part);
      return part;
    };

    const arrange = function () {
      const first = view.querySelector('td > span.outer.' + kind + ':not(.tp-group-chip), td > .tp-group-panel');
      if (!first) return;
      const cell = first.parentElement;
      const chips = [...cell.querySelectorAll(':scope > span.outer.' + kind + ':not(.tp-group-chip), :scope > .tp-group-panel > span.outer.' + kind)];
      const placed = new Set();
      const wanted = [];
      const sections = store.groups.map(function (group) {
        const members = chips.filter(function (chip) { return !placed.has(chip) && group.containers.includes(chipName(chip)); });
        members.forEach(function (chip) { placed.add(chip); });
        return { name: group.name, key: 'g:' + group.name, members: members };
      });
      if (sections.some(function (section) { return section.members.length; })) {
        sections.push({ name: 'Ungrouped', key: UNGROUPED_KEY, members: chips.filter(function (chip) { return !placed.has(chip); }) });
      }
      const keys = new Set(sections.map(function (section) { return section.key; }));
      parts.forEach(function (part, key) {
        if (keys.has(key)) return;
        part.chip.remove();
        part.panel.remove();
        parts.delete(key);
      });
      sections.forEach(function (section) {
        const part = groupPart(section.name, section.key);
        const members = section.members;
        if (!members.length) {
          part.chip.remove();
          part.panel.remove();
          return;
        }
        members.forEach(function (chip) { placed.add(chip); });
        if (members.some(function (chip, index) { return part.panel.children[index] !== chip; }) || part.panel.children.length !== members.length) {
          part.panel.replaceChildren(...members);
        }
        const isCollapsed = collapsed.has(section.key);
        const running = members.filter(function (chip) { return chip.classList.contains('started'); }).length;
        const count = members.length + ' ' + noun + (members.length === 1 ? '' : 's') + ' · ' + running + ' running';
        if (part.count.textContent !== count) part.count.textContent = count;
        appStrip(part.apps, chipApps(members), 4);
        part.chip.title = section.name + ': ' + count;
        part.chip.setAttribute('aria-expanded', String(!isCollapsed));
        part.chip.classList.toggle('tp-collapsed', isCollapsed);
        part.icon.className = 'fa ' + (isCollapsed ? 'fa-folder' : 'fa-folder-open');
        part.panel.hidden = isCollapsed;
        wanted.push(part.chip, part.panel);
      });
      const loose = chips.filter(function (chip) { return !placed.has(chip); });
      if (wanted.length && loose.length) wanted.push(divider);
      else divider.remove();
      wanted.push(...loose);
      wanted.forEach(function (node, index) {
        if (cell.children[index] !== node) cell.insertBefore(node, cell.children[index] || null);
      });
      nameTooltips(cell);
    };
    const store = groupStore(type, arrange);
    let queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; arrange(); });
    }).observe(view, { childList: true, subtree: true });
    store.load();
    arrange();
  }

  // Dashboard, Virtual Machines Usage tile (VM Manager settings, "Show VM usage"): Unraid puts a
  // running VM's icon, name and its five readings (guest and host CPU, memory, disk, network) in
  // one small chip, where the values ran into each other. Each VM becomes a full card: icon and
  // name on top, the readings in a grid below. Unraid rewrites the readings by their ids, so they
  // are moved into the grid, not copied.
  function dashboardVmUsage() {
    const tile = document.getElementById('vm_view_usage');
    if (!tile) return;
    const arrange = function () {
      tile.querySelectorAll('span.outer.vmsuse:not(.tp-vmuse)').forEach(function (chip) {
        chip.classList.add('tp-vmuse');
        const readings = element('span', 'tp-vmuse-readings');
        chip.querySelectorAll(':scope > span[id^="vmmetrics-"]').forEach(function (reading) { readings.append(reading); });
        chip.querySelectorAll(':scope > br').forEach(function (br) { br.remove(); });
        chip.append(readings);
      });
    };
    // Unraid adds the VM rows when the dashboard loads its app lists, and again on refresh.
    new MutationObserver(arrange).observe(tile, { childList: true });
    arrange();
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

  // Main menu: every tab gets its name as a tooltip, for the narrow top bar where tabs show only
  // their icon. On phones, where the tabs scroll sideways, the open tab is scrolled into view.
  function navTitles() {
    document.querySelectorAll('#menu .nav-tile:not(.right) .nav-item a').forEach(function (link) {
      if (!link.title) link.title = link.textContent.trim();
    });
    const active = document.querySelector('#menu .nav-tile:not(.right) .nav-item.active');
    const row = active && active.parentElement;
    if (!row || row.scrollWidth <= row.clientWidth) return;
    const a = active.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    row.scrollLeft += a.left - r.left - (r.width - a.width) / 2;
  }

  // Menu: Unraid's array usage bar (Display Settings, "Show array utilization indicator")
  // becomes a widget at the start of the quick actions: a drive icon, "Array" with the
  // percentage, and a thin bar in the usage colour Unraid chose (its warning and critical
  // levels). It opens Main. Unraid's own bar stays in the page, hidden.
  function usageBar() {
    const native = document.querySelector('#menu .nav-tile.right > .usage-bar');
    if (!native) return;
    const fill = native.querySelector('span');
    const text = fill ? fill.textContent.trim() : '';
    const percent = /^(\d+)%$/.exec(text);
    const tone = !fill ? '' : fill.classList.contains('redbar') ? 'danger' : fill.classList.contains('orangebar') ? 'warn' : fill.classList.contains('greenbar') ? 'good' : '';

    const widget = element('a', 'tp-usage' + (tone ? ' tp-usage-' + tone : '') + (percent ? '' : ' tp-usage-off'));
    widget.href = '/Main';
    widget.title = (percent ? 'Array ' + text + ' used' : 'Array ' + (text || 'offline')) + '. Open Main';
    const icon = element('span', 'tp-usage-icon');
    icon.append(element('i', 'fa fa-hdd-o'));
    const head = element('span', 'tp-usage-head');
    head.append(element('span', 'tp-usage-label', 'Array'), element('span', 'tp-usage-value', percent ? text : text || 'offline'));
    const track = element('span', 'tp-usage-track');
    const bar = element('span', 'tp-usage-fill');
    bar.style.width = percent ? Math.min(100, Number(percent[1])) + '%' : '0';
    track.append(bar);
    const body = element('span', 'tp-usage-body');
    body.append(head, track);
    widget.append(icon, body);

    native.classList.add('tp-native-hidden');
    // Where it goes: with the menu as a bar across the top of a wide screen, the menu row has no
    // room left (Stats and Tools were pushed out of view), so it sits in the top bar after
    // Unraid's logo; in the sidebar and on phones it stays with the quick actions.
    const row = native.parentElement;
    const wide = window.matchMedia('(min-width: 1024px)');
    const place = function () {
      const header = document.getElementById('header');
      const logo = header && header.querySelector(':scope > unraid-header-os-version');
      const inHeader = Boolean(logo) && wide.matches && document.documentElement.classList.contains('tp-topbar');
      widget.classList.toggle('tp-usage-header', inHeader);
      if (inHeader) {
        if (widget.previousElementSibling !== logo) logo.after(widget);
      } else if (widget.parentElement !== row) {
        row.prepend(widget);
      }
    };
    place();
    wide.addEventListener('change', place);
  }

  // Menu: when the next page takes a moment to arrive (Docker with many containers), "Opening
  // Docker…" shows at the bottom so the click does not look missed. Quick pages never show it.
  function navProgress() {
    let timer = 0;
    let notice = null;
    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest && event.target.closest('#menu .nav-tile:not(.right) .nav-item a[href]');
      if (!link || link.target === '_blank' || link.origin !== location.origin || link.getAttribute('href').startsWith('#')) return;
      const name = (link.title || link.textContent).trim();
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (!notice) {
          notice = element('div', 'tp-nav-progress');
          notice.setAttribute('role', 'status');
          notice.append(element('span', 'tp-loader'), element('span', 'tp-nav-progress-text'));
          document.body.append(notice);
        }
        notice.querySelector('.tp-nav-progress-text').textContent = 'Opening ' + name + '…';
      }, 250);
    });
    // Coming back with the browser's Back button can restore this page as it was left.
    window.addEventListener('pageshow', function (event) {
      if (!event.persisted) return;
      clearTimeout(timer);
      if (notice) notice.remove();
      notice = null;
    });
  }

  // Help button: Unraid's button only shows or hides the page's help boxes, so on pages without
  // any (Dashboard, Main, Docker, ...) a click did nothing. There it is dimmed, with the tooltip
  // "No help on this page".
  function helpButton() {
    const items = [...document.querySelectorAll('.nav-item.HelpButton')];
    if (!items.length) return;
    let marked;
    // Runs after every change of the page (a list rebuilt every few seconds): it only touches
    // the button when the answer changes.
    const mark = function () {
      const none = !document.querySelector('.inline_help');
      if (none === marked) return;
      marked = none;
      items.forEach(function (item) {
        const link = item.querySelector('a');
        item.classList.toggle('tp-help-none', none);
        if (!link) return;
        if (!link.dataset.tpTitle) link.dataset.tpTitle = link.title || 'Help';
        link.title = none ? 'No help on this page' : link.dataset.tpTitle;
        link.setAttribute('aria-disabled', none ? 'true' : 'false');
      });
    };
    mark();
    // Lists rebuilt inside a table (Docker, VMs, live values) never add or remove help.
    const later = debounce(mark);
    new MutationObserver(function (records) {
      if (records.some(function (record) { return !(record.target.closest && record.target.closest('table')); })) later();
    }).observe(document.getElementById('displaybox') || document.body, { childList: true, subtree: true });
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
  // Dashboard, Disk Location tile: each bay lists the colours of its drive's orbs (grey for an
  // empty bay, green, yellow, red, blue) in data-tp-orbs, which theme.css tints the bay by.
  // Asked with :has() in the stylesheet instead, every table cell on every page took part in
  // each restyle (FolderView Plus's Docker list loaded half again as slowly).
  function diskLocationBays() {
    const tile = document.getElementById('tblDiskLocation');
    if (!tile) return;
    tile.querySelectorAll('.flex-container-layout_h > div').forEach(function (bay) {
      const colours = [];
      bay.querySelectorAll('i.orb-disklocation').forEach(function (orb) {
        const colour = (orb.className.match(/\b(grey|green|yellow|red|blue)-orb-disklocation\b/) || [])[1];
        if (colour && !colours.includes(colour)) colours.push(colour);
      });
      if (colours.length) bay.dataset.tpOrbs = colours.join(' ');
    });
  }

  // Tables in the page content: a row whose first cell is bold (inline) is a section heading;
  // theme.css styles its other cells by the class set here.
  function sectionRows() {
    document.querySelectorAll('#displaybox table > tbody > tr > td:first-child[style*="bold"]').forEach(function (cell) {
      if (/font-weight:\s*bold/.test(cell.getAttribute('style'))) cell.parentElement.classList.add('tp-section-row');
    });
  }

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
    // Favourites switched off in Display Settings.
    if (document.documentElement.classList.contains('tp-no-favourites')) return;
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
  // VMs tab: the theme's groups for VMs, as on the Docker tab: collapsible sections in the
  // groups' order and then "Ungrouped", the VMs in Unraid's order, each section with its VMs'
  // icons and start / stop for all of them; "+ Group" above the list and a folder button on each
  // VM. Not while FolderView arranges the list.
  function vmGroups() {
    const list = document.getElementById('kvm_list');
    const table = document.getElementById('kvm_table');
    if (!list || !table || folderViewActive()) return;
    const anchor = table.closest('.TableContainer') || table;
    const UNGROUPED = '\u0000ungrouped';
    const collapsed = collapsedState('tft-vm-collapsed');
    const headers = new Map();
    const store = groupStore('vm', render, function () { saveUnraidOrder('vm', list); });

    const toolbar = element('div', 'tp-toolbar tp-vm-toolbar');
    const tools = element('div', 'tp-tools');
    const newGroupButton = element('button', 'tp-tab', '+ Group');
    newGroupButton.type = 'button';
    newGroupButton.title = 'Create a group of VMs';
    newGroupButton.setAttribute('aria-selected', 'true');
    newGroupButton.addEventListener('click', function () {
      store.create().then(function (group) { if (group) store.save(); });
    });
    tools.append(newGroupButton);
    toolbar.append(tools);

    const nameOf = function (row) {
      const link = row.querySelector('td.vm-name .inner > a');
      return link ? link.textContent.trim() : '';
    };
    function describe(row) {
      const cell = row.querySelector('td.vm-name');
      const trigger = cell.querySelector('span.hand[id^="vm-"]');
      return {
        row: row,
        name: nameOf(row),
        uuid: trigger ? trigger.id.slice(3) : '',
        trigger: trigger,
        running: Boolean(cell.querySelector('i.started')),
        paused: Boolean(cell.querySelector('i.paused')),
      };
    }
    // A VM's row and the rows under it (its details), up to the next VM or section.
    function rowsOf(item) {
      const rows = [item.row];
      for (let next = item.row.nextElementSibling; next && !next.hasAttribute('parent-id') && !next.classList.contains('tp-group'); next = next.nextElementSibling) rows.push(next);
      return rows;
    }

    // Starts or stops several VMs one after another, then lets Unraid reload the list once.
    function runAll(action, items) {
      const jq = window.jQuery;
      if (!jq || !items.length) return;
      jq('div.spinner.fixed').show('slow');
      let chain = Promise.resolve();
      items.forEach(function (item) {
        chain = chain.then(function () {
          return new Promise(function (resolve) { jq.post('/plugins/dynamix.vm.manager/include/VMajax.php', { action: action, uuid: item.uuid }).always(resolve); });
        });
      });
      chain.then(function () {
        if (typeof window.loadlist === 'function') window.loadlist();
        else jq('div.spinner.fixed').hide('slow');
      });
    }

    // An actions column at the end of the table, as on the Docker tab: start, or stop and
    // restart (resume when paused), the VM's group, and Unraid's full menu (the VM's icon menu,
    // opened next to the button). The detail rows under a VM span the new column too.
    const headRow = table.querySelector('thead tr');
    if (headRow && !headRow.querySelector('.tp-vm-actions')) headRow.append(element('th', 'tp-vm-actions'));
    function decorate(item) {
      if (item.row.querySelector(':scope > td.tp-vm-actions')) return;
      const dispatch = function (action) {
        return function () {
          if (typeof window.ajaxVMDispatch === 'function') window.ajaxVMDispatch({ action: action, uuid: item.uuid }, 'loadlist');
        };
      };
      const actions = element('div', 'tp-actions');
      if (item.paused) actions.append(iconButton('play', 'Resume ' + item.name, dispatch('domain-resume'), 'tp-primary'));
      else if (item.running) actions.append(iconButton('refresh', 'Restart ' + item.name, dispatch('domain-restart')), iconButton('stop', 'Stop ' + item.name, dispatch('domain-stop'), 'tp-danger'));
      else actions.append(iconButton('play', 'Start ' + item.name, dispatch('domain-start'), 'tp-primary'));
      actions.append(iconButton('folder-o', 'Group for ' + item.name, function (event) {
        event.stopPropagation();
        store.openMenu(event.currentTarget, item.name);
      }));
      actions.append(iconButton('ellipsis-h', 'More actions for ' + item.name, function (event) {
        event.stopPropagation();
        if (item.trigger) openMenuFrom(item.trigger, event.currentTarget);
      }));
      const cell = element('td', 'tp-vm-actions');
      cell.append(actions);
      item.row.append(cell);
    }

    function headerFor(key, group) {
      if (headers.has(key)) return headers.get(key);
      const row = sectionHeader(store, group, {
        noun: 'VM',
        onToggle: function () {
          collapsed.toggle(key);
          render();
        },
        start: function (items) { runAll('domain-start', items); },
        stop: function (items) { runAll('domain-stop', items); },
      });
      headers.set(key, row);
      return row;
    }

    function render() {
      if (list.tpSorting) return;
      const items = [...list.querySelectorAll(':scope > tr[parent-id]')].map(describe).filter(function (item) { return item.name; });
      if (!items.length) return;
      if (!toolbar.isConnected) anchor.before(toolbar);
      list.querySelectorAll(':scope > tr:not([parent-id]):not(.tp-group) > td[colspan="8"]').forEach(function (cell) { cell.colSpan = 9; });
      items.forEach(decorate);
      const sections = store.groups.map(function (group) {
        return { key: 'g:' + group.name, group: group, title: group.name, items: items.filter(function (item) { return group.containers.includes(item.name); }) };
      });
      if (sections.length) {
        const rest = items.filter(function (item) { return !store.of(item.name); });
        if (rest.length) sections.push({ key: UNGROUPED, group: null, title: 'Ungrouped', items: rest });
      }
      const wanted = new Set(sections.map(function (section) { return section.key; }));
      headers.forEach(function (row, key) {
        if (!wanted.has(key)) {
          row.remove();
          headers.delete(key);
        }
      });
      if (!sections.length) {
        list.querySelectorAll(':scope > tr.tp-filtered-out').forEach(function (row) { row.classList.remove('tp-filtered-out'); });
        return;
      }
      // Each VM's rows are collected before anything moves.
      const order = [];
      sections.forEach(function (section, index) {
        const header = headerFor(section.key, section.group);
        header.tpItems = section.items;
        header.tpKey = section.key;
        section.index = index;
        section.collapsed = collapsed.has(section.key);
        updateSectionHeader(header, section, {
          noun: 'VM',
          groupCount: store.groups.length,
          app: function (item) {
            const image = item.trigger && item.trigger.querySelector('img');
            return { name: item.name, src: image && image.src, state: item.paused ? 'paused' : item.running ? 'running' : 'stopped', target: item.trigger };
          },
        });
        order.push(header);
        section.items.forEach(function (item) {
          rowsOf(item).forEach(function (row) {
            row.classList.toggle('tp-filtered-out', section.collapsed);
            order.push(row);
          });
        });
      });
      order.forEach(function (node, index) {
        if (list.children[index] !== node) list.insertBefore(node, list.children[index] || null);
      });
    }

    // Unraid replaces the rows on every refresh; they are grouped again before they are painted.
    new MutationObserver(render).observe(list, { childList: true });
    dropIntoSections(list, store, nameOf, UNGROUPED, render);
    roomToDragToTop(list);
    store.load();
    render();
  }

  function vmDetails() {
    const list = document.getElementById('kvm_list');
    if (!list || typeof window.toggle_id !== 'function') return;

    function decorate() {
      list.querySelectorAll('tr[parent-id]').forEach(function (row) {
        // A FolderView folder row looks like a VM's (parent-id and a details row) but is not one,
        // and the rows in a closed folder's store are FolderView's.
        if (row.dataset.tpExpand || row.classList.contains('folder') || row.closest('.folder-storage')) return;
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
        for (let next = details; next && !next.hasAttribute('parent-id') && !next.classList.contains('tp-group'); next = next.nextElementSibling) next.classList.add('tp-vm-details');

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

    // Stopped array: Unraid puts "Maintenance mode" in a row of its own under Start, which made
    // a second "Array" card. Its checkbox moves into the Start card's description, where it
    // belongs; it stays in the same form, so Start still sends it.
    const startButton = grid.querySelector('[name="cmdStart"], #cmdStart');
    const startMode = grid.querySelector('input[type="checkbox"][name="startMode"]');
    const modeRow = startMode && startMode.closest('tr');
    if (startButton && modeRow && !modeRow.contains(startButton) && startButton.form === startMode.form) {
      const target = startButton.closest('tr').lastElementChild;
      const label = startMode.closest('label') || startMode;
      const hint = modeRow.lastElementChild ? modeRow.lastElementChild.textContent.replace(/\s+/g, ' ').trim() : '';
      if (hint) label.title = hint;
      target.append(label);
      modeRow.classList.add('tp-op-skip');
    }

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

  // Plugins: Unraid checks every plugin for updates once per visit, with a single download that
  // is not retried, so now and then a row ends on "not available" or "cannot check" although
  // the plugin is fine. Such a row is checked again in the background, once per plugin and
  // visit, with Unraid's own "plugin check" (include/plugin-recheck.php, up to three tries).
  // Unraid's list code then redraws the row from the file that check left behind.
  function pluginRecheck() {
    const list = document.getElementById('plugin_list');
    if (!list || typeof window.updateInfo !== 'function') return;
    const SHOW = '/plugins/dynamix.plugin.manager/include/ShowPlugins.php';
    const tried = new Set();
    const queue = [];
    let active = 0;

    // Failed rows by their icon, so this works in every language: the broken link of "not
    // available" and the red warning of "cannot check".
    function failed(cell) {
      return cell.querySelector('i.fa-unlink, .red-text > i.fa-exclamation-triangle');
    }

    function next() {
      while (active < 2 && queue.length) recheck(queue.shift());
    }

    function recheck(cell) {
      const box = cell.closest('tr') && cell.closest('tr').querySelector('input.remove[data$=".plg"]');
      const plg = box ? box.getAttribute('data') : '';
      if (!plg) return;
      const before = cell.innerHTML;
      const id = cell.id.replace(/^sid-/, '');
      active++;
      cell.innerHTML = "<span style='color:#267CA8'><i class='fa fa-refresh fa-spin fa-fw'></i>&nbsp;checking...</span>";
      const body = new URLSearchParams({ plugin: plg, csrf_token: window.csrf_token || '' });
      fetch(PLUGIN_BASE + '/include/plugin-recheck.php', { method: 'POST', credentials: 'same-origin', body: body })
        .then(function (response) { return response.json(); })
        .then(function (result) {
          if (!result.ok) throw new Error('check failed');
          // "return" draws every row from the files the checks left, without downloading
          // again; only this plugin's two cells are taken from it.
          return fetch(SHOW + '?' + new URLSearchParams({ audit: plg.replace(/\.plg$/, '') + ':return' }), { credentials: 'same-origin', cache: 'no-store' });
        })
        .then(function (response) { return response.text(); })
        .then(function (text) {
          const parts = text.split('\0');
          const lines = parts[0].split('\n').filter(function (line) {
            return line.indexOf('vid-' + id + '::') === 0 || line.indexOf('sid-' + id + '::') >= 0;
          });
          if (!lines.length) throw new Error('row not found');
          window.updateInfo(lines.join('\n'));
          // Unraid shows "Update all" when more than one plugin has an update.
          if (window.jQuery) {
            if (parseInt(parts[1], 10) > 1) window.jQuery('#updateall').show();
            window.jQuery('#plugin_table').trigger('update');
          }
        })
        .catch(function () { cell.innerHTML = before; })
        .finally(function () { active--; next(); });
    }

    function scan() {
      list.querySelectorAll('td[id^="sid-"]').forEach(function (cell) {
        if (tried.has(cell.id) || !failed(cell)) return;
        tried.add(cell.id);
        queue.push(cell);
      });
      next();
    }

    // Unraid fills the status cells when its check returns; "Check For Updates" starts over,
    // and then each plugin may be checked again once.
    new MutationObserver(scan).observe(list, { childList: true, subtree: true });
    document.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('#checkall')) tried.clear();
    }, true);
    scan();
  }

  function start() {
    const info = pageInfo();
    [function () { topBar(info); }, themeSwitch, function () { serverCard(info); }, function () { pageHeading(info); }, function () { folderViewBeta(info); }, function () { panelFavourites(info); }, function () { panelSearch(info); }, function () { usersPage(info); }, selectLists, lockState, docker, dockerPorts, vmViewSwitch, vmGroups, vmDetails, mainTables, arrayOperations, dashboardSummary, dashboardCharts, dashboardCpu, dashboardCores, dashboardContainers, dashboardUpdates, dockerUpdateWatch, dashboardDockerOrder, dashboardVmGroups, dashboardMemory, dashboardGpu, dashboardVmUsage, dashboardFans, diskLocationBays, sectionRows, externalLinkDialog, caOverlay, helpButton, navTitles, usageBar, navProgress, pluginRecheck, function () { toolText(info); }].forEach(function (enhancer) {
      // One failing enhancer must not stop the others or the page's own scripts.
      try { enhancer(); } catch (error) { console.error('Aurora Theme:', error); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
