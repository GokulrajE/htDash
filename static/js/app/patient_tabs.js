/* ============================================================
   patient_tabs.js — Patient tab renderers: ADL, VCG, Mechanisms, Timeline, Adverse Events, Issues
   HOMER Clinical Dashboard
   ============================================================ */

    // Global time records data - stores records from separate file
    let timeRecordsData = {};
    
    // Load time records for a patient from the separate file
    async function loadTimeRecordsForPatient(userId) {
      try {
        const response = await fetch(`/time_records/get_time_records/${userId}`);
        const data = await response.json();
        if (data.status === 'success' && data.has_records) {
          timeRecordsData = data.records;
        } else {
          timeRecordsData = {};
        }
      } catch (error) {
        console.error('Error loading time records:', error);
        timeRecordsData = {};
      }
    }

    // Track which exercises have been recorded (across all prescriptions)
    let recordedAdlExercises = new Set();
    let recordedVcgExercises = new Set();
    let currentAdlPatientId = null;
    let currentVcgPatientId = null;

    // ADL Tab
    async function loadAdlTab(content) {
      // First load time records from separate file
      const patient = selectedPatientData;
      await loadTimeRecordsForPatient(patient.HospitalID);
      
      const isPatientDropped = droppedOutPatients.has(patient.HospitalID) || patient.discontinued === true || trialCompletedPatients.has(patient.HospitalID) || patient.studyPaused === true;

      const role = (patient.role || '').toLowerCase();
      
      if (role === 'unassigned') {
        content.innerHTML = `<div class="text-center py-8 text-slate-500">Please assign this patient to a group first</div>`;
        return;
      }

      const isPausedAdl = patient.studyPaused === true;
      const isTrialDoneAdl = trialCompletedPatients.has(patient.HospitalID);
      const _adlBgCls  = isPausedAdl ? 'bg-amber-50 border-amber-200' : isTrialDoneAdl ? 'bg-teal-50 border-teal-200' : 'bg-red-50 border-red-200';
      const _adlIcon   = isPausedAdl ? 'fa-pause-circle text-amber-400' : isTrialDoneAdl ? 'fa-check-circle text-teal-400' : 'fa-lock text-red-400';
      const _adlTxtCls = isPausedAdl ? 'text-amber-700' : isTrialDoneAdl ? 'text-teal-700' : 'text-red-700';
      const _adlMsg    = isPausedAdl ? 'Study paused' : isTrialDoneAdl ? 'Trial completed' : 'Patient discontinued';
      const discontinuedBannerAdl = isPatientDropped ? `
        <div class="${_adlBgCls} rounded-xl px-4 py-3 mb-4 flex items-center gap-3 border">
          <i class="fas ${_adlIcon}"></i>
          <p class="text-sm ${_adlTxtCls} font-medium">${_adlMsg} — ADL prescription is read-only.</p>
        </div>` : '';
      
      content.innerHTML = `
        ${discontinuedBannerAdl}
        <div class="flex justify-between items-center mb-4">
          <h3 class="font-semibold text-slate-800">ADL Exercises</h3>
          <div class="flex gap-2">
            ${!isPatientDropped ? `<button onclick="showAdlModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>Set ADL</button>` : ''}
            <button onclick="printAdlExercises()" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300"><i class="fas fa-print"></i></button>
          </div>
        </div>
        <div id="adl-prescription-status"></div>
        <div id="adl-exercises-display" class="space-y-3"></div>
        <div id="adl-previous-prescription" class="mt-6"></div>`;
      
      // Load existing prescription
      const data = await loadAdlPrescription(patient.HospitalID);
      renderAdlPrescriptionStatus(data);
      
      // Check for previous prescription
      try {
        const prevResponse = await fetch(`/get_previous_prescription/${patient.HospitalID}/adl`);
        const prevData = await prevResponse.json();
        if (prevData.status === 'success' && prevData.has_prescription) {
          renderPreviousAdlPrescription(prevData);
        }
      } catch (e) {
        console.log('No previous ADL prescription found');
      }
    }
    
    function renderPreviousAdlPrescription(data) {
      const container = document.getElementById('adl-previous-prescription');
      if (!container) return;
      
      const exercises = data.enriched_exercises || [];
      if (exercises.length === 0) return;
      
      const createdDate = data.prescription?.created_at ? new Date(data.prescription.created_at).toLocaleDateString() : 'Unknown';
      
      container.innerHTML = `
        <div class="border-t border-slate-200 pt-4 mt-4">
          <h4 class="font-medium text-slate-600 mb-3"><i class="fas fa-history mr-2"></i>Previous Prescription (from ${createdDate})</h4>
          <div class="bg-slate-50 rounded-lg p-4 space-y-2">
            ${exercises.map((ex, idx) => `
              <div class="flex items-center justify-between p-2 bg-white rounded border border-slate-200">
                <div class="flex items-center gap-2">
                  <span class="w-5 h-5 bg-slate-300 text-white rounded-full flex items-center justify-center text-xs">${idx + 1}</span>
                  <span class="text-sm text-slate-700">${ex.short_name}</span>
                </div>
                <span class="text-xs text-slate-500">${ex.dosage?.sets || 3}×${ex.dosage?.reps || 10}</span>
              </div>
            `).join('')}
          </div>
        </div>`;
    }
    
    function renderAdlPrescriptionStatus(data) {
      const statusContainer = document.getElementById('adl-prescription-status');
      const exercisesContainer = document.getElementById('adl-exercises-display');
      const isPatientDroppedAdl = selectedPatientData && (droppedOutPatients.has(selectedPatientData.HospitalID) || selectedPatientData.discontinued === true || trialCompletedPatients.has(selectedPatientData.HospitalID) || selectedPatientData.studyPaused === true);
      
      if (data.has_prescription && data.enriched_exercises && data.enriched_exercises.length > 0) {
        statusContainer.innerHTML = `
          <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <div class="flex items-center gap-2 text-green-700 font-medium">
              <i class="fas fa-check-circle"></i> ADL Prescription Set
            </div>
            <div class="text-sm text-green-600 mt-1">Exercises: ${data.enriched_exercises.length}</div>
          </div>`;
        
        // Store for edit/delete — preserve existing timeRecords from global data
        currentAdlPrescription = data.enriched_exercises.map(ex => {
          const exerciseRecords = timeRecordsData[ex.id] || {};
          const adlRecords = exerciseRecords.adl || [];
          return {
            id: ex.id,
            short_name: ex.short_name,
            full_name: ex.full_name,
            dosage: ex.dosage || { sets: ex.default_sets || 3, reps: ex.default_reps || 10 },
            timeRecords: adlRecords
          };
        });
        
        // Track which exercises have been recorded - clear if new patient, otherwise merge
        const patient = selectedPatientData;
        if (patient && currentAdlPatientId !== patient.HospitalID) {
          currentAdlPatientId = patient.HospitalID;
          recordedAdlExercises = new Set(); // Clear for new patient
        }
        data.enriched_exercises.forEach(ex => {
          const exerciseRecords = timeRecordsData[ex.id] || {};
          const adlRecords = exerciseRecords.adl || [];
          if (adlRecords && adlRecords.length > 0) {
            recordedAdlExercises.add(ex.id);
            console.log('ADL Recorded exercise:', ex.id, ex.short_name, adlRecords.length);
          }
        });
        console.log('recordedAdlExercises Set:', [...recordedAdlExercises]);
        
        exercisesContainer.innerHTML = data.enriched_exercises.map((ex, idx) => {
          const dosage = ex.dosage || { sets: ex.default_sets || 3, reps: ex.default_reps || 10 };
          const exerciseRecords = timeRecordsData[ex.id] || {};
          const timeRecords = exerciseRecords.adl || [];
          const isRecorded = recordedAdlExercises.has(ex.id);
          console.log('Rendering exercise:', ex.id, ex.short_name, 'isRecorded:', isRecorded, 'timeRecords:', timeRecords.length);
          const recCount = timeRecords.length;
          const recSummary = recCount === 0
            ? `<span class="text-slate-400 text-xs">No records yet</span>`
            : `<span class="text-green-700 text-xs font-medium">${recCount} session${recCount > 1 ? 's' : ''} logged</span>`;

          const recordsHtml = timeRecords.length > 0 ? `
            <div id="adl-records-${idx}" class="hidden mt-3 ml-9 space-y-1">
              ${timeRecords.map((r, ri) => `
                <div class="flex items-center justify-between px-3 py-1.5 bg-white rounded-lg border border-orange-200 text-xs">
                  <span class="text-slate-600 font-medium">${r.date}</span>
                  <span class="text-slate-500">${formatTime12(r.startTime)} – ${formatTime12(r.endTime)}</span>
                  <span class="text-orange-700 font-semibold">${r.reps} reps</span>
                </div>`).join('')}
            </div>` : '';

          return `
            <div class="p-4 bg-orange-50 rounded-xl border-l-4 border-orange-400">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-3">
                  <span class="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-xs font-bold">${idx + 1}</span>
                  <span class="font-semibold text-slate-800">${ex.short_name}</span>
                </div>
                <div class="flex gap-2">
                  ${isPatientDroppedAdl
                    ? `<span class="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium">${recCount > 0 ? recCount + ' session' + (recCount > 1 ? 's' : '') : 'Read-only'}</span>`
                    : (!isRecorded ? `<button onclick="recordAdlExerciseTime(${idx})" class="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"><i class="fas fa-plus"></i> Log Time</button>` : `<span class="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium"><i class="fas fa-check-circle mr-1"></i>Recorded</span>`)
                  }
                </div>
              </div>
              <div class="text-sm text-slate-500 ml-9 mb-2">${ex.full_name}</div>
              <div class="ml-9 flex items-center gap-3">
                <div class="bg-orange-100 rounded-lg px-3 py-1.5 text-xs">
                  <span class="text-orange-700 font-medium">${dosage.sets} sets × ${dosage.reps} reps</span>
                </div>
                <div class="flex items-center gap-1.5">
                  ${recSummary}
                  ${recCount > 0 ? `<button onclick="toggleAdlRecords(${idx})" class="text-xs text-orange-600 hover:text-orange-800 underline" id="adl-toggle-${idx}">Show</button>` : ''}
                </div>
              </div>
              ${recordsHtml}
            </div>`;
        }).join('');
      } else {
        currentAdlPrescription = [];
        statusContainer.innerHTML = `
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div class="flex items-center gap-2 text-yellow-700 font-medium">
              <i class="fas fa-exclamation-circle"></i> No ADL Exercises Prescribed
            </div>
            <div class="text-sm text-yellow-600 mt-1">Click "Set ADL" to create a prescription</div>
          </div>`;
        exercisesContainer.innerHTML = '';
      }
    }

    // Convert "HH:MM" 24-hour string to "h:MM AM/PM"
    function formatTime12(timeStr) {
      if (!timeStr) return timeStr;
      const [h, m] = timeStr.split(':').map(Number);
      if (isNaN(h) || isNaN(m)) return timeStr;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
    }

    function toggleAdlRecords(idx) {
      const el = document.getElementById(`adl-records-${idx}`);
      const btn = document.getElementById(`adl-toggle-${idx}`);
      if (!el) return;
      const isHidden = el.classList.contains('hidden');
      el.classList.toggle('hidden', !isHidden);
      if (btn) btn.textContent = isHidden ? 'Hide' : 'Show';
    }
    
    function editAdlExercise(index) {
      const ex = currentAdlPrescription[index];
      if (!ex) return;
      
      // Store the index being edited for swap reference
      window.editingAdlExerciseIndex = index;
      window.editingAdlExercise = ex;
      
      // Show the exercise selection modal - user can swap from there
      showAdlModal();
    }
    
    let currentAdlPrescription = [];
    
    function recordAdlExerciseTime(index) {
      const ex = currentAdlPrescription[index];
      if (!ex) return;
      // Remove any existing modal
      const existing = document.getElementById('record-adl-time-modal');
      if (existing) existing.remove();

      const today = new Date().toISOString().split('T')[0];
      const existingRecords = ex.timeRecords || [];

      const recordsHtml = existingRecords.length > 0 ? `
        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-sm font-semibold text-slate-700">Session History</h4>
            <span class="text-xs text-slate-400">${existingRecords.length} record${existingRecords.length > 1 ? 's' : ''}</span>
          </div>
          <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            ${existingRecords.map((record, idx) => `
              <div class="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-lg border border-orange-200">
                <div class="flex-1 grid grid-cols-3 gap-1 text-xs">
                  <span class="font-medium text-slate-700">${record.date}</span>
                  <span class="text-slate-500 text-center">${formatTime12(record.startTime)} – ${formatTime12(record.endTime)}</span>
                  <span class="text-orange-700 font-semibold text-right">${record.reps} reps</span>
                </div>
              </div>`).join('')}
          </div>
        </div>` : '';

      const modalHtml = `
        <div id="record-adl-time-modal" class="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div class="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 class="text-base font-bold text-white">${ex.short_name}</h3>
                <p class="text-orange-100 text-xs mt-0.5">Log Exercise Session</p>
              </div>
              <button onclick="document.getElementById('record-adl-time-modal').remove()" class="text-white/80 hover:text-white"><i class="fas fa-times text-lg"></i></button>
            </div>
            <div class="p-5">
              ${recordsHtml}
              <div class="space-y-3">
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">Date</label>
                  <input type="date" id="rt-adl-date" value="${today}" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">Start Time</label>
                    <input type="time" id="rt-adl-start-time" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">End Time</label>
                    <input type="time" id="rt-adl-end-time" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">Reps Completed</label>
                  <input type="number" id="rt-adl-reps" value="${ex.dosage?.reps || 10}" min="1" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400">
                </div>
              </div>
              <div class="flex gap-3 mt-5">
                <button onclick="document.getElementById('record-adl-time-modal').remove()" class="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-medium">Close</button>
                <button onclick="saveAdlExerciseTime(${index})" class="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition-colors"><i class="fas fa-plus mr-1.5"></i>Save Session</button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    function saveAdlExerciseTime(index) {
      const date = document.getElementById('rt-adl-date').value;
      const startTime = document.getElementById('rt-adl-start-time').value;
      const endTime = document.getElementById('rt-adl-end-time').value;
      const reps = document.getElementById('rt-adl-reps').value;
      
      if (!date || !startTime || !endTime) {
        if (!date) document.getElementById('rt-adl-date').classList.add('border-red-400');
        if (!startTime) document.getElementById('rt-adl-start-time').classList.add('border-red-400');
        if (!endTime) document.getElementById('rt-adl-end-time').classList.add('border-red-400');
        return;
      }
      
      const timeRecord = { date, startTime, endTime, reps: reps || '—' };
      
      // Save to separate time records file
      fetch('/time_records/save_time_record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedPatientData.HospitalID,
          login_id: currentUser.loginId,
          exercise_id: currentAdlPrescription[index].id,
          exercise_type: 'adl',
          time_record: timeRecord
        })
      }).then(r => r.json()).then(data => {
        if (data.status === 'success') {
          // Update local state
          if (!currentAdlPrescription[index].timeRecords) {
            currentAdlPrescription[index].timeRecords = [];
          }
          currentAdlPrescription[index].timeRecords.push(timeRecord);
          
          // Close modal immediately
          document.getElementById('record-adl-time-modal').remove();
          showToast('Session recorded successfully');

          // Mark exercise as recorded
          recordedAdlExercises.add(currentAdlPrescription[index].id);

          // Surgically update ONLY this exercise card — no full re-render, no server fetch
          _refreshAdlExerciseCard(index);
        } else {
          showToast('Failed to save - ' + (data.message || 'retry'), 'error');
        }
      }).catch(() => showToast('Save error — check connection', 'error'));
    }

    // Rebuild a single ADL exercise card in-place without touching any other state
    function _refreshAdlExerciseCard(index) {
      const container = document.getElementById('adl-exercises-display');
      if (!container) return;
      const cards = container.children;
      if (!cards[index]) return;

      const ex = currentAdlPrescription[index];
      if (!ex) return;
      const dosage = ex.dosage || { sets: 3, reps: 10 };
      const timeRecords = ex.timeRecords || [];
      const recCount = timeRecords.length;
      const isPatientDroppedAdl = selectedPatientData && (droppedOutPatients.has(selectedPatientData.HospitalID) || selectedPatientData.discontinued === true || trialCompletedPatients.has(selectedPatientData.HospitalID) || selectedPatientData.studyPaused === true);

      const recSummary = recCount === 0
        ? `<span class="text-slate-400 text-xs">No records yet</span>`
        : `<span class="text-green-700 text-xs font-medium">${recCount} session${recCount > 1 ? 's' : ''} logged</span>`;

      const recordsHtml = timeRecords.length > 0 ? `
        <div id="adl-records-${index}" class="hidden mt-3 ml-9 space-y-1">
          ${timeRecords.map((r) => `
            <div class="flex items-center justify-between px-3 py-1.5 bg-white rounded-lg border border-orange-200 text-xs">
              <span class="text-slate-600 font-medium">${r.date}</span>
              <span class="text-slate-500">${formatTime12(r.startTime)} – ${formatTime12(r.endTime)}</span>
              <span class="text-orange-700 font-semibold">${r.reps} reps</span>
            </div>`).join('')}
        </div>` : '';

      const actionBtn = isPatientDroppedAdl
        ? `<span class="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium">${recCount > 0 ? recCount + ' session' + (recCount > 1 ? 's' : '') : 'Read-only'}</span>`
        : `<span class="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium"><i class="fas fa-check-circle mr-1"></i>Recorded</span>`;

      cards[index].innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-3">
            <span class="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-xs font-bold">${index + 1}</span>
            <span class="font-semibold text-slate-800">${ex.short_name}</span>
          </div>
          <div class="flex gap-2">${actionBtn}</div>
        </div>
        <div class="text-sm text-slate-500 ml-9 mb-2">${ex.full_name}</div>
        <div class="ml-9 flex items-center gap-3">
          <div class="bg-orange-100 rounded-lg px-3 py-1.5 text-xs">
            <span class="text-orange-700 font-medium">${dosage.sets} sets × ${dosage.reps} reps</span>
          </div>
          <div class="flex items-center gap-1.5">
            ${recSummary}
            ${recCount > 0 ? `<button onclick="toggleAdlRecords(${index})" class="text-xs text-orange-600 hover:text-orange-800 underline" id="adl-toggle-${index}">Show</button>` : ''}
          </div>
        </div>
        ${recordsHtml}`;
    }
    
    function deleteAdlTimeRecord(exerciseIndex, recordIndex) {
      if (!currentAdlPrescription[exerciseIndex]?.timeRecords) return;
      const exerciseId = currentAdlPrescription[exerciseIndex].id;
      const deletedRecord = currentAdlPrescription[exerciseIndex].timeRecords[recordIndex];
      
      // Delete from separate time records file
      fetch('/time_records/delete_time_record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedPatientData.HospitalID,
          login_id: currentUser.loginId,
          exercise_id: exerciseId,
          exercise_type: 'adl',
          record_index: recordIndex
        })
      }).then(r => r.json()).then(data => {
        if (data.status === 'success') {
          currentAdlPrescription[exerciseIndex].timeRecords.splice(recordIndex, 1);
          // Update recorded set
          if (currentAdlPrescription[exerciseIndex].timeRecords.length === 0) {
            recordedAdlExercises.delete(exerciseId);
          }
          // Refresh the modal if open
          const modal = document.getElementById('record-adl-time-modal');
          if (modal) { modal.remove(); recordAdlExerciseTime(exerciseIndex); }
          _refreshAdlExerciseCard(exerciseIndex);
        } else {
          showToast('Failed to delete - ' + (data.message || 'retry'), 'error');
        }
      }).catch(() => showToast('Delete error — check connection', 'error'));
    }

    async function deleteAdlExercise(index) {
      if (!confirm('Are you sure you want to delete this exercise?')) return;
      currentAdlPrescription.splice(index, 1);
      await saveAdlPrescriptionEdit();
    }
    
    async function saveAdlPrescriptionEdit() {
      // Save current local state to server, then reload tab from fresh server data.
      // Used for delete/edit actions (not time recording — that uses optimistic render).
      if (!selectedPatientData) return;
      
      // Remove timeRecords from exercises before saving - they are stored separately now
      const exercisesWithoutTimeRecords = currentAdlPrescription.map(ex => ({
        id: ex.id,
        short_name: ex.short_name,
        full_name: ex.full_name,
        dosage: ex.dosage
      }));
      
      try {
        const response = await fetch('/adl/save_adl_prescription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: selectedPatientData.HospitalID,
            login_id: currentUser.loginId,
            exercises: exercisesWithoutTimeRecords
          })
        });
        const data = await response.json();
        if (data.status === 'success') {
          // After confirmed save, reload tab from server so state is canonical
          const content = document.getElementById('detail-content');
          if (content) {
            document.querySelectorAll('.detail-tab-btn, .vcg-tab-btn').forEach(btn => {
              btn.classList.remove('active', 'border-blue-600', 'text-slate-800');
              btn.classList.add('border-transparent', 'text-slate-600');
            });
            const adlTabBtn = document.querySelector('.detail-tab-btn[data-tab="adl"]');
            if (adlTabBtn) {
              adlTabBtn.classList.add('active', 'border-blue-600', 'text-slate-800');
              adlTabBtn.classList.remove('border-transparent', 'text-slate-600');
            }
            await loadAdlTab(content);
          }
        } else {
          showToast(data.message || 'Save failed', 'error');
        }
      } catch (error) {
        console.error('Error updating ADL prescription:', error);
        showToast('Failed to save ADL prescription', 'error');
      }
    }
    
    // VCG Tab (for Control patients only)
    async function loadVcgTab(content) {
      // First load time records from separate file
      const patient = selectedPatientData;
      await loadTimeRecordsForPatient(patient.HospitalID);
      
      const isPatientDroppedVcg = droppedOutPatients.has(patient.HospitalID) || patient.discontinued === true || trialCompletedPatients.has(patient.HospitalID) || patient.studyPaused === true;

      const role = (patient.role || '').toLowerCase();
      
      if (role !== 'control') {
        content.innerHTML = `<div class="text-center py-8 text-slate-500">VCG exercises are only for Control group patients</div>`;
        return;
      }
      
      if (!patient.activated) {
        content.innerHTML = `
          <div class="text-center py-8">
            <p class="text-orange-600 mb-4">This patient has not been activated yet.</p>
            <button onclick="showActivateModal('${patient.HospitalID}')" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Activate Patient</button>
          </div>`;
        return;
      }

      const isPausedVcg = patient.studyPaused === true;
      const isTrialDoneVcg = trialCompletedPatients.has(patient.HospitalID);
      const _vcgBgCls  = isPausedVcg ? 'bg-amber-50 border-amber-200' : isTrialDoneVcg ? 'bg-teal-50 border-teal-200' : 'bg-red-50 border-red-200';
      const _vcgIcon   = isPausedVcg ? 'fa-pause-circle text-amber-400' : isTrialDoneVcg ? 'fa-check-circle text-teal-400' : 'fa-lock text-red-400';
      const _vcgTxtCls = isPausedVcg ? 'text-amber-700' : isTrialDoneVcg ? 'text-teal-700' : 'text-red-700';
      const _vcgMsg    = isPausedVcg ? 'Study paused' : isTrialDoneVcg ? 'Trial completed' : 'Patient discontinued';
      const discontinuedBannerVcg = isPatientDroppedVcg ? `
        <div class="${_vcgBgCls} rounded-xl px-4 py-3 mb-4 flex items-center gap-3 border">
          <i class="fas ${_vcgIcon}"></i>
          <p class="text-sm ${_vcgTxtCls} font-medium">${_vcgMsg} — VCG prescription is read-only.</p>
        </div>` : '';
      
      content.innerHTML = `
        ${discontinuedBannerVcg}
        <div class="flex justify-between items-center mb-4">
          <h3 class="font-semibold text-slate-800">VCG Exercises <span class="text-xs text-slate-500">(${patient.vcgType?.toUpperCase() || 'VCG 2'})</span></h3>
          <div class="flex gap-2">
            ${!isPatientDroppedVcg ? `<button onclick="showVcgModal()" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"><i class="fas fa-plus mr-1"></i>Set VCG</button>` : ''}
            <button onclick="printVcgExercises()" class="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300"><i class="fas fa-print"></i></button>
          </div>
        </div>
        <div id="vcg-prescription-status"></div>
        <div id="vcg-exercises-display" class="space-y-3"></div>
        <div id="vcg-previous-prescription" class="mt-6"></div>`;
      
      // Load existing prescription
      const data = await loadVcgPrescription(patient.HospitalID);
      renderVcgPrescriptionStatus(data);
      
      // Check for previous prescription
      try {
        const prevResponse = await fetch(`/get_previous_prescription/${patient.HospitalID}/vcg`);
        const prevData = await prevResponse.json();
        if (prevData.status === 'success' && prevData.has_prescription) {
          renderPreviousVcgPrescription(prevData);
        }
      } catch (e) {
        console.log('No previous prescription found');
      }
    }
    
    function renderPreviousVcgPrescription(data) {
      const container = document.getElementById('vcg-previous-prescription');
      if (!container) return;
      
      const exercises = data.enriched_exercises || [];
      if (exercises.length === 0) return;
      
      const createdDate = data.prescription?.created_at ? new Date(data.prescription.created_at).toLocaleDateString() : 'Unknown';
      
      container.innerHTML = `
        <div class="border-t border-slate-200 pt-4 mt-4">
          <h4 class="font-medium text-slate-600 mb-3"><i class="fas fa-history mr-2"></i>Previous Prescription (from ${createdDate})</h4>
          <div class="bg-slate-50 rounded-lg p-4 space-y-2">
            ${exercises.map((ex, idx) => `
              <div class="flex items-center justify-between p-2 bg-white rounded border border-slate-200">
                <div class="flex items-center gap-2">
                  <span class="w-5 h-5 bg-slate-300 text-white rounded-full flex items-center justify-center text-xs">${idx + 1}</span>
                  <span class="text-sm text-slate-700">${ex.short_name}</span>
                </div>
                <span class="text-xs text-slate-500">${ex.dosage?.sets || 3}×${ex.dosage?.reps || 10}</span>
              </div>
            `).join('')}
          </div>
        </div>`;
    }
    
    function renderVcgPrescriptionStatus(data) {
      const statusContainer = document.getElementById('vcg-prescription-status');
      const exercisesContainer = document.getElementById('vcg-exercises-display');
      const isPatientDroppedVcgRender = selectedPatientData && (droppedOutPatients.has(selectedPatientData.HospitalID) || selectedPatientData.discontinued === true || trialCompletedPatients.has(selectedPatientData.HospitalID) || selectedPatientData.studyPaused === true);
      
      if (data.has_prescription && data.enriched_exercises && data.enriched_exercises.length > 0) {
        statusContainer.innerHTML = `
          <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <div class="flex items-center gap-2 text-green-700 font-medium">
              <i class="fas fa-check-circle"></i> VCG Prescription Active
            </div>
            <div class="text-sm text-green-600 mt-1">Type: ${(data.prescription?.vcg_type || data.prescription?.vcgType || selectedPatientData.vcgType || '').toUpperCase()} | Exercises: ${data.enriched_exercises.length}</div>
          </div>`;
        
        // Store for edit/delete — preserve existing timeRecords from global data
        selectedVcgExercises = data.enriched_exercises.map(ex => {
          const exerciseRecords = timeRecordsData[ex.id] || {};
          const vcgRecords = exerciseRecords.vcg || [];
          return {
            id: ex.id,
            short_name: ex.short_name,
            full_name: ex.full_name,
            dosage: ex.dosage || { sets: ex.default_sets || 3, reps: ex.default_reps || 10 },
            timeRecords: vcgRecords
          };
        });
        
        // Track which exercises have been recorded - clear if new patient, otherwise merge
        if (currentVcgPatientId !== selectedPatientData.HospitalID) {
          currentVcgPatientId = selectedPatientData.HospitalID;
          recordedVcgExercises = new Set(); // Clear for new patient
        }
        data.enriched_exercises.forEach(ex => {
          const exerciseRecords = timeRecordsData[ex.id] || {};
          const vcgRecords = exerciseRecords.vcg || [];
          if (vcgRecords && vcgRecords.length > 0) {
            recordedVcgExercises.add(ex.id);
          }
        });
        
        exercisesContainer.innerHTML = data.enriched_exercises.map((ex, idx) => {
          const dosage = ex.dosage || { sets: ex.default_sets || 3, reps: ex.default_reps || 10 };
          const exerciseRecords = timeRecordsData[ex.id] || {};
          const timeRecords = exerciseRecords.vcg || [];
          const isRecorded = recordedVcgExercises.has(ex.id);
          const recCount = timeRecords.length;
          const recSummary = recCount === 0
            ? `<span class="text-slate-400 text-xs">No records yet</span>`
            : `<span class="text-green-700 text-xs font-medium">${recCount} session${recCount > 1 ? 's' : ''} logged</span>`;

          const recordsHtml = timeRecords.length > 0 ? `
            <div id="vcg-records-${idx}" class="hidden mt-3 ml-9 space-y-1">
              ${timeRecords.map((r, ri) => `
                <div class="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-purple-200 text-xs">
                  <span class="text-slate-600 font-medium">${r.date}</span>
                  <span class="text-slate-500">${formatTime12(r.startTime)} – ${formatTime12(r.endTime)}</span>
                  <span class="text-purple-700 font-semibold">${r.reps} reps</span>
                </div>`).join('')}
            </div>` : '';

          return `
            <div class="p-4 bg-purple-50 rounded-xl border-l-4 border-purple-400">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-3">
                  <span class="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">${idx + 1}</span>
                  <span class="font-semibold text-slate-800">${ex.short_name}</span>
                </div>
                <div class="flex gap-2">
                  ${isPatientDroppedVcgRender
                    ? `<span class="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium">${recCount > 0 ? recCount + ' session' + (recCount > 1 ? 's' : '') : 'Read-only'}</span>`
                    : (!isRecorded ? `<button onclick="recordVcgExerciseTime(${idx})" class="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"><i class="fas fa-plus"></i> Log Time</button>` : `<span class="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium"><i class="fas fa-check-circle mr-1"></i>Recorded</span>`)
                  }
                </div>
              </div>
              <div class="text-sm text-slate-500 ml-9 mb-2">${ex.full_name}</div>
              <div class="ml-9 flex items-center gap-3">
                <div class="bg-purple-100 rounded-lg px-3 py-1.5 text-xs">
                  <span class="text-purple-700 font-medium">${dosage.sets} sets × ${dosage.reps} reps</span>
                </div>
                <div class="flex items-center gap-1.5">
                  ${recSummary}
                  ${recCount > 0 ? `<button onclick="toggleVcgRecords(${idx})" class="text-xs text-purple-600 hover:text-purple-800 underline" id="vcg-toggle-${idx}">Show</button>` : ''}
                </div>
              </div>
              ${recordsHtml}
            </div>`;
        }).join('');
      } else {
        statusContainer.innerHTML = `
          <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div class="flex items-center gap-2 text-yellow-700 font-medium">
              <i class="fas fa-exclamation-circle"></i> No VCG Exercises Prescribed
            </div>
            <div class="text-sm text-yellow-600 mt-1">Click "Set VCG" to create a prescription</div>
          </div>`;
        exercisesContainer.innerHTML = '';
      }
    }

    function toggleVcgRecords(idx) {
      const el = document.getElementById(`vcg-records-${idx}`);
      const btn = document.getElementById(`vcg-toggle-${idx}`);
      if (!el) return;
      const isHidden = el.classList.contains('hidden');
      el.classList.toggle('hidden', !isHidden);
      if (btn) btn.textContent = isHidden ? 'Hide' : 'Show';
    }
    
    function editVcgExercise(index) {
      const ex = selectedVcgExercises[index];
      if (!ex) return;
      
      // Store the index being edited for swap reference
      window.editingVcgExerciseIndex = index;
      window.editingVcgExercise = ex;
      
      // Show the exercise selection modal - user can swap from there
      showVcgModal();
    }
    
    async function saveVcgPrescriptionEdit() {
      // Sync current selectedVcgExercises to server (used for time-record edits and deletes).
      // Does NOT re-render the tab — callers handle rendering to avoid race conditions.
      if (!selectedPatientData) return;
      
      // Remove timeRecords from exercises before saving - they are stored separately now
      const exercisesWithoutTimeRecords = selectedVcgExercises.map(ex => ({
        id: ex.id,
        short_name: ex.short_name,
        full_name: ex.full_name,
        dosage: ex.dosage
      }));
      
      const rawEditVcgType = (selectedPatientData.vcgType || '').toUpperCase();
      const vcgType = rawEditVcgType || 'VCG2';
      try {
        const response = await fetch('/save_controller_exercises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: selectedPatientData.HospitalID,
            login_id: currentUser.loginId,
            exercise_type: 'vcg',
            vcg_type: vcgType,
            exercises: exercisesWithoutTimeRecords
          })
        });
        const data = await response.json();
        if (data.status !== 'success') showToast(data.message || 'VCG sync failed', 'error');
      } catch (error) {
        console.error('Error syncing VCG prescription:', error);
        showToast('Failed to sync VCG prescription', 'error');
      }
    }
    
    function recordVcgExerciseTime(index) {
      const ex = selectedVcgExercises[index];
      if (!ex) return;
      // Remove any existing modal
      const existing = document.getElementById('record-vcg-time-modal');
      if (existing) existing.remove();

      const today = new Date().toISOString().split('T')[0];
      const existingRecords = ex.timeRecords || [];

      const recordsHtml = existingRecords.length > 0 ? `
        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-sm font-semibold text-slate-700">Session History</h4>
            <span class="text-xs text-slate-400">${existingRecords.length} record${existingRecords.length > 1 ? 's' : ''}</span>
          </div>
          <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            ${existingRecords.map((record, idx) => `
              <div class="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg border border-purple-200">
                <div class="flex-1 grid grid-cols-3 gap-1 text-xs">
                  <span class="font-medium text-slate-700">${record.date}</span>
                  <span class="text-slate-500 text-center">${formatTime12(record.startTime)} – ${formatTime12(record.endTime)}</span>
                  <span class="text-purple-700 font-semibold text-right">${record.reps} reps</span>
                </div>
              </div>`).join('')}
          </div>
        </div>` : '';

      const modalHtml = `
        <div id="record-vcg-time-modal" class="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div class="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 class="text-base font-bold text-white">${ex.short_name}</h3>
                <p class="text-purple-100 text-xs mt-0.5">Log Exercise Session</p>
              </div>
              <button onclick="document.getElementById('record-vcg-time-modal').remove()" class="text-white/80 hover:text-white"><i class="fas fa-times text-lg"></i></button>
            </div>
            <div class="p-5">
              ${recordsHtml}
              <div class="space-y-3">
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">Date</label>
                  <input type="date" id="rt-vcg-date" value="${today}" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">Start Time</label>
                    <input type="time" id="rt-vcg-start-time" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">End Time</label>
                    <input type="time" id="rt-vcg-end-time" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">Reps Completed</label>
                  <input type="number" id="rt-vcg-reps" value="${ex.dosage?.reps || 10}" min="1" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
                </div>
              </div>
              <div class="flex gap-3 mt-5">
                <button onclick="document.getElementById('record-vcg-time-modal').remove()" class="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-medium">Close</button>
                <button onclick="saveVcgExerciseTime(${index})" class="flex-1 px-4 py-2.5 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-sm font-semibold transition-colors"><i class="fas fa-plus mr-1.5"></i>Save Session</button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    function saveVcgExerciseTime(index) {
      const date = document.getElementById('rt-vcg-date').value;
      const startTime = document.getElementById('rt-vcg-start-time').value;
      const endTime = document.getElementById('rt-vcg-end-time').value;
      const reps = document.getElementById('rt-vcg-reps').value;
      
      if (!date || !startTime || !endTime) {
        if (!date) document.getElementById('rt-vcg-date').classList.add('border-red-400');
        if (!startTime) document.getElementById('rt-vcg-start-time').classList.add('border-red-400');
        if (!endTime) document.getElementById('rt-vcg-end-time').classList.add('border-red-400');
        return;
      }
      
      const timeRecord = { date, startTime, endTime, reps: reps || '—' };
      
      // Save to separate time records file
      fetch('/time_records/save_time_record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedPatientData.HospitalID,
          login_id: currentUser.loginId,
          exercise_id: selectedVcgExercises[index].id,
          exercise_type: 'vcg',
          time_record: timeRecord
        })
      }).then(r => r.json()).then(data => {
        if (data.status === 'success') {
          // Update local state
          if (!selectedVcgExercises[index].timeRecords) {
            selectedVcgExercises[index].timeRecords = [];
          }
          selectedVcgExercises[index].timeRecords.push(timeRecord);
          
          document.getElementById('record-vcg-time-modal').remove();
          showToast('Session recorded successfully');

          // Mark exercise as recorded
          recordedVcgExercises.add(selectedVcgExercises[index].id);

          // Surgically update ONLY this exercise card — no full re-render, no server fetch
          _refreshVcgExerciseCard(index);
        } else {
          showToast('Failed to save - ' + (data.message || 'retry'), 'error');
        }
      }).catch(() => showToast('Save error — check connection', 'error'));
    }

    // Rebuild a single VCG exercise card in-place without touching any other state
    function _refreshVcgExerciseCard(index) {
      const container = document.getElementById('vcg-exercises-display');
      if (!container) return;
      const cards = container.children;
      if (!cards[index]) return;

      const ex = selectedVcgExercises[index];
      if (!ex) return;
      const dosage = ex.dosage || { sets: 3, reps: 10 };
      const timeRecords = ex.timeRecords || [];
      const recCount = timeRecords.length;
      const isPatientDroppedVcg = selectedPatientData && (droppedOutPatients.has(selectedPatientData.HospitalID) || selectedPatientData.discontinued === true || trialCompletedPatients.has(selectedPatientData.HospitalID) || selectedPatientData.studyPaused === true);

      const recSummary = recCount === 0
        ? `<span class="text-slate-400 text-xs">No records yet</span>`
        : `<span class="text-green-700 text-xs font-medium">${recCount} session${recCount > 1 ? 's' : ''} logged</span>`;

      const recordsHtml = timeRecords.length > 0 ? `
        <div id="vcg-records-${index}" class="hidden mt-3 ml-9 space-y-1">
          ${timeRecords.map((r) => `
            <div class="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-purple-200 text-xs">
              <span class="text-slate-600 font-medium">${r.date}</span>
              <span class="text-slate-500">${formatTime12(r.startTime)} – ${formatTime12(r.endTime)}</span>
              <span class="text-purple-700 font-semibold">${r.reps} reps</span>
            </div>`).join('')}
        </div>` : '';

      const actionBtn = isPatientDroppedVcg
        ? `<span class="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium">${recCount > 0 ? recCount + ' session' + (recCount > 1 ? 's' : '') : 'Read-only'}</span>`
        : `<span class="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium"><i class="fas fa-check-circle mr-1"></i>Recorded</span>`;

      cards[index].innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-3">
            <span class="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">${index + 1}</span>
            <span class="font-semibold text-slate-800">${ex.short_name}</span>
          </div>
          <div class="flex gap-2">${actionBtn}</div>
        </div>
        <div class="text-sm text-slate-500 ml-9 mb-2">${ex.full_name}</div>
        <div class="ml-9 flex items-center gap-3">
          <div class="bg-purple-100 rounded-lg px-3 py-1.5 text-xs">
            <span class="text-purple-700 font-medium">${dosage.sets} sets × ${dosage.reps} reps</span>
          </div>
          <div class="flex items-center gap-1.5">
            ${recSummary}
            ${recCount > 0 ? `<button onclick="toggleVcgRecords(${index})" class="text-xs text-purple-600 hover:text-purple-800 underline" id="vcg-toggle-${index}">Show</button>` : ''}
          </div>
        </div>
        ${recordsHtml}`;
    }
    
    function deleteVcgTimeRecord(exerciseIndex, recordIndex) {
      if (!selectedVcgExercises[exerciseIndex]?.timeRecords) return;
      const exerciseId = selectedVcgExercises[exerciseIndex].id;
      
      // Delete from separate time records file
      fetch('/time_records/delete_time_record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedPatientData.HospitalID,
          login_id: currentUser.loginId,
          exercise_id: exerciseId,
          exercise_type: 'vcg',
          record_index: recordIndex
        })
      }).then(r => r.json()).then(data => {
        if (data.status === 'success') {
          selectedVcgExercises[exerciseIndex].timeRecords.splice(recordIndex, 1);
          // Update recorded set
          if (selectedVcgExercises[exerciseIndex].timeRecords.length === 0) {
            recordedVcgExercises.delete(exerciseId);
          }
          const modal = document.getElementById('record-vcg-time-modal');
          if (modal) { modal.remove(); recordVcgExerciseTime(exerciseIndex); }
          _refreshVcgExerciseCard(exerciseIndex);
        } else {
          showToast('Failed to delete - ' + (data.message || 'retry'), 'error');
        }
      }).catch(() => showToast('Delete error — check connection', 'error'));
    }
    
    async function deleteVcgExercise(index) {
      if (!confirm('Are you sure you want to delete this exercise?')) return;
      selectedVcgExercises.splice(index, 1);
      await saveVcgPrescriptionEdit();
      // Re-render so the UI reflects the deletion
      const content = document.getElementById('detail-content');
      if (content) await loadVcgTab(content);
    }
    
    // Mechanisms Tab (for Experimental patients - from cloud/robots)
    function loadMechanismsTab(content) {
      const patient = selectedPatientData;

      const role = (patient.role || '').toLowerCase();
      
      if (role !== 'experimental') {
        content.innerHTML = `<div class="text-center py-8 text-slate-500">Mechanisms are only for Experimental group patients</div>`;
        return;
      }
      
      content.innerHTML = `
        <div class="bg-slate-50 rounded-xl p-5">
          <h3 class="font-semibold text-slate-800 mb-4"><i class="fas fa-robot mr-2"></i>Robotic Mechanisms</h3>
          <div id="mechanisms-loading" class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-blue-600"></i><p class="text-slate-500 mt-2">Loading mechanisms from cloud...</p></div>
          <div id="mechanisms-content" class="hidden"></div>
        </div>`;
      
      fetchPatientMechanisms(patient.HospitalID);
    }
    
    async function fetchPatientMechanisms(hospitalId) {
      try {
        console.log('Fetching mechanisms for:', hospitalId);
        const response = await fetch(`/get-patient-mechanisms/${hospitalId}`);
        console.log('Mechanisms response:', response.status);
        const data = await response.json();
        console.log('Mechanisms data:', data);
        
        const loadingDiv = document.getElementById('mechanisms-loading');
        const contentDiv = document.getElementById('mechanisms-content');
        
        loadingDiv.classList.add('hidden');
        contentDiv.classList.remove('hidden');
        
        const mechanisms = data.mechanisms || [];
        const lastUpdated = data.last_updated;
        
        // Add last updated info at the top
        let lastUpdatedHtml = '';
        if (lastUpdated) {
          const date = new Date(lastUpdated);
          const formattedDate = date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
          const formattedTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          lastUpdatedHtml = `
            <div class="mb-4 text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-2 inline-flex items-center">
              <i class="fas fa-clock mr-2"></i>
              Config last updated: ${formattedDate} at ${formattedTime}
            </div>`;
        }
        
        if (mechanisms.length === 0) {
          contentDiv.innerHTML = `
            <div class="text-center py-8">
              <i class="fas fa-robot text-4xl text-slate-300 mb-3"></i>
              <p class="text-slate-500">No mechanism data available</p>
              <p class="text-sm text-slate-400">This patient hasn't used any robotic mechanisms yet</p>
              ${lastUpdatedHtml}
            </div>`;
          return;
        }
        
        const plutoMechs = mechanisms.filter(m => ['WFE','WURD','FPS','HOC','FME1','FME2'].includes(m.name));
        const marsMechs = mechanisms.filter(m => ['ML', 'AP', 'MLAP'].includes(m.name));
        
        let html = lastUpdatedHtml;  // Always show last updated at the top
        
        if (plutoMechs.length > 0) {
          html += `
            <div class="mb-6">
              <h4 class="font-medium text-blue-700 mb-3"><i class="fas fa-square mr-2"></i>PLUTO Mechanisms</h4>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                ${plutoMechs.map(m => `
                  <div class="p-3 bg-white rounded-lg border border-blue-100">
                    <div class="font-medium text-slate-800">${m.name}</div>
                    <div class="text-sm text-slate-500">Total: ${m.totalDuration?.toFixed(1) || 0} mins</div>
                  </div>
                `).join('')}
              </div>
            </div>`;
        }
        
        if (marsMechs.length > 0) {
          html += `
            <div class="mb-6">
              <h4 class="font-medium text-purple-700 mb-3"><i class="fas fa-square mr-2"></i>MARS Mechanisms</h4>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                ${marsMechs.map(m => `
                  <div class="p-3 bg-white rounded-lg border border-purple-100">
                    <div class="font-medium text-slate-800">${m.name}</div>
                    <div class="text-sm text-slate-500">Total: ${m.totalDuration?.toFixed(1) || 0} mins</div>
                  </div>
                `).join('')}
              </div>
            </div>`;
        }
        
        contentDiv.innerHTML = html;
        
      } catch (error) {
        console.error('Error fetching mechanisms:', error);
        const loadingDiv = document.getElementById('mechanisms-loading');
        const contentDiv = document.getElementById('mechanisms-content');
        loadingDiv.classList.add('hidden');
        contentDiv.classList.remove('hidden');
        contentDiv.innerHTML = `<div class="text-center py-8 text-red-500">Error loading mechanisms</div>`;
      }
    }

    // Timeline Tab
    function loadTimelineTab(content) {
      const patient = selectedPatientData;
      const isPausedTl = patient.studyPaused === true;
      const isDropped = isPausedTl || droppedOutPatients.has(patient.HospitalID) || patient.discontinued === true || trialCompletedPatients.has(patient.HospitalID);
      const _tlMsg = isPausedTl ? 'Study paused' : trialCompletedPatients.has(patient.HospitalID) ? 'Trial completed' : 'Patient discontinued';
      const _tlBgCls = isPausedTl ? 'bg-amber-50 border-amber-200' : trialCompletedPatients.has(patient.HospitalID) ? 'bg-teal-50 border-teal-200' : 'bg-red-50 border-red-200';
      const _tlIcon  = isPausedTl ? 'fa-pause-circle text-amber-400' : trialCompletedPatients.has(patient.HospitalID) ? 'fa-check-circle text-teal-400' : 'fa-lock text-red-400';
      const _tlTxtCls = isPausedTl ? 'text-amber-700' : trialCompletedPatients.has(patient.HospitalID) ? 'text-teal-700' : 'text-red-700';

      // Clear content completely first to prevent duplicates
      content.innerHTML = '';

      // Read-only banner for discontinued/trial-completed patients
      const readOnlyBanner = isDropped ? `
        <div class="${_tlBgCls} rounded-xl px-4 py-3 mb-4 flex items-center gap-3 border">
          <i class="fas ${_tlIcon}"></i>
          <p class="text-sm ${_tlTxtCls} font-medium">${_tlMsg} — timeline is read-only.</p>
        </div>` : '';

      content.innerHTML = `
        ${readOnlyBanner}
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-slate-800 text-base"><i class="fas fa-calendar-alt mr-2 text-blue-600"></i>Study Timeline</h3>
          </div>
          <!-- Hidden panel revealed by Ctrl+G -->
          <div id="manual-timeline-panel" class="hidden p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
            <input type="date" id="study-start-date" class="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400">
            <button onclick="regenerateTimeline()" class="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1.5"><i class="fas fa-sync text-xs"></i>Generate</button>
            <span class="text-xs text-blue-500 ml-auto">Press Ctrl+G again to hide</span>
          </div>
          <div id="timeline-loading" class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-blue-600"></i><p class="text-slate-500 mt-2">Loading timeline...</p></div>
          <div id="timeline-content" class="hidden"></div>
        </div>`;

      // Ctrl+G listener — toggle manual timeline panel (removed on next tab load)
      document.removeEventListener('keydown', window._ctrlGHandler);
      window._ctrlGHandler = (e) => {
        if (e.ctrlKey && e.key === 'g') {
          e.preventDefault();
          const panel = document.getElementById('manual-timeline-panel');
          if (panel) panel.classList.toggle('hidden');
        }
      };
      document.addEventListener('keydown', window._ctrlGHandler);

      fetchPatientTimeline(patient.HospitalID);
    }

    async function regenerateTimeline() {
      const hospitalId = selectedPatientData.HospitalID;
      const startDate = document.getElementById('study-start-date').value;
      const groupType = selectedPatientData.role || 'experimental';
      
      if (!startDate) {
        showToast('Please select a study start date');
        return;
      }
      
      const loadingDiv = document.getElementById('timeline-loading');
      const contentDiv = document.getElementById('timeline-content');
      
      loadingDiv.classList.remove('hidden');
      contentDiv.classList.add('hidden');
      
      try {
        const response = await fetch(`/patient_events/generate_timeline/${hospitalId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activationDate: startDate, groupType: groupType.toLowerCase() })
        });
        const data = await response.json();
        
        if (data.status === 'success') {
          fetchPatientTimeline(hospitalId);
          if (typeof logActivity === 'function') {
            logActivity('GENERATED_TIMELINE', { 
              patient_id: hospitalId,
              activation_date: startDate,
              group_type: groupType
            });
          }
        } else {
          showToast('Error generating timeline: ' + data.message);
          loadingDiv.classList.add('hidden');
          contentDiv.classList.remove('hidden');
        }
      } catch (error) {
        console.error('Error generating timeline:', error);
        alert('Error generating timeline');
        loadingDiv.classList.add('hidden');
        contentDiv.classList.remove('hidden');
      }
    }

    async function fetchPatientTimeline(hospitalId) {
      console.log("called");
      try {
        const response = await fetch(`/patient_events/get_timeline/${hospitalId}`);
        const data = await response.json();
        
        const loadingDiv = document.getElementById('timeline-loading');
        const contentDiv = document.getElementById('timeline-content');
        
        loadingDiv.classList.add('hidden');
        contentDiv.classList.remove('hidden');
        
        const events = data.events || [];
        
        // Set study start date in input field if events exist
        if (events.length > 0) {
          const startEvent = events.find(e => e.studyDay === 0);
          if (startEvent && startEvent.scheduledDate) {
            const startDateInput = document.getElementById('study-start-date');
            if (startDateInput) {
              startDateInput.value = startEvent.scheduledDate.split('T')[0];
            }
          }
        }
        
        const isDroppedNow = (selectedPatientData && selectedPatientData.studyPaused === true) || droppedOutPatients.has(hospitalId) || (selectedPatientData && selectedPatientData.discontinued === true) || trialCompletedPatients.has(hospitalId);
        if (events.length === 0) {
          const emptyHint = isDroppedNow
            ? '<p class="text-sm text-red-400 mt-1">Patient is discontinued</p>'
            : '<p class="text-sm text-slate-400 mt-1">Press <kbd class="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-mono">Ctrl+G</kbd> to manually generate timeline</p>';
          contentDiv.innerHTML = `
            <div class="text-center py-8">
              <i class="fas fa-calendar-alt text-4xl text-slate-300 mb-3"></i>
              <p class="text-slate-500">No timeline events found</p>
              ${emptyHint}
            </div>`;
          return;
        }

        // Change 5: Sort — overdue pending first (by day desc), then upcoming by day asc
        const today_sort = new Date(); today_sort.setHours(0,0,0,0);
        // Sort: overdue pending events by latest study day first, then all others by study day asc
        const overdueEvents  = events
          .filter(e => e.status !== 'completed' && e.status !== 'skipped' && e.status !== 'cancelled' && new Date(e.scheduledDate) < today_sort)
          .sort((a, b) => b.studyDay - a.studyDay);   // latest day first
        const nonOverdueEvents = events
          .filter(e => e.status === 'completed' || e.status === 'skipped' || e.status === 'cancelled' || new Date(e.scheduledDate) >= today_sort)
          .sort((a, b) => a.studyDay - b.studyDay);   // earliest day first
        const sortedEvents = [...overdueEvents, ...nonOverdueEvents];

        // Change 2: Fetch config mismatches and show warning banner if any
        let mismatchBanner = '';
        try {
          const mmRes = await fetch(`/get_config_mismatches/${hospitalId}`);
          const mmData = await mmRes.json();
          const mismatches = mmData.mismatches || [];
          if (mismatches.length > 0) {
            const latest = mismatches[mismatches.length - 1];
            mismatchBanner = `
              <div class="mb-4 flex items-start gap-3 px-4 py-3 bg-orange-50 border border-orange-300 rounded-xl">
                <i class="fas fa-exclamation-triangle text-orange-500 mt-0.5 shrink-0"></i>
                <div>
                  <p class="text-sm font-semibold text-orange-800">Config Date Mismatch (${latest.device})</p>
                  <p class="text-xs text-orange-600 mt-0.5">Activation date: <strong>${latest.activation_date}</strong> · Config StartDate: <strong>${latest.config_start_date}</strong> · Difference: <strong>${latest.diff_days} day(s)</strong>. The config file start date does not match the recorded activation date.</p>
                </div>
              </div>`;
          }
        } catch(_) { /* non-fatal */ }

        const visitEvents = sortedEvents.filter(e => e.eventType === 'visit' || e.eventType === 'checkin');
        const completedCount = visitEvents.filter(e => e.status === 'completed').length;
        const progressPct = visitEvents.length > 0 ? Math.round((completedCount / visitEvents.length) * 100) : 0;

        let html = mismatchBanner + `
          <div class="mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-slate-700">Study Progress</span>
              <span class="text-sm font-semibold text-blue-700">${completedCount} / ${visitEvents.length} Tasks completed</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-2">
              <div class="bg-blue-500 h-2 rounded-full transition-all duration-500" style="width:${progressPct}%"></div>
            </div>
          </div>
          <div class="rounded-xl border border-slate-200 overflow-hidden">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-slate-50 border-b border-slate-200">
                  <th class="px-4 py-3 font-semibold text-slate-600 text-left w-20">Day</th>
                  <th class="px-4 py-3 font-semibold text-slate-600 text-left">Event</th>
                  <th class="px-4 py-3 font-semibold text-slate-600 text-left w-32">Scheduled</th>
                  <th class="px-4 py-3 font-semibold text-slate-600 text-left w-28">Status</th>
                  <th class="px-4 py-3 font-semibold text-slate-600 text-left w-32">Completed</th>
                  <th class="px-4 py-3 font-semibold text-slate-600 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>`;
        
        // ── Pause window ─────────────────────────────────────────────────────────
        // Events whose scheduledDate falls between pausedAt and resumedAt (or today
        // if still paused) get a "Paused" badge. We never mutate stored status — display only.
        const _isPausedNow  = selectedPatientData?.studyPaused === true;
        const _pausedAtRaw  = selectedPatientData?.pausedAt  || null;
        const _resumedAtRaw = selectedPatientData?.resumedAt || null;
        let _pauseStart = _pausedAtRaw  ? new Date(_pausedAtRaw)  : null;
        let _pauseEnd   = _isPausedNow  ? new Date()              : (_resumedAtRaw ? new Date(_resumedAtRaw) : null);
        if (_pauseStart) _pauseStart.setHours(0, 0, 0, 0);
        if (_pauseEnd)   _pauseEnd.setHours(23, 59, 59, 999);
        function _inPauseWindow(dateStr) {
          if (!_pauseStart || !_pauseEnd) return false;
          const d = new Date(dateStr); d.setHours(12, 0, 0, 0);
          return d >= _pauseStart && d <= _pauseEnd;
        }
        // ─────────────────────────────────────────────────────────────────────────

        let _overdueHeaderAdded = false;
        let _upcomingHeaderAdded = false;

        sortedEvents.forEach(event => {
          const eventDate = new Date(event.scheduledDate);
          const isCompleted = event.status === 'completed';
          const isSkippedOrCancelled = event.status === 'skipped' || event.status === 'cancelled';
          const isOverdue = !isCompleted && !isSkippedOrCancelled && eventDate < today_sort;
          const eventStatus = event.status || 'pending';

          // Section divider headers
          if (isOverdue && !_overdueHeaderAdded) {
            html += `<tr><td colspan="6" class="px-4 pt-3 pb-1"><span class="text-xs font-bold text-red-500 uppercase tracking-wider"><i class="fas fa-exclamation-circle mr-1"></i>Overdue Events</span></td></tr>`;
            _overdueHeaderAdded = true;
          }
          if (!isOverdue && !_upcomingHeaderAdded && _overdueHeaderAdded) {
            html += `<tr><td colspan="6" class="px-4 pt-4 pb-1 border-t border-slate-200"><span class="text-xs font-bold text-slate-400 uppercase tracking-wider"><i class="fas fa-calendar-check mr-1"></i>Upcoming &amp; Completed Events</span></td></tr>`;
            _upcomingHeaderAdded = true;
          }

          const isPausedEvent = !isCompleted && !isSkippedOrCancelled && _inPauseWindow(event.scheduledDate);

          const dayLabel = `Day ${event.studyDay}`;

          const _today = new Date(); _today.setHours(0, 0, 0, 0);
          const eventDateOnly = new Date(event.scheduledDate); eventDateOnly.setHours(0, 0, 0, 0);
          const isFutureEvent = eventDateOnly > _today;

          let statusBadge = '';
          const isPatientDroppedTimeline = (selectedPatientData && selectedPatientData.studyPaused === true) || droppedOutPatients.has(hospitalId) || (selectedPatientData && selectedPatientData.discontinued === true) || trialCompletedPatients.has(hospitalId);

          if (isFutureEvent) {
            const badgeMap = { completed: 'bg-green-100 text-green-700', skipped: 'bg-yellow-100 text-yellow-700', cancelled: 'bg-gray-100 text-gray-700', pending: 'bg-blue-100 text-blue-700' };
            const badgeCls = badgeMap[eventStatus] || 'bg-blue-100 text-blue-700';
            statusBadge = `<span class="px-2 py-1 text-xs rounded-full ${badgeCls}">${eventStatus === 'pending' ? 'Upcoming' : eventStatus.charAt(0).toUpperCase() + eventStatus.slice(1)}</span>`;
          } else if (isPausedEvent) {
            statusBadge = `<span class="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-700 inline-flex items-center gap-1 cursor-pointer hover:bg-amber-200" onclick="showTimelineEventModal('${event.id}', '${hospitalId}', ${event.studyDay}, 'paused')"><i class="fas fa-pause-circle text-xs"></i>Paused</span>`;
          } else if (isPatientDroppedTimeline) {
            const badgeMap = { completed: 'bg-green-100 text-green-700', skipped: 'bg-yellow-100 text-yellow-700', cancelled: 'bg-gray-100 text-gray-700' };
            let label = eventStatus.charAt(0).toUpperCase() + eventStatus.slice(1);
            if (isOverdue && eventStatus === 'pending') label = 'Overdue';
            const badgeCls = badgeMap[eventStatus] || (isOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700');
            statusBadge = `<span class="px-2 py-1 text-xs rounded-full ${badgeCls}">${label}</span>`;
          } else if (eventStatus === 'completed') {
            statusBadge = `<span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700 cursor-pointer hover:bg-green-200" onclick="showTimelineEventModal('${event.id}', '${hospitalId}', ${event.studyDay}, 'completed')">Completed</span>`;
          } else if (eventStatus === 'skipped') {
            statusBadge = `<span class="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-700 cursor-pointer hover:bg-yellow-200" onclick="showTimelineEventModal('${event.id}', '${hospitalId}', ${event.studyDay}, 'skipped')">Skipped</span>`;
          } else if (eventStatus === 'cancelled') {
            statusBadge = `<span class="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700 cursor-pointer hover:bg-gray-200" onclick="showTimelineEventModal('${event.id}', '${hospitalId}', ${event.studyDay}, 'cancelled')">Cancelled</span>`;
          } else if (isOverdue) {
            statusBadge = `<span class="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700 cursor-pointer hover:bg-red-200" onclick="showTimelineEventModal('${event.id}', '${hospitalId}', ${event.studyDay}, 'pending')">Overdue</span>`;
          } else {
            statusBadge = `<span class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200" onclick="showTimelineEventModal('${event.id}', '${hospitalId}', ${event.studyDay}, 'pending')">Pending</span>`;
          }

          const rowClass = isFutureEvent ? 'bg-slate-50 opacity-60' : isPausedEvent ? 'bg-amber-50' : isOverdue ? 'bg-orange-50' : '';

          html += `
            <tr class="border-b border-slate-100 ${rowClass}">
              <td class="px-4 py-3 font-medium text-slate-700">${dayLabel}</td>
              <td class="px-4 py-3">${event.eventName.replace(/^Day\s*\d+\s*[-\u2013]\s*/i, '')}</td>
              <td class="px-4 py-3">${eventDate.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</td>
              <td class="px-4 py-3">${statusBadge}</td>
              <td class="px-4 py-3 text-slate-500">${isCompleted && event.completionDate ? new Date(event.completionDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '-'}</td>
              <td class="px-4 py-3 max-w-xs truncate text-slate-500">${event.notes || '-'}</td>
            </tr>`;
        });

        html += '</tbody></table></div>';
        
        contentDiv.innerHTML = html;

        // Render Quick Actions below the timeline table
        renderTimelineQuickActions(hospitalId);
        
      } catch (error) {
        console.error('Error fetching timeline:', error);
        const loadingDiv = document.getElementById('timeline-loading');
        const contentDiv = document.getElementById('timeline-content');
        loadingDiv.classList.add('hidden');
        contentDiv.classList.remove('hidden');
        contentDiv.innerHTML = `<div class="text-center py-8 text-red-500">Error loading timeline</div>`;
      }
    }

    async function renderTimelineQuickActions(patientId) {
      const patient = selectedPatientData;
      if (!patient || patient.discontinued) return;

      const isPaused = patient.studyPaused === true;
      const isExperimental = patient.role?.toLowerCase() === 'experimental';
      const isControl = patient.role?.toLowerCase() === 'control';
      const isTrialCompleted = trialCompletedPatients.has(patientId);

      // Calculate if patient has completed 28 days (both experimental and control)
      let is28DaysComplete = false;
      if (patient.activationDate) {
        try {
          const activationDate = new Date(patient.activationDate);
          const today = new Date();
          const daysDiff = Math.floor((today - activationDate) / (1000 * 60 * 60 * 24));
          is28DaysComplete = daysDiff >= 28;
        } catch (e) { /* silent */ }
      }

      // Fetch swap history
      let swaps = [];
      try {
        const res = await fetch(`/swap-watch-records/${patientId}`);
        const data = await res.json();
        swaps = (data.swapWatchRecords || []).sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
      } catch (e) { /* silent */ }

      const swapHistoryHtml = swaps.length === 0
        ? `<p class="text-xs text-slate-400 italic py-1">No watch swaps recorded yet</p>`
        : swaps.map(s => `
            <div class="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
              <div class="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <i class="fas fa-sync-alt text-amber-500 text-xs"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-slate-700 leading-snug">${s.reason || '—'}</p>
                <p class="text-xs text-slate-400 mt-0.5">${s.date || ''}</p>
              </div>
            </div>`).join('');

      const swapCard = isPaused || isTrialCompleted
        ? `<div class="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden opacity-60">
            <div class="px-4 py-3 flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                <i class="fas fa-sync-alt text-slate-400 text-sm"></i>
              </div>
              <div>
                <p class="text-sm font-semibold text-slate-500">Watch Swap</p>
                <p class="text-xs text-slate-400">${isTrialCompleted ? 'Trial completed' : 'Locked — study is paused'}</p>
              </div>
            </div>
          </div>`
        : `<div class="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
            <div class="px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <i class="fas fa-sync-alt text-amber-600 text-sm"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-amber-900">Watch Swap</p>
                <p class="text-xs text-amber-600">Log an ActiGraph watch replacement</p>
              </div>
              <button onclick="showSwapWatchModal('${patientId}')"
                class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm whitespace-nowrap">
                <i class="fas fa-plus mr-1"></i>Log Swap
              </button>
            </div>
            <div class="px-4 py-3 max-h-44 overflow-y-auto" id="timeline-swap-history">
              ${swapHistoryHtml}
            </div>
          </div>`;
          console.log("isExperimental", isExperimental);
          console.log("is28DaysComplete", is28DaysComplete);
          console.log("!isTrialCompleted", !isTrialCompleted);

      // Trial Done card removed — now a dedicated tab (appears on day 29+)
      const trialDoneCard = '';

      const discontinueCard = isTrialCompleted
        ? `<div class="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden opacity-60">
            <div class="px-4 py-3 flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                <i class="fas fa-user-slash text-slate-400 text-sm"></i>
              </div>
              <div>
                <p class="text-sm font-semibold text-slate-500">Discontinue Patient</p>
                <p class="text-xs text-slate-400">Trial completed</p>
              </div>
            </div>
          </div>`
        : `<div class="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
            <div class="px-4 py-3 bg-gradient-to-r from-red-50 to-rose-50 border-b border-red-100 flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <i class="fas fa-user-slash text-red-500 text-sm"></i>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-red-900">Discontinue Patient</p>
                <p class="text-xs text-red-500">Permanently ends participation</p>
              </div>
            </div>
            <div class="px-4 py-3">
              <p class="text-xs text-slate-500 mb-3">This action is irreversible. The patient record becomes read-only.</p>
              <div class="relative" id="disc-zone-${patientId}">
                <button onclick="toggleDiscontinueMenu('${patientId}')"
                  class="w-full px-3 py-2 border border-red-200 text-red-400 hover:text-red-600 hover:border-red-400 hover:bg-red-50 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5">
                  <i class="fas fa-unlock-alt text-xs"></i>Reveal Discontinue Option
                </button>
                <div id="discontinue-menu-${patientId}" class="hidden mt-2">
                  <button onclick="showDiscontinueModal('${patientId}')"
                    class="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl text-sm font-bold transition-colors shadow-sm flex items-center justify-center gap-2">
                    <i class="fas fa-user-slash"></i>Confirm Discontinue
                  </button>
                </div>
              </div>
            </div>
          </div>`;

      const timelineContent = document.getElementById('timeline-content');
      if (!timelineContent) return;

      // Remove ALL existing quick actions to prevent duplicates
      const existingActions = timelineContent.querySelectorAll('#timeline-quick-actions');
      existingActions.forEach(el => el.remove());

      const actionsDiv = document.createElement('div');
      actionsDiv.id = 'timeline-quick-actions';
      actionsDiv.innerHTML = `
        <div class="my-6 flex items-center gap-3">
          <div class="h-px flex-1 bg-gradient-to-r from-transparent to-slate-200"></div>
          <span class="text-xs font-bold text-slate-400 uppercase tracking-widest">Patient Actions</span>
          <div class="h-px flex-1 bg-gradient-to-l from-transparent to-slate-200"></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          ${swapCard}
          ${discontinueCard}
        </div>`;

      timelineContent.appendChild(actionsDiv);
    }

    // Update a single task in the track record and save back to server
    async function updateTrackRecordTask(patientId, dayKey, taskIndex, checked) {
      try {
        const res = await fetch(`/trackrecord/${patientId}`);
        const data = await res.json();
        const trackRecord = data.trackRecord || {};
        const tasks = trackRecord[dayKey];
        if (!tasks || !tasks[taskIndex]) return;
        const taskName = Object.keys(tasks[taskIndex])[0];
        tasks[taskIndex][taskName] = checked;
        await fetch('/update-trackrecord', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ homerID: patientId, trackRecord })
        });
      } catch (e) {
        console.error('Failed to update track record:', e);
      }
    }


    function showTimelineEventModal(eventId, hospitalId, studyDay, currentStatus) {
      // Remove any existing modal first
      const existing = document.getElementById('timeline-event-modal');
      if (existing) existing.remove();

      const sel = currentStatus || 'pending';
      const opt = (val, label) =>
        `<option value="${val}"${sel === val ? ' selected' : ''}>${label}</option>`;

      const modalHtml = `
        <div id="timeline-event-modal" class="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-slate-800">Update Event Status</h3>
              <button onclick="document.getElementById('timeline-event-modal').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
            </div>
            <form id="timeline-event-form" class="space-y-4">
              <input type="hidden" id="te-event-id" value="${eventId}">
              <input type="hidden" id="te-hospital-id" value="${hospitalId}">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select id="te-status" required class="w-full px-3 py-2 border border-slate-200 rounded-lg">
                  ${opt('pending','Pending')}
                  ${opt('completed','Completed')}
                  ${opt('skipped','Skipped')}
                  ${opt('cancelled','Cancelled')}
                  ${sel === 'paused' ? opt('paused','Paused') : ''}
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea id="te-notes" rows="3" class="w-full px-3 py-2 border border-slate-200 rounded-lg" placeholder="Add notes..."></textarea>
              </div>
              <div class="flex gap-3 pt-2">
                <button type="button" onclick="document.getElementById('timeline-event-modal').remove()" class="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      // Attach submit listener NOW that the form is in the DOM
      _attachTimelineFormListener();
    }

    // timeline-event-form — listener attached directly to the form, not document
    function _attachTimelineFormListener() {
      const form = document.getElementById('timeline-event-form');
      if (!form) return;
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        const eventId = document.getElementById('te-event-id').value;
        const hospitalId = document.getElementById('te-hospital-id').value;
        const status = document.getElementById('te-status').value;
        const notes = document.getElementById('te-notes').value;
        fetch('/patient_events/update_event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId: hospitalId, id: eventId, status, notes })
        }).then(r => r.json()).then(data => {
          if (data.status === 'success') {
            document.getElementById('timeline-event-modal').remove();
            fetchPatientTimeline(hospitalId);
            if (typeof logActivity === 'function') {
              logActivity('UPDATED_TIMELINE_EVENT', { 
                patient_id: hospitalId,
                event_id: eventId,
                new_status: status,
                notes: notes
              });
            }
          } else {
            alert('Error updating event: ' + (data.message || 'Unknown error'));
          }
        }).catch(err => { console.error('Error updating event:', err); alert('Failed to update event'); });
      }, { once: true });
    }

    async function completeTimelineEvent(eventId, hospitalId) {
      try {
        const response = await fetch('/patient_events/update_event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: hospitalId,
            id: eventId,
            status: 'completed'
          })
        });
        const data = await response.json();
        if (data.status === 'success') {
          fetchPatientTimeline(hospitalId);
          if (typeof logActivity === 'function') {
            logActivity('COMPLETED_TIMELINE_EVENT', { 
              patient_id: hospitalId,
              event_id: eventId
            });
          }
        }
      } catch (error) {
        console.error('Error completing event:', error);
      }
    }

    function showTimelineNoteModal(eventId, hospitalId) {
      const note = prompt('Enter note for this event:');
      if (note !== null) {
        fetch('/patient_events/update_event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: hospitalId,
            id: eventId,
            status: 'pending',
            notes: note
          })
        }).then(r => r.json()).then(data => {
          if (data.status === 'success') {
            fetchPatientTimeline(hospitalId);
            if (typeof logActivity === 'function') {
              logActivity('ADDED_TIMELINE_NOTE', { 
                patient_id: hospitalId,
                event_id: eventId,
                note: note
              });
            }
          }
        });
      }
    }

    // Adverse Events Tab
    function loadAdverseTab(content) {
      const patient = selectedPatientData;
      const isReadOnly = patient.studyPaused === true || droppedOutPatients.has(patient.HospitalID) || patient.discontinued === true || trialCompletedPatients.has(patient.HospitalID);
      const readOnlyReason = patient.studyPaused === true ? 'Study paused' : trialCompletedPatients.has(patient.HospitalID) ? 'Trial completed' : 'Patient discontinued';

      const reportBtn = isReadOnly
        ? ''
        : `<button onclick="showAddAdverseEventModal()" class="px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"><i class="fas fa-plus mr-1"></i>Report AE</button>`;

      const roBanner = isReadOnly ? `
        <div class="bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <i class="fas fa-lock text-slate-400"></i>
          <p class="text-sm text-slate-600 font-medium">${readOnlyReason} — adverse events are read-only.</p>
        </div>` : '';

      content.innerHTML = `
        <div class="bg-slate-50 rounded-xl p-5">
          ${roBanner}
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-slate-800"><i class="fas fa-exclamation-triangle mr-2"></i>Adverse Events</h3>
            ${reportBtn}
          </div>
          <div id="adverse-loading" class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-blue-600"></i><p class="text-slate-500 mt-2">Loading adverse events...</p></div>
          <div id="adverse-content" class="hidden"></div>
        </div>`;
      
      fetchPatientAdverseEvents(patient.HospitalID);
    }

    async function fetchPatientAdverseEvents(hospitalId) {
      try {
        const response = await fetch(`/patient_events/adverse_events/${hospitalId}`);
        const data = await response.json();
        
        const loadingDiv = document.getElementById('adverse-loading');
        const contentDiv = document.getElementById('adverse-content');
        
        loadingDiv.classList.add('hidden');
        contentDiv.classList.remove('hidden');
        
        const events = data.events || [];
        
        if (events.length === 0) {
          contentDiv.innerHTML = `
            <div class="text-center py-8">
              <i class="fas fa-check-circle text-4xl text-green-300 mb-3"></i>
              <p class="text-slate-500">No adverse events reported</p>
            </div>`;
          return;
        }
        
        const isPaused = selectedPatientData?.studyPaused === true;
        let html = '';
        if (isPaused) {
          html += `
            <div class="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 mb-4 flex items-center justify-between gap-4">
              <div>
                <p class="font-semibold text-amber-800 flex items-center gap-2"><i class="fas fa-pause-circle text-amber-500 text-lg"></i>Study Paused</p>
                <p class="text-sm text-amber-600 mt-0.5">This patient's study is currently paused due to an adverse event. All editing is locked.</p>
              </div>
              <button onclick="resumePatientStudy('${hospitalId}')" class="px-4 py-2 bg-green-600 text-white text-sm rounded-xl hover:bg-green-700 font-medium whitespace-nowrap shrink-0">
                <i class="fas fa-play mr-1.5"></i>Resume Study
              </button>
            </div>`;
        }
        html += '<div class="space-y-3">';
        events.forEach(event => {
          const severityColors = { 'mild': 'bg-yellow-100 text-yellow-800', 'moderate': 'bg-orange-100 text-orange-800', 'severe': 'bg-red-100 text-red-800' };

          // Format occurred date nicely
          const occurredDate = event.eventDate
            ? new Date(event.eventDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';

          // Resolved date: only meaningful when the event caused a pause.
          // Use resumedAt from selectedPatientData for the currently-paused event,
          // or from the event's own resolvedAt if stored.
          let resolvedHtml = '';
          if (event.requiresPause) {
            const resolvedRaw = event.resolvedAt || null;
            const patientResumedRaw = selectedPatientData?.resumedAt || null;
            // Show resolved if: event has its own resolvedAt, OR study is already resumed
            const resolvedDateRaw = resolvedRaw || (!selectedPatientData?.studyPaused ? patientResumedRaw : null);
            if (resolvedDateRaw) {
              const resolvedDate = new Date(resolvedDateRaw).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
              const resolutionNotes = event.resolvedActionNotes ? `<div class="text-xs text-green-700 mt-1"><strong>Action taken:</strong> ${event.resolvedActionNotes}</div>` : '<div class="text-xs text-amber-700 mt-1 italic">Action taken not recorded</div>';
              resolvedHtml = `<div class="flex flex-col gap-0.5 text-xs text-green-700 bg-green-50 rounded-lg px-2.5 py-1.5 mt-2">
                <div class="flex items-center gap-1.5"><i class="fas fa-check-circle"></i><span><strong>Resolved:</strong> ${resolvedDate}</span></div>
                ${resolutionNotes}
              </div>`;
            } else {
              resolvedHtml = `<div class="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-2">
                <i class="fas fa-pause-circle"></i>
                <span>Study paused — not yet resolved</span>
              </div>`;
            }
          }

          // Build attachment badge if file was uploaded
          let attachmentBadge = '';
          if (event.attachment) {
            // attachment may be an S3 key path — extract filename
            const fname = event.attachment.split('/').pop().split('\\').pop();
            attachmentBadge = `<div class="mt-2 flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
              <i class="fas fa-paperclip"></i>
              <span class="font-medium truncate max-w-xs">${fname}</span>
            </div>`;
          }

          html += `
            <div class="bg-white rounded-xl p-4 border border-slate-200">
              <div class="flex items-start justify-between mb-2 gap-2">
                <span class="font-semibold text-slate-800">Adverse Event</span>
                <span class="px-2.5 py-1 text-xs font-medium rounded-full shrink-0 ${severityColors[event.severity] || 'bg-slate-100 text-slate-600'}">${event.severity}</span>
              </div>
              <div class="flex items-center gap-4 text-xs text-slate-500 mb-2">
                <span class="flex items-center gap-1"><i class="fas fa-calendar-day text-slate-400"></i><strong>Occurred:</strong> ${occurredDate}</span>
                <span class="flex items-center gap-1"><i class="fas fa-tag text-slate-400"></i>Day ${event.studyDay ?? '—'}</span>
              </div>
              <div class="text-sm text-slate-700 mb-2">${event.description}</div>
              ${event.requiresPause
                ? ''
                : `<div class="text-sm text-slate-500 mb-1"><strong>Action taken:</strong> ${(event.actionTaken && event.actionTaken.trim()) ? event.actionTaken : '<span class="italic text-slate-400">Not recorded</span>'}</div>`
              }
              ${attachmentBadge}
              ${resolvedHtml}
            </div>`;
        });
        html += '</div>';
        
        contentDiv.innerHTML = html;
        
      } catch (error) {
        console.error('Error fetching adverse events:', error);
        const loadingDiv = document.getElementById('adverse-loading');
        const contentDiv = document.getElementById('adverse-content');
        loadingDiv.classList.add('hidden');
        contentDiv.classList.remove('hidden');
        contentDiv.innerHTML = `<div class="text-center py-8 text-red-500">Error loading adverse events</div>`;
      }
    }

    // ── Study day helper (shared by AE modal open and date-change handler) ──────
    // Experimental: day 0 is anchor → studyDay = today - day0.scheduledDate
    // Control: day 1 is anchor (no day 0) → studyDay = today - day1.scheduledDate + 1
    // Falls back to activationDate from selectedPatientData if timeline unavailable.
    async function _fetchCurrentStudyDay(forDateStr) {
      const patient = selectedPatientData;
      if (!patient) return 0;
      const isControl = (patient.role || '').toLowerCase() === 'control';

      // Primary: derive from timeline events
      try {
        const res = await fetch(`/patient_events/get_timeline/${patient.HospitalID}`);
        const data = await res.json();
        const events = (data.events || []).sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
        if (events.length > 0) {
          let anchorDate, anchorOffset;
          if (isControl) {
            // Control has no day 0 — day 1 is the first event (studyDay=1)
            const day1 = events.find(e => e.studyDay === 1) || events[0];
            anchorDate = new Date(day1.scheduledDate); anchorDate.setHours(0, 0, 0, 0);
            anchorOffset = day1.studyDay; // 1 for control
          } else {
            // Experimental — day 0 is anchor
            const day0 = events.find(e => e.studyDay === 0) || events[0];
            anchorDate = new Date(day0.scheduledDate); anchorDate.setHours(0, 0, 0, 0);
            anchorOffset = 0;
          }
          const target = forDateStr ? new Date(forDateStr) : new Date();
          target.setHours(0, 0, 0, 0);
          return Math.max(anchorOffset, Math.round((target - anchorDate) / 86400000) + anchorOffset);
        }
      } catch(e) { /* fall through to activationDate */ }

      // Fallback: use activationDate from selectedPatientData
      const actDateRaw = patient.activationDate || null;
      if (!actDateRaw) return 0;
      try {
        const actDate = new Date(actDateRaw); actDate.setHours(0, 0, 0, 0);
        const target = forDateStr ? new Date(forDateStr) : new Date();
        target.setHours(0, 0, 0, 0);
        const dayDiff = Math.max(0, Math.round((target - actDate) / 86400000));
        return isControl ? dayDiff + 1 : dayDiff;
      } catch(e) { return 0; }
    }
    // ─────────────────────────────────────────────────────────────────────────

    function showAddAdverseEventModal() {
      const patient = selectedPatientData;

      const modalHtml = `
        <div id="adverse-event-modal" class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-slate-800">Report Adverse Event</h3>
              <button onclick="document.getElementById('adverse-event-modal').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
            </div>
            <form id="adverse-event-form" class="space-y-4">
              <input type="hidden" id="ae-patient-id" value="${patient.HospitalID}">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Event Date</label>
                  <input type="date" id="ae-event-date" required class="w-full px-3 py-2 border border-slate-200 rounded-lg" onchange="updateAeStudyDay()">
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Study Day</label>
                  <input type="number" id="ae-study-day" value="…" min="0" class="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50" readonly>
                </div>
              </div>
              <input type="hidden" id="ae-event-type" value="Adverse Event">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Severity</label>
                <select id="ae-severity" required class="w-full px-3 py-2 border border-slate-200 rounded-lg">
                  <option value="mild">Mild</option>
                  <option value="moderate">Moderate</option>
                  <option value="severe">Severe</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea id="ae-description" required rows="2" class="w-full px-3 py-2 border border-slate-200 rounded-lg"></textarea>
              </div>
              <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p class="text-sm font-semibold text-amber-800 mb-1"><i class="fas fa-pause-circle mr-1.5 text-amber-600"></i>Pause Patient Study?</p>
                <p class="text-xs text-amber-600 mb-3">If yes, all editing will be locked until you resume the study. Action taken will be documented at resume.</p>
                <div class="flex gap-6">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="ae-pause" id="ae-pause-yes" value="yes" class="w-4 h-4 accent-amber-600" onchange="toggleAeActionTaken()">
                    <span class="text-sm font-medium text-amber-800">Yes — Pause Study</span>
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="ae-pause" id="ae-pause-no" value="no" checked class="w-4 h-4 accent-slate-500" onchange="toggleAeActionTaken()">
                    <span class="text-sm font-medium text-slate-600">No — Continue</span>
                  </label>
                </div>
              </div>
              <div id="ae-action-taken-wrap">
                <label class="block text-sm font-medium text-slate-700 mb-1">Action Taken</label>
                <textarea id="ae-action-taken" rows="2" class="w-full px-3 py-2 border border-slate-200 rounded-lg"></textarea>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Attachment (Optional)</label>
                <div class="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-blue-400 transition-colors cursor-pointer" onclick="document.getElementById('ae-attachment').click()">
                  <input type="file" id="ae-attachment" class="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx">
                  <i class="fas fa-cloud-upload-alt text-3xl text-slate-300 mb-2"></i>
                  <p class="text-sm text-slate-500" id="ae-attachment-name">Click to upload file (PDF, images, docs)</p>
                </div>
              </div>
              <div class="flex gap-3 pt-2">
                <button type="button" onclick="document.getElementById('adverse-event-modal').remove()" class="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Save</button>
              </div>
            </form>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      const dateEl = document.getElementById('ae-event-date');
      dateEl.valueAsDate = new Date();
      // Async-fill study day after modal is shown (fetches timeline for accuracy)
      _fetchCurrentStudyDay(null).then(day => {
        const dayEl = document.getElementById('ae-study-day');
        if (dayEl) dayEl.value = day;
      });
    }

    // Show/hide Action Taken box based on pause selection
    function toggleAeActionTaken() {
      const pauseYes = document.getElementById('ae-pause-yes')?.checked;
      const wrap = document.getElementById('ae-action-taken-wrap');
      if (!wrap) return;
      if (pauseYes) {
        wrap.style.display = 'none';
        const ta = document.getElementById('ae-action-taken');
        if (ta) ta.value = ''; // clear so empty string is saved, not stale text
      } else {
        wrap.style.display = '';
      }
    }

    // Recompute study day whenever event date changes in the AE modal
    async function updateAeStudyDay() {
      const dateEl = document.getElementById('ae-event-date');
      const dayEl  = document.getElementById('ae-study-day');
      if (!dateEl || !dayEl) return;
      dayEl.value = '…';
      const day = await _fetchCurrentStudyDay(dateEl.value);
      if (dayEl) dayEl.value = day;
    }

    // adverse-event-form — guard against double-submission
    // Remove any previously attached listener before re-adding (prevents accumulation on tab re-open)
    if (window._aeSubmitHandler) document.removeEventListener('submit', window._aeSubmitHandler);
    
    // File upload handler
    const aeAttachmentInput = document.getElementById('ae-attachment');
    if (aeAttachmentInput) {
      aeAttachmentInput.addEventListener('change', function() {
        const fileNameEl = document.getElementById('ae-attachment-name');
        if (this.files && this.files[0]) {
          fileNameEl.textContent = this.files[0].name;
          fileNameEl.classList.add('text-blue-600', 'font-medium');
        } else {
          fileNameEl.textContent = 'Click to upload file (PDF, images, docs)';
          fileNameEl.classList.remove('text-blue-600', 'font-medium');
        }
      });
    }
    
    window._aeSubmitHandler = async function(e) {
      if (e.target.id === 'adverse-event-form') {
        e.preventDefault();
        if (e.target.dataset.submitting) return;
        e.target.dataset.submitting = '1';
        const btn = e.target.querySelector('[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        const patientId = document.getElementById('ae-patient-id').value;
        const requiresPause = document.getElementById('ae-pause-yes')?.checked === true;

        const formData = new FormData();
        formData.append('patientId', patientId);
        formData.append('eventDate', document.getElementById('ae-event-date').value);
        formData.append('studyDay', parseInt(document.getElementById('ae-study-day').value) || 0);
        formData.append('eventType', document.getElementById('ae-event-type').value);
        formData.append('severity', document.getElementById('ae-severity').value);
        formData.append('description', document.getElementById('ae-description').value);
        formData.append('actionTaken', document.getElementById('ae-action-taken').value);
        formData.append('reportedToPi', false);
        formData.append('requiresPause', requiresPause);
        
        // Add optional attachment
        const attachmentFile = document.getElementById('ae-attachment')?.files[0];
        if (attachmentFile) {
          formData.append('attachment', attachmentFile);
        }

        try {
          const res = await fetch('/patient_events/adverse_events', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.status === 'success') {
            if (requiresPause) {
              await fetch(`/patient_events/pause_study/${patientId}`, { method: 'POST' });
              const pausedAt = new Date().toISOString();
              if (selectedPatientData && selectedPatientData.HospitalID === patientId) {
                selectedPatientData.studyPaused = true;
                selectedPatientData.pausedAt = pausedAt;
              }
              const pt = allPatients.find(p => p.HospitalID === patientId);
              if (pt) { pt.studyPaused = true; pt.pausedAt = pausedAt; }
              showToast('Adverse event saved — study paused', 'warning');
            } else {
              showToast('Adverse event saved');
            }
            document.getElementById('adverse-event-modal').remove();
            fetchPatientAdverseEvents(patientId);
            if (typeof logActivity === 'function') {
              logActivity('RECORDED_ADVERSE_EVENT', { 
                patient_id: patientId,
                event_type: document.getElementById('ae-event-type').value,
                severity: document.getElementById('ae-severity').value,
                study_paused: requiresPause
              });
            }
            // Refresh dropped-out and trial-completed sets and stat counters
            loadDroppedOutPatients().then(() => {
              updateFilterCounts();
              const statDropped = document.getElementById('stat-dropped');
              if (statDropped) statDropped.textContent = droppedOutPatients.size;
              const statCompleted = document.getElementById('stat-completed');
              if (statCompleted) statCompleted.textContent = trialCompletedPatients.size;
              renderPatients();
            });
          } else {
            showToast(data.message || 'Failed to save', 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
          }
        } catch (err) {
          showToast('Network error', 'error');
          if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
        }
      }
    };
    document.addEventListener('submit', window._aeSubmitHandler);

    // Issues Tab
    function loadIssuesTab(content) {
      const patient = selectedPatientData;
      const isPaused = selectedPatientData?.studyPaused === true;
      const isReadOnly = isPaused || droppedOutPatients.has(patient.HospitalID) || patient.discontinued === true || trialCompletedPatients.has(patient.HospitalID);
      const readOnlyReason = isPaused ? 'Study paused' : trialCompletedPatients.has(patient.HospitalID) ? 'Trial completed' : 'Patient discontinued';

      const role = (patient.role || '').toLowerCase();
      const isExperimental = role === 'experimental';

      const roIssuesBanner = isReadOnly ? `
        <div class="px-5 pt-4 pb-0">
          <div class="bg-${isPaused ? 'amber' : 'slate'}-100 border border-${isPaused ? 'amber' : 'slate'}-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
            <i class="fas fa-${isPaused ? 'pause-circle text-amber-500' : 'lock text-slate-400'}"></i>
            <p class="text-sm text-${isPaused ? 'amber-700' : 'slate-600'} font-medium">${readOnlyReason} — call logs are read-only.</p>
          </div>
        </div>` : '';

      const logCallBtn = isReadOnly ? '' : `
            <button onclick="showAddIssueModal()" class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium flex items-center gap-1.5">
              <i class="fas fa-plus text-xs"></i>Log Call
            </button>`;
      
      content.innerHTML = `
        <div class="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <i class="fas fa-phone text-blue-600 text-sm"></i>
              </div>
              <h3 class="font-semibold text-slate-800">Call Logs & Follow-up</h3>
            </div>
            ${logCallBtn}
          </div>
          ${roIssuesBanner}
          <div class="p-5">
            <div id="issues-loading" class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-blue-600"></i><p class="text-slate-500 mt-2">Loading...</p></div>
            <div id="issues-content" class="hidden"></div>
          </div>
        </div>`;
      
      fetchPatientIssues(patient.HospitalID, isExperimental);
    }

    async function fetchPatientIssues(hospitalId, isExperimental) {
      try {
        const response = await fetch(`/patient_events/issue_logs/${hospitalId}`);
        const data = await response.json();
        
        const loadingDiv = document.getElementById('issues-loading');
        const contentDiv = document.getElementById('issues-content');
        
        loadingDiv.classList.add('hidden');
        contentDiv.classList.remove('hidden');
        
        let issues = data.issues || [];
        
        // For control patients, only show clinical issues
        if (!isExperimental) {
          // Show all contact types for control patients (including From Patient and Clinical Follow-up)
        }
        
        if (issues.length === 0) {
          contentDiv.innerHTML = `
            <div class="text-center py-8">
              <i class="fas fa-check-circle text-4xl text-green-300 mb-3"></i>
              <p class="text-slate-500">No issues logged</p>
              ${!isExperimental ? '<p class="text-sm text-slate-400">Only clinical follow-ups shown for Control patients</p>' : ''}
            </div>`;
          return;
        }
        
        let html = '<div class="space-y-3">';
        issues.forEach(issue => {
          const typeColors = {
            'Clinical Follow-up': 'bg-blue-100 text-blue-800',
            'From Patient': 'bg-green-100 text-green-800',
            'Device Issue': 'bg-red-100 text-red-800',
            'Technical Issue': 'bg-orange-100 text-orange-800'
          };
          const badgeColor = typeColors[issue.contactType] || 'bg-slate-100 text-slate-600';
          html += `
            <div class="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div class="flex items-start justify-between gap-3 mb-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2.5 py-1 text-xs font-medium rounded-full ${badgeColor}">${issue.contactType}</span>
                  ${issue.issueType ? `<span class="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">${issue.issueType}</span>` : ''}
                  ${issue.affectedDevices ? `<span class="text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full"><i class="fas fa-laptop mr-1"></i>${issue.affectedDevices}</span>` : ''}
                  ${issue.pdfAttached ? '<span class="text-xs text-purple-600 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full"><i class="fas fa-paperclip mr-1"></i>PDF</span>' : ''}
                </div>
                <div class="text-right shrink-0">
                  <span class="text-sm font-medium text-slate-700">${issue.contactDate || ''}</span>
                  ${issue.durationMinutes ? `<p class="text-xs text-slate-400">${issue.durationMinutes} min</p>` : ''}
                </div>
              </div>
              ${issue.issueDescription ? `<p class="text-sm text-slate-700 mb-1">${issue.issueDescription}</p>` : ''}
              ${issue.solutionProvided ? `<p class="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-1.5 mt-2"><i class="fas fa-check-circle mr-1.5"></i>${issue.solutionProvided}</p>` : ''}
              ${issue.followUpRequired ? `<p class="text-sm text-amber-700 mt-2"><i class="fas fa-clock mr-1"></i>Follow-up: ${issue.followUpDate || 'TBD'}</p>` : ''}
            </div>`;
        });
        html += '</div>';
        
        contentDiv.innerHTML = html;
        
      } catch (error) {
        console.error('Error fetching issues:', error);
        const loadingDiv = document.getElementById('issues-loading');
        const contentDiv = document.getElementById('issues-content');
        loadingDiv.classList.add('hidden');
        contentDiv.classList.remove('hidden');
        contentDiv.innerHTML = `<div class="text-center py-8 text-red-500">Error loading issues</div>`;
      }
    }

    function showAddIssueModal() {
      const patient = selectedPatientData;
      const role = (patient.role || '').toLowerCase();
      const isExperimental = role === 'experimental';
      const modalHtml = `
        <div id="issue-modal" class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between mb-5">
              <div class="flex items-center gap-2">
                <div class="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                  <i class="fas fa-phone text-blue-600"></i>
                </div>
                <h3 class="text-lg font-bold text-slate-800">Log Call / Follow-up</h3>
              </div>
              <button onclick="document.getElementById('issue-modal').remove()" class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><i class="fas fa-times"></i></button>
            </div>
            <form id="issue-form" class="space-y-4">
              <input type="hidden" id="issue-patient-id" value="${patient.HospitalID}">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Contact Date</label>
                  <input type="date" id="issue-contact-date" required class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Duration (min)</label>
                  <input type="number" id="issue-duration" min="1" placeholder="e.g. 15" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                </div>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Contact Type</label>
                <select id="issue-contact-type" required class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" onchange="updateIssueTypes()">
                  <option value="">Select type…</option>
                  <option value="Clinical Follow-up">Clinical Follow-up</option>
                  <option value="From Patient">From Patient</option>
                  ${isExperimental ? '<option value="Device Issue">Device Issue</option><option value="Technical Issue">Technical Issue</option>' : ''}
                </select>
              </div>
              <div id="issue-type-container" class="hidden">
                <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Issue Category</label>
                <select id="issue-type" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm" onchange="updateTechnicalDevices()">
                  <option value="Clinical">Clinical</option>
                  ${isExperimental ? '<option value="Device">Device</option><option value="Technical">Technical</option>' : ''}
                </select>
              </div>
              <div id="technical-devices-container" class="hidden">
                <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Affected Devices</label>
                <div class="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="tech-device-pluto" value="Pluto" class="w-4 h-4 accent-blue-600 rounded"><span class="text-sm text-slate-700">Pluto</span></label>
                  <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="tech-device-mars" value="Mars" class="w-4 h-4 accent-blue-600 rounded"><span class="text-sm text-slate-700">Mars</span></label>
                  <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="tech-device-laptop" value="Laptop" class="w-4 h-4 accent-blue-600 rounded"><span class="text-sm text-slate-700">Laptop</span></label>
                  <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="tech-device-modem" value="Modem" class="w-4 h-4 accent-blue-600 rounded"><span class="text-sm text-slate-700">Modem</span></label>
                </div>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Notes / Description</label>
                <textarea id="issue-description" rows="3" placeholder="Summary of the call…" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"></textarea>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Action / Solution</label>
                <textarea id="issue-solution" rows="2" placeholder="What was done or advised…" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"></textarea>
              </div>
              <div class="bg-slate-50 rounded-xl p-3">
                <label class="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide"><i class="fas fa-paperclip mr-1"></i>Attach PDF (optional)</label>
                <input type="file" id="issue-pdf" accept=".pdf" class="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-100 file:text-blue-700 file:text-xs file:font-medium file:cursor-pointer hover:file:bg-blue-200">
              </div>
              <label class="flex items-center gap-3 cursor-pointer py-1">
                <input type="checkbox" id="issue-followup-required" class="w-4 h-4 accent-blue-600 rounded" onchange="document.getElementById('issue-followup-date').classList.toggle('hidden', !this.checked)">
                <span class="text-sm text-slate-600">Follow-up Required</span>
              </label>
              <div id="issue-followup-date" class="hidden">
                <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Follow-up Date</label>
                <input type="date" id="issue-followup-date-input" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm">
              </div>
              <div class="flex gap-3 pt-1">
                <button type="button" onclick="document.getElementById('issue-modal').remove()" class="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-medium">Cancel</button>
                <button type="submit" id="issue-save-btn" class="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium">Save Log</button>
              </div>
            </form>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      document.getElementById('issue-contact-date').valueAsDate = new Date();
    }

    function updateIssueTypes() {
      const contactType = document.getElementById('issue-contact-type').value;
      const typeContainer = document.getElementById('issue-type-container');
      const techContainer = document.getElementById('technical-devices-container');
      if (contactType === 'Device Issue' || contactType === 'Technical Issue') {
        typeContainer.classList.remove('hidden');
        // Pre-select "Technical" for Technical Issue
        const issueTypeEl = document.getElementById('issue-type');
        if (issueTypeEl && contactType === 'Technical Issue') issueTypeEl.value = 'Technical';
        updateTechnicalDevices();
      } else {
        typeContainer.classList.add('hidden');
        if (techContainer) techContainer.classList.add('hidden');
      }
    }

    function updateTechnicalDevices() {
      const issueType = document.getElementById('issue-type')?.value;
      const techContainer = document.getElementById('technical-devices-container');
      if (!techContainer) return;
      if (issueType === 'Technical' || issueType === 'Device') {
        techContainer.classList.remove('hidden');
      } else {
        techContainer.classList.add('hidden');
      }
    }

    // issue-form — guard against double-submission
    // Remove any previously attached listener before re-adding (prevents accumulation on tab re-open)
    if (window._issueSubmitHandler) document.removeEventListener('submit', window._issueSubmitHandler);
    window._issueSubmitHandler = async function(e) {
      if (e.target.id === 'issue-form') {
        e.preventDefault();
        if (e.target.dataset.submitting) return;
        e.target.dataset.submitting = '1';
        const btn = document.getElementById('issue-save-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        const patientId = document.getElementById('issue-patient-id').value;
        const formData = new FormData();
        formData.append('patientId', patientId);
        formData.append('contactDate', document.getElementById('issue-contact-date').value);
        formData.append('contactType', document.getElementById('issue-contact-type').value);
        formData.append('durationMinutes', parseInt(document.getElementById('issue-duration').value) || 0);
        formData.append('issueType', document.getElementById('issue-type')?.value || '');
        // Collect checked technical devices
        const checkedDevices = ['tech-device-pluto','tech-device-mars','tech-device-laptop','tech-device-modem']
          .filter(id => document.getElementById(id)?.checked)
          .map(id => document.getElementById(id).value);
        if (checkedDevices.length > 0) formData.append('affectedDevices', checkedDevices.join(', '));
        formData.append('issueDescription', document.getElementById('issue-description').value);
        formData.append('solutionProvided', document.getElementById('issue-solution').value);
        formData.append('followUpRequired', document.getElementById('issue-followup-required').checked);
        formData.append('followUpDate', document.getElementById('issue-followup-date-input')?.value || '');
        const pdf = document.getElementById('issue-pdf')?.files[0];
        if (pdf) formData.append('pdfFile', pdf);
        try {
          const res = await fetch('/patient_events/issue_logs', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.status === 'success') {
            document.getElementById('issue-modal').remove();
            const role = (selectedPatientData.role || '').toLowerCase();
            await fetchPatientIssues(patientId, role === 'experimental');
            showToast('Call log saved');
          } else {
            showToast(data.message || 'Failed to save', 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Save Log'; }
          }
        } catch (err) {
          showToast('Network error', 'error');
          if (btn) { btn.disabled = false; btn.textContent = 'Save Log'; }
        }
      }
    };
    document.addEventListener('submit', window._issueSubmitHandler);

    let currentExerciseType = 'adl';
    let selectedAdlExercises = [];
    let selectedVcgExercises = [];
    let allVcgExercisesCache = [];  // Cache for all available VCG exercises
    let allAdlExercisesCache = [];  // Cache for all available ADL exercises
    let currentAdlExercise = null;
    let currentVcgExercise = null;
    let adlCategories = [];
    let vcgCategories = [];


    function resumePatientStudy(patientId) {
      const today = new Date().toISOString().split('T')[0];
      const modalHtml = `
        <div id="resume-study-modal" class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div class="flex items-center gap-3 mb-5">
              <div class="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                <i class="fas fa-play text-green-600"></i>
              </div>
              <div>
                <h3 class="text-lg font-bold text-slate-800">Resume Study</h3>
                <p class="text-sm text-slate-500">Document the resolution before resuming</p>
              </div>
              <button onclick="document.getElementById('resume-study-modal').remove()" class="ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Resume Date <span class="text-red-500">*</span></label>
                <input type="date" id="resume-date" value="${today}" 
                  class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Action Taken / Resolution <span class="text-red-500">*</span></label>
                <textarea id="resume-action-notes" rows="4" placeholder="e.g. Adverse event resolved. Patient cleared by physician to continue study…"
                  class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"></textarea>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide"><i class="fas fa-file-medical mr-1"></i>Doctor Prescription (optional)</label>
                <div class="border-2 border-dashed border-green-200 rounded-xl p-3 text-center hover:border-green-400 transition-colors cursor-pointer" onclick="document.getElementById('resume-prescription-file').click()">
                  <input type="file" id="resume-prescription-file" class="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx">
                  <i class="fas fa-cloud-upload-alt text-xl text-green-300 mb-1"></i>
                  <p class="text-xs text-slate-500" id="resume-prescription-name">Upload doctor's clearance / prescription</p>
                </div>
              </div>
              <div class="bg-green-50 border border-green-200 rounded-xl p-3">
                <p class="text-xs text-green-700"><i class="fas fa-info-circle mr-1.5"></i>Resuming will unlock all tabs and allow data entry to continue.</p>
              </div>
              <div class="flex gap-3 pt-1">
                <button onclick="document.getElementById('resume-study-modal').remove()" class="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-medium">Cancel</button>
                <button onclick="confirmResumeStudy('${patientId}')" id="resume-confirm-btn" class="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium">
                  <i class="fas fa-play mr-1.5"></i>Resume Study
                </button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      setTimeout(() => document.getElementById('resume-action-notes')?.focus(), 100);
    }

    async function confirmResumeStudy(patientId) {
      const notes = document.getElementById('resume-action-notes')?.value.trim();
      const resumeDate = document.getElementById('resume-date')?.value;
      if (!notes) {
        document.getElementById('resume-action-notes').classList.add('border-red-400');
        showToast('Please document the action taken before resuming', 'error');
        return;
      }
      if (!resumeDate) {
        showToast('Please select a resume date', 'error');
        return;
      }
      const btn = document.getElementById('resume-confirm-btn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1.5"></i>Resuming…'; }
      try {
        const prescriptionFile = document.getElementById('resume-prescription-file')?.files[0];
        let resumeBody;
        let resumeFetchOpts;
        if (prescriptionFile) {
          const fd = new FormData();
          fd.append('notes', notes);
          fd.append('resume_date', resumeDate);
          fd.append('prescription_file', prescriptionFile);
          resumeBody = fd;
          resumeFetchOpts = { method: 'POST', body: fd };
        } else {
          resumeFetchOpts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes, resume_date: resumeDate }) };
        }
        const res = await fetch(`/patient_events/resume_study/${patientId}`, resumeFetchOpts);
        const data = await res.json();
        if (data.status === 'success') {
          document.getElementById('resume-study-modal').remove();
          const resumedAt = data.resumedAt || new Date().toISOString();
          if (selectedPatientData && selectedPatientData.HospitalID === patientId) {
            selectedPatientData.studyPaused = false;
            selectedPatientData.resumedAt = resumedAt;
          }
          const pt = allPatients.find(p => p.HospitalID === patientId);
          if (pt) { pt.studyPaused = false; pt.resumedAt = resumedAt; }

          showToast('Study resumed successfully');
          fetchPatientAdverseEvents(patientId);
        } else {
          showToast(data.message || 'Failed to resume', 'error');
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-play mr-1.5"></i>Resume Study'; }
        }
      } catch (err) {
        showToast('Network error', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-play mr-1.5"></i>Resume Study'; }
      }
    }

    // ============================================================
    // TRIAL DONE MODAL
    // ============================================================
    function showTrialDoneModal(patientId) {
      const existing = document.getElementById('trial-done-modal');
      if (existing) existing.remove();

      const modalHtml = `
        <div id="trial-done-modal" class="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto">
            <div class="flex items-center justify-between mb-5">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
                  <i class="fas fa-flag-checkered text-white"></i>
                </div>
                <div>
                  <h3 class="text-lg font-bold text-slate-800">Mark Trial Complete</h3>
                  <p class="text-sm text-slate-500">Complete feedback to mark as done</p>
                </div>
              </div>
              <button onclick="document.getElementById('trial-done-modal').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
            </div>
            <form id="trial-done-form" class="space-y-4">
              <input type="hidden" id="td-patient-id" value="${patientId}">
              <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Feedback Summary <span class="text-red-500">*</span></label>
                <textarea id="td-feedback" rows="4" required class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none" placeholder="Enter overall feedback about the patient's trial participation..."></textarea>
              </div>
              <div class="bg-violet-50 border border-violet-200 rounded-xl p-4">
                <p class="text-sm font-semibold text-violet-800 mb-2"><i class="fas fa-chart-line mr-1.5 text-violet-600"></i>Qualitative Analysis</p>
                <p class="text-xs text-violet-600 mb-3">Was a qualitative analysis (interview/survey) conducted for this patient?</p>
                <div class="flex gap-6">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="td-qualitative" id="td-qualitative-yes" value="yes" class="w-4 h-4 accent-violet-600" onchange="toggleQualitativeFiles()">
                    <span class="text-sm font-medium text-violet-800">Yes</span>
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="td-qualitative" id="td-qualitative-no" value="no" checked class="w-4 h-4 accent-slate-500" onchange="toggleQualitativeFiles()">
                    <span class="text-sm font-medium text-slate-600">No</span>
                  </label>
                </div>
              </div>
              <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Feedback File (Optional)</label>
                <div class="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-emerald-400 transition-colors cursor-pointer" onclick="document.getElementById('td-feedback-file').click()">
                  <input type="file" id="td-feedback-file" class="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png">
                  <i class="fas fa-file-upload text-2xl text-slate-300 mb-1"></i>
                  <p class="text-xs text-slate-500" id="td-feedback-file-name">Click to upload feedback document</p>
                </div>
              </div>
              <div id="td-qualitative-section" class="hidden space-y-3">
                <div>
                  <label class="block text-sm font-semibold text-slate-700 mb-1.5">Qualitative Analysis File</label>
                  <div class="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-violet-400 transition-colors cursor-pointer" onclick="document.getElementById('td-qualitative-file').click()">
                    <input type="file" id="td-qualitative-file" class="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv">
                    <i class="fas fa-chart-line text-2xl text-slate-300 mb-1"></i>
                    <p class="text-xs text-slate-500" id="td-qualitative-file-name">Click to upload qualitative analysis</p>
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-semibold text-slate-700 mb-1.5">Audio Recording</label>
                  <div class="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center hover:border-amber-400 transition-colors cursor-pointer" onclick="document.getElementById('td-audio-file').click()">
                    <input type="file" id="td-audio-file" class="hidden" accept=".mp3,.wav,.m4a,.aac">
                    <i class="fas fa-microphone text-2xl text-slate-300 mb-1"></i>
                    <p class="text-xs text-slate-500" id="td-audio-file-name">Click to upload audio recording</p>
                  </div>
                </div>
              </div>
              <div class="flex gap-3 pt-2">
                <button type="button" onclick="document.getElementById('trial-done-modal').remove()" class="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-medium">Cancel</button>
                <button type="submit" class="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:from-emerald-600 hover:to-teal-700 text-sm font-medium shadow-md shadow-emerald-200">Mark as Complete</button>
              </div>
            </form>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      
      // Change 8: toggle qualitative analysis file sections
      function toggleQualitativeFiles() {
        const isYes = document.getElementById('td-qualitative-yes')?.checked;
        const section = document.getElementById('td-qualitative-section');
        if (section) section.classList.toggle('hidden', !isYes);
      }

      // File upload handlers
      ['td-feedback-file', 'td-qualitative-file', 'td-audio-file'].forEach((id, idx) => {
        const input = document.getElementById(id);
        const nameEl = document.getElementById(id + '-name');
        if (input && nameEl) {
          input.addEventListener('change', function() {
            if (this.files && this.files[0]) {
              nameEl.textContent = this.files[0].name;
              nameEl.classList.add('text-emerald-600', 'font-medium');
            }
          });
        }
      });
      
      // Form submission
      document.getElementById('trial-done-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const patientId = document.getElementById('td-patient-id').value;
        const feedback = document.getElementById('td-feedback').value.trim();
        
        if (!feedback) {
          showToast('Please enter feedback summary', 'error');
          return;
        }
        
        const formData = new FormData();
        formData.append('patientId', patientId);
        formData.append('feedback', feedback);
        
        const feedbackFile = document.getElementById('td-feedback-file')?.files[0];
        const qualitativeFile = document.getElementById('td-qualitative-file')?.files[0];
        const audioFile = document.getElementById('td-audio-file')?.files[0];
        
        const qualitativeConducted = document.getElementById('td-qualitative-yes')?.checked ? 'yes' : 'no';
        formData.append('qualitativeConducted', qualitativeConducted);
        if (feedbackFile) formData.append('feedbackFile', feedbackFile);
        if (qualitativeFile) formData.append('qualitativeFile', qualitativeFile);
        if (audioFile) formData.append('audioFile', audioFile);
        
        const btn = this.querySelector('[type="submit"]');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1.5"></i>Processing...'; }
        
        try {
          const res = await fetch('/patient_events/mark_trial_complete', {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (data.status === 'success') {
            document.getElementById('trial-done-modal').remove();
            trialCompletedPatients.add(patientId);
            const pt = allPatients.find(p => p.HospitalID === patientId);
            if (pt) pt.trialCompleted = true;
            if (selectedPatientData && selectedPatientData.HospitalID === patientId) {
              selectedPatientData.trialCompleted = true;
            }
            updateFilterCounts();
            const statCompleted = document.getElementById('stat-completed');
            if (statCompleted) statCompleted.textContent = trialCompletedPatients.size;
            showToast('Trial marked as complete');
            if (typeof logActivity === 'function') {
              logActivity('TRIAL_COMPLETED', { 
                patient_id: patientId,
                feedback: feedback.substring(0, 100) + '...',
                has_feedback_file: !!feedbackFile,
                has_qualitative_file: !!qualitativeFile,
                has_audio_file: !!audioFile
              });
            }
            loadPatients();
            loadDashboard();
          } else {
            showToast(data.message || 'Failed to mark trial complete', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = 'Mark as Complete'; }
          }
        } catch (err) {
          showToast('Network error', 'error');
          if (btn) { btn.disabled = false; btn.innerHTML = 'Mark as Complete'; }
        }
      });
    }

    // ── CHANGE 5: Trial Done Tab ──────────────────────────────────────────────────
    function loadTrialTab(content) {
      const patient = selectedPatientData;
      if (!patient) return;

      const isTrialCompleted = trialCompletedPatients.has(patient.HospitalID);

      // Calculate days since activation
      let daysSinceActivation = 0;
      if (patient.activationDate) {
        try {
          const actDate = new Date(patient.activationDate);
          daysSinceActivation = Math.floor((new Date() - actDate) / (1000 * 60 * 60 * 24));
        } catch(_) {}
      }

      const isDay29 = daysSinceActivation >= 29;

      if (isTrialCompleted) {
        content.innerHTML = `
          <div class="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 p-8 text-center">
            <div class="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <i class="fas fa-flag-checkered text-white text-2xl"></i>
            </div>
            <h3 class="text-xl font-bold text-emerald-900 mb-2">Trial Completed</h3>
            <p class="text-sm text-emerald-600">This patient's trial has been successfully completed.</p>
          </div>`;
        return;
      }

      if (!isDay29) {
        const daysLeft = 29 - daysSinceActivation;
        content.innerHTML = `
          <div class="bg-slate-50 rounded-2xl border border-slate-200 p-8 text-center">
            <div class="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <i class="fas fa-lock text-slate-400 text-2xl"></i>
            </div>
            <h3 class="text-lg font-bold text-slate-700 mb-2">Trial Completion Locked</h3>
            <p class="text-sm text-slate-500 mb-3">This tab becomes active on Day 29 of the study.</p>
            <div class="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">
              <i class="fas fa-calendar-day text-blue-500"></i>
              ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining (currently Day ${daysSinceActivation})
            </div>
          </div>`;
        return;
      }

      // Day 29+ — show the completion form
      content.innerHTML = `
        <div class="max-w-lg mx-auto">
          <div class="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 p-6">
            <div class="flex items-center gap-3 mb-5">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shrink-0">
                <i class="fas fa-flag-checkered text-white text-lg"></i>
              </div>
              <div>
                <h3 class="text-lg font-bold text-emerald-900">Mark Trial as Complete</h3>
                <p class="text-sm text-emerald-600">Day ${daysSinceActivation} — patient is eligible for trial completion</p>
              </div>
            </div>
            <form id="trial-tab-form" class="space-y-4">
              <input type="hidden" id="tt-patient-id" value="${patient.HospitalID}">
              <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Feedback Summary <span class="text-red-500">*</span></label>
                <textarea id="tt-feedback" rows="4" required
                  class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                  placeholder="Enter overall feedback about the patient's trial participation..."></textarea>
              </div>
              <div class="bg-violet-50 border border-violet-200 rounded-xl p-4">
                <p class="text-sm font-semibold text-violet-800 mb-2"><i class="fas fa-chart-line mr-1.5 text-violet-600"></i>Qualitative Analysis</p>
                <p class="text-xs text-violet-600 mb-3">Was a qualitative analysis (interview/survey) conducted for this patient?</p>
                <div class="flex gap-6">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="tt-qualitative" id="tt-qualitative-yes" value="yes" class="w-4 h-4 accent-violet-600" onchange="toggleTrialTabQualitative()">
                    <span class="text-sm font-medium text-violet-800">Yes</span>
                  </label>
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="tt-qualitative" id="tt-qualitative-no" value="no" checked class="w-4 h-4 accent-slate-500" onchange="toggleTrialTabQualitative()">
                    <span class="text-sm font-medium text-slate-600">No</span>
                  </label>
                </div>
              </div>
              <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Feedback File (Optional)</label>
                <div class="border-2 border-dashed border-slate-200 rounded-xl p-3 text-center hover:border-emerald-400 transition-colors cursor-pointer" onclick="document.getElementById('tt-feedback-file').click()">
                  <input type="file" id="tt-feedback-file" class="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png">
                  <i class="fas fa-file-upload text-xl text-slate-300 mb-1"></i>
                  <p class="text-xs text-slate-500" id="tt-feedback-file-name">Click to upload feedback document</p>
                </div>
              </div>
              <div id="tt-qualitative-section" class="hidden space-y-3">
                <div>
                  <label class="block text-sm font-semibold text-slate-700 mb-1.5">Qualitative Analysis File</label>
                  <div class="border-2 border-dashed border-slate-200 rounded-xl p-3 text-center hover:border-violet-400 transition-colors cursor-pointer" onclick="document.getElementById('tt-qualitative-file').click()">
                    <input type="file" id="tt-qualitative-file" class="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv">
                    <i class="fas fa-chart-line text-xl text-slate-300 mb-1"></i>
                    <p class="text-xs text-slate-500" id="tt-qualitative-file-name">Click to upload qualitative analysis</p>
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-semibold text-slate-700 mb-1.5">Audio Recording</label>
                  <div class="border-2 border-dashed border-slate-200 rounded-xl p-3 text-center hover:border-amber-400 transition-colors cursor-pointer" onclick="document.getElementById('tt-audio-file').click()">
                    <input type="file" id="tt-audio-file" class="hidden" accept=".mp3,.wav,.m4a,.aac">
                    <i class="fas fa-microphone text-xl text-slate-300 mb-1"></i>
                    <p class="text-xs text-slate-500" id="tt-audio-file-name">Click to upload audio recording</p>
                  </div>
                </div>
              </div>
              <div class="flex gap-3 pt-2">
                <button type="submit" id="tt-submit-btn"
                  class="w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-700 shadow-md shadow-emerald-200 active:scale-95 transition-all">
                  <i class="fas fa-flag-checkered mr-2"></i>Mark Trial as Complete
                </button>
              </div>
            </form>
          </div>
        </div>`;

      // File upload name display
      ['tt-feedback-file','tt-qualitative-file','tt-audio-file'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', function() {
          const nameEl = document.getElementById(id + '-name');
          if (nameEl && this.files[0]) {
            nameEl.textContent = this.files[0].name;
            nameEl.classList.add('text-emerald-600','font-medium');
          }
        });
      });

      // Form submit
      document.getElementById('trial-tab-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        const patientId = document.getElementById('tt-patient-id').value;
        const feedback = document.getElementById('tt-feedback').value.trim();
        if (!feedback) { showToast('Please enter feedback summary', 'error'); return; }

        const btn = document.getElementById('tt-submit-btn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...'; }

        const formData = new FormData();
        formData.append('patientId', patientId);
        formData.append('feedback', feedback);
        formData.append('qualitativeConducted', document.getElementById('tt-qualitative-yes')?.checked ? 'yes' : 'no');

        const feedbackFile = document.getElementById('tt-feedback-file')?.files[0];
        const qualitativeFile = document.getElementById('tt-qualitative-file')?.files[0];
        const audioFile = document.getElementById('tt-audio-file')?.files[0];
        if (feedbackFile) formData.append('feedbackFile', feedbackFile);
        if (qualitativeFile) formData.append('qualitativeFile', qualitativeFile);
        if (audioFile) formData.append('audioFile', audioFile);

        try {
          const res = await fetch('/patient_events/mark_trial_complete', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.status === 'success') {
            trialCompletedPatients.add(patientId);
            const pt = allPatients.find(p => p.HospitalID === patientId);
            if (pt) pt.trialCompleted = true;
            if (selectedPatientData && selectedPatientData.HospitalID === patientId) {
              selectedPatientData.trialCompleted = true;
            }
            updateFilterCounts();
            const statEl = document.getElementById('stat-completed');
            if (statEl) statEl.textContent = trialCompletedPatients.size;
            showToast('Trial marked as complete!', 'success');
            if (typeof logActivity === 'function') logActivity('TRIAL_COMPLETED', { patient_id: patientId });
            // Hide the trial tab button and reload overview
            const trialBtn = document.querySelector('.trial-tab-btn');
            if (trialBtn) trialBtn.classList.add('hidden');
            loadPatients();
            // Show completed state in this tab
            content.innerHTML = `
              <div class="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 p-8 text-center">
                <div class="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <i class="fas fa-flag-checkered text-white text-2xl"></i>
                </div>
                <h3 class="text-xl font-bold text-emerald-900 mb-2">Trial Completed!</h3>
                <p class="text-sm text-emerald-600">This patient has been marked as Trial Complete.</p>
              </div>`;
          } else {
            showToast(data.message || 'Failed to mark trial complete', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-flag-checkered mr-2"></i>Mark Trial as Complete'; }
          }
        } catch(err) {
          showToast('Network error', 'error');
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-flag-checkered mr-2"></i>Mark Trial as Complete'; }
        }
      }, { once: true });
    }

    function toggleTrialTabQualitative() {
      const isYes = document.getElementById('tt-qualitative-yes')?.checked;
      const section = document.getElementById('tt-qualitative-section');
      if (section) section.classList.toggle('hidden', !isYes);
    }
    // ── END CHANGE 5 ──────────────────────────────────────────────────────────────