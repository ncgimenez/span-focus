// Supabase configuration shared across the Span Suite
const SUPABASE_URL = 'https://xzoukiveknyuxmbrcsvb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8g571gv3CFOyJ0lMtaAf4w_CcITQovd';

const supabaseClient = (typeof supabase !== 'undefined') 
  ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
  : null;

function getOrCreateSyncId() {
  let id = localStorage.getItem('span_sync_user');
  if (!id) {
    id = 'span_' + Math.random().toString(36).substring(2, 8) + '_' + Date.now().toString(36);
    localStorage.setItem('span_sync_user', id);
  }
  return id;
}

let SYNC_USER_ID = getOrCreateSyncId();
let isCloudSyncInProgress = false;

function copyCurrentSyncKey() {
  navigator.clipboard.writeText(SYNC_USER_ID).then(() => {
    if (typeof showToast === 'function') showToast("Sync key copied to clipboard!", "📋");
    else alert("Sync key copied to clipboard!");
  }).catch(() => {
    if (typeof showToast === 'function') showToast("Failed to copy sync key.", "⚠️");
    else alert("Failed to copy sync key.");
  });
}

// Synchronize visible username input and hidden password input for Keychain prompt
function syncKeychainInputs(value) {
  const inputKey = document.getElementById('inputSyncKey');
  const inputSecret = document.getElementById('inputSyncSecret');
  if (inputKey && inputKey.value !== value) inputKey.value = value;
  if (inputSecret) inputSecret.value = value;
}

async function handleLinkClick() {
  const input = document.getElementById('inputSyncKey');
  if (!input) return;
  const key = input.value.trim();
  if (!key) return;

  SYNC_USER_ID = key;
  localStorage.setItem('span_sync_user', key);
  
  // Align secret password field for iOS Keychain prompt
  syncKeychainInputs(key);
  updateSyncKeyDisplay();

  await loadStateFromCloud();
  if (typeof showToast === 'function') showToast("Span Focus linked successfully!", "🔗");
  else alert("Span Focus linked successfully!");
}

function updateSyncKeyDisplay() {
  const el = document.getElementById('displaySyncKey');
  if (el) el.textContent = SYNC_USER_ID;
  syncKeychainInputs(SYNC_USER_ID);
}

// Save Focus state to cloud (tasks, archived, active)
async function saveStateToCloud() {
  if (isCloudSyncInProgress || !supabaseClient) return;
  try {
    // Read existing user_state row to preserve other shared keys (like plan_items or categories)
    const { data: existingData } = await supabaseClient
      .from('user_state')
      .select('tasks, timer_state')
      .eq('id', SYNC_USER_ID)
      .maybeSingle();

    const existingTasksObj = (existingData && existingData.tasks && typeof existingData.tasks === 'object' && !Array.isArray(existingData.tasks))
      ? existingData.tasks
      : {};

    const updatedTasksObj = {
      ...existingTasksObj,
      items: window.SpanState.tasks || [],
      archives: window.SpanState.archivedTasks || [],
      categories: window.SpanState.categoryLabels || existingTasksObj.categories || {}
    };

    const payload = {
      id: SYNC_USER_ID,
      tasks: updatedTasksObj,
      timer_state: {
        activeTask: window.SpanState.activeTask || null,
        durationMinutes: 25
      },
      updated_at: new Date().toISOString()
    };
    await supabaseClient.from('user_state').upsert(payload);
  } catch (err) {
    console.warn('Cloud sync write warning:', err.message);
  }
}

// Load Focus state from cloud
async function loadStateFromCloud() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('user_state')
      .select('tasks, timer_state')
      .eq('id', SYNC_USER_ID)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.warn('Cloud sync read warning:', error.message);
      return;
    }

    if (data && data.tasks) {
      isCloudSyncInProgress = true;

      let remoteItems = [];
      let remoteArchives = [];

      if (Array.isArray(data.tasks)) {
        remoteItems = data.tasks;
      } else if (data.tasks && typeof data.tasks === 'object') {
        remoteItems = data.tasks.items || [];
        remoteArchives = data.tasks.archives || [];
      }

      let remoteActive = null;
      if (data.timer_state && data.timer_state.activeTask) {
        remoteActive = data.timer_state.activeTask;
      }

      // Merge intelligent pour ne jamais écraser ni perdre de tâches locales
      const localTasks = window.SpanState.tasks || [];
      const isDefaultMocks = (
        localTasks.length === 2 && 
        localTasks[0] && localTasks[0].id === 't_1' && 
        localTasks[1] && localTasks[1].id === 't_2'
      );

      const taskMap = new Map();
      remoteItems.forEach(t => {
        if (t && t.id) taskMap.set(String(t.id), t);
      });

      if (!isDefaultMocks) {
        localTasks.forEach(t => {
          if (t && t.id) taskMap.set(String(t.id), t);
        });
      }

      const mergedTasks = Array.from(taskMap.values());

      window.SpanState.tasks = mergedTasks;
      if (remoteArchives && remoteArchives.length > 0) {
        window.SpanState.archivedTasks = remoteArchives;
      }
      if (remoteActive) {
        window.SpanState.activeTask = remoteActive;
      }

      localStorage.setItem('span_tasks', JSON.stringify(window.SpanState.tasks));
      localStorage.setItem('span_archived_tasks', JSON.stringify(window.SpanState.archivedTasks));
      localStorage.setItem('span_active_task', JSON.stringify(window.SpanState.activeTask));

      if (typeof window.applyLoadedTasksFromState === 'function') {
        window.applyLoadedTasksFromState();
      }

      if (typeof renderTasks === 'function') renderTasks();
      if (typeof renderArchivedTasks === 'function') renderArchivedTasks();
      if (typeof renderPlannedTasks === 'function') renderPlannedTasks();
      if (typeof updateSpotlightUI === 'function') updateSpotlightUI();
      if (typeof updateStats === 'function') updateStats();

      isCloudSyncInProgress = false;

      // Si des tâches locales existaient (ex: créées hors ligne sur ordinateur), on les pousse vers Supabase
      if (!isDefaultMocks && localTasks.length > 0) {
        saveStateToCloud();
      }
    }
  } catch (err) {
    console.warn('Cloud sync bypass:', err.message);
    isCloudSyncInProgress = false;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  updateSyncKeyDisplay();

  // Watch for manual edits or password manager autofills
  const inputKey = document.getElementById('inputSyncKey');
  if (inputKey) {
    inputKey.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      const inputSecret = document.getElementById('inputSyncSecret');
      if (inputSecret) inputSecret.value = val;
    });
  }

  // Load cloud data asynchronously without locking the UI
  setTimeout(() => {
    loadStateFromCloud();
  }, 100);
});

// Réactualisation automatique quand on rouvre l'app sur mobile
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadStateFromCloud();
  }
});
 
