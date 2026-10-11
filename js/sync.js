// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = 'https://xzoukiveknyuxmbrcsvb.supabase.co'; // ex: 'https://xyzcompany.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_8g571gv3CFOyJ0lMtaAf4w_CcITQovd'; // ex: 'eyJhbGciOi...'

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Identifiant unique pour tes appareils (tu peux mettre ton prénom/pseudo)
const SYNC_USER_ID = localStorage.getItem('span_sync_user') || 'mon_profil_perso';

// Empêche les boucles infinies de mise à jour
let isSyncingIncoming = false;

// --- 1. CHARGEMENT INITIAL DEPUIS SUPABASE ---
async function loadStateFromCloud() {
  try {
    const { data, error } = await supabaseClient
      .from('user_state')
      .select('*')
      .eq('id', SYNC_USER_ID)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.warn('Erreur de lecture Cloud:', error.message);
      return;
    }

    if (data) {
      // Données trouvées dans le cloud : on met à jour le local
      isSyncingIncoming = true;

      if (data.tasks) {
        tasks = data.tasks;
        localStorage.setItem('span_tasks', JSON.stringify(tasks));
        renderTasks();
      }

      if (data.tracking) {
        trackingData = data.tracking;
        localStorage.setItem('span_tracking', JSON.stringify(trackingData));
        updateGoalBar();
        renderChart();
      }

      if (data.daily_target) {
        dailyTargetMinutes = data.daily_target;
        localStorage.setItem('span_daily_target_minutes', dailyTargetMinutes);
        updateGoalBar();
      }

      if (data.timer_state && data.timer_state.activeTask) {
        activeTask = data.timer_state.activeTask;
        localStorage.setItem('span_active_task', JSON.stringify(activeTask));
        updateSpotlightUI();
      }

      isSyncingIncoming = false;
    } else {
      // Première utilisation : on envoie l'état local actuel vers Supabase
      saveStateToCloud();
    }
  } catch (err) {
    console.error('Erreur sync cloud:', err);
  }
}

// --- 2. ENREGISTREMENT VERS SUPABASE ---
async function saveStateToCloud() {
  if (isSyncingIncoming) return;

  try {
    const payload = {
      id: SYNC_USER_ID,
      tasks: tasks,
      tracking: trackingData,
      daily_target: dailyTargetMinutes,
      timer_state: {
        isRunning: isRunning,
        activeTask: activeTask,
        durationMinutes: durationMinutes
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

// --- 3. ÉCOUTE TEMPS RÉEL (REALTIME) ---
function initRealtimeSync() {
  supabaseClient
    .channel('public:user_state')
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

        // Mise à jour instantanée des tâches si modifiées ailleurs
        if (newData.tasks) {
          tasks = newData.tasks;
          localStorage.setItem('span_tasks', JSON.stringify(tasks));
          renderTasks();
        }

        // Mise à jour des stats
        if (newData.tracking) {
          trackingData = newData.tracking;
          localStorage.setItem('span_tracking', JSON.stringify(trackingData));
          updateGoalBar();
          renderChart();
        }

        // Mise à jour de la tâche active (Spotlight)
        if (newData.timer_state) {
          activeTask = newData.timer_state.activeTask || null;
          localStorage.setItem('span_active_task', JSON.stringify(activeTask));
          updateSpotlightUI();
        }

        isSyncingIncoming = false;
      }
    )
    .subscribe();
}

// Initialisation dès que la page est chargée
window.addEventListener('DOMContentLoaded', () => {
  loadStateFromCloud();
  initRealtimeSync();
});
