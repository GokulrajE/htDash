/* ============================================================
   app.js — Global state, auth, session restore, navigation, logout, sidebar toggle
   HOMER Clinical Dashboard
   ============================================================ */

    // Global State
    let currentUser = null;
    let currentPage = 'dashboard';
    let allPatients = [];
    let currentFilter = 'active';
    let droppedOutPatients = new Set();      // Track patients who have dropped out
    let trialCompletedPatients = new Set(); // Track patients whose trial is fully complete
    let selectedPatientData = null;
    let exercisesData = {};
    let currentExercisesPage = 'overview';
    let selectedExercises = [];
    let allDeviceSets = [];   // Cached device sets for assignment filtering
    let allWatches = [];      // Cached watches for assignment filtering

    // Initialize - with error handling
    document.addEventListener('DOMContentLoaded', () => {
      try {
        checkAuth();
      } catch(e) {
        console.error('Auth error:', e);
      }
      // Defer loading for faster initial render
      setTimeout(() => {
        try {
          loadExercisesData();
          loadDashboard();
        } catch(e) {
          console.error('Load error:', e);
        }
      }, 100);
    });

    // Silently restore Flask server session from stored credentials.
    // Called on every page load — handles server restarts which wipe server-side sessions
    // while the user's localStorage still has their login info.
    async function restoreServerSession(loginId) {
      try {
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        // We don't store passwords in localStorage (correctly), so we use /get_userId
        // which also re-sets current_session.login_place from the LoginId.
        // A lightweight ping using the existing endpoint is sufficient.
        await fetch('/get_userId', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `search_term=Pluto&LoginId=${loginId}&PRIVILEGE=${stored.privilege || 'user'}`
        });
      } catch(e) {
        // Non-fatal — if this fails, individual save routes will return 401 and user sees an error
        console.warn('Session restore failed:', e);
      }
    }

    function checkAuth() {
      const userStr = localStorage.getItem('user');
      if (!userStr) { window.location.href = '/login'; return; }
      currentUser = JSON.parse(userStr);
      updateUserInfo();
      // Restore Flask server-side session (lost on server restart)
      restoreServerSession(currentUser.loginId);
    }

    function updateUserInfo() {
      if (currentUser) {
        document.getElementById('user-initials').textContent = currentUser.loginId.slice(0, 2).toUpperCase();
        document.getElementById('user-name').textContent = currentUser.loginId;
        document.getElementById('user-place').textContent = `${currentUser.place} • ${currentUser.privilege}`;
        document.getElementById('location-name').textContent = currentUser.place;
        document.getElementById('location-privilege').textContent = currentUser.privilege === 'admin' ? 'Full Administrative Access' : 'Site Access';
        if (currentUser.privilege === 'admin') {
          document.getElementById('add-patient-btn').classList.remove('hidden');
          document.getElementById('filter-unassigned').classList.remove('hidden');
        }
      }
    }

    // Load Exercises Data
    async function loadExercisesData() {
      try {
        const response = await fetch('/static/data/exercises_data.json');
        exercisesData = await response.json();
      } catch (error) {
        console.error('Error loading exercises:', error);
      }
    }

    // Navigation
    function navigate(page) {
      // Close patient detail modal if open
      const patientModal = document.getElementById('patient-detail-modal');
      if (patientModal && !patientModal.classList.contains('hidden')) {
        patientModal.classList.add('hidden');
        selectedPatientData = null;
      }
      
      document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
      document.getElementById(`nav-${page}`).classList.add('active');
      document.querySelectorAll('[id^="content-"]').forEach(el => el.classList.add('hidden'));
      const target = document.getElementById(`content-${page}`);
      target.classList.remove('hidden');
      
      const titles = {
        'dashboard': { title: 'Dashboard', subtitle: 'Overview' },
        'patients': { title: 'Patients', subtitle: 'Manage patients' },
        'devices': { title: 'Device Management', subtitle: 'Manage devices and watches' },
        'sims': { title: 'SIM Cards', subtitle: 'Manage SIM cards' }
      };
      document.getElementById('page-title').textContent = titles[page].title;
      document.getElementById('page-subtitle').textContent = titles[page].subtitle;
      currentPage = page;
      if (page === 'patients') {
        loadPatients();
        logActivity('VIEWED_PATIENTS');
      } else if (page === 'devices') {
        loadDevicesPage();
        logActivity('VIEWED_DEVICES');
      } else if (page === 'sims') {
        loadSimsPage();
        logActivity('VIEWED_SIMS');
      } else if (page === 'dashboard') {
        logActivity('VIEWED_DASHBOARD');
      }
      const sidebar = document.getElementById('sidebar');
      if (window.innerWidth < 1024) { sidebar.classList.add('-translate-x-full'); document.getElementById('sidebar-overlay').classList.add('hidden'); }
    }

    function logout() {
      localStorage.removeItem('user');
      // Also clear server-side Flask session so the next login starts clean
      fetch('/logout', { method: 'POST' }).finally(() => {
        window.location.href = '/login';
      });
    }

    // ============================================================
    // Activity Logging Utility
    // Logs all user activities to the backend for tracking
    // ============================================================
    async function logActivity(action, details = null) {
      if (!currentUser || !currentUser.loginId) return;
      
      const activityData = {
        user_id: currentUser.loginId,
        action: action,
        details: details
      };
      
      try {
        await fetch('/track-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(activityData)
        });
      } catch (e) {
        console.warn('Activity log failed:', e);
      }
    }

    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar'), overlay = document.getElementById('sidebar-overlay');
      if (sidebar.classList.contains('-translate-x-full')) { sidebar.classList.remove('-translate-x-full'); overlay.classList.remove('hidden'); }
      else { sidebar.classList.add('-translate-x-full'); overlay.classList.add('hidden'); }
    }