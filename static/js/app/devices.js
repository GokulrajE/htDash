/* ============================================================
   devices.js — Device, ActiGraph Watch, and SIM Management
   Location-based config, per-patient dropdowns, swap logging
   ============================================================ */

// ── State ─────────────────────────────────────────────────────
let _devConfig    = {};
let _devAssign    = { deviceSets: [], watches: [] };
let _simData      = [];
let _currentPlace = '';

// ── Bootstrap ─────────────────────────────────────────────────
async function loadDevicesPage() {
  _currentPlace = currentUser?.place || currentUser?.loginPlace || '';

  try {
    const r = await fetch('/get_userId', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `search_term=Pluto&LoginId=${currentUser.loginId}&PRIVILEGE=${currentUser.privilege}`
    });
    const d = await r.json();
    if (d.hospital_info) allPatients = d.hospital_info;
  } catch(e) { console.error('patients', e); }

  if (droppedOutPatients.size === 0) await loadDroppedOutPatients();
  await Promise.all([_fetchAssignments(), _fetchConfig(), _fetchSims()]);
  _updateStats();
  _renderDevicesCard();
  _renderWatchesCard();
  _renderSimCard();
}

async function _fetchAssignments() {
  try {
    const r = await fetch('/devices/');
    const d = await r.json();
    _devAssign = d.devices || { deviceSets: [], watches: [] };
  } catch(e) { _devAssign = { deviceSets: [], watches: [] }; }
}

async function _fetchConfig() {
  try {
    const r = await fetch(`/devices/config/${encodeURIComponent(_currentPlace)}`);
    const d = await r.json();
    _devConfig = {};
    (d.deviceSets || []).forEach(s => { _devConfig[s.setId] = s; });
  } catch(e) { _devConfig = {}; }
}

async function _fetchSims() {
  try {
    const r = await fetch('/sim_cards/');
    const d = await r.json();
    _simData = d.sims || [];
  } catch(e) { _simData = []; }
}

// ── Patient filters ───────────────────────────────────────────
function _activeExperimental() {
  return allPatients.filter(p => {
    if ((p.role || '').toLowerCase() !== 'experimental') return false;
    if (droppedOutPatients.has(p.HospitalID) || trialCompletedPatients.has(p.HospitalID) || p.discontinued) return false;
    const s = p.Status;
    return p.activated === true || (typeof s === 'object' && s && (s.pluto === 'active' || s.mars === 'active'));
  });
}

function _activeAll() {
  return allPatients.filter(p => {
    const role = (p.role || '').toLowerCase();
    if (!['experimental','control'].includes(role)) return false;
    if (droppedOutPatients.has(p.HospitalID) || trialCompletedPatients.has(p.HospitalID) || p.discontinued) return false;
    if (role === 'control') return p.activated === true || (p.vcgType || '').trim() !== '';
    const s = p.Status;
    return p.activated === true || (typeof s === 'object' && s && (s.pluto === 'active' || s.mars === 'active'));
  });
}

// ── Availability helpers ──────────────────────────────────────
function _assignedDevSets() {
  const m = {};
  (_devAssign.deviceSets || []).forEach(ds => {
    if (ds.assignedPatientId && ds.status === 'assigned') m[ds.assignedPatientId] = ds;
  });
  return m;
}

function _assignedWatches() {
  const m = {};
  (_devAssign.watches || []).forEach(w => {
    if (w.assignedPatientId && w.status === 'assigned') m[w.assignedPatientId] = w;
  });
  return m;
}

function _assignedSimNums() {
  const s = new Set();
  (_devAssign.deviceSets || []).forEach(ds => {
    if (ds.assignedPatientId && ds.simNumber) s.add(ds.simNumber);
  });
  _simData.forEach(sim => { if (sim.assignedPatientId) s.add(sim.phoneNumber); });
  return s;
}

function _availableConfigSets() {
  const used = new Set(
    (_devAssign.deviceSets || [])
      .filter(ds => ds.status === 'assigned')
      .map(ds => ds.assignedDeviceSetId || ds.setNumber)
      .filter(Boolean)
  );
  return Object.values(_devConfig).filter(c => !used.has(c.setId));
}

function _availableWatches() {
  return (_devAssign.watches || []).filter(w => w.status === 'available');
}

function _availableSims() {
  const used = _assignedSimNums();
  return _simData.filter(s => !used.has(s.phoneNumber));
}

function _isAutoReturnDue(ds) {
  if (!ds.assignmentDate) return false;
  return (new Date() - new Date(ds.assignmentDate)) / 86400000 >= 28;
}

// ── Stats ─────────────────────────────────────────────────────
function _updateStats() {
  const ds = _devAssign.deviceSets || [];
  const ws = _devAssign.watches || [];
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set('stat-sets-available',   _availableConfigSets().length);
  set('stat-sets-inuse',       ds.filter(d => d.status === 'assigned').length);
  set('stat-watches-available', ws.filter(w => w.status === 'available').length);
  set('stat-watches-inuse',    ws.filter(w => w.status === 'assigned').length);
}

// ── CARD 1: Devices ───────────────────────────────────────────
function _renderDevicesCard() {
  const container = document.getElementById('device-assignment-table');
  if (!container) return;

  const patients  = _activeExperimental();
  const assignedDS = _assignedDevSets();
  const availSets = _availableConfigSets();
  const availSims = _availableSims();

  if (patients.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-slate-400"><i class="fas fa-users text-3xl mb-2 block opacity-30"></i>No active experimental patients</div>`;
    return;
  }

  const setOpts = availSets.map(s => `<option value="${s.setId}">${s.setId} — P:${s.pluto} M:${s.mars}</option>`).join('');
  const simOpts = availSims.map(s => `<option value="${s.phoneNumber}">${s.phoneNumber} (${s.network || '—'})</option>`).join('');

  container.innerHTML = patients.map(p => {
    const cur = assignedDS[p.HospitalID];
    if (cur) {
      const due = _isAutoReturnDue(cur);
      return `
        <div class="border border-slate-100 rounded-xl p-4 bg-white" id="dev-row-${p.HospitalID}">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <span class="text-blue-700 font-bold text-xs">${p.HospitalID.slice(0,2)}</span>
              </div>
              <div>
                <p class="font-semibold text-slate-800 text-sm">${p.HospitalID}</p>
                <p class="text-xs text-slate-400">${p.trainingSide || '—'} side</p>
              </div>
            </div>
            <div class="flex flex-wrap gap-2 text-xs">
              <span class="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg font-mono">PLUTO: ${cur.plutoDeviceId || '—'}</span>
              <span class="px-2 py-1 bg-violet-50 text-violet-700 rounded-lg font-mono">MARS: ${cur.marsDeviceId || '—'}</span>
              <span class="px-2 py-1 bg-slate-50 text-slate-600 rounded-lg font-mono">Laptop: ${cur.laptopNumber || '—'}</span>
              <span class="px-2 py-1 bg-slate-50 text-slate-600 rounded-lg font-mono">Modem: ${cur.modemSerial || '—'}</span>
              <span class="px-2 py-1 bg-green-50 text-green-700 rounded-lg font-mono">SIM: ${cur.simNumber || '—'}</span>
              ${due ? `<span class="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg"><i class="fas fa-clock mr-1"></i>Return due</span>` : ''}
            </div>
            <div class="flex gap-2">
              <button onclick="_showDeviceSwapModal('${p.HospitalID}')" class="px-3 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 font-medium"><i class="fas fa-sync-alt mr-1"></i>Swap</button>
              <button onclick="_returnDeviceSet('${p.HospitalID}')" class="px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 font-medium"><i class="fas fa-undo mr-1"></i>Return</button>
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="border border-dashed border-slate-200 rounded-xl p-4 bg-slate-50" id="dev-row-${p.HospitalID}">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
            <span class="text-slate-500 font-bold text-xs">${p.HospitalID.slice(0,2)}</span>
          </div>
          <div>
            <p class="font-semibold text-slate-700 text-sm">${p.HospitalID}</p>
            <p class="text-xs text-slate-400">${p.trainingSide || '—'} side · No device assigned</p>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Device Set (Pluto + Mars + Laptop + Modem)</label>
            <select id="ds-sel-${p.HospitalID}" class="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-400">
              <option value="">— select device set —</option>
              ${setOpts || '<option disabled>No sets available</option>'}
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">SIM Card</label>
            <select id="sim-sel-${p.HospitalID}" class="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-green-400">
              <option value="">— select SIM —</option>
              ${simOpts || '<option disabled>No SIMs available</option>'}
            </select>
          </div>
        </div>
        <button onclick="_assignDeviceSet('${p.HospitalID}')" class="px-4 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"><i class="fas fa-link mr-1.5"></i>Assign Device Set</button>
      </div>`;
  }).join('');
}

async function _assignDeviceSet(patientId) {
  const setId  = document.getElementById(`ds-sel-${patientId}`)?.value;
  const simNum = document.getElementById(`sim-sel-${patientId}`)?.value;
  if (!setId) { showToast('Please select a device set', 'error'); return; }

  try {
    const r = await fetch('/devices/assign_from_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ place: _currentPlace, patientId, setId, simNumber: simNum || null })
    });
    const d = await r.json();
    if (d.status !== 'success') { showToast(d.message || 'Failed', 'error'); return; }

    if (simNum) {
      const sim = _simData.find(s => s.phoneNumber === simNum);
      if (sim) await fetch(`/sim_cards/${sim.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedPatientId: patientId, status: 'assigned' })
      });
    }

    showToast(`Device set ${setId} assigned to ${patientId}`);
    if (typeof logActivity === 'function') logActivity('ASSIGNED_DEVICE_SET', { patientId, setId, simNumber: simNum });
    await Promise.all([_fetchAssignments(), _fetchSims()]);
    _updateStats(); _renderDevicesCard(); _renderSimCard();
  } catch(e) { showToast('Network error', 'error'); }
}

async function _returnDeviceSet(patientId) {
  if (!confirm(`Return device set assigned to ${patientId}?`)) return;
  const ds = (_devAssign.deviceSets || []).find(d => d.assignedPatientId === patientId && d.status === 'assigned');
  if (!ds) { showToast('No assigned device found', 'error'); return; }
  try {
    await fetch(`/devices/device_sets/${ds.id}/return`, { method: 'POST' });
    if (ds.simNumber) {
      const sim = _simData.find(s => s.phoneNumber === ds.simNumber);
      if (sim) await fetch(`/sim_cards/${sim.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedPatientId: null, status: 'active' })
      });
    }
    showToast(`Device returned from ${patientId}`);
    await Promise.all([_fetchAssignments(), _fetchSims()]);
    _updateStats(); _renderDevicesCard(); _renderSimCard();
  } catch(e) { showToast('Network error', 'error'); }
}

function _showDeviceSwapModal(patientId) {
  const cur = _assignedDevSets()[patientId];
  if (!cur) return;
  const availSets = _availableConfigSets();
  const availSims = _availableSims();
  const setOpts = availSets.map(s => `<option value="${s.setId}">${s.setId} — P:${s.pluto} M:${s.mars}</option>`).join('');
  const simOpts = availSims.map(s => `<option value="${s.phoneNumber}">${s.phoneNumber} (${s.network || '—'})</option>`).join('');

  document.body.insertAdjacentHTML('beforeend', `
    <div id="device-swap-modal" class="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
        <div class="flex items-center justify-between mb-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><i class="fas fa-sync-alt text-amber-600"></i></div>
            <div><h3 class="text-lg font-bold text-slate-800">Swap Device</h3><p class="text-xs text-slate-500">${patientId}</p></div>
          </div>
          <button onclick="document.getElementById('device-swap-modal').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">New Device Set</label>
            <select id="swap-new-set" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400">
              <option value="">— keep current set —</option>${setOpts}
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">New SIM Card</label>
            <select id="swap-new-sim" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400">
              <option value="">— keep current SIM (${cur.simNumber || 'none'}) —</option>${simOpts}
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Reason *</label>
            <textarea id="swap-reason" rows="2" placeholder="e.g. Device malfunction..." class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400 resize-none"></textarea>
          </div>
          <div class="flex gap-3">
            <button onclick="document.getElementById('device-swap-modal').remove()" class="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm">Cancel</button>
            <button onclick="_confirmDeviceSwap('${patientId}')" class="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold"><i class="fas fa-sync-alt mr-1.5"></i>Confirm Swap</button>
          </div>
        </div>
      </div>
    </div>`);
}

async function _confirmDeviceSwap(patientId) {
  const newSetId  = document.getElementById('swap-new-set')?.value;
  const newSimNum = document.getElementById('swap-new-sim')?.value;
  const reason    = document.getElementById('swap-reason')?.value?.trim();
  if (!reason) { showToast('Please enter a reason', 'error'); return; }

  const cur = _assignedDevSets()[patientId];
  if (!cur) { showToast('No current assignment found', 'error'); return; }

  try {
    await fetch(`/devices/device_sets/${cur.id}/return`, { method: 'POST' });

    if (newSetId) {
      await fetch('/devices/assign_from_config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place: _currentPlace, patientId, setId: newSetId, simNumber: newSimNum || cur.simNumber || null })
      });

      const oldCfg = _devConfig[cur.assignedDeviceSetId || cur.setNumber] || {};
      const newCfg = _devConfig[newSetId] || {};
      for (const [dt, ov, nv] of [['pluto',oldCfg.pluto,newCfg.pluto],['mars',oldCfg.mars,newCfg.mars],['laptop',oldCfg.laptop,newCfg.laptop],['modem',oldCfg.modem,newCfg.modem]]) {
        if (ov !== nv) {
          await fetch('/devices/swap', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ patientId, deviceType: dt, oldDeviceId: ov || '—', newDeviceId: nv || '—', reason, date: new Date().toISOString().split('T')[0] })
          });
        }
      }
    }

    if (newSimNum && newSimNum !== cur.simNumber) {
      if (cur.simNumber) {
        const oldSim = _simData.find(s => s.phoneNumber === cur.simNumber);
        if (oldSim) await fetch(`/sim_cards/${oldSim.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedPatientId: null, status: 'active' }) });
      }
      const newSim = _simData.find(s => s.phoneNumber === newSimNum);
      if (newSim) await fetch(`/sim_cards/${newSim.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedPatientId: patientId, status: 'assigned' }) });
      await fetch('/devices/swap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, deviceType: 'sim', oldDeviceId: cur.simNumber || '—', newDeviceId: newSimNum, reason, date: new Date().toISOString().split('T')[0] })
      });
    }

    document.getElementById('device-swap-modal')?.remove();
    showToast('Device swap recorded');
    if (typeof logActivity === 'function') logActivity('DEVICE_SWAP', { patientId, newSetId, reason });
    await Promise.all([_fetchAssignments(), _fetchSims()]);
    _updateStats(); _renderDevicesCard(); _renderSimCard();
  } catch(e) { showToast('Network error', 'error'); }
}

// ── CARD 2: Watches ───────────────────────────────────────────
function _renderWatchesCard() {
  const container = document.getElementById('watch-assignment-table');
  if (!container) return;

  const patients = _activeAll();
  const assigned = _assignedWatches();
  const avail    = _availableWatches();
  const watchOpts = avail.map(w => `<option value="${w.id}">${w.name} — L:${w.leftSerial} R:${w.rightSerial}</option>`).join('');

  if (patients.length === 0) {
    container.innerHTML = `<div class="text-center py-10 text-slate-400"><i class="fas fa-users text-3xl mb-2 block opacity-30"></i>No active patients</div>`;
    return;
  }

  const expPats  = patients.filter(p => p.role?.toLowerCase() === 'experimental');
  const ctrlPats = patients.filter(p => p.role?.toLowerCase() === 'control');

  const row = (p) => {
    const w = assigned[p.HospitalID];
    const rc = p.role?.toLowerCase() === 'experimental' ? 'blue' : 'violet';
    if (w) return `
      <div class="flex items-center justify-between gap-3 p-3 bg-white border border-slate-100 rounded-xl flex-wrap" id="watch-row-${p.HospitalID}">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-${rc}-100 flex items-center justify-center shrink-0"><span class="text-${rc}-700 font-bold text-xs">${p.HospitalID.slice(0,2)}</span></div>
          <div><p class="font-semibold text-slate-800 text-sm">${p.HospitalID}</p><p class="text-xs text-slate-400 capitalize">${p.role}</p></div>
        </div>
        <div class="flex gap-2 text-xs">
          <span class="px-2 py-1 bg-purple-50 text-purple-700 rounded-lg font-mono">L: ${w.leftSerial}</span>
          <span class="px-2 py-1 bg-purple-50 text-purple-700 rounded-lg font-mono">R: ${w.rightSerial}</span>
        </div>
        <div class="flex gap-2">
          <button onclick="_showWatchSwapModal('${p.HospitalID}')" class="px-3 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 font-medium"><i class="fas fa-sync-alt mr-1"></i>Swap</button>
          <button onclick="_returnWatch('${p.HospitalID}')" class="px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 font-medium"><i class="fas fa-undo mr-1"></i>Return</button>
        </div>
      </div>`;
    return `
      <div class="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl flex-wrap" id="watch-row-${p.HospitalID}">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-${rc}-50 flex items-center justify-center shrink-0"><span class="text-${rc}-400 font-bold text-xs">${p.HospitalID.slice(0,2)}</span></div>
          <div><p class="font-semibold text-slate-600 text-sm">${p.HospitalID}</p><p class="text-xs text-slate-400 capitalize">${p.role} · No watch</p></div>
        </div>
        <div class="flex items-center gap-2">
          <select id="watch-sel-${p.HospitalID}" class="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-purple-400">
            <option value="">— select watch pair —</option>${watchOpts || '<option disabled>No watches available</option>'}
          </select>
          <button onclick="_assignWatch('${p.HospitalID}')" class="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold whitespace-nowrap"><i class="fas fa-link mr-1"></i>Assign</button>
        </div>
      </div>`;
  };

  let html = '';
  if (expPats.length) html += `<div class="mb-4"><div class="flex items-center gap-2 mb-2"><div class="h-px flex-1 bg-blue-100"></div><span class="text-xs font-bold text-blue-500 uppercase tracking-wider px-2"><i class="fas fa-robot mr-1"></i>Experimental (${expPats.length})</span><div class="h-px flex-1 bg-blue-100"></div></div><div class="space-y-2">${expPats.map(row).join('')}</div></div>`;
  if (ctrlPats.length) html += `<div><div class="flex items-center gap-2 mb-2"><div class="h-px flex-1 bg-violet-100"></div><span class="text-xs font-bold text-violet-500 uppercase tracking-wider px-2"><i class="fas fa-user-check mr-1"></i>Control (${ctrlPats.length})</span><div class="h-px flex-1 bg-violet-100"></div></div><div class="space-y-2">${ctrlPats.map(row).join('')}</div></div>`;
  container.innerHTML = html || `<div class="text-center py-6 text-slate-400">No active patients</div>`;
}

async function _assignWatch(patientId) {
  const watchId = document.getElementById(`watch-sel-${patientId}`)?.value;
  if (!watchId) { showToast('Please select a watch pair', 'error'); return; }
  try {
    const r = await fetch(`/devices/watches/${watchId}/assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId })
    });
    const d = await r.json();
    if (d.status !== 'success') { showToast(d.message || 'Failed', 'error'); return; }
    showToast(`Watch assigned to ${patientId}`);
    if (typeof logActivity === 'function') logActivity('ASSIGNED_WATCH', { patientId, watchId });
    await _fetchAssignments(); _updateStats(); _renderWatchesCard();
  } catch(e) { showToast('Network error', 'error'); }
}

async function _returnWatch(patientId) {
  if (!confirm(`Return watch assigned to ${patientId}?`)) return;
  const w = _assignedWatches()[patientId];
  if (!w) { showToast('No assigned watch', 'error'); return; }
  try {
    await fetch(`/devices/watches/${w.id}/return`, { method: 'POST' });
    showToast(`Watch returned from ${patientId}`);
    await _fetchAssignments(); _updateStats(); _renderWatchesCard();
  } catch(e) { showToast('Network error', 'error'); }
}

function _showWatchSwapModal(patientId) {
  const cur = _assignedWatches()[patientId];
  if (!cur) return;
  const avail = _availableWatches();
  const opts  = avail.map(w => `<option value="${w.id}">${w.name} — L:${w.leftSerial} R:${w.rightSerial}</option>`).join('');
  document.body.insertAdjacentHTML('beforeend', `
    <div id="watch-swap-modal" class="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div class="flex items-center justify-between mb-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><i class="fas fa-sync-alt text-purple-600"></i></div>
            <div><h3 class="text-lg font-bold text-slate-800">Swap Watch</h3><p class="text-xs text-slate-500">${patientId} · L:${cur.leftSerial} R:${cur.rightSerial}</p></div>
          </div>
          <button onclick="document.getElementById('watch-swap-modal').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">New Watch Pair *</label>
            <select id="watch-swap-new" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-400">
              <option value="">— select new watch pair —</option>${opts || '<option disabled>No other watches</option>'}
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Swap Date</label>
            <input type="date" id="watch-swap-date" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Reason *</label>
            <textarea id="watch-swap-reason" rows="2" placeholder="e.g. Battery low, strap damaged..." class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none"></textarea>
          </div>
          <div class="flex gap-3">
            <button onclick="document.getElementById('watch-swap-modal').remove()" class="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm">Cancel</button>
            <button onclick="_confirmWatchSwap('${patientId}')" class="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold"><i class="fas fa-sync-alt mr-1.5"></i>Confirm Swap</button>
          </div>
        </div>
      </div>
    </div>`);
  document.getElementById('watch-swap-date').valueAsDate = new Date();
}

async function _confirmWatchSwap(patientId) {
  const newWatchId = document.getElementById('watch-swap-new')?.value;
  const swapDate   = document.getElementById('watch-swap-date')?.value;
  const reason     = document.getElementById('watch-swap-reason')?.value?.trim();
  if (!newWatchId) { showToast('Please select a new watch pair', 'error'); return; }
  if (!reason)     { showToast('Please enter a reason', 'error'); return; }
  const cur = _assignedWatches()[patientId];
  if (!cur) { showToast('No current watch found', 'error'); return; }
  try {
    await fetch(`/devices/watches/${cur.id}/return`, { method: 'POST' });
    await fetch(`/devices/watches/${newWatchId}/assign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId })
    });
    await fetch('/add-swap-watch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        homerID: patientId,
        swapWatchRecord: {
          date: swapDate || new Date().toISOString().split('T')[0],
          reason,
          previousWatchId: cur.id,
          previousLeft: cur.leftSerial,
          previousRight: cur.rightSerial,
          newWatchId,
          timestamp: new Date().toISOString()
        }
      })
    });
    document.getElementById('watch-swap-modal')?.remove();
    showToast('Watch swap recorded');
    if (typeof logActivity === 'function') logActivity('WATCH_SWAP', { patientId, newWatchId, reason });
    await _fetchAssignments(); _updateStats(); _renderWatchesCard();
  } catch(e) { showToast('Network error', 'error'); }
}

// ── CARD 3: SIM Cards ─────────────────────────────────────────
function _renderSimCard() {
  const tbody = document.getElementById('sim-list-full');
  if (!tbody) return;
  if (!_simData.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400">No SIM cards added yet</td></tr>';
    return;
  }
  const today = new Date();
  const patMap = {};
  (_devAssign.deviceSets || []).forEach(ds => { if (ds.assignedPatientId && ds.simNumber) patMap[ds.simNumber] = ds.assignedPatientId; });

  tbody.innerHTML = _simData.map(sim => {
    const assignedTo = patMap[sim.phoneNumber] || sim.assignedPatientId || null;
    let badge = '<span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700 font-medium">Available</span>';
    if (assignedTo) {
      badge = `<span class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 font-medium">Assigned · ${assignedTo}</span>`;
    } else if (sim.expiryDate) {
      const days = Math.ceil((new Date(sim.expiryDate) - today) / 86400000);
      if (days < 0)       badge = '<span class="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700 font-medium">Expired</span>';
      else if (days <= 7) badge = '<span class="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-700 font-medium">Expiring Soon</span>';
    }
    return `<tr class="border-b border-slate-100 hover:bg-slate-50">
      <td class="py-3 px-2 font-mono text-sm font-medium">${sim.phoneNumber || '—'}</td>
      <td class="py-3 px-2 text-sm">${sim.network || '—'}</td>
      <td class="py-3 px-2 text-sm text-slate-500">${assignedTo || '—'}</td>
      <td class="py-3 px-2 text-sm">${sim.rechargeDate || '—'}</td>
      <td class="py-3 px-2 text-sm">${sim.expiryDate || '—'}</td>
      <td class="py-3 px-2">${badge}</td>
      <td class="py-3 px-2">
        <button onclick="showEditSimModal('${sim.id}')" class="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium mr-1"><i class="fas fa-edit mr-1"></i>Edit</button>
        <button onclick="deleteSim('${sim.id}')" class="px-2 py-1 text-xs bg-red-50 text-red-700 rounded-lg hover:bg-red-100 font-medium"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

// ── Modals ────────────────────────────────────────────────────
function showAddWatchModal() {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="watch-modal" class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-slate-800">Add ActiGraph Watch Pair</h3>
          <button onclick="document.getElementById('watch-modal').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
        </div>
        <form id="watch-form" class="space-y-4">
          <div><label class="block text-sm font-medium text-slate-700 mb-1">Watch Name *</label><input type="text" id="watch-name" required class="w-full px-3 py-2 border border-slate-200 rounded-lg" placeholder="e.g., Watch 1"></div>
          <div><label class="block text-sm font-medium text-slate-700 mb-1">Left Serial *</label><input type="text" id="watch-left-serial" required class="w-full px-3 py-2 border border-slate-200 rounded-lg"></div>
          <div><label class="block text-sm font-medium text-slate-700 mb-1">Right Serial *</label><input type="text" id="watch-right-serial" required class="w-full px-3 py-2 border border-slate-200 rounded-lg"></div>
          <div class="flex items-center gap-2"><input type="checkbox" id="watch-backup" class="w-4 h-4 accent-purple-600"><label for="watch-backup" class="text-sm text-slate-600">Is Backup Watch</label></div>
          <div class="flex gap-3 pt-2">
            <button type="button" onclick="document.getElementById('watch-modal').remove()" class="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" class="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Save</button>
          </div>
        </form>
      </div>
    </div>`);
}

function showAddSimModal() {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="sim-modal" class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-slate-800">Add SIM Card</h3>
          <button onclick="document.getElementById('sim-modal').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
        </div>
        <form id="sim-form" class="space-y-4">
          <div><label class="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label><input type="text" id="sim-phone" required class="w-full px-3 py-2 border border-slate-200 rounded-lg"></div>
          <div><label class="block text-sm font-medium text-slate-700 mb-1">Network *</label>
            <select id="sim-network" required class="w-full px-3 py-2 border border-slate-200 rounded-lg">
              <option value="">Select network</option>
              <option>Airtel</option><option>Jio</option><option>Vodafone Idea</option><option>BSNL</option>
            </select>
          </div>
          <div><label class="block text-sm font-medium text-slate-700 mb-1">Recharge Date</label><input type="date" id="sim-recharge-date" class="w-full px-3 py-2 border border-slate-200 rounded-lg" onchange="calculateSimExpiry()"></div>
          <div><label class="block text-sm font-medium text-slate-700 mb-1">Data Plan</label>
            <select id="sim-data-plan" class="w-full px-3 py-2 border border-slate-200 rounded-lg" onchange="calculateSimExpiry()">
              <option value="">Select plan</option><option value="28">28 Days</option><option value="56">56 Days</option><option value="84">84 Days</option><option value="365">365 Days</option>
            </select>
          </div>
          <div><label class="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label><input type="date" id="sim-expiry-date" class="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50" readonly></div>
          <div class="flex gap-3 pt-2">
            <button type="button" onclick="document.getElementById('sim-modal').remove()" class="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600">Cancel</button>
            <button type="submit" class="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Save SIM</button>
          </div>
        </form>
      </div>
    </div>`);
}

function calculateSimExpiry() {
  const rd = document.getElementById('sim-recharge-date')?.value;
  const pd = document.getElementById('sim-data-plan')?.value;
  const ei = document.getElementById('sim-expiry-date');
  if (rd && pd && ei) { const d = new Date(rd); d.setDate(d.getDate() + parseInt(pd)); ei.value = d.toISOString().split('T')[0]; }
}

async function showEditSimModal(simId) {
  await _fetchSims();
  const sim = _simData.find(s => s.id === simId);
  if (!sim) { showToast('SIM not found', 'error'); return; }
  document.body.insertAdjacentHTML('beforeend', `
    <div id="edit-sim-modal" class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-slate-800">Edit SIM Card</h3>
          <button onclick="document.getElementById('edit-sim-modal').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
        </div>
        <form id="edit-sim-form" class="space-y-4">
          <input type="hidden" id="edit-sim-id" value="${sim.id}">
          <div><label class="block text-sm font-medium text-slate-700 mb-1">Phone Number</label><input type="text" id="edit-sim-phone" value="${sim.phoneNumber || ''}" class="w-full px-3 py-2 border border-slate-200 rounded-lg"></div>
          <div><label class="block text-sm font-medium text-slate-700 mb-1">Network</label>
            <select id="edit-sim-network" class="w-full px-3 py-2 border border-slate-200 rounded-lg">
              ${['Airtel','Jio','Vodafone Idea','BSNL'].map(n => `<option${sim.network===n?' selected':''}>${n}</option>`).join('')}
            </select>
          </div>
          <div><label class="block text-sm font-medium text-slate-700 mb-1">Recharge Date</label><input type="date" id="edit-sim-recharge" value="${sim.rechargeDate || ''}" class="w-full px-3 py-2 border border-slate-200 rounded-lg"></div>
          <div><label class="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label><input type="date" id="edit-sim-expiry" value="${sim.expiryDate || ''}" class="w-full px-3 py-2 border border-slate-200 rounded-lg"></div>
          <div class="flex gap-3 pt-2">
            <button type="button" onclick="document.getElementById('edit-sim-modal').remove()" class="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600">Cancel</button>
            <button type="submit" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
          </div>
        </form>
      </div>
    </div>`);
}

async function deleteSim(simId) {
  if (!confirm('Delete this SIM card?')) return;
  try {
    const r = await fetch(`/sim_cards/${simId}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.status === 'success') { showToast('SIM deleted'); await _fetchSims(); _renderSimCard(); }
    else showToast(d.message || 'Failed', 'error');
  } catch(e) { showToast('Network error', 'error'); }
}

// ── Form submissions ──────────────────────────────────────────
document.addEventListener('submit', async function(e) {
  if (e.target.id === 'watch-form') {
    e.preventDefault();
    const r = await fetch('/devices/watches', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: document.getElementById('watch-name').value, leftSerial: document.getElementById('watch-left-serial').value, rightSerial: document.getElementById('watch-right-serial').value, isBackup: document.getElementById('watch-backup').checked }) });
    const d = await r.json();
    if (d.status === 'success') { document.getElementById('watch-modal').remove(); showToast('Watch added'); await _fetchAssignments(); _updateStats(); _renderWatchesCard(); }
    else showToast(d.message || 'Error', 'error');
  }
  if (e.target.id === 'sim-form') {
    e.preventDefault();
    const r = await fetch('/sim_cards/', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: document.getElementById('sim-phone').value, network: document.getElementById('sim-network').value, rechargeDate: document.getElementById('sim-recharge-date').value, expiryDate: document.getElementById('sim-expiry-date').value, dataPlan: document.getElementById('sim-data-plan').value }) });
    const d = await r.json();
    if (d.status === 'success') { document.getElementById('sim-modal').remove(); showToast('SIM added'); await _fetchSims(); _renderDevicesPage(); }
    else showToast(d.message || 'Error', 'error');
  }
  if (e.target.id === 'edit-sim-form') {
    e.preventDefault();
    const simId = document.getElementById('edit-sim-id').value;
    const r = await fetch(`/sim_cards/${simId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: document.getElementById('edit-sim-phone').value, network: document.getElementById('edit-sim-network').value, rechargeDate: document.getElementById('edit-sim-recharge').value, expiryDate: document.getElementById('edit-sim-expiry').value }) });
    const d = await r.json();
    if (d.status === 'success') { document.getElementById('edit-sim-modal').remove(); showToast('SIM updated'); await _fetchSims(); _renderSimCard(); }
    else showToast(d.message || 'Error', 'error');
  }
});

// ── Shared utilities ──────────────────────────────────────────
async function loadDroppedOutPatients() {
  try {
    droppedOutPatients = new Set();
    const r = await fetch('/patient_events/dropped_patients');
    const d = await r.json();
    if (d.status === 'success' && d.droppedPatients) {
      d.droppedPatients.forEach(id => {
        const pt = allPatients.find(p => p.HospitalID === id);
        const role = (pt?.role || '').toLowerCase().trim();
        if (!pt || (role !== '' && role !== 'unassigned')) droppedOutPatients.add(id);
      });
    }
    const el = document.getElementById('count-dropped');
    if (el) el.textContent = droppedOutPatients.size;
  } catch(e) {}
  try {
    trialCompletedPatients = new Set();
    const r = await fetch('/patient_events/trial_completed_patients');
    const d = await r.json();
    if (d.status === 'success' && d.completedPatients) d.completedPatients.forEach(id => trialCompletedPatients.add(id));
  } catch(e) {}
}

function loadDevices()  {}
function loadSimCount() { fetch('/sim_cards/').then(r=>r.json()).then(d=>{ const e=document.getElementById('sim-total-count'); if(e) e.textContent=(d.sims||[]).length; }).catch(()=>{}); }
function loadSimsPage() { _renderSimCard(); }
function showAddDeviceSetModal() { showToast('Device sets load from location config — no manual entry needed', 'info'); }
function showAddDeviceModal() { showAddDeviceSetModal(); }
