/* ============================================================
   patients.js — Patient list (filter/render/search), patient detail modal, tab navigation, overview tab, device charts
   HOMER Clinical Dashboard
   ============================================================ */

    function updateFilterCounts() {
      const today = new Date(); today.setHours(0,0,0,0);

      // Active: assigned + activated
      const activePatients = allPatients.filter(p => {
        if (droppedOutPatients.has(p.HospitalID) || p.discontinued === true || trialCompletedPatients.has(p.HospitalID)) return false;
        const role = (p.role || '').toLowerCase();
        if (role === 'unassigned') return false;
        if (role === 'control') return p.activated === true || (p.vcgType && p.vcgType.trim() !== '');
        if (role === 'experimental') {
          const s = p.Status;
          return p.activated === true || (typeof s === 'object' && s !== null && (s.pluto === 'active' || s.mars === 'active'));
        }
        return false;
      });

      // Not activated: assigned but not yet activated, not discontinued, not trial complete
      const notActivatedPatients = allPatients.filter(p => {
        if (droppedOutPatients.has(p.HospitalID) || p.discontinued === true || trialCompletedPatients.has(p.HospitalID)) return false;
        const role = (p.role || '').toLowerCase();
        if (role === 'unassigned') return false;
        if (role === 'control') return !(p.activated === true || (p.vcgType && p.vcgType.trim() !== ''));
        if (role === 'experimental') {
          const s = p.Status;
          return !(p.activated === true || (typeof s === 'object' && s !== null && (s.pluto === 'active' || s.mars === 'active')));
        }
        return false;
      });

      const el = id => document.getElementById(id);
      // Pre-enrolment discontinued: discontinued === true AND role is unassigned/empty
      const preDiscontinuedCount = allPatients.filter(p => {
        const role = (p.role || '').toLowerCase();
        return p.discontinued === true && (role === 'unassigned' || role === '');
      }).length;

      // Dropout: discontinued AFTER group assignment OR has dropout adverse event — excludes pre-enrolment
      const droppedCount = allPatients.filter(p => {
        const role = (p.role || '').toLowerCase();
        const hasGroup = role !== 'unassigned' && role !== '';
        if (!hasGroup) return false;
        return (droppedOutPatients.has(p.HospitalID) && hasGroup) || (p.discontinued === true && hasGroup);
      }).length;

      if (el('count-all')) el('count-all').textContent = allPatients.length;
      if (el('count-active')) el('count-active').textContent = activePatients.length;
      if (el('count-not-activated')) el('count-not-activated').textContent = notActivatedPatients.length;
      if (el('count-unassigned')) el('count-unassigned').textContent = allPatients.filter(p => (p.role || '').toLowerCase() === 'unassigned' && p.discontinued !== true).length;
      if (el('count-dropped')) el('count-dropped').textContent = droppedCount;
      if (el('count-pre-discontinued')) el('count-pre-discontinued').textContent = preDiscontinuedCount;
      if (el('count-trial-complete')) el('count-trial-complete').textContent = trialCompletedPatients.size;
      // legacy IDs still referenced elsewhere
      if (el('count-experimental')) el('count-experimental').textContent = allPatients.filter(p => p.role?.toLowerCase() === 'experimental').length;
      if (el('count-control')) el('count-control').textContent = allPatients.filter(p => p.role?.toLowerCase() === 'control').length;
    }

    function filterPatients(filter) {
      currentFilter = filter;
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove(
          'bg-white', 'bg-red-500',
          'from-blue-500', 'to-blue-600', 'text-white', 'shadow-md', 'shadow-blue-200',
          'bg-red-100', 'text-red-700', 'text-red-500',
          'from-emerald-500', 'to-teal-600', 'shadow-emerald-200',
          'from-orange-500', 'to-orange-600', 'shadow-orange-200',
          'bg-gradient-to-r', 'text-orange-600', 'text-emerald-600',
          'border', 'border-slate-200', 'border-red-200', 'border-orange-200', 'border-emerald-200', 'shadow-sm'
        );
        const isDropped = btn.id === 'filter-dropped';
        const isPreDisc = btn.id === 'filter-pre-discontinued';
        const isTrial = btn.dataset.filter === 'trial_complete';
        btn.classList.add(
          'bg-white',
          isDropped ? 'text-red-500' : isPreDisc ? 'text-orange-600' : isTrial ? 'text-emerald-600' : 'text-slate-600',
          'border',
          isDropped ? 'border-red-200' : isPreDisc ? 'border-orange-200' : isTrial ? 'border-emerald-200' : 'border-slate-200',
          'shadow-sm'
        );
      });

      const activeBtn = document.querySelector(`[data-filter="${filter}"]`);
      if (activeBtn) {
        activeBtn.classList.remove(
          'bg-white', 'bg-red-500',
          'text-slate-600', 'text-red-500', 'text-orange-600', 'text-emerald-600',
          'border', 'border-slate-200', 'border-red-200', 'border-orange-200', 'border-emerald-200',
          'shadow-sm');
        if (filter === 'dropped') {
          activeBtn.classList.add('bg-red-500', 'text-white', 'shadow-md', 'shadow-red-200');
        } else if (filter === 'pre_discontinued') {
          activeBtn.classList.add('bg-gradient-to-r', 'from-orange-500', 'to-orange-600', 'text-white', 'shadow-md', 'shadow-orange-200');
        } else if (filter === 'trial_complete') {
          activeBtn.classList.add('bg-gradient-to-r', 'from-emerald-500', 'to-teal-600', 'text-white', 'shadow-md', 'shadow-emerald-200');
        } else if (filter === 'not_activated') {
          activeBtn.classList.add('bg-gradient-to-r', 'from-orange-500', 'to-orange-600', 'text-white', 'shadow-md', 'shadow-orange-200');
        } else {
          activeBtn.classList.add('bg-gradient-to-r', 'from-blue-500', 'to-blue-600', 'text-white', 'shadow-md', 'shadow-blue-200');
        }
      }
      renderPatients();
    }

    function renderPatients() {
      const patientList = document.getElementById('patient-list');
      const searchTerm = (document.getElementById('patient-search')?.value || '').toLowerCase();
      
      let filtered = allPatients;
      
      // Apply search filter
      if (searchTerm) {
        filtered = filtered.filter(p => (p.HospitalID || '').toLowerCase().includes(searchTerm));
      }

      // Helper: is a patient "active" (assigned + activated)
      function isActive(p) {
        if (droppedOutPatients.has(p.HospitalID) || p.discontinued === true || trialCompletedPatients.has(p.HospitalID)) return false;
        const role = (p.role || '').toLowerCase();
        if (role === 'unassigned') return false;
        if (role === 'control') return p.activated === true || (p.vcgType && p.vcgType.trim() !== '');
        if (role === 'experimental') {
          const s = p.Status;
          return p.activated === true || (typeof s === 'object' && s !== null && (s.pluto === 'active' || s.mars === 'active'));
        }
        return false;
      }
      function isNotActivated(p) {
        if (droppedOutPatients.has(p.HospitalID) || p.discontinued === true || trialCompletedPatients.has(p.HospitalID)) return false;
        const role = (p.role || '').toLowerCase();
        if (role === 'unassigned') return false;
        return !isActive(p);
      }
      
      // Apply role/status filter
      if (currentFilter === 'active') filtered = filtered.filter(isActive);
      else if (currentFilter === 'not_activated') filtered = filtered.filter(isNotActivated);
      else if (currentFilter === 'unassigned') filtered = filtered.filter(p => (p.role || '').toLowerCase() === 'unassigned' && p.discontinued !== true);
      else if (currentFilter === 'dropped') {
        // Dropout = discontinued AFTER group assignment (not unassigned), OR has dropout adverse event
        // Excludes patients discontinued before group assignment
        filtered = allPatients.filter(p => {
          const hasGroup = (p.role || '').toLowerCase() !== 'unassigned' && (p.role || '').toLowerCase() !== '';
          const discontinuedBeforeGroup = p.discontinued === true && !hasGroup;
          if (discontinuedBeforeGroup) return false;
          return (droppedOutPatients.has(p.HospitalID) && hasGroup) ||
                 (p.discontinued === true && hasGroup);
        });
      }
      else if (currentFilter === 'pre_discontinued') {
        // Pre-enrolment discontinued: patient was discontinued before being assigned to any group
        filtered = allPatients.filter(p => {
          const role = (p.role || '').toLowerCase();
          return p.discontinued === true && (role === 'unassigned' || role === '');
        });
      }
      else if (currentFilter === 'trial_complete') filtered = allPatients.filter(p => trialCompletedPatients.has(p.HospitalID));
      // legacy filters still supported
      else if (currentFilter === 'experimental') filtered = filtered.filter(p => p.role?.toLowerCase() === 'experimental');
      else if (currentFilter === 'control') filtered = filtered.filter(p => p.role?.toLowerCase() === 'control');
      
      if (!filtered.length) { patientList.innerHTML = '<div class="text-center py-12 text-slate-500">No patients found</div>'; return; }

      // For active/not_activated filters: group by Experimental then Control with sub-headers
      const showGroupHeaders = ['active', 'not_activated'].includes(currentFilter) && !searchTerm;
      const expPatients = showGroupHeaders ? filtered.filter(p => p.role?.toLowerCase() === 'experimental') : [];
      const ctrlPatients = showGroupHeaders ? filtered.filter(p => p.role?.toLowerCase() === 'control') : [];
      const otherPatients = showGroupHeaders ? filtered.filter(p => !['experimental','control'].includes((p.role||'').toLowerCase())) : filtered;

      function renderCard(patient) {
        const role = (patient.role || '').toLowerCase();
        const roleColors = { 
          experimental: { bg: 'bg-gradient-to-br from-blue-500 to-blue-600', shadow: 'shadow-blue-200' }, 
          control: { bg: 'bg-gradient-to-br from-violet-500 to-violet-600', shadow: 'shadow-violet-200' }, 
          unassigned: { bg: 'bg-gradient-to-br from-slate-400 to-slate-500', shadow: 'shadow-slate-200' } 
        };
        const roleColor = roleColors[role] || roleColors.unassigned;
        
        const isDroppedOut = droppedOutPatients.has(patient.HospitalID);
        const isDiscontinued = patient.discontinued === true;
        const isPaused = patient.studyPaused === true;
        const isTrialCompleted = trialCompletedPatients.has(patient.HospitalID);
        
        const statusConfigs = {
          discontinued: { bg: 'bg-red-50', text: 'text-red-600', icon: 'fa-user-slash', label: 'Discontinued' },
          trial_complete: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'fa-flag-checkered', label: 'Trial Complete' },
          paused: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'fa-pause-circle', label: 'Paused' },
          dropped: { bg: 'bg-red-50', text: 'text-red-500', icon: 'fa-user-minus', label: 'Dropped Out' },
          activated: { bg: 'bg-blue-50', text: 'text-blue-600', icon: 'fa-check-circle', label: 'Active' },
          not_activated: { bg: 'bg-orange-50', text: 'text-orange-600', icon: 'fa-clock', label: 'Not Activated' },
          partial: { bg: 'bg-yellow-50', text: 'text-yellow-600', icon: 'fa-minus-circle', label: 'Partial' },
          unassigned: { bg: 'bg-slate-100', text: 'text-slate-500', icon: 'fa-question-circle', label: 'Unassigned' }
        };
        
        let statusConfig;
        if (isDiscontinued) statusConfig = statusConfigs.discontinued;
        else if (isTrialCompleted) statusConfig = statusConfigs.trial_complete;
        else if (isPaused) statusConfig = statusConfigs.paused;
        else if (isDroppedOut) statusConfig = statusConfigs.dropped;
        else if (role === 'control') {
          const isActivated = patient.activated === true || (patient.vcgType && patient.vcgType.trim() !== '');
          statusConfig = isActivated ? statusConfigs.activated : statusConfigs.not_activated;
        } else if (role === 'experimental') {
          const s = patient.Status;
          const plutoActive = typeof s === 'object' && s !== null ? s.pluto === 'active' : false;
          const marsActive = typeof s === 'object' && s !== null ? s.mars === 'active' : false;
          if (patient.activated === true || (plutoActive && marsActive)) statusConfig = statusConfigs.activated;
          else if (plutoActive || marsActive) statusConfig = statusConfigs.partial;
          else statusConfig = statusConfigs.not_activated;
        } else {
          statusConfig = statusConfigs.unassigned;
        }
        
        const statusBadge = `<span class="px-3 py-1.5 ${statusConfig.bg} ${statusConfig.text} rounded-full text-xs font-medium flex items-center gap-1.5 shadow-sm"><i class="fas ${statusConfig.icon} text-xs"></i>${statusConfig.label}</span>`;
        const cardClasses = isDiscontinued ? 'bg-white/50 opacity-70 border border-slate-200' : 'bg-white border border-slate-100 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-100/50';
        const cardBgClass = isDiscontinued ? '' : 'hover:-translate-y-0.5';
        
        // Activation date badge for active patients
        const actDateBadge = patient.activationDate
          ? `<span class="text-xs text-slate-400 ml-1">since ${new Date(patient.activationDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</span>`
          : '';
        
        return `
          <div class="group ${cardBgClass} transition-all duration-300 ease-out">
            <div class="${cardClasses} rounded-2xl p-4 cursor-pointer active:scale-[0.98] transition-transform" onclick="openPatientDetail('${patient.HospitalID}')">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                  <div class="w-14 h-14 ${roleColor.bg} ${roleColor.shadow} rounded-2xl flex items-center justify-center shadow-md transform group-hover:scale-105 transition-transform duration-300">
                    <span class="text-white font-semibold text-base tracking-wide">${(patient.HospitalID || '--').slice(0,2).toUpperCase()}</span>
                  </div>
                  <div>
                    <p class="font-semibold ${isDiscontinued ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-800'} text-base">${patient.HospitalID}${actDateBadge}</p>
                    <p class="text-sm ${isDiscontinued ? 'text-slate-400' : 'text-slate-500'}">${patient.trainingSide || '--'} side · <span class="capitalize">${role}</span>${patient.vcgType ? ' · ' + patient.vcgType : ''}</p>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  ${statusBadge}
                  <button onclick="event.stopPropagation(); openPatientDetail('${patient.HospitalID}')" class="px-4 py-2 ${isDiscontinued ? 'bg-slate-300' : 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700'} text-white text-sm font-medium rounded-xl shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95 transition-all duration-200 flex items-center gap-2">
                    <i class="fas fa-eye text-xs"></i>View
                  </button>
                </div>
              </div>
            </div>
          </div>`;
      }

      // Always render Experimental | Control in side-by-side columns when both groups are visible
      let html = '';
      if (showGroupHeaders && (expPatients.length > 0 || ctrlPatients.length > 0)) {
        // Two-column layout: Experimental left, Control right
        html = `
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div class="flex items-center gap-2 mb-3">
                <div class="h-px flex-1 bg-blue-100"></div>
                <span class="text-xs font-bold text-blue-500 uppercase tracking-wider px-2 flex items-center gap-1.5">
                  <i class="fas fa-robot text-xs"></i>Experimental (${expPatients.length})
                </span>
                <div class="h-px flex-1 bg-blue-100"></div>
              </div>
              <div class="space-y-3">
                ${expPatients.length > 0 ? expPatients.map(renderCard).join('') : '<p class="text-center text-xs text-slate-400 py-4">No experimental patients</p>'}
              </div>
            </div>
            <div>
              <div class="flex items-center gap-2 mb-3">
                <div class="h-px flex-1 bg-violet-100"></div>
                <span class="text-xs font-bold text-violet-500 uppercase tracking-wider px-2 flex items-center gap-1.5">
                  <i class="fas fa-user-check text-xs"></i>Control (${ctrlPatients.length})
                </span>
                <div class="h-px flex-1 bg-violet-100"></div>
              </div>
              <div class="space-y-3">
                ${ctrlPatients.length > 0 ? ctrlPatients.map(renderCard).join('') : '<p class="text-center text-xs text-slate-400 py-4">No control patients</p>'}
              </div>
            </div>
          </div>
          ${otherPatients.length > 0 ? `
            <div class="mt-4">
              <div class="flex items-center gap-2 mb-3">
                <div class="h-px flex-1 bg-slate-100"></div>
                <span class="text-xs font-bold text-slate-400 uppercase tracking-wider px-2">Unassigned (${otherPatients.length})</span>
                <div class="h-px flex-1 bg-slate-100"></div>
              </div>
              <div class="space-y-3">${otherPatients.map(renderCard).join('')}</div>
            </div>` : ''}`;
      } else {
        html = `<div class="space-y-3">${filtered.map(renderCard).join('')}</div>`;
      }

      patientList.innerHTML = html;
    }

    function searchPatients() {
      renderPatients();
    }

    // Patient Detail
    // Returns true if patient is read-only (paused, discontinued, dropped, or trial completed)
    function isPatientReadOnly(patientId) {
      const pt = allPatients.find(p => p.HospitalID === patientId);
      return droppedOutPatients.has(patientId) ||
             trialCompletedPatients.has(patientId) ||
             (pt && (pt.discontinued === true || pt.studyPaused === true));
    }

    function openPatientDetail(patientId) {
      const patient = allPatients.find(p => p.HospitalID === patientId);
      if (!patient) return;
      selectedPatientData = patient;
      
      // Log patient view activity
      if (typeof logActivity === 'function') {
        logActivity('VIEWED_PATIENT', { patient_id: patientId });
      }

      // ── Clear all per-patient exercise state so previous patient's data never leaks ──
      selectedVcgExercises = [];
      selectedAdlExercises = [];
      currentAdlPrescription = [];
      allVcgExercisesCache = [];
      allAdlExercisesCache = [];
      currentVcgExercise = null;
      currentAdlExercise = null;
      recordedVcgExercises = new Set();
      recordedAdlExercises = new Set();
      currentVcgPatientId = null;
      currentAdlPatientId = null;
      // ─────────────────────────────────────────────────────────
      const role = (patient.role || '').toLowerCase();
      document.getElementById('detail-patient-id').textContent = patient.HospitalID;
      document.getElementById('detail-patient-info').textContent = `${patient.role || 'Unassigned'} • ${patient.trainingSide || '--'} Side`;
      document.getElementById('patient-detail-modal').classList.remove('hidden');
      
      // Show delete button only for admins
      const deleteBtn = document.getElementById('delete-patient-btn');
      const isAdmin = currentUser.privilege === 'admin' || currentUser.privilege === 'Admin';
      if (isAdmin) {
        deleteBtn.classList.remove('hidden');
      } else {
        deleteBtn.classList.add('hidden');
      }
      
      // Show/hide tabs based on group
      const devicesTab = document.querySelector('.detail-tab-btn[data-tab="devices"]');
      const adlTab = document.querySelector('.detail-tab-btn[data-tab="adl"]');
      const vcgTab = document.querySelector('.vcg-tab-btn');
      const timelineTab = document.querySelector('.detail-tab-btn[data-tab="timeline"]');
      const adverseTab = document.querySelector('.detail-tab-btn[data-tab="adverse"]');
      const issuesTab = document.querySelector('.detail-tab-btn[data-tab="issues"]');
      const trialTab = document.querySelector('.trial-tab-btn');

      // Determine if patient is activated
      const isActivatedControl = patient.activated === true || (patient.vcgType || '').trim() !== '';
      const isActivatedExp = patient.activated === true ||
        (typeof patient.Status === 'object' &&
        (patient.Status?.pluto === 'active' || patient.Status?.mars === 'active'));
      const patientIsActivated = role === 'experimental' ? isActivatedExp : isActivatedControl;

      // Trial tab: visible only when patient is activated AND >= day 29
      let showTrialTab = false;
      if (patientIsActivated && !patient.discontinued && patient.activationDate) {
        try {
          const actDate = new Date(patient.activationDate);
          const daysDiff = Math.floor((new Date() - actDate) / (1000 * 60 * 60 * 24));
          showTrialTab = daysDiff >= 29 && !trialCompletedPatients.has(patient.HospitalID);
        } catch(_) {}
      }

      const allTabs = [devicesTab, adlTab, vcgTab, timelineTab, adverseTab, issuesTab, trialTab];

      if (role === 'unassigned' || !patientIsActivated) {
        allTabs.forEach(t => t && t.classList.add('hidden'));
      } else if (role === 'control') {
        [devicesTab, adlTab, vcgTab, timelineTab, adverseTab, issuesTab]
          .forEach(t => t && t.classList.remove('hidden'));
        if (trialTab) showTrialTab ? trialTab.classList.remove('hidden') : trialTab.classList.add('hidden');
      } else if (role === 'experimental') {
        [devicesTab, adlTab, timelineTab, adverseTab, issuesTab]
          .forEach(t => t && t.classList.remove('hidden'));
        if (vcgTab) vcgTab.classList.add('hidden');
        if (trialTab) showTrialTab ? trialTab.classList.remove('hidden') : trialTab.classList.add('hidden');
      }
      
      showDetailTab('overview');
    }

    function closePatientDetail() { document.getElementById('patient-detail-modal').classList.add('hidden'); selectedPatientData = null; }
    
    function expandPatientDetail() { closePatientDetail(); }
    
    function showDeletePatientModal() {
      if (!selectedPatientData) return;
      
      const modalHtml = `
        <div id="delete-patient-modal" class="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-red-600">Delete Patient</h3>
              <button onclick="document.getElementById('delete-patient-modal').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
            </div>
            <p class="text-slate-600 mb-4">Are you sure you want to permanently delete patient <strong>${selectedPatientData.HospitalID}</strong>? This action cannot be undone.</p>
            <form id="delete-patient-form" class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Reason for Deletion</label>
                <textarea id="delete-reason" required rows="2" class="w-full px-3 py-2 border border-slate-200 rounded-lg" placeholder="Enter reason for deletion"></textarea>
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Enter Password to Confirm</label>
                <input type="password" id="delete-password" required class="w-full px-3 py-2 border border-slate-200 rounded-lg" placeholder="Enter admin password">
              </div>
              <div class="flex gap-3 pt-2">
                <button type="button" onclick="document.getElementById('delete-patient-modal').remove()" class="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete Patient</button>
              </div>
            </form>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    document.addEventListener('submit', function(e) {
      if (e.target.id === 'delete-patient-form') {
        e.preventDefault();
        const password = document.getElementById('delete-password').value;
        const reason = document.getElementById('delete-reason').value;
        const patientId = selectedPatientData.HospitalID;
        
        // Verify password - in production this should be done server-side
        fetch('/delete_patient', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patientId: patientId,
            password: password,
            reason: reason,
            loginId: currentUser.loginId
          })
        }).then(r => r.json()).then(data => {
          if (data.status === 'success') {
            document.getElementById('delete-patient-modal').remove();
            closePatientDetail();
            alert('Patient deleted successfully');
            loadPatients();
            loadDashboard();
          } else {
            alert('Error: ' + (data.message || 'Invalid password'));
          }
        }).catch(err => {
          alert('Error deleting patient');
        });
      }
    });

    // Tab Navigation - Fixed
    async function showDetailTab(tabName, e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      
      currentExercisesPage = tabName;
      
      // Log tab view with patient ID
      if (typeof logActivity === 'function' && selectedPatientData?.HospitalID) {
        logActivity('VIEWED_TAB', { patient_id: selectedPatientData.HospitalID, tab: tabName });
      }
      
      // Get all tab buttons
      const tabButtons = document.querySelectorAll('.detail-tab-btn');
      
      // Remove active from all tabs
      tabButtons.forEach(btn => {
        btn.classList.remove('active', 'border-blue-600', 'text-slate-800', 'bg-blue-50');
        btn.classList.add('border-transparent', 'text-slate-600');
      });
      
      // Add active to selected tab
      const selectedTab = document.querySelector(`.detail-tab-btn[data-tab="${tabName}"]`);
      if (selectedTab) {
        selectedTab.classList.add('active', 'border-blue-600', 'text-slate-800');
        selectedTab.classList.remove('border-transparent', 'text-slate-600');
      }
      
      const content = document.getElementById('detail-content');
      if (tabName === 'overview') await loadOverviewTab(content);
      else if (tabName === 'devices') loadDevicesTab(content);
      else if (tabName === 'adl') loadAdlTab(content);
      else if (tabName === 'vcg') loadVcgTab(content);
      else if (tabName === 'timeline') loadTimelineTab(content);
      else if (tabName === 'adverse') loadAdverseTab(content);
      else if (tabName === 'issues') loadIssuesTab(content);
      else if (tabName === 'trial') loadTrialTab(content);

    }

    // Overview Tab - Optimized
    async function loadOverviewTab(content) {
      const patient = selectedPatientData;
      const role = (patient.role || '').toLowerCase();

      // For unassigned patients, show simple info — Assign Group + Discontinue available
      if (role === 'unassigned') {
        const isDiscontinuedUnassigned = patient.discontinued === true;
        const discontinuedBannerUnassigned = isDiscontinuedUnassigned ? `
          <div class="bg-red-50 border-2 border-red-400 rounded-xl p-4 mb-4 flex items-center gap-3">
            <i class="fas fa-user-slash text-red-500 text-xl shrink-0"></i>
            <div>
              <p class="font-semibold text-red-800">Patient Discontinued (before group assignment)</p>
              <p class="text-sm text-red-600">Reason: ${patient.discontinueReason || '—'} · Date: ${patient.discontinueDate || '—'}</p>
            </div>
          </div>` : '';
        content.innerHTML = `
          ${discontinuedBannerUnassigned}
          <div class="bg-slate-50 rounded-xl p-5">
            <h3 class="font-semibold text-slate-800 mb-4">Patient Information</h3>
            <div class="space-y-3">
              <div class="flex justify-between"><span class="text-slate-500">Patient ID</span><span class="font-medium">${patient.HospitalID}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Group</span><span class="font-medium">Unassigned</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Training Side</span><span class="font-medium">${patient.trainingSide || '--'}</span></div>
              ${!isDiscontinuedUnassigned ? `<button onclick="showAssignGroupModal('${patient.HospitalID}')" class="w-full mt-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Assign Group</button>` : ''}
            </div>
          </div>
          ${!isDiscontinuedUnassigned ? `
          <div class="mt-4 bg-white rounded-xl border border-red-200 p-4">
            <p class="text-xs text-slate-500 mb-2">Patient can be discontinued before group assignment is made.</p>
            <div class="relative" id="disc-zone-unassigned-${patient.HospitalID}">
              <button onclick="toggleDiscontinueMenu('unassigned-${patient.HospitalID}')"
                class="w-full px-3 py-2 border border-red-200 text-red-400 hover:text-red-600 hover:border-red-400 hover:bg-red-50 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5">
                <i class="fas fa-unlock-alt text-xs"></i>Reveal Discontinue Option
              </button>
              <div id="discontinue-menu-unassigned-${patient.HospitalID}" class="hidden mt-2">
                <button onclick="showDiscontinueModal('${patient.HospitalID}')"
                  class="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                  <i class="fas fa-user-slash"></i>Confirm Discontinue
                </button>
              </div>
            </div>
          </div>` : ''}`;
        return;
      }
      
      // Calculate study day — only show if patient is actually activated
      let studyDayInfo = '<span class="text-slate-400">Not started</span>';

      const isActivated = role === 'experimental'
        ? (patient.activated === true || (typeof patient.Status === 'object' && (patient.Status?.pluto === 'active' || patient.Status?.mars === 'active')))
        : (patient.activated === true || (patient.vcgType || '').trim() !== '');

      if (isActivated) {
        try {
          const response = await fetch(`/patient_events/get_timeline/${patient.HospitalID}`);
          const data = await response.json();
          if (data.events && data.events.length > 0) {
            const firstEvent = data.events[0];
            if (firstEvent && firstEvent.scheduledDate) {
              const startDate = new Date(firstEvent.scheduledDate);
              const today = new Date();
              const diffDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
              // experimental starts at Day 0, control starts at Day 1
              const displayDay = firstEvent.studyDay === 0 ? diffDays : diffDays + 1;
              if (displayDay >= 0) {
                // Day 0 is a valid study day for experimental group
                studyDayInfo = `<span class="text-green-600 font-medium">Day ${displayDay}</span>`;
              } else if (displayDay < 0) {
                studyDayInfo = `<span class="text-slate-400">Starts in ${Math.abs(displayDay)} days</span>`;
              }
            }
          }
        } catch (e) {
          console.log('Could not fetch timeline for study day');
        }
      }
      
      // For assigned patients, show instantly with ActiGraph loading in background
      let actionButton = '';
      if (role === 'control' && !isActivated) {
        actionButton = `<button onclick="showActivateModal('${patient.HospitalID}')" class="w-full mt-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"><i class="fas fa-unlock mr-2"></i>Activate Patient</button>`;
      } else if (role === 'experimental' && !isActivated) {
        actionButton = `<button onclick="showActivateExperimentalModal('${patient.HospitalID}')" class="w-full mt-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><i class="fas fa-unlock mr-2"></i>Activate Patient</button>`;
      }
      
      let groupInfo = role.charAt(0).toUpperCase() + role.slice(1);
      if (role === 'control') {
        const vcgTypeVal = patient.vcgType || '';
        const isActivated = patient.activated === true || vcgTypeVal.trim() !== '';
        if (vcgTypeVal) {
          groupInfo += ` (${vcgTypeVal.toUpperCase()}${isActivated ? ' - Activated' : ' - Not Activated'})`;
        } else {
          groupInfo += isActivated ? ' (Activated)' : ' (Not Activated)';
        }
      }
      
      // Status flags — must be declared before banners
      const isDiscontinued = patient.discontinued === true;
      const isPaused = patient.studyPaused === true;

      // Not-activated banner (shown on overview when tabs are hidden)
      const notActivatedBanner = (!isDiscontinued && !isPaused && !isActivated) ? `
        <div class="mb-4 flex items-start gap-3 px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl">
          <div class="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
            <i class="fas fa-lock text-slate-500 text-sm"></i>
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-700">Activate the patient to view all tabs</p>
            <p class="text-xs text-slate-500 mt-0.5">Click the Activate Patient button below to set the activation date and unlock all tabs.</p>
          </div>
        </div>` : '';

      const discontinuedBanner = isDiscontinued ? `
        <div class="bg-red-50 border-2 border-red-400 rounded-xl p-4 mb-4 flex items-center gap-3">
          <i class="fas fa-user-slash text-red-500 text-xl shrink-0"></i>
          <div>
            <p class="font-semibold text-red-800">Patient Discontinued</p>
            <p class="text-sm text-red-600">Reason: ${patient.discontinueReason || '—'} · Date: ${patient.discontinueDate || '—'}</p>
          </div>
        </div>` : '';

      const pausedBanner = isPaused && !isDiscontinued ? `
        <div class="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 mb-4 flex items-center gap-3">
          <i class="fas fa-pause-circle text-amber-500 text-xl shrink-0"></i>
          <div>
            <p class="font-semibold text-amber-800">Study Paused</p>
            <p class="text-sm text-amber-600">Paused due to adverse event. Go to Adverse Events tab to resume.</p>
          </div>
        </div>` : '';

      // Show UI instantly without spinner, load mechanisms section for experimental in background
      const mechanismsSection = (role === 'experimental' && isActivated) ? `
        <div class="bg-slate-50 rounded-xl p-5" id="overview-mechanisms-section">
          <h3 class="font-semibold text-slate-800 mb-3"><i class="fas fa-robot mr-2 text-blue-500"></i>Robotic Mechanisms</h3>
          <div id="overview-mechanisms-loading" class="text-center py-4">
            <i class="fas fa-spinner fa-spin text-blue-600"></i>
            <p class="text-xs text-slate-400 mt-1">Loading mechanism data...</p>
          </div>
          <div id="overview-mechanisms-content" class="hidden"></div>
        </div>` : '';

      content.innerHTML = `
        ${discontinuedBanner}${pausedBanner}${notActivatedBanner}
        <div class="space-y-5">
          <div class="bg-slate-50 rounded-xl p-5">
            <h3 class="font-semibold text-slate-800 mb-4">Patient Information</h3>
            <div class="space-y-3">
              <div class="flex justify-between"><span class="text-slate-500">Patient ID</span><span class="font-medium">${patient.HospitalID}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Group</span><span class="font-medium capitalize">${role}</span></div>
              ${role === 'control' ? `<div class="flex justify-between"><span class="text-slate-500">VCG Type</span><span class="font-medium">${patient.vcgType || '—'}</span></div>` : ''}
              <div class="flex justify-between"><span class="text-slate-500">Training Side</span><span class="font-medium">${patient.trainingSide || '--'}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Activation Date</span><span class="font-medium">${patient.activationDate ? new Date(patient.activationDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Current Study Day</span>${studyDayInfo}</div>
              ${!isDiscontinued && !isPaused ? actionButton : ''}
            </div>
          </div>
          ${mechanismsSection}
        </div>`;

      // Load mechanisms inline for experimental patients
      if (role === 'experimental' && isActivated) {
        fetchOverviewMechanisms(patient.HospitalID);
      }
    }

    async function fetchOverviewMechanisms(hospitalId) {
      try {
        const res = await fetch(`/get-patient-mechanisms/${hospitalId}`);
        const data = await res.json();
        const loadEl = document.getElementById('overview-mechanisms-loading');
        const contEl = document.getElementById('overview-mechanisms-content');
        if (!loadEl || !contEl) return;
        loadEl.classList.add('hidden');
        contEl.classList.remove('hidden');

        const mechanisms = data.mechanisms || [];
        if (mechanisms.length === 0) {
          contEl.innerHTML = `<p class="text-sm text-slate-400 text-center py-2">No mechanism data yet</p>`;
          return;
        }
        const plutoMechs = mechanisms.filter(m => ['WFE','WURD','FPS','HOC','FME1','FME2'].includes(m.name));
        const marsMechs  = mechanisms.filter(m => ['ML','AP','MLAP'].includes(m.name));
        let html = '';
        if (data.last_updated) {
          const d = new Date(data.last_updated);
          html += `<p class="text-xs text-slate-400 mb-3"><i class="fas fa-clock mr-1"></i>Config last updated: ${d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} ${d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</p>`;
        }
        if (plutoMechs.length > 0) {
          html += `<p class="text-xs font-semibold text-blue-600 mb-2 uppercase tracking-wide">PLUTO</p>
            <div class="grid grid-cols-3 gap-2 mb-4">
              ${plutoMechs.map(m => `<div class="p-2 bg-white rounded-lg border border-blue-100 text-center"><div class="text-xs font-bold text-slate-700">${m.name}</div><div class="text-xs text-slate-500">${m.totalDuration?.toFixed(1)||0} min</div></div>`).join('')}
            </div>`;
        }
        if (marsMechs.length > 0) {
          html += `<p class="text-xs font-semibold text-purple-600 mb-2 uppercase tracking-wide">MARS</p>
            <div class="grid grid-cols-3 gap-2">
              ${marsMechs.map(m => `<div class="p-2 bg-white rounded-lg border border-purple-100 text-center"><div class="text-xs font-bold text-slate-700">${m.name}</div><div class="text-xs text-slate-500">${m.totalDuration?.toFixed(1)||0} min</div></div>`).join('')}
            </div>`;
        }
        contEl.innerHTML = html;
      } catch(_) {
        const el = document.getElementById('overview-mechanisms-loading');
        if (el) el.innerHTML = '<p class="text-xs text-red-400 text-center py-2">Could not load mechanisms</p>';
      }
    }

    async function loadSwapWatchHistory(patientId) {
      const container = document.getElementById('swap-history-list');
      if (!container) return;
      try {
        const res = await fetch(`/swap-watch-records/${patientId}`);
        const data = await res.json();
        const swaps = data.swapWatchRecords || [];
        if (swaps.length === 0) {
          container.innerHTML = `<p class="text-xs text-slate-400 text-center py-2">No watch swaps recorded yet</p>`;
          return;
        }
        // Sort newest first
        const sorted = [...swaps].sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
        container.innerHTML = sorted.map(s => `
          <div class="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
            <div class="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <i class="fas fa-sync-alt text-amber-600 text-xs"></i>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-slate-700 break-words">${s.reason || '—'}</p>
              <p class="text-xs text-slate-400 mt-0.5">${s.date || ''}</p>
            </div>
          </div>`).join('');
      } catch (e) {
        if (container) container.innerHTML = `<p class="text-xs text-red-400 text-center py-2">Could not load history</p>`;
      }
    }

    // Devices Tab - With Charts
    async function loadDevicesTab(content) {
      const patient = selectedPatientData;

      const role = (patient.role || '').toLowerCase();
      const isControl = role === 'control';
      const isExperimental = role === 'experimental';
      
      if (isControl) {
        // Control patients - only ActiGraph data (no Pluto/Mars)
        content.innerHTML = `
          <div class="bg-slate-50 rounded-xl p-5">
            <h3 class="font-semibold text-slate-800 mb-4">ActiGraph Data</h3>
            <div id="actigraph-device-content">
              <div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div>
            </div>
          </div>`;
        loadActiGraphOnly();
      } else if (isExperimental) {
        // Experimental patients - Pluto/Mars charts + ActiGraph
        content.innerHTML = `
          <div class="mb-4 flex gap-2"> 
            <button onclick="loadDeviceChart('Pluto', event)" class="device-chart-btn px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"><i class="fas fa-robot mr-1.5"></i>PLUTO</button>
            <button onclick="loadDeviceChart('Mars', event)" class="device-chart-btn px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium"><i class="fas fa-robot mr-1.5"></i>MARS</button>
          </div>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="bg-white rounded-lg p-3">
              <h4 class="font-semibold text-slate-700 mb-2 text-sm">Device Usage Over Time</h4>
              <div class="h-64" id="deviceChartContainer"><canvas id="deviceChart"></canvas></div>
            </div>
            <div class="bg-white rounded-lg p-3">
              <h4 class="font-semibold text-slate-700 mb-2 text-sm">Mechanism-wise Duration</h4>
              <div class="h-64" id="mechChartContainer"><canvas id="mechChart"></canvas></div>
            </div>
          </div>
          <div class="mt-4 bg-slate-50 rounded-xl p-5">
            <h3 class="font-semibold text-slate-800 mb-4">ActiGraph Data</h3>
            <div id="actigraph-device-content">
              <div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div>
            </div>
          </div>`;
        
        window.currentDeviceName = 'Pluto';
        loadDeviceChart('Pluto');
        loadActiGraphForExperimental();
      } else {
        content.innerHTML = `<div class="text-center py-8 text-slate-500">Please assign this patient to a group first</div>`;
      }
    }
    
    function loadActiGraphOnly() {
      const patient = selectedPatientData;
      const container = document.getElementById('actigraph-device-content');
      if (!container) return;
      
      // Show loading state
      container.innerHTML = `
        <div class="space-y-3">
          <div class="flex justify-between items-center p-3 bg-white rounded-lg"><span class="text-slate-500">Left Hand</span><span class="text-sm text-slate-400"><i class="fas fa-circle-notch fa-spin mr-1"></i> Loading...</span></div>
          <div class="flex justify-between items-center p-3 bg-white rounded-lg"><span class="text-slate-500">Right Hand</span><span class="text-sm text-slate-400"><i class="fas fa-circle-notch fa-spin mr-1"></i> Loading...</span></div>
        </div>`;
      
      // For control patients, show simple message - no ActiGraph data
      // Simulate a quick load
      setTimeout(() => {
        container.innerHTML = `
          <div class="space-y-3">
            <div class="flex justify-between items-center p-3 bg-white rounded-lg"><span class="text-slate-500">Left Hand</span><span class="text-sm text-slate-400">No watch assigned</span></div>
            <div class="flex justify-between items-center p-3 bg-white rounded-lg"><span class="text-slate-500">Right Hand</span><span class="text-sm text-slate-400">No watch assigned</span></div>
          </div>`;
      }, 500);
    }
    
    async function fetchActiGraphData(hospitalId) {
      // For now, return empty data for control patients
      // This can be extended later to fetch actual ActiGraph data
      return { leftData: { status: 'no_data' }, rightData: { status: 'no_data' } };
    }
    
    async function loadActiGraphForExperimental() {
      loadActiGraphOnly();
    }

    let chartDataPoints = [];
    
    async function loadDeviceChart(deviceName, e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }

      // Button active state
      document.querySelectorAll('.device-chart-btn').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'bg-violet-600', 'text-white');
        btn.classList.add('bg-slate-100', 'text-slate-600');
      });
      const clickedBtn = e?.target || document.querySelector(`.device-chart-btn[onclick*="${deviceName}"]`);
      if (clickedBtn) {
        const isPluto = deviceName === 'Pluto';
        clickedBtn.classList.remove('bg-slate-100', 'text-slate-600');
        clickedBtn.classList.add(isPluto ? 'bg-blue-600' : 'bg-violet-600', 'text-white');
      }

      const patient = selectedPatientData;
      const container = document.getElementById('deviceChartContainer');
      if (!container) return;

      container.innerHTML = `<div class="h-full flex items-center justify-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>Loading...</div>`;

      try {
        const response = await fetch(`/chart-data/${patient.HospitalID}/${deviceName}`);
        const chartData = await response.json();

        if (chartData.error || !chartData.labels || chartData.labels.length === 0) {
          container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
              <i class="fas fa-chart-area text-4xl opacity-30"></i>
              <p class="text-sm">No data recorded yet for ${deviceName.toUpperCase()}</p>
            </div>`;
          return;
        }

        // Restore canvas (container.innerHTML was replaced above)
        container.innerHTML = '<canvas id="deviceChart"></canvas>';

        const labels      = chartData.labels || [];
        const lineData    = chartData.datasets?.[0]?.data || [];
        const bubbleData  = chartData.datasets?.[1]?.data || [];
        const targetValue = deviceName === 'Pluto' ? 60 : 30;
        const isPluto     = deviceName === 'Pluto';
        const accentColor = isPluto ? '#3b82f6' : '#8b5cf6';
        const accentRgb   = isPluto ? '59,130,246' : '139,92,246';

        chartDataPoints = bubbleData.map(p => ({ date: p.x, sessionDuration: p.y }));
        window.storedChartData = chartData;
        window.currentDeviceName = deviceName;

        if (window.patientDeviceChart) { window.patientDeviceChart.destroy(); }

        const ctx = document.getElementById('deviceChart').getContext('2d');

        // Gradient fill
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, `rgba(${accentRgb},0.30)`);
        grad.addColorStop(0.6, `rgba(${accentRgb},0.08)`);
        grad.addColorStop(1,   `rgba(${accentRgb},0.00)`);

        window.patientDeviceChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Session (min)',
                data: lineData,
                borderColor: accentColor,
                backgroundColor: grad,
                fill: true,
                tension: 0.42,
                pointRadius: labels.length > 20 ? 0 : 4,
                pointHoverRadius: 6,
                pointBackgroundColor: accentColor,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                borderWidth: 2.5,
                spanGaps: false,   // null = no line drawn for future dates
                order: 1,
              },
              {
                label: `Target (${targetValue} min)`,
                data: labels.map((_, i) => lineData[i] !== null ? targetValue : null),
                borderColor: '#f43f5e',
                borderWidth: 1.5,
                borderDash: [6, 4],
                pointRadius: 0,
                fill: false,
                tension: 0,
                spanGaps: false,
                order: 2,
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: {
                display: true,
                position: 'top',
                align: 'end',
                labels: {
                  boxWidth: 12, boxHeight: 12,
                  color: '#64748b', font: { size: 11 },
                  usePointStyle: true,
                }
              },
              tooltip: {
                backgroundColor: '#1e293b',
                titleColor: '#94a3b8',
                bodyColor: '#f1f5f9',
                padding: 10, cornerRadius: 8,
                filter: item => item.parsed.y !== null,
                callbacks: {
                  title: items => {
                    const d = new Date(items[0].label);
                    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                  },
                  label: ctx => ctx.parsed.y !== null ? ` ${ctx.dataset.label}: ${ctx.parsed.y} min` : null
                }
              }
            },
            scales: {
              x: {
                grid: { color: 'rgba(148,163,184,0.08)', drawBorder: false },
                ticks: {
                  color: '#94a3b8', font: { size: 10 },
                  maxTicksLimit: 10, maxRotation: 45,
                  callback: function(val, idx) {
                    const d = new Date(this.getLabelForValue(val));
                    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                  }
                }
              },
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(148,163,184,0.12)', drawBorder: false },
                ticks: {
                  color: '#94a3b8', font: { size: 10 },
                  callback: v => v + ' min'
                }
              }
            },
            onClick(event, elements) {
              if (!elements.length) return;
              const idx = elements[0].index;
              const mechChartDiv = document.getElementById('mechChartContainer');
              if (mechChartDiv) mechChartDiv.style.display = 'block';
              if (idx >= 0 && idx < chartDataPoints.length) {
                const d = chartDataPoints[idx].date;
                const parts = d.split('-');
                const formatted = `${parts[2]}-${parts[1]}-${parts[0]}`;
                fetchMechanismData(patient.HospitalID, formatted, deviceName);
              }
            }
          }
        });

      } catch (error) {
        console.error('Error loading chart:', error);
        container.innerHTML = `<div class="h-full flex items-center justify-center text-red-400 text-sm">Error loading chart data</div>`;
      }
    }
    
    function showEmptyMechChart(deviceName) {
      const ctx = document.getElementById('mechChart').getContext('2d');
      if (window.mechChart) window.mechChart.destroy();
      
      const mechanisms = deviceName === 'pluto' 
        ? ['MEC1', 'MEC2', 'MEC3', 'MEC4', 'FME1', 'FME2']
        : ['Forearm', 'UpperArm', 'Rotation'];
      
      window.mechChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: mechanisms,
          datasets: [{
            label: 'Game Duration',
            data: [0, 0, 0, 0, 0, 0],
            backgroundColor: [
              'rgba(255, 99, 132, 0.7)',
              'rgba(255, 159, 64, 0.7)',
              'rgba(160, 32, 230, 0.7)',
              'rgba(75, 192, 192, 0.7)',
              'rgba(75, 112, 192, 0.7)',
              'rgba(175, 192, 192, 0.7)'
            ]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: 'Click on a date to see mechanism details',
              font: { size: 14 }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 50,
              title: { display: true, text: 'Duration (mins)' }
            }
          }
        }
      });
    }
    
    async function fetchMechanismData(hospitalID, selectedDate, deviceName) {
      console.log('>>> fetchMechanismData START', hospitalID, selectedDate, deviceName);
      console.log('>>> fetchMechanismData END');
      console.log('fetchMechanismData called:', hospitalID, selectedDate, deviceName);
      try {
        // Use 3 params including device name
        const response = await fetch(`/fetch-mechanism-data/${hospitalID}/${selectedDate}/${deviceName}`);
        const data = await response.json();
        
        console.log('Mechanism data response:', data);
        
        if (data.error) {
          console.error('Error:', data.error);
          return;
        }
        
        displayMechanismChart(data, deviceName);
      } catch (error) {
        console.error('Error fetching mechanism data:', error);
      }
    }
    
    function displayMechanismChart(data, deviceName) {
      console.log('>>> displayMechanismChart called', data);
      
      // Ensure container is visible
      const mechContainer = document.getElementById('mechChartContainer');
      const mechCanvas = document.getElementById('mechChart');
      console.log('Container:', mechContainer, 'Canvas:', mechCanvas);
      
      if (!mechCanvas) {
        console.error('Canvas element not found!');
        return;
      }
      
      const ctx = mechCanvas.getContext('2d');
      if (window.mechChart && typeof window.mechChart.destroy === 'function') {
        window.mechChart.destroy();
        console.log('Old chart destroyed');
      }
      
      const threshold = deviceName.toLowerCase().includes('pluto') ? 60 : 30;
      const mechanisms = data.mechanisms || [];
      const durations = data.durations || [];
      const thresholdLines = data.lines || [];
      
      console.log('Mechanisms:', mechanisms);
      console.log('Durations:', durations);
      console.log('Threshold lines:', thresholdLines);
      
      const fixedColors = [
        "rgba(255, 99, 132, 0.7)",
        "rgba(255, 159, 64, 0.7)",
        "rgba(160, 32, 230, 0.7)",
        "rgba(75, 192, 192, 0.7)",
        "rgba(75, 112, 192, 0.7)",
        "rgba(175, 192, 192, 0.7)"
      ];
      
      // Custom plugin for horizontal threshold lines
      const thresholdPlugin = {
        id: 'thresholdLines',
        afterDatasetsDraw: (chart) => {
          const ctx = chart.ctx;
          const yScale = chart.scales.y;
          const meta = chart.getDatasetMeta(0);
          
          thresholdLines.forEach((threshold, index) => {
            if (index >= meta.data.length) return;
            const bar = meta.data[index];
            const y = yScale.getPixelForValue(threshold);
            const barCenterX = bar.x;
            const barWidth = bar.width || 20;
            
            const leftX = barCenterX - barWidth / 2 + 2;
            const rightX = barCenterX + barWidth / 2 - 2;
            
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(leftX, y);
            ctx.lineTo(rightX, y);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
          });
        }
      };
      
      try {
        window.mechChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: mechanisms,
            datasets: [{
              label: 'Game Duration (mins)',
              data: durations.map(d => parseFloat(d.toFixed(3))),
              backgroundColor: fixedColors,
              borderColor: fixedColors.map(c => c.replace('0.7', '1')),
              borderWidth: 1,
              borderRadius: 5,
            }]
          },
          plugins: [ChartDataLabels, thresholdPlugin],
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { 
                display: true, 
                position: 'bottom',
                labels: { usePointStyle: true, padding: 15 }
              },
              title: {
                display: true,
                text: 'Mechanism-wise Usage Duration',
                font: { size: 16, weight: 'bold' },
                color: '#333',
                padding: 15
              },
              tooltip: {
                enabled: true,
                backgroundColor: 'rgba(0,0,0,0.8)',
                titleColor: '#fff',
                bodyColor: '#fff',
                padding: 10,
                cornerRadius: 5,
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { display: false },
                ticks: { color: '#666', font: { size: 10 } },
              },
              x: {
                grid: { display: false },
                ticks: { color: '#666', font: { size: 10 } }
              }
            }
          }
        });
        console.log('Mechanism chart created successfully');
      } catch (e) {
        console.error('Error creating mechanism chart:', e);
      }
    }
    

    // ============================================================
    // SWAP WATCH — from overview tab
    // ============================================================
    function showSwapWatchModal(patientId) {
      const modalHtml = `
        <div id="swap-watch-modal" class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div class="flex items-center justify-between mb-5">
              <div class="flex items-center gap-2">
                <div class="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                  <i class="fas fa-sync-alt text-amber-600"></i>
                </div>
                <h3 class="text-lg font-bold text-slate-800">Log Watch Swap</h3>
              </div>
              <button onclick="document.getElementById('swap-watch-modal').remove()" class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Swap Date</label>
                <input type="date" id="swap-watch-date" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Reason for Watch Swap</label>
                <textarea id="swap-watch-reason" rows="3" placeholder="e.g. Battery low, strap damaged…"
                  class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"></textarea>
              </div>
              <div class="flex gap-3 pt-1">
                <button onclick="document.getElementById('swap-watch-modal').remove()" class="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-medium">Cancel</button>
                <button onclick="saveSwapWatch('${patientId}')" id="swap-watch-save-btn" class="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 text-sm font-medium">Save</button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      document.getElementById('swap-watch-date').valueAsDate = new Date();
    }

    async function saveSwapWatch(patientId) {
      const reason = document.getElementById('swap-watch-reason').value.trim();
      const date = document.getElementById('swap-watch-date').value;
      if (!reason) { showToast('Please enter a reason', 'error'); return; }
      const btn = document.getElementById('swap-watch-save-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      try {
        const swapDate = new Date(date);
        const res = await fetch('/add-swap-watch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            homerID: patientId,
            swapWatchRecord: { date, reason, timestamp: new Date().toISOString() }
          })
        });
        const data = await res.json();
        if (data.success) {
          // Change 5: Adjust next watch-related timeline event to swapDate + 14 days
          try {
            const tlRes = await fetch(`/patient_events/get_timeline/${patientId}`);
            const tlData = await tlRes.json();
            const tlEvents = tlData.events || [];
            const watchEvent = tlEvents.find(e =>
              (e.eventName || '').toLowerCase().includes('watch') &&
              e.status !== 'completed' &&
              new Date(e.scheduledDate) >= swapDate
            );
            if (watchEvent) {
              const newDate = new Date(swapDate);
              newDate.setDate(newDate.getDate() + 14);
              await fetch('/patient_events/update_event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  patientId: patientId,
                  id: watchEvent.id,
                  scheduledDate: newDate.toISOString().split('T')[0],
                  notes: (watchEvent.notes ? watchEvent.notes + ' | ' : '') + 'Rescheduled: +14 days from watch swap on ' + date
                })
              });
            }
          } catch(_) { /* non-fatal */ }
          document.getElementById('swap-watch-modal').remove();
          showToast('Watch swap logged');
          const detailContent = document.getElementById('detail-content');
          if (detailContent) {
            loadTimelineTab(detailContent);
          }
          if (typeof logActivity === 'function') {
            logActivity('LOGGED_WATCH_SWAP', { 
              patient_id: patientId,
              reason: reason,
              date: date
            });
          }
        } else {
          showToast(data.error || 'Failed to save', 'error');
          if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
        }
      } catch (err) {
        showToast('Network error', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
      }
    }

    // ============================================================
    // DISCONTINUE PATIENT
    // ============================================================
    function toggleDiscontinueMenu(patientId) {
      const menu = document.getElementById(`discontinue-menu-${patientId}`);
      if (menu) menu.classList.toggle('hidden');
    }

    function showDiscontinueModal(patientId) {
      // Close the toggle menu
      const menu = document.getElementById(`discontinue-menu-${patientId}`);
      if (menu) menu.classList.add('hidden');

      const modalHtml = `
        <div id="discontinue-modal" class="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border-2 border-red-200">
            <div class="flex items-center gap-3 mb-5">
              <div class="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <i class="fas fa-user-slash text-red-600 text-lg"></i>
              </div>
              <div>
                <h3 class="text-lg font-bold text-slate-800">Discontinue Patient</h3>
                <p class="text-sm text-red-600">This action cannot be undone</p>
              </div>
              <button onclick="document.getElementById('discontinue-modal').remove()" class="ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Reason <span class="text-red-500">*</span></label>
                  <select id="discontinue-reason" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent">
                    <option value="">Select reason…</option>
                    <option value="Patient withdrawn">Patient withdrawn</option>
                    <option value="Adverse event">Adverse event</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Discontinue Date <span class="text-red-500">*</span></label>
                  <input type="date" id="discontinue-date" class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent">
                </div>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Notes</label>
                <textarea id="discontinue-notes" rows="3" placeholder="Additional details…"
                  class="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"></textarea>
              </div>
              <div class="bg-slate-50 rounded-xl p-3">
                <label class="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide"><i class="fas fa-paperclip mr-1"></i>Attach Document (PDF, optional)</label>
                <input type="file" id="discontinue-pdf" accept=".pdf" class="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-red-50 file:text-red-700 file:text-xs file:font-medium file:cursor-pointer hover:file:bg-red-100">
              </div>
              <div class="bg-red-50 border border-red-200 rounded-xl p-3">
                <p class="text-xs text-red-700"><i class="fas fa-exclamation-triangle mr-1.5"></i>After discontinuation, this patient's data will be read-only and cannot be edited.</p>
              </div>
              <div class="flex gap-3 pt-1">
                <button onclick="document.getElementById('discontinue-modal').remove()" class="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-medium">Cancel</button>
                <button onclick="confirmDiscontinue('${patientId}')" id="discontinue-save-btn" class="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-medium">Discontinue</button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      // Default date to today
      const discontinueDateEl = document.getElementById('discontinue-date');
      if (discontinueDateEl) discontinueDateEl.valueAsDate = new Date();
    }

    async function confirmDiscontinue(patientId) {
      const reason = document.getElementById('discontinue-reason').value;
      const notes = document.getElementById('discontinue-notes').value.trim();
      const discontinueDate = document.getElementById('discontinue-date').value;
      if (!reason) { showToast('Please select a reason', 'error'); return; }
      if (!discontinueDate) { showToast('Please enter the discontinue date', 'error'); return; }
      if (!confirm(`Are you sure you want to discontinue patient ${patientId}? This cannot be undone.`)) return;

      const btn = document.getElementById('discontinue-save-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

      const formData = new FormData();
      formData.append('patientId', patientId);
      formData.append('reason', reason);
      formData.append('notes', notes);
      formData.append('discontinueDate', discontinueDate);
      const pdf = document.getElementById('discontinue-pdf')?.files[0];
      if (pdf) formData.append('pdfFile', pdf);

      try {
        const res = await fetch('/patient_events/discontinue_patient', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.status === 'success') {
          document.getElementById('discontinue-modal').remove();
          // Update local data
          const pt = allPatients.find(p => p.HospitalID === patientId);
          if (pt) {
            pt.discontinued = true;
            pt.discontinueReason = reason;
            pt.discontinueDate = discontinueDate;
          }
          if (selectedPatientData && selectedPatientData.HospitalID === patientId) {
            selectedPatientData.discontinued = true;
            selectedPatientData.discontinueReason = reason;
            selectedPatientData.discontinueDate = discontinueDate;
          }
          showToast('Patient discontinued');
          // Reload the overview to show the discontinued banner
          await loadOverviewTab(document.getElementById('detail-content'));
          // Refresh patient list
          loadPatients();
          if (typeof logActivity === 'function') {
            logActivity('DISCONTINUED_PATIENT', { 
              patient_id: patientId,
              reason: reason,
              notes: notes,
              discontinue_date: discontinueDate
            });
          }
        } else {
          showToast(data.message || 'Failed', 'error');
          if (btn) { btn.disabled = false; btn.textContent = 'Discontinue'; }
        }
      } catch (err) {
        showToast('Network error', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Discontinue'; }
      }
    }