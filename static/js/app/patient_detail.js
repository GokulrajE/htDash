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
  if (tab === 'adl')      loadAdlTab();
  if (tab === 'vcg')      loadVcgTab();
  if (tab === 'timeline') renderTimelineTab();
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

function _nowForInput() {
  // Returns current LOCAL datetime truncated to minutes in YYYY-MM-DDTHH:MM format.
  // Must use local components — toISOString() returns UTC which breaks datetime-local
  // comparisons in non-UTC timezones (e.g. IST = UTC+5:30 would flag valid local times).
  const d   = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function _attachSessionEndGuard(startInputId, endInputId, errorId) {
  // Fires on change of the end input; validates same date and end > start immediately.
  const endInput = document.getElementById(endInputId);
  if (!endInput) return;
  if (endInput._sessionEndGuard) endInput.removeEventListener('change', endInput._sessionEndGuard);
  endInput._sessionEndGuard = () => {
    const startVal = document.getElementById(startInputId)?.value;
    const endVal   = endInput.value;
    if (!startVal || !endVal) return;
    if (startVal.split('T')[0] !== endVal.split('T')[0]) {
      setError(errorId, 'Session start and end must be on the same date.');
    } else if (endVal <= startVal) {
      setError(errorId, 'Session end must be after session start.');
    } else {
      setError(errorId, '');
    }
  };
  endInput.addEventListener('change', endInput._sessionEndGuard);
}

function _attachDateGuard(inputId, errorId) {
  // Sets max=now on the input and shows an inline error immediately on change if future date picked
  const input = document.getElementById(inputId);
  if (!input) return;
  input.max = _nowForInput();
  // Remove any previously attached guard listener to avoid duplicates
  if (input._dateGuard) input.removeEventListener('change', input._dateGuard);
  input._dateGuard = () => {
    if (input.value && input.value > input.max) {
      setError(errorId, 'Date cannot be in the future.');
      input.value = '';
    } else {
      setError(errorId, '');
    }
  };
  input.addEventListener('change', input._dateGuard);
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

  // VCG tab: control only
  const vcgBtn = document.getElementById('tab-btn-vcg');
  if (vcgBtn) vcgBtn.classList.toggle('hidden', p.group !== 'control');

  // Robot Issues tab: experimental only
  const robotBtn = document.getElementById('tab-btn-robot');
  if (robotBtn) robotBtn.classList.toggle('hidden', p.group !== 'experimental');

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
  _attachDateGuard('complete-training-date', 'complete-training-error');
  showModal('complete-training-modal');
}

function openA1Modal() {
  document.getElementById('a1-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('a1-date').value = '';
  setError('a1-error', '');
  _attachDateGuard('a1-date', 'a1-error');
  showModal('a1-modal');
}

function openA2Modal() {
  document.getElementById('a2-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('a2-date').value = '';
  setError('a2-error', '');
  _attachDateGuard('a2-date', 'a2-error');
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

let _completeEventsCache = null;  // null = not yet loaded

async function loadPatientEvents() {
  const completedEl = document.getElementById('patient-completed-events');
  const overdueEl   = document.getElementById('patient-overdue-events');
  const upcomingEl  = document.getElementById('patient-upcoming-events');
  try {
    const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/events`);
    if (!res.ok) throw new Error('Failed to load events');
    const { overdue, upcoming, complete } = await res.json();
    eventsCache = [...overdue, ...upcoming];
    _completeEventsCache = complete || [];
    renderTimelineTab();

    document.getElementById('patient-completed-count').textContent = (complete || []).length;
    document.getElementById('patient-overdue-count').textContent   = overdue.length;
    document.getElementById('patient-upcoming-count').textContent  = upcoming.length;

    completedEl.innerHTML = complete && complete.length
      ? completedTimeline(complete)
      : emptyEventState('hourglass-start', 'text-slate-300', 'No events completed yet');
    overdueEl.innerHTML  = overdue.length  ? overdue.map(patientEventRow).join('')
                                           : emptyEventState('check-circle', 'text-green-500', 'No overdue events');
    upcomingEl.innerHTML = upcoming.length ? upcoming.map(patientEventRow).join('')
                                           : emptyEventState('calendar-check', 'text-slate-400', 'No upcoming events');
  } catch (e) {
    console.error('Error loading patient events:', e);
    completedEl.innerHTML = '<p class="text-xs text-red-500 text-center py-4">Error loading events</p>';
    overdueEl.innerHTML   = '<p class="text-xs text-red-500 text-center py-4">Error loading events</p>';
    upcomingEl.innerHTML  = '<p class="text-xs text-red-500 text-center py-4">Error loading events</p>';
  }
}

function _dayNumber(completionDate) {
  const actRaw = patientData?.activationDate;
  if (!actRaw || !completionDate) return null;
  const act  = new Date(actRaw.replace(' ', 'T'));
  const comp = new Date(completionDate.replace(' ', 'T'));
  if (isNaN(act) || isNaN(comp)) return null;
  return Math.round((comp - act) / 86400000);
}

function _fmtDateTime(raw) {
  if (!raw) return '—';
  const d = new Date(raw.replace(' ', 'T'));
  if (isNaN(d)) return raw;
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

function _fmtDate(raw) {
  if (!raw) return '—';
  if (Array.isArray(raw)) {
    const start = _fmtDate(raw[0]);
    const end   = _fmtDate(raw[1]);
    return raw[0] === raw[1] ? start : `${start} – ${end}`;
  }
  const d = new Date(raw.replace(' ', 'T'));
  return isNaN(d) ? raw : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Fields always rendered in the main timeline layout — skip in extra fields
const _TIMELINE_BASE_FIELDS = new Set([
  'protocol_event_id', 'event_name', 'scheduled_date',
  'completion_date', 'filed_at', 'flagged', '_synthetic',
]);

// Preferred display order for known extra fields. 'notes' is always rendered last.
const _FIELD_ORDER = [
  'pluto_id', 'mars_id', 'demo_done',
  'ag_watch_right', 'ag_watch_left',
  'prescription_file', 'attachments',
];

const _FIELD_LABELS = {
  ag_watch_right: 'Right Watch',
  ag_watch_left:  'Left Watch',
  pluto_id:       'Pluto Device',
  mars_id:           'Mars Device',
  demo_done:         'Demo Done',
  prescription_file: 'Prescription File',
  notes:             'Notes',
  attachments:       'Attachments',
};

function _timelineExtraFields(ev) {
  const known   = new Set(_FIELD_ORDER);
  const ordered = [
    ..._FIELD_ORDER,
    ...Object.keys(ev).filter(k => !known.has(k) && k !== 'notes'),
    'notes',
  ];

  const rows = [];
  for (const key of ordered) {
    if (_TIMELINE_BASE_FIELDS.has(key) || !(key in ev)) continue;
    const val = ev[key];
    if (val === null || val === undefined || val === '' || val === false) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    const label = _FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    let display;
    if (typeof val === 'boolean') {
      display = val ? 'Yes' : 'No';
    } else if (Array.isArray(val)) {
      display = val.join(', ');
    } else if (val && typeof val === 'object' && 'new_id' in val) {
      const nw = val.new_id ?? 'None';
      display = val.old_id ? `${val.old_id} → ${nw}` : nw;
    } else if (typeof val === 'string' && val.includes('/')) {
      display = val.split('/').pop();
    } else {
      display = String(val);
    }
    rows.push(`<div class="flex gap-1.5 text-xs"><span class="text-slate-400 shrink-0">${label}:</span><span class="text-slate-700">${display}</span></div>`);
  }
  return rows.length
    ? `<div class="mt-2 space-y-0.5 border-t border-slate-100 pt-2">${rows.join('')}</div>`
    : '';
}

function _syntheticPatientEvents() {
  const synthetic = [];
  if (patientData?.enrollDate) {
    synthetic.push({
      event_name:      'Patient Enrolled',
      completion_date: patientData.enrollDate,
      filed_at:        patientData.enrollDate,
      scheduled_date:  null,
      _synthetic:      true,
    });
  }
  if (patientData?.a0CompletionDate) {
    synthetic.push({
      event_name:      'A0 Assessment',
      completion_date: patientData.a0CompletionDate,
      filed_at:        patientData.a0CompletionDate,
      scheduled_date:  null,
      _synthetic:      true,
    });
  }
  return synthetic;
}

function renderTimelineTab() {
  const container = document.getElementById('timeline-tab-content');
  if (!container) return;

  // Merge protocol events with synthetic patient milestones, sort most-recent first
  const all = [...(  _completeEventsCache || []), ..._syntheticPatientEvents()];
  all.sort((a, b) => {
    const ta = a.filed_at || a.completion_date || '';
    const tb = b.filed_at || b.completion_date || '';
    return tb.localeCompare(ta);
  });

  const events = all;
  if (!events.length) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-slate-300">
        <i class="fas fa-stream text-3xl mb-3"></i>
        <p class="text-sm">No completed events yet.</p>
      </div>`;
    return;
  }
  const items = events.map((ev, i) => {
    const isLast   = i === events.length - 1;
    const schedStr = _fmtDate(ev.scheduled_date);
    const compStr  = ev.completion_date ? _fmtDateTime(ev.completion_date) : '—';
    const filedStr = ev.filed_at ? _fmtDateTime(ev.filed_at) : '';
    const extra    = _timelineExtraFields(ev);
    const rowBg    = i % 2 === 1 ? 'bg-slate-100 rounded-lg' : '';
    const dayNum   = _dayNumber(ev.completion_date);
    const dayLabel = dayNum !== null ? `Day ${dayNum}` : null;
    const isSynthetic = !!ev._synthetic;
    const circleCls = isSynthetic
      ? 'bg-blue-500 ring-blue-300'
      : 'bg-green-500 ring-green-300';
    return `
      <div class="grid gap-x-4 px-2 -mx-2 ${rowBg}" style="grid-template-columns:1fr 20px 1fr">
        <div class="text-right pb-${isLast ? '2' : '7'} pt-2">
          <p class="text-sm font-semibold text-slate-800">${ev.event_name}</p>
          ${!isSynthetic ? `<p class="text-xs text-slate-400 mt-0.5">Scheduled: ${schedStr}</p>` : ''}
          ${dayLabel ? `<p class="text-sm font-semibold text-indigo-500 mt-1">${dayLabel}</p>` : ''}
        </div>
        <div class="flex flex-col items-center pt-2">
          <div class="w-3 h-3 rounded-full ${circleCls} border-2 border-white ring-1 z-10 flex-shrink-0"></div>
          ${isLast ? '' : '<div class="flex-1 w-0.5 bg-green-200 -mb-2"></div>'}
        </div>
        <div class="pb-${isLast ? '2' : '7'} pt-2">
          <p class="text-xs font-medium text-slate-700">${compStr}</p>
          ${filedStr ? `<p class="text-xs text-slate-400 mt-0.5">Filed: ${filedStr}</p>` : ''}
          ${extra}
        </div>
      </div>`;
  }).join('');
  container.innerHTML = `<div>${items}</div>`;
}

function completedTimeline(events) {
  const items = events.map((ev, i) => {
    const raw = ev.completion_date || ev.filed_at || '';
    const d   = raw ? new Date(raw) : null;
    const dateStr = d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
    const isLast  = i === events.length - 1;
    return `
      <div class="relative pl-7 ${isLast ? '' : 'pb-4'}">
        <div class="absolute left-[3px] top-1.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white ring-1 ring-green-300 z-10"></div>
        ${isLast ? '' : '<div class="absolute left-[8px] top-4 bottom-0 w-0.5 bg-green-100"></div>'}
        <p class="text-sm font-medium text-slate-800 leading-tight">${ev.event_name}</p>
        <p class="text-xs text-slate-400 mt-0.5">${dateStr}</p>
      </div>`;
  }).join('');
  return `<div class="relative">${items}</div>`;
}

// Map protocol_event_id → opener function name
const EVENT_OPENERS = {
  exp_device_install:        (ev) => openDeviceSetupModal(ev.id),
  activation:                (ev) => openActivationModal(ev.id),
  discontinuation_reminder:  (_ev) => openDiscontinueModal(),
  adl_prescription_d01:      (ev) => openAdlPrescriptionModal(ev),
  adl_prescription_d15:      (ev) => openAdlPrescriptionModal(ev),
  vcg_prescription_d01:      (ev) => openVcgPrescriptionModal(ev),
  vcg_prescription_d15:      (ev) => openVcgPrescriptionModal(ev),
  prescription_printout_d01: (ev) => openPrescriptionPrintoutModal(ev),
  prescription_printout_d15: (ev) => openPrescriptionPrintoutModal(ev),
  home_visit_d02:            (ev) => openSimpleEventModal(ev),
  home_visit_d03:            (ev) => openSimpleEventModal(ev),
  home_visit_d15:            (ev) => openSimpleEventModal(ev),
  followup_call_d07:         (ev) => openFollowupCallModal(ev),
  followup_call_d21:         (ev) => openFollowupCallModal(ev),
  training_completion_d29:   (ev) => openSimpleEventModal(ev),
  adl_agwatch_timing_d03:    (ev) => openAgwatchTimingModal(ev),
  adl_agwatch_timing_d15:    (ev) => openAgwatchTimingModal(ev),
  vcg_agwatch_timing_d03:    (ev) => openAgwatchTimingModal(ev),
  vcg_agwatch_timing_d15:    (ev) => openAgwatchTimingModal(ev),
  watch_record:              (ev) => openWatchRecordModal(ev),
};

function patientEventRow(ev) {
  const sched = ev.scheduled_date;
  const isActiveWindow = !!ev.active_window;
  const isOverdue   = !isActiveWindow && ev.days <= 0;
  const isUpcoming  = !isActiveWindow && ev.days > 0;
  // For display date: upcoming → start, active-window or past-due → end
  const refDate = Array.isArray(sched) ? (isActiveWindow || isOverdue ? sched[1] : sched[0]) : sched;
  const d = new Date((refDate || '').replace(' ', 'T'));
  const dateStr = d && !isNaN(d) ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';
  const abs = Math.abs(ev.days);
  let whenLabel;
  if (isActiveWindow) {
    whenLabel = ev.days === 0 ? 'Due today' : `Due now · ${ev.days}d left`;
  } else if (isOverdue) {
    whenLabel = ev.days === 0 ? 'Today' : `${abs}d overdue`;
  } else {
    whenLabel = `Available from ${dateStr}`;
  }
  const urgency   = isOverdue      ? 'border-red-200 bg-red-50'
                  : isActiveWindow  ? 'border-amber-200 bg-amber-50'
                  : ev.days <= 2   ? 'border-orange-200 bg-orange-50'
                  : 'border-slate-100 bg-slate-50';
  const textColor = isOverdue      ? 'text-red-600'
                  : isActiveWindow  ? 'text-amber-700'
                  : ev.days <= 2   ? 'text-orange-600'
                  : 'text-slate-500';

  const blocked   = ev.blocked_by && ev.blocked_by.length > 0;
  const hasOpener = !!EVENT_OPENERS[ev.protocol_event_id];
  const clickable = hasOpener && !blocked && !isUpcoming;
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
  _attachDateGuard('device-setup-date', 'device-setup-error');

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
  document.getElementById('activation-session-start').value = '';
  document.getElementById('activation-session-end').value   = '';
  document.getElementById('activation-notes').value         = '';
  setError('activation-error', '');
  _attachDateGuard('activation-session-start', 'activation-error');
  _attachSessionEndGuard('activation-session-start', 'activation-session-end', 'activation-error');

  // Show VCG group row for control patients only
  const vcgRow = document.getElementById('activation-vcg-group-row');
  const vcgSel = document.getElementById('activation-vcg-group');
  const isControl = patientData?.group === 'control';
  if (vcgRow) vcgRow.classList.toggle('hidden', !isControl);
  if (vcgSel) vcgSel.value = '';

  showModal('activation-modal');
}

async function submitActivation() {
  const sessionStart = document.getElementById('activation-session-start').value;
  const sessionEnd   = document.getElementById('activation-session-end').value;
  const notes        = document.getElementById('activation-notes').value;

  if (!sessionStart || !sessionEnd) {
    setError('activation-error', 'Session start and end are required.');
    return;
  }
  if (sessionStart.split('T')[0] !== sessionEnd.split('T')[0]) {
    setError('activation-error', 'Session start and end must be on the same date.');
    return;
  }
  if (sessionStart >= sessionEnd) {
    setError('activation-error', 'Session end must be after session start.');
    return;
  }

  const body = { activationDate: sessionStart, sessionStart, sessionEnd, notes };
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

// ── ADL Prescription modal ────────────────��────────────────────────────────────

async function openAdlPrescriptionModal(ev) {
  _adlPrescEventId = typeof ev === 'object' ? ev.id : ev;
  const protocolId = typeof ev === 'object' ? ev.protocol_event_id : null;

  let dateValue, dateLabel;
  if (protocolId === 'adl_prescription_d15') {
    const hvEvent = (_completeEventsCache || []).find(e => e.protocol_event_id === 'home_visit_d15');
    dateValue = hvEvent?.completion_date || '';
    dateLabel = 'Home Visit Date';
  } else {
    dateValue = patientData?.activationDate || '';
    dateLabel = 'Activation Date';
  }

  document.getElementById('adl-prescription-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('adl-prescription-date-label').textContent = dateLabel;
  document.getElementById('adl-prescription-date').value = dateValue;
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
      const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/prescription/adl_prescription_d01`);
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
  _adlTabLoaded = false;
  loadPatientEvents();
}

// ── VCG Prescription modal ─────────────────────────────────────────────────────

async function openVcgPrescriptionModal(ev) {
  _vcgPrescEventId = typeof ev === 'object' ? ev.id : ev;
  const protocolId = typeof ev === 'object' ? ev.protocol_event_id : null;
  const vcgGroup   = patientData?.vcgGroup || '';

  let vcgDateValue, vcgDateLabel;
  if (protocolId === 'vcg_prescription_d15') {
    const hvEvent = (_completeEventsCache || []).find(e => e.protocol_event_id === 'home_visit_d15');
    vcgDateValue = hvEvent?.completion_date || '';
    vcgDateLabel = 'Home Visit Date';
  } else {
    vcgDateValue = patientData?.activationDate || '';
    vcgDateLabel = 'Activation Date';
  }

  document.getElementById('vcg-prescription-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('vcg-prescription-date-label').textContent = vcgDateLabel;
  document.getElementById('vcg-prescription-date').value = vcgDateValue;
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
      const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/prescription/vcg_prescription_d01`);
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
  _vcgTabLoaded = false;
  loadPatientEvents();
}

// ── ADL / VCG prescription tab viewers ────────────────────────────────────────

let _adlTabLoaded = false;
let _vcgTabLoaded = false;

function _prescriptionCard(data, exercises, dayLabel, headerClass, attachmentPath, timingData) {
  const exMap     = Object.fromEntries(exercises.map(e => [e.id, e]));
  const timingMap = Object.fromEntries(
    (timingData?.timings || []).map(t => [t.exercise_id, t])
  );
  const rows = (data.prescribed_exercises || []).map((pe, i) => {
    const name = exMap[pe.exercise_id]?.name || pe.exercise_id;
    const notesHtml = pe.notes
      ? `<p class="text-xs text-slate-400 mt-0.5 italic">${pe.notes}</p>` : '';
    const t = timingMap[pe.exercise_id];
    const timingHtml = t
      ? `<p class="text-xs font-mono text-slate-400 mt-0.5">${t.start ? t.start.split('T')[1] : '—'} → ${t.end ? t.end.split('T')[1] : '—'}</p>`
      : '';
    return `
      <div class="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-b-0">
        <span class="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">${i + 1}</span>
        <div class="flex-1 min-w-0">
          <span class="text-sm font-semibold text-slate-800">${name}</span>
          ${notesHtml}
        </div>
        <div class="flex-shrink-0 text-right">
          <p class="text-xs font-medium text-slate-500 whitespace-nowrap">${pe.blocks} blocks × ${pe.repetitions} reps</p>
          ${timingHtml}
        </div>
      </div>`;
  }).join('');

  const generalNotes = data.notes ? `
    <div class="mt-3 pt-3 border-t border-slate-100">
      <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">General Notes</p>
      <p class="text-sm text-slate-600">${data.notes}</p>
    </div>` : '';

  const downloadLink = attachmentPath ? `
    <a href="/api/patients/${PATIENT_HOMER_ID}/attachment/${attachmentPath}"
       download
       class="inline-flex items-center gap-1.5 text-xs font-semibold text-white/90 hover:text-white">
      <i class="fas fa-file-pdf"></i> Download PDF
    </a>` : '';

  return `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3 ${headerClass}">
        <h3 class="text-sm font-bold">${dayLabel}</h3>
        <div class="flex items-center gap-4">
          ${downloadLink}
          <div class="text-right">
            <p class="text-xs opacity-70">Filed ${data.filed_at}</p>
            <p class="text-xs opacity-50">by ${data.filed_by}</p>
          </div>
        </div>
      </div>
      <div class="px-5 py-2">
        ${rows}
        ${generalNotes}
      </div>
    </div>`;
}

async function loadAdlTab() {
  if (_adlTabLoaded) return;
  const container = document.getElementById('adl-tab-content');
  if (!container) return;

  try {
    const [exRes, d1Res, d15Res, t03Res, t15Res] = await Promise.all([
      fetch('/api/exercises?type=adl'),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/prescription/adl_prescription_d01`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/prescription/adl_prescription_d15`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/agwatch-timing/adl_agwatch_timing_d03`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/agwatch-timing/adl_agwatch_timing_d15`),
    ]);
    const exercises = exRes.ok  ? await exRes.json()  : [];
    const d1        = d1Res.ok  ? await d1Res.json()  : null;
    const d15       = d15Res.ok ? await d15Res.json() : null;
    const t03       = t03Res.ok ? await t03Res.json() : null;
    const t15       = t15Res.ok ? await t15Res.json() : null;

    if (!d1 && !d15) {
      container.innerHTML = `
        <div class="bg-white rounded-2xl p-10 shadow-sm border border-slate-100 text-center text-slate-400">
          <i class="fas fa-dumbbell text-3xl mb-3 block"></i>
          <p class="font-medium">No ADL prescriptions recorded yet.</p>
        </div>`;
    } else {
      const printD1  = (_completeEventsCache || []).find(e => e.protocol_event_id === 'prescription_printout_d01');
      const printD15 = (_completeEventsCache || []).find(e => e.protocol_event_id === 'prescription_printout_d15');
      let html = '';
      if (d15) html += _prescriptionCard(d15, exercises, 'Day 15 Revision',    'bg-blue-600 text-white',  printD15?.attachment, t15);
      if (d1)  html += _prescriptionCard(d1,  exercises, 'Day 1 Prescription', 'bg-blue-400 text-white', printD1?.attachment,  t03);
      container.innerHTML = html;
    }
    _adlTabLoaded = true;
  } catch (_) {
    container.innerHTML = `<p class="text-sm text-red-500 p-4">Failed to load ADL prescriptions.</p>`;
  }
}

async function loadVcgTab() {
  if (_vcgTabLoaded) return;
  const container = document.getElementById('vcg-tab-content');
  if (!container) return;

  const vcgGroup  = patientData?.vcgGroup || '';
  const groupLabel = VCG_GROUP_LABELS[vcgGroup] || vcgGroup || '';

  try {
    const [exRes, d1Res, d15Res, t03Res, t15Res] = await Promise.all([
      fetch(`/api/exercises?type=vcg&group=${vcgGroup}`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/prescription/vcg_prescription_d01`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/prescription/vcg_prescription_d15`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/agwatch-timing/vcg_agwatch_timing_d03`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/agwatch-timing/vcg_agwatch_timing_d15`),
    ]);
    const exercises = exRes.ok  ? await exRes.json()  : [];
    const d1        = d1Res.ok  ? await d1Res.json()  : null;
    const d15       = d15Res.ok ? await d15Res.json() : null;
    const t03       = t03Res.ok ? await t03Res.json() : null;
    const t15       = t15Res.ok ? await t15Res.json() : null;

    if (!d1 && !d15) {
      container.innerHTML = `
        <div class="bg-white rounded-2xl p-10 shadow-sm border border-slate-100 text-center text-slate-400">
          <i class="fas fa-heartbeat text-3xl mb-3 block"></i>
          <p class="font-medium">No VCG prescriptions recorded yet.</p>
        </div>`;
    } else {
      const printD1  = (_completeEventsCache || []).find(e => e.protocol_event_id === 'prescription_printout_d01');
      const printD15 = (_completeEventsCache || []).find(e => e.protocol_event_id === 'prescription_printout_d15');
      const suffix = groupLabel ? ` · <span class="font-normal opacity-70">${groupLabel}</span>` : '';
      let html = '';
      if (d15) html += _prescriptionCard(d15, exercises, `Day 15 Revision${suffix}`,    'bg-teal-600 text-white',  printD15?.attachment, t15);
      if (d1)  html += _prescriptionCard(d1,  exercises, `Day 1 Prescription${suffix}`, 'bg-teal-400 text-white', printD1?.attachment,  t03);
      container.innerHTML = html;
    }
    _vcgTabLoaded = true;
  } catch (_) {
    container.innerHTML = `<p class="text-sm text-red-500 p-4">Failed to load VCG prescriptions.</p>`;
  }
}

// ── Prescription Printout modal ────────────────────────────────────────────────

let _prescPrintoutEventId     = null;
let _prescPrintoutProtocolId  = null;

function openPrescriptionPrintoutModal(ev) {
  _prescPrintoutEventId    = typeof ev === 'object' ? ev.id : ev;
  _prescPrintoutProtocolId = typeof ev === 'object' ? ev.protocol_event_id : null;

  const title = _prescPrintoutProtocolId === 'prescription_printout_d15'
    ? 'Revised Therapy Prescription Printout'
    : 'Therapy Prescription Printout';

  document.getElementById('prescription-printout-title').textContent = title;
  document.getElementById('prescription-printout-homer-id').textContent = PATIENT_HOMER_ID;
  setError('prescription-printout-error', '');
  showModal('prescription-printout-modal');
}

async function _completePrescriptionPrintout() {
  const { ok, data } = await apiPost(
    `/api/patients/${PATIENT_HOMER_ID}/complete-event/prescription-printout`,
    { event_id: _prescPrintoutEventId, protocol_event_id: _prescPrintoutProtocolId }
  );
  if (!ok) {
    setError('prescription-printout-error', data.error || 'Failed to record printout.');
    return null;
  }
  hideModal('prescription-printout-modal');
  loadPatientEvents();
  return data.attachment;
}

async function savePrescriptionPrintout() {
  setLoading('prescription-printout-save', true);
  const attachment = await _completePrescriptionPrintout();
  setLoading('prescription-printout-save', false);
  if (attachment) {
    const a = document.createElement('a');
    a.href = `/api/patients/${PATIENT_HOMER_ID}/attachment/${attachment}`;
    a.download = attachment.split('/').pop();
    a.click();
  }
}

async function printPrescriptionPrintout() {
  setLoading('prescription-printout-print', true);
  const attachment = await _completePrescriptionPrintout();
  setLoading('prescription-printout-print', false);
  if (attachment) {
    window.open(`/api/patients/${PATIENT_HOMER_ID}/attachment/${attachment}`, '_blank');
  }
}

// ── Simple event modal (home visits, follow-up calls, training completion) ────

let _simpleEventId         = null;
let _simpleProtocolEventId = null;

function openSimpleEventModal(ev) {
  _simpleEventId         = ev.id;
  _simpleProtocolEventId = ev.protocol_event_id;
  document.getElementById('simple-event-title').textContent = ev.event_name;
  document.getElementById('simple-event-notes').value       = '';
  const err         = document.getElementById('simple-event-error');
  const dateWrap    = document.getElementById('simple-event-date-wrap');
  const sessionWrap = document.getElementById('simple-event-session-wrap');
  err.textContent = '';
  err.classList.add('hidden');

  const HOME_VISIT_SESSION_IDS = new Set(['home_visit_d02', 'home_visit_d03', 'home_visit_d15']);
  const isHomeVisit = HOME_VISIT_SESSION_IDS.has(ev.protocol_event_id);

  // Home visits: show session start/end datetime inputs; hide single date field
  dateWrap.classList.toggle('hidden', isHomeVisit);
  sessionWrap.classList.toggle('hidden', !isHomeVisit);
  document.getElementById('simple-event-session-start').value = '';
  document.getElementById('simple-event-session-end').value   = '';

  if (isHomeVisit) {
    // d02/d03: pre-fill session start with fixed visit date (activation + offset) at 09:00
    const ACTIVATION_OFFSETS = { home_visit_d02: 1, home_visit_d03: 2 };
    const offset = ACTIVATION_OFFSETS[ev.protocol_event_id];
    if (offset !== undefined && patientData?.activationDate) {
      const d = new Date(patientData.activationDate);
      d.setDate(d.getDate() + offset);
      document.getElementById('simple-event-session-start').value = d.toISOString().slice(0, 10) + 'T09:00';
    }
    _attachDateGuard('simple-event-session-start', 'simple-event-error');
    _attachSessionEndGuard('simple-event-session-start', 'simple-event-session-end', 'simple-event-error');
  } else {
    const dateInput = document.getElementById('simple-event-date');
    dateInput.value    = '';
    dateInput.readOnly = false;
    dateInput.classList.remove('bg-slate-50', 'cursor-not-allowed');
    _attachDateGuard('simple-event-date', 'simple-event-error');
  }

  showModal('simple-event-modal');
}

async function saveSimpleEvent() {
  const notes = document.getElementById('simple-event-notes').value.trim();
  const err   = document.getElementById('simple-event-error');
  err.classList.add('hidden');

  const HOME_VISIT_SESSION_IDS = new Set(['home_visit_d02', 'home_visit_d03', 'home_visit_d15']);
  let completionDate, sessionStart = null, sessionEnd = null;

  if (HOME_VISIT_SESSION_IDS.has(_simpleProtocolEventId)) {
    sessionStart = document.getElementById('simple-event-session-start').value;
    sessionEnd   = document.getElementById('simple-event-session-end').value;
    if (!sessionStart || !sessionEnd) {
      err.textContent = 'Session start and end are required.';
      err.classList.remove('hidden');
      return;
    }
    if (sessionStart.split('T')[0] !== sessionEnd.split('T')[0]) {
      err.textContent = 'Session start and end must be on the same date.';
      err.classList.remove('hidden');
      return;
    }
    if (sessionStart >= sessionEnd) {
      err.textContent = 'Session end must be after session start.';
      err.classList.remove('hidden');
      return;
    }
    completionDate = sessionStart;
  } else {
    completionDate = document.getElementById('simple-event-date').value;
    if (!completionDate) {
      err.textContent = 'Event date is required.';
      err.classList.remove('hidden');
      return;
    }
  }

  const res  = await fetch(`/api/patients/${PATIENT_HOMER_ID}/complete-event/simple`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      event_id:          _simpleEventId,
      protocol_event_id: _simpleProtocolEventId,
      completion_date:   completionDate,
      session_start:     sessionStart,
      session_end:       sessionEnd,
      notes,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    err.textContent = data.error || 'Failed to save.';
    err.classList.remove('hidden');
    return;
  }
  hideModal('simple-event-modal');
  await loadPatientEvents();
}

// ── Follow-up Call modal ───────────────────────────────────────────────────────

let _followupCallEventId         = null;
let _followupCallProtocolEventId = null;
let _followupCallScheduledDate   = null;

function _followupCallCheckDateChange() {
  const dateVal     = document.getElementById('followup-call-date').value;
  const reasonWrap  = document.getElementById('followup-call-date-reason-wrap');
  const reasonInput = document.getElementById('followup-call-date-reason');
  const isDifferent = dateVal && _followupCallScheduledDate && dateVal.slice(0, 10) !== _followupCallScheduledDate;
  if (isDifferent) {
    reasonWrap.classList.remove('hidden');
  } else {
    reasonWrap.classList.add('hidden');
    reasonInput.value = '';
  }
}

// Toggle a triggered sub-form on/off and clear its fields when hidden
function _fcToggleSubform(type) {
  const subformId = { adverse: 'fc-adverse-form', robot: 'fc-robot-form', watch: 'fc-watch-note' }[type];
  const checked   = document.getElementById(`fc-trigger-${type}`).checked;
  document.getElementById(subformId).classList.toggle('hidden', !checked);
  if (!checked) {
    if (type === 'adverse') {
      document.getElementById('fc-adverse-desc').value   = '';
      document.getElementById('fc-adverse-action').value = '';
      document.getElementById('fc-adverse-paused').checked = false;
    } else if (type === 'robot') {
      document.getElementById('fc-robot-desc').value   = '';
      document.getElementById('fc-robot-paused').checked = false;
      ['pluto', 'mars'].forEach(d => _fcClearDevice(d));
    }
  }
}

function _fcToggleDevice(device) {
  const checked = document.getElementById(`fc-robot-${device}-on`).checked;
  document.getElementById(`fc-robot-${device}-form`).classList.toggle('hidden', !checked);
  if (!checked) _fcClearDevice(device);
}

function _fcClearDevice(device) {
  document.getElementById(`fc-robot-${device}-on`).checked       = false;
  document.getElementById(`fc-robot-${device}-form`).classList.add('hidden');
  document.getElementById(`fc-robot-${device}-desc`).value       = '';
  document.getElementById(`fc-robot-${device}-resolved`).checked = false;
}

function openFollowupCallModal(ev) {
  _followupCallEventId         = ev.id;
  _followupCallProtocolEventId = ev.protocol_event_id;
  _followupCallScheduledDate   = ev.scheduled_date ? ev.scheduled_date[0].slice(0, 10) : null;

  document.getElementById('followup-call-title').textContent             = ev.event_name;
  document.getElementById('followup-call-date').value                    = '';
  document.getElementById('followup-call-duration').value                = '';
  document.getElementById('followup-call-pdf').value                     = '';
  document.getElementById('followup-call-notes').value                   = '';
  document.getElementById('followup-call-date-reason').value             = '';
  document.getElementById('followup-call-date-reason-wrap').classList.add('hidden');
  document.getElementById('followup-call-scheduled-display').textContent = _followupCallScheduledDate || '';
  document.getElementById('followup-call-date').addEventListener('change', _followupCallCheckDateChange, { once: false });

  // Reset triggered section
  ['adverse', 'robot', 'watch'].forEach(type => {
    const cb = document.getElementById(`fc-trigger-${type}`);
    if (cb) { cb.checked = false; _fcToggleSubform(type); }
  });
  // Robot Issue only shown for experimental patients
  const robotWrap = document.getElementById('fc-trigger-robot-wrap');
  if (robotWrap) robotWrap.classList.toggle('hidden', patientData?.group !== 'experimental');
  // Watch Record only shown when at least one watch is currently assigned
  const watchWrap = document.getElementById('fc-trigger-watch-wrap');
  if (watchWrap) watchWrap.classList.toggle('hidden', !(patientData?.agWatchRightID || patientData?.agWatchLeftID));

  const err = document.getElementById('followup-call-error');
  err.textContent = '';
  err.classList.add('hidden');
  showModal('followup-call-modal');
}

async function saveFollowupCall() {
  const dateVal    = document.getElementById('followup-call-date').value;
  const duration   = document.getElementById('followup-call-duration').value.trim();
  const pdfInput   = document.getElementById('followup-call-pdf');
  const notes      = document.getElementById('followup-call-notes').value.trim();
  const reasonWrap = document.getElementById('followup-call-date-reason-wrap');
  const dateReason = document.getElementById('followup-call-date-reason').value.trim();
  const err        = document.getElementById('followup-call-error');
  const saveBtn    = document.getElementById('followup-call-save');
  err.classList.add('hidden');

  const dateChanged = !reasonWrap.classList.contains('hidden');

  if (!dateVal)                            { err.textContent = 'Call date is required.';                    err.classList.remove('hidden'); return; }
  if (!duration || parseInt(duration) < 1) { err.textContent = 'Duration must be at least 1 minute.';       err.classList.remove('hidden'); return; }
  if (!pdfInput.files.length)              { err.textContent = 'Training log PDF is required.';             err.classList.remove('hidden'); return; }
  if (dateChanged && !dateReason)          { err.textContent = 'Please explain why the date is different.'; err.classList.remove('hidden'); return; }
  if (!notes)                              { err.textContent = 'Notes are required.';                       err.classList.remove('hidden'); return; }

  // Collect triggered items
  const triggered = [];

  if (document.getElementById('fc-trigger-adverse').checked) {
    const desc   = document.getElementById('fc-adverse-desc').value.trim();
    const action = document.getElementById('fc-adverse-action').value.trim();
    if (!desc)   { err.textContent = 'Adverse event description is required.';   err.classList.remove('hidden'); return; }
    if (!action) { err.textContent = 'Adverse event action taken is required.';  err.classList.remove('hidden'); return; }
    triggered.push({
      type:        'adverse_event',
      description: desc,
      action_taken: action,
      paused:      document.getElementById('fc-adverse-paused').checked,
    });
  }

  const robotCb = document.getElementById('fc-trigger-robot');
  if (robotCb && robotCb.checked) {
    const desc = document.getElementById('fc-robot-desc').value.trim();
    if (!desc) { err.textContent = 'Robot issue description is required.'; err.classList.remove('hidden'); return; }
    const faults = [];
    for (const device of ['pluto', 'mars']) {
      if (document.getElementById(`fc-robot-${device}-on`).checked) {
        const fd = document.getElementById(`fc-robot-${device}-desc`).value.trim();
        if (!fd) { err.textContent = `${device.charAt(0).toUpperCase() + device.slice(1)} fault description is required.`; err.classList.remove('hidden'); return; }
        faults.push({ device, fault_description: fd, resolved_same_day: document.getElementById(`fc-robot-${device}-resolved`).checked });
      }
    }
    triggered.push({
      type:        'robot_issue',
      description: desc,
      faults,
      paused:      document.getElementById('fc-robot-paused').checked,
    });
  }

  if (document.getElementById('fc-trigger-watch').checked) {
    triggered.push({ type: 'watch_record' });
  }

  const form = new FormData();
  form.append('event_id',          _followupCallEventId);
  form.append('protocol_event_id', _followupCallProtocolEventId);
  form.append('completion_date',   dateVal);
  form.append('duration_minutes',  duration);
  if (dateChanged) form.append('date_change_reason', dateReason);
  form.append('notes',      notes);
  form.append('attachment', pdfInput.files[0]);
  form.append('triggered',  JSON.stringify(triggered));

  saveBtn.disabled = true;
  const res  = await fetch(`/api/patients/${PATIENT_HOMER_ID}/complete-event/followup-call`, {
    method: 'POST',
    body:   form,
  });
  saveBtn.disabled = false;
  const data = await res.json();
  if (!res.ok) {
    err.textContent = data.error || 'Failed to save.';
    err.classList.remove('hidden');
    return;
  }
  hideModal('followup-call-modal');
  await loadPatientEvents();
}

// ── Watch Record modal ────────────────────────────────────────────────────────

const _WR_TRIGGER_NAMES = {
  activation:        'Patient Activation',
  followup_call_d07: 'Follow-up Call Day 07',
  followup_call_d21: 'Follow-up Call Day 21',
  patient_call:      'Patient Call',
};

let _wrEventId = null;

async function openWatchRecordModal(ev) {
  _wrEventId = ev.id;

  // Context banner
  const banner = document.getElementById('wr-context-banner');
  if (ev.triggered_by) {
    const label = _WR_TRIGGER_NAMES[ev.triggered_by.type] || ev.triggered_by.type;
    banner.textContent = `Triggered by: ${label}`;
    banner.className = 'px-4 py-2 rounded-xl text-sm font-medium bg-blue-50 text-blue-700 border border-blue-100';
  } else {
    banner.textContent = 'Scheduled chain follow-up';
    banner.className = 'px-4 py-2 rounded-xl text-sm font-medium bg-slate-50 text-slate-600 border border-slate-200';
  }

  // Current watches + Lost checkboxes
  const oldRight = patientData?.agWatchRightID || null;
  const oldLeft  = patientData?.agWatchLeftID  || null;
  document.getElementById('wr-old-right').textContent = oldRight || 'Not assigned';
  document.getElementById('wr-old-left').textContent  = oldLeft  || 'Not assigned';
  document.getElementById('wr-right-lost-wrap').classList.toggle('hidden', !oldRight);
  document.getElementById('wr-left-lost-wrap').classList.toggle('hidden', !oldLeft);
  document.getElementById('wr-right-lost').checked = false;
  document.getElementById('wr-left-lost').checked  = false;

  // Reset fields
  document.getElementById('wr-new-right').innerHTML  = '<option value="">Loading…</option>';
  document.getElementById('wr-new-left').innerHTML   = '<option value="">Loading…</option>';
  document.getElementById('wr-sync-datetime').value  = '';
  document.getElementById('wr-worn-datetime').value  = '';
  document.getElementById('wr-next-days').value      = '';
  document.getElementById('wr-notes').value          = '';
  setError('wr-error', '');

  _attachDateGuard('wr-sync-datetime', 'wr-error');
  _attachDateGuard('wr-worn-datetime', 'wr-error');

  showModal('watch-record-modal');

  try {
    const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/available-agwatches`);
    const { agwatch } = await res.json();
    const NO_WATCH_OPT = '<option value="__none__">No Watch Available</option>';

    function buildOpts(watches, excludeId) {
      const available = watches.filter(d => d.id !== excludeId);
      return '<option value="">Select watch…</option>' +
        available.map(d => `<option value="${d.id}">${d.id} (${d.serial})</option>`).join('') +
        NO_WATCH_OPT;
    }

    const rightSel = document.getElementById('wr-new-right');
    const leftSel  = document.getElementById('wr-new-left');
    rightSel.innerHTML = buildOpts(agwatch, null);
    leftSel.innerHTML  = buildOpts(agwatch, null);

    rightSel.onchange = () => {
      const prev = leftSel.value;
      leftSel.innerHTML = buildOpts(agwatch, rightSel.value);
      if (prev && [...leftSel.options].some(o => o.value === prev)) leftSel.value = prev;
    };
    leftSel.onchange = () => {
      const prev = rightSel.value;
      rightSel.innerHTML = buildOpts(agwatch, leftSel.value);
      if (prev && [...rightSel.options].some(o => o.value === prev)) rightSel.value = prev;
    };
  } catch (e) {
    setError('wr-error', 'Failed to load available watches.');
  }
}

async function saveWatchRecord() {
  const newRight = document.getElementById('wr-new-right').value;
  const newLeft  = document.getElementById('wr-new-left').value;
  const syncDt   = document.getElementById('wr-sync-datetime').value;
  const wornDt   = document.getElementById('wr-worn-datetime').value;
  const nextDays = document.getElementById('wr-next-days').value;
  const notes    = document.getElementById('wr-notes').value.trim();
  const NO_WATCH = '__none__';

  if (!newRight) { setError('wr-error', 'Please select a right watch or "No Watch Available".'); return; }
  if (!newLeft)  { setError('wr-error', 'Please select a left watch or "No Watch Available".'); return; }
  if (newRight !== NO_WATCH && newRight === newLeft) { setError('wr-error', 'Right and left watches must be different.'); return; }
  const bothEmpty = newRight === NO_WATCH && newLeft === NO_WATCH;
  if (!bothEmpty && !syncDt) { setError('wr-error', 'Sync date & time is required when a watch is assigned.'); return; }
  if (!bothEmpty && !wornDt) { setError('wr-error', 'Worn date & time is required when a watch is assigned.'); return; }
  if (!nextDays || parseInt(nextDays) < 1) { setError('wr-error', 'Next follow-up days must be at least 1.'); return; }
  if ((newRight === NO_WATCH || newLeft === NO_WATCH) && !notes) {
    setError('wr-error', 'Notes are required when a watch is not assigned — explain why.'); return;
  }

  const saveBtn   = document.getElementById('wr-save');
  const rightLost = (document.getElementById('wr-right-lost')?.checked && !!patientData?.agWatchRightID) || false;
  const leftLost  = (document.getElementById('wr-left-lost')?.checked  && !!patientData?.agWatchLeftID)  || false;
  const body = {
    event_id:                 _wrEventId,
    ag_watch_right_new:       newRight === NO_WATCH ? null : newRight,
    ag_watch_left_new:        newLeft  === NO_WATCH ? null : newLeft,
    ag_watch_right_old_lost:  rightLost,
    ag_watch_left_old_lost:   leftLost,
    sync_datetime:            syncDt,
    worn_datetime:            wornDt,
    next_followup_days:       parseInt(nextDays),
    notes,
  };

  saveBtn.disabled = true;
  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/complete-event/watch-record`, body);
  saveBtn.disabled = false;

  if (!ok) { setError('wr-error', data.error || 'Failed to save.'); return; }
  hideModal('watch-record-modal');
  await loadPatient();
  loadPatientEvents();
}

// ── AG Watch Timing modal ─────────────────────────────────────────────────────

let _agwatchEventId         = null;
let _agwatchProtocolEventId = null;
let _agwatchSessionStart    = null;
let _agwatchSessionEnd      = null;

async function openAgwatchTimingModal(ev) {
  _agwatchEventId         = ev.id;
  _agwatchProtocolEventId = ev.protocol_event_id;

  document.getElementById('agwatch-timing-title').textContent = ev.event_name;
  document.getElementById('agwatch-timing-notes').value       = '';
  const errEl = document.getElementById('agwatch-timing-error');
  errEl.textContent = '';
  errEl.classList.add('hidden');

  // Pre-fill session date from scheduled_date[0], fallback to today
  const schedDate = Array.isArray(ev.scheduled_date) ? ev.scheduled_date[0] : ev.scheduled_date;
  const dateOnly  = schedDate ? schedDate.split('T')[0] : new Date().toISOString().split('T')[0];
  document.getElementById('agwatch-session-date').value = dateOnly;

  // Load session bounds from the corresponding home visit complete entry
  const _AGWATCH_SESSION_SOURCE = {
    adl_agwatch_timing_d03: 'home_visit_d03',
    vcg_agwatch_timing_d03: 'home_visit_d03',
    adl_agwatch_timing_d15: 'home_visit_d15',
    vcg_agwatch_timing_d15: 'home_visit_d15',
  };
  const hvId    = _AGWATCH_SESSION_SOURCE[ev.protocol_event_id];
  const hvEntry = hvId ? (_completeEventsCache || []).find(e => e.protocol_event_id === hvId) : null;
  _agwatchSessionStart = hvEntry?.session_start || null;
  _agwatchSessionEnd   = hvEntry?.session_end   || null;
  const windowWrap = document.getElementById('agwatch-session-window-wrap');
  const windowEl   = document.getElementById('agwatch-session-window');
  if (_agwatchSessionStart && _agwatchSessionEnd) {
    windowEl.textContent = `${_agwatchSessionStart.split('T')[1]} – ${_agwatchSessionEnd.split('T')[1]}`;
    windowWrap.classList.remove('hidden');
  } else {
    windowWrap.classList.add('hidden');
  }

  const bodyEl = document.getElementById('agwatch-timing-body');
  bodyEl.innerHTML = '<p class="text-sm text-slate-500">Loading exercises…</p>';
  showModal('agwatch-timing-modal');

  try {
    const res = await fetch(
      `/api/patients/${PATIENT_HOMER_ID}/agwatch-timing-exercises/${ev.protocol_event_id}`
    );
    const data = await res.json();
    if (!res.ok) {
      bodyEl.innerHTML = `<p class="text-sm text-red-500">${data.error || 'Failed to load exercises.'}</p>`;
      return;
    }
    bodyEl.innerHTML = data.exercises.map((ex, i) => `
      <div class="border border-slate-200 rounded-xl p-4 space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide w-6">${i + 1}</span>
          <span class="text-sm font-medium text-slate-800">${ex.name}</span>
          <span class="ml-auto text-xs text-slate-400">${ex.blocks} blocks · ${ex.repetitions} reps</span>
        </div>
        <input type="hidden" class="agwatch-ex-id" value="${ex.exercise_id}">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">Start time</label>
            <div class="flex gap-1">
              <input type="time" class="agwatch-start grow px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" step="1">
              <button type="button" onclick="this.previousElementSibling.value=''" class="px-2 text-slate-400 hover:text-slate-600 border border-slate-200 rounded-xl text-xs">✕</button>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-600 mb-1">End time</label>
            <div class="flex gap-1">
              <input type="time" class="agwatch-end grow px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" step="1">
              <button type="button" onclick="this.previousElementSibling.value=''" class="px-2 text-slate-400 hover:text-slate-600 border border-slate-200 rounded-xl text-xs">✕</button>
            </div>
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Notes <span class="text-slate-400 font-normal">(required if timing is incomplete)</span></label>
          <input type="text" class="agwatch-notes w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="e.g. patient unable to perform">
        </div>
      </div>
    `).join('');
  } catch (e) {
    bodyEl.innerHTML = '<p class="text-sm text-red-500">Network error loading exercises.</p>';
  }
}

async function saveAgwatchTiming() {
  const errEl = document.getElementById('agwatch-timing-error');
  errEl.textContent = '';
  errEl.classList.add('hidden');

  const sessionDate = document.getElementById('agwatch-session-date').value;
  if (!sessionDate) {
    errEl.textContent = 'Session date is required.';
    errEl.classList.remove('hidden');
    return;
  }

  function toDatetime(timeVal) {
    if (!timeVal) return null;
    // time input with step=1 gives HH:MM:SS; pad if browser gives HH:MM
    const t = timeVal.length === 5 ? timeVal + ':00' : timeVal;
    return `${sessionDate}T${t}`;
  }

  const rows    = document.querySelectorAll('#agwatch-timing-body > div');
  const timings = [];
  for (let i = 0; i < rows.length; i++) {
    const row   = rows[i];
    const exId  = row.querySelector('.agwatch-ex-id').value;
    const start = row.querySelector('.agwatch-start').value;
    const end   = row.querySelector('.agwatch-end').value;
    const notes = row.querySelector('.agwatch-notes').value.trim();
    if ((!start || !end) && !notes) {
      errEl.textContent = `Notes are required for exercise ${i + 1} when timing is incomplete.`;
      errEl.classList.remove('hidden');
      return;
    }
    timings.push({ exercise_id: exId, start: toDatetime(start), end: toDatetime(end), notes });
  }

  const globalNotes = document.getElementById('agwatch-timing-notes').value.trim();

  // Hard validation: all non-null timings must fall within the home visit session window
  if (_agwatchSessionStart && _agwatchSessionEnd) {
    const padSec = (dt) => dt.length === 16 ? dt + ':00' : dt;
    const sesStart = padSec(_agwatchSessionStart);
    const sesEnd   = padSec(_agwatchSessionEnd);
    for (let i = 0; i < timings.length; i++) {
      const t = timings[i];
      if (t.start && t.start < sesStart) {
        errEl.textContent = `Exercise ${i + 1}: start time is before the session start (${_agwatchSessionStart.split('T')[1]}).`;
        errEl.classList.remove('hidden');
        return;
      }
      if (t.end && t.end > sesEnd) {
        errEl.textContent = `Exercise ${i + 1}: end time is after the session end (${_agwatchSessionEnd.split('T')[1]}).`;
        errEl.classList.remove('hidden');
        return;
      }
    }
  }

  const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/complete-event/agwatch-timing`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      event_id:          _agwatchEventId,
      protocol_event_id: _agwatchProtocolEventId,
      timings,
      notes: globalNotes,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    errEl.textContent = data.error || 'Failed to save.';
    errEl.classList.remove('hidden');
    return;
  }
  hideModal('agwatch-timing-modal');
  if (_agwatchProtocolEventId?.startsWith('adl_')) _adlTabLoaded = false;
  if (_agwatchProtocolEventId?.startsWith('vcg_')) _vcgTabLoaded = false;
  await loadPatientEvents();
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
    'prescription-printout-save', 'prescription-printout-print',
    'wr-save',
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

  // Auto-open modal if ?action=<event_id> is in the URL, then clean up the URL
  const actionId = new URLSearchParams(window.location.search).get('action');
  if (actionId) {
    history.replaceState(null, '', window.location.pathname);
    const ev = eventsCache.find(e => e.id === actionId);
    if (ev) {
      const opener = EVENT_OPENERS[ev.protocol_event_id];
      if (opener) opener(ev);
    }
  }
});
