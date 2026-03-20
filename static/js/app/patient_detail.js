/* ============================================================
   patient_detail.js — Patient detail page: overview, tabs, modals
   PATIENT_HOMER_ID is set inline by the template.
   ============================================================ */

let patientData = null;
let isAdmin = false;

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  unassigned:          'Unassigned',
  inactive:            'Inactive',
  active:              'Active',
  active_partial:      'Active (Partial)',
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
  active_partial:      'bg-sky-100 text-sky-700',
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

  // Show VCG tab for control group only
  const vcgBtn = document.getElementById('tab-btn-vcg');
  if (vcgBtn) vcgBtn.classList.toggle('hidden', p.group !== 'control');

  renderActions(p);
}

// ── Action buttons ────────────────────────────────────────────────────────────

const ACTION_DEFS = {
  inactive: [
    { label: 'Activate',          color: 'bg-blue-600 hover:bg-blue-700 text-white',   action: () => openActivateModal() },
    { label: 'Discontinue',       color: 'bg-red-100 hover:bg-red-200 text-red-700',   action: () => openDiscontinueModal() },
  ],
  active: [
    { label: 'Complete Training', color: 'bg-teal-600 hover:bg-teal-700 text-white',   action: () => openCompleteTrainingModal() },
    { label: 'Discontinue',       color: 'bg-red-100 hover:bg-red-200 text-red-700',   action: () => openDiscontinueModal() },
  ],
  active_partial: [
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

function openActivateModal() {
  document.getElementById('activate-homer-id').textContent = PATIENT_HOMER_ID;
  document.getElementById('activate-date').value = '';
  setError('activate-error', '');
  showModal('activate-modal');
}

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

async function submitActivate() {
  const date = document.getElementById('activate-date').value;
  if (!date) { setError('activate-error', 'Please select an activation date.'); return; }
  const { ok, data } = await apiPost(`/api/patients/${PATIENT_HOMER_ID}/activate`, { activationDate: date });
  if (!ok) { setError('activate-error', data.error || 'Failed to activate patient.'); return; }
  hideModal('activate-modal');
  loadPatient();
}

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
  return `
    <div class="flex items-center justify-between px-3 py-2.5 rounded-xl border ${urgency} gap-3">
      <div class="min-w-0">
        <div class="font-medium text-slate-800 text-sm truncate">${ev.event_name}</div>
        <div class="text-xs text-slate-500 mt-0.5">${dateStr}</div>
      </div>
      <span class="text-xs font-semibold ${textColor} whitespace-nowrap flex-shrink-0">${whenLabel}</span>
    </div>`;
}

function emptyEventState(icon, colorClass, msg) {
  return `<div class="flex flex-col items-center justify-center py-6 ${colorClass}"><i class="fas fa-${icon} text-xl mb-1.5"></i><p class="text-xs">${msg}</p></div>`;
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
  ['activate-submit', 'complete-training-submit', 'a1-submit', 'a2-submit', 'discontinue-submit'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.dataset.label = btn.textContent;
  });

  await loadPrivilege();
  await loadPatient();
  loadPatientEvents();
  switchTab('overview');
});
