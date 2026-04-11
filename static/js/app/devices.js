/* ============================================================
   devices.js — Device Management Page
   ============================================================ */

// ── State ─────────────────────────────────────────────────────
let _inventory  = null;
let _isAdmin    = false;
let _canManage  = false;   // admin or engineer

// ── Bootstrap ─────────────────────────────────────────────────
function initPage() {
  if (currentUser) {
    _isAdmin   = currentUser.privilege === 'admin';
    _canManage = currentUser.privilege !== 'user';
    const label = document.getElementById('devices-location-label');
    if (label) label.textContent = currentUser.place || '—';
  }
  loadDevicesPage();
}

async function loadDevicesPage() {
  _showLoading(true);
  try {
    const r = await fetch('/devices/api/inventory');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    _inventory = await r.json();
    _renderAll();
    _checkSimExpiry(_inventory.sims || []);
    _showButtonVisibility();
    _showLoading(false);
  } catch (e) {
    _showError('Failed to load device data. ' + e.message);
  }
}

// Silent refresh after mutations — no loading overlay flicker
async function _refreshInventory() {
  try {
    const r = await fetch('/devices/api/inventory');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    _inventory = await r.json();
    _renderAll();
    _checkSimExpiry(_inventory.sims || []);
  } catch (e) {
    showToast('Failed to refresh device data.', 'error');
  }
}

function _showButtonVisibility() {
  // Admin-only add buttons
  const adminButtons = [
    'add-pluto-btn','add-mars-btn','add-watch-right-btn','add-watch-left-btn',
    'add-modem-btn','add-sim-btn','add-laptop-btn',
  ];
  adminButtons.forEach(id => {
    if (_isAdmin) document.getElementById(id)?.classList.remove('hidden');
  });

  // Clinic toggle — admin only (pluto/mars only)
  ['clinic-pluto-btn','clinic-mars-btn'].forEach(id => {
    if (_isAdmin) document.getElementById(id)?.classList.remove('hidden');
  });

  // Issue report — admin or engineer
  ['issue-pluto-btn','issue-mars-btn','issue-agwatch-btn'].forEach(id => {
    if (_canManage) document.getElementById(id)?.classList.remove('hidden');
  });
}

// ── Render all sections ───────────────────────────────────────

function _renderAll() {
  _renderSection('pluto',  _inventory.pluto   || []);
  _renderSection('mars',   _inventory.mars    || []);
  _renderAgwatches(_inventory.agwatch || []);
  _renderModems(_inventory.modems   || []);
  _renderSims(_inventory.sims      || []);
  _renderLaptops(_inventory.laptops  || []);
  document.getElementById('devices-sections').classList.remove('hidden');
}

// ── Pluto / Mars ──────────────────────────────────────────────

function _renderSection(type, devices) {
  const container = document.getElementById(`table-${type}`);
  if (!container) return;

  const total    = devices.length;
  const assigned = devices.filter(d => d.assigned_to).length;
  const avail    = devices.filter(d => !d.assigned_to && !d.faulty && !d.clinic_only).length;
  document.getElementById(`badge-${type}`).textContent =
    `${total} total · ${avail} available · ${assigned} assigned`;

  if (total === 0) { container.innerHTML = _emptyRow('No devices in inventory'); return; }

  container.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-100 text-left">
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Device ID</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Serial</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Status</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigned Patient</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-50">
        ${devices.map(d => `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-6 py-3.5 font-mono font-medium text-slate-800">${_esc(d.id)}</td>
            <td class="px-6 py-3.5 text-slate-600">${_esc(d.serial) || '—'}</td>
            <td class="px-6 py-3.5">${_statusBadge(d)}</td>
            <td class="px-6 py-3.5">${_assignedCell(d.assigned_to)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ── Agwatch ───────────────────────────────────────────────────

function _renderAgwatches(devices) {
  const total    = devices.length;
  const assigned = devices.filter(d => d.assigned_to).length;
  const avail    = devices.filter(d => !d.assigned_to && !d.lost && !d.has_issue && !d.clinic_only).length;
  document.getElementById('badge-agwatch').textContent =
    `${total} total · ${avail} available · ${assigned} assigned`;

  const right = devices.filter(d => (d.assigned_to?.limb || d.limb_default || '').toLowerCase() === 'right');
  const left  = devices.filter(d => (d.assigned_to?.limb || d.limb_default || '').toLowerCase() === 'left');
  _renderWatchSubTable('right', right);
  _renderWatchSubTable('left',  left);
}

function _renderWatchSubTable(side, devices) {
  const container = document.getElementById(`table-agwatch-${side}`);
  if (!container) return;

  if (devices.length === 0) { container.innerHTML = _emptyRow('No watches in inventory'); return; }

  // Build a map: homerID → paired watch on the other limb
  const allWatches = _inventory?.agwatch || [];
  const otherLimb  = side === 'right' ? 'left' : 'right';

  container.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-100 text-left">
          <th class="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Device ID</th>
          <th class="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Serial</th>
          <th class="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Status</th>
          <th class="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigned Patient</th>
          <th class="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">${otherLimb.charAt(0).toUpperCase() + otherLimb.slice(1)} Pair</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-50">
        ${devices.map(d => {
          // Find the paired watch: same patient, other limb
          const homerID = d.assigned_to?.homerID;
          const pair = homerID
            ? allWatches.find(w => w.assigned_to?.homerID === homerID && (w.assigned_to?.limb || w.limb_default || '').toLowerCase() === otherLimb)
            : null;
          const pairCell = pair
            ? `<span class="font-mono text-xs text-slate-700">${_esc(pair.id)}</span>`
            : '<span class="text-xs text-slate-400 italic">None</span>';
          return `
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-5 py-3.5 font-mono font-medium text-slate-800">${_esc(d.id)}</td>
            <td class="px-5 py-3.5 text-slate-600">${_esc(d.serial) || '—'}</td>
            <td class="px-5 py-3.5">${_watchStatusBadge(d)}</td>
            <td class="px-5 py-3.5">${_assignedCell(d.assigned_to)}</td>
            <td class="px-5 py-3.5">${pairCell}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ── Modems ────────────────────────────────────────────────────

function _renderModems(devices) {
  const container = document.getElementById('table-modems');
  if (!container) return;
  const assigned = devices.filter(d => d.assigned_to).length;
  const avail    = devices.filter(d => !d.assigned_to).length;
  document.getElementById('badge-modems').textContent =
    `${devices.length} total · ${avail} available · ${assigned} assigned`;

  if (devices.length === 0) { container.innerHTML = _emptyRow('No modems in inventory'); return; }

  const actionsCol = _isAdmin ? '<th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-40">Actions</th>' : '';

  container.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-100 text-left">
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Modem ID</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Serial</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">SIM Card</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Status</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigned Patient</th>
          ${actionsCol}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-50">
        ${devices.map(d => {
          const simCell = d.sim_info
            ? `<span class="font-medium text-slate-700">${_esc(d.sim_info.network || '—')}</span>
               <span class="text-xs text-slate-400 ml-1">${_esc(d.sim_info.phoneNumber || '')}</span>`
            : '<span class="text-slate-400 italic text-xs">Not linked</span>';
          const statusBadge = d.assigned_to
            ? '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700"><i class="fas fa-user-check"></i>Assigned</span>'
            : '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700"><i class="fas fa-check-circle"></i>Available</span>';
          const actions = _isAdmin ? (() => {
            const linkBtn = `<button onclick="openLinkSimModal('${_esc(d.id)}')"
                class="px-2.5 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors">
                <i class="fas fa-link mr-1"></i>SIM</button>`;
            const assignBtn = !d.assigned_to
              ? `<button onclick="openAssignModal('modem','${_esc(d.id)}')"
                   class="px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors">
                   <i class="fas fa-user-plus mr-1"></i>Assign</button>`
              : `<button onclick="unassignDevice('modem','${_esc(d.id)}')"
                   class="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">
                   <i class="fas fa-user-minus mr-1"></i>Unassign</button>`;
            return `<div class="flex gap-1.5">${linkBtn}${assignBtn}</div>`;
          })() : '';
          return `
            <tr class="hover:bg-slate-50 transition-colors">
              <td class="px-6 py-3.5 font-mono font-medium text-slate-800">${_esc(d.id)}</td>
              <td class="px-6 py-3.5 text-slate-600">${_esc(d.serial) || '—'}</td>
              <td class="px-6 py-3.5">${simCell}</td>
              <td class="px-6 py-3.5">${statusBadge}</td>
              <td class="px-6 py-3.5">${_assignedCell(d.assigned_to)}</td>
              ${_isAdmin ? `<td class="px-6 py-3.5">${actions}</td>` : ''}
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ── SIM Cards ─────────────────────────────────────────────────

function _renderSims(sims) {
  const container = document.getElementById('table-sims');
  if (!container) return;

  const expired = sims.filter(s => s.isExpired).length;
  document.getElementById('badge-sims').textContent =
    expired > 0 ? `${sims.length} total · ${expired} expired` : `${sims.length} total`;

  if (sims.length === 0) { container.innerHTML = _emptyRow('No SIM cards recorded'); return; }

  container.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-100 text-left">
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Network</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Plan</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Modem</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Recharge Date</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-44">Expiry Status</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-50">
        ${sims.map(s => {
          const modemLabel = s.modem_id
            ? `<span class="font-mono text-xs text-slate-700">${_esc(s.modem_id)}</span>`
            : '<span class="text-slate-400 italic text-xs">Not linked</span>';
          const planLabel = s.dataPlan ? `${_esc(s.dataPlan)}d` : '—';
          return `
            <tr class="hover:bg-slate-50 transition-colors">
              <td class="px-6 py-3.5 font-mono text-slate-800">${_esc(s.phoneNumber || '—')}</td>
              <td class="px-6 py-3.5 text-slate-600">${_esc(s.network || '—')}</td>
              <td class="px-6 py-3.5 text-slate-600">${planLabel}</td>
              <td class="px-6 py-3.5">${modemLabel}</td>
              <td class="px-6 py-3.5 text-slate-600">${_esc(s.rechargeDate || '—')}</td>
              <td class="px-6 py-3.5">${_simExpiryBadge(s)}</td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function _simExpiryBadge(s) {
  if (!s.expiryDate) return '<span class="text-slate-400 italic text-xs">No expiry set</span>';
  if (s.isExpired)
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700"><i class="fas fa-times-circle"></i>Expired</span>`;
  const d = s.daysUntilExpiry;
  if (d <= 3)
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700"><i class="fas fa-exclamation-circle"></i>Expires in ${d}d</span>`;
  if (d <= 5)
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"><i class="fas fa-exclamation-triangle"></i>Expires in ${d}d</span>`;
  return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700"><i class="fas fa-check-circle"></i>${_esc(s.expiryDate)}</span>`;
}

// ── Laptops ───────────────────────────────────────────────────

function _renderLaptops(devices) {
  const container = document.getElementById('table-laptops');
  if (!container) return;

  const assigned = devices.filter(d => d.assigned_to).length;
  const avail    = devices.filter(d => !d.assigned_to).length;
  document.getElementById('badge-laptops').textContent =
    `${devices.length} total · ${avail} available · ${assigned} assigned`;

  if (devices.length === 0) { container.innerHTML = _emptyRow('No laptops in inventory'); return; }

  const actionsCol = _isAdmin ? '<th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Actions</th>' : '';

  container.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-100 text-left">
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Laptop ID</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Serial</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Status</th>
          <th class="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigned Patient</th>
          ${actionsCol}
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-50">
        ${devices.map(d => {
          const statusBadge = d.assigned_to
            ? '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700"><i class="fas fa-user-check"></i>Assigned</span>'
            : '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700"><i class="fas fa-check-circle"></i>Available</span>';
          const actions = _isAdmin
            ? (d.assigned_to
                ? `<button onclick="unassignDevice('laptop','${_esc(d.id)}')"
                     class="px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">
                     <i class="fas fa-user-minus mr-1"></i>Unassign</button>`
                : `<button onclick="openAssignModal('laptop','${_esc(d.id)}')"
                     class="px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors">
                     <i class="fas fa-user-plus mr-1"></i>Assign</button>`)
            : '';
          return `
            <tr class="hover:bg-slate-50 transition-colors">
              <td class="px-6 py-3.5 font-mono font-medium text-slate-800">${_esc(d.id)}</td>
              <td class="px-6 py-3.5 text-slate-600">${_esc(d.serial) || '—'}</td>
              <td class="px-6 py-3.5">${statusBadge}</td>
              <td class="px-6 py-3.5">${_assignedCell(d.assigned_to)}</td>
              ${_isAdmin ? `<td class="px-6 py-3.5">${actions}</td>` : ''}
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// ── Cell helpers ──────────────────────────────────────────────

function _statusBadge(d) {
  if (d.faulty)      return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700"><i class="fas fa-exclamation-circle"></i>Issue</span>';
  if (d.clinic_only) return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500"><i class="fas fa-hospital"></i>Clinic Only</span>';
  if (d.assigned_to) return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700"><i class="fas fa-user-check"></i>Assigned</span>';
  return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700"><i class="fas fa-check-circle"></i>Available</span>';
}

function _watchStatusBadge(d) {
  if (d.has_issue)   return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700"><i class="fas fa-exclamation-circle"></i>Issue</span>';
  if (d.lost)        return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500"><i class="fas fa-times-circle"></i>Lost</span>';
  if (d.clinic_only) return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500"><i class="fas fa-hospital"></i>Clinic Only</span>';
  if (d.assigned_to) return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700"><i class="fas fa-user-check"></i>Assigned</span>';
  return '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700"><i class="fas fa-check-circle"></i>Available</span>';
}

function _assignedCell(assigned_to) {
  if (!assigned_to) return '<span class="text-slate-400 italic text-xs">Not Assigned</span>';
  const homer    = _esc(assigned_to.homerID    || '—');
  const hospital = _esc(assigned_to.hospitalID || '—');
  return `<a href="/patients/${_esc(assigned_to.homerID)}" class="inline-flex items-center gap-2 group">
    <span class="font-medium text-blue-600 group-hover:text-blue-800 group-hover:underline">${homer}</span>
    <span class="text-xs text-slate-400">${hospital}</span>
  </a>`;
}

function _emptyRow(msg) {
  return `<div class="px-6 py-8 text-center text-sm text-slate-400 italic">${msg}</div>`;
}

// ── SIM expiry notification ───────────────────────────────────

function _checkSimExpiry(sims) {
  const warnings = sims.filter(s => s.daysUntilExpiry !== undefined && s.daysUntilExpiry <= 5);
  if (!warnings.length) return;
  const expired  = warnings.filter(s => s.isExpired);
  const expiring = warnings.filter(s => !s.isExpired);
  const parts    = [];
  if (expired.length)  parts.push(`${expired.length} SIM${expired.length > 1 ? 's' : ''} expired`);
  if (expiring.length) parts.push(`${expiring.length} SIM${expiring.length > 1 ? 's' : ''} expiring in ≤5 days`);
  const msg = parts.join(', ');
  document.getElementById('sim-expiry-msg').textContent = msg;
  document.getElementById('sim-expiry-banner')?.classList.remove('hidden');
  showToast(msg, expired.length ? 'error' : 'info');
}

// ── Clinic Toggle Modal ───────────────────────────────────────

let _clinicType = null;

function openClinicModal(type) {
  _clinicType = type;
  const labels = { pluto: 'Pluto', mars: 'Mars' };
  document.getElementById('clinic-modal-title').textContent = `Toggle Clinic — ${labels[type] || type}`;
  _setError('clinic-modal-error', '');
  document.getElementById('clinic-current-status').textContent = '';

  const sel = document.getElementById('clinic-device-select');
  sel.innerHTML = '<option value="">Select device…</option>';

  const allDevices = _inventory?.[type] || [];
  // Eligible for clinic toggle:
  //   - Currently clinic (can be cleared): no restrictions
  //   - Currently available (can be set to clinic): not assigned, not faulty/issue
  // Exclude: assigned devices, devices with issues (Issue overrides all)
  const devices = allDevices.filter(d =>
    d.clinic_only ||                                      // already clinic → can clear it
    (!d.assigned_to && !d.faulty && !d.has_issue)         // available → can set to clinic
  );

  if (!devices.length) {
    _setError('clinic-modal-error', 'No eligible devices. Devices must be Available (not assigned, not issue) to change clinic status.');
  }

  devices.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    const label = d.clinic_only ? `${d.id} — Clinic Only` : `${d.id} — Available`;
    opt.textContent = label;
    sel.appendChild(opt);
  });

  sel.onchange = () => {
    const d = devices.find(x => x.id === sel.value);
    const info = document.getElementById('clinic-current-status');
    if (d) {
      info.textContent = d.clinic_only
        ? 'Currently: Clinic Only → will become Available'
        : 'Currently: Available → will become Clinic Only (replaces any existing clinic device)';
      const btn = document.getElementById('clinic-save-btn');
      btn.textContent = d.clinic_only ? 'Mark Available' : 'Mark Clinic Only';
    } else {
      info.textContent = '';
    }
  };

  document.getElementById('clinic-modal').classList.remove('hidden');
}

function closeClinicModal() {
  document.getElementById('clinic-modal').classList.add('hidden');
}

async function saveClinicToggle() {
  const device_id = document.getElementById('clinic-device-select').value;
  if (!device_id) { _setError('clinic-modal-error', 'Please select a device.'); return; }

  const devices = _inventory?.[_clinicType] || [];
  const d = devices.find(x => x.id === device_id);
  if (!d) return;

  _setError('clinic-modal-error', '');
  try {
    const r = await fetch('/devices/api/toggle-clinic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_type: _clinicType, device_id }),
    });
    const res = await r.json();
    if (res.error) { _setError('clinic-modal-error', res.error); return; }
    closeClinicModal();
    showToast(res.clinic_only ? 'Marked as clinic-only' : 'Marked as available', 'success');
    await _refreshInventory();
  } catch (e) {
    _setError('clinic-modal-error', 'Network error — please try again.');
  }
}

// ── Issue Report Modal ────────────────────────────────────────

let _issueType = null;

function openIssueModal(type) {
  _issueType = type;
  const labels = { pluto: 'Pluto', mars: 'Mars', agwatch: 'Agwatch' };
  document.getElementById('issue-modal-title').textContent = `Report / Resolve Issue — ${labels[type] || type}`;
  _setError('issue-modal-error', '');
  document.getElementById('issue-device-info').classList.add('hidden');
  document.getElementById('issue-swap-section').classList.add('hidden');
  document.getElementById('issue-notes').value = '';

  const sel = document.getElementById('issue-device-select');
  sel.innerHTML = '<option value="">Select device…</option>';

  const devices = type === 'agwatch' ? (_inventory?.agwatch || []) : (_inventory?.[type] || []);
  // Show ALL devices (not just those with issues) so we can also resolve
  if (type === 'agwatch') {
    // Split into Left / Right optgroups
    [['Right', 'Right Watch'], ['Left', 'Left Watch']].forEach(([limb, label]) => {
      const group = document.createElement('optgroup');
      group.label = label;
      devices.filter(d => !d.lost && (d.assigned_to?.limb || d.limb_default || '').toLowerCase() === limb.toLowerCase())
        .forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.id;
          const hasIssue = d.has_issue;
          opt.textContent = hasIssue ? `${d.id} — Has Issue` : `${d.id} — OK`;
          group.appendChild(opt);
        });
      if (group.children.length) sel.appendChild(group);
    });
  } else {
    devices.filter(d => !d.lost).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      const hasIssue = d.faulty || d.has_issue;
      opt.textContent = hasIssue ? `${d.id} — Has Issue` : `${d.id} — OK`;
      sel.appendChild(opt);
    });
  }

  document.getElementById('issue-modal').classList.remove('hidden');
}

function closeIssueModal() {
  document.getElementById('issue-modal').classList.add('hidden');
}

function onIssueDeviceChange() {
  const type    = _issueType;
  const sel     = document.getElementById('issue-device-select');
  const devices = type === 'agwatch' ? (_inventory?.agwatch || []) : (_inventory?.[type] || []);
  const d = devices.find(x => x.id === sel.value);

  const infoEl  = document.getElementById('issue-device-info');
  const swapEl  = document.getElementById('issue-swap-section');
  const saveBtn = document.getElementById('issue-save-btn');

  if (!d) {
    infoEl.classList.add('hidden');
    swapEl.classList.add('hidden');
    return;
  }

  const hasIssue = d.faulty || d.has_issue;

  // Show status info
  infoEl.classList.remove('hidden');
  infoEl.innerHTML = `
    <div>Status: ${hasIssue ? '<strong class="text-red-600">Has Issue</strong>' : '<strong class="text-green-600">OK</strong>'}</div>
    ${d.assigned_to ? `<div>Assigned to: <strong>${_esc(d.assigned_to.homerID)}</strong></div>` : '<div>Not assigned</div>'}`;

  if (hasIssue) {
    saveBtn.textContent = 'Resolve Issue';
    saveBtn.className = 'px-5 py-2 text-sm font-semibold text-white bg-green-600 rounded-xl hover:bg-green-700 active:scale-95 transition-all';
    swapEl.classList.add('hidden');
  } else {
    saveBtn.textContent = 'Report Issue';
    saveBtn.className = 'px-5 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 active:scale-95 transition-all';

    // If device is assigned, offer swap (only show available devices)
    if (d.assigned_to) {
      swapEl.classList.remove('hidden');
      const allDevices = type === 'agwatch' ? (_inventory?.agwatch || []) : (_inventory?.[type] || []);
      const swapSel = document.getElementById('issue-swap-select');
      swapSel.innerHTML = '<option value="">No swap — just mark as issue</option>';
      allDevices.forEach(av => {
        if (av.id === d.id) return;
        if (av.assigned_to || av.faulty || av.has_issue || av.clinic_only || av.lost) return;
        const opt = document.createElement('option');
        opt.value = av.id;
        opt.textContent = `${av.id} (${av.serial || 'no serial'})`;
        swapSel.appendChild(opt);
      });
    } else {
      swapEl.classList.add('hidden');
    }
  }
}

async function saveIssueAction() {
  const device_id = document.getElementById('issue-device-select').value;
  if (!device_id) { _setError('issue-modal-error', 'Please select a device.'); return; }

  const devices = _issueType === 'agwatch' ? (_inventory?.agwatch || []) : (_inventory?.[_issueType] || []);
  const d = devices.find(x => x.id === device_id);
  if (!d) return;

  const hasIssue = d.faulty || d.has_issue;
  const notes    = (document.getElementById('issue-notes').value || '').trim();
  _setError('issue-modal-error', '');

  // Resolving issue
  if (hasIssue) {
    try {
      const r = await fetch('/devices/api/toggle-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_type: _issueType, device_id, has_issue: false, notes }),
      });
      const res = await r.json();
      if (res.error) { _setError('issue-modal-error', res.error); return; }
      closeIssueModal();
      showToast('Issue resolved', 'success');
      await _refreshInventory();
    } catch (e) {
      _setError('issue-modal-error', 'Network error — please try again.');
    }
    return;
  }

  // Reporting issue — check if swap requested
  const swapTo = document.getElementById('issue-swap-select')?.value || '';

  if (swapTo && d.assigned_to) {
    // Swap: marks old device faulty AND reassigns patient to new device
    try {
      const r = await fetch('/devices/api/swap-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_type: _issueType, old_device_id: device_id, new_device_id: swapTo, notes }),
      });
      const res = await r.json();
      if (res.error) { _setError('issue-modal-error', res.error); return; }
      closeIssueModal();
      showToast(`Issue reported; ${res.homer_id || 'patient'} swapped to ${swapTo}`, 'success');
      await _refreshInventory();
    } catch (e) {
      _setError('issue-modal-error', 'Network error — please try again.');
    }
  } else {
    // Just mark issue, no swap
    try {
      const r = await fetch('/devices/api/toggle-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_type: _issueType, device_id, has_issue: true, notes }),
      });
      const res = await r.json();
      if (res.error) { _setError('issue-modal-error', res.error); return; }
      closeIssueModal();
      showToast('Issue reported', 'error');
      await _refreshInventory();
    } catch (e) {
      _setError('issue-modal-error', 'Network error — please try again.');
    }
  }
}

// ── Add Device Modal (Pluto / Mars) ───────────────────────────

let _addDeviceType = 'pluto';

function openAddDeviceModal(type) {
  _addDeviceType = type;
  const labels = { pluto: 'Pluto', mars: 'Mars' };
  document.getElementById('add-device-title').textContent = `Add ${labels[type] || type} Device`;
  document.getElementById('add-device-id').value     = '';
  document.getElementById('add-device-serial').value = '';
  _setError('add-device-error', '');
  document.getElementById('add-device-modal').classList.remove('hidden');
}

function closeAddDeviceModal() {
  document.getElementById('add-device-modal').classList.add('hidden');
}

async function saveNewDevice() {
  const id     = document.getElementById('add-device-id').value.trim();
  const serial = document.getElementById('add-device-serial').value.trim();
  if (!id)     { _setError('add-device-error', 'Device ID is required.'); return; }
  if (!serial) { _setError('add-device-error', 'Serial number is required.'); return; }
  _setError('add-device-error', '');
  try {
    const r = await fetch('/devices/api/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_type: _addDeviceType, id, serial }),
    });
    const d = await r.json();
    if (d.error) { _setError('add-device-error', d.error); return; }
    closeAddDeviceModal();
    showToast(`Device ${id} added`, 'success');
    await _refreshInventory();
  } catch (e) { _setError('add-device-error', 'Network error — please try again.'); }
}

// ── Add Watch Modal ───────────────────────────────────────────

let _watchLimb = 'Right';

function openAddWatchModal(limb) {
  _watchLimb = limb;
  document.getElementById('add-watch-title').textContent = `Add ${limb} Watch`;
  document.getElementById('add-watch-limb').value  = limb;
  document.getElementById('add-watch-id').value    = '';
  document.getElementById('add-watch-serial').value = '';
  _setError('add-watch-error', '');
  document.getElementById('add-watch-modal').classList.remove('hidden');
}

function closeAddWatchModal() {
  document.getElementById('add-watch-modal').classList.add('hidden');
}

async function saveNewWatch() {
  const id     = document.getElementById('add-watch-id').value.trim();
  const serial = document.getElementById('add-watch-serial').value.trim();
  if (!id)     { _setError('add-watch-error', 'Device ID is required.'); return; }
  if (!serial) { _setError('add-watch-error', 'Serial number is required.'); return; }
  _setError('add-watch-error', '');
  try {
    const r = await fetch('/devices/api/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_type: 'agwatch', id, serial, limb_default: _watchLimb }),
    });
    const d = await r.json();
    if (d.error) { _setError('add-watch-error', d.error); return; }
    closeAddWatchModal();
    showToast(`Watch ${id} added`, 'success');
    await _refreshInventory();
  } catch (e) { _setError('add-watch-error', 'Network error — please try again.'); }
}

// ── Add Modem Modal ───────────────────────────────────────────

function openAddModemModal() {
  document.getElementById('add-modem-id').value     = '';
  document.getElementById('add-modem-serial').value = '';
  _setError('add-modem-error', '');
  const sel = document.getElementById('add-modem-sim');
  sel.innerHTML = '<option value="">None</option>';
  const linkedSimIds = new Set((_inventory?.modems || []).filter(m => m.sim_id).map(m => m.sim_id));
  for (const s of (_inventory?.sims || [])) {
    if (!linkedSimIds.has(s.id)) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.network || '?'} — ${s.phoneNumber || s.id}`;
      sel.appendChild(opt);
    }
  }
  document.getElementById('add-modem-modal').classList.remove('hidden');
}

function closeAddModemModal() {
  document.getElementById('add-modem-modal').classList.add('hidden');
}

async function saveNewModem() {
  const id     = document.getElementById('add-modem-id').value.trim();
  const serial = document.getElementById('add-modem-serial').value.trim();
  const sim_id = document.getElementById('add-modem-sim').value.trim() || null;
  if (!id)     { _setError('add-modem-error', 'Modem ID is required.'); return; }
  if (!serial) { _setError('add-modem-error', 'Serial number is required.'); return; }
  _setError('add-modem-error', '');
  try {
    const r = await fetch('/devices/api/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_type: 'modem', id, serial, sim_id }),
    });
    const d = await r.json();
    if (d.error) { _setError('add-modem-error', d.error); return; }
    closeAddModemModal();
    showToast(`Modem ${id} added`, 'success');
    await _refreshInventory();
  } catch (e) { _setError('add-modem-error', 'Network error — please try again.'); }
}

// ── Add SIM Modal ─────────────────────────────────────────────

function openAddSimModal() {
  document.getElementById('add-sim-phone').value    = '';
  document.getElementById('add-sim-network').value  = '';
  document.getElementById('add-sim-recharge').value = '';
  document.getElementById('add-sim-plan').value     = '';
  document.getElementById('add-sim-expiry').value   = '';
  document.getElementById('add-sim-expiry').readOnly = false;
  document.getElementById('add-sim-expiry-note').textContent = '';
  document.getElementById('add-sim-reminder').value = '5';
  _setError('add-sim-error', '');
  document.getElementById('add-sim-modal').classList.remove('hidden');
}

function closeAddSimModal() {
  document.getElementById('add-sim-modal').classList.add('hidden');
}

function _addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function onSimRechargeChange() {
  const plan = document.getElementById('add-sim-plan').value;
  if (plan && plan !== 'custom') {
    const recharge = document.getElementById('add-sim-recharge').value;
    if (recharge) {
      document.getElementById('add-sim-expiry').value = _addDays(recharge, parseInt(plan));
    }
  }
}

function onSimPlanChange() {
  const plan = document.getElementById('add-sim-plan').value;
  const expiryInput = document.getElementById('add-sim-expiry');
  const note = document.getElementById('add-sim-expiry-note');
  if (!plan || plan === 'custom') {
    expiryInput.readOnly = false;
    expiryInput.classList.remove('bg-slate-100');
    note.textContent = '';
  } else {
    expiryInput.readOnly = true;
    expiryInput.classList.add('bg-slate-100');
    note.textContent = '(auto-computed)';
    const recharge = document.getElementById('add-sim-recharge').value;
    if (recharge) {
      expiryInput.value = _addDays(recharge, parseInt(plan));
    }
  }
}

async function saveNewSim() {
  const phone    = document.getElementById('add-sim-phone').value.trim();
  const network  = document.getElementById('add-sim-network').value.trim();
  const recharge = document.getElementById('add-sim-recharge').value;
  const expiry   = document.getElementById('add-sim-expiry').value;
  const plan     = document.getElementById('add-sim-plan').value;
  const reminder = parseInt(document.getElementById('add-sim-reminder').value) || 5;

  if (!phone) { _setError('add-sim-error', 'Phone number is required.'); return; }
  _setError('add-sim-error', '');
  try {
    const r = await fetch('/devices/api/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_type:  'sim',
        phoneNumber:  phone,
        network,
        rechargeDate: recharge || null,
        expiryDate:   expiry   || null,
        dataPlan:     (plan && plan !== 'custom') ? plan : null,
        reminderDays: reminder,
      }),
    });
    const d = await r.json();
    if (d.error) { _setError('add-sim-error', d.error); return; }
    closeAddSimModal();
    showToast(`SIM ${phone} added`, 'success');
    await _refreshInventory();
  } catch (e) { _setError('add-sim-error', 'Network error — please try again.'); }
}

// ── Add Laptop Modal ──────────────────────────────────────────

function openAddLaptopModal() {
  document.getElementById('add-laptop-id').value     = '';
  document.getElementById('add-laptop-serial').value = '';
  _setError('add-laptop-error', '');
  document.getElementById('add-laptop-modal').classList.remove('hidden');
}

function closeAddLaptopModal() {
  document.getElementById('add-laptop-modal').classList.add('hidden');
}

async function saveNewLaptop() {
  const id     = document.getElementById('add-laptop-id').value.trim();
  const serial = document.getElementById('add-laptop-serial').value.trim();
  if (!id)     { _setError('add-laptop-error', 'Laptop ID is required.'); return; }
  if (!serial) { _setError('add-laptop-error', 'Serial number is required.'); return; }
  _setError('add-laptop-error', '');
  try {
    const r = await fetch('/devices/api/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_type: 'laptop', id, serial }),
    });
    const d = await r.json();
    if (d.error) { _setError('add-laptop-error', d.error); return; }
    closeAddLaptopModal();
    showToast(`Laptop ${id} added`, 'success');
    await _refreshInventory();
  } catch (e) { _setError('add-laptop-error', 'Network error — please try again.'); }
}

// ── Link SIM Modal ────────────────────────────────────────────

let _linkSimModemId = null;

function openLinkSimModal(modemId) {
  _linkSimModemId = modemId;
  document.getElementById('link-sim-modem-label').textContent = modemId;
  _setError('link-sim-error', '');
  const modem = (_inventory?.modems || []).find(m => m.id === modemId);
  const currentSimId = modem?.sim_id || null;
  // SIMs already linked to other modems (that are assigned to a patient) are excluded
  const assignedModemIds = new Set(
    (_inventory?.modems || []).filter(m => m.assigned_to && m.id !== modemId).map(m => m.id)
  );
  const linkedSimIds = new Set(
    (_inventory?.modems || [])
      .filter(m => m.sim_id && m.id !== modemId && assignedModemIds.has(m.id))
      .map(m => m.sim_id)
  );
  const sel = document.getElementById('link-sim-select');
  sel.innerHTML = '<option value="">None (unlink)</option>';
  for (const s of (_inventory?.sims || [])) {
    if (!linkedSimIds.has(s.id) || s.id === currentSimId) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.network || '?'} — ${s.phoneNumber || s.id}`;
      if (s.id === currentSimId) opt.selected = true;
      sel.appendChild(opt);
    }
  }
  document.getElementById('link-sim-modal').classList.remove('hidden');
}

function closeLinkSimModal() {
  document.getElementById('link-sim-modal').classList.add('hidden');
}

async function saveLinkSim() {
  const sim_id = document.getElementById('link-sim-select').value.trim() || null;
  _setError('link-sim-error', '');
  try {
    const r = await fetch('/devices/api/link-sim', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modem_id: _linkSimModemId, sim_id }),
    });
    const d = await r.json();
    if (d.error) { _setError('link-sim-error', d.error); return; }
    closeLinkSimModal();
    showToast(sim_id ? 'SIM linked' : 'SIM unlinked', 'success');
    await _refreshInventory();
  } catch (e) { _setError('link-sim-error', 'Network error — please try again.'); }
}

// ── Assign / Unassign Modem / Laptop ─────────────────────────

let _assignDeviceType = null;
let _assignDeviceId   = null;

function openAssignModal(type, deviceId) {
  _assignDeviceType = type;
  _assignDeviceId   = deviceId;
  document.getElementById('assign-device-label').textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} ${deviceId}`;
  document.getElementById('assign-patient-search').value = '';
  _setError('assign-modal-error', '');

  const sel = document.getElementById('assign-homer-select');
  sel.innerHTML = '';

  // Exclude patients already assigned to this device type
  const assignedHomerIds = new Set(
    (_inventory?.[type === 'modem' ? 'modems' : 'laptops'] || [])
      .filter(d => d.assigned_to && d.id !== deviceId)
      .map(d => d.assigned_to.homerID)
  );

  const patients = (_inventory?.patients || []).filter(p => !assignedHomerIds.has(p.homerID));
  if (!patients.length) {
    const opt = document.createElement('option');
    opt.disabled = true;
    opt.textContent = 'No eligible patients';
    sel.appendChild(opt);
  } else {
    patients.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.homerID;
      opt.textContent = `${p.homerID} — ${p.hospitalID}`;
      sel.appendChild(opt);
    });
  }

  document.getElementById('assign-modal').classList.remove('hidden');
}

function filterAssignPatients() {
  const q = document.getElementById('assign-patient-search').value.toLowerCase();
  const sel = document.getElementById('assign-homer-select');
  for (const opt of sel.options) {
    opt.hidden = q ? !opt.textContent.toLowerCase().includes(q) : false;
  }
}

function closeAssignModal() {
  document.getElementById('assign-modal').classList.add('hidden');
}

async function saveAssignDevice() {
  const homer_id = (document.getElementById('assign-homer-select').value || '').trim();
  if (!homer_id) { _setError('assign-modal-error', 'Please select a patient.'); return; }
  _setError('assign-modal-error', '');
  try {
    const r = await fetch('/devices/api/assign-device', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_type: _assignDeviceType, device_id: _assignDeviceId, homer_id }),
    });
    const res = await r.json();
    if (res.error) { _setError('assign-modal-error', res.error); return; }
    closeAssignModal();
    showToast('Device assigned', 'success');
    await _refreshInventory();
  } catch (e) { _setError('assign-modal-error', 'Network error — please try again.'); }
}

async function unassignDevice(type, deviceId) {
  if (!confirm(`Return ${type} ${deviceId} from patient?`)) return;
  try {
    const r = await fetch('/devices/api/unassign-device', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_type: type, device_id: deviceId }),
    });
    const res = await r.json();
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast('Device returned to available', 'success');
    await _refreshInventory();
  } catch (e) { showToast('Network error — please try again.', 'error'); }
}

// ── UI helpers ────────────────────────────────────────────────

function _showLoading(show) {
  document.getElementById('devices-loading').classList.toggle('hidden', !show);
  document.getElementById('devices-error').classList.add('hidden');
}

function _showError(msg) {
  document.getElementById('devices-loading').classList.add('hidden');
  document.getElementById('devices-error').classList.remove('hidden');
  document.getElementById('devices-error-msg').textContent = msg;
}

function _setError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
  else     { el.classList.add('hidden'); }
}

function _esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(message, type = 'info') {
  const colours = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600' };
  const icons   = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${colours[type] || colours.info} transition-all duration-300 opacity-0 translate-y-2`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${_esc(message)}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.remove('opacity-0', 'translate-y-2'));
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Close modals on backdrop click ────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  [
    ['add-device-modal', closeAddDeviceModal],
    ['clinic-modal',     closeClinicModal],
    ['issue-modal',      closeIssueModal],
    ['add-watch-modal',  closeAddWatchModal],
    ['add-modem-modal',  closeAddModemModal],
    ['add-sim-modal',    closeAddSimModal],
    ['add-laptop-modal', closeAddLaptopModal],
    ['link-sim-modal',   closeLinkSimModal],
  ].forEach(([id, fn]) => {
    document.getElementById(id)?.addEventListener('click', e => {
      if (e.target === e.currentTarget) fn();
    });
  });
});
