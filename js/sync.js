// Supabase Configuration shared across the Span Suite
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
    alert("Sync key copied to clipboard!");
  }).catch(() => {
    alert("Failed to copy sync key.");
  });
}

// Keep visible username field and hidden password field synchronized for Password Managers
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

  // Sync hidden password field to trigger iOS Keychain prompt
  syncKeychainInputs(key);
  updateSyncKeyDisplay();

  await loadStateFromCloud();
  alert("Span Focus linked successfully!");
}

function updateSyncKeyDisplay() {
  const el = document.getElementById('displaySyncKey');
  if (el) el.textContent = SYNC_USER_ID;
  syncKeychainInputs(SYNC_USER_ID);
}

async function saveStateToCloud() {
  if (isCloudSyncInProgress || !supabaseClient) return;
  try {
    const payload = {
      id: SYNC_USER_ID,
      tasks: window.SpanState.tasks || [],
      archived_tasks: window.SpanState.archivedTasks || [],
      active_task: window.SpanState.activeTask || null,
      updated_at: new Date().toISOString()
    };
    await supabaseClient.from('user_state').upsert(payload);
  } catch (err) {
    console.warn('Cloud sync write error:', err.message);
  }
}

async function loadStateFromCloud() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('user_state')
      .select('tasks, archived_tasks, active_task')
      .eq('id', SYNC_USER_ID)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.warn('Cloud sync read warning:', error.message);
      return;
    }

    if (data) {
      isCloudSyncInProgress = true;
      if (Array.isArray(data.tasks)) {
        window.SpanState.tasks = data.tasks;
        localStorage.setItem('span_tasks', JSON.stringify(data.tasks));
      }
      if (Array.isArray(data.archived_tasks)) {
        window.SpanState.archivedTasks = data.archived_tasks;
        localStorage.setItem('span_archived_tasks', JSON.stringify(data.archived_tasks));
      }
      if (data.active_task !== undefined) {
        window.SpanState.activeTask = data.active_task;
        localStorage.setItem('span_active_task', JSON.stringify(data.active_task));
      }

      if (typeof renderTasks === 'function') renderTasks();
      if (typeof renderArchivedTasks === 'function') renderArchivedTasks();
      if (typeof renderPlannedTasks === 'function') renderPlannedTasks();
      if (typeof updateSpotlightUI === 'function') updateSpotlightUI();
      if (typeof updateStats === 'function') updateStats();

      isCloudSyncInProgress = false;
    }
  } catch (err) {
    console.warn('Cloud sync connection bypass:', err.message);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  updateSyncKeyDisplay();

  // Handle manual input or password manager autofills
  const inputKey = document.getElementById('inputSyncKey');
  if (inputKey) {
    inputKey.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      const inputSecret = document.getElementById('inputSyncSecret');
      if (inputSecret) inputSecret.value = val;
    });
  }

  // Initial silent cloud check
  setTimeout(() => {
    loadStateFromCloud();
  }, 100);
});
