// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = 'https://xzoukiveknyuxmbrcsvb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8g571gv3CFOyJ0lMtaAf4w_CcITQovd';

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

function copyCurrentSyncKey() {
  navigator.clipboard.writeText(SYNC_USER_ID).then(() => {
    alert("Clé de synchronisation copiée !");
  }).catch(() => {
    alert("Impossible de copier la clé.");
  });
}

async function handleLinkClick() {
  const input = document.getElementById('inputSyncKey');
  if (!input) return;
  const key = input.value.trim();
  if (!key) {
    alert("Veuillez coller une clé d'appareil.");
    return;
  }
  await pairWithSyncKey(key);
  input.value = '';
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

function applyIncomingData(data) {
  if (!data) return;
  isSyncingIncoming = true;

  // Dépaquetage sécurisé
  let rawTasks = data.tasks;
  if (rawTasks && typeof rawTasks === 'object' && !Array.isArray(rawTasks) && rawTasks.items) {
    tasks = rawTasks.items || [];
    if (rawTasks.categories) {
      categoryLabels = rawTasks.categories;
      window.SpanState.categoryLabels = categoryLabels;
      localStorage.setItem('span_category_labels', JSON.stringify(categoryLabels));
      if (typeof updateCategoryDOMNames === 'function') updateCategoryDOMNames();
    }
    if (rawTasks.archives) {
      archivedTasks = rawTasks.archives;
      window.SpanState.archivedTasks = archivedTasks;
      localStorage.setItem('span_archived_tasks', JSON.stringify(archivedTasks));
      if (typeof renderArchivedTasks === 'function') renderArchivedTasks();
    }
  } else if (Array.isArray(rawTasks)) {
    tasks = rawTasks;
  }

  window.SpanState.tasks = tasks;
  localStorage.setItem('span_tasks', JSON.stringify(tasks));
  if (typeof renderTasks === 'function') renderTasks();

  if (data.tracking) {
    trackingData = data.tracking;
    window.SpanState.trackingData = trackingData;
    localStorage.setItem('span_tracking', JSON.stringify(trackingData));
    if (typeof updateGoalBar === 'function') updateGoalBar();
    if (typeof renderChart === 'function') renderChart();
  }

  if (data.daily_target) {
    dailyTargetMinutes = data.daily_target;
    window.SpanState.dailyTargetMinutes = dailyTargetMinutes;
    localStorage.setItem('span_daily_target_minutes', dailyTargetMinutes);
    if (typeof updateGoalBar === 'function') updateGoalBar();
  }

  if (data.timer_state) {
    activeTask = data.timer_state.activeTask || null;
    window.SpanState.activeTask = activeTask;
    localStorage.setItem('span_active_task', JSON.stringify(activeTask));
    if (typeof updateSpotlightUI === 'function') updateSpotlightUI();
  }

  isSyncingIncoming = false;
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
      applyIncomingData(data);
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
    // Encapsulation sans nécessiter de nouvelles colonnes SQL
    const tasksPayload = {
      items: (window.SpanState && window.SpanState.tasks) || (typeof tasks !== 'undefined' ? tasks : []),
      categories: (window.SpanState && window.SpanState.categoryLabels) || (typeof categoryLabels !== 'undefined' ? categoryLabels : {}),
      archives: (window.SpanState && window.SpanState.archivedTasks) || (typeof archivedTasks !== 'undefined' ? archivedTasks : [])
    };

    const payload = {
      id: SYNC_USER_ID,
      tasks: tasksPayload,
      tracking: (window.SpanState && window.SpanState.trackingData) || (typeof trackingData !== 'undefined' ? trackingData : {}),
      daily_target: (window.SpanState && window.SpanState.dailyTargetMinutes) || (typeof dailyTargetMinutes !== 'undefined' ? dailyTargetMinutes : 100),
      timer_state: {
        isRunning: typeof isRunning !== 'undefined' ? isRunning : false,
        activeTask: (window.SpanState && window.SpanState.activeTask) || (typeof activeTask !== 'undefined' ? activeTask : null),
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
        if (payload.new) {
          applyIncomingData(payload.new);
        }
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
