/* ============================================================
   dashboard.js — Home view: stats, upcoming/overdue events, loadPatients/loadDevices/loadSimCount stubs
   HOMER Clinical Dashboard
   ============================================================ */

    function initPage() {
      loadDashboard();
      loadEvents();
    }

    // Dashboard Data
    async function loadDashboard() {
      try {
        const response = await fetch('/api/dashboard/stats');
        if (!response.ok) throw new Error('Failed to load stats');
        const stats = await response.json();
        document.getElementById('stat-total').textContent              = stats.total;
        document.getElementById('stat-experimental').textContent       = stats.experimental;
        document.getElementById('stat-control').textContent            = stats.control;
        document.getElementById('stat-unassigned').textContent         = stats.unassigned;
        document.getElementById('stat-inactive').textContent           = stats.inactive;
        document.getElementById('stat-active').textContent             = stats.active;
        document.getElementById('stat-active-partial').textContent     = stats.active_partial;
        document.getElementById('stat-training-completed').textContent = stats.training_completed;
        document.getElementById('stat-a1-completed').textContent       = stats.a1_completed;
        document.getElementById('stat-all-completed').textContent      = stats.all_completed;
        document.getElementById('stat-broken-protocol').textContent    = stats.broken_protocol;
        document.getElementById('stat-discontinued').textContent       = stats.discontinued;
      } catch (error) {
        console.error('Error loading dashboard stats:', error);
      }
    }

    async function loadEvents() {
      const overdueEl  = document.getElementById('overdue-events');
      const upcomingEl = document.getElementById('upcoming-events');
      try {
        const res = await fetch('/api/dashboard/events');
        if (!res.ok) throw new Error('Failed to load events');
        const { overdue, upcoming } = await res.json();

        document.getElementById('overdue-count').textContent  = overdue.length;
        document.getElementById('upcoming-count').textContent = upcoming.length;

        overdueEl.innerHTML  = overdue.length  ? overdue.map(eventRow).join('')  : emptyState('check-circle', 'text-green-500', 'All clear — no overdue events');
        upcomingEl.innerHTML = upcoming.length ? upcoming.map(eventRow).join('') : emptyState('calendar-check', 'text-slate-400', 'No events in the next 7 days');
      } catch (e) {
        console.error('Error loading events:', e);
        overdueEl.innerHTML  = '<p class="text-sm text-red-500 text-center py-4">Error loading events</p>';
        upcomingEl.innerHTML = '<p class="text-sm text-red-500 text-center py-4">Error loading events</p>';
      }
    }

    function eventRow(ev) {
      const d = new Date(ev.scheduled_date);
      const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      const isOverdue = ev.days < 0;
      const abs = Math.abs(ev.days);
      const whenLabel = ev.days === 0 ? 'Today'
                      : isOverdue    ? `${abs}d overdue`
                      : ev.days === 1 ? 'Tomorrow'
                      : `In ${ev.days} days`;
      const urgency   = isOverdue ? 'border-red-200 bg-red-50'
                      : ev.days === 0 ? 'border-red-200 bg-red-50'
                      : ev.days <= 2  ? 'border-orange-200 bg-orange-50'
                      : 'border-slate-100 bg-slate-50';
      const textColor = (isOverdue || ev.days === 0) ? 'text-red-600'
                      : ev.days <= 2 ? 'text-orange-600' : 'text-slate-500';
      return `
        <a href="/patients/${ev.homer_id}" class="flex items-center justify-between px-3 py-2.5 rounded-xl border ${urgency} gap-3 hover:opacity-80 transition-opacity">
          <div class="min-w-0">
            <div class="font-medium text-slate-800 text-sm truncate">${ev.event_name}</div>
            <div class="text-xs text-slate-500 mt-0.5">${ev.homer_id} · ${dateStr}</div>
          </div>
          <div class="flex-shrink-0">
            <span class="text-xs font-semibold ${textColor} whitespace-nowrap">${whenLabel}</span>
          </div>
        </a>`;
    }

    function emptyState(icon, colorClass, msg) {
      return `<div class="flex flex-col items-center justify-center py-8 ${colorClass}"><i class="fas fa-${icon} text-2xl mb-2"></i><p class="text-sm">${msg}</p></div>`;
    }

    async function loadUpcomingOverdueEvents() {
      try {
        const response = await fetch('/patient_events/get_all_events');
        const data = await response.json();
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const upcomingEvents = [];
        const overdueEvents = [];
        
        if (data.timelineEvents) {
          data.timelineEvents.forEach(event => {
            const eventDate = new Date(event.scheduledDate);
            eventDate.setHours(0, 0, 0, 0);
            
            const diffDays = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24));
            
            if (event.status !== 'completed') {
              if (diffDays >= 0 && diffDays <= 7) {
                upcomingEvents.push({ ...event, diffDays });
              } else if (diffDays < 0) {
                overdueEvents.push({ ...event, diffDays: Math.abs(diffDays) });
              }
            }
          });
        }
        
        // Sort by date
        upcomingEvents.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate));
        overdueEvents.sort((a, b) => new Date(b.scheduledDate) - new Date(a.scheduledDate));
        
        // Display upcoming events
        const upcomingDiv = document.getElementById('upcoming-events');
        document.getElementById('upcoming-count').textContent = upcomingEvents.length;
        
        if (upcomingEvents.length === 0) {
          upcomingDiv.innerHTML = '<div class="flex flex-col items-center justify-center py-10 text-slate-400"><i class="fas fa-calendar-check text-3xl mb-2"></i><p class="text-sm">No upcoming events in the next 7 days</p></div>';
        } else {
          upcomingDiv.innerHTML = upcomingEvents.map(event => {
            const whenLabel = event.diffDays === 0 ? 'Today' : event.diffDays === 1 ? 'Tomorrow' : `In ${event.diffDays} days`;
            const urgency = event.diffDays === 0 ? 'border-red-300 bg-red-50' : event.diffDays <= 2 ? 'border-orange-300 bg-orange-50' : 'border-orange-100 bg-orange-50';
            const textColor = event.diffDays === 0 ? 'text-red-600' : 'text-orange-600';
            return `
              <div class="flex items-center justify-between px-4 py-3 rounded-xl border ${urgency} gap-3">
                <div class="min-w-0">
                  <div class="font-medium text-slate-800 text-sm truncate">${event.eventName}</div>
                  <div class="text-xs text-slate-500 mt-0.5">${event.patientId} · ${new Date(event.scheduledDate).toLocaleDateString('en-GB', {day:'2-digit',month:'short'})}</div>
                </div>
                <div class="flex-shrink-0 text-right">
                  <span class="text-xs font-semibold ${textColor} whitespace-nowrap">${whenLabel}</span>
                </div>
              </div>`;
          }).join('');
        }
        
        // Display overdue events
        const overdueDiv = document.getElementById('overdue-events');
        document.getElementById('overdue-count').textContent = overdueEvents.length;
        
        if (overdueEvents.length === 0) {
          overdueDiv.innerHTML = '<div class="flex flex-col items-center justify-center py-10 text-green-500"><i class="fas fa-check-circle text-3xl mb-2"></i><p class="text-sm font-medium">All clear — no overdue events</p></div>';
        } else {
          overdueDiv.innerHTML = overdueEvents.map(event => `
            <div class="flex items-center justify-between px-4 py-3 rounded-xl border border-red-200 bg-red-50 gap-3">
              <div class="min-w-0">
                <div class="font-medium text-slate-800 text-sm truncate">${event.eventName}</div>
                <div class="text-xs text-slate-500 mt-0.5">${event.patientId} · ${new Date(event.scheduledDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</div>
              </div>
              <div class="flex-shrink-0">
                <span class="text-xs font-semibold text-red-600 whitespace-nowrap">${event.diffDays}d overdue</span>
              </div>
            </div>`).join('');
        }

        // Append SIM card expiry reminders to upcoming events panel
        try {
          const simRes = await fetch('/sim_cards/reminders');
          const simData = await simRes.json();
          const expiringSims = (simData.reminders || []).filter(s => !s.isExpired && s.daysUntilExpiry >= 0);
          if (expiringSims.length > 0) {
            const simHtml = expiringSims.map(s => {
              const whenLabel = s.daysUntilExpiry === 0 ? 'Today' : s.daysUntilExpiry === 1 ? 'Tomorrow' : `In ${s.daysUntilExpiry} days`;
              const urgency = s.daysUntilExpiry <= 1 ? 'border-red-300 bg-red-50' : 'border-orange-100 bg-orange-50';
              const textColor = s.daysUntilExpiry <= 1 ? 'text-red-600' : 'text-orange-600';
              const modemLabel = s.modemSerial ? ` · Modem: ${s.modemSerial}` : '';
              return `
                <div class="flex items-center justify-between px-4 py-3 rounded-xl border ${urgency} gap-3">
                  <div class="min-w-0">
                    <div class="font-medium text-slate-800 text-sm truncate"><i class="fas fa-sim-card mr-1.5 text-green-600"></i>SIM Expiring — ${s.phoneNumber || '—'}</div>
                    <div class="text-xs text-slate-500 mt-0.5">${s.network || ''}${modemLabel} · Expires ${new Date(s.expiryDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}</div>
                  </div>
                  <div class="flex-shrink-0">
                    <span class="text-xs font-semibold ${textColor} whitespace-nowrap">${whenLabel}</span>
                  </div>
                </div>`;
            }).join('');
            const upcomingDiv2 = document.getElementById('upcoming-events');
            if (upcomingDiv2.querySelector('.flex-col.items-center')) {
              // Was showing "no events" — replace with sim reminders
              upcomingDiv2.innerHTML = simHtml;
            } else {
              upcomingDiv2.innerHTML += simHtml;
            }
            document.getElementById('upcoming-count').textContent = upcomingEvents.length + expiringSims.length;
          }
        } catch(e) { /* SIM reminders optional */ }
        
      } catch (error) {
        console.error('Error loading events:', error);
        document.getElementById('upcoming-events').innerHTML = '<p class="text-sm text-red-500 text-center py-4">Error loading events</p>';
        document.getElementById('overdue-events').innerHTML = '<p class="text-sm text-red-500 text-center py-4">Error loading events</p>';
      }
    }

    // Patients
    async function loadPatients() {
      const patientList = document.getElementById('patient-list');
      patientList.innerHTML = '<div class="text-center py-12 text-slate-500"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
      try {
        const response = await fetch('/get_userId', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `search_term=Pluto&LoginId=${currentUser.loginId}&PRIVILEGE=${currentUser.privilege}` });
        const data = await response.json();
        
        // Handle different response formats
        if (data.hospital_info && Array.isArray(data.hospital_info)) {
          allPatients = data.hospital_info;
        } else if (Array.isArray(data)) {
          allPatients = data;
        } else if (data.patients && Array.isArray(data.patients)) {
          allPatients = data.patients;
        } else {
          allPatients = [];
        }
        
        // Reset all filter buttons cleanly
        currentFilter = 'active';
        document.querySelectorAll('.filter-btn').forEach(btn => {
          btn.classList.remove('from-blue-500', 'to-blue-600', 'text-white', 'shadow-md', 'shadow-blue-200',
            'bg-red-500', 'bg-red-100', 'text-red-700', 'text-red-500',
            'from-emerald-500', 'to-teal-600', 'shadow-emerald-200',
            'from-orange-500', 'to-orange-600', 'shadow-orange-200');
          const isDropped = btn.id === 'filter-dropped';
          btn.classList.add('bg-white', isDropped ? 'text-red-500' : 'text-slate-600',
            'border', isDropped ? 'border-red-200' : 'border-slate-200', 'shadow-sm');
        });
        // Set "Active" as active
        const activeBtn = document.querySelector('[data-filter="active"]');
        if (activeBtn) {
          activeBtn.classList.remove('bg-white', 'text-slate-600', 'text-red-500', 'text-emerald-600',
            'border', 'border-slate-200', 'border-red-200', 'border-emerald-200', 'shadow-sm');
          activeBtn.classList.add('bg-gradient-to-r', 'from-blue-500', 'to-blue-600', 'text-white', 'shadow-md', 'shadow-blue-200');
        }
        
        // Load dropped out patients
        await loadDroppedOutPatients();
        
        updateFilterCounts();
        renderPatients();
      } catch (error) { 
        console.error('Error loading patients:', error);
        patientList.innerHTML = '<div class="text-center py-12 text-red-500">Error loading patients</div>'; 
      }
    }