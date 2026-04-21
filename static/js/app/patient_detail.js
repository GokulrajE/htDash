/* ============================================================
   patient_detail.js — Patient detail page: overview, tabs, modals
   PATIENT_HOMER_ID is set inline by the template.
   ============================================================ */

let patientData = null;
let isAdmin      = false;
let userPrivilege = '';
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
  if (tab === 'devices')   loadDevicesTab();
  if (tab === 'adl')      loadAdlTab();
  if (tab === 'vcg')      loadVcgTab();
  if (tab === 'calls')         renderCallLogsTab();
  if (tab === 'adverse')       renderAdverseEventsTab();
  if (tab === 'watch-records') renderWatchRecordsTab();
  if (tab === 'robot')         renderRobotIssuesTab();
  if (tab === 'timeline')      renderTimelineTab();
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

  renderPauseBanner(p);
  renderPauseHistoryTable(p);
  renderActions(p);
}

// ── Pause banner ──────────────────────────────────────────────────────────────

function renderPauseBanner(p) {
  const banner = document.getElementById('pause-banner');
  if (!banner) return;

  if (p.status !== 'paused') {
    banner.classList.add('hidden');
    return;
  }

  const today = new Date(); today.setHours(0,0,0,0);
  let daysThisPeriod = 0;
  if (p.trainingPausedDate) {
    const since = new Date(p.trainingPausedDate); since.setHours(0,0,0,0);
    daysThisPeriod = Math.max(0, Math.floor((today - since) / 86400000));
  }
  const priorDays = p.cumulativePauseDays || 0;
  const totalDays = priorDays + daysThisPeriod;
  const critical  = totalDays >= 8;

  document.getElementById('pause-since').textContent      = p.trainingPausedDate ? fmtDate(p.trainingPausedDate) : '—';
  document.getElementById('pause-days-label').textContent = totalDays;
  document.getElementById('pause-days-label').className   = `font-semibold ${critical ? 'text-red-700' : 'text-amber-800'}`;
  document.getElementById('pause-prior-days').textContent   = priorDays;
  document.getElementById('pause-current-days').textContent = daysThisPeriod;

  // Segmented progress bar — one slice per closed epoch + one for current open epoch
  const barContainer = document.getElementById('pause-bar-container');
  if (barContainer) {
    const history   = p.pauseHistory || [];
    const maxDays   = 10;
    // Palette for closed epochs (cycles if > colours available)
    const palette   = ['bg-amber-500', 'bg-yellow-500', 'bg-amber-600', 'bg-yellow-600'];
    const segments  = [];

    history.forEach((epoch, i) => {
      const d = epoch.days ?? 0;
      if (d <= 0) return;
      const pct = Math.min(100, Math.round(d / maxDays * 100));
      segments.push(`<div class="h-2 transition-all ${palette[i % palette.length]}" style="width:${pct}%"></div>`);
    });

    if (daysThisPeriod > 0) {
      const pct = Math.min(100, Math.round(daysThisPeriod / maxDays * 100));
      const cls = critical ? 'bg-red-400' : 'bg-orange-300';
      segments.push(`<div class="h-2 transition-all ${cls}" style="width:${pct}%"></div>`);
    }

    barContainer.innerHTML = segments.join('');
    barContainer.className = `w-full rounded-full h-2 flex overflow-hidden ${critical ? 'bg-red-100' : 'bg-amber-100'}`;
  }

  if (critical) {
    banner.className = banner.className.replace('bg-amber-50 border-amber-300', 'bg-red-50 border-red-300');
  } else {
    banner.className = banner.className.replace('bg-red-50 border-red-300', 'bg-amber-50 border-amber-300');
  }

  _renderPauseReasonPills();
  banner.classList.remove('hidden');
}

function _renderPauseReasonPills() {
  const pillsEl = document.getElementById('pause-reason-pills');
  if (!pillsEl) return;

  const pills = [];
  const cache = eventsCache || [];
  const hasRobotIssue = cache.some(e => e.protocol_event_id === 'resolve_robot_issue_visit');
  const hasAE         = cache.some(e => e.protocol_event_id === 'adverse_event_followup');

  if (hasRobotIssue)
    pills.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200"><i class="fas fa-robot text-[10px]"></i>Robot issue pending</span>`);
  if (hasAE)
    pills.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200"><i class="fas fa-exclamation-circle text-[10px]"></i>Adverse event pending</span>`);
  if (!pills.length && cache.length)
    pills.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">Reason unknown</span>`);

  pillsEl.innerHTML = pills.join('');
}

function renderPauseHistoryTable(p) {
  const section = document.getElementById('pause-history-section');
  const content = document.getElementById('pause-history-content');
  if (!section || !content) return;

  const history = p.pauseHistory || [];
  if (!history.length) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  const _TYPE_LABEL = { robot_issue: 'Robot issue', adverse_event: 'Adverse event' };

  const rows = history.map((epoch, i) => {
    const epochNum  = i + 1;
    const startStr  = epoch.start ? fmtDate(epoch.start) : '—';
    const endStr    = epoch.end   ? fmtDate(epoch.end)   : '<span class="text-amber-600 font-medium">Ongoing</span>';
    const daysStr   = epoch.days != null ? `${epoch.days}d` : '<span class="text-amber-600 font-medium">—</span>';
    const reasons   = (epoch.reasons || []).map(r => {
      const label = _TYPE_LABEL[r.type] || r.type;
      return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600 border border-slate-200 font-medium">${label}</span>`;
    }).join(' ');

    return `
      <tr class="${i % 2 === 0 ? '' : 'bg-slate-50'}">
        <td class="py-1.5 px-3 text-xs text-slate-500 font-medium">Epoch ${epochNum}</td>
        <td class="py-1.5 px-3 text-xs text-slate-700">${startStr}</td>
        <td class="py-1.5 px-3 text-xs text-slate-700">${endStr}</td>
        <td class="py-1.5 px-3 text-xs text-slate-700">${daysStr}</td>
        <td class="py-1.5 px-3 text-xs">${reasons || '<span class="text-slate-400">—</span>'}</td>
      </tr>`;
  }).join('');

  content.innerHTML = `
    <table class="w-full text-left">
      <thead>
        <tr class="border-b border-slate-100">
          <th class="pb-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wide"></th>
          <th class="pb-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Start</th>
          <th class="pb-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">End</th>
          <th class="pb-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Days</th>
          <th class="pb-2 px-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Reasons</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Action buttons ────────────────────────────────────────────────────────────

const ACTION_DEFS = {
  inactive: [
    { label: 'Activate',          color: 'bg-blue-600 hover:bg-blue-700 text-white',   action: () => openActivationModal(null) },
  ],
  active: [],
  paused: [],
  broken_protocol: [],
  training_completed: [
    { label: 'Record A1',         color: 'bg-violet-600 hover:bg-violet-700 text-white', action: () => openA1Modal() },
  ],
  a1_completed: [
    { label: 'Record A2',         color: 'bg-green-600 hover:bg-green-700 text-white', action: () => openA2Modal() },
  ],
};

function renderActions(p) {
  const card    = document.getElementById('actions-card');
  const buttons = document.getElementById('action-buttons');
  if (!card || !buttons) return;

  const defs = ACTION_DEFS[p.status];
  if (!defs || !defs.length || !isAdmin) { card.classList.add('hidden'); return; }

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
let _callLogsCache      = null;  // null = not yet loaded
let _patientDiscontinued = false;  // true if patient has discontinuationDate

async function loadPatientEvents() {
  const completedEl = document.getElementById('patient-completed-events');
  const overdueEl   = document.getElementById('patient-overdue-events');
  const upcomingEl  = document.getElementById('patient-upcoming-events');
  try {
    const [evRes, patRes] = await Promise.all([
      fetch(`/api/patients/${PATIENT_HOMER_ID}/events`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}`),
    ]);
    if (!evRes.ok) throw new Error('Failed to load events');
    const { overdue, upcoming, complete } = await evRes.json();
    if (patRes.ok) patientData = await patRes.json();
    eventsCache = [...overdue, ...upcoming];
    _completeEventsCache = complete || [];
    _callLogsCache = null;  // invalidate so call logs tab re-fetches

    // Set discontinued flag and show banner if patient is discontinued
    _patientDiscontinued = !!patientData?.discontinuationDate;
    const discontinuedBanner = document.getElementById('discontinued-readonly-banner');
    if (_patientDiscontinued && discontinuedBanner) {
      discontinuedBanner.classList.remove('hidden');
    } else if (!_patientDiscontinued && discontinuedBanner) {
      discontinuedBanner.classList.add('hidden');
    }
    _renderPauseReasonPills();
    // Re-render pause banner and history table with updated patient data
    renderPauseBanner(patientData);
    renderPauseHistoryTable(patientData);
    renderTimelineTab();
    renderAdverseEventsTab();
    renderWatchRecordsTab();
    renderRobotIssuesTab();

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
  return Math.round((comp - act) / 86400000) + 1;
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
  'id', 'protocol_event_id', 'event_name', 'scheduled_date',
  'completion_date', 'filed_at', 'flagged', '_synthetic',
  'attachment', 'attachment_caption',
]);

// Preferred display order for known extra fields. 'notes' is always rendered last.
const _FIELD_ORDER = [
  'pluto_id', 'mars_id', 'demo_done',
  'ag_watch_right', 'ag_watch_left',
  'prescription_file',
  'description', 'action_taken', 'training_blocked',
  'visit_start', 'visit_end',
  'duration_minutes',
  'ae_discussions', 'resolutions',
];

const _FIELD_LABELS = {
  ag_watch_right:      'Right Watch',
  ag_watch_left:       'Left Watch',
  pluto_id:            'Pluto Device',
  mars_id:             'Mars Device',
  modem_id:            'Modem Device',
  laptop_id:           'Laptop Device',
  sim_id:              'SIM Card',
  demo_done:           'Demo Done',
  prescription_file:   'Prescription File',
  duration_minutes:    'Duration',
  worn_datetime:       'Worn Date/Time',
  sync_datetime:       'Sync Date/Time',
  next_followup_days:  'Next Follow-up (days)',
  description:         'Description',
  action_taken:        'Action Taken',
  date_change_reason:  'Date Change Reason',
  triggered_by:        'Triggered By',
  triggered:           'Triggered',
  faults:              'Faults',
  devices:             'Devices',
  device_outcomes:      'Device Outcomes',
  device_replacements:  'Device Replacements',
  other_device_outcomes: 'Other Device Outcomes',
  visit_required:       'Visit Required',
  visit_start:          'Visit Start',
  visit_end:            'Visit End',
  ae_discussions:       'AE Discussions',
  resolutions:          'AE Resolutions',
  training_blocked:     'Training Blocked',
  paused:              'Paused',
  notes:               'Notes',
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
    } else if (key === 'triggered_by' && val && typeof val === 'object') {
      const typeLabel   = _WR_TRIGGER_NAMES[val.type] || (val.type || '').replace(/_/g, ' ');
      const triggerEv   = (_completeEventsCache || []).find(e => e.id === val.id);
      const triggerDate = triggerEv?.completion_date ? ` — ${_fmtDateTime(triggerEv.completion_date)}` : '';
      display = typeLabel + triggerDate;
    } else if (key === 'triggered' && Array.isArray(val)) {
      if (!val.length) continue;
      display = val.map(t => _TRIGGERED_LABELS[t.type] || (t.type || '').replace(/_/g, ' ')).join(', ');
    } else if (key === 'faults' && Array.isArray(val)) {
      if (!val.length) continue;
      display = val.map(f => `${f.device}: ${f.fault_description}`).join('; ');
    } else if (key === 'devices' && Array.isArray(val)) {
      if (!val.length) continue;
      display = val.map(d => {
        const dev     = (d.device || '').charAt(0).toUpperCase() + (d.device || '').slice(1);
        const outcome = d.outcome === 'visit_required' ? 'Visit required' : 'Resolved';
        return d.notes ? `${dev}: ${outcome} (${d.notes})` : `${dev}: ${outcome}`;
      }).join('; ');
    } else if ((key === 'device_outcomes' || key === 'other_device_outcomes') && Array.isArray(val)) {
      if (!val.length) continue;
      display = val.map(d => {
        const dev = (d.device || '').charAt(0).toUpperCase() + (d.device || '').slice(1);
        if (d.outcome === 'repaired_on_site') {
          return d.notes ? `${dev}: Repaired (${d.notes})` : `${dev}: Repaired`;
        } else if (d.outcome === 'swapped') {
          const from     = d.old_device_id || '—';
          const to       = d.new_device_id || 'none';
          const swapDesc = d.swap_type === 'fault_driven' ? 'fault-driven' : d.swap_type === 'preventive' ? 'preventive' : '';
          const note     = d.notes ? ` — ${d.notes}` : '';
          const typeTag  = swapDesc ? ` [${swapDesc}]` : '';
          return `${dev}: Swapped ${from} → ${to}${typeTag}${note}`;
        } else if (d.outcome === 'neither') {
          return d.notes ? `${dev}: No action (${d.notes})` : `${dev}: No action`;
        }
        return `${dev}: ${d.outcome || '—'}`;
      }).join('; ');
    } else if (key === 'device_replacements' && Array.isArray(val)) {
      if (!val.length) continue;
      display = val.map(d => {
        const dev  = (d.device || '').charAt(0).toUpperCase() + (d.device || '').slice(1);
        const from = d.old_device_id || '—';
        const to   = d.new_device_id || 'none';
        const note = d.notes ? ` (${d.notes})` : '';
        return `${dev}: ${from} → ${to}${note}`;
      }).join('; ');
    } else if ((key === 'ae_discussions' || key === 'resolutions') && Array.isArray(val)) {
      if (!val.length) continue;
      display = val.map(r => {
        const status = r.resolved ? '✓ Resolved' : '○ Ongoing';
        const resume = r.can_resume_from ? ` (resume from ${r.can_resume_from})` : '';
        const disc   = r.notes ? ` — ${r.notes}` : '';
        return `${status}${resume}${disc}`;
      }).join('; ');
    } else if (key === 'duration_minutes') {
      display = `${val} min`;
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
  // Attachment: render as download link with caption
  if (ev.attachment && ev.id) {
    rows.push(
      `<div class="flex gap-1.5 text-xs"><span class="text-slate-400 shrink-0">Attachment:</span>` +
      `<a href="/api/patients/${PATIENT_HOMER_ID}/download-attachment/${ev.id}" ` +
      `target="_blank" class="text-blue-600 hover:underline">Download PDF</a></div>`
    );
    if (ev.attachment_caption) {
      rows.push(
        `<div class="flex gap-1.5 text-xs"><span class="text-slate-300 shrink-0">Caption:</span>` +
        `<span class="text-slate-400">${ev.attachment_caption}</span></div>`
      );
    }
  }

  return rows.length
    ? `<div class="mt-2 space-y-0.5 border-t border-slate-100 pt-2">${rows.join('')}</div>`
    : '';
}

// ── Attachment helpers ─────────────────────────────────────���──────────────────

function _resetAttachment(prefix) {
  const fi = document.getElementById(`${prefix}-attachment-file`);
  const ci = document.getElementById(`${prefix}-attachment-caption`);
  if (fi) fi.value = '';
  if (ci) { ci.value = ''; ci.disabled = true; }
  if (fi && ci) {
    fi.onchange = () => {
      ci.disabled = !fi.files.length;
      if (!fi.files.length) ci.value = '';
    };
  }
}

function _readAttachment(prefix) {
  const fi = document.getElementById(`${prefix}-attachment-file`);
  const ci = document.getElementById(`${prefix}-attachment-caption`);
  return {
    file:    fi?.files?.[0] || null,
    caption: ci?.value.trim() || '',
  };
}

function _validateAttachment(prefix, errorId) {
  const { file, caption } = _readAttachment(prefix);
  if (file && !caption) {
    setError(errorId, 'Please describe the attachment before saving.');
    return false;
  }
  return true;
}

async function _uploadAttachment(eventId, file, caption, errorId) {
  const form = new FormData();
  form.append('event_id', eventId);
  form.append('caption',  caption);
  form.append('file',     file);
  const res  = await fetch(`/api/patients/${PATIENT_HOMER_ID}/upload-attachment`, {
    method: 'POST',
    body:   form,
  });
  const data = await res.json();
  if (!res.ok) { setError(errorId, data.error || 'Failed to upload attachment.'); return false; }
  return true;
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

function _deriveTransitions(patient, events) {
  const map = new Map();
  const pauseHistory = patient.pauseHistory || [];

  // Events that triggered a pause — id in pauseHistory[*].reasons[*].event_id
  const pausingIds = new Set();
  for (const epoch of pauseHistory) {
    for (const reason of (epoch.reasons || [])) {
      if (reason.event_id) pausingIds.add(reason.event_id);
    }
  }

  // Events that cleared a pause — id matches a closed pauseHistory[*].end_event_id
  const resumingIds = new Set(
    pauseHistory.filter(e => e.end_event_id).map(e => e.end_event_id)
  );

  const brokenDate = (patient.brokenProtocolDate || '').slice(0, 10);
  const discDate   = (patient.discontinuationDate || '').slice(0, 10);

  for (const ev of events) {
    if (ev._synthetic || !ev.id) continue;
    if (pausingIds.has(ev.id)) {
      map.set(ev.id, 'paused');
    } else if (resumingIds.has(ev.id)) {
      map.set(ev.id, 'resumed');
    } else if (brokenDate && (ev.completion_date || '').slice(0, 10) === brokenDate) {
      map.set(ev.id, 'broken_protocol');
    } else if (discDate && (ev.completion_date || '').slice(0, 10) === discDate) {
      map.set(ev.id, 'discontinued');
    }
  }
  return map;
}

function _transitionBadgeHtml(badge) {
  const cfg = {
    paused:          { label: 'Training paused', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    resumed:         { label: 'Training resumed', cls: 'bg-green-100 text-green-700 border-green-200' },
    broken_protocol: { label: 'Protocol broken',  cls: 'bg-red-100 text-red-700 border-red-200' },
    discontinued:    { label: 'Discontinued',      cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  }[badge];
  if (!cfg) return '';
  return `<span class="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}">${cfg.label}</span>`;
}

function renderTimelineTab() {
  const container = document.getElementById('timeline-tab-content');
  if (!container) return;

  // Merge protocol events with synthetic patient milestones, sort most-recent first
  const all = [...(_completeEventsCache || []), ..._syntheticPatientEvents()];
  all.sort((a, b) => {
    const ta = a.filed_at || a.completion_date || '';
    const tb = b.filed_at || b.completion_date || '';
    return tb.localeCompare(ta);
  });

  if (!all.length) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-slate-300">
        <i class="fas fa-stream text-3xl mb-3"></i>
        <p class="text-sm">No completed events yet.</p>
      </div>`;
    return;
  }

  const transitions = _deriveTransitions(patientData || {}, all);

  const items = all.map((ev, i) => {
    const isLast   = i === all.length - 1;
    const schedStr = _fmtDate(ev.scheduled_date);
    const compStr  = ev.completion_date ? _fmtDateTime(ev.completion_date) : '—';
    const filedStr = ev.filed_at ? _fmtDateTime(ev.filed_at) : '';
    const extra    = _timelineExtraFields(ev);
    const rowBg    = i % 2 === 1 ? 'bg-slate-100 rounded-lg' : '';
    const dayNum   = _dayNumber(ev.completion_date);
    const dayLabel = dayNum !== null ? `Day ${dayNum}` : null;
    const isSynthetic = !!ev._synthetic;
    const circleCls   = isSynthetic ? 'bg-blue-500 ring-blue-300' : 'bg-green-500 ring-green-300';
    const badge       = !isSynthetic ? _transitionBadgeHtml(transitions.get(ev.id)) : '';
    return `
      <div class="grid gap-x-4 px-2 -mx-2 ${rowBg}" style="grid-template-columns:1fr 20px 1fr">
        <div class="text-right pb-${isLast ? '2' : '7'} pt-2">
          <p class="text-sm font-semibold text-slate-800">${ev.event_name}</p>
          ${!isSynthetic ? `<p class="text-xs text-slate-400 mt-0.5">Scheduled: ${schedStr}</p>` : ''}
          ${dayLabel ? `<p class="text-sm font-semibold text-indigo-500 mt-1">${dayLabel}</p>` : ''}
          ${badge}
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

// ── Call Logs tab ─────────────────────────────────────────────────────────────

async function renderCallLogsTab() {
  const container = document.getElementById('call-logs-content');
  if (!container) return;
  if (_callLogsCache) { _renderCallLogs(container, _callLogsCache); return; }

  container.innerHTML = `<div class="flex items-center justify-center py-16 text-slate-300"><p class="text-sm">Loading…</p></div>`;

  try {
    const res  = await fetch(`/api/patients/${PATIENT_HOMER_ID}/call-logs`);
    const data = await res.json();
    _callLogsCache = data;
    _renderCallLogs(container, data);
  } catch {
    container.innerHTML = `<p class="text-sm text-red-500 p-4">Failed to load call logs.</p>`;
  }
}

function _renderCallLogs(container, data) {
  const all = [
    ...(data.followup_calls || []).map(c => ({ ...c, _callType: 'followup' })),
    ...(data.patient_calls  || []).map(c => ({ ...c, _callType: 'patient'  })),
  ];
  all.sort((a, b) => (b.completion_date || '').localeCompare(a.completion_date || ''));

  if (!all.length) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-slate-300">
        <i class="fas fa-phone text-3xl mb-3"></i>
        <p class="text-sm">No calls recorded yet.</p>
      </div>`;
    return;
  }
  container.innerHTML = all.map(_callCard).join('');
}

const _TRIGGERED_LABELS = {
  adverse_event: 'Adverse event logged',
  robot_issue_call: 'Robot issue call logged',
  watch_record:  'Watch record triggered',
};

function _callCard(c) {
  const isFollowup   = c._callType === 'followup';
  const borderCls    = isFollowup ? 'border-blue-200'   : 'border-violet-200';
  const headerBg     = isFollowup ? 'bg-blue-50 border-b border-blue-100'   : 'bg-violet-50 border-b border-violet-100';
  const titleCls     = isFollowup ? 'text-blue-800'     : 'text-violet-800';
  const dayBadgeCls  = isFollowup ? 'text-blue-500'     : 'text-violet-500';

  const dayNum  = _dayNumber(c.completion_date);
  const dayBadge = dayNum !== null
    ? `<span class="text-xs font-semibold ${dayBadgeCls}">Day ${dayNum}</span>` : '';
  const dateStr  = c.completion_date ? _fmtDateTime(c.completion_date) : '—';
  const duration = c.duration_minutes ? `${c.duration_minutes} min` : '—';

  const triggered = (c.triggered || []).map(t =>
    `<span class="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">` +
    `<i class="fas fa-arrow-right text-[10px]"></i>${_TRIGGERED_LABELS[t.type] || t.type}</span>`
  ).join('');

  const reasonNote = c.date_change_reason
    ? `<p class="text-xs text-amber-600"><i class="fas fa-info-circle mr-1"></i>Date changed: ${c.date_change_reason}</p>`
    : '';

  const attachmentLink = (c.attachment && c.id)
    ? `<a href="/api/patients/${PATIENT_HOMER_ID}/download-attachment/${c.id}" target="_blank" ` +
      `class="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">` +
      `<i class="fas fa-paperclip"></i>Download attachment</a>`
    : '';

  return `
    <div class="bg-white rounded-xl border ${borderCls} shadow-sm mb-3 overflow-hidden">
      <div class="${headerBg} px-4 py-2.5 flex items-center justify-between">
        <span class="text-sm font-semibold ${titleCls}">${c.event_name || 'Patient Call'}</span>
        <div class="flex items-center gap-3">
          ${dayBadge}
          <span class="text-xs text-slate-500">${dateStr}</span>
        </div>
      </div>
      <div class="px-4 py-3 space-y-1.5">
        <p class="text-xs text-slate-500"><i class="fas fa-clock mr-1"></i>${duration}</p>
        ${c.notes ? `<p class="text-sm text-slate-700">${c.notes}</p>` : ''}
        ${reasonNote}
        ${attachmentLink}
        ${triggered ? `<div class="flex flex-wrap gap-1.5 pt-1">${triggered}</div>` : ''}
      </div>
    </div>`;
}

// ── Adverse Events tab ────────────────────────────────────────────────────────

function renderAdverseEventsTab() {
  const container = document.getElementById('adverse-events-content');
  if (!container) return;

  const events = (_completeEventsCache || [])
    .filter(e => e.protocol_event_id === 'adverse_event')
    .sort((a, b) => (b.completion_date || '').localeCompare(a.completion_date || ''));

  if (!events.length) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-slate-300">
        <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
        <p class="text-sm">No adverse events recorded.</p>
      </div>`;
    return;
  }
  container.innerHTML = events.map(_adverseEventCard).join('');
}

function _adverseEventCard(ev) {
  const dayNum   = _dayNumber(ev.completion_date);
  const dayBadge = dayNum !== null ? `<span class="text-xs font-semibold text-red-500">Day ${dayNum}</span>` : '';
  const dateStr  = ev.completion_date ? _fmtDateTime(ev.completion_date) : '—';

  let triggerStr = '';
  if (ev.triggered_by) {
    const typeLabel   = _WR_TRIGGER_NAMES[ev.triggered_by.type] || (ev.triggered_by.type || '').replace(/_/g, ' ');
    const triggerEv   = (_completeEventsCache || []).find(e => e.id === ev.triggered_by.id);
    const triggerDate = triggerEv?.completion_date ? ` — ${_fmtDateTime(triggerEv.completion_date)}` : '';
    triggerStr = `<div class="text-xs text-slate-500"><span class="text-slate-400">Triggered by:</span> ${typeLabel}${triggerDate}</div>`;
  }

  const pausedStr = ev.paused
    ? `<div class="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5"><i class="fas fa-pause text-[10px]"></i>Training paused</div>`
    : '';

  const attachmentStr = (ev.attachment && ev.id)
    ? `<a href="/api/patients/${PATIENT_HOMER_ID}/download-attachment/${ev.id}" target="_blank"
         class="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
         <i class="fas fa-paperclip"></i>Download attachment</a>` : '';

  return `
    <div class="bg-white rounded-xl border border-red-200 shadow-sm mb-3 overflow-hidden">
      <div class="bg-red-50 border-b border-red-100 px-4 py-2.5 flex items-center justify-between">
        <span class="text-sm font-semibold text-red-800">Adverse Event</span>
        <div class="flex items-center gap-3">
          ${dayBadge}
          <span class="text-xs text-slate-500">${dateStr}</span>
        </div>
      </div>
      <div class="px-4 py-3 space-y-1.5">
        ${ev.description ? `<p class="text-sm text-slate-700">${ev.description}</p>` : ''}
        ${ev.action_taken ? `<div class="text-xs text-slate-500"><span class="text-slate-400">Action taken:</span> ${ev.action_taken}</div>` : ''}
        ${pausedStr}
        ${triggerStr}
        ${attachmentStr}
      </div>
    </div>`;
}

// ── Watch Records tab ─────────────────────────────────────────────────────────

function renderWatchRecordsTab() {
  const container = document.getElementById('watch-records-content');
  if (!container) return;

  const records = (_completeEventsCache || [])
    .filter(e => e.protocol_event_id === 'watch_record')
    .sort((a, b) => (b.completion_date || '').localeCompare(a.completion_date || ''));

  if (!records.length) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-slate-300">
        <i class="fas fa-clock text-3xl mb-3"></i>
        <p class="text-sm">No watch records yet.</p>
      </div>`;
    return;
  }
  container.innerHTML = records.map(_watchRecordCard).join('');
}

function _watchAssignmentRow(side, wr) {
  const key  = `ag_watch_${side}`;
  const data = wr[key];
  if (!data) return '';
  const { old_id, old_lost, new_id } = data;
  // Skip limb entirely if neither old nor new was ever assigned
  if (!old_id && !new_id) return '';

  let arrow;
  if (old_id === new_id) {
    arrow = `<span class="text-slate-500">${old_id ?? 'None'}</span> <span class="text-slate-300 text-xs">no change</span>`;
  } else {
    const oldPart = old_id
      ? `${old_id}${old_lost ? ' <span class="text-red-500 text-xs">(lost)</span>' : ''}`
      : '<span class="text-slate-400">—</span>';
    const newPart = new_id
      ? `<span class="font-medium text-slate-800">${new_id}</span>`
      : '<span class="text-slate-400 text-xs">None</span>';
    arrow = `${oldPart} <span class="text-slate-400 mx-1">→</span> ${newPart}`;
  }
  const label = side.charAt(0).toUpperCase() + side.slice(1);
  return `<div class="flex items-center gap-2 text-xs">
    <span class="text-slate-400 w-8 shrink-0">${label}</span>
    <span>${arrow}</span>
  </div>`;
}

function _watchRecordCard(wr) {
  const dayNum   = _dayNumber(wr.completion_date);
  const dayBadge = dayNum !== null ? `<span class="text-xs font-semibold text-indigo-500">Day ${dayNum}</span>` : '';
  const dateStr  = wr.completion_date ? _fmtDateTime(wr.completion_date) : '—';

  const rightRow = _watchAssignmentRow('right', wr);
  const leftRow  = _watchAssignmentRow('left', wr);

  const syncStr  = wr.sync_datetime  ? `<div class="text-xs text-slate-500"><span class="text-slate-400">Sync:</span> ${_fmtDateTime(wr.sync_datetime)}</div>`  : '';
  const wornStr  = wr.worn_datetime  ? `<div class="text-xs text-slate-500"><span class="text-slate-400">Worn:</span> ${_fmtDateTime(wr.worn_datetime)}</div>`   : '';
  const nextStr  = wr.next_followup_days != null
    ? `<div class="text-xs text-slate-500"><span class="text-slate-400">Next check:</span> ${wr.next_followup_days} days</div>` : '';

  let triggerStr = '';
  if (wr.triggered_by) {
    const typeLabel  = _WR_TRIGGER_NAMES[wr.triggered_by.type] || (wr.triggered_by.type || '').replace(/_/g, ' ');
    const triggerEv  = (_completeEventsCache || []).find(e => e.id === wr.triggered_by.id);
    const triggerDate = triggerEv?.completion_date ? ` — ${_fmtDateTime(triggerEv.completion_date)}` : '';
    triggerStr = `<div class="text-xs text-slate-500"><span class="text-slate-400">Triggered by:</span> ${typeLabel}${triggerDate}</div>`;
  }

  const notesStr = wr.notes
    ? `<div class="text-xs text-slate-500 mt-1"><span class="text-slate-400">Notes:</span> ${wr.notes}</div>` : '';

  const attachmentStr = (wr.attachment && wr.id)
    ? `<a href="/api/patients/${PATIENT_HOMER_ID}/download-attachment/${wr.id}" target="_blank"
         class="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
         <i class="fas fa-paperclip"></i>Download attachment</a>` : '';

  return `
    <div class="bg-white rounded-xl border border-indigo-200 shadow-sm mb-3 overflow-hidden">
      <div class="bg-indigo-50 border-b border-indigo-100 px-4 py-2.5 flex items-center justify-between">
        <span class="text-sm font-semibold text-indigo-800">Watch Record</span>
        <div class="flex items-center gap-3">
          ${dayBadge}
          <span class="text-xs text-slate-500">${dateStr}</span>
        </div>
      </div>
      <div class="px-4 py-3 space-y-1.5">
        ${rightRow}
        ${leftRow}
        ${syncStr}${wornStr}${nextStr}${triggerStr}${notesStr}${attachmentStr}
      </div>
    </div>`;
}

// ── Robot Issues tab ──────────────────────────────────────────────────────────

function renderRobotIssuesTab() {
  const container = document.getElementById('robot-issues-content');
  if (!container) return;

  const issues = (_completeEventsCache || [])
    .filter(e => e.protocol_event_id === 'robot_issue_call')
    .sort((a, b) => (b.completion_date || '').localeCompare(a.completion_date || ''));

  if (!issues.length) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-slate-300">
        <i class="fas fa-robot text-3xl mb-3"></i>
        <p class="text-sm">No robot issues recorded.</p>
      </div>`;
    return;
  }
  container.innerHTML = issues.map(_robotIssueCard).join('');
}

function _robotIssueCard(ev) {
  const dayNum   = _dayNumber(ev.completion_date);
  const dayBadge = dayNum !== null ? `<span class="text-xs font-semibold text-orange-500">Day ${dayNum}</span>` : '';
  const dateStr  = ev.completion_date ? _fmtDateTime(ev.completion_date) : '—';

  let triggerStr = '';
  if (ev.triggered_by) {
    const typeLabel   = _WR_TRIGGER_NAMES[ev.triggered_by.type] || (ev.triggered_by.type || '').replace(/_/g, ' ');
    const triggerEv   = (_completeEventsCache || []).find(e => e.id === ev.triggered_by.id);
    const triggerDate = triggerEv?.completion_date ? ` — ${_fmtDateTime(triggerEv.completion_date)}` : '';
    triggerStr = `<div class="text-xs text-slate-500"><span class="text-slate-400">Triggered by:</span> ${typeLabel}${triggerDate}</div>`;
  }

  const pausedStr = ev.paused
    ? `<div class="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5"><i class="fas fa-pause text-[10px]"></i>Training paused</div>`
    : '';

  const _OUTCOME_LABELS = {
    resolved_same_day: 'Resolved same day',
    device_swap:       'Device swap',
    swap_not_possible: 'Swap not possible',
  };
  const faultsStr = (ev.faults || []).map(f => {
    const outcomeLabel = _OUTCOME_LABELS[f.outcome] || f.outcome || '';
    const outcomeColor = f.outcome === 'resolved_same_day' ? 'text-green-600'
                       : f.outcome === 'device_swap'       ? 'text-blue-600'
                       : 'text-red-600';
    return `<div class="text-xs text-slate-600 bg-orange-50 rounded-lg px-3 py-2 border border-orange-100">
      <span class="font-medium capitalize">${f.device}:</span>
      <span class="ml-1 ${outcomeColor} font-medium">${outcomeLabel}</span>
      ${f.notes ? `<p class="mt-0.5 text-slate-500">${f.notes}</p>` : ''}
    </div>`;
  }).join('');

  const attachmentStr = (ev.attachment && ev.id)
    ? `<a href="/api/patients/${PATIENT_HOMER_ID}/download-attachment/${ev.id}" target="_blank"
         class="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
         <i class="fas fa-paperclip"></i>Download attachment</a>` : '';

  return `
    <div class="bg-white rounded-xl border border-orange-200 shadow-sm mb-3 overflow-hidden">
      <div class="bg-orange-50 border-b border-orange-100 px-4 py-2.5 flex items-center justify-between">
        <span class="text-sm font-semibold text-orange-800">Robot Issue</span>
        <div class="flex items-center gap-3">
          ${dayBadge}
          <span class="text-xs text-slate-500">${dateStr}</span>
        </div>
      </div>
      <div class="px-4 py-3 space-y-1.5">
        ${faultsStr}
        ${pausedStr}
        ${triggerStr}
        ${attachmentStr}
      </div>
    </div>`;
}

// ── Adverse Event modal ────────────────────────────────────────────────────────

const _AE_TRIGGER_NAMES = {
  activation:        'Patient Activation',
  home_visit_d02:    'Home Visit Day 02',
  home_visit_d03:    'Home Visit Day 03',
  home_visit_d15:    'Home Visit Day 15',
  followup_call_d07: 'Follow-up Call Day 07',
  followup_call_d21: 'Follow-up Call Day 21',
  patient_call:      'Patient Call',
};

let _aeEventId = null;

function openAdverseEventModal(ev) {
  _aeEventId = ev.id;
  const triggerLabel = ev.triggered_by
    ? (_AE_TRIGGER_NAMES[ev.triggered_by.type] || ev.triggered_by.type)
    : 'Unknown';
  document.getElementById('ae-context-banner').textContent = `Triggered by: ${triggerLabel}`;
  document.getElementById('ae-date').value         = '';
  document.getElementById('ae-description').value  = '';
  document.getElementById('ae-action-taken').value = '';
  document.getElementById('ae-paused').checked     = false;

  document.getElementById('ae-schedule-visit').checked    = false;
  document.getElementById('ae-visit-date-wrap').classList.add('hidden');
  document.getElementById('ae-visit-date').value           = '';
  document.getElementById('ae-schedule-clinical').checked  = false;
  document.getElementById('ae-clinical-date-wrap').classList.add('hidden');
  document.getElementById('ae-clinical-date').value        = '';

  document.getElementById('ae-schedule-visit').onchange = () => {
    const on = document.getElementById('ae-schedule-visit').checked;
    document.getElementById('ae-visit-date-wrap').classList.toggle('hidden', !on);
    if (!on) document.getElementById('ae-visit-date').value = '';
  };
  document.getElementById('ae-schedule-clinical').onchange = () => {
    const on = document.getElementById('ae-schedule-clinical').checked;
    document.getElementById('ae-clinical-date-wrap').classList.toggle('hidden', !on);
    if (!on) document.getElementById('ae-clinical-date').value = '';
  };

  _resetAttachment('ae');
  setError('ae-error', '');
  _attachDateGuard('ae-date', 'ae-error');
  showModal('adverse-event-modal');
}

async function saveAdverseEvent() {
  const date             = document.getElementById('ae-date').value;
  const description      = document.getElementById('ae-description').value.trim();
  const actionTaken      = document.getElementById('ae-action-taken').value.trim();
  const training_blocked = document.getElementById('ae-paused').checked;
  const saveBtn          = document.getElementById('ae-save');

  const scheduleVisit    = document.getElementById('ae-schedule-visit').checked;
  const visitDate        = document.getElementById('ae-visit-date').value;
  const scheduleClinical = document.getElementById('ae-schedule-clinical').checked;
  const clinicalDate     = document.getElementById('ae-clinical-date').value;

  if (!date)        { setError('ae-error', 'Event date is required.'); return; }
  if (!description) { setError('ae-error', 'Description is required.'); return; }
  if (!actionTaken) { setError('ae-error', 'Action taken is required.'); return; }
  if (scheduleVisit && !visitDate)    { setError('ae-error', 'Follow-up visit date is required.'); return; }
  if (scheduleClinical && !clinicalDate) { setError('ae-error', 'Clinical visit date is required.'); return; }
  if (!_validateAttachment('ae', 'ae-error')) return;

  saveBtn.disabled = true;
  const payload = {
    event_id: _aeEventId, completion_date: date, description,
    action_taken: actionTaken, training_blocked,
    scheduled_followup_visit:  scheduleVisit    ? visitDate    : null,
    scheduled_clinical_visit:  scheduleClinical ? clinicalDate : null,
  };
  const { ok, data } = await apiPost(
    `/api/patients/${PATIENT_HOMER_ID}/complete-event/adverse-event`, payload
  );
  if (!ok) { setError('ae-error', data.error || 'Failed to save.'); saveBtn.disabled = false; return; }

  const { file, caption } = _readAttachment('ae');
  if (file) {
    const uploaded = await _uploadAttachment(data.id, file, caption, 'ae-error');
    if (!uploaded) { saveBtn.disabled = false; return; }
  }

  hideModal('adverse-event-modal');
  saveBtn.disabled = false;
  await loadPatientEvents();
}

// ── Robot Issue Call modal ─────────────────────────────────────────────────────

let _ricEventId = null;

function openRobotIssueCallModal(ev) {
  _ricEventId = ev.id;
  const triggerType  = ev.triggered_by?.type || '';
  const triggerName  = _AE_TRIGGER_NAMES[triggerType] || triggerType;
  const triggerEvent = (_completeEventsCache || []).find(e => e.id === ev.triggered_by?.id);
  const dateStr = triggerEvent?.completion_date ? ` on ${_fmtDateTime(triggerEvent.completion_date)}` : '';
  document.getElementById('ric-context-banner').textContent =
    `Robot issue reported during ${triggerName}${dateStr}`;
  document.getElementById('ric-date').value  = '';
  document.getElementById('ric-notes').value = '';
  _resetAttachment('ric');
  setError('ric-error', '');
  _attachDateGuard('ric-date', 'ric-error');

  // Build per-device inline sections
  const container = document.getElementById('ric-device-sections');
  container.innerHTML = '';
  for (const device of ['pluto', 'mars']) {
    const label = device.charAt(0).toUpperCase() + device.slice(1);
    const sec = document.createElement('div');
    sec.className = 'border border-slate-200 rounded-xl p-4';
    sec.innerHTML = `
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" id="ric-${device}-on" class="w-4 h-4 rounded border-slate-300 accent-orange-600">
        <span class="text-sm font-semibold text-slate-800">${label}</span>
      </label>
      <div id="ric-${device}-form" class="hidden mt-3 space-y-3 pl-6">
        <div>
          <p class="text-xs font-medium text-slate-600 mb-2">Outcome <span class="text-red-400">*</span></p>
          <div class="space-y-1">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="ric-${device}-outcome" value="resolved" class="w-4 h-4 accent-orange-600">
              <span class="text-sm text-slate-700">Resolved by call — no visit needed</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="ric-${device}-outcome" value="visit_required" class="w-4 h-4 accent-orange-600">
              <span class="text-sm text-slate-700">Visit required</span>
            </label>
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Notes <span class="text-red-400">*</span></label>
          <textarea id="ric-${device}-notes" rows="2"
            class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none"
            placeholder="What was discussed for ${label}…"></textarea>
        </div>
      </div>
    `;
    container.appendChild(sec);

    document.getElementById(`ric-${device}-on`).onchange = function () {
      document.getElementById(`ric-${device}-form`).classList.toggle('hidden', !this.checked);
      if (!this.checked) {
        document.querySelectorAll(`input[name="ric-${device}-outcome"]`).forEach(r => r.checked = false);
        document.getElementById(`ric-${device}-notes`).value = '';
      }
      _ricUpdateNotesLabel();
    };
  }

  _ricUpdateNotesLabel();
  showModal('robot-issue-call-modal');
}

function _ricUpdateNotesLabel() {
  const anyChecked = ['pluto', 'mars'].some(d => document.getElementById(`ric-${d}-on`)?.checked);
  document.getElementById('ric-notes-required-badge').classList.toggle('hidden', anyChecked);
  document.getElementById('ric-notes-optional-badge').classList.toggle('hidden', !anyChecked);
}

async function saveRobotIssueCall() {
  const date    = document.getElementById('ric-date').value;
  const notes   = document.getElementById('ric-notes').value.trim();
  const saveBtn = document.getElementById('ric-save');

  if (!date) { setError('ric-error', 'Call date is required.'); return; }

  const devices = [];
  for (const device of ['pluto', 'mars']) {
    if (!document.getElementById(`ric-${device}-on`).checked) continue;
    const outcome  = document.querySelector(`input[name="ric-${device}-outcome"]:checked`)?.value || '';
    const devNotes = document.getElementById(`ric-${device}-notes`).value.trim();
    const label    = device.charAt(0).toUpperCase() + device.slice(1);
    if (!outcome)  { setError('ric-error', `Outcome is required for ${label}.`); return; }
    if (!devNotes) { setError('ric-error', `Notes are required for ${label}.`); return; }
    devices.push({ device, outcome, notes: devNotes });
  }

  if (!devices.length && !notes) {
    setError('ric-error', 'Overall notes are required when no device is selected.');
    return;
  }
  if (!_validateAttachment('ric', 'ric-error')) return;

  saveBtn.disabled = true;
  const { ok, data } = await apiPost(
    `/api/patients/${PATIENT_HOMER_ID}/complete-event/robot-issue-call`,
    { event_id: _ricEventId, completion_date: date, notes: notes || null, devices }
  );
  if (!ok) { setError('ric-error', data.error || 'Failed to save.'); saveBtn.disabled = false; return; }

  const { file, caption } = _readAttachment('ric');
  if (file) {
    const uploaded = await _uploadAttachment(_ricEventId, file, caption, 'ric-error');
    if (!uploaded) { saveBtn.disabled = false; return; }
  }

  hideModal('robot-issue-call-modal');
  saveBtn.disabled = false;
  await loadPatientEvents();
}

// ── Robot Issue Visit modal ────────────────────────────────────────────────────

let _rivEventId = null;
let _rivDevices = []; // [{device_type, old_device_id, available}]

async function openRobotIssueVisitModal(ev) {
  _rivEventId = ev.id;
  _rivDevices = [];

  const callEvent = (_completeEventsCache || []).find(e => e.id === ev.triggered_by?.id);
  const dateStr   = callEvent?.completion_date ? ` on ${_fmtDateTime(callEvent.completion_date)}` : '';
  document.getElementById('riv-context-banner').textContent =
    `Robot issue call${dateStr}`;
  document.getElementById('riv-date').value  = '';
  document.getElementById('riv-notes').value = '';
  document.getElementById('riv-device-rows').innerHTML =
    '<p class="text-sm text-slate-400 italic">Loading device info…</p>';
  _resetAttachment('riv');
  setError('riv-error', '');
  _attachDateGuard('riv-date', 'riv-error');
  showModal('robot-issue-visit-modal');

  try {
    const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/available-devices`);
    const devData = await res.json();
    for (const deviceType of ['pluto', 'mars']) {
      const cur = deviceType === 'pluto' ? devData.current_pluto : devData.current_mars;
      _rivDevices.push({
        device_type:   deviceType,
        old_device_id: cur,
        available:     devData[deviceType] || [],
      });
    }
    _buildRivDeviceRows();
  } catch (e) {
    document.getElementById('riv-device-rows').innerHTML =
      '<p class="text-sm text-red-500">Failed to load device info.</p>';
  }
}

function _buildRivDeviceRows() {
  const container = document.getElementById('riv-device-rows');
  container.innerHTML = '';

  for (const dev of _rivDevices) {
    const label = dev.device_type.charAt(0).toUpperCase() + dev.device_type.slice(1);
    const oldLabel = dev.old_device_id
      ? `<span class="font-mono">${dev.old_device_id}</span>`
      : '<span class="text-slate-400 italic">None assigned</span>';

    let swapOptions = '<option value="">No device available</option>';
    for (const d of dev.available) {
      swapOptions += `<option value="${d.id}">${d.id}</option>`;
    }

    const rowDiv = document.createElement('div');
    rowDiv.className = 'border border-slate-200 rounded-xl p-4 space-y-3';
    rowDiv.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold text-slate-800">${label}</span>
        <span class="text-xs text-slate-500">Current: ${oldLabel}</span>
      </div>
      <div>
        <p class="text-xs font-medium text-slate-600 mb-2">Outcome <span class="text-red-400">*</span></p>
        <div class="space-y-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="riv-${dev.device_type}-outcome" value="repaired_on_site" class="w-4 h-4 accent-orange-600"
              onchange="_rivOutcomeChange('${dev.device_type}')">
            <span class="text-sm text-slate-700">Repaired on site</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="riv-${dev.device_type}-outcome" value="swapped" class="w-4 h-4 accent-orange-600"
              onchange="_rivOutcomeChange('${dev.device_type}')">
            <span class="text-sm text-slate-700">Swapped</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="riv-${dev.device_type}-outcome" value="neither" class="w-4 h-4 accent-orange-600"
              onchange="_rivOutcomeChange('${dev.device_type}')">
            <span class="text-sm text-slate-700">Neither (no action taken)</span>
          </label>
        </div>
      </div>
      <!-- Repaired on site fields -->
      <div id="riv-${dev.device_type}-repaired-fields" class="hidden space-y-2 pl-2 border-l-2 border-orange-200">
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Notes <span class="text-red-400">*</span></label>
          <textarea id="riv-${dev.device_type}-repair-notes" rows="2"
            class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none"
            placeholder="Describe what was done to fix the device…"></textarea>
        </div>
      </div>
      <!-- Swapped fields -->
      <div id="riv-${dev.device_type}-swapped-fields" class="hidden space-y-2 pl-2 border-l-2 border-orange-200">
        <div>
          <p class="text-xs font-medium text-slate-600 mb-2">Swap type <span class="text-red-400">*</span></p>
          <div class="space-y-1">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="riv-${dev.device_type}-swap-type" value="fault_driven" class="w-4 h-4 accent-orange-600">
              <span class="text-sm text-slate-700">Fault-driven (device suspected/confirmed faulty)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="riv-${dev.device_type}-swap-type" value="preventive" class="w-4 h-4 accent-orange-600">
              <span class="text-sm text-slate-700">Preventive (precautionary replacement)</span>
            </label>
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">New device <span class="text-red-400">*</span></label>
          <select id="riv-${dev.device_type}-new-device"
            class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white">
            ${swapOptions}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Notes <span class="text-slate-400 font-normal">(optional)</span></label>
          <textarea id="riv-${dev.device_type}-swap-notes" rows="2"
            class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none"
            placeholder="Reason for swap…"></textarea>
        </div>
      </div>
      <!-- Neither fields -->
      <div id="riv-${dev.device_type}-neither-fields" class="hidden pl-2 border-l-2 border-slate-200">
        <label class="block text-xs font-medium text-slate-600 mb-1">Notes <span class="text-red-400">*</span></label>
        <textarea id="riv-${dev.device_type}-neither-notes" rows="2"
          class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          placeholder="Explain why no action was taken (e.g. only the other device was affected)…"></textarea>
      </div>
    `;
    container.appendChild(rowDiv);
  }
}

function _rivOutcomeChange(deviceType) {
  const outcome = document.querySelector(`input[name="riv-${deviceType}-outcome"]:checked`)?.value;
  document.getElementById(`riv-${deviceType}-repaired-fields`).classList.toggle('hidden', outcome !== 'repaired_on_site');
  document.getElementById(`riv-${deviceType}-swapped-fields`).classList.toggle('hidden', outcome !== 'swapped');
  document.getElementById(`riv-${deviceType}-neither-fields`).classList.toggle('hidden', outcome !== 'neither');
}

async function saveRobotIssueVisit() {
  const date    = document.getElementById('riv-date').value;
  const notes   = document.getElementById('riv-notes').value.trim();
  const saveBtn = document.getElementById('riv-save');

  if (!date) { setError('riv-error', 'Visit date is required.'); return; }

  const deviceOutcomes = [];
  for (const dev of _rivDevices) {
    const outcome = document.querySelector(`input[name="riv-${dev.device_type}-outcome"]:checked`)?.value || '';
    const capLabel = dev.device_type.charAt(0).toUpperCase() + dev.device_type.slice(1);
    if (!outcome) { setError('riv-error', `Outcome is required for ${capLabel}.`); return; }

    let payload = { device: dev.device_type, outcome, old_device_id: dev.old_device_id };

    if (outcome === 'repaired_on_site') {
      const repairNotes = document.getElementById(`riv-${dev.device_type}-repair-notes`).value.trim();
      if (!repairNotes) { setError('riv-error', `${capLabel} repair notes are required.`); return; }
      payload.notes = repairNotes;
    } else if (outcome === 'swapped') {
      const swapType  = document.querySelector(`input[name="riv-${dev.device_type}-swap-type"]:checked`)?.value;
      const newDevice = document.getElementById(`riv-${dev.device_type}-new-device`).value || null;
      const swapNotes = document.getElementById(`riv-${dev.device_type}-swap-notes`).value.trim();
      if (!swapType) { setError('riv-error', `${capLabel} swap type is required.`); return; }
      payload.new_device_id = newDevice;
      payload.swap_type     = swapType;
      payload.notes         = swapNotes || null;
    } else {
      const neitherNotes = document.getElementById(`riv-${dev.device_type}-neither-notes`).value.trim();
      if (!neitherNotes) { setError('riv-error', `${capLabel} notes are required.`); return; }
      payload.notes = neitherNotes;
    }
    deviceOutcomes.push(payload);
  }

  if (!_validateAttachment('riv', 'riv-error')) return;

  saveBtn.disabled = true;
  const { ok, data } = await apiPost(
    `/api/patients/${PATIENT_HOMER_ID}/complete-event/robot-issue-visit`,
    { event_id: _rivEventId, completion_date: date, notes, device_outcomes: deviceOutcomes }
  );
  if (!ok) { setError('riv-error', data.error || 'Failed to save.'); saveBtn.disabled = false; return; }

  const { file, caption } = _readAttachment('riv');
  if (file) {
    const uploaded = await _uploadAttachment(_rivEventId, file, caption, 'riv-error');
    if (!uploaded) { saveBtn.disabled = false; return; }
  }

  hideModal('robot-issue-visit-modal');
  saveBtn.disabled = false;
  await loadPatientEvents();
}

// ── Adverse Event Follow-up modal ─────────────────────────────────────────────

let _aefEventId    = null;
let _aefAeDetails  = [];   // [{id, date, training_blocked}] for each AE in stub

function openAdverseEventFollowupModal(ev) {
  _aefEventId   = ev.id;
  const aeIds   = ev.adverse_event_ids || [];

  // Look up each AE from the complete cache
  _aefAeDetails = aeIds.map(id => {
    const ae = (_completeEventsCache || []).find(e => e.id === id);
    return {
      id:               id,
      date:             ae?.completion_date || '',
      training_blocked: ae?.training_blocked || false,
    };
  });

  // Build context banner
  const banner = document.getElementById('aef-context-banner');
  banner.innerHTML = _aefAeDetails.length
    ? _aefAeDetails.map(ae => {
        const dateStr = ae.date ? ` — ${_fmtDateTime(ae.date)}` : '';
        const pauseTag = ae.training_blocked
          ? ' <span class="text-red-600 font-medium">(training blocked)</span>' : '';
        return `<div>Adverse Event${dateStr}${pauseTag}</div>`;
      }).join('')
    : '<div class="text-slate-400">No adverse events found.</div>';

  // Build per-AE resolution rows
  const rowsEl = document.getElementById('aef-ae-rows');
  rowsEl.innerHTML = _aefAeDetails.map((ae, i) => {
    const dateStr = ae.date ? _fmtDateTime(ae.date) : 'Unknown date';
    const resumeField = ae.training_blocked
      ? `<div id="aef-resume-wrap-${i}" class="hidden mt-2">
           <label class="block text-xs font-medium text-slate-600 mb-1">Can resume from <span class="text-red-400">*</span></label>
           <input type="date" id="aef-resume-${i}" class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
         </div>` : '';
    return `<div class="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
      <div class="text-sm font-medium text-slate-700">Adverse Event — ${dateStr}</div>
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" id="aef-resolved-${i}" onchange="_aefToggleResume(${i})" class="w-4 h-4 rounded border-slate-300">
        <span class="text-sm text-slate-700">Resolved</span>
      </label>
      ${resumeField}
    </div>`;
  }).join('');

  document.getElementById('aef-date').value     = '';
  document.getElementById('aef-duration').value  = '';
  document.getElementById('aef-notes').value     = '';
  _resetAttachment('aef');
  setError('aef-error', '');
  _attachDateGuard('aef-date', 'aef-error');
  showModal('adverse-event-followup-modal');
}

function _aefToggleResume(i) {
  const wrap = document.getElementById(`aef-resume-wrap-${i}`);
  if (!wrap) return;
  const resolved = document.getElementById(`aef-resolved-${i}`).checked;
  wrap.classList.toggle('hidden', !resolved);
  if (!resolved) document.getElementById(`aef-resume-${i}`).value = '';
}

async function saveAdverseEventFollowup() {
  const date     = document.getElementById('aef-date').value;
  const durStr   = document.getElementById('aef-duration').value.trim();
  const notes    = document.getElementById('aef-notes').value.trim();
  const saveBtn  = document.getElementById('aef-save');

  if (!date)   { setError('aef-error', 'Call date is required.'); return; }
  if (!durStr) { setError('aef-error', 'Duration is required.'); return; }
  const duration = parseInt(durStr, 10);
  if (!duration || duration <= 0) { setError('aef-error', 'Duration must be a positive number.'); return; }
  if (!notes)  { setError('aef-error', 'Notes are required.'); return; }

  const resolutions = [];
  for (let i = 0; i < _aefAeDetails.length; i++) {
    const ae       = _aefAeDetails[i];
    const resolved = document.getElementById(`aef-resolved-${i}`).checked;
    let can_resume_from = null;
    if (resolved && ae.training_blocked) {
      can_resume_from = document.getElementById(`aef-resume-${i}`)?.value || '';
      if (!can_resume_from) {
        setError('aef-error', 'Can resume from date is required for resolved training-blocked events.');
        return;
      }
    }
    resolutions.push({ adverse_event_id: ae.id, resolved, can_resume_from });
  }

  if (!_validateAttachment('aef', 'aef-error')) return;

  saveBtn.disabled = true;
  const { ok, data } = await apiPost(
    `/api/patients/${PATIENT_HOMER_ID}/complete-event/adverse-event-followup`,
    { event_id: _aefEventId, completion_date: date, duration_minutes: duration, notes, resolutions }
  );
  if (!ok) { setError('aef-error', data.error || 'Failed to save.'); saveBtn.disabled = false; return; }

  const { file, caption } = _readAttachment('aef');
  if (file) {
    const uploaded = await _uploadAttachment(_aefEventId, file, caption, 'aef-error');
    if (!uploaded) { saveBtn.disabled = false; return; }
  }

  hideModal('adverse-event-followup-modal');
  saveBtn.disabled = false;
  await loadPatientEvents();
}

// ── AE Follow-up Visit modal ──────────────────────────────────────────────────

let _aefvEventId   = null;
let _aefvAeDetails = [];

function _buildAeVisitRows(prefix, aeDetails) {
  return aeDetails.map((ae, i) => {
    const dateStr = ae.date ? _fmtDateTime(ae.date) : 'Unknown date';
    const pauseTag = ae.training_blocked
      ? ' <span class="text-xs text-red-600 font-medium">(training blocked)</span>' : '';
    const resumeField = ae.training_blocked
      ? `<div id="${prefix}-resume-wrap-${i}" class="hidden mt-2">
           <label class="block text-xs font-medium text-slate-600 mb-1">Can resume from <span class="text-red-400">*</span></label>
           <input type="date" id="${prefix}-resume-${i}" class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
         </div>` : '';
    return `<div class="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
      <div class="text-sm font-medium text-slate-700">Adverse Event — ${dateStr}${pauseTag}</div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">Discussion notes</label>
        <textarea id="${prefix}-disc-${i}" rows="2" class="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" placeholder="What was discussed for this AE…"></textarea>
      </div>
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" id="${prefix}-resolved-${i}" onchange="_aeVisitToggleResume('${prefix}', ${i})" class="w-4 h-4 rounded border-slate-300">
        <span class="text-sm text-slate-700">Resolved</span>
      </label>
      ${resumeField}
    </div>`;
  }).join('');
}

function _aeVisitToggleResume(prefix, i) {
  const wrap = document.getElementById(`${prefix}-resume-wrap-${i}`);
  if (!wrap) return;
  const resolved = document.getElementById(`${prefix}-resolved-${i}`).checked;
  wrap.classList.toggle('hidden', !resolved);
  if (!resolved) document.getElementById(`${prefix}-resume-${i}`).value = '';
}

function _collectAeDiscussions(prefix, aeDetails) {
  // Returns {discussions, error}
  const discussions = [];
  for (let i = 0; i < aeDetails.length; i++) {
    const ae       = aeDetails[i];
    const notes    = document.getElementById(`${prefix}-disc-${i}`)?.value.trim() || null;
    const resolved = document.getElementById(`${prefix}-resolved-${i}`).checked;
    let can_resume_from = null;
    if (resolved && ae.training_blocked) {
      can_resume_from = document.getElementById(`${prefix}-resume-${i}`)?.value || '';
      if (!can_resume_from)
        return { discussions: null, error: 'Can resume from date is required for resolved training-blocked events.' };
    }
    discussions.push({ adverse_event_id: ae.id, notes, resolved, can_resume_from: can_resume_from || null });
  }
  return { discussions, error: null };
}

function _loadAeDetails(aeIds) {
  return aeIds.map(id => {
    const ae = (_completeEventsCache || []).find(e => e.id === id);
    return { id, date: ae?.completion_date || '', training_blocked: ae?.training_blocked || false };
  });
}

function _buildAeContextBanner(prefix, aeDetails) {
  const el = document.getElementById(`${prefix}-context-banner`);
  el.innerHTML = aeDetails.length
    ? aeDetails.map(ae => {
        const dateStr  = ae.date ? ` — ${_fmtDateTime(ae.date)}` : '';
        const pauseTag = ae.training_blocked
          ? ' <span class="text-red-600 font-medium">(training blocked)</span>' : '';
        return `<div>Adverse Event${dateStr}${pauseTag}</div>`;
      }).join('')
    : '<div class="text-slate-400">No adverse events found.</div>';
}

function openAeFollowupVisitModal(ev) {
  _aefvEventId   = ev.id;
  _aefvAeDetails = _loadAeDetails(ev.adverse_event_ids || []);
  _buildAeContextBanner('aefv', _aefvAeDetails);
  document.getElementById('aefv-ae-rows').innerHTML = _buildAeVisitRows('aefv', _aefvAeDetails);
  document.getElementById('aefv-start').value = '';
  document.getElementById('aefv-end').value   = '';
  document.getElementById('aefv-notes').value = '';
  _resetAttachment('aefv');
  setError('aefv-error', '');
  _attachSessionEndGuard('aefv-start', 'aefv-end', 'aefv-error');
  _attachDateGuard('aefv-start', 'aefv-error');
  showModal('ae-followup-visit-modal');
}

async function saveAeFollowupVisit() {
  const start   = document.getElementById('aefv-start').value;
  const end     = document.getElementById('aefv-end').value;
  const notes   = document.getElementById('aefv-notes').value.trim();
  const saveBtn = document.getElementById('aefv-save');

  if (!start) { setError('aefv-error', 'Visit start is required.'); return; }
  if (!end)   { setError('aefv-error', 'Visit end is required.'); return; }
  if (start.split('T')[0] !== end.split('T')[0]) { setError('aefv-error', 'Start and end must be on the same date.'); return; }
  if (end <= start) { setError('aefv-error', 'Visit end must be after visit start.'); return; }
  if (!_validateAttachment('aefv', 'aefv-error')) return;

  const { discussions, error } = _collectAeDiscussions('aefv', _aefvAeDetails);
  if (error) { setError('aefv-error', error); return; }

  saveBtn.disabled = true;
  const { ok, data } = await apiPost(
    `/api/patients/${PATIENT_HOMER_ID}/complete-event/ae-followup-visit`,
    { event_id: _aefvEventId, visit_start: start, visit_end: end, notes: notes || null, ae_discussions: discussions }
  );
  if (!ok) { setError('aefv-error', data.error || 'Failed to save.'); saveBtn.disabled = false; return; }

  const { file, caption } = _readAttachment('aefv');
  if (file) {
    const uploaded = await _uploadAttachment(data.id, file, caption, 'aefv-error');
    if (!uploaded) { saveBtn.disabled = false; return; }
  }

  hideModal('ae-followup-visit-modal');
  saveBtn.disabled = false;
  await loadPatientEvents();
}

// ── AE Clinical Visit modal ───────────────────────────────────────────────────

let _aecvEventId   = null;
let _aecvAeDetails = [];

function openAeClinicalVisitModal(ev) {
  _aecvEventId   = ev.id;
  _aecvAeDetails = _loadAeDetails(ev.adverse_event_ids || []);
  _buildAeContextBanner('aecv', _aecvAeDetails);
  document.getElementById('aecv-ae-rows').innerHTML = _buildAeVisitRows('aecv', _aecvAeDetails);
  document.getElementById('aecv-start').value = '';
  document.getElementById('aecv-end').value   = '';
  document.getElementById('aecv-notes').value = '';
  _resetAttachment('aecv');
  setError('aecv-error', '');
  _attachSessionEndGuard('aecv-start', 'aecv-end', 'aecv-error');
  _attachDateGuard('aecv-start', 'aecv-error');
  showModal('ae-clinical-visit-modal');
}

async function saveAeClinicalVisit() {
  const start   = document.getElementById('aecv-start').value;
  const end     = document.getElementById('aecv-end').value;
  const notes   = document.getElementById('aecv-notes').value.trim();
  const saveBtn = document.getElementById('aecv-save');

  if (!start) { setError('aecv-error', 'Visit start is required.'); return; }
  if (!end)   { setError('aecv-error', 'Visit end is required.'); return; }
  if (start.split('T')[0] !== end.split('T')[0]) { setError('aecv-error', 'Start and end must be on the same date.'); return; }
  if (end <= start) { setError('aecv-error', 'Visit end must be after visit start.'); return; }
  if (!_validateAttachment('aecv', 'aecv-error')) return;

  const { discussions, error } = _collectAeDiscussions('aecv', _aecvAeDetails);
  if (error) { setError('aecv-error', error); return; }

  saveBtn.disabled = true;
  const { ok, data } = await apiPost(
    `/api/patients/${PATIENT_HOMER_ID}/complete-event/ae-clinical-visit`,
    { event_id: _aecvEventId, visit_start: start, visit_end: end, notes: notes || null, ae_discussions: discussions }
  );
  if (!ok) { setError('aecv-error', data.error || 'Failed to save.'); saveBtn.disabled = false; return; }

  const { file, caption } = _readAttachment('aecv');
  if (file) {
    const uploaded = await _uploadAttachment(data.id, file, caption, 'aecv-error');
    if (!uploaded) { saveBtn.disabled = false; return; }
  }

  hideModal('ae-clinical-visit-modal');
  saveBtn.disabled = false;
  await loadPatientEvents();
}

// ── AE visit cancellation ─────────────────────────────────────────────────────

async function _cancelAeVisit(prefix) {
  const reason = prompt('Reason for cancellation (required):');
  if (reason === null) return; // user dismissed
  if (!reason.trim()) { alert('Cancellation reason is required.'); return; }

  const eventId  = prefix === 'aefv' ? _aefvEventId : _aecvEventId;
  const modalId  = prefix === 'aefv' ? 'ae-followup-visit-modal' : 'ae-clinical-visit-modal';
  const endpoint = prefix === 'aefv' ? 'ae-followup-visit' : 'ae-clinical-visit';

  const { ok, data } = await apiPost(
    `/api/patients/${PATIENT_HOMER_ID}/cancel-event/${endpoint}`,
    { event_id: eventId, cancellation_reason: reason.trim() }
  );
  if (!ok) { alert(data.error || 'Failed to cancel.'); return; }

  hideModal(modalId);
  await loadPatientEvents();
}

// ── Resolve Robot Issue Visit modal ───────────────────────────────────────────

let _rrivEventId     = null;
let _rrivDevices     = []; // [{device_type, old_device_id, available}] — taken-back devices
let _rrivOtherDevices = []; // [{device_type, old_device_id, available}] — still-assigned devices

async function openResolveRobotIssueVisitModal(ev) {
  _rrivEventId      = ev.id;
  _rrivDevices      = [];
  _rrivOtherDevices = [];

  // Find the triggering robot_issue_visit in the completed events cache
  const triggeredBy = ev.triggered_by;
  let rivEvent = null;
  if (triggeredBy) {
    rivEvent = (_completeEventsCache || []).find(e => e.id === triggeredBy.id);
  }

  let bannerText = 'Robot issue visit';
  if (rivEvent?.completion_date) bannerText += ` on ${_fmtDateTime(rivEvent.completion_date)}`;
  bannerText += ' — device(s) taken back without replacement';
  document.getElementById('rriv-context-banner').textContent = bannerText;
  document.getElementById('rriv-date').value = '';
  document.getElementById('rriv-resume-date').value = '';
  document.getElementById('rriv-notes').value = '';
  document.getElementById('rriv-device-rows').innerHTML =
    '<p class="text-sm text-slate-400 italic">Loading device info…</p>';
  const otherSec = document.getElementById('rriv-other-device-section');
  if (otherSec) { otherSec.innerHTML = ''; otherSec.classList.add('hidden'); }
  _resetAttachment('rriv');
  setError('rriv-error', '');

  document.getElementById('rriv-date').onchange = function () {
    const val = this.value;
    if (val && val > _nowForInput()) {
      setError('rriv-error', 'Visit date cannot be in the future.');
      this.value = '';
    } else {
      setError('rriv-error', '');
    }
  };

  document.getElementById('rriv-resume-date').onchange = function () {
    const val = this.value;
    const today = _nowForInput().slice(0, 10);
    if (val && val > today) {
      setError('rriv-error', 'Can resume from date cannot be in the future.');
      this.value = '';
    } else {
      setError('rriv-error', '');
    }
  };

  showModal('resolve-robot-issue-visit-modal');

  try {
    const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/available-devices`);
    const devData = await res.json();

    // Devices taken back (swapped + null new_device_id)
    const takenBack = (rivEvent?.device_outcomes || []).filter(
      o => o.outcome === 'swapped' && o.new_device_id == null
    );
    const takenBackTypes = new Set(takenBack.map(o => o.device));

    for (const outcome of takenBack) {
      _rrivDevices.push({
        device_type:   outcome.device,
        old_device_id: outcome.old_device_id,
        available:     devData[outcome.device] || [],
      });
    }

    // Other devices still assigned to the patient (not taken back)
    for (const deviceType of ['pluto', 'mars']) {
      const cur = deviceType === 'pluto' ? devData.current_pluto : devData.current_mars;
      if (cur && !takenBackTypes.has(deviceType)) {
        _rrivOtherDevices.push({
          device_type:   deviceType,
          old_device_id: cur,
          available:     devData[deviceType] || [],
        });
      }
    }

    if (_rrivDevices.length === 0) {
      document.getElementById('rriv-device-rows').innerHTML =
        '<p class="text-sm text-slate-400 italic">No taken-back devices found.</p>';
    } else {
      _buildRrivDeviceRows();
    }
    _buildRrivOtherDeviceSection();
  } catch (e) {
    document.getElementById('rriv-device-rows').innerHTML =
      '<p class="text-sm text-red-500">Failed to load device info.</p>';
  }
}

function _buildRrivDeviceRows() {
  const container = document.getElementById('rriv-device-rows');
  container.innerHTML = '';

  for (const dev of _rrivDevices) {
    const label = dev.device_type.charAt(0).toUpperCase() + dev.device_type.slice(1);

    const oldLabel = dev.old_device_id
      ? `<span class="font-mono">${dev.old_device_id}</span>`
      : '<span class="text-slate-400 italic">None</span>';

    let optionsHtml = '<option value="">No device available</option>';
    for (const d of dev.available) {
      optionsHtml += `<option value="${d.id}">${d.id}</option>`;
    }

    const rowDiv = document.createElement('div');
    rowDiv.className = 'border border-slate-200 rounded-xl p-4 space-y-3';
    rowDiv.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-slate-800">${label}</span>
        <span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">Taken back</span>
      </div>
      <div class="grid grid-cols-2 gap-3 items-end">
        <div>
          <p class="text-xs font-medium text-slate-500 mb-1">Device taken back</p>
          <p class="text-sm text-slate-700">${oldLabel}</p>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">Replacement <span class="text-red-400">*</span></label>
          <select id="rriv-${dev.device_type}-select"
            class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
            ${optionsHtml}
          </select>
        </div>
      </div>
      <div id="rriv-${dev.device_type}-notes-row" class="hidden">
        <label class="block text-xs font-medium text-slate-500 mb-1">Reason no device available <span class="text-red-400">*</span></label>
        <textarea id="rriv-${dev.device_type}-notes" rows="2"
          class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          placeholder="Explain why no replacement device is available…"></textarea>
      </div>
    `;
    container.appendChild(rowDiv);

    // Show/hide notes when "No device available" selected
    const sel = document.getElementById(`rriv-${dev.device_type}-select`);
    const notesRow = document.getElementById(`rriv-${dev.device_type}-notes-row`);
    // Show notes immediately if initial selection is "no device"
    notesRow.classList.toggle('hidden', sel.value !== '');
    sel.onchange = function () {
      const isNull = this.value === '';
      notesRow.classList.toggle('hidden', !isNull);
      if (!isNull) document.getElementById(`rriv-${dev.device_type}-notes`).value = '';
    };
  }
}

function _buildRrivOtherDeviceSection() {
  const section = document.getElementById('rriv-other-device-section');
  section.innerHTML = '';
  if (_rrivOtherDevices.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  const deviceNames = _rrivOtherDevices
    .map(d => d.device_type.charAt(0).toUpperCase() + d.device_type.slice(1))
    .join(' / ');
  const wrapper = document.createElement('div');
  wrapper.className = 'border border-slate-200 rounded-xl p-4 space-y-3';
  wrapper.innerHTML = `
    <label class="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" id="rriv-other-device-toggle" class="w-4 h-4 accent-orange-600">
      <span class="text-sm font-medium text-slate-700">Also attended to ${deviceNames}</span>
    </label>
    <div id="rriv-other-device-rows" class="hidden space-y-3 mt-2"></div>
  `;
  section.appendChild(wrapper);
  const toggle = document.getElementById('rriv-other-device-toggle');
  const rows   = document.getElementById('rriv-other-device-rows');
  toggle.onchange = function () {
    rows.classList.toggle('hidden', !this.checked);
    if (this.checked) _buildRrivOtherRows();
    else rows.innerHTML = '';
  };
}

function _buildRrivOtherRows() {
  const rows = document.getElementById('rriv-other-device-rows');
  rows.innerHTML = '';
  for (const dev of _rrivOtherDevices) {
    const label    = dev.device_type.charAt(0).toUpperCase() + dev.device_type.slice(1);
    const oldLabel = dev.old_device_id
      ? `<span class="font-mono">${dev.old_device_id}</span>`
      : '<span class="text-slate-400 italic">None assigned</span>';
    let swapOptions = '<option value="">No device available</option>';
    for (const d of dev.available) swapOptions += `<option value="${d.id}">${d.id}</option>`;

    const rowDiv = document.createElement('div');
    rowDiv.className = 'border border-slate-100 rounded-xl p-3 space-y-3 bg-slate-50';
    rowDiv.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold text-slate-800">${label}</span>
        <span class="text-xs text-slate-500">Current: ${oldLabel}</span>
      </div>
      <div>
        <p class="text-xs font-medium text-slate-600 mb-2">Outcome <span class="text-red-400">*</span></p>
        <div class="space-y-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="rriv-other-${dev.device_type}-outcome" value="repaired_on_site" class="w-4 h-4 accent-orange-600"
              onchange="_rrivOtherOutcomeChange('${dev.device_type}')">
            <span class="text-sm text-slate-700">Repaired on site</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="rriv-other-${dev.device_type}-outcome" value="swapped" class="w-4 h-4 accent-orange-600"
              onchange="_rrivOtherOutcomeChange('${dev.device_type}')">
            <span class="text-sm text-slate-700">Swapped</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="rriv-other-${dev.device_type}-outcome" value="neither" class="w-4 h-4 accent-orange-600"
              onchange="_rrivOtherOutcomeChange('${dev.device_type}')">
            <span class="text-sm text-slate-700">Neither (no action taken)</span>
          </label>
        </div>
      </div>
      <div id="rriv-other-${dev.device_type}-repaired-fields" class="hidden space-y-2 pl-2 border-l-2 border-orange-200">
        <label class="block text-xs font-medium text-slate-600 mb-1">Notes <span class="text-red-400">*</span></label>
        <textarea id="rriv-other-${dev.device_type}-repair-notes" rows="2"
          class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none"
          placeholder="Describe what was done to fix the device…"></textarea>
      </div>
      <div id="rriv-other-${dev.device_type}-swapped-fields" class="hidden space-y-2 pl-2 border-l-2 border-orange-200">
        <div>
          <p class="text-xs font-medium text-slate-600 mb-2">Swap type <span class="text-red-400">*</span></p>
          <div class="space-y-1">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="rriv-other-${dev.device_type}-swap-type" value="fault_driven" class="w-4 h-4 accent-orange-600">
              <span class="text-sm text-slate-700">Fault-driven (device suspected/confirmed faulty)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="rriv-other-${dev.device_type}-swap-type" value="preventive" class="w-4 h-4 accent-orange-600">
              <span class="text-sm text-slate-700">Preventive (precautionary replacement)</span>
            </label>
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">New device <span class="text-red-400">*</span></label>
          <select id="rriv-other-${dev.device_type}-new-device"
            class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white">
            ${swapOptions}
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Notes <span class="text-slate-400 font-normal">(optional)</span></label>
          <textarea id="rriv-other-${dev.device_type}-swap-notes" rows="2"
            class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 resize-none"
            placeholder="Reason for swap…"></textarea>
        </div>
      </div>
      <div id="rriv-other-${dev.device_type}-neither-fields" class="hidden pl-2 border-l-2 border-slate-200">
        <label class="block text-xs font-medium text-slate-600 mb-1">Notes <span class="text-red-400">*</span></label>
        <textarea id="rriv-other-${dev.device_type}-neither-notes" rows="2"
          class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          placeholder="Explain why no action was taken…"></textarea>
      </div>
    `;
    rows.appendChild(rowDiv);
  }
}

function _rrivOtherOutcomeChange(deviceType) {
  const outcome = document.querySelector(`input[name="rriv-other-${deviceType}-outcome"]:checked`)?.value;
  document.getElementById(`rriv-other-${deviceType}-repaired-fields`).classList.toggle('hidden', outcome !== 'repaired_on_site');
  document.getElementById(`rriv-other-${deviceType}-swapped-fields`).classList.toggle('hidden', outcome !== 'swapped');
  document.getElementById(`rriv-other-${deviceType}-neither-fields`).classList.toggle('hidden', outcome !== 'neither');
}

async function saveResolveRobotIssueVisit() {
  const date       = document.getElementById('rriv-date').value;
  const resumeDate = document.getElementById('rriv-resume-date').value;
  const notes      = document.getElementById('rriv-notes').value.trim();
  const saveBtn    = document.getElementById('rriv-save');

  if (!date)       { setError('rriv-error', 'Visit date is required.'); return; }
  if (!resumeDate) { setError('rriv-error', 'Can resume from date is required.'); return; }

  const deviceReplacements = [];
  for (const dev of _rrivDevices) {
    const sel = document.getElementById(`rriv-${dev.device_type}-select`);
    if (!sel) continue;
    const newDeviceId = sel.value || null;
    const capLabel = dev.device_type.charAt(0).toUpperCase() + dev.device_type.slice(1);

    let devNotes = null;
    if (newDeviceId === null) {
      devNotes = (document.getElementById(`rriv-${dev.device_type}-notes`)?.value || '').trim();
      if (!devNotes) {
        setError('rriv-error', `Reason for no replacement ${capLabel} is required.`);
        return;
      }
    }

    deviceReplacements.push({
      device:        dev.device_type,
      old_device_id: dev.old_device_id,
      new_device_id: newDeviceId,
      notes:         devNotes,
    });
  }

  const otherDeviceOutcomes = [];
  const otherToggle = document.getElementById('rriv-other-device-toggle');
  if (otherToggle?.checked) {
    for (const dev of _rrivOtherDevices) {
      const outcome  = document.querySelector(`input[name="rriv-other-${dev.device_type}-outcome"]:checked`)?.value || '';
      const capLabel = dev.device_type.charAt(0).toUpperCase() + dev.device_type.slice(1);
      if (!outcome) { setError('rriv-error', `Outcome is required for ${capLabel}.`); return; }

      let otherPayload = { device: dev.device_type, outcome, old_device_id: dev.old_device_id };
      if (outcome === 'repaired_on_site') {
        const repairNotes = document.getElementById(`rriv-other-${dev.device_type}-repair-notes`).value.trim();
        if (!repairNotes) { setError('rriv-error', `${capLabel} repair notes are required.`); return; }
        otherPayload.notes = repairNotes;
      } else if (outcome === 'swapped') {
        const swapType  = document.querySelector(`input[name="rriv-other-${dev.device_type}-swap-type"]:checked`)?.value;
        const newDevice = document.getElementById(`rriv-other-${dev.device_type}-new-device`).value || null;
        const swapNotes = document.getElementById(`rriv-other-${dev.device_type}-swap-notes`).value.trim();
        if (!swapType) { setError('rriv-error', `${capLabel} swap type is required.`); return; }
        otherPayload.new_device_id = newDevice;
        otherPayload.swap_type     = swapType;
        otherPayload.notes         = swapNotes || null;
      } else {
        const neitherNotes = document.getElementById(`rriv-other-${dev.device_type}-neither-notes`).value.trim();
        if (!neitherNotes) { setError('rriv-error', `${capLabel} notes are required.`); return; }
        otherPayload.notes = neitherNotes;
      }
      otherDeviceOutcomes.push(otherPayload);
    }
  }

  if (!_validateAttachment('rriv', 'rriv-error')) return;

  saveBtn.disabled = true;
  const { ok, data } = await apiPost(
    `/api/patients/${PATIENT_HOMER_ID}/complete-event/resolve-robot-issue-visit`,
    { event_id: _rrivEventId, completion_date: date, can_resume_from: resumeDate, notes,
      device_replacements: deviceReplacements, other_device_outcomes: otherDeviceOutcomes }
  );
  if (!ok) { setError('rriv-error', data.error || 'Failed to save.'); saveBtn.disabled = false; return; }

  const { file, caption } = _readAttachment('rriv');
  if (file) {
    const uploaded = await _uploadAttachment(_rrivEventId, file, caption, 'rriv-error');
    if (!uploaded) { saveBtn.disabled = false; return; }
  }

  hideModal('resolve-robot-issue-visit-modal');
  saveBtn.disabled = false;
  await loadPatientEvents();
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
  home_visit_d02:            (ev) => openHomeVisitModal(ev),
  home_visit_d03:            (ev) => openHomeVisitModal(ev),
  home_visit_d15:            (ev) => openHomeVisitModal(ev),
  followup_call_d07:         (ev) => openFollowupCallModal(ev),
  followup_call_d21:         (ev) => openFollowupCallModal(ev),
  training_completion_d29:   (ev) => openSimpleEventModal(ev),
  adl_agwatch_timing_d01:    (ev) => openAgwatchTimingModal(ev),
  adl_agwatch_timing_d02:    (ev) => openAgwatchTimingModal(ev),
  adl_agwatch_timing_d03:    (ev) => openAgwatchTimingModal(ev),
  adl_agwatch_timing_d15:    (ev) => openAgwatchTimingModal(ev),
  vcg_agwatch_timing_d01:    (ev) => openAgwatchTimingModal(ev),
  vcg_agwatch_timing_d02:    (ev) => openAgwatchTimingModal(ev),
  vcg_agwatch_timing_d03:    (ev) => openAgwatchTimingModal(ev),
  vcg_agwatch_timing_d15:    (ev) => openAgwatchTimingModal(ev),
  watch_record:              (ev) => openWatchRecordModal(ev),
  adverse_event:                (ev) => openAdverseEventModal(ev),
  robot_issue_call:             (ev) => openRobotIssueCallModal(ev),
  robot_issue_visit:            (ev) => openRobotIssueVisitModal(ev),
  adverse_event_followup:       (ev) => openAdverseEventFollowupModal(ev),
  adverse_event_followup_visit: (ev) => openAeFollowupVisitModal(ev),
  adverse_event_clinical_visit: (ev) => openAeClinicalVisitModal(ev),
  resolve_robot_issue_visit:    (ev) => openResolveRobotIssueVisitModal(ev),
  other_device_issue:           (ev) => openOtherDeviceIssueModal(ev),
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
  const clickable = hasOpener && !blocked && !isUpcoming && !_patientDiscontinued;
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
  document.getElementById('device-setup-sim-warning')?.classList.add('hidden');
  window._setupSimExpiry = {};
  _resetAttachment('device-setup');
  _attachDateGuard('device-setup-date', 'device-setup-error');

  const plutoSel = document.getElementById('device-setup-pluto');
  const marsSel  = document.getElementById('device-setup-mars');
  const modemSel = document.getElementById('device-setup-modem');
  const laptopSel = document.getElementById('device-setup-laptop');
  const simSel = document.getElementById('device-setup-sim');

  plutoSel.innerHTML = '<option value="">Loading…</option>';
  marsSel.innerHTML  = '<option value="">Loading…</option>';
  modemSel.innerHTML = '<option value="">Loading…</option>';
  laptopSel.innerHTML = '<option value="">Loading…</option>';
  simSel.innerHTML = '<option value="">Loading…</option>';
  showModal('device-setup-modal');

  try {
    const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/available-devices`);
    if (!res.ok) throw new Error('Failed to fetch devices');
    const data = await res.json();
    const { pluto, mars, modem, laptop, sims } = data;

    plutoSel.innerHTML = '<option value="">Select Pluto device…</option>' +
      pluto.map(d => `<option value="${d.id}">${d.id} (${d.serial})</option>`).join('');
    marsSel.innerHTML  = '<option value="">Select Mars device…</option>' +
      mars.map(d => `<option value="${d.id}">${d.id} (${d.serial})</option>`).join('');
    modemSel.innerHTML = '<option value="">Select Modem device…</option>' +
      modem.map(d => `<option value="${d.id}">${d.id} (${d.serial})</option>`).join('');
    laptopSel.innerHTML = '<option value="">Select Laptop device…</option>' +
      laptop.map(d => `<option value="${d.id}">${d.id} (${d.serial})</option>`).join('');
    const today = new Date(); today.setHours(0,0,0,0);
    const simList = (sims || []).filter(s => {
      if (s.removal_date) return false; // exclude retired
      if (!s.expiryDate) return true;
      const exp = new Date(s.expiryDate); exp.setHours(0,0,0,0);
      return exp >= today; // exclude expired
    });
    window._setupSimExpiry = {};
    simList.forEach(s => {
      if (s.expiryDate) {
        const exp = new Date(s.expiryDate); exp.setHours(0,0,0,0);
        const days = Math.round((exp - today) / 86400000);
        window._setupSimExpiry[s.id] = days;
      }
    });
    simSel.innerHTML = '<option value="">Select SIM card…</option>' +
      simList.map(s => {
        const days = window._setupSimExpiry[s.id];
        const warn = days !== undefined && days <= 5 ? ` ⚠ Expires in ${days}d` : '';
        return `<option value="${s.id}">${s.phoneNumber || s.id}${warn}</option>`;
      }).join('');

    if (!pluto.length) plutoSel.innerHTML = '<option value="">No devices available</option>';
    if (!mars.length)  marsSel.innerHTML  = '<option value="">No devices available</option>';
    if (!modem.length) modemSel.innerHTML = '<option value="">No devices available</option>';
    if (!laptop.length) laptopSel.innerHTML = '<option value="">No devices available</option>';
    if (!simList.length) simSel.innerHTML = '<option value="">No SIM cards available</option>';
  } catch (e) {
    console.error('Error loading devices:', e);
    setError('device-setup-error', 'Failed to load available devices.');
  }
}

function onSetupSimChange() {
  const sel = document.getElementById('device-setup-sim');
  const warn = document.getElementById('device-setup-sim-warning');
  const warnText = document.getElementById('device-setup-sim-warning-text');
  const days = window._setupSimExpiry?.[sel.value];
  if (days !== undefined && days <= 5) {
    warnText.textContent = days === 0
      ? 'This SIM expires today. Recharge before assigning.'
      : `This SIM expires in ${days} day${days === 1 ? '' : 's'}. Consider recharging first.`;
    warn.classList.remove('hidden');
  } else {
    warn.classList.add('hidden');
  }
}

async function submitDeviceSetup() {
  const eventDate = document.getElementById('device-setup-date').value;
  const plutoId   = document.getElementById('device-setup-pluto').value;
  const marsId    = document.getElementById('device-setup-mars').value;
  const modemId   = document.getElementById('device-setup-modem').value;
  const laptopId  = document.getElementById('device-setup-laptop').value;
  const simId     = document.getElementById('device-setup-sim').value;
  const demoDone  = document.getElementById('device-setup-demo').checked;
  const notes     = document.getElementById('device-setup-notes').value;

  if (!eventDate) { setError('device-setup-error', 'Please select an event date.'); return; }
  if (!plutoId)   { setError('device-setup-error', 'Please select a Pluto device.'); return; }
  if (!marsId)    { setError('device-setup-error', 'Please select a Mars device.'); return; }
  if (!modemId)   { setError('device-setup-error', 'Please select a Modem device.'); return; }
  if (!laptopId)  { setError('device-setup-error', 'Please select a Laptop device.'); return; }
  if (!simId)     { setError('device-setup-error', 'Please select a SIM card.'); return; }
  if (!_validateAttachment('device-setup', 'device-setup-error')) return;

  setLoading('device-setup-submit', true);
  const { ok, data } = await apiPost(
    `/api/patients/${PATIENT_HOMER_ID}/complete-event/exp_device_install`,
    { event_id: _deviceSetupEventId, eventDate, plutoId, marsId, modemId, laptopId, simId, demoDone, notes }
  );
  if (!ok) { setLoading('device-setup-submit', false); setError('device-setup-error', data.error || 'Failed to complete device setup.'); return; }

  const { file, caption } = _readAttachment('device-setup');
  if (file) {
    const uploaded = await _uploadAttachment(_deviceSetupEventId, file, caption, 'device-setup-error');
    if (!uploaded) { setLoading('device-setup-submit', false); return; }
  }
  setLoading('device-setup-submit', false);
  hideModal('device-setup-modal');
  loadPatientEvents();
}

// ── Activation modal ──────────────────────────────────────────────────────────

let _activationEventId = null;

function _actToggleSubform(type) {
  const noteId  = { adverse: 'act-adverse-note', robot: 'act-robot-note', watch: 'act-watch-note' }[type];
  const checked = document.getElementById(`act-trigger-${type}`).checked;
  document.getElementById(noteId).classList.toggle('hidden', !checked);
}

async function openActivationModal(evId) {
  _activationEventId = typeof evId === 'object' ? evId.id : evId;
  document.getElementById('activation-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('activation-session-start').value = '';
  document.getElementById('activation-session-end').value   = '';
  document.getElementById('activation-notes').value         = '';
  setError('activation-error', '');
  _resetAttachment('activation');
  _attachDateGuard('activation-session-start', 'activation-error');
  _attachSessionEndGuard('activation-session-start', 'activation-session-end', 'activation-error');

  // Show VCG group row for control patients only
  const vcgRow = document.getElementById('activation-vcg-group-row');
  const vcgSel = document.getElementById('activation-vcg-group');
  const isControl = patientData?.group === 'control';
  if (vcgRow) vcgRow.classList.toggle('hidden', !isControl);
  if (vcgSel) vcgSel.value = '';

  // Reset triggered section
  ['adverse', 'robot', 'watch'].forEach(type => {
    const cb = document.getElementById(`act-trigger-${type}`);
    if (cb) { cb.checked = false; _actToggleSubform(type); }
  });
  document.getElementById('act-trigger-robot-wrap').classList.toggle('hidden', patientData?.group !== 'experimental');
  // Watch record toggle only shown once a watch is assigned (seeded at activation, but triggered_by is for post-seed)
  // Per spec: "Watch Record toggle only shown if at least one watch is currently assigned."
  // At activation time, no watch is assigned yet, so we hide it.
  document.getElementById('act-trigger-watch-wrap').classList.toggle('hidden',
    !(patientData?.agWatchRightID || patientData?.agWatchLeftID));

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
  if (!_validateAttachment('activation', 'activation-error')) return;

  // Collect triggered events
  const triggered = [];
  if (document.getElementById('act-trigger-adverse').checked)
    triggered.push({ type: 'adverse_event' });
  if (!document.getElementById('act-trigger-robot-wrap').classList.contains('hidden') &&
      document.getElementById('act-trigger-robot').checked)
    triggered.push({ type: 'robot_issue_call' });
  if (!document.getElementById('act-trigger-watch-wrap').classList.contains('hidden') &&
      document.getElementById('act-trigger-watch').checked)
    triggered.push({ type: 'watch_record' });
  if (document.getElementById('act-trigger-other-device').checked)
    triggered.push({ type: 'other_device_issue' });
  body.triggered = triggered;

  setLoading('activation-submit', true);
  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/activate`, body);
  if (!ok) { setLoading('activation-submit', false); setError('activation-error', data.error || 'Failed to activate patient.'); return; }

  const { file, caption } = _readAttachment('activation');
  if (file) {
    const uploaded = await _uploadAttachment(_activationEventId, file, caption, 'activation-error');
    if (!uploaded) { setLoading('activation-submit', false); return; }
  }
  setLoading('activation-submit', false);
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
        document.getElementById('adl-prescription-notes').value = '';
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

function _prescriptionCard(data, exercises, dayLabel, headerClass, attachmentPath, timingDataList) {
  const exMap = Object.fromEntries(exercises.map(e => [e.id, e]));

  // Build a timing map for each timing dataset in the array
  const timingMaps = (timingDataList || []).map(td =>
    td ? Object.fromEntries((td.timings || []).map(t => [t.exercise_id, t])) : {}
  );

  // Determine day labels based on array length (e.g., ['D01','D02','D03'] or ['D15'])
  const dayTags = timingDataList?.length === 1 ? ['D15'] : ['D01', 'D02', 'D03'];

  const rows = (data.prescribed_exercises || []).map((pe, i) => {
    const name = exMap[pe.exercise_id]?.name || pe.exercise_id;
    const notesHtml = pe.notes
      ? `<p class="text-xs text-slate-400 mt-0.5 italic">${pe.notes}</p>` : '';

    // Build timing HTML for each day
    const timingLines = timingMaps.map((tmap, idx) => {
      const t = tmap[pe.exercise_id];
      if (!t) return '';
      const start = t.start ? t.start.split('T')[1].slice(0, 5) : '—';
      const end = t.end ? t.end.split('T')[1].slice(0, 5) : '—';
      return `<p class="text-xs font-mono text-slate-400">${dayTags[idx]}: ${start} → ${end}</p>`;
    }).join('');

    return `
      <div class="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-b-0">
        <span class="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">${i + 1}</span>
        <div class="flex-1 min-w-0">
          <span class="text-sm font-semibold text-slate-800">${name}</span>
          ${notesHtml}
        </div>
        <div class="flex-shrink-0 text-right">
          <p class="text-xs font-medium text-slate-500 whitespace-nowrap">${pe.blocks} blocks × ${pe.repetitions} reps</p>
          ${timingLines}
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

// ── Devices Tab (activity graph) ──────────────────────────────────────────────

let _devicesTabLoaded = false;
let _devicesCharts = {};  // device → Chart instance

async function loadDevicesTab() {
  if (_devicesTabLoaded) return;
  _devicesTabLoaded = true;
  const container = document.getElementById('devices-tab-content');
  if (!container) return;

  // Only show graph for experimental patients
  if (patientData?.group !== 'experimental') {
    container.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-slate-400">
      <i class="fas fa-mobile-alt text-3xl mb-3"></i>
      <p class="font-medium">No robot devices for control patients</p>
    </div>`;
    return;
  }

  await _renderDeviceGraphs(container);
}

async function _renderDeviceGraphs(container) {
  container.innerHTML = `<div class="flex items-center justify-center py-12 text-slate-400">
    <i class="fas fa-spinner fa-spin mr-2"></i><span>Loading device data…</span></div>`;

  try {
    const res  = await fetch(`/api/patients/${PATIENT_HOMER_ID}/activity`);
    const data = await res.json();
    const hasData = data.pluto || data.mars;

    const syncBtn = `<button onclick="_syncActivity()"
      class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-700 text-white rounded-lg hover:bg-slate-800 active:scale-95 transition-all">
      <i class="fas fa-sync-alt text-[10px]"></i> Sync from S3
    </button>`;

    if (!hasData) {
      container.innerHTML = `
        <div class="flex items-center justify-end mb-4">${syncBtn}</div>
        <div class="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-200">
          <i class="fas fa-chart-line text-4xl mb-4 opacity-40"></i>
          <p class="font-semibold text-slate-500">No device data available yet</p>
          <p class="text-sm mt-1 text-slate-400">Use "Sync from S3" to download the latest data.</p>
        </div>`;
      return;
    }

    container.innerHTML = `<div class="flex items-center justify-end mb-1">${syncBtn}</div>`;

    const DEVICE_CFG = {
      pluto: { label: 'Pluto',  color: '#2563eb', bg: '#eff6ff', accent: '#1d4ed8', iconColor: 'text-blue-600',  badgeBg: 'bg-blue-50',  badgeBorder: 'border-blue-200',  badgeText: 'text-blue-700'  },
      mars:  { label: 'Mars',   color: '#059669', bg: '#f0fdf4', accent: '#047857', iconColor: 'text-emerald-600', badgeBg: 'bg-emerald-50', badgeBorder: 'border-emerald-200', badgeText: 'text-emerald-700' },
    };

    for (const [deviceKey, cfg] of Object.entries(DEVICE_CFG)) {
      const d = data[deviceKey];
      if (!d) continue;

      // Stat: days with data, total minutes, avg
      const actualDays = d.data.filter(v => v !== null && v > 0).length;
      const totalMins  = d.data.reduce((s, v) => s + (v || 0), 0).toFixed(1);
      const avgMins    = actualDays ? (totalMins / actualDays).toFixed(1) : '—';

      // Check if there are actual CSV date files available for this device (dates_with_data)
      // If dates_with_data is missing, empty, or not an array, show "No data available"
      const hasDatesWithData = Array.isArray(d.dates_with_data) && d.dates_with_data.length > 0;
      console.log(`[Device ${deviceKey}] API Response:`, {
        dates_with_data: d.dates_with_data,
        is_array: Array.isArray(d.dates_with_data),
        length: d.dates_with_data?.length,
        hasDatesWithData,
        actualDays
      });
      console.log(`[Device ${deviceKey}] Condition check:`, { hasDatesWithData, willShowGraph: hasDatesWithData, willShowNoData: !hasDatesWithData });

      if (!hasDatesWithData) {
        console.log(`[Device ${deviceKey}] Showing "No data available" message because hasDatesWithData is false`);
        const card = document.createElement('div');
        card.className = 'bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden';
        card.innerHTML = `
          <div class="flex items-center gap-3 px-6 py-4 border-b border-slate-100" style="background:${cfg.bg}">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm" style="background:${cfg.color}">
              <i class="fas fa-robot text-white text-sm"></i>
            </div>
            <div>
              <h3 class="text-sm font-bold text-slate-800">${cfg.label}</h3>
              <p class="text-xs text-slate-500">${d.start_date} → ${d.end_date} &nbsp;·&nbsp; Training side: <strong>${d.training_side}</strong></p>
            </div>
          </div>
          <div class="flex flex-col items-center justify-center py-16 text-slate-400 bg-white">
            <i class="fas fa-inbox text-3xl mb-3 opacity-40"></i>
            <p class="font-semibold text-slate-500">No data available</p>
            <p class="text-sm mt-1 text-slate-400">No activity recorded for this device during this period.</p>
          </div>`;
        container.appendChild(card);
        continue;
      }
      console.log(`[Device ${deviceKey}] Showing graph because hasDatesWithData is true`);

      // Prescribed mechanism chips
      const mechChips = Object.entries(d.prescribed || {}).map(([mech, mins]) =>
        `<div class="flex flex-col items-center px-3 py-2 rounded-xl border ${cfg.badgeBorder} ${cfg.badgeBg} min-w-[56px]">
          <span class="text-[11px] font-bold ${cfg.badgeText} tracking-wide">${mech}</span>
          <span class="text-base font-bold ${cfg.badgeText} leading-tight">${mins}</span>
          <span class="text-[10px] text-slate-400 -mt-0.5">min/day</span>
        </div>`
      ).join('');

      const mismatchBanner = d.mismatch ? `
        <!-- Mismatch warning -->
        <div class="flex items-start gap-3 px-6 py-3 bg-orange-50 border-b border-orange-200">
          <i class="fas fa-exclamation-triangle text-orange-500 mt-0.5 shrink-0"></i>
          <div>
            <p class="text-sm font-semibold text-orange-800">Config date mismatch (${d.mismatch.diff_days > 0 ? '+' : ''}${d.mismatch.diff_days} day${Math.abs(d.mismatch.diff_days) !== 1 ? 's' : ''})</p>
            <p class="text-xs text-orange-600 mt-0.5">Config StartDate: <strong>${d.mismatch.config_start}</strong> · Activation date: <strong>${d.mismatch.activation}</strong>. The graph window may not align with actual therapy dates.</p>
          </div>
        </div>` : '';

      const card = document.createElement('div');
      card.className = 'bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden';
      card.innerHTML = `
        <!-- Card header -->
        <div class="flex items-center gap-3 px-6 py-4 border-b border-slate-100" style="background:${cfg.bg}">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm" style="background:${cfg.color}">
            <i class="fas fa-robot text-white text-sm"></i>
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-800">${cfg.label}</h3>
            <p class="text-xs text-slate-500">${d.start_date} → ${d.end_date} &nbsp;·&nbsp; Training side: <strong>${d.training_side}</strong></p>
          </div>
          <div class="ml-auto flex items-center gap-4 text-right">
            <div>
              <p class="text-xs text-slate-400 leading-none">Total</p>
              <p class="text-lg font-bold leading-tight" style="color:${cfg.color}">${totalMins}<span class="text-xs font-normal text-slate-400 ml-0.5">min</span></p>
            </div>
            <div>
              <p class="text-xs text-slate-400 leading-none">Avg/day</p>
              <p class="text-lg font-bold leading-tight" style="color:${cfg.color}">${avgMins}<span class="text-xs font-normal text-slate-400 ml-0.5">min</span></p>
            </div>
            <div>
              <p class="text-xs text-slate-400 leading-none">Active days</p>
              <p class="text-lg font-bold leading-tight" style="color:${cfg.color}">${actualDays}<span class="text-xs font-normal text-slate-400 ml-0.5">/ 30</span></p>
            </div>
          </div>
        </div>

        <!-- Prescription row -->
        <div class="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div class="flex items-center gap-3 mb-3">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Prescribed Mechanisms</span>
            <span class="text-xs text-slate-400">Daily target: <strong style="color:${cfg.color}">${d.target} min total</strong></span>
          </div>
          <div class="flex flex-wrap gap-2">${mechChips}</div>
        </div>

        ${mismatchBanner}

        <!-- Chart -->
        <div class="px-6 pt-5 pb-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Daily Activity</span>
            <div class="flex items-center gap-4 text-xs text-slate-400">
              <span class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${cfg.color}"></span>Actual</span>
              <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-0" style="border-top:2px dotted #f87171"></span>Target</span>
              <span class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-full border-2" style="background:${cfg.color};border-color:white;box-shadow:0 0 0 2px ${cfg.color}"></span>Hover dot for breakdown</span>
            </div>
          </div>
          <div style="position:relative;height:220px">
            <canvas id="devices-chart-${deviceKey}"></canvas>
          </div>
        </div>

        <!-- Breakdown panel (hidden until dot clicked) -->
        <div id="devices-detail-${deviceKey}" class="hidden border-t border-slate-100"></div>`;

      container.appendChild(card);

      const ctx = document.getElementById(`devices-chart-${deviceKey}`).getContext('2d');
      if (_devicesCharts[deviceKey]) _devicesCharts[deviceKey].destroy();

      // Format labels as short dates for display
      const shortLabels = d.labels.map(lbl => {
        const dt = new Date(lbl);
        return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      });

      _devicesCharts[deviceKey] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: shortLabels,
          datasets: [
            {
              label: 'Session (min)',
              data: d.data,
              borderColor: cfg.color,
              backgroundColor: cfg.color + '22',
              borderWidth: 2.5,
              pointRadius: d.labels.map(lbl => d.dates_with_data.includes(lbl) ? 5 : 3),
              pointBackgroundColor: d.labels.map(lbl =>
                d.dates_with_data.includes(lbl) ? cfg.color : cfg.color + '88'),
              pointHoverRadius: 7,
              fill: true,
              tension: 0.3,
              spanGaps: false,
              order: 2,
            },
            {
              label: 'Target',
              data: d.labels.map(() => d.target),
              borderColor: '#f87171',
              borderDash: [2, 2],
              borderWidth: 2,
              pointRadius: 0,
              fill: false,
              tension: 0,
              order: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1e293b',
              padding: 10,
              titleFont: { size: 12 },
              bodyFont: { size: 12 },
              callbacks: {
                title: items => d.labels[items[0].dataIndex],
                label: c => c.dataset.label === 'Target'
                  ? `  Target: ${c.parsed.y} min`
                  : `  Actual: ${c.parsed.y !== null ? c.parsed.y + ' min' : 'No session'}`,
                afterBody: () => {
                  // Hide the dot info comment box completely
                  return [];
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 0 },
            },
            y: {
              beginAtZero: true,
              grid: { color: '#f1f5f9' },
              ticks: { font: { size: 11 }, stepSize: 10 },
              title: { display: true, text: 'Minutes', font: { size: 11 }, color: '#94a3b8' },
            },
          },
          onHover: (evt, elements) => {
            if (!elements || !elements.length) {
              // Hide detail panel when not hovering
              const panel = document.getElementById(`devices-detail-${deviceKey}`);
              if (panel) panel.classList.add('hidden');
              return;
            }

            const hoveredElement = elements.find(el => el.datasetIndex === 0);
            if (!hoveredElement) return;

            const idx = hoveredElement.index;
            if (idx === undefined || idx === null) return;

            const hoveredDate = d.labels[idx];
            const actualValue = d.data[idx];
            const displayDate = shortLabels[idx];

            console.log('Hovered date:', hoveredDate, 'Actual value:', actualValue, 'Has data:', d.dates_with_data.includes(hoveredDate));

            // Show detail only if the date has a data file (CSV exists in Dates folder)
            if (d.dates_with_data.includes(hoveredDate)) {
              _loadDeviceDetail(hoveredDate, deviceKey, cfg.label, cfg.color, displayDate);
            } else {
              // Show "No data available" message when hovering over a point with no data
              const panel = document.getElementById(`devices-detail-${deviceKey}`);
              if (panel) {
                panel.classList.remove('hidden');
                panel.innerHTML = `
                  <div class="px-6 py-6 flex flex-col items-center justify-center">
                    <i class="fas fa-inbox text-2xl mb-2 text-slate-300"></i>
                    <p class="text-sm text-slate-400 text-center">No data available for ${displayDate || hoveredDate}</p>
                  </div>`;
              }
            }
          },
        },
      });
    }
  } catch (e) {
    container.innerHTML = `<div class="flex items-center justify-center py-12 text-red-500 text-sm gap-2">
      <i class="fas fa-exclamation-circle"></i> Failed to load device data.
    </div>`;
  }
}

async function _syncActivity() {
  const container = document.getElementById('devices-tab-content');
  if (!container) return;
  container.innerHTML = `<div class="flex items-center justify-center py-10 text-slate-400">
    <i class="fas fa-sync-alt fa-spin mr-2"></i><span>Syncing from S3…</span></div>`;
  try {
    const r = await fetch(`/api/patients/${PATIENT_HOMER_ID}/sync-activity`, { method: 'POST' });
    const res = await r.json();
    if (!r.ok || res.error) {
      container.innerHTML = `<div class="flex flex-col items-center justify-center py-16 text-slate-400">
        <i class="fas fa-exclamation-circle text-2xl mb-3 text-red-400"></i>
        <p class="text-sm text-red-500">${res.error || 'Sync failed'}</p>
        <button onclick="_renderDeviceGraphs(document.getElementById('devices-tab-content'))"
          class="mt-4 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">
          Try viewing existing data
        </button>
      </div>`;
      return;
    }
    _devicesTabLoaded = false;
    Object.values(_devicesCharts).forEach(c => c.destroy());
    _devicesCharts = {};
    await _renderDeviceGraphs(container);
  } catch (e) {
    container.innerHTML = `<div class="flex items-center justify-center py-10 text-red-500 text-sm">
      <i class="fas fa-exclamation-circle mr-2"></i>Network error during sync.
    </div>`;
  }
}

async function _loadDeviceDetail(date, deviceKey, deviceLabel, color, displayDate) {
  const panel = document.getElementById(`devices-detail-${deviceKey}`);
  if (!panel) {
    console.warn(`Panel not found: devices-detail-${deviceKey}`);
    return;
  }

  panel.classList.remove('hidden');
  panel.innerHTML = `<div class="flex items-center justify-center py-6 text-slate-400 text-sm">
    <i class="fas fa-spinner fa-spin mr-2"></i>Loading…</div>`;

  try {
    // Ensure date is in YYYY-MM-DD format
    let dateParam = date;
    if (date && typeof date === 'string' && date.includes('T')) {
      // Extract just the date part if it's ISO datetime
      dateParam = date.split('T')[0];
    }

    const url = `/api/patients/${PATIENT_HOMER_ID}/activity/${dateParam}/${deviceKey}`;
    console.log('Fetching device detail:', url, 'Original date:', date, 'Param:', dateParam);

    const res = await fetch(url);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error('API error:', res.status, errorData);
      panel.innerHTML = `<p class="text-sm text-slate-400 text-center py-4">${errorData.error || 'No data available'}</p>`;
      return;
    }

    const d = await res.json();
    if (d.error) {
      panel.innerHTML = `<p class="text-sm text-slate-400 text-center py-4">${d.error}</p>`;
      return;
    }

    if (!d.mechanisms || !d.durations || !d.target) {
      console.warn('Invalid data structure:', d);
      panel.innerHTML = `<p class="text-sm text-slate-400 text-center py-4">Invalid data structure</p>`;
      return;
    }

    const maxVal = Math.max(...d.durations, ...d.target, 1);
    const bars = d.mechanisms.map((mech, i) => {
      const used    = d.durations[i] || 0;
      const tgt     = d.target[i]    || 0;
      const pctUsed = maxVal > 0 ? Math.round((used / maxVal) * 100) : 0;
      const pctTgt  = maxVal > 0 ? Math.round((tgt  / maxVal) * 100) : 0;
      return `<div class="flex items-center gap-3">
        <span class="w-14 text-right text-xs font-medium text-slate-600 shrink-0">${mech}</span>
        <div class="flex-1 relative h-5 bg-slate-100 rounded-full overflow-hidden">
          <div class="absolute inset-y-0 left-0 rounded-full" style="width:${pctUsed}%;background:${color}88"></div>
          <div class="absolute inset-y-0 w-0.5 bg-red-400" style="left:${pctTgt}%"></div>
        </div>
        <span class="text-xs text-slate-500 w-28 shrink-0">${used} / ${tgt} min</span>
      </div>`;
    }).join('');

    panel.innerHTML = `
      <div class="px-6 py-4">
        <div class="flex items-center justify-between mb-3">
          <p class="text-xs font-semibold text-slate-600">${deviceLabel} — ${displayDate || date}</p>
          <span class="text-xs text-slate-400">Bar = used &nbsp;|&nbsp; <span class="text-red-400 font-bold">|</span> = target</span>
        </div>
        <div class="space-y-2">${bars}</div>
      </div>`;
  } catch (e) {
    console.error('Failed to load device detail:', e);
    panel.innerHTML = `<p class="text-sm text-red-400 text-center py-4">Failed to load breakdown: ${e.message}</p>`;
  }
}

async function loadAdlTab() {
  if (_adlTabLoaded) return;
  const container = document.getElementById('adl-tab-content');
  if (!container) return;

  try {
    const [exRes, d1Res, d15Res, t01Res, t02Res, t03Res, t15Res] = await Promise.all([
      fetch('/api/exercises?type=adl'),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/prescription/adl_prescription_d01`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/prescription/adl_prescription_d15`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/agwatch-timing/adl_agwatch_timing_d01`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/agwatch-timing/adl_agwatch_timing_d02`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/agwatch-timing/adl_agwatch_timing_d03`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/agwatch-timing/adl_agwatch_timing_d15`),
    ]);
    const exercises = exRes.ok  ? await exRes.json()  : [];
    const d1        = d1Res.ok  ? await d1Res.json()  : null;
    const d15       = d15Res.ok ? await d15Res.json() : null;
    const t01       = t01Res.ok ? await t01Res.json() : null;
    const t02       = t02Res.ok ? await t02Res.json() : null;
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
      if (d15) html += _prescriptionCard(d15, exercises, 'Day 15 Revision',    'bg-blue-600 text-white',  printD15?.attachment, [t15]);
      if (d1)  html += _prescriptionCard(d1,  exercises, 'Day 1 Prescription', 'bg-blue-400 text-white', printD1?.attachment,  [t01, t02, t03]);
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
    const [exRes, d1Res, d15Res, t01Res, t02Res, t03Res, t15Res] = await Promise.all([
      fetch(`/api/exercises?type=vcg&group=${vcgGroup}`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/prescription/vcg_prescription_d01`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/prescription/vcg_prescription_d15`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/agwatch-timing/vcg_agwatch_timing_d01`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/agwatch-timing/vcg_agwatch_timing_d02`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/agwatch-timing/vcg_agwatch_timing_d03`),
      fetch(`/api/patients/${PATIENT_HOMER_ID}/agwatch-timing/vcg_agwatch_timing_d15`),
    ]);
    const exercises = exRes.ok  ? await exRes.json()  : [];
    const d1        = d1Res.ok  ? await d1Res.json()  : null;
    const d15       = d15Res.ok ? await d15Res.json() : null;
    const t01       = t01Res.ok ? await t01Res.json() : null;
    const t02       = t02Res.ok ? await t02Res.json() : null;
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
      if (d15) html += _prescriptionCard(d15, exercises, `Day 15 Revision${suffix}`,    'bg-teal-600 text-white',  printD15?.attachment, [t15]);
      if (d1)  html += _prescriptionCard(d1,  exercises, `Day 1 Prescription${suffix}`, 'bg-teal-400 text-white', printD1?.attachment,  [t01, t02, t03]);
      container.innerHTML = html;
    }
    _vcgTabLoaded = true;
  } catch (_) {
    container.innerHTML = `<p class="text-sm text-red-500 p-4">Failed to load VCG prescriptions.</p>`;
  }
}

// ── Prescription Printout modal ────────────────────────────────────────────────

const SITE_LANGUAGES = {
  'Ranipet':  ['english', 'tamil', 'telugu'],
  'Manipal':  ['english', 'kannada', 'hindi'],
  'Ludhiana': ['english', 'punjabi', 'hindi'],
};

const LANGUAGE_NAMES = {
  'english':  'English',
  'tamil':    'தமிழ்',
  'telugu':   'తెలుగు',
  'kannada':  'ಕನ್ನಡ',
  'hindi':    'हिंदी',
  'punjabi':  'ਪੰਜਾਬੀ',
};

let _prescPrintoutEventId     = null;
let _prescPrintoutProtocolId  = null;
let _prescPrintoutLanguage    = 'english';

function openPrescriptionPrintoutModal(ev) {
  _prescPrintoutEventId    = typeof ev === 'object' ? ev.id : ev;
  _prescPrintoutProtocolId = typeof ev === 'object' ? ev.protocol_event_id : null;
  // After setting _prescPrintoutLanguage = 'english', disable buttons
document.getElementById('prescription-printout-print').disabled = true;
document.getElementById('prescription-printout-save').disabled = true;

  const title = _prescPrintoutProtocolId === 'prescription_printout_d15'
    ? 'Revised Therapy Prescription Printout'
    : 'Therapy Prescription Printout';

  document.getElementById('prescription-printout-title').textContent = title;
  document.getElementById('prescription-printout-homer-id').textContent = PATIENT_HOMER_ID;
  setError('prescription-printout-error', '');

  // Create language buttons
  const buttonsContainer = document.getElementById('presc-printout-language-buttons');
  buttonsContainer.innerHTML = '';
  const languages = SITE_LANGUAGES[PATIENT_PLACE] || ['english'];

  languages.forEach(lang => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.language = lang;
    btn.textContent = LANGUAGE_NAMES[lang] || lang;
    btn.className = 'px-6 py-2 rounded-full text-sm font-medium transition-all ' +
                    'bg-slate-200 text-slate-700 hover:bg-slate-300';
    btn.onclick = () => selectPrescriptionLanguage(lang);
    buttonsContainer.appendChild(btn);
  });

  _prescPrintoutLanguage = 'english';

  // Reset preview
  document.getElementById('presc-printout-preview').innerHTML =
    '<p class="text-slate-400 text-center py-12 text-sm">Select a language to preview the pamphlet</p>';

  showModal('prescription-printout-modal');
}

function selectPrescriptionLanguage(lang) {
  _prescPrintoutLanguage = lang;

  // Update button styles
  document.querySelectorAll('#presc-printout-language-buttons button').forEach(btn => {
    if (btn.dataset.language === lang) {
      btn.className = 'px-6 py-2 rounded-full text-sm font-medium transition-all ' +
                      'bg-blue-500 text-white hover:bg-blue-600';
    } else {
      btn.className = 'px-6 py-2 rounded-full text-sm font-medium transition-all ' +
                      'bg-slate-200 text-slate-700 hover:bg-slate-300';
    }
  });
     // After loading pamphlet, enable buttons
  document.getElementById('prescription-printout-print').disabled = false;
  document.getElementById('prescription-printout-save').disabled = false;

  _loadPrescriptionPamphlet();
}

async function _loadPrescriptionPamphlet() {
  if (!_prescPrintoutLanguage) {
    document.getElementById('presc-printout-preview').innerHTML =
      '<p class="text-slate-400 text-center py-12 text-sm">Select a language to preview the pamphlet</p>';
    return;
  }

  const preview = document.getElementById('presc-printout-preview');
  preview.innerHTML = '<p class="text-slate-400 text-center py-12 text-sm">Loading pamphlet...</p>';

  try {
    const res = await fetch(
      `/api/patients/${PATIENT_HOMER_ID}/prescription-pamphlet?event_id=${_prescPrintoutEventId}&language=${_prescPrintoutLanguage}`
    );
    if (!res.ok) {
      preview.innerHTML = '<p class="text-red-500 text-center py-12 text-sm">Failed to load pamphlet</p>';
      return;
    }
    const html = await res.text();
    preview.innerHTML = html;
  } catch (e) {
    preview.innerHTML = '<p class="text-red-500 text-center py-12 text-sm">Error loading pamphlet</p>';
  }
}

async function savePrescriptionPrintout() {
  if (!_prescPrintoutLanguage) {
    setError('prescription-printout-error', 'Please select a language first');
    return;
  }

  setLoading('prescription-printout-save', true);

  try {
    const previewDiv = document.getElementById('presc-printout-preview');
    const htmlContent = previewDiv.innerHTML;

    console.log('Sending HTML to server for server-side PDF rendering...');

    // Send HTML to server for server-side PDF generation with Puppeteer
    const { ok: renderOk, data: renderData } = await apiPost(
      `/api/patients/${PATIENT_HOMER_ID}/generate-prescription-pdf`,
      {
        event_id: _prescPrintoutEventId,
        protocol_event_id: _prescPrintoutProtocolId,
        language: _prescPrintoutLanguage,
        html_content: htmlContent,
        caption: `Exercise Prescription Printout (${_prescPrintoutLanguage})`
      }
    );

    if (!renderOk) {
      throw new Error(renderData.error || 'Failed to generate PDF');
    }

    console.log('✓ PDF generated and saved successfully');

    // Success: close modal and refresh events
    hideModal('prescription-printout-modal');
    loadPatientEvents();

  } catch (err) {
    setError('prescription-printout-error', err.message || 'Failed to generate and save PDF');
  } finally {
    setLoading('prescription-printout-save', false);
  }
}

/* OLD CLIENT-SIDE PDF CODE (DISABLED - using server-side rendering now)
async function savePrescriptionPrintout_OLD() {
  try {
    const previewDiv = document.getElementById('presc-printout-preview');

    // Get jsPDF constructor - DISABLED (old code below for reference)
    let jsPDFConstructor = null;
    if (window.jsPDF && typeof window.jsPDF === 'function') {
      jsPDFConstructor = window.jsPDF;
    } else if (window.jspdf && typeof window.jspdf === 'function') {
      jsPDFConstructor = window.jspdf;
    } else if (window.jsPDF && window.jsPDF.jsPDF && typeof window.jsPDF.jsPDF === 'function') {
      jsPDFConstructor = window.jsPDF.jsPDF;
    } else if (window.jspdf && window.jspdf.jsPDF && typeof window.jspdf.jsPDF === 'function') {
      jsPDFConstructor = window.jspdf.jsPDF;
    } else if (window.jsPDF && window.jsPDF.default && typeof window.jsPDF.default === 'function') {
      jsPDFConstructor = window.jsPDF.default;
    } else if (window.jspdf && window.jspdf.default && typeof window.jspdf.default === 'function') {
      jsPDFConstructor = window.jspdf.default;
    }

    if (!jsPDFConstructor) {
      throw new Error('jsPDF library not loaded. Please refresh the page and try again.');
    }

    console.log('Capturing full preview content...');

    // Temporarily remove height constraints to capture all content
    const originalMaxHeight = previewDiv.style.maxHeight;
    const originalOverflow = previewDiv.style.overflowY;
    const originalHeight = previewDiv.style.height;

    previewDiv.style.maxHeight = 'none';
    previewDiv.style.overflowY = 'visible';
    previewDiv.style.height = 'auto';

    // Capture with html2canvas
    const canvas = await html2canvas(previewDiv, {
      scale: 1.5,
      useCORS: true,
      logging: false,
      allowTaint: true,
      backgroundColor: '#ffffff',
      windowHeight: previewDiv.scrollHeight
    });

    // Restore original styles
    previewDiv.style.maxHeight = originalMaxHeight;
    previewDiv.style.overflowY = originalOverflow;
    previewDiv.style.height = originalHeight;

}
*/

// ── Custom PDF Dialog Modal ────────────────────────────────────────

let _pdfDialogSettings = {
  pageSize: 'a4',
  scale: 100,
  margins: 10
};

function openPrescriptionPdfDialog() {
  if (!_prescPrintoutLanguage) {
    setError('prescription-printout-error', 'Please select a language first');
    return;
  }

  console.log('Opening PDF dialog...');

  // Reset settings to defaults
  _pdfDialogSettings = {
    pageSize: 'a4',
    scale: 100,
    margins: 10
  };

  // Update UI
  document.getElementById('pdf-page-size').value = 'a4';
  document.getElementById('pdf-scale').value = 100;
  document.getElementById('pdf-scale-value').textContent = '100%';
  document.getElementById('pdf-margins').value = 10;

  // Show preview
  updatePdfPreview();

  // Setup event listeners
  document.getElementById('pdf-page-size').addEventListener('change', (e) => {
    _pdfDialogSettings.pageSize = e.target.value;
    updatePdfPreview();
  });

  document.getElementById('pdf-scale').addEventListener('input', (e) => {
    _pdfDialogSettings.scale = parseInt(e.target.value);
    document.getElementById('pdf-scale-value').textContent = _pdfDialogSettings.scale + '%';
    updatePdfPreview();
  });

  document.getElementById('pdf-margins').addEventListener('change', (e) => {
    _pdfDialogSettings.margins = parseInt(e.target.value) || 10;
  });

  // Show modal
  showModal('prescription-pdf-dialog-modal');
}

function updatePdfPreview() {
  const previewDiv = document.getElementById('presc-printout-preview');
  const previewPane = document.getElementById('pdf-preview-pane');

  if (!previewDiv) return;

  // Clone preview content with current scale
  const clone = previewDiv.cloneNode(true);
  clone.style.transform = `scale(${_pdfDialogSettings.scale / 100})`;
  clone.style.transformOrigin = 'top left';
  clone.style.width = `${100 / (_pdfDialogSettings.scale / 100)}%`;

  previewPane.innerHTML = '';
  previewPane.appendChild(clone);
}

async function savePrescriptionPdfFromDialog() {
  setLoading('prescription-pdf-save-dialog', true);

  try {
    const previewDiv = document.getElementById('presc-printout-preview');

    // Get jsPDF constructor
    let jsPDFConstructor = null;
    if (window.jsPDF && typeof window.jsPDF === 'function') {
      jsPDFConstructor = window.jsPDF;
    } else if (window.jsPDF && window.jsPDF.jsPDF && typeof window.jsPDF.jsPDF === 'function') {
      jsPDFConstructor = window.jsPDF.jsPDF;
    } else if (window.jspdf && window.jspdf.jsPDF && typeof window.jspdf.jsPDF === 'function') {
      jsPDFConstructor = window.jspdf.jsPDF;
    }

    if (!jsPDFConstructor) {
      throw new Error('jsPDF library not loaded. Please refresh and try again.');
    }

    console.log('Generating PDF with user settings...');

    // Prepare element for capture
    const originalMaxHeight = previewDiv.style.maxHeight;
    const originalOverflow = previewDiv.style.overflowY;
    const originalHeight = previewDiv.style.height;

    previewDiv.style.maxHeight = 'none';
    previewDiv.style.overflowY = 'visible';
    previewDiv.style.height = 'auto';

    // Capture with html2canvas using user's scale setting
    const canvas = await html2canvas(previewDiv, {
      scale: _pdfDialogSettings.scale / 100,
      useCORS: true,
      logging: false,
      allowTaint: true,
      backgroundColor: '#ffffff',
      windowHeight: previewDiv.scrollHeight
    });

    // Restore original styles
    previewDiv.style.maxHeight = originalMaxHeight;
    previewDiv.style.overflowY = originalOverflow;
    previewDiv.style.height = originalHeight;

    console.log('Canvas created, creating PDF...');

    // Get page dimensions based on user settings
    const pageSizes = {
      a4: { width: 210, height: 297 },
      letter: { width: 216, height: 279 },
      a3: { width: 297, height: 420 }
    };
    const pageSize = pageSizes[_pdfDialogSettings.pageSize];
    const margins = _pdfDialogSettings.margins;
    const contentWidth = pageSize.width - (margins * 2);

    // Create PDF
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDFConstructor('p', 'mm', _pdfDialogSettings.pageSize);

    const imgHeight = (canvas.height * contentWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = margins;

    pdf.addImage(imgData, 'PNG', margins, position, contentWidth, imgHeight);
    heightLeft -= (pageSize.height - (margins * 2));

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margins, position, contentWidth, imgHeight);
      heightLeft -= (pageSize.height - (margins * 2));
    }

    const pdfBlob = pdf.output('blob');
    console.log('PDF created, size:', pdfBlob.size, 'bytes');

    // Mark event complete
    console.log('Marking event as complete...');
    const { ok: completeOk, data: completeData } = await apiPost(
      `/api/patients/${PATIENT_HOMER_ID}/complete-event/prescription-printout`,
      {
        event_id: _prescPrintoutEventId,
        protocol_event_id: _prescPrintoutProtocolId,
        language: _prescPrintoutLanguage,
      }
    );

    if (!completeOk) {
      throw new Error(completeData.error || 'Failed to mark event complete');
    }

    console.log('Event marked complete, uploading PDF...');

    // Upload attachment
    const formData = new FormData();
    formData.append('event_id', _prescPrintoutEventId);
    formData.append('caption', `Exercise Prescription Printout (${_prescPrintoutLanguage})`);
    formData.append('file', pdfBlob, `prescription_${_prescPrintoutLanguage}.pdf`);

    const uploadRes = await fetch(`/api/patients/${PATIENT_HOMER_ID}/upload-attachment`, {
      method: 'POST',
      body: formData,
    });

    if (!uploadRes.ok) {
      throw new Error('Failed to upload PDF');
    }

    console.log('PDF uploaded successfully');

    // Success
    hideModal('prescription-pdf-dialog-modal');
    hideModal('prescription-printout-modal');
    loadPatientEvents();

  } catch (err) {
    setError('prescription-printout-error', err.message || 'Failed to save PDF');
  } finally {
    setLoading('prescription-pdf-save-dialog', false);
  }
}

async function printPrescriptionPamphlet() {
  const previewDiv = document.getElementById('presc-printout-preview');
  // Check if we need to save first
    const event = _completeEventsCache?.find(e => e.id === _prescPrintoutEventId);
    if (!event) {
      // Event not yet complete - auto save first
      await savePrescriptionPrintout();
      // After save, proceed with print
    }
  // Check if pamphlet is loaded
  if (!previewDiv.innerHTML || previewDiv.innerHTML.includes('Select a language') || previewDiv.innerHTML.includes('Loading')) {
    setError('prescription-printout-error', 'Please select a language and wait for the preview to load first');
    return;
  }

  // Create a new window for printing
  const printWindow = window.open('', '', 'height=800,width=1000');

  if (!printWindow) {
    setError('prescription-printout-error', 'Pop-up window was blocked. Please allow pop-ups for this site.');
    return;
  }

  // Get the HTML content from the preview
  const htmlContent = previewDiv.innerHTML;

  // Build the complete HTML document
  const printHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Exercise Prescription Pamphlet</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600&family=Noto+Sans+Devanagari:wght@400;500;600&family=Noto+Sans+Tamil:wght@400;500;600&family=Noto+Sans+Telugu:wght@400;500;600&family=Noto+Sans+Kannada:wght@400;500;600&family=Noto+Sans+Gurmukhi:wght@400;500;600&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Kannada', 'Noto Sans Gurmukhi', sans-serif;
          line-height: 1.5;
          color: #333;
          padding: 20px;
        }

        @media print {
          body { padding: 0; }
          .container { max-width: 100%; padding: 0; }
          .exercise-card { page-break-inside: avoid; page-break-before: always; }
          .exercise-card.first-exercise { page-break-before: auto; }
        }
      </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `;

  // Write content directly to the new window (document.write is most reliable for print windows)
  // @ts-ignore - document.write is deprecated but necessary for reliable print window population
  printWindow.document.write(printHtml);
  printWindow.document.close();

  // Trigger print dialog immediately after content is written
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 100);
 
}

// ── Simple event modal (home visits, follow-up calls, training completion) ────

let _simpleEventId         = null;
let _simpleProtocolEventId = null;

function openSimpleEventModal(ev) {
  _simpleEventId         = ev.id;
  _simpleProtocolEventId = ev.protocol_event_id;
  document.getElementById('simple-event-title').textContent = ev.event_name;
  document.getElementById('simple-event-notes').value       = '';
  _resetAttachment('simple-event');
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

  if (!_validateAttachment('simple-event', 'simple-event-error')) return;

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
  if (!res.ok) { err.textContent = data.error || 'Failed to save.'; err.classList.remove('hidden'); return; }

  const { file, caption } = _readAttachment('simple-event');
  if (file) {
    const uploaded = await _uploadAttachment(_simpleEventId, file, caption, 'simple-event-error');
    if (!uploaded) return;
  }
  hideModal('simple-event-modal');
  await loadPatientEvents();
}

// ── Home Visit modal ───────────────────────────────────────────────────────────

let _hvEventId         = null;
let _hvProtocolEventId = null;

function _hvToggleSubform(type) {
  const noteId  = { adverse: 'hv-adverse-note', robot: 'hv-robot-note', watch: 'hv-watch-note' }[type];
  const checked = document.getElementById(`hv-trigger-${type}`).checked;
  document.getElementById(noteId).classList.toggle('hidden', !checked);
}

const _HV_ACTIVATION_OFFSETS = { home_visit_d02: 1, home_visit_d03: 2 };

function openHomeVisitModal(ev) {
  _hvEventId         = ev.id;
  _hvProtocolEventId = ev.protocol_event_id;
  document.getElementById('hv-title').textContent = ev.event_name;
  document.getElementById('hv-notes').value       = '';
  _resetAttachment('hv');
  setError('hv-error', '');

  // Pre-fill session start for d02/d03
  const offset = _HV_ACTIVATION_OFFSETS[ev.protocol_event_id];
  if (offset !== undefined && patientData?.activationDate) {
    const d = new Date(patientData.activationDate);
    d.setDate(d.getDate() + offset);
    document.getElementById('hv-session-start').value = d.toISOString().slice(0, 10) + 'T09:00';
  } else {
    document.getElementById('hv-session-start').value = '';
  }
  document.getElementById('hv-session-end').value = '';
  _attachDateGuard('hv-session-start', 'hv-error');
  _attachSessionEndGuard('hv-session-start', 'hv-session-end', 'hv-error');

  // Reset triggered section
  ['adverse', 'robot', 'watch'].forEach(type => {
    const cb = document.getElementById(`hv-trigger-${type}`);
    if (cb) { cb.checked = false; _hvToggleSubform(type); }
  });
  document.getElementById('hv-trigger-robot-wrap').classList.toggle('hidden', patientData?.group !== 'experimental');
  document.getElementById('hv-trigger-watch-wrap').classList.toggle('hidden',
    !(patientData?.agWatchRightID || patientData?.agWatchLeftID));

  showModal('home-visit-modal');
}

async function saveHomeVisit() {
  const sessionStart = document.getElementById('hv-session-start').value;
  const sessionEnd   = document.getElementById('hv-session-end').value;
  const notes        = document.getElementById('hv-notes').value.trim();
  const saveBtn      = document.getElementById('hv-save');

  if (!sessionStart || !sessionEnd) { setError('hv-error', 'Session start and end are required.'); return; }
  if (sessionStart.split('T')[0] !== sessionEnd.split('T')[0]) { setError('hv-error', 'Session start and end must be on the same date.'); return; }
  if (sessionStart >= sessionEnd) { setError('hv-error', 'Session end must be after session start.'); return; }
  if (!_validateAttachment('hv', 'hv-error')) return;

  // Collect triggered events
  const triggered = [];
  if (document.getElementById('hv-trigger-adverse').checked)
    triggered.push({ type: 'adverse_event' });
  if (!document.getElementById('hv-trigger-robot-wrap').classList.contains('hidden') &&
      document.getElementById('hv-trigger-robot').checked)
    triggered.push({ type: 'robot_issue_call' });
  if (!document.getElementById('hv-trigger-watch-wrap').classList.contains('hidden') &&
      document.getElementById('hv-trigger-watch').checked)
    triggered.push({ type: 'watch_record' });
  if (document.getElementById('hv-trigger-other-device').checked)
    triggered.push({ type: 'other_device_issue' });

  saveBtn.disabled = true;
  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/complete-event/home-visit`, {
    event_id:          _hvEventId,
    protocol_event_id: _hvProtocolEventId,
    session_start:     sessionStart,
    session_end:       sessionEnd,
    notes,
    triggered,
  });
  if (!ok) { setError('hv-error', data.error || 'Failed to save.'); saveBtn.disabled = false; return; }

  const { file, caption } = _readAttachment('hv');
  if (file) {
    const uploaded = await _uploadAttachment(_hvEventId, file, caption, 'hv-error');
    if (!uploaded) { saveBtn.disabled = false; return; }
  }

  hideModal('home-visit-modal');
  saveBtn.disabled = false;
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
  const noteId  = { adverse: 'fc-adverse-note', robot: 'fc-robot-note', watch: 'fc-watch-note' }[type];
  const checked = document.getElementById(`fc-trigger-${type}`).checked;
  document.getElementById(noteId).classList.toggle('hidden', !checked);
}

function openFollowupCallModal(ev) {
  _followupCallEventId         = ev.id;
  _followupCallProtocolEventId = ev.protocol_event_id;
  _followupCallScheduledDate   = ev.scheduled_date ? ev.scheduled_date[0].slice(0, 10) : null;

  document.getElementById('followup-call-title').textContent             = ev.event_name;
  document.getElementById('followup-call-date').value                    = '';
  document.getElementById('followup-call-duration').value                = '';
  document.getElementById('followup-call-notes').value                   = '';
  _resetAttachment('followup-call');
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
  const notes      = document.getElementById('followup-call-notes').value.trim();
  const reasonWrap = document.getElementById('followup-call-date-reason-wrap');
  const dateReason = document.getElementById('followup-call-date-reason').value.trim();
  const err        = document.getElementById('followup-call-error');
  const saveBtn    = document.getElementById('followup-call-save');
  err.classList.add('hidden');

  const dateChanged = !reasonWrap.classList.contains('hidden');

  if (!dateVal)                            { err.textContent = 'Call date is required.';                    err.classList.remove('hidden'); return; }
  if (!duration || parseInt(duration) < 1) { err.textContent = 'Duration must be at least 1 minute.';       err.classList.remove('hidden'); return; }
  if (dateChanged && !dateReason)          { err.textContent = 'Please explain why the date is different.'; err.classList.remove('hidden'); return; }
  if (!notes)                              { err.textContent = 'Notes are required.';                       err.classList.remove('hidden'); return; }
  if (!_validateAttachment('followup-call', 'followup-call-error')) return;

  // Collect triggered items
  const triggered = [];

  if (document.getElementById('fc-trigger-adverse').checked)
    triggered.push({ type: 'adverse_event' });
  if (!document.getElementById('fc-trigger-robot-wrap').classList.contains('hidden') &&
      document.getElementById('fc-trigger-robot').checked)
    triggered.push({ type: 'robot_issue_call' });
  if (!document.getElementById('fc-trigger-watch-wrap').classList.contains('hidden') &&
      document.getElementById('fc-trigger-watch').checked)
    triggered.push({ type: 'watch_record' });
  if (document.getElementById('fc-trigger-other-device').checked)
    triggered.push({ type: 'other_device_issue' });

  const body = {
    event_id:          _followupCallEventId,
    protocol_event_id: _followupCallProtocolEventId,
    completion_date:   dateVal,
    duration_minutes:  parseInt(duration),
    notes,
    triggered,
    ...(dateChanged ? { date_change_reason: dateReason } : {}),
  };

  saveBtn.disabled = true;
  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/complete-event/followup-call`, body);
  if (!ok) {
    saveBtn.disabled = false;
    err.textContent = data.error || 'Failed to save.';
    err.classList.remove('hidden');
    return;
  }

  const { file, caption } = _readAttachment('followup-call');
  if (file) {
    const uploaded = await _uploadAttachment(_followupCallEventId, file, caption, 'followup-call-error');
    if (!uploaded) { saveBtn.disabled = false; return; }
  }

  saveBtn.disabled = false;
  hideModal('followup-call-modal');
  await loadPatientEvents();
}

// ── Patient Call modal ────────────────────────────────────────────────────────

function _pcToggleSubform(type) {
  const noteId  = { adverse: 'pc-adverse-note', robot: 'pc-robot-note', watch: 'pc-watch-note' }[type];
  const checked = document.getElementById(`pc-trigger-${type}`).checked;
  document.getElementById(noteId).classList.toggle('hidden', !checked);
}

function _pcToggleTherapistInitiated() {
  const checked = document.getElementById('pc-therapist-initiated').checked;
  document.getElementById('pc-reason-wrap').classList.toggle('hidden', !checked);
}

function openPatientCallModal() {
  document.getElementById('pc-date').value     = '';
  document.getElementById('pc-duration').value = '';
  document.getElementById('pc-notes').value    = '';
  document.getElementById('pc-therapist-initiated').checked = false;
  document.getElementById('pc-reason-wrap').classList.add('hidden');
  document.getElementById('pc-reason').value = '';
  _resetAttachment('pc');

  ['adverse', 'robot', 'watch'].forEach(type => {
    const cb = document.getElementById(`pc-trigger-${type}`);
    if (cb) { cb.checked = false; _pcToggleSubform(type); }
  });
  document.getElementById('pc-trigger-robot-wrap').classList.toggle('hidden', patientData?.group !== 'experimental');
  document.getElementById('pc-trigger-watch-wrap').classList.toggle('hidden',
    !(patientData?.agWatchRightID || patientData?.agWatchLeftID));

  setError('pc-error', '');
  _attachDateGuard('pc-date', 'pc-error');
  showModal('patient-call-modal');
}

async function savePatientCall() {
  const dateVal  = document.getElementById('pc-date').value;
  const duration = document.getElementById('pc-duration').value.trim();
  const notes    = document.getElementById('pc-notes').value.trim();
  const saveBtn  = document.getElementById('pc-save');

  if (!dateVal)                            { setError('pc-error', 'Call date is required.'); return; }
  if (!duration || parseInt(duration) < 1) { setError('pc-error', 'Duration must be at least 1 minute.'); return; }
  if (!notes)                              { setError('pc-error', 'Notes are required.'); return; }
  if (!_validateAttachment('pc', 'pc-error')) return;

  const triggered = [];

  if (document.getElementById('pc-trigger-adverse').checked)
    triggered.push({ type: 'adverse_event' });
  if (!document.getElementById('pc-trigger-robot-wrap').classList.contains('hidden') &&
      document.getElementById('pc-trigger-robot').checked)
    triggered.push({ type: 'robot_issue_call' });
  if (!document.getElementById('pc-trigger-watch-wrap').classList.contains('hidden') &&
      document.getElementById('pc-trigger-watch').checked)
    triggered.push({ type: 'watch_record' });
  if (document.getElementById('pc-trigger-other-device').checked)
    triggered.push({ type: 'other_device_issue' });

  const therapistInitiated = document.getElementById('pc-therapist-initiated').checked;
  const reason = document.getElementById('pc-reason').value.trim();
  if (therapistInitiated && !reason) { setError('pc-error', 'Reason is required for therapist-initiated calls.'); return; }

  const call_type = therapistInitiated ? 'therapist_initiated' : 'patient_initiated';

  saveBtn.disabled = true;
  const { ok, data } = await apiPost(
    `/api/patients/${PATIENT_HOMER_ID}/log-patient-call`,
    { completion_date: dateVal, duration_minutes: parseInt(duration), notes, triggered,
      call_type, reason: therapistInitiated ? reason : undefined }
  );
  if (!ok) { setError('pc-error', data.error || 'Failed to save.'); saveBtn.disabled = false; return; }

  const { file, caption } = _readAttachment('pc');
  if (file) {
    const uploaded = await _uploadAttachment(data.id, file, caption, 'pc-error');
    if (!uploaded) { saveBtn.disabled = false; return; }
  }

  saveBtn.disabled = false;
  hideModal('patient-call-modal');

  // Update cache and re-render immediately without re-fetching
  const newCall = {
    id: data.id,
    completion_date: dateVal,
    duration_minutes: parseInt(duration),
    notes,
    call_type,
    reason: therapistInitiated ? reason : undefined,
    attachment: data.attachment,
    attachment_caption: data.attachment_caption,
  };

  if (!_callLogsCache) _callLogsCache = { patient_calls: [], followup_calls: [] };
  if (!_callLogsCache.patient_calls) _callLogsCache.patient_calls = [];
  _callLogsCache.patient_calls.push(newCall);

  const container = document.getElementById('call-logs-content');
  if (container) _renderCallLogs(container, _callLogsCache);

  await loadPatientEvents();
}

// ── Watch Record modal ────────────────────────────────────────────────────────

const _WR_TRIGGER_NAMES = {
  activation:        'Patient Activation',
  home_visit_d02:    'Home Visit Day 02',
  home_visit_d03:    'Home Visit Day 03',
  home_visit_d15:    'Home Visit Day 15',
  followup_call_d07: 'Follow-up Call Day 07',
  followup_call_d21: 'Follow-up Call Day 21',
  patient_call:      'Patient Call',
};

let _wrEventId  = null;
let _wrOldRight = null;
let _wrOldLeft  = null;

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
  _wrOldRight = patientData?.agWatchRightID || null;
  _wrOldLeft  = patientData?.agWatchLeftID  || null;
  // Initial assignment (activation): neither watch exists yet — treat as two-watch.
  const bothNull   = !_wrOldRight && !_wrOldLeft;
  const twoWatches = !!(_wrOldRight && _wrOldLeft) || bothNull;
  const showRight  = !!_wrOldRight || bothNull;
  const showLeft   = !!_wrOldLeft  || bothNull;

  document.getElementById('wr-old-right').textContent = _wrOldRight || '';
  document.getElementById('wr-old-left').textContent  = _wrOldLeft  || '';
  document.getElementById('wr-right-lost-wrap').classList.toggle('hidden', !_wrOldRight);
  document.getElementById('wr-left-lost-wrap').classList.toggle('hidden',  !_wrOldLeft);
  document.getElementById('wr-no-watches-msg').classList.toggle('hidden',  !bothNull);
  document.getElementById('wr-right-lost').checked = false;
  document.getElementById('wr-left-lost').checked  = false;

  // Show/hide selectors and sync based on watch count
  document.getElementById('wr-right-current-row').classList.toggle('hidden', !_wrOldRight);
  document.getElementById('wr-left-current-row').classList.toggle('hidden',  !_wrOldLeft);
  document.getElementById('wr-right-wrap').classList.toggle('hidden', !showRight);
  document.getElementById('wr-left-wrap').classList.toggle('hidden',  !showLeft);
  document.getElementById('wr-sync-wrap').classList.toggle('hidden',  !twoWatches);

  // Reset fields
  document.getElementById('wr-new-right').innerHTML  = '<option value="">Loading…</option>';
  document.getElementById('wr-new-left').innerHTML   = '<option value="">Loading…</option>';
  document.getElementById('wr-sync-datetime').value  = '';
  document.getElementById('wr-worn-datetime').value  = '';
  document.getElementById('wr-next-days').value      = '';
  document.getElementById('wr-notes').value          = '';
  _resetAttachment('wr');
  setError('wr-error', '');

  _attachDateGuard('wr-sync-datetime', 'wr-error');
  _attachDateGuard('wr-worn-datetime', 'wr-error');

  showModal('watch-record-modal');

  try {
    const res = await fetch(`/api/patients/${PATIENT_HOMER_ID}/available-agwatches`);
    const { agwatch, current_right, current_left } = await res.json();
    const NO_WATCH_VAL = '__none__';
    const NO_WATCH_OPT = `<option value="${NO_WATCH_VAL}">No Watch Available</option>`;

    const rightSel    = document.getElementById('wr-new-right');
    const leftSel     = document.getElementById('wr-new-left');
    const syncInput   = document.getElementById('wr-sync-datetime');
    const wornInput   = document.getElementById('wr-worn-datetime');
    const rightLostCb = document.getElementById('wr-right-lost');
    const leftLostCb  = document.getElementById('wr-left-lost');

    // True if any watch is being marked lost — overrides the right-as-reference lock.
    function anyLost() {
      return (rightLostCb.checked && !!_wrOldRight) ||
             (leftLostCb.checked  && !!_wrOldLeft);
    }

    // Sync/worn disabled only when both watches are kept as current (and none lost).
    function updateDatetimeFields() {
      const bothCurrent = !anyLost() && twoWatches &&
        current_right && rightSel.value === current_right.id &&
        current_left  && leftSel.value  === current_left.id;
      const syncRequired = twoWatches && !bothCurrent;
      const wornRequired = !bothCurrent;
      syncInput.disabled = !syncRequired;
      wornInput.disabled = !wornRequired;
      if (!syncRequired) syncInput.value = '';
      if (!wornRequired) wornInput.value = '';
    }

    // Right options: current option excluded if right is lost (can't keep a lost watch).
    function buildRightOpts() {
      const rightLost  = rightLostCb.checked && !!current_right;
      const currentOpt = (current_right && !rightLost)
        ? `<option value="${current_right.id}">${current_right.id} (${current_right.serial}) — current</option>`
        : '';
      return '<option value="">Select watch…</option>' +
        currentOpt +
        agwatch.map(d => `<option value="${d.id}">${d.id} (${d.serial})</option>`).join('') +
        NO_WATCH_OPT;
    }

    // Left options:
    //   anyLost OR right ≠ current → new mode (pool + NO_WATCH, no current option, left unlocked)
    //   right = current AND no lost → left auto-locks to current (disabled)
    function updateLeftOpts() {
      const rightIsCurrent = !anyLost() && current_right && rightSel.value === current_right.id;
      if (rightIsCurrent) {
        leftSel.innerHTML = current_left
          ? `<option value="${current_left.id}">${current_left.id} (${current_left.serial}) — current</option>`
          : '<option value="">No current watch</option>';
        if (current_left) leftSel.value = current_left.id;
        leftSel.disabled = true;
      } else {
        leftSel.disabled = false;
        const excludeId = (rightSel.value && rightSel.value !== NO_WATCH_VAL) ? rightSel.value : null;
        const pool = agwatch.filter(d => d.id !== excludeId);
        leftSel.innerHTML = '<option value="">Select watch…</option>' +
          pool.map(d => `<option value="${d.id}">${d.id} (${d.serial})</option>`).join('') +
          NO_WATCH_OPT;
      }
      updateDatetimeFields();
    }

    // Rebuild right options (lost state may add/remove the current option) then update left.
    function updateAll() {
      const prev = rightSel.value;
      rightSel.innerHTML = buildRightOpts();
      if (prev && [...rightSel.options].some(o => o.value === prev)) rightSel.value = prev;
      updateLeftOpts();
    }

    rightSel.innerHTML = buildRightOpts();
    updateLeftOpts();   // initialise left based on right's default (empty → new mode)

    rightSel.onchange    = () => updateLeftOpts();
    rightLostCb.onchange = () => updateAll();
    leftLostCb.onchange  = () => updateAll();
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
  const NO_WATCH   = '__none__';
  const bothNull   = !_wrOldRight && !_wrOldLeft;
  const twoWatches = !!(_wrOldRight && _wrOldLeft) || bothNull;
  const showRight  = !!_wrOldRight || bothNull;
  const showLeft   = !!_wrOldLeft  || bothNull;

  if (showRight && !newRight) { setError('wr-error', 'Please select a right watch or "No Watch Available".'); return; }
  if (showLeft  && !newLeft)  { setError('wr-error', 'Please select a left watch or "No Watch Available".'); return; }
  if (twoWatches && newRight !== NO_WATCH && newRight === newLeft) {
    setError('wr-error', 'Right and left watches must be different.'); return;
  }

  const rightLost = (document.getElementById('wr-right-lost')?.checked && !!_wrOldRight) || false;
  const leftLost  = (document.getElementById('wr-left-lost')?.checked  && !!_wrOldLeft)  || false;
  const anyLost   = rightLost || leftLost;

  // Determine whether either watch is changing vs being kept as-is
  const bothCurrent = !bothNull && twoWatches && !anyLost && newRight === _wrOldRight && newLeft === _wrOldLeft;
  const syncRequired = twoWatches && !bothCurrent;
  const wornRequired = !bothCurrent;

  if (syncRequired && !syncDt) { setError('wr-error', 'Sync date & time is required when watches are changed.'); return; }
  if (wornRequired && !wornDt) { setError('wr-error', 'Worn date & time is required.'); return; }
  if (!nextDays || parseInt(nextDays) < 1) { setError('wr-error', 'Next follow-up days must be at least 1.'); return; }
  const rightNoWatch = showRight && newRight === NO_WATCH;
  const leftNoWatch  = showLeft  && newLeft  === NO_WATCH;
  if ((rightNoWatch || leftNoWatch) && !notes) {
    setError('wr-error', 'Notes are required when a watch is not assigned — explain why.'); return;
  }
  if (!_validateAttachment('wr', 'wr-error')) return;

  // Resolve final watch IDs (null for unshown limbs or "No Watch Available")
  const finalRight = showRight ? (newRight === NO_WATCH ? null : newRight) : null;
  const finalLeft  = showLeft  ? (newLeft  === NO_WATCH ? null : newLeft)  : null;

  const saveBtn = document.getElementById('wr-save');
  const body = {
    event_id:                 _wrEventId,
    ag_watch_right_new:       finalRight,
    ag_watch_left_new:        finalLeft,
    ag_watch_right_old_lost:  rightLost,
    ag_watch_left_old_lost:   leftLost,
    sync_datetime:            syncDt,
    worn_datetime:            wornDt,
    next_followup_days:       parseInt(nextDays),
    notes,
  };

  saveBtn.disabled = true;
  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/complete-event/watch-record`, body);
  if (!ok) {
    saveBtn.disabled = false;
    setError('wr-error', data.error || 'Failed to save.');
    return;
  }

  const { file: wrFile, caption: wrCaption } = _readAttachment('wr');
  if (wrFile) {
    const uploaded = await _uploadAttachment(_wrEventId, wrFile, wrCaption, 'wr-error');
    if (!uploaded) { saveBtn.disabled = false; return; }
  }

  saveBtn.disabled = false;
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
  _resetAttachment('agwatch');
  const errEl = document.getElementById('agwatch-timing-error');
  errEl.textContent = '';
  errEl.classList.add('hidden');

  // Pre-fill session date from scheduled_date[0], fallback to today
  const schedDate = Array.isArray(ev.scheduled_date) ? ev.scheduled_date[0] : ev.scheduled_date;
  const dateOnly  = schedDate ? schedDate.split('T')[0] : new Date().toISOString().split('T')[0];
  document.getElementById('agwatch-session-date').value = dateOnly;

  // Load session bounds from the corresponding home visit or activation complete entry
  const _AGWATCH_SESSION_SOURCE = {
    adl_agwatch_timing_d01: 'activation',
    adl_agwatch_timing_d02: 'home_visit_d02',
    adl_agwatch_timing_d03: 'home_visit_d03',
    vcg_agwatch_timing_d01: 'activation',
    vcg_agwatch_timing_d02: 'home_visit_d02',
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

  if (!_validateAttachment('agwatch', 'agwatch-timing-error')) return;

  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/complete-event/agwatch-timing`, {
    event_id:          _agwatchEventId,
    protocol_event_id: _agwatchProtocolEventId,
    timings,
    notes: globalNotes,
  });
  if (!ok) {
    errEl.textContent = data.error || 'Failed to save.';
    errEl.classList.remove('hidden');
    return;
  }

  const { file: awFile, caption: awCaption } = _readAttachment('agwatch');
  if (awFile) {
    const uploaded = await _uploadAttachment(_agwatchEventId, awFile, awCaption, 'agwatch-timing-error');
    if (!uploaded) return;
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
    // Show "Log Call" button for admin/therapist on activated patients (but not if discontinued)
    const logCallBtn = document.getElementById('log-call-btn');
    if (logCallBtn && patientData.activationDate && !patientData.discontinuationDate &&
        (userPrivilege === 'admin' || userPrivilege === 'therapist')) {
      logCallBtn.classList.remove('hidden');
      logCallBtn.classList.add('flex');
    } else if (logCallBtn) {
      logCallBtn.classList.add('hidden');
      logCallBtn.classList.remove('flex');
    }

    // Show "Discontinue" button for admin when patient is not yet discontinued/completed
    const discBtn = document.getElementById('discontinue-btn');
    if (discBtn && isAdmin && !patientData.discontinuationDate && !patientData.a2CompletionDate) {
      discBtn.classList.remove('hidden');
      discBtn.classList.add('flex');
    }
  } catch (e) {
    console.error('Error loading patient:', e);
  }
}

async function loadPrivilege() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const s = await res.json();
      userPrivilege = s.privilege || '';
      isAdmin = userPrivilege === 'admin';
    }
  } catch (_) {}
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Store submit button labels for loading state
  [
    'a1-submit', 'a2-submit', 'discontinue-submit',
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

// ── Other Device Issue Modal ──────────────────────────────────────────────────

let _odiEventId   = null;
let _odiInventory = null; // { modems, laptops, sims } filtered to patient's assigned devices
let _odiRowCount  = 0;

async function openOtherDeviceIssueModal(ev) {
  _odiEventId = ev.id;
  _odiRowCount = 0;
  setError('odi-error', '');

  // Set default datetime to now
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const nowStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  document.getElementById('odi-completion-date').value = nowStr;
  document.getElementById('odi-notes').value = '';
  document.getElementById('odi-device-rows').innerHTML = '';

  showModal('other-device-issue-modal');

  // Fetch inventory and filter to patient's assigned devices
  try {
    const res = await fetch('/devices/api/inventory');
    if (!res.ok) throw new Error('Failed to fetch inventory');
    const inv = await res.json();

    _odiInventory = {
      modems:       (inv.modems  || []).filter(d => !d.removal_date && d.assigned_to?.homerID === PATIENT_HOMER_ID),
      laptops:      (inv.laptops || []).filter(d => !d.removal_date && d.assigned_to?.homerID === PATIENT_HOMER_ID),
      sims:         (inv.sims    || []).filter(s => !s.removal_date),
      _allModems:   (inv.modems  || []).filter(d => !d.removal_date),
      _allLaptops:  (inv.laptops || []).filter(d => !d.removal_date),
      _allSims:     (inv.sims    || []).filter(s => !s.removal_date),
    };

    _odiAddRow(); // add first row automatically
  } catch (e) {
    setError('odi-error', 'Failed to load device inventory.');
  }
}

function _odiAddRow() {
  if (!_odiInventory) return;
  const idx = _odiRowCount++;
  const container = document.getElementById('odi-device-rows');
  const row = document.createElement('div');
  row.id = `odi-row-${idx}`;
  row.className = 'bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200';

  const modemOpts = _odiInventory.modems.map(d => `<option value="${_esc(d.id)}">Modem: ${_esc(d.id)}</option>`).join('');
  const laptopOpts = _odiInventory.laptops.map(d => `<option value="${_esc(d.id)}">Laptop: ${_esc(d.id)}</option>`).join('');
  const simOpts = _odiInventory.sims.map(s => `<option value="${_esc(s.id)}">SIM: ${_esc(s.phoneNumber || s.id)}</option>`).join('');

  const allDeviceOpts = [
    modemOpts ? `<optgroup label="Modems">${modemOpts}</optgroup>` : '',
    laptopOpts ? `<optgroup label="Laptops">${laptopOpts}</optgroup>` : '',
    simOpts ? `<optgroup label="SIMs">${simOpts}</optgroup>` : '',
  ].filter(Boolean).join('');

  row.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="text-sm font-semibold text-slate-700">Device ${idx + 1}</span>
      ${idx > 0 ? `<button type="button" onclick="document.getElementById('odi-row-${idx}').remove()" class="text-xs text-red-400 hover:text-red-600"><i class="fas fa-times"></i> Remove</button>` : ''}
    </div>
    <div>
      <label class="block text-xs font-medium text-slate-600 mb-1">Device <span class="text-red-400">*</span></label>
      <select id="odi-device-${idx}" onchange="_odiOnDeviceChange(${idx})"
              class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
        <option value="">Select device…</option>
        ${allDeviceOpts || '<option value="" disabled>No assigned devices found</option>'}
      </select>
    </div>
    <div>
      <label class="block text-xs font-medium text-slate-600 mb-1">Outcome <span class="text-red-400">*</span></label>
      <select id="odi-outcome-${idx}" onchange="_odiOnOutcomeChange(${idx})"
              class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
        <option value="">Select outcome…</option>
        <option value="faulty">Faulty — flag issue</option>
        <option value="resolved">Resolved — no further action</option>
        <option value="lost">Lost — permanently retire</option>
        <option value="swap">Swap — replace with another device</option>
      </select>
    </div>
    <div id="odi-swap-section-${idx}" class="hidden">
      <label class="block text-xs font-medium text-slate-600 mb-1">Replacement Device <span class="text-red-400">*</span></label>
      <select id="odi-swap-device-${idx}"
              class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
        <option value="">Select replacement…</option>
      </select>
    </div>
    <div id="odi-notes-section-${idx}">
      <label class="block text-xs font-medium text-slate-600 mb-1">Notes <span id="odi-notes-req-${idx}" class="text-red-400 hidden">*</span></label>
      <textarea id="odi-device-notes-${idx}" rows="2"
                class="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
                placeholder="Device-specific notes…"></textarea>
    </div>
  `;
  container.appendChild(row);
}

function _odiGetDeviceType(deviceId) {
  if (!_odiInventory) return null;
  if (_odiInventory.modems.find(d => d.id === deviceId)) return 'modems';
  if (_odiInventory.laptops.find(d => d.id === deviceId)) return 'laptops';
  if (_odiInventory.sims.find(s => s.id === deviceId)) return 'sims';
  return null;
}

function _odiOnDeviceChange(idx) {
  _odiOnOutcomeChange(idx); // refresh swap options based on new device type
}

function _odiOnOutcomeChange(idx) {
  const outcome = document.getElementById(`odi-outcome-${idx}`)?.value;
  const swapSec = document.getElementById(`odi-swap-section-${idx}`);
  const notesReq = document.getElementById(`odi-notes-req-${idx}`);
  const swapSel = document.getElementById(`odi-swap-device-${idx}`);

  const needsNotes = outcome === 'faulty' || outcome === 'lost';
  if (notesReq) notesReq.classList.toggle('hidden', !needsNotes);

  if (swapSec) {
    swapSec.classList.toggle('hidden', outcome !== 'swap');
    if (outcome === 'swap' && swapSel) {
      const deviceId = document.getElementById(`odi-device-${idx}`)?.value;
      const dtype = _odiGetDeviceType(deviceId);
      // Build options for available (non-assigned, non-retired) devices of same type
      if (dtype && _odiInventory) {
        const allInv = dtype === 'modems' ? (_odiInventory._allModems || [])
                      : dtype === 'laptops' ? (_odiInventory._allLaptops || [])
                      : (_odiInventory._allSims || []);
        swapSel.innerHTML = '<option value="">Select replacement…</option>' +
          allInv.filter(d => d.id !== deviceId && !d.assigned_to && !d.removal_date)
                .map(d => `<option value="${_esc(d.id)}">${_esc(d.id)}</option>`).join('');
      }
    }
  }
}

async function saveOtherDeviceIssue() {
  const completionDate = document.getElementById('odi-completion-date').value;
  const notes = document.getElementById('odi-notes').value.trim();

  if (!completionDate) { setError('odi-error', 'Issue occurred date is required.'); return; }
  const cd = new Date(completionDate);
  if (cd > new Date()) { setError('odi-error', 'Date cannot be in the future.'); return; }

  // Collect device rows
  const rows = document.querySelectorAll('[id^="odi-row-"]');
  const devices = [];
  for (const row of rows) {
    const idx = row.id.replace('odi-row-', '');
    const deviceId = document.getElementById(`odi-device-${idx}`)?.value;
    const outcome  = document.getElementById(`odi-outcome-${idx}`)?.value;
    const devNotes = document.getElementById(`odi-device-notes-${idx}`)?.value.trim();
    const swapId   = document.getElementById(`odi-swap-device-${idx}`)?.value;

    if (!deviceId) { setError('odi-error', `Select a device for row ${parseInt(idx)+1}.`); return; }
    if (!outcome)  { setError('odi-error', `Select an outcome for row ${parseInt(idx)+1}.`); return; }
    if ((outcome === 'faulty' || outcome === 'lost') && !devNotes) {
      setError('odi-error', `Notes are required for ${outcome} outcome (row ${parseInt(idx)+1}).`); return;
    }
    if (outcome === 'swap' && !swapId) {
      setError('odi-error', `Select a replacement device for row ${parseInt(idx)+1}.`); return;
    }

    devices.push({
      device_type:    _odiGetDeviceType(deviceId),
      device_id:      deviceId,
      outcome,
      swap_device_id: swapId || null,
      notes:          devNotes || null,
      issue_date:     completionDate,
    });
  }

  if (!devices.length) { setError('odi-error', 'Add at least one device entry.'); return; }

  setLoading('odi-save', true);
  const { ok, data } = await apiPost(
    `/api/patients/${PATIENT_HOMER_ID}/complete-event/other-device-issue`,
    { event_id: _odiEventId, completion_date: completionDate, notes: notes || null, devices }
  );
  setLoading('odi-save', false);
  if (!ok) { setError('odi-error', data.error || 'Failed to save.'); return; }

  hideModal('other-device-issue-modal');
  loadPatientEvents();
}
