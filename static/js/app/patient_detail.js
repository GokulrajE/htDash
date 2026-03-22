/* ============================================================
   patient_detail.js — Patient detail page: overview, tabs, modals
   PATIENT_HOMER_ID is set inline by the template.
   ============================================================ */

let patientData = null;
let isAdmin = false;
let eventsCache = [];

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  unassigned:          'Unassigned',
  inactive:            'Inactive',
  active:              'Active',
  paused:              'Paused',
  broken_protocol:     'Broken Protocol',
  training_completed:  'Training Complete',
  a1_completed:        'A1 Complete',
  all_completed:       'All Complete',
  pre_discontinued:    'Pre-Discontinued',
  discontinued:        'Discontinued',
};

const STATUS_CLASS = {
  unassigned:          'bg-slate-100 text-slate-600',
  inactive:            'bg-yellow-100 text-yellow-700',
  active:              'bg-blue-100 text-blue-700',
  paused:              'bg-amber-100 text-amber-700',
  broken_protocol:     'bg-red-100 text-red-700',
  training_completed:  'bg-teal-100 text-teal-700',
  a1_completed:        'bg-violet-100 text-violet-700',
  all_completed:       'bg-green-100 text-green-700',
  pre_discontinued:    'bg-orange-100 text-orange-700',
  discontinued:        'bg-red-100 text-red-700',
};

const GROUP_CLASS = {
  experimental: 'text-blue-700',
  control:      'text-teal-700',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return iso.replace('T', ' ');
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('border-blue-600',  active);
    btn.classList.toggle('text-blue-600',    active);
    btn.classList.toggle('border-transparent', !active);
    btn.classList.toggle('text-slate-500',   !active);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('hidden', pane.id !== `tab-${tab}`);
  });
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function showModal(id) {
  const m = document.getElementById(id);
  if (m) m.style.display = 'flex';
}

function hideModal(id) {
  const m = document.getElementById(id);
  if (m) m.style.display = 'none';
}

function setError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
  else      { el.textContent = '';  el.classList.add('hidden'); }
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : btn.dataset.label;
}

// ── API helper ────────────────────────────────────────────────────────────────

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json().then(data => ({ ok: res.ok, data }));
}

// ── Render overview ───────────────────────────────────────────────────────────

function renderOverview(p) {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };

  set('info-homer-id',      p.homerID);
  set('info-hospital-id',   p.hospitalID);
  set('info-training-side', p.trainingSide);
  set('info-enroll-date',   fmtDate(p.enrollDate));

  const groupEl = document.getElementById('info-group');
  if (groupEl) {
    groupEl.textContent = p.group ? p.group.charAt(0).toUpperCase() + p.group.slice(1) : '—';
    groupEl.className = `text-sm font-semibold ${GROUP_CLASS[p.group] || 'text-slate-800'}`;
  }

  const statusEl = document.getElementById('info-status');
  if (statusEl) {
    const label = STATUS_LABEL[p.status] || p.status;
    const cls   = STATUS_CLASS[p.status]  || 'bg-slate-100 text-slate-600';
    statusEl.innerHTML = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}">${label}</span>`;
  }

  // Subtitle
  const sub = document.getElementById('patient-subtitle');
  if (sub) {
    const label = STATUS_LABEL[p.status] || p.status;
    const cls   = STATUS_CLASS[p.status]  || 'bg-slate-100 text-slate-600';
    sub.innerHTML = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}">${label}</span>`;
  }

  set('date-a0',             fmtDate(p.a0CompletionDate));
  set('date-activation',     fmtDate(p.activationDate));
  set('date-training',       fmtDate(p.trainingCompletionDate));
  set('date-a1',             fmtDate(p.a1CompletionDate));
  set('date-a2',             fmtDate(p.a2CompletionDate));
  set('date-discontinuation',fmtDate(p.discontinuationDate));

  // Days elapsed counter
  const terminal  = new Set(['discontinued', 'all_completed', 'pre_discontinued']);
  const daysCard  = document.getElementById('days-card');
  if (daysCard) {
    if (terminal.has(p.status)) {
      daysCard.classList.add('hidden');
    } else {
      let display = '—';
      if (p.activationDate) {
        const today = new Date(); today.setHours(0,0,0,0);
        const ref   = new Date(p.activationDate); ref.setHours(0,0,0,0);
        const days  = Math.floor((today - ref) / 86400000) + 1;
        if (days > 0) display = days;
      }
      document.getElementById('days-elapsed-number').textContent = display;
      document.getElementById('days-elapsed-label').textContent  = 'Days Since Activation';
      daysCard.classList.remove('hidden');
    }
  }

  // Show VCG tab for control group only
  const vcgBtn = document.getElementById('tab-btn-vcg');
  if (vcgBtn) vcgBtn.classList.toggle('hidden', p.group !== 'control');

  renderActions(p);
}

// ── Action buttons ────────────────────────────────────────────────────────────

const ACTION_DEFS = {
  inactive: [
    { label: 'Activate',          color: 'bg-blue-600 hover:bg-blue-700 text-white',   action: () => openActivationModal(null) },
    { label: 'Discontinue',       color: 'bg-red-100 hover:bg-red-200 text-red-700',   action: () => openDiscontinueModal() },
  ],
  active: [
    { label: 'Complete Training', color: 'bg-teal-600 hover:bg-teal-700 text-white',   action: () => openCompleteTrainingModal() },
    { label: 'Discontinue',       color: 'bg-red-100 hover:bg-red-200 text-red-700',   action: () => openDiscontinueModal() },
  ],
  paused: [
    { label: 'Discontinue',       color: 'bg-red-100 hover:bg-red-200 text-red-700',   action: () => openDiscontinueModal() },
  ],
  broken_protocol: [
    { label: 'Discontinue',       color: 'bg-red-100 hover:bg-red-200 text-red-700',   action: () => openDiscontinueModal() },
  ],
  training_completed: [
    { label: 'Record A1',         color: 'bg-violet-600 hover:bg-violet-700 text-white', action: () => openA1Modal() },
    { label: 'Discontinue',       color: 'bg-red-100 hover:bg-red-200 text-red-700',   action: () => openDiscontinueModal() },
  ],
  a1_completed: [
    { label: 'Record A2',         color: 'bg-green-600 hover:bg-green-700 text-white', action: () => openA2Modal() },
    { label: 'Discontinue',       color: 'bg-red-100 hover:bg-red-200 text-red-700',   action: () => openDiscontinueModal() },
  ],
};

function renderActions(p) {
  const card    = document.getElementById('actions-card');
  const buttons = document.getElementById('action-buttons');
  if (!card || !buttons) return;

  const defs = ACTION_DEFS[p.status];
  if (!defs || !isAdmin) { card.classList.add('hidden'); return; }

  card.classList.remove('hidden');
  buttons.innerHTML = '';
  defs.forEach(def => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${def.color}`;
    btn.textContent = def.label;
    btn.addEventListener('click', def.action);
    buttons.appendChild(btn);
  });
}

// ── Modal openers ─────────────────────────────────────────────────────────────

function openCompleteTrainingModal() {
  document.getElementById('complete-training-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('complete-training-date').value = '';
  setError('complete-training-error', '');
  showModal('complete-training-modal');
}

function openA1Modal() {
  document.getElementById('a1-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('a1-date').value = '';
  setError('a1-error', '');
  showModal('a1-modal');
}

function openA2Modal() {
  document.getElementById('a2-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('a2-date').value = '';
  setError('a2-error', '');
  showModal('a2-modal');
}

function openDiscontinueModal() {
  document.getElementById('discontinue-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('discontinue-reason').value = '';
  setError('discontinue-error', '');
  showModal('discontinue-modal');
}

// ── Modal submitters ──────────────────────────────────────────────────────────

async function submitCompleteTraining() {
  const date = document.getElementById('complete-training-date').value;
  if (!date) { setError('complete-training-error', 'Please select a completion date.'); return; }
  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/complete-training`, { trainingCompletionDate: date });
  if (!ok) { setError('complete-training-error', data.error || 'Failed to complete training.'); return; }
  hideModal('complete-training-modal');
  loadPatient();
}

async function submitA1() {
  const date = document.getElementById('a1-date').value;
  if (!date) { setError('a1-error', 'Please select an A1 assessment date.'); return; }
  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/a1`, { a1CompletionDate: date });
  if (!ok) { setError('a1-error', data.error || 'Failed to record A1.'); return; }
  hideModal('a1-modal');
  loadPatient();
}

async function submitA2() {
  const date = document.getElementById('a2-date').value;
  if (!date) { setError('a2-error', 'Please select an A2 assessment date.'); return; }
  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/a2`, { a2CompletionDate: date });
  if (!ok) { setError('a2-error', data.error || 'Failed to record A2.'); return; }
  hideModal('a2-modal');
  loadPatient();
}

async function submitDiscontinue() {
  const reason = document.getElementById('discontinue-reason').value.trim();
  if (!reason) { setError('discontinue-error', 'Please enter a reason.'); return; }
  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/discontinue`, { reason });
  if (!ok) { setError('discontinue-error', data.error || 'Failed to discontinue patient.'); return; }
  hideModal('discontinue-modal');
  loadPatient();
}

// ── Patient events ────────────────────────────────────────────────────────────

async function loadPatientEvents() {
  const overdueEl  = document.getElementById('patient-overdue-events');
  const upcomingEl = document.getElementById('patient-upcoming-events');
  try {
    const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/events`);
    if (!res.ok) throw new Error('Failed to load events');
    const { overdue, upcoming } = await res.json();
    eventsCache = [...overdue, ...upcoming];

    document.getElementById('patient-overdue-count').textContent  = overdue.length;
    document.getElementById('patient-upcoming-count').textContent = upcoming.length;

    overdueEl.innerHTML  = overdue.length  ? overdue.map(patientEventRow).join('')
                                           : emptyEventState('check-circle', 'text-green-500', 'No overdue events');
    upcomingEl.innerHTML = upcoming.length ? upcoming.map(patientEventRow).join('')
                                           : emptyEventState('calendar-check', 'text-slate-400', 'No upcoming events');
  } catch (e) {
    console.error('Error loading patient events:', e);
    overdueEl.innerHTML  = '<p class="text-xs text-red-500 text-center py-4">Error loading events</p>';
    upcomingEl.innerHTML = '<p class="text-xs text-red-500 text-center py-4">Error loading events</p>';
  }
}

// Map protocol_event_id → opener function name
const EVENT_OPENERS = {
  exp_device_install:       (ev) => openDeviceSetupModal(ev.id),
  activation:               (ev) => openActivationModal(ev.id),
  discontinuation_reminder: (_ev) => openDiscontinueModal(),
  adl_prescription_d1:      (ev) => openAdlPrescriptionModal(ev),
  adl_prescription_d15:     (ev) => openAdlPrescriptionModal(ev),
  vcg_prescription_d1:      (ev) => openVcgPrescriptionModal(ev),
  vcg_prescription_d15:     (ev) => openVcgPrescriptionModal(ev),
};

function patientEventRow(ev) {
  const d = new Date(ev.scheduled_date);
  const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const isOverdue = ev.days < 0;
  const abs = Math.abs(ev.days);
  const whenLabel = ev.days === 0 ? 'Today'
                  : isOverdue    ? `${abs}d overdue`
                  : ev.days === 1 ? 'Tomorrow'
                  : `In ${ev.days} days`;
  const urgency   = isOverdue || ev.days === 0 ? 'border-red-200 bg-red-50'
                  : ev.days <= 2 ? 'border-orange-200 bg-orange-50'
                  : 'border-slate-100 bg-slate-50';
  const textColor = isOverdue || ev.days === 0 ? 'text-red-600'
                  : ev.days <= 2 ? 'text-orange-600' : 'text-slate-500';

  const blocked   = ev.blocked_by && ev.blocked_by.length > 0;
  const hasOpener = !!EVENT_OPENERS[ev.protocol_event_id];
  const clickable = hasOpener && !blocked;
  const tag       = clickable ? 'a' : 'div';
  const href      = clickable ? `href="?action=${ev.id}"` : '';
  const extra     = clickable ? 'cursor-pointer hover:shadow-md transition-shadow' : '';
  const subtitle  = `<div class="text-xs text-slate-500 mt-0.5">${dateStr}</div>`;
  const eventName = blocked
    ? `<div class="font-medium text-slate-800 text-sm truncate flex items-center gap-1"><i class="fas fa-lock text-slate-400 text-[10px]"></i>${ev.event_name}</div>`
    : `<div class="font-medium text-slate-800 text-sm truncate">${ev.event_name}</div>`;
  const rightLabel = blocked
    ? `<span class="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">Needs: ${ev.blocked_by[0]}</span>`
    : `<span class="text-xs font-semibold ${textColor} whitespace-nowrap flex-shrink-0">${whenLabel}</span>`;

  return `
    <${tag} ${href} class="flex items-center justify-between px-3 py-2.5 rounded-xl border ${urgency} ${extra} gap-3">
      <div class="min-w-0">
        ${eventName}
        ${subtitle}
      </div>
      ${rightLabel}
    </${tag}>`;
}


function emptyEventState(icon, colorClass, msg) {
  return `<div class="flex flex-col items-center justify-center py-6 ${colorClass}"><i class="fas fa-${icon} text-xl mb-1.5"></i><p class="text-xs">${msg}</p></div>`;
}

// ── Device setup modal ────────────────────────────────────────────────────────

let _deviceSetupEventId = null;

async function openDeviceSetupModal(ev) {
  _deviceSetupEventId = typeof ev === 'object' ? ev.id : ev;
  document.getElementById('device-setup-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('device-setup-date').value = '';
  document.getElementById('device-setup-demo').checked = false;
  document.getElementById('device-setup-notes').value = '';
  setError('device-setup-error', '');

  const plutoSel = document.getElementById('device-setup-pluto');
  const marsSel  = document.getElementById('device-setup-mars');
  plutoSel.innerHTML = '<option value="">Loading…</option>';
  marsSel.innerHTML  = '<option value="">Loading…</option>';
  showModal('device-setup-modal');

  try {
    const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/available-devices`);
    const { pluto, mars } = await res.json();
    plutoSel.innerHTML = '<option value="">Select Pluto device…</option>' +
      pluto.map(d => `<option value="${d.id}">${d.id} (${d.serial})</option>`).join('');
    marsSel.innerHTML  = '<option value="">Select Mars device…</option>' +
      mars.map(d => `<option value="${d.id}">${d.id} (${d.serial})</option>`).join('');
    if (!pluto.length) plutoSel.innerHTML = '<option value="">No devices available</option>';
    if (!mars.length)  marsSel.innerHTML  = '<option value="">No devices available</option>';
  } catch (e) {
    setError('device-setup-error', 'Failed to load available devices.');
  }
}

async function submitDeviceSetup() {
  const eventDate = document.getElementById('device-setup-date').value;
  const plutoId   = document.getElementById('device-setup-pluto').value;
  const marsId    = document.getElementById('device-setup-mars').value;
  const demoDone  = document.getElementById('device-setup-demo').checked;
  const notes     = document.getElementById('device-setup-notes').value;

  if (!eventDate) { setError('device-setup-error', 'Please select an event date.'); return; }
  if (!plutoId)   { setError('device-setup-error', 'Please select a Pluto device.'); return; }
  if (!marsId)    { setError('device-setup-error', 'Please select a Mars device.'); return; }

  setLoading('device-setup-submit', true);
  const { ok, data } = await apiPost(
    `/api/patients/${PATIENT_HOMER_ID}/complete-event/exp_device_install`,
    { event_id: _deviceSetupEventId, eventDate, plutoId, marsId, demoDone, notes }
  );
  setLoading('device-setup-submit', false);

  if (!ok) { setError('device-setup-error', data.error || 'Failed to complete device setup.'); return; }
  hideModal('device-setup-modal');
  loadPatientEvents();
}

// ── Activation modal ──────────────────────────────────────────────────────────

let _activationEventId = null;

async function openActivationModal(evId) {
  _activationEventId = typeof evId === 'object' ? evId.id : evId;
  document.getElementById('activation-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('activation-date').value = '';
  document.getElementById('activation-notes').value = '';
  setError('activation-error', '');

  // Show VCG group row for control patients only
  const vcgRow = document.getElementById('activation-vcg-group-row');
  const vcgSel = document.getElementById('activation-vcg-group');
  const isControl = patientData?.group === 'control';
  if (vcgRow) vcgRow.classList.toggle('hidden', !isControl);
  if (vcgSel) vcgSel.value = '';

  const affectedSel   = document.getElementById('activation-watch-right');
  const unaffectedSel = document.getElementById('activation-watch-left');
  affectedSel.innerHTML   = '<option value="">Loading…</option>';
  unaffectedSel.innerHTML = '<option value="">Loading…</option>';
  showModal('activation-modal');

  try {
    const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/available-agwatches`);
    const { agwatch } = await res.json();

    function buildWatchOpts(watches, excludeId) {
      if (!watches.length) return '<option value="" disabled>No watches available</option>';
      return '<option value="">Select watch…</option>' +
        watches.filter(d => d.id !== excludeId)
               .map(d => `<option value="${d.id}">${d.id} (${d.serial})</option>`)
               .join('');
    }

    affectedSel.innerHTML   = buildWatchOpts(agwatch, null);
    unaffectedSel.innerHTML = buildWatchOpts(agwatch, null);

    affectedSel.addEventListener('change', () => {
      const prev = unaffectedSel.value;
      unaffectedSel.innerHTML = buildWatchOpts(agwatch, affectedSel.value);
      if (prev && prev !== affectedSel.value) unaffectedSel.value = prev;
    });
    unaffectedSel.addEventListener('change', () => {
      const prev = affectedSel.value;
      affectedSel.innerHTML = buildWatchOpts(agwatch, unaffectedSel.value);
      if (prev && prev !== unaffectedSel.value) affectedSel.value = prev;
    });
  } catch (e) {
    setError('activation-error', 'Failed to load available watches.');
  }
}

async function submitActivation() {
  const activationDate = document.getElementById('activation-date').value;
  const agWatchRightId = document.getElementById('activation-watch-right').value;
  const agWatchLeftId  = document.getElementById('activation-watch-left').value;
  const notes          = document.getElementById('activation-notes').value;

  if (!activationDate)  { setError('activation-error', 'Please select an activation date.'); return; }
  if (!agWatchRightId)  { setError('activation-error', 'Please select a watch for the right limb.'); return; }
  if (!agWatchLeftId)   { setError('activation-error', 'Please select a watch for the left limb.'); return; }
  if (agWatchRightId === agWatchLeftId) { setError('activation-error', 'Right and left limb watches must be different.'); return; }

  const body = { activationDate, agWatchRightID: agWatchRightId, agWatchLeftID: agWatchLeftId, notes };
  if (patientData?.group === 'control') {
    const vcgGroup = document.getElementById('activation-vcg-group').value;
    if (!vcgGroup) { setError('activation-error', 'Please select a VCG group.'); return; }
    body.vcgGroup = vcgGroup;
  }

  setLoading('activation-submit', true);
  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/activate`, body);
  setLoading('activation-submit', false);

  if (!ok) { setError('activation-error', data.error || 'Failed to activate patient.'); return; }
  hideModal('activation-modal');
  await loadPatient();
  loadPatientEvents();
}

// ── Prescription modals (shared helpers) ──────────────────────────────────────

let _adlPrescEventId = null;
let _adlExercises    = [];
let _adlSelected     = [];  // { exercise, blocks, reps, notes, state: 'editing'|'compact' }

let _vcgPrescEventId = null;
let _vcgExercises    = [];
let _vcgSelected     = [];  // { exercise, blocks, reps, notes, state: 'editing'|'compact' }

const VCG_GROUP_LABELS = { vcg2: 'VCG 2', vcg3: 'VCG 3', vcg4_5: 'VCG 4–5' };

function _prescState(prefix) {
  return prefix === 'adl'
    ? { evId: _adlPrescEventId, exercises: _adlExercises, selected: _adlSelected }
    : { evId: _vcgPrescEventId, exercises: _vcgExercises, selected: _vcgSelected };
}

// Flush current editing-state DOM inputs into the data array.
// Must be called before any operation that changes array indices.
function _saveDOMValues(prefix) {
  const selected = prefix === 'adl' ? _adlSelected : _vcgSelected;
  selected.forEach((s, i) => {
    if (s.state !== 'editing') return;
    const blocksEl = document.getElementById(`${prefix}-blocks-${i}`);
    const repsEl   = document.getElementById(`${prefix}-reps-${i}`);
    const notesEl  = document.getElementById(`${prefix}-notes-${i}`);
    if (blocksEl) s.blocks = +blocksEl.value || s.blocks;
    if (repsEl)   s.reps   = +repsEl.value   || s.reps;
    if (notesEl)  s.notes  = notesEl.value;
  });
}

function _updatePrescSubmitBtn(prefix) {
  const selected = prefix === 'adl' ? _adlSelected : _vcgSelected;
  const btn = document.getElementById(`${prefix}-prescription-submit`);
  if (!btn) return;
  const anyEditing = selected.some(s => s.state === 'editing');
  btn.disabled = anyEditing;
  btn.classList.toggle('opacity-50', anyEditing);
  btn.classList.toggle('cursor-not-allowed', anyEditing);
}

function renderPrescSelected(prefix) {
  const { selected } = _prescState(prefix);
  const container = document.getElementById(`${prefix}-prescription-selected`);
  if (!container) return;
  if (!selected.length) {
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-3">No exercises selected. Use the search bar above to add exercises.</p>';
    _updatePrescSubmitBtn(prefix);
    return;
  }
  container.innerHTML = selected.map((s, i) => {
    if (s.state === 'editing') {
      return `
        <div class="border-2 border-blue-300 rounded-xl p-3 bg-blue-50">
          <div class="flex items-start justify-between mb-2">
            <span class="text-sm font-semibold text-slate-800">
              <span class="text-blue-500 mr-1">${i + 1}.</span>${s.exercise.name}
            </span>
            <button type="button" onclick="removeExercise('${prefix}',${i})"
                    class="text-slate-400 hover:text-red-500 ml-2 flex-shrink-0">
              <i class="fas fa-times text-sm"></i>
            </button>
          </div>
          <div class="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label class="block text-xs text-slate-500 mb-1">Blocks</label>
              <input id="${prefix}-blocks-${i}" type="number" min="1" value="${s.blocks}"
                     class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">Repetitions</label>
              <input id="${prefix}-reps-${i}" type="number" min="1" value="${s.reps}"
                     class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
          </div>
          <textarea id="${prefix}-notes-${i}" rows="2" placeholder="Notes for this exercise…"
                    class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none">${s.notes}</textarea>
          <div class="mt-2 flex justify-end">
            <button type="button" onclick="saveExercise('${prefix}',${i})"
                    class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg">
              Save
            </button>
          </div>
        </div>`;
    } else {
      return `
        <div class="border border-slate-200 rounded-xl px-4 py-3 bg-white flex items-center gap-3">
          <span class="flex-1 text-sm font-medium text-slate-800">
            <span class="text-slate-400 mr-1">${i + 1}.</span>${s.exercise.name}
          </span>
          <span class="text-xs text-slate-500 whitespace-nowrap">${s.blocks} blocks × ${s.reps} reps</span>
          <button type="button" onclick="editExercise('${prefix}',${i})"
                  class="text-slate-400 hover:text-blue-600 text-xs font-medium px-2 py-1 rounded border border-slate-200 hover:border-blue-300">
            Edit
          </button>
          <button type="button" onclick="removeExercise('${prefix}',${i})"
                  class="text-slate-400 hover:text-red-500 flex-shrink-0">
            <i class="fas fa-times text-sm"></i>
          </button>
        </div>`;
    }
  }).join('');
  _updatePrescSubmitBtn(prefix);
}

function saveExercise(prefix, i) {
  const selected = prefix === 'adl' ? _adlSelected : _vcgSelected;
  const s = selected[i];
  if (!s) return;
  const blocksEl = document.getElementById(`${prefix}-blocks-${i}`);
  const repsEl   = document.getElementById(`${prefix}-reps-${i}`);
  const notesEl  = document.getElementById(`${prefix}-notes-${i}`);
  const blocks = blocksEl ? (+blocksEl.value || 0) : s.blocks;
  const reps   = repsEl   ? (+repsEl.value   || 0) : s.reps;
  if (!blocks || !reps) {
    if (blocksEl && !+blocksEl.value) blocksEl.classList.add('border-red-400');
    if (repsEl   && !+repsEl.value)   repsEl.classList.add('border-red-400');
    return;
  }
  s.blocks = blocks;
  s.reps   = reps;
  s.notes  = notesEl ? notesEl.value : s.notes;
  s.state  = 'compact';
  renderPrescSelected(prefix);
}

function editExercise(prefix, i) {
  const selected = prefix === 'adl' ? _adlSelected : _vcgSelected;
  if (!selected[i]) return;
  selected[i].state = 'editing';
  renderPrescSelected(prefix);
}

function removeExercise(prefix, i) {
  const selected  = prefix === 'adl' ? _adlSelected : _vcgSelected;
  const container = document.getElementById(`${prefix}-prescription-selected`);
  _saveDOMValues(prefix);
  if (container) container.innerHTML = '';
  selected.splice(i, 1);
  renderPrescSelected(prefix);
}

function addExercise(prefix, exerciseId) {
  const exercises = prefix === 'adl' ? _adlExercises : _vcgExercises;
  const selected  = prefix === 'adl' ? _adlSelected  : _vcgSelected;
  const ex = exercises.find(e => e.id === exerciseId);
  if (!ex) return;
  selected.push({ exercise: ex, blocks: 1, reps: 10, notes: '', state: 'editing' });
  renderPrescSelected(prefix);
  const searchEl  = document.getElementById(`${prefix}-prescription-search`);
  const resultsEl = document.getElementById(`${prefix}-prescription-results`);
  if (searchEl)  searchEl.value = '';
  if (resultsEl) resultsEl.classList.add('hidden');
}

function _filterExercises(prefix, query) {
  const exercises = prefix === 'adl' ? _adlExercises : _vcgExercises;
  const selected  = prefix === 'adl' ? _adlSelected  : _vcgSelected;
  const selIds    = new Set(selected.map(s => s.exercise.id));
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return exercises.filter(e => e.name.toLowerCase().includes(q) && !selIds.has(e.id)).slice(0, 6);
}

function _setupPrescSearchListener(prefix) {
  const searchEl  = document.getElementById(`${prefix}-prescription-search`);
  const resultsEl = document.getElementById(`${prefix}-prescription-results`);
  if (!searchEl) return;
  searchEl.addEventListener('input', () => {
    const matches = _filterExercises(prefix, searchEl.value);
    if (!matches.length) { resultsEl.classList.add('hidden'); return; }
    resultsEl.innerHTML = matches.map(e =>
      `<div class="px-3 py-2 hover:bg-slate-100 cursor-pointer text-sm text-slate-700 border-b border-slate-100 last:border-b-0"
            onmousedown="addExercise('${prefix}','${e.id}')">${e.name}</div>`
    ).join('');
    resultsEl.classList.remove('hidden');
  });
  searchEl.addEventListener('blur', () => {
    setTimeout(() => resultsEl.classList.add('hidden'), 150);
  });
}

// ── ADL Prescription modal ─────────────────────────────────────────────────────

async function openAdlPrescriptionModal(ev) {
  _adlPrescEventId = typeof ev === 'object' ? ev.id : ev;
  const protocolId = typeof ev === 'object' ? ev.protocol_event_id : null;

  document.getElementById('adl-prescription-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('adl-prescription-date').value = patientData?.activationDate || '';
  document.getElementById('adl-prescription-notes').value = '';
  setError('adl-prescription-error', '');
  _adlSelected = [];
  renderPrescSelected('adl');
  showModal('adl-prescription-modal');

  try {
    if (!_adlExercises.length) {
      const res = await fetch('/api/exercises?type=adl');
      if (!res.ok) throw new Error();
      _adlExercises = await res.json();
    }
    // Pre-populate for d15 revision
    if (protocolId === 'adl_prescription_d15') {
      const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/prescription/adl_prescription_d1`);
      if (res.ok) {
        const prev = await res.json();
        _adlSelected = (prev.prescribed_exercises || []).map(pe => {
          const ex = _adlExercises.find(e => e.id === pe.exercise_id);
          return ex ? { exercise: ex, blocks: pe.blocks || 1, reps: pe.repetitions || 1, notes: pe.notes || '', state: 'compact' } : null;
        }).filter(Boolean);
        document.getElementById('adl-prescription-notes').value = prev.notes || '';
        renderPrescSelected('adl');
      }
    }
  } catch (_) {
    setError('adl-prescription-error', 'Failed to load exercises.');
  }
}

async function submitAdlPrescription() {
  if (!_adlSelected.length) { setError('adl-prescription-error', 'Please select at least one exercise.'); return; }
  if (_adlSelected.some(s => s.state === 'editing')) { setError('adl-prescription-error', 'Please save all exercise cards before submitting.'); return; }
  for (const s of _adlSelected) {
    if (!s.blocks || !s.reps) { setError('adl-prescription-error', 'Please enter blocks and repetitions for all exercises.'); return; }
  }

  const ev = eventsCache.find(e => e.id === _adlPrescEventId);
  const exercises = _adlSelected.map(s => ({
    exercise_id: s.exercise.id,
    blocks:      s.blocks,
    repetitions: s.reps,
    notes:       s.notes,
  }));
  const notes = document.getElementById('adl-prescription-notes').value.trim();

  setLoading('adl-prescription-submit', true);
  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/adl-prescription`, {
    event_id:          _adlPrescEventId,
    protocol_event_id: ev?.protocol_event_id,
    exercises,
    notes,
  });
  setLoading('adl-prescription-submit', false);

  if (!ok) { setError('adl-prescription-error', data.error || 'Failed to save prescription.'); return; }
  hideModal('adl-prescription-modal');
  loadPatientEvents();
}

// ── VCG Prescription modal ─────────────────────────────────────────────────────

async function openVcgPrescriptionModal(ev) {
  _vcgPrescEventId = typeof ev === 'object' ? ev.id : ev;
  const protocolId = typeof ev === 'object' ? ev.protocol_event_id : null;
  const vcgGroup   = patientData?.vcgGroup || '';

  document.getElementById('vcg-prescription-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('vcg-prescription-date').value = patientData?.activationDate || '';
  document.getElementById('vcg-prescription-group-label').textContent = VCG_GROUP_LABELS[vcgGroup] || vcgGroup || '—';
  document.getElementById('vcg-prescription-notes').value = '';
  setError('vcg-prescription-error', '');
  _vcgSelected = [];
  renderPrescSelected('vcg');
  showModal('vcg-prescription-modal');

  if (!vcgGroup) {
    setError('vcg-prescription-error', 'No VCG group assigned to this patient.');
    return;
  }

  try {
    if (!_vcgExercises.length || _vcgExercises._group !== vcgGroup) {
      const res = await fetch(`/api/exercises?type=vcg&group=${vcgGroup}`);
      if (!res.ok) throw new Error();
      _vcgExercises = await res.json();
      _vcgExercises._group = vcgGroup;
    }
    // Pre-populate for d15 revision
    if (protocolId === 'vcg_prescription_d15') {
      const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/prescription/vcg_prescription_d1`);
      if (res.ok) {
        const prev = await res.json();
        _vcgSelected = (prev.prescribed_exercises || []).map(pe => {
          const ex = _vcgExercises.find(e => e.id === pe.exercise_id);
          return ex ? { exercise: ex, blocks: pe.blocks || 1, reps: pe.repetitions || 1, notes: pe.notes || '', state: 'compact' } : null;
        }).filter(Boolean);
        document.getElementById('vcg-prescription-notes').value = prev.notes || '';
        renderPrescSelected('vcg');
      }
    }
  } catch (_) {
    setError('vcg-prescription-error', 'Failed to load exercises.');
  }
}

async function submitVcgPrescription() {
  if (!_vcgSelected.length) { setError('vcg-prescription-error', 'Please select at least one exercise.'); return; }
  if (_vcgSelected.some(s => s.state === 'editing')) { setError('vcg-prescription-error', 'Please save all exercise cards before submitting.'); return; }
  for (const s of _vcgSelected) {
    if (!s.blocks || !s.reps) { setError('vcg-prescription-error', 'Please enter blocks and repetitions for all exercises.'); return; }
  }

  const ev = eventsCache.find(e => e.id === _vcgPrescEventId);
  const exercises = _vcgSelected.map(s => ({
    exercise_id: s.exercise.id,
    blocks:      s.blocks,
    repetitions: s.reps,
    notes:       s.notes,
  }));
  const notes = document.getElementById('vcg-prescription-notes').value.trim();

  setLoading('vcg-prescription-submit', true);
  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/vcg-prescription`, {
    event_id:          _vcgPrescEventId,
    protocol_event_id: ev?.protocol_event_id,
    exercises,
    notes,
  });
  setLoading('vcg-prescription-submit', false);

  if (!ok) { setError('vcg-prescription-error', data.error || 'Failed to save prescription.'); return; }
  hideModal('vcg-prescription-modal');
  loadPatientEvents();
}

// ── Load patient ──────────────────────────────────────────────────────────────

async function loadPatient() {
  try {
    const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}`);
    patientData = await res.json();
    if (!res.ok) {
      console.error('Could not load patient:', patientData.error);
      return;
    }
    renderOverview(patientData);
  } catch (e) {
    console.error('Error loading patient:', e);
  }
}

async function loadPrivilege() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const s = await res.json();
      isAdmin = s.privilege === 'admin';
    }
  } catch (_) {}
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Store submit button labels for loading state
  [
    'complete-training-submit', 'a1-submit', 'a2-submit', 'discontinue-submit',
    'device-setup-submit', 'activation-submit',
    'adl-prescription-submit', 'vcg-prescription-submit',
  ].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.dataset.label = btn.textContent;
  });

  // Set up prescription search bar listeners
  _setupPrescSearchListener('adl');
  _setupPrescSearchListener('vcg');

  await loadPrivilege();
  await loadPatient();
  await loadPatientEvents();
  switchTab('overview');

  // Auto-open modal if ?action=<event_id> is in the URL
  const actionId = new URLSearchParams(window.location.search).get('action');
  if (actionId) {
    const ev = eventsCache.find(e => e.id === actionId);
    if (ev) {
      const opener = EVENT_OPENERS[ev.protocol_event_id];
      if (opener) opener(ev);
    }
  }
});
