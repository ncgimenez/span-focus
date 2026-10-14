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
    alert("Sync key copied to clipboard!");
  }).catch(() => {
    alert("Failed to copy sync key.");
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
  alert("Span Focus linked successfully!");
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
    const payload = {
      id: SYNC_USER_ID,
      focus_tasks: window.SpanState.tasks || [],
      focus_archived: window.SpanState.archivedTasks || [],
      focus_active: window.SpanState.activeTask || null,
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
      .select('focus_tasks, focus_archived, focus_active')
      .eq('id', SYNC_USER_ID)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.warn('Cloud sync read warning:', error.message);
      return;
    }

    if (data && data.focus_tasks && Array.isArray(data.focus_tasks)) {
      isCloudSyncInProgress = true;
      window.SpanState.tasks = data.focus_tasks;
      window.SpanState.archivedTasks = data.focus_archived || [];
      window.SpanState.activeTask = data.focus_active || null;

      localStorage.setItem('span_tasks', JSON.stringify(data.focus_tasks));
      localStorage.setItem('span_archived_tasks', JSON.stringify(data.focus_archived || []));
      localStorage.setItem('span_active_task', JSON.stringify(data.focus_active || null));

      if (typeof renderTasks === 'function') renderTasks();
      if (typeof renderArchivedTasks === 'function') renderArchivedTasks();
      if (typeof renderPlannedTasks === 'function') renderPlannedTasks();
      if (typeof updateSpotlightUI === 'function') updateSpotlightUI();
      if (typeof updateStats === 'function') updateStats();
      isCloudSyncInProgress = false;
    }
  } catch (err) {
    console.warn('Cloud sync bypass:', err.message);
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
 
