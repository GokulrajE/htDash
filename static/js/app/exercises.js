/* ============================================================
   exercises.js — Exercise pickers (ADL/VCG), print, assign group, activate patient, create patient, toast, refresh
   HOMER Clinical Dashboard
   ============================================================ */

    // ADL Modal Functions
    async function showAdlModal() {
      const modal = document.getElementById('adl-modal');
      if (!modal) return;
      
      modal.classList.remove('hidden');
      
      // Sync with current prescription if empty - allow adding more
      if (!selectedAdlExercises || selectedAdlExercises.length === 0) {
        if (currentAdlPrescription && currentAdlPrescription.length > 0) {
          selectedAdlExercises = [...currentAdlPrescription];
        } else {
          selectedAdlExercises = [];
        }
      }
      
      // Hide categories panel and show all exercises
      const categoriesDiv = document.getElementById('adl-categories');
      categoriesDiv.classList.add('hidden');
      // Make exercises take full width
      const exercisesDiv = document.getElementById('adl-exercises');
      exercisesDiv.classList.remove('w-2/3');
      exercisesDiv.classList.add('w-full');
      
      const exerciseContainer = document.getElementById('adl-exercises');
      exerciseContainer.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-blue-600"></i><p class="text-slate-500 mt-2">Loading exercises...</p></div>';
      
      try {
        // Use optimized endpoint to get all exercises at once
        const response = await fetch('/adl/get_all_adl_exercises');
        console.log('ADL exercises response:', response.status);
        
        if (!response.ok) {
          throw new Error('Failed to load ADL exercises: ' + response.status);
        }
        
        const data = await response.json();
        console.log('ADL exercises data:', data);
        
        if (data.status === 'success' && data.exercises && data.exercises.length > 0) {
          // Store in cache for re-rendering
          allAdlExercisesCache = data.exercises;
          renderAllAdlExercises(data.exercises);
        } else {
          exerciseContainer.innerHTML = '<div class="text-center py-8 text-slate-500">No exercises available</div>';
        }
        updateAdlSelectedPreview();
      } catch (error) {
        console.error('Error loading ADL exercises:', error);
        exerciseContainer.innerHTML = `<div class="text-center py-8 text-red-500">Error loading exercises: ${error.message}</div>`;
      }
    }

    function renderAllAdlExercises(exercises) {
      const container = document.getElementById('adl-exercises');
      if (!container) return;
      
      if (!exercises || exercises.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-slate-500">No exercises available</div>';
        return;
      }
      
      let html = '';
      exercises.forEach((ex) => {
        const isSelected = selectedAdlExercises.some(s => s.id === ex.id);
        html += `
        <div class="p-4 rounded-lg border mb-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-blue-500' : 'bg-white border-slate-200 hover:border-blue-300'}" onclick="openAdlDosageModal('${ex.id}', '${ex.short_name}', '${ex.full_name}', ${ex.default_sets || 3}, ${ex.default_reps || 10})">
          <div class="flex justify-between items-center">
            <div>
              <p class="font-semibold text-slate-800">${ex.short_name}</p>
              <p class="text-sm text-slate-500">${ex.full_name}</p>
              <p class="text-xs text-orange-600 mt-1">Default: ${ex.default_sets || 3} sets × ${ex.default_reps || 10} reps</p>
            </div>
            <span class="w-8 h-8 ${isSelected ? 'bg-blue-500' : 'bg-green-500'} text-white rounded-full flex items-center justify-center">
              ${isSelected ? '<i class="fas fa-check"></i>' : '+'}
            </span>
          </div>
        </div>`;
      });
      
      container.innerHTML = html;
    }

    function renderAdlCategories(categories) {
      const container = document.getElementById('adl-categories');
      if (!container) return;
      
      container.innerHTML = categories.map(cat => `
        <button onclick="loadAdlExercises('${cat}')" class="adl-category-btn w-full text-left px-4 py-3 rounded-lg mb-2 hover:bg-blue-50 text-sm font-medium text-slate-700 transition-colors">
          ${cat.replace('_', ' ').toUpperCase()}
        </button>
      `).join('');
    }

    async function loadAdlExercises(category) {
      try {
        const response = await fetch(`/adl/get_adl_exercises/${category}`);
        const data = await response.json();
        
        if (data.status === 'success') {
          renderAdlExercises(data.exercises);
        }
      } catch (error) {
        console.error('Error loading ADL exercises:', error);
      }
    }

    function renderAdlExercises(exercises) {
      const container = document.getElementById('adl-exercises');
      if (!container) return;
      
      container.innerHTML = exercises.map(ex => `
        <div class="p-4 bg-white rounded-lg border border-slate-200 mb-3 hover:border-blue-300 cursor-pointer transition-colors" onclick="openAdlDosageModal('${ex.id}', '${ex.short_name}', '${ex.full_name}', ${ex.default_sets || 3}, ${ex.default_reps || 10})">
          <div class="flex justify-between items-center">
            <div>
              <p class="font-semibold text-slate-800">${ex.short_name}</p>
              <p class="text-sm text-slate-500">${ex.full_name}</p>
              <p class="text-xs text-orange-600 mt-1">Default: ${ex.default_sets || 3} sets × ${ex.default_reps || 10} reps</p>
            </div>
            <button class="w-8 h-8 bg-green-500 text-white rounded-full hover:bg-green-600 flex items-center justify-center">+</button>
          </div>
        </div>
      `).join('');
    }

    function openAdlDosageModal(id, shortName, fullName, defaultSets, defaultReps) {
      currentAdlExercise = { id, short_name: shortName, full_name: fullName };
      
      document.getElementById('adl-sets').value = defaultSets;
      document.getElementById('adl-reps').value = defaultReps;
      document.getElementById('adl-dosage-modal').classList.remove('hidden');
      
      document.getElementById('save-dosage-btn').onclick = () => {
        const sets = parseInt(document.getElementById('adl-sets').value) || 3;
        const reps = parseInt(document.getElementById('adl-reps').value) || 10;
        
        const exerciseWithDosage = {
          ...currentAdlExercise,
          dosage: { sets, reps }
        };
        
        const existingIndex = selectedAdlExercises.findIndex(ex => ex.id === currentAdlExercise.id);
        if (existingIndex !== -1) {
          selectedAdlExercises[existingIndex] = exerciseWithDosage;
        } else {
          selectedAdlExercises.push(exerciseWithDosage);
        }
        
        closeAdlDosageModal();
        updateAdlSelectedPreview();
        if (allAdlExercisesCache.length > 0) {
          renderAllAdlExercises(allAdlExercisesCache);
        }
      };
    }

    function closeAdlDosageModal() {
      document.getElementById('adl-dosage-modal').classList.add('hidden');
      currentAdlExercise = null;
    }

    function updateAdlSelectedPreview() {
      const previewContainer = document.getElementById('adl-selected-preview');
      const listContainer = document.getElementById('adl-selected-list');
      const saveBtn = document.getElementById('save-adl-btn');
      
      if (selectedAdlExercises.length > 0) {
        previewContainer.classList.remove('hidden');
        saveBtn.disabled = false;
        
        listContainer.innerHTML = selectedAdlExercises.map((ex, idx) => `
          <div class="flex justify-between items-center p-2 bg-white rounded-lg border-l-4 border-blue-500">
            <div>
              <p class="font-medium text-sm text-slate-800">${ex.short_name}</p>
              <p class="text-xs text-slate-500">${ex.dosage.sets} sets × ${ex.dosage.reps} reps</p>
            </div>
            <button onclick="removeAdlExercise(${idx})" class="text-red-500 hover:text-red-700 text-lg">×</button>
          </div>
        `).join('');
      } else {
        previewContainer.classList.add('hidden');
        saveBtn.disabled = true;
      }
    }

    function removeAdlExercise(index) {
      selectedAdlExercises.splice(index, 1);
      updateAdlSelectedPreview();
      if (allAdlExercisesCache.length > 0) {
        renderAllAdlExercises(allAdlExercisesCache);
      }
    }

    function closeAdlModal() {
      document.getElementById('adl-modal').classList.add('hidden');
      allAdlExercisesCache = [];
      // Note: selectedAdlExercises is NOT cleared on cancel
      // Restore layout classes for next open
      const categoriesDiv = document.getElementById('adl-categories');
      if (categoriesDiv) categoriesDiv.classList.remove('hidden');
      const exercisesDiv = document.getElementById('adl-exercises');
      if (exercisesDiv) {
        exercisesDiv.classList.remove('w-full');
        exercisesDiv.classList.add('w-2/3');
      }
    }

    async function saveAdlPrescription() {
      if (!selectedPatientData || selectedAdlExercises.length === 0) {
        showToast('Please add at least one exercise');
        return;
      }
      
      console.log('[ADL SAVE] Starting save with:', {
        user_id: selectedPatientData.HospitalID,
        exercises: selectedAdlExercises
      });
      
      const saveBtn = document.getElementById('save-adl-btn');
      const originalText = saveBtn ? saveBtn.innerHTML : '';
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...';
      }
      
      try {
        const response = await fetch('/adl/save_adl_prescription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: selectedPatientData.HospitalID,
            login_id: currentUser.loginId,
            exercises: selectedAdlExercises
          })
        });
        
        const data = await response.json();
        console.log('[ADL SAVE] Response:', data);
        
        if (data.status === 'success') {
          selectedAdlExercises = [];  // Clear only on successful save
          closeAdlModal();
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
          showToast('ADL exercises saved successfully!');
        } else {
          showToast(data.message || 'Failed to save');
        }
      } catch (error) {
        console.error('[ADL SAVE] Error:', error);
        showToast('Failed to save ADL prescription: ' + error.message);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalText || 'Save Prescription';
        }
      }
    }

    // VCG Modal Functions
    let vcgProgramsData = {};
    
    async function showVcgModal() {
      const modal = document.getElementById('vcg-modal');
      if (!modal) return;
      
      modal.classList.remove('hidden');
      
      // Don't clear - keep existing exercises so user can add more
      // selectedVcgExercises already has saved exercises from renderVcgPrescriptionStatus
      
      // Hide categories panel and show all exercises together like ADL
      const categoriesDiv = document.getElementById('vcg-categories');
      if (categoriesDiv) categoriesDiv.classList.add('hidden');
      const exercisesDiv = document.getElementById('vcg-exercises');
      if (exercisesDiv) {
        exercisesDiv.classList.remove('w-2/3');
        exercisesDiv.classList.add('w-full');
      }
      
      // Normalise vcgType to the canonical key used by the EXERCISE_LIBRARY
      const rawVcgType = (selectedPatientData.vcgType || '').toUpperCase().trim();
      let vcgType = 'VCG2';
      if (['VCG4,5', 'VCG4_5', 'VCG4&5', 'VCG45', 'VCG4/5'].includes(rawVcgType) ||
          rawVcgType.includes('VCG4') || rawVcgType.includes('VCG5')) {
        vcgType = 'VCG4,5';
      } else if (rawVcgType === 'VCG3') {
        vcgType = 'VCG3';
      } else if (rawVcgType === 'VCG2') {
        vcgType = 'VCG2';
      } else if (rawVcgType.startsWith('VCG')) {
        vcgType = rawVcgType;
      }
      
      document.getElementById('vcg-type-badge').textContent = `(${vcgType})`;
      
      const vcgExercisesContainer = document.getElementById('vcg-exercises');
      vcgExercisesContainer.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-purple-600"></i><p class="text-slate-500 mt-2">Loading exercises...</p></div>';
      
      try {
        // encodeURIComponent handles the comma in "VCG4,5" so it survives URL routing
        const response = await fetch(`/get_exercise_programs/${encodeURIComponent(vcgType)}`);
        
        if (!response.ok) {
          vcgExercisesContainer.innerHTML = '<div class="text-center py-8 text-slate-500">No programs available for this VCG type</div>';
          return;
        }
        
        const data = await response.json();
        
        if (data.programs && data.programs.length > 0) {
          vcgProgramsData = {};
          data.programs.forEach(prog => {
            vcgProgramsData[prog.id] = prog;
          });
          
          // Load all exercises from all programs together
          const allExercises = [];
          for (const prog of data.programs) {
            const exResponse = await fetch(`/get_exercise_details/${encodeURIComponent(vcgType)}/${encodeURIComponent(prog.id)}`);
            const exData = await exResponse.json();
            if (exData.exercises) {
              allExercises.push(...exData.exercises.map(ex => ({...ex, programName: prog.name})));
            }
          }
          
          // Store in cache for re-rendering
          allVcgExercisesCache = allExercises;
          
          if (allExercises.length > 0) {
            renderAllVcgExercises(allExercises);
          } else {
            vcgExercisesContainer.innerHTML = '<div class="text-center py-8 text-slate-500">No exercises available</div>';
          }
        } else {
          vcgExercisesContainer.innerHTML = '<div class="text-center py-8 text-slate-500">No programs available for this VCG type</div>';
        }
        updateVcgSelectedPreview();
      } catch (error) {
        console.error('Error loading VCG programs:', error);
        vcgExercisesContainer.innerHTML = '<div class="text-center py-8 text-red-500">Error loading programs</div>';
      }
    }
    
    function renderAllVcgExercises(exercises) {
      const container = document.getElementById('vcg-exercises');
      if (!container) return;
      
      if (!exercises || exercises.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-slate-500">No exercises available</div>';
        return;
      }
      
      container.innerHTML = exercises.map(ex => {
        const isSelected = selectedVcgExercises.some(s => s.id === ex.id);
        return `
          <div class="p-3 border rounded-lg mb-2 cursor-pointer transition-colors ${isSelected ? 'bg-purple-50 border-purple-500' : 'border-slate-200 hover:border-purple-300'}" onclick="openVcgDosageModal('${ex.id}', '${ex.short_name}', '${ex.full_name}', ${ex.default_sets || 3}, ${ex.default_reps || 10})">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium text-slate-800">${ex.short_name}</div>
                <div class="text-xs text-slate-500">${ex.programName || ''} - ${ex.full_name}</div>
              </div>
              <div class="flex items-center gap-2">
                <div class="text-xs text-purple-600">${ex.default_sets || 3}×${ex.default_reps || 10}</div>
                <span class="w-6 h-6 ${isSelected ? 'bg-purple-500' : 'bg-slate-200'} rounded-full flex items-center justify-center text-xs ${isSelected ? 'text-white' : 'text-slate-500'}">
                  ${isSelected ? '<i class="fas fa-check"></i>' : '+'}
                </span>
              </div>
            </div>
          </div>`;
      }).join('');
    }

    function renderVcgCategories(categories) {
      const container = document.getElementById('vcg-categories');
      if (!container) return;
      
      container.innerHTML = categories.map(cat => `
        <button onclick="loadVcgExercises('${cat}')" class="vcg-category-btn w-full text-left px-4 py-3 rounded-lg mb-2 hover:bg-purple-50 text-sm font-medium text-slate-700 transition-colors">
          ${vcgProgramsData[cat]?.name || cat.replace('_', ' ').toUpperCase()}
        </button>
      `).join('');
    }

    async function loadVcgExercises(programId, vcgType) {
      const container = document.getElementById('vcg-exercises');
      if (!container) return;
      
      container.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-purple-600"></i><p class="text-slate-500 mt-2">Loading exercises...</p></div>';
      
      if (!vcgType) vcgType = selectedPatientData.vcgType ? selectedPatientData.vcgType.toUpperCase() : 'VCG2';
      
      try {
        const response = await fetch(`/get_exercise_details/${encodeURIComponent(vcgType)}/${encodeURIComponent(programId)}`);
        
        if (!response.ok) {
          container.innerHTML = '<div class="text-center py-8 text-slate-500">No exercises available for this program</div>';
          return;
        }
        
        const data = await response.json();
        
        if (data.status === 'success' && data.exercises && data.exercises.length > 0) {
          container.innerHTML = data.exercises.map(ex => `
            <div class="p-4 bg-white rounded-lg border border-slate-200 mb-3 hover:border-purple-300 cursor-pointer transition-colors" onclick="openVcgDosageModal('${ex.id}', '${ex.short_name}', '${ex.full_name}', ${ex.default_sets || 3}, ${ex.default_reps || 10})">
              <div class="flex justify-between items-center">
                <div>
                  <p class="font-semibold text-slate-800">${ex.short_name}</p>
                  <p class="text-sm text-slate-500">${ex.full_name}</p>
                  <p class="text-xs text-purple-600 mt-1">Default: ${ex.default_sets || 3} sets × ${ex.default_reps || 10} reps</p>
                </div>
                <button class="w-8 h-8 bg-green-500 text-white rounded-full hover:bg-green-600 flex items-center justify-center">+</button>
              </div>
            </div>
          `).join('');
        } else {
          container.innerHTML = '<div class="text-center py-8 text-slate-500">No exercises available for this program</div>';
        }
      } catch (error) {
        console.error('Error loading VCG exercises:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500">Error loading exercises</div>';
      }
    }

    function openVcgDosageModal(id, shortName, fullName, defaultSets, defaultReps) {
      currentVcgExercise = { id, short_name: shortName, full_name: fullName };
      
      document.getElementById('vcg-sets').value = defaultSets;
      document.getElementById('vcg-reps').value = defaultReps;
      document.getElementById('vcg-dosage-modal').classList.remove('hidden');
      
      document.getElementById('save-vcg-dosage-btn').onclick = () => {
        const sets = parseInt(document.getElementById('vcg-sets').value) || 3;
        const reps = parseInt(document.getElementById('vcg-reps').value) || 10;
        
        const exerciseWithDosage = {
          ...currentVcgExercise,
          dosage: { sets, reps }
        };
        
        const existingIndex = selectedVcgExercises.findIndex(ex => ex.id === currentVcgExercise.id);
        if (existingIndex !== -1) {
          selectedVcgExercises[existingIndex] = exerciseWithDosage;
        } else {
          selectedVcgExercises.push(exerciseWithDosage);
        }
        
        closeVcgDosageModal();
        updateVcgSelectedPreview();
        if (allVcgExercisesCache.length > 0) {
          renderAllVcgExercises(allVcgExercisesCache);
        }
      };
    }

    function closeVcgDosageModal() {
      document.getElementById('vcg-dosage-modal').classList.add('hidden');
      currentVcgExercise = null;
    }

    function updateVcgSelectedPreview() {
      const previewContainer = document.getElementById('vcg-selected-preview');
      const listContainer = document.getElementById('vcg-selected-list');
      const saveBtn = document.getElementById('save-vcg-btn');
      
      if (selectedVcgExercises.length > 0) {
        previewContainer.classList.remove('hidden');
        saveBtn.disabled = false;
        
        listContainer.innerHTML = selectedVcgExercises.map((ex, idx) => `
          <div class="flex justify-between items-center p-2 bg-white rounded-lg border-l-4 border-purple-500">
            <div>
              <p class="font-medium text-sm text-slate-800">${ex.short_name}</p>
              <p class="text-xs text-slate-500">${ex.dosage.sets} sets × ${ex.dosage.reps} reps</p>
            </div>
            <button onclick="removeVcgExercise(${idx})" class="text-red-500 hover:text-red-700 text-lg">×</button>
          </div>
        `).join('');
      } else {
        previewContainer.classList.add('hidden');
        saveBtn.disabled = true;
      }
    }

    function removeVcgExercise(index) {
      selectedVcgExercises.splice(index, 1);
      updateVcgSelectedPreview();
      if (allVcgExercisesCache.length > 0) {
        renderAllVcgExercises(allVcgExercisesCache);
      }
    }

    function closeVcgModal() {
      document.getElementById('vcg-modal').classList.add('hidden');
      allVcgExercisesCache = [];
      // Note: selectedVcgExercises is NOT cleared here - it's cleared on successful save
      // so the user can re-open the modal and see their current selection
    }

    async function saveVcgPrescription() {
      if (!selectedPatientData || selectedVcgExercises.length === 0) {
        alert('Please add at least one exercise');
        return;
      }
      
      const rawSaveVcgType = (selectedPatientData.vcgType || '').toUpperCase().trim();
      // Normalise to canonical key
      let vcgType = 'VCG2';
      if (['VCG4,5', 'VCG4_5', 'VCG4&5', 'VCG45'].includes(rawSaveVcgType) ||
          rawSaveVcgType.includes('VCG4') || rawSaveVcgType.includes('VCG5')) {
        vcgType = 'VCG4,5';
      } else if (rawSaveVcgType === 'VCG3') {
        vcgType = 'VCG3';
      } else if (rawSaveVcgType) {
        vcgType = rawSaveVcgType;
      }
      
      console.log('[VCG SAVE] Starting save with:', {
        user_id: selectedPatientData.HospitalID,
        exercise_type: 'vcg',
        vcg_type: vcgType,
        exercises: selectedVcgExercises
      });
      
      const saveBtn = document.getElementById('save-vcg-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...';
      }
      
      try {
        const response = await fetch('/save_controller_exercises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: selectedPatientData.HospitalID,
            login_id: currentUser.loginId,
            exercise_type: 'vcg',
            vcg_type: vcgType,
            exercises: selectedVcgExercises
          })
        });
        
        const data = await response.json();
        console.log('[VCG SAVE] Response:', data);
        
        if (data.status === 'success') {
          console.log('[VCG SAVE] Success, reloading tab...');
          closeVcgModal();
          // Reload the VCG tab from server FIRST — this repopulates selectedVcgExercises
          // via renderVcgPrescriptionStatus. Only clear AFTER reload so there is no
          // window where selectedVcgExercises is [] and a background sync could fire.
          const content = document.getElementById('detail-content');
          if (content) {
            document.querySelectorAll('.detail-tab-btn, .vcg-tab-btn').forEach(btn => {
              btn.classList.remove('active', 'border-blue-600', 'text-slate-800');
              btn.classList.add('border-transparent', 'text-slate-600');
            });
            const vcgTabBtn = document.querySelector('.vcg-tab-btn');
            if (vcgTabBtn) {
              vcgTabBtn.classList.add('active', 'border-blue-600', 'text-slate-800');
              vcgTabBtn.classList.remove('border-transparent', 'text-slate-600');
            }
            await loadVcgTab(content);  // repopulates selectedVcgExercises from server
          }
          showToast('VCG prescription saved successfully');
        } else {
          showToast(data.message || 'Failed to save');
        }
      } catch (error) {
        console.error('[VCG SAVE] Error:', error);
        alert('Failed to save VCG prescription: ' + error.message);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = 'Save Prescription';
        }
      }
    }

    // Load existing prescriptions
    async function loadAdlPrescription(userId) {
      try {
        const response = await fetch(`/adl/get_adl_prescription/${userId}`);
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error loading ADL prescription:', error);
        return { has_prescription: false };
      }
    }
    
    async function loadVcgPrescription(userId) {
      try {
        console.log('Loading VCG prescription for user:', userId);
        const response = await fetch(`/get_latest_prescription/${userId}/vcg`);
        const data = await response.json();
        console.log('Loaded VCG prescription:', data);
        return data;
      } catch (error) {
        console.error('Error loading VCG prescription:', error);
        return { has_prescription: false };
      }
    }

    // Print functions - wrapper with language selection
    function printAdlExercises() {
      if (!selectedPatientData || !selectedPatientData.HospitalID) {
        alert('Please select a patient first');
        return;
      }
      
      const userId = selectedPatientData.HospitalID;
      const langOptions = [
        { code: 'english', name: 'English', flag: '🇬🇧' },
        { code: 'tamil', name: 'தமிழ்', flag: '🇱🇰' },
        { code: 'hindi', name: 'हिन्दी', flag: '🇮🇳' },
        { code: 'telugu', name: 'తెలుగు', flag: '🇮🇳' }
      ];
      
      const modalHtml = `
        <div id="lang-select-modal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 class="text-lg font-bold text-slate-800 mb-4">Select Language for Print</h3>
            <div class="space-y-2">
              ${langOptions.map(lang => `
                <button onclick="document.getElementById('lang-select-modal').remove(); doPrintAdlExercises('${userId}', '${lang.code}');" 
                  class="w-full px-4 py-3 text-left rounded-lg border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center gap-3">
                  <span class="text-2xl">${lang.flag}</span>
                  <span class="font-medium">${lang.name}</span>
                </button>
              `).join('')}
            </div>
            <button onclick="document.getElementById('lang-select-modal').remove();" class="mt-4 w-full px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // Print functions
    async function doPrintAdlExercises(userId, lang) {
      try {
        const response = await fetch(`/adl/get_adl_prescription/${userId}`);
        const data = await response.json();
        
        if (!data.has_prescription) {
          alert('No ADL exercise prescription found');
          return;
        }
        
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          alert('Please allow pop-ups to print exercises');
          return;
        }
        
        const exercises = data.enriched_exercises || [];
        
        // Get translations
        const translations = exerciseTranslations[lang] || exerciseTranslations.english;
        
        // Generate QR codes for each exercise with YouTube URL
        const exercisesHtml = await Promise.all(exercises.map(async (ex, idx) => {
          const dosage = ex.dosage || { sets: ex.default_sets || 3, reps: ex.default_reps || 10 };
          
          // Get translated exercise name and description
          const exerciseName = getExerciseName(ex.id, lang) || ex.short_name || ex.id;
          const exerciseDesc = getExerciseDescription(ex.id, lang) || ex.description || '';
          
          // Generate QR code for YouTube URL
          let qrCodeHtml = '';
          if (ex.youtube_url) {
            try {
              const qrDataUrl = await generateYoutubeQRCode(ex.youtube_url, 150);
              if (qrDataUrl) {
                qrCodeHtml = `
                  <div style="margin-top: 10px; padding: 10px; background: #f0f0f0; border-radius: 5px; text-align: center;">
                    <p style="margin: 0 0 5px 0; font-size: 12px;"><strong>${translations.scanQRCode}</strong></p>
                    <img src="${qrDataUrl}" alt="QR Code" style="width: 100px; height: 100px;" />
                    <p style="margin: 5px 0 0 0; font-size: 10px; color: #666;">${ex.youtube_url}</p>
                  </div>
                `;
              }
            } catch (e) {
              console.error('QR generation error:', e);
              qrCodeHtml = `<p><strong>${translations.video}:</strong> <a href="${ex.youtube_url}">${ex.youtube_url}</a></p>`;
            }
          }
          
          return `
            <div style="border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; page-break-inside: avoid; border-left: 4px solid #f39c12;">
              <h3 style="color: #2c3e50; margin-top: 0;">${translations.exercise} ${idx + 1}: ${exerciseName}</h3>
              <div style="background: #fef5e7; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <strong>${translations.sets}:</strong> ${dosage.sets} &nbsp;&nbsp; <strong>${translations.reps}:</strong> ${dosage.reps}
              </div>
              <p><strong>${translations.description}:</strong> ${exerciseDesc}</p>
              ${qrCodeHtml}
            </div>
          `;
        }));
        
        const exercisesHtmlContent = exercisesHtml.join('');
        
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${translations.adlPrescription} - ${userId}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #333; }
              .page { width: 210mm; min-height: 297mm; padding: 20mm; margin: 0 auto; background: white; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #f39c12; padding-bottom: 20px; }
              .patient-info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
              .footer { text-align: center; margin-top: 30px; color: #777; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; }
              @media print { body { padding: 0; } }
            </style>
          </head>
          <body>
            <div class="page">
              <div class="header">
                <h1>${translations.adlPrescription}</h1>
                <h3>${translations.patientId}: ${userId}</h3>
                <p>${translations.date}: ${new Date().toLocaleDateString()}</p>
              </div>
              <div class="patient-info">
                <p><strong>${translations.totalExercises}:</strong> ${exercises.length}</p>
                <p><strong>${translations.prescribedOn}:</strong> ${data.prescription?.created_at || 'N/A'}</p>
              </div>
              <h2>Activities of Daily Living (ADL) ${translations.exercises}</h2>
              ${exercisesHtmlContent}
              <div class="footer">
                <p>${translations.prescribedBy}</p>
                <p>${translations.note}</p>
              </div>
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.onload = () => printWindow.print();
        
      } catch (error) {
        console.error('Error printing ADL exercises:', error);
        alert('Failed to print ADL exercises');
      }
    }

    // Print VCG - wrapper with language selection
    function printVcgExercises() {
      if (!selectedPatientData || !selectedPatientData.HospitalID) {
        alert('Please select a patient first');
        return;
      }
      
      const userId = selectedPatientData.HospitalID;
      const langOptions = [
        { code: 'english', name: 'English', flag: '🇬🇧' },
        { code: 'tamil', name: 'தமிழ்', flag: '🇱🇰' },
        { code: 'hindi', name: 'हिन्दी', flag: '🇮🇳' },
        { code: 'telugu', name: 'తెలుగు', flag: '🇮🇳' }
      ];
      
      const modalHtml = `
        <div id="lang-select-modal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 class="text-lg font-bold text-slate-800 mb-4">Select Language for Print</h3>
            <div class="space-y-2">
              ${langOptions.map(lang => `
                <button onclick="document.getElementById('lang-select-modal').remove(); doPrintVcgExercises('${userId}', '${lang.code}');" 
                  class="w-full px-4 py-3 text-left rounded-lg border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center gap-3">
                  <span class="text-2xl">${lang.flag}</span>
                  <span class="font-medium">${lang.name}</span>
                </button>
              `).join('')}
            </div>
            <button onclick="document.getElementById('lang-select-modal').remove();" class="mt-4 w-full px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async function doPrintVcgExercises(userId, lang) {
      try {
        const response = await fetch(`/get_latest_prescription/${userId}/vcg`);
        const data = await response.json();
        
        if (!data.has_prescription || !data.enriched_exercises) {
          alert('No VCG exercise prescription found');
          return;
        }
        
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          alert('Please allow pop-ups to print exercises');
          return;
        }
        
        const exercises = data.enriched_exercises || [];
        const translations = exerciseTranslations[lang] || exerciseTranslations.english;
        
        const exercisesHtml = await Promise.all(exercises.map(async (ex, idx) => {
          const dosage = ex.dosage || { sets: ex.default_sets || 3, reps: ex.default_reps || 10 };
          const exerciseName = getExerciseName(ex.id, lang) || ex.short_name || ex.id;
          const exerciseDesc = getExerciseDescription(ex.id, lang) || ex.description || '';
          
          let qrCodeHtml = '';
          if (ex.youtube_url) {
            try {
              const qrDataUrl = await generateYoutubeQRCode(ex.youtube_url, 150);
              if (qrDataUrl) {
                qrCodeHtml = `
                  <div style="margin-top: 10px; padding: 10px; background: #f0f0f0; border-radius: 5px; text-align: center;">
                    <p style="margin: 0 0 5px 0; font-size: 12px;"><strong>${translations.scanQRCode}</strong></p>
                    <img src="${qrDataUrl}" alt="QR Code" style="width: 100px; height: 100px;" />
                    <p style="margin: 5px 0 0 0; font-size: 10px; color: #666;">${ex.youtube_url}</p>
                  </div>`;
              }
            } catch (e) {
              console.error('QR generation error:', e);
              qrCodeHtml = `<p><strong>${translations.video}:</strong> <a href="${ex.youtube_url}">${ex.youtube_url}</a></p>`;
            }
          }
          
          return `
            <div style="border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; page-break-inside: avoid; border-left: 4px solid #9b59b6;">
              <h3 style="color: #2c3e50; margin-top: 0;">${translations.exercise} ${idx + 1}: ${exerciseName}</h3>
              <div style="background: #f5eef8; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <strong>${translations.sets}:</strong> ${dosage.sets} &nbsp;&nbsp; <strong>${translations.reps}:</strong> ${dosage.reps}
              </div>
              <p><strong>${translations.description}:</strong> ${exerciseDesc}</p>
              ${qrCodeHtml}
            </div>
          `;
        }));
        
        const exercisesHtmlContent = exercisesHtml.join('');
        
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${translations.vcgPrescription} - ${userId}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #333; }
              .page { width: 210mm; min-height: 297mm; padding: 20mm; margin: 0 auto; background: white; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #9b59b6; padding-bottom: 20px; }
              .patient-info { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
              .footer { text-align: center; margin-top: 30px; color: #777; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; }
              @media print { body { padding: 0; } }
            </style>
          </head>
          <body>
            <div class="page">
              <div class="header">
                <h1>${translations.vcgPrescription}</h1>
                <h3>${translations.patientId}: ${userId}</h3>
                <p>${translations.date}: ${new Date().toLocaleDateString()}</p>
              </div>
              <div class="patient-info">
                <p><strong>VCG Type:</strong> ${data.prescription?.vcg_type || selectedPatientData.vcgType}</p>
                <p><strong>${translations.totalExercises}:</strong> ${exercises.length}</p>
                <p><strong>${translations.prescribedOn}:</strong> ${data.prescription?.created_at || 'N/A'}</p>
              </div>
              <h2>VCG ${translations.exercises}</h2>
              ${exercisesHtmlContent}
              <div class="footer">
                <p>${translations.prescribedBy}</p>
                <p>${translations.note}</p>
              </div>
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.onload = () => printWindow.print();
        
      } catch (error) {
        console.error('Error printing VCG exercises:', error);
        alert('Failed to print VCG exercises');
      }
    }

    // Print
    function showPrintModal(printType) {
      const patient = selectedPatientData;
      const role = (patient.role || '').toLowerCase();
      const printContent = document.getElementById('print-content');
      
      let exercisesHtml = '';
      
      if (printType === 'adl') {
        exercisesHtml += `
          <h4 class="font-semibold mt-4 mb-2">ADL Exercises</h4>
          <table class="w-full border-collapse text-sm">
            <thead><tr class="bg-slate-100"><th class="p-2 text-left">Exercise</th><th class="p-2 text-left">Start</th><th class="p-2 text-left">End</th><th class="p-2 text-left">Reps</th></tr></thead>
            <tbody>
              ${adlExercises.length ? adlExercises.map(ex => `<tr class="border-b"><td class="p-2">${ex.name}</td><td class="p-2">${ex.startTime || '-'}</td><td class="p-2">${ex.endTime || '-'}</td><td class="p-2">${ex.reps || '-'}</td></tr>`).join('') : '<tr><td colspan="4" class="p-2 text-center text-slate-500">No exercises</td></tr>'}
            </tbody>
          </table>`;
      } else if (printType === 'vcg') {
        exercisesHtml += `
          <h4 class="font-semibold mt-4 mb-2">VCG Exercises (${patient.vcgType?.toUpperCase() || 'VCG 2'})</h4>
          <table class="w-full border-collapse text-sm">
            <thead><tr class="bg-slate-100"><th class="p-2 text-left">Exercise</th><th class="p-2 text-left">Start</th><th class="p-2 text-left">End</th><th class="p-2 text-left">Reps</th></tr></thead>
            <tbody>
              ${vcgExercises.length ? vcgExercises.map(ex => `<tr class="border-b"><td class="p-2">${ex.name}</td><td class="p-2">${ex.startTime || '-'}</td><td class="p-2">${ex.endTime || '-'}</td><td class="p-2">${ex.reps || '-'}</td></tr>`).join('') : '<tr><td colspan="4" class="p-2 text-center text-slate-500">No exercises</td></tr>'}
            </tbody>
          </table>`;
      }
      
      printContent.innerHTML = `
        <div class="text-center border-b pb-4 mb-4">
          <h2 class="text-xl font-bold">HOMER Rehabilitation Center</h2>
          <p class="text-slate-500">Exercise Prescription</p>
        </div>
        <div class="mb-4">
          <p><strong>Patient ID:</strong> ${patient.HospitalID}</p>
          <p><strong>Group:</strong> ${patient.role}</p>
          ${patient.vcgType ? `<p><strong>VCG Type:</strong> ${patient.vcgType.toUpperCase()}</p>` : ''}
        </div>
        ${exercisesHtml}
        <div class="mt-4 text-sm text-slate-500">Date: ${new Date().toLocaleDateString()}</div>`;
      
      document.getElementById('print-modal').classList.remove('hidden');
    }

    function printPrescription() { window.print(); }
    function closePrintModal() { document.getElementById('print-modal').classList.add('hidden'); }

    // Assign Group Modal
    function showAssignGroupModal(patientId) {
      document.getElementById('assign-patient-id').value = patientId;
      document.getElementById('assign-group-modal').classList.remove('hidden');
    }

    function hideAssignGroupModal() { document.getElementById('assign-group-modal').classList.add('hidden'); }

    // Assign Group Confirm Modal
    function showAssignConfirmModal(patientId, group) {
      const modalHtml = `
        <div id="assign-confirm-modal" class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div class="flex items-center gap-4 mb-4">
              <div class="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <i class="fas fa-exclamation-triangle text-amber-600 text-xl"></i>
              </div>
              <div>
                <h3 class="text-lg font-bold text-slate-800">Confirm Assignment</h3>
              </div>
            </div>
            <p class="text-slate-600 mb-2">Are you sure you want to assign <strong>${patientId}</strong> to <strong>${group}</strong>?</p>
            <p class="text-sm text-red-500 mb-6">This action cannot be undone.</p>
            <div class="flex gap-3">
              <button onclick="document.getElementById('assign-confirm-modal').remove(); hideAssignGroupModal();" class="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onclick="document.getElementById('assign-confirm-modal').remove(); assignGroupConfirmed('${patientId}', '${group}');" class="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Confirm</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async function assignGroupConfirmed(patientId, group) {
      // Show loading overlay
      const loadingHtml = `
        <div id="assign-loading" class="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center">
            <i class="fas fa-spinner fa-spin text-4xl text-blue-600 mb-4"></i>
            <p class="text-slate-700 font-medium">Assigning patient...</p>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', loadingHtml);
      
      try {
        const response = await fetch('/assign_group_user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userID: patientId, selectedGroup: group === 'Experimental' ? 'experimental' : 'control' })
        });
        const data = await response.json();
        if (data.status === 'success') {
          document.getElementById('assign-loading').remove();
          hideAssignGroupModal();
          closePatientDetail();
          loadPatients();
        } else {
          document.getElementById('assign-loading').remove();
          alert('Error: ' + (data.message || 'Unknown error'));
        }
      } catch (error) {
        document.getElementById('assign-loading').remove();
        alert('Error assigning group: ' + error.message);
      }
    }

    document.getElementById('assign-group-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const patientId = document.getElementById('assign-patient-id').value;
      const group = document.getElementById('assign-group-select').value;
      showAssignConfirmModal(patientId, group);
    });

    // Activate Patient Modal (for therapists)
    function showActivateModal(patientId) {
      // Reset form and button state before showing — prevents stale "Activating..." from previous use
      const form = document.getElementById('activate-form');
      if (form) form.reset();
      const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = 'Activate'; }
      document.getElementById('activate-patient-id').value = patientId;
      // Default activation date to today
      const dateEl = document.getElementById('activate-activation-date');
      if (dateEl) dateEl.valueAsDate = new Date();
      document.getElementById('activate-modal').classList.remove('hidden');
    }

    function hideActivateModal() {
      document.getElementById('activate-modal').classList.add('hidden');
      // Always reset the submit button so the next open is clean
      const form = document.getElementById('activate-form');
      if (form) {
        form.reset();
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = 'Activate'; }
      }
    }

    // Experimental patient activation modal — date only, no VCG type
    function showActivateExperimentalModal(patientId) {
      const existing = document.getElementById('activate-experimental-modal');
      if (existing) existing.remove();
      const today = new Date().toISOString().split('T')[0];
      const modalHtml = `
        <div id="activate-experimental-modal" class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div class="flex items-center justify-between mb-5">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <i class="fas fa-unlock text-blue-600"></i>
                </div>
                <div>
                  <h3 class="text-lg font-bold text-slate-800">Activate Experimental Patient</h3>
                  <p class="text-sm text-slate-500">${patientId}</p>
                </div>
              </div>
              <button onclick="document.getElementById('activate-experimental-modal').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-semibold text-slate-700 mb-1.5">Activation Date <span class="text-red-500">*</span></label>
                <input type="date" id="exp-activation-date" value="${today}"
                  class="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <p class="text-xs text-slate-400 mt-1">Study timeline will be generated from this date (Day 0).</p>
              </div>
              <div class="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p class="text-xs text-blue-700"><i class="fas fa-info-circle mr-1.5"></i>Activating will unlock all patient tabs and generate the study timeline.</p>
              </div>
              <div class="flex gap-3 pt-1">
                <button onclick="document.getElementById('activate-experimental-modal').remove()" class="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-sm font-medium">Cancel</button>
                <button onclick="confirmActivateExperimental('${patientId}')" id="exp-activate-btn"
                  class="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium">
                  <i class="fas fa-unlock mr-1.5"></i>Activate
                </button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async function confirmActivateExperimental(patientId) {
      const activationDate = document.getElementById('exp-activation-date')?.value;
      if (!activationDate) { showToast('Please select an activation date', 'error'); return; }
      const btn = document.getElementById('exp-activate-btn');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1.5"></i>Activating...'; }
      try {
        const response = await fetch('/activate_experimental_patient', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userID: patientId, device: 'both', activationDate: activationDate })
        });
        const data = await response.json();
        if (data.status === 'success') {
          document.getElementById('activate-experimental-modal').remove();
          showToast('Patient activated successfully', 'success');
          await loadPatients();
          setTimeout(() => openPatientDetail(patientId), 100);
        } else {
          showToast('Error: ' + (data.message || 'Unknown error'), 'error');
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-unlock mr-1.5"></i>Activate'; }
        }
      } catch (error) {
        showToast('Network error: ' + error.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-unlock mr-1.5"></i>Activate'; }
      }
    }

    // Manual activate for experimental patients
    function showManualActivateModal(patientId) {
      const today = new Date().toISOString().split('T')[0];
      const modalHtml = `
        <div id="manual-activate-modal" class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span class="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">DEBUG</span>
                Manual Activate
              </h3>
              <button onclick="document.getElementById('manual-activate-modal').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
            </div>
            <p class="text-sm text-slate-600 mb-4">Manually activate experimental patient <strong>${patientId}</strong>.</p>
            <div class="mb-4">
              <label class="block text-sm font-medium text-slate-700 mb-1">Activation Date <span class="text-red-500">*</span></label>
              <input type="date" id="manual-activate-date" value="${today}" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
            </div>
            <div class="mb-4">
              <label class="block text-sm font-medium text-slate-700 mb-1">Activate Device</label>
              <select id="manual-activate-device" class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="both">Both (PLUTO + MARS)</option>
                <option value="pluto">PLUTO only</option>
                <option value="mars">MARS only</option>
              </select>
            </div>
            <div class="flex gap-3">
              <button onclick="document.getElementById('manual-activate-modal').remove()" class="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm">Cancel</button>
              <button onclick="confirmManualActivate('${patientId}')" class="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium"><i class="fas fa-bolt mr-1"></i>Activate</button>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    async function confirmManualActivate(patientId) {
      const device = document.getElementById('manual-activate-device').value;
      const activationDate = document.getElementById('manual-activate-date')?.value;
      const btn = document.querySelector('#manual-activate-modal button[onclick*="confirmManualActivate"]');
      if (!activationDate) { alert('Please select an activation date'); return; }
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Activating...';

      try {
        const response = await fetch('/activate_experimental_patient', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userID: patientId, device: device, activationDate: activationDate })
        });
        const data = await response.json();
        if (data.status === 'success') {
          document.getElementById('manual-activate-modal').remove();
          showToast('Patient activated successfully', 'success');
          await loadPatients();
          setTimeout(() => openPatientDetail(patientId), 100);
        } else {
          alert('Error: ' + (data.message || 'Unknown error'));
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-bolt mr-1"></i>Activate';
        }
      } catch (error) {
        alert('Error: ' + error.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-bolt mr-1"></i>Activate';
      }
    }

    document.getElementById('activate-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const patientId = document.getElementById('activate-patient-id').value;
      const vcgType = document.getElementById('activate-vcg-type').value;
      const activationDate = document.getElementById('activate-activation-date').value;
      const submitBtn = e.target.querySelector('button[type="submit"]');

      if (!activationDate) { alert('Please select an activation date'); return; }
      if (!vcgType) { alert('Please select a VCG type'); return; }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Activating...';

      try {
        const response = await fetch('/activate_control_patient', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userID: patientId, vcgType: vcgType, activationDate: activationDate })
        });
        const data = await response.json();
        if (data.status === 'success') {
          hideActivateModal();
          await loadPatients();
          setTimeout(() => { openPatientDetail(patientId); }, 100);
        } else {
          alert('Error: ' + (data.message || 'Unknown error'));
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Activate';
        }
      } catch (error) {
        alert('Error activating patient: ' + error.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Activate';
      }
    });

    // Change VCG Type Modal
    function showChangeVcgTypeModal() {
      const patient = selectedPatientData;
      if (!patient) return;
      
      const currentVcgType = patient.vcgType || 'VCG2';
      
      const modalHtml = `
        <div id="change-vcg-type-modal" class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold text-slate-800">Change VCG Type</h3>
              <button onclick="document.getElementById('change-vcg-type-modal').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
            </div>
            <p class="text-sm text-slate-600 mb-4">Current VCG Type: <strong>${currentVcgType}</strong></p>
            <form id="change-vcg-type-form" class="space-y-4">
              <input type="hidden" id="change-vcg-patient-id" value="${patient.HospitalID}">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Select New VCG Type</label>
                <select id="change-vcg-type-select" required class="w-full px-3 py-2 border border-slate-200 rounded-lg">
                  <option value="">Select type</option>
                  <option value="VCG2" ${currentVcgType === 'VCG2' ? 'selected' : ''}>VCG2 - Basic Exercises</option>
                  <option value="VCG3" ${currentVcgType === 'VCG3' ? 'selected' : ''}>VCG3 - Intermediate Exercises</option>
                  <option value="VCG4,5" ${currentVcgType === 'VCG4,5' ? 'selected' : ''}>VCG4,5 - Advanced Exercises</option>
                </select>
              </div>
              <div class="flex gap-3 pt-2">
                <button type="button" onclick="document.getElementById('change-vcg-type-modal').remove()" class="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" class="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Change Type</button>
              </div>
            </form>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      
      document.getElementById('change-vcg-type-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const patientId = document.getElementById('change-vcg-patient-id').value;
        const newVcgType = document.getElementById('change-vcg-type-select').value;
        
        if (!newVcgType) {
          alert('Please select a VCG type');
          return;
        }
        
        try {
          const response = await fetch('/update_user_vcg_type', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: patientId, vcg_type: newVcgType })
          });
          const data = await response.json();
          
          if (data.status === 'success') {
            selectedPatientData.vcgType = newVcgType;
            document.getElementById('change-vcg-type-modal').remove();
            // Reload the VCG tab
            const content = document.getElementById('detail-content');
            if (content) {
              await loadVcgTab(content);
            }
            alert('VCG type changed successfully!');
          } else {
            alert(data.message || 'Failed to change VCG type');
          }
        } catch (error) {
          console.error('Error changing VCG type:', error);
          alert('Failed to change VCG type');
        }
      });
    }

    // Create Patient
    function showCreatePatientModal() { document.getElementById('create-patient-modal').classList.remove('hidden'); }
    function hideCreatePatientModal() { document.getElementById('create-patient-modal').classList.add('hidden'); document.getElementById('create-patient-form').reset(); }

    document.getElementById('create-patient-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const hospitalId = document.getElementById('hospital-id').value;
      const trainingSide = document.getElementById('training-side').value;
      
      try {
        const response = await fetch('/create_homer_id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hospitalId, trainingSide, group: 'unassigned' })
        });
        const data = await response.json();
        if (data.status === 'success') {
          hideCreatePatientModal();
          loadPatients();
          showToast('Patient created: ' + data.homer_id);
        } else { showToast('Error: ' + data.message); }
      } catch (error) { alert('Error creating patient'); }
    });

    function showToast(message, type = 'success') {
      const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600' };
      const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
      const toast = document.createElement('div');
      toast.className = `fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-xl text-white shadow-xl ${colors[type] || colors.info} transition-all duration-300`;
      toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span class="text-sm font-medium">${message}</span>`;
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    function refreshData() {
      if (currentPage === 'dashboard') loadDashboard();
      else if (currentPage === 'patients') loadPatients();
    }

    document.getElementById('mobile-menu-btn').addEventListener('click', toggleSidebar);