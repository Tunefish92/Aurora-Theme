// Stats page of the Aurora Theme. Data comes from include/stats.php: stored history for
// the hour / day / week / month ranges, or a fresh one-second measurement for "Live".
(function () {
  'use strict';

  const root = document.getElementById('tft-stats');
  if (!root) return;

  const RANGES = [['live', 'Live'], ['hour', 'Last hour'], ['day', 'Last 24 hours'], ['week', 'Last 7 days'], ['month', 'Last 31 days']];
  // Point layout from the endpoint: [time, cpu %, memory %, rx B/s, tx B/s, read B/s, write B/s]
  const CHARTS = [
    { title: 'CPU load', unit: '%', max: 100, series: [{ name: 'CPU', column: 1, scale: 1 }] },
    { title: 'Memory', unit: '%', max: 100, series: [{ name: 'Memory', column: 2, scale: 1 }] },
    { title: 'Network', unit: 'Mbps', series: [{ name: 'Download', column: 3, scale: 8 / 1e6 }, { name: 'Upload', column: 4, scale: 8 / 1e6 }] },
    { title: 'Disk I/O', unit: 'MB/s', series: [{ name: 'Read', column: 5, scale: 1 / 1e6 }, { name: 'Write', column: 6, scale: 1 / 1e6 }] },
  ];
  const LIVE_POINTS = 120;
  const LIVE_INTERVAL = 3000;
  const HISTORY_INTERVAL = 60000;

  let range = 'hour';
  let points = [];
  let timer;
  let request = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---- Static page structure
  const toolbar = element('div', 'tp-toolbar');
  const tabs = element('div', 'tp-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Time range');
  RANGES.forEach(function (entry) {
    const tab = element('button', 'tp-tab', entry[1]);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.dataset.range = entry[0];
    tab.addEventListener('click', function () { setRange(entry[0]); });
    tabs.append(tab);
  });
  toolbar.append(tabs);

  const summary = element('section', 'tp-summary');
  summary.setAttribute('aria-label', 'Statistics summary');
  const note = element('p', 'tfs-note');
  const grid = element('div', 'tfs-grid');
  const hosts = CHARTS.map(function (chart) {
    const card = element('section', 'tfs-card');
    const head = element('div', 'tfs-card-head');
    const title = element('h2', 'tfs-card-title', chart.title + ' ');
    title.append(element('small', '', chart.unit));
    head.append(title);
    if (chart.series.length > 1) {
      const legend = element('div', 'tfs-legend');
      chart.series.forEach(function (series, index) {
        const item = element('span', '', series.name);
        const swatch = element('i', 'tfs-swatch');
        swatch.style.setProperty('--tfs-series', 'var(--tfs-series-' + (index + 1) + ')');
        item.prepend(swatch);
        legend.append(item);
      });
      head.append(legend);
    }
    const host = element('div', 'tfs-chart');
    card.append(head, host);
    grid.append(card);
    return host;
  });
  root.append(toolbar, summary, note, grid);
  renderDisks();

  // ---- Formatting
  const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  const secondFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  function formatTime(seconds) {
    const date = new Date(seconds * 1000);
    return (range === 'live' ? secondFormat : range === 'week' || range === 'month' ? dayFormat : timeFormat).format(date);
  }
  function formatValue(value) {
    return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
  }
  function formatSize(kib) {
    const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
    let value = kib;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
    return (value >= 100 ? value.toFixed(0) : value.toFixed(1)) + ' ' + units[unit];
  }
  // 1, 2 or 5 times a power of ten: a readable top for the value axis.
  function niceMax(value) {
    if (value <= 0) return 1;
    const power = Math.pow(10, Math.floor(Math.log10(value)));
    const step = [1, 2, 5, 10].find(function (candidate) { return candidate * power >= value; });
    return step * power;
  }

  // ---- Charts
  function drawChart(host, chart) {
    const data = chart.series.map(function (series) {
      return points.map(function (point) { return point[series.column] * series.scale; });
    });
    const times = points.map(function (point) { return point[0]; });
    const width = host.clientWidth || 600;
    const height = 190;
    const pad = { left: 38, right: 6, top: 8, bottom: 22 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const max = chart.max || niceMax(Math.max.apply(null, data.flat().concat(0)));
    const first = times[0];
    const span = Math.max(1, times[times.length - 1] - first);
    const x = function (index) { return pad.left + (times.length > 1 ? (times[index] - first) / span : 0.5) * plotWidth; };
    const y = function (value) { return pad.top + (1 - Math.min(value, max) / max) * plotHeight; };
    const path = function (values) {
      return values.map(function (value, index) { return (index ? 'L' : 'M') + x(index).toFixed(1) + ' ' + y(value).toFixed(1); }).join('');
    };

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(function (step) {
      const gy = y(max * step);
      return '<line class="tfs-gridline" x1="' + pad.left + '" x2="' + (width - pad.right) + '" y1="' + gy + '" y2="' + gy + '" />'
        + '<text class="tfs-axis" x="' + (pad.left - 7) + '" y="' + (gy + 3) + '" text-anchor="end">' + Number((max * step).toPrecision(3)) + '</text>';
    }).join('');
    host.innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img">' + gridLines + '<g class="tfs-ticks"></g><g class="tfs-marks"></g>'
      + '<g class="tfs-hover" hidden><line class="tfs-hair" y1="' + pad.top + '" y2="' + (pad.top + plotHeight) + '" /></g></svg>';
    const svg = host.querySelector('svg');
    svg.setAttribute('aria-label', chart.title + ' in ' + chart.unit + ' over time');

    if (!times.length) {
      host.append(element('div', 'tfs-empty', range === 'live' ? 'Measuring…' : 'No data stored for this range yet.'));
      return;
    }

    const namespace = 'http://www.w3.org/2000/svg';
    const ticks = svg.querySelector('.tfs-ticks');
    (plotWidth < 380 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).forEach(function (step) {
      const label = document.createElementNS(namespace, 'text');
      label.setAttribute('class', 'tfs-axis');
      label.setAttribute('x', pad.left + step * plotWidth);
      label.setAttribute('y', height - 5);
      label.setAttribute('text-anchor', step === 0 ? 'start' : step === 1 ? 'end' : 'middle');
      label.textContent = formatTime(first + step * span);
      ticks.append(label);
    });

    const marks = svg.querySelector('.tfs-marks');
    const hover = svg.querySelector('.tfs-hover');
    const dots = data.map(function (values, index) {
      const colour = 'var(--tfs-series-' + (index + 1) + ')';
      if (data.length === 1 && values.length > 1) {
        const area = document.createElementNS(namespace, 'path');
        area.setAttribute('class', 'tfs-area');
        area.setAttribute('d', path(values) + 'L' + x(values.length - 1).toFixed(1) + ' ' + y(0) + 'L' + x(0).toFixed(1) + ' ' + y(0) + 'Z');
        area.style.setProperty('--tfs-series', colour);
        marks.append(area);
      }
      const line = document.createElementNS(namespace, 'path');
      line.setAttribute('class', 'tfs-line');
      line.setAttribute('d', path(values));
      line.style.setProperty('--tfs-series', colour);
      marks.append(line);
      const dot = document.createElementNS(namespace, 'circle');
      dot.setAttribute('class', 'tfs-dot');
      dot.setAttribute('r', 4);
      dot.style.setProperty('--tfs-series', colour);
      hover.append(dot);
      return dot;
    });

    // One readout for every series at the time nearest the pointer.
    const tip = element('div', 'tfs-tip');
    tip.hidden = true;
    host.append(tip);
    host.onpointermove = function (event) {
      const pointerX = event.clientX - host.getBoundingClientRect().left;
      let index = 0;
      for (let i = 1; i < times.length; i += 1) {
        if (Math.abs(x(i) - pointerX) < Math.abs(x(index) - pointerX)) index = i;
      }
      hover.hidden = false;
      const hair = hover.querySelector('.tfs-hair');
      hair.setAttribute('x1', x(index));
      hair.setAttribute('x2', x(index));
      dots.forEach(function (dot, series) {
        dot.setAttribute('cx', x(index));
        dot.setAttribute('cy', y(data[series][index]));
      });
      tip.replaceChildren(element('div', 'tfs-tip-time', formatTime(times[index])));
      chart.series.forEach(function (series, order) {
        const row = element('div', 'tfs-tip-row');
        const swatch = element('i', 'tfs-swatch');
        swatch.style.setProperty('--tfs-series', 'var(--tfs-series-' + (order + 1) + ')');
        row.append(swatch, element('span', '', series.name), element('strong', '', formatValue(data[order][index]) + ' ' + chart.unit));
        tip.append(row);
      });
      tip.hidden = false;
      const left = x(index) + 12;
      tip.style.left = (left + tip.offsetWidth > width ? x(index) - 12 - tip.offsetWidth : left) + 'px';
    };
    host.onpointerleave = function () {
      hover.hidden = true;
      tip.hidden = true;
    };
  }

  function renderSummary() {
    const column = function (index, scale) { return points.map(function (point) { return point[index] * scale; }); };
    const average = function (values) { return values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : null; };
    const peak = function (values) { return values.length ? Math.max.apply(null, values) : null; };
    const show = function (value, suffix) { return value === null ? '–' : formatValue(value).replace(/\.0+$/, '') + suffix; };
    const items = [
      ['Average CPU', show(average(column(1, 1)), '%'), 'load', 'accent'],
      ['Peak CPU', show(peak(column(1, 1)), '%'), 'load', ''],
      ['Average memory', show(average(column(2, 1)), '%'), 'in use', 'accent'],
      ['Peak download', show(peak(column(3, 8 / 1e6)), ''), 'Mbps', ''],
    ];
    summary.replaceChildren.apply(summary, items.map(function (item) {
      const cell = element('div', 'tp-summary-item');
      const value = element('div', 'tp-summary-value' + (item[3] ? ' tp-' + item[3] : ''));
      value.append(element('span', '', item[1]), element('span', 'tp-summary-detail', item[2]));
      cell.append(element('div', 'tp-summary-label', item[0]), value);
      return cell;
    }));
  }

  function render() {
    tabs.querySelectorAll('.tp-tab').forEach(function (tab) {
      tab.setAttribute('aria-selected', String(tab.dataset.range === range));
    });
    note.textContent = range === 'live'
      ? 'Measured every few seconds while this page is open.'
      : 'One point is stored per minute. History is kept in memory for 31 days and starts again after a reboot.';
    renderSummary();
    hosts.forEach(function (host, index) { drawChart(host, CHARTS[index]); });
  }

  function renderDisks() {
    let disks = [];
    try { disks = JSON.parse(root.dataset.disks || '[]'); } catch (error) { disks = []; }
    if (!disks.length) return;
    const card = element('section', 'tfs-card');
    card.setAttribute('aria-label', 'Disk utilisation');
    disks.forEach(function (disk) {
      const percent = Math.max(0, Math.min(100, Math.round(disk.used / disk.size * 100)));
      const row = element('div', 'tfs-disk');
      const track = element('div', 'tfs-track');
      const fill = element('div', 'tfs-fill');
      fill.style.width = percent + '%';
      track.append(fill);
      row.append(element('span', 'tfs-disk-name', disk.name), track, element('span', 'tfs-disk-value', formatSize(disk.used) + ' / ' + formatSize(disk.size) + ' · ' + percent + '%'));
      card.append(row);
    });
    root.append(element('h2', 'tfs-section', 'Disk utilisation'), card);
  }

  // ---- Data
  function load() {
    const current = ++request;
    fetch(root.dataset.endpoint + '?range=' + encodeURIComponent(range), { credentials: 'same-origin' })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (current !== request) return; // the range changed while this was in flight
        const fresh = Array.isArray(data.points) ? data.points : [];
        points = range === 'live' ? points.concat(fresh).slice(-LIVE_POINTS) : fresh;
        render();
      })
      .catch(function (error) { console.error('Aurora Theme stats:', error); })
      .finally(function () {
        if (current === request) timer = setTimeout(load, range === 'live' ? LIVE_INTERVAL : HISTORY_INTERVAL);
      });
  }

  function setRange(next) {
    range = next;
    points = [];
    clearTimeout(timer);
    render();
    load();
  }

  window.addEventListener('resize', function () { hosts.forEach(function (host, index) { drawChart(host, CHARTS[index]); }); });
  setRange(range);
})();
