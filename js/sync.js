// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = 'https://xzoukiveknyuxmbrcsvb.supabase.co'; // ex: 'https://xyzcompany.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_8g571gv3CFOyJ0lMtaAf4w_CcITQovd'; // ex: 'eyJhbGciOi...'

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = 'COLLE_TON_URL_ICI';
const SUPABASE_ANON_KEY = 'COLLE_TA_CLE_ANON_ICI';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getOrCreateSyncId() {
  let id = localStorage.getItem('span_sync_user');
  if (!id) {
    id = 'span_' + Math.random().toString(36).substring(2, 8) + '_' + Date.now().toString(36);
    localStorage.setItem('span_sync_user', id);
  }
  return id;
}

let SYNC_USER_ID = getOrCreateSyncId();
let isSyncingIncoming = false;
let realtimeChannel = null;

function getCurrentSyncKey() {
  return SYNC_USER_ID;
}

async function pairWithSyncKey(newKey) {
  const cleanKey = newKey.trim();
  if (!cleanKey) return;
  if (cleanKey === SYNC_USER_ID) {
    alert("Cet appareil utilise déjà cette clé.");
    return;
  }

  SYNC_USER_ID = cleanKey;
  localStorage.setItem('span_sync_user', cleanKey);
  updateSyncKeyDisplay();

  initRealtimeSync();
  await loadStateFromCloud();
  alert("Appareil lié avec succès !");
}

async function loadStateFromCloud() {
  try {
    const { data, error } = await supabaseClient
      .from('user_state')
      .select('*')
      .eq('id', SYNC_USER_ID)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.warn('Erreur lecture cloud:', error.message);
      return;
    }

    if (data) {
      isSyncingIncoming = true;

      if (data.tasks) {
        tasks = data.tasks;
        localStorage.setItem('span_tasks', JSON.stringify(tasks));
        if (typeof renderTasks === 'function') renderTasks();
      }

      if (data.tracking) {
        trackingData = data.tracking;
        localStorage.setItem('span_tracking', JSON.stringify(trackingData));
        if (typeof updateGoalBar === 'function') updateGoalBar();
        if (typeof renderChart === 'function') renderChart();
      }

      if (data.daily_target) {
        dailyTargetMinutes = data.daily_target;
        localStorage.setItem('span_daily_target_minutes', dailyTargetMinutes);
        if (typeof updateGoalBar === 'function') updateGoalBar();
      }

      if (data.timer_state && data.timer_state.activeTask) {
        activeTask = data.timer_state.activeTask;
        localStorage.setItem('span_active_task', JSON.stringify(activeTask));
        if (typeof updateSpotlightUI === 'function') updateSpotlightUI();
      }

      isSyncingIncoming = false;
    } else {
      saveStateToCloud();
    }
  } catch (err) {
    console.error('Erreur sync cloud:', err);
  }
}

async function saveStateToCloud() {
  if (isSyncingIncoming) return;

  try {
    const payload = {
      id: SYNC_USER_ID,
      tasks: typeof tasks !== 'undefined' ? tasks : [],
      tracking: typeof trackingData !== 'undefined' ? trackingData : {},
      daily_target: typeof dailyTargetMinutes !== 'undefined' ? dailyTargetMinutes : 100,
      timer_state: {
        isRunning: typeof isRunning !== 'undefined' ? isRunning : false,
        activeTask: typeof activeTask !== 'undefined' ? activeTask : null,
        durationMinutes: typeof durationMinutes !== 'undefined' ? durationMinutes : 25
      },
      updated_at: new Date().toISOString()
    };

    await supabaseClient
      .from('user_state')
      .upsert(payload);
  } catch (err) {
    console.error('Erreur écriture cloud:', err);
  }
}

function initRealtimeSync() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel(`public:user_state:${SYNC_USER_ID}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_state',
        filter: `id=eq.${SYNC_USER_ID}`
      },
      (payload) => {
        const newData = payload.new;
        if (!newData) return;

        isSyncingIncoming = true;

        if (newData.tasks) {
          tasks = newData.tasks;
          localStorage.setItem('span_tasks', JSON.stringify(tasks));
          if (typeof renderTasks === 'function') renderTasks();
        }

        if (newData.tracking) {
          trackingData = newData.tracking;
          localStorage.setItem('span_tracking', JSON.stringify(trackingData));
          if (typeof updateGoalBar === 'function') updateGoalBar();
          if (typeof renderChart === 'function') renderChart();
        }

        if (newData.timer_state) {
          activeTask = newData.timer_state.activeTask || null;
          localStorage.setItem('span_active_task', JSON.stringify(activeTask));
          if (typeof updateSpotlightUI === 'function') updateSpotlightUI();
        }

        isSyncingIncoming = false;
      }
    )
    .subscribe();
}

function updateSyncKeyDisplay() {
  const el = document.getElementById('displaySyncKey');
  if (el) el.textContent = getCurrentSyncKey();
}

window.addEventListener('DOMContentLoaded', () => {
  updateSyncKeyDisplay();
  loadStateFromCloud();
  initRealtimeSync();
});
