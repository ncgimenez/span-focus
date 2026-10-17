let timerMode = 'pomodoro';
let durationMinutes = 25;
let secondsLeft = durationMinutes * 60;
let elapsedSeconds = 0;
let isRunning = false;
let isOvertime = false;
let isBreakSession = false;
let timerInterval = null;

// Variables pour le suivi du temps réel et l'écran actif
let targetEndTime = null;
let stopwatchStartTime = null;
let wakeLock = null;

// Canal Supabase Realtime pour synchroniser l'état du minuteur
const timerChannel = window.supabaseClient ? window.supabaseClient.channel('timer_sync') : null;

if (timerChannel) {
  timerChannel
    .on('broadcast', { event: 'timer_state' }, ({ payload }) => {
      syncRemoteTimer(payload);
    })
    .subscribe();
}

// Fonction pour envoyer l'état actuel aux autres appareils
function broadcastTimerState() {
  if (!timerChannel) return;
  timerChannel.send({
    type: 'broadcast',
    event: 'timer_state',
    payload: {
      isRunning,
      timerMode,
      durationMinutes,
      secondsLeft,
      elapsedSeconds,
      targetEndTime,
      stopwatchStartTime,
      isOvertime,
      isBreakSession,
      timestamp: Date.now()
    }
  });
}

// Réception et alignement de l'état envoyé par un autre écran
function syncRemoteTimer(state) {
  isRunning = state.isRunning;
  timerMode = state.timerMode;
  durationMinutes = state.durationMinutes;
  isOvertime = state.isOvertime;
  isBreakSession = state.isBreakSession;

  if (isRunning) {
    targetEndTime = state.targetEndTime;
    stopwatchStartTime = state.stopwatchStartTime;

    clearInterval(timerInterval);
    timerInterval = setInterval(tickTimer, 1000);
    toggleBtn.textContent = 'Pause';
    requestWakeLock();
  } else {
    clearInterval(timerInterval);
    secondsLeft = state.secondsLeft;
    elapsedSeconds = state.elapsedSeconds;
    toggleBtn.textContent = 'Resume';
    releaseWakeLock();
  }

  updateTimerVisualState(isRunning);
  tickTimer();
}


const display = document.getElementById('timeDisplay');
const toggleBtn = document.getElementById('btnToggle');
const ringCircle = document.getElementById('ringProgress');
const circumference = 2 * Math.PI * 118; // ~741.4

function updateDisplay() {
  let secToFormat = timerMode === 'stopwatch' ? elapsedSeconds : Math.abs(secondsLeft);
  const mins = Math.floor(secToFormat / 60);
  const secs = secToFormat % 60;
  const formatted = `${isOvertime ? '+' : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  display.textContent = formatted;
  document.title = `${isRunning ? '▶ ' : '⏸ '}${formatted} — Span Focus`;

  // Mise à jour de l'anneau circulaire
  let progress = 0;
  if (timerMode === 'stopwatch') {
    progress = (elapsedSeconds % 3600) / 3600;
  } else {
    progress = 1 - (secondsLeft / (durationMinutes * 60));
  }
  progress = Math.max(0, Math.min(1, progress));
  
  const offset = circumference * (1 - progress);
  if (ringCircle) ringCircle.style.strokeDashoffset = offset;
}

function setTimerMode(mode) {
  if (isRunning) toggleTimer();
  timerMode = mode;
  isOvertime = false;
  isBreakSession = false;
  display.classList.remove('overtime');

  document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`mode${mode.charAt(0).toUpperCase() + mode.slice(1)}`).classList.add('active');

  const presetContainer = document.getElementById('presetPills');
  display.classList.toggle('editable', mode === 'custom');

  if (mode === 'pomodoro') {
    presetContainer.style.display = 'flex';
    presetContainer.innerHTML = `
      <button class="preset-pill active" onclick="setDuration(25)">25m</button>
      <button class="preset-pill" onclick="setDuration(50)">50m</button>
      <button class="preset-pill" onclick="setDuration(5, true)">5m break</button>
    `;
    setDuration(25);
  } else if (mode === 'custom') {
    presetContainer.style.display = 'flex';
    presetContainer.innerHTML = `
      <button class="preset-pill active" onclick="setDuration(45)">45m</button>
      <button class="preset-pill" onclick="setDuration(60)">60m</button>
      <button class="preset-pill" onclick="setDuration(90)">90m</button>
    `;
    setDuration(45);
  } else if (mode === 'stopwatch') {
    presetContainer.style.display = 'none';
    elapsedSeconds = 0;
    updateDisplay();
  }
}

// Déclenche l'édition directe du chiffre en mode Custom
function startEditingCustomTime() {
  if (timerMode !== 'custom' || isRunning) return;
  const input = document.getElementById('customTimeInput');
  if (!input) return;

  display.style.display = 'none';
  input.style.display = 'block';
  input.value = durationMinutes;
  input.focus();
  input.select();
}

// Valide la nouvelle durée saisie
function finishEditingCustomTime() {
  const input = document.getElementById('customTimeInput');
  if (!input || input.style.display === 'none') return;

  const val = parseInt(input.value, 10);
  input.style.display = 'none';
  display.style.display = 'block';

  if (!isNaN(val) && val > 0 && val <= 180) {
    setDuration(val);
  } else {
    updateDisplay();
  }
}



function setDuration(mins, isBreak = false) {
  if (isRunning) toggleTimer();
  durationMinutes = mins;
  secondsLeft = mins * 60;
  isOvertime = false;
  isBreakSession = isBreak;
  display.classList.remove('overtime');
  updateDisplay();

  document.querySelectorAll('.preset-pill').forEach(b => {
    b.classList.toggle('active', b.textContent.startsWith(mins));
  });
}

// Empêche la mise en veille de l'écran pendant le minuteur
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    }
  } catch (err) {
    console.warn('Wake Lock not supported or blocked:', err.message);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// Calcule le temps réel à chaque seconde ou au réveil du téléphone
function tickTimer() {
  const now = Date.now();

  if (timerMode === 'stopwatch') {
    const totalElapsed = Math.floor((now - stopwatchStartTime) / 1000);
    elapsedSeconds = totalElapsed;
  } else {
    const remaining = Math.round((targetEndTime - now) / 1000);
    
    if (remaining >= 0) {
      secondsLeft = remaining;
    } else {
      secondsLeft = remaining;
      if (!isOvertime) {
        isOvertime = true;
        display.classList.add('overtime');
        playBell();
        toggleBtn.textContent = 'Confirm Session';
      }
    }
  }
  updateDisplay();
}

function updateTimerVisualState(running) {
  if (toggleBtn) toggleBtn.classList.toggle('is-running', running);
  const circleWrap = document.querySelector('.timer-circle-wrapper');
  if (circleWrap) circleWrap.classList.toggle('is-running', running);
  document.body.classList.toggle('timer-active-focus-mode', running);
}

function toggleTimer() {
  if (isRunning) {
    clearInterval(timerInterval);
    toggleBtn.textContent = 'Resume';
    isRunning = false;
    updateTimerVisualState(false);
    releaseWakeLock();
    handleTimerAudioSync(false, isBreakSession);
  } else {
    if (isOvertime) {
      confirmCompletedSession();
      return;
    }
    isRunning = true;
    toggleBtn.textContent = 'Pause';
    updateTimerVisualState(true);
    requestWakeLock();
    handleTimerAudioSync(true, isBreakSession);

    // Initialisation des repères d'heure exacte
    const now = Date.now();
    targetEndTime = now + (secondsLeft * 1000);
    stopwatchStartTime = now - (elapsedSeconds * 1000);

    timerInterval = setInterval(tickTimer, 1000);
  }
}

function confirmCompletedSession() {
  clearInterval(timerInterval);
  isRunning = false;
  isOvertime = false;
  updateTimerVisualState(false);
  display.classList.remove('overtime');
  releaseWakeLock();
  handleTimerAudioSync(false, isBreakSession);
  
  if (typeof triggerCelebration === 'function') triggerCelebration();
  if (typeof showToast === 'function') {
    showToast('Focus session recorded!', '🎉');
  } else {
    alert('Focus session recorded!');
  }
  resetTimer();
}

function resetTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  isOvertime = false;
  updateTimerVisualState(false);
  display.classList.remove('overtime');
  secondsLeft = durationMinutes * 60;
  elapsedSeconds = 0;
  toggleBtn.textContent = 'Start';
  releaseWakeLock();
  handleTimerAudioSync(false, isBreakSession);
  updateDisplay();
}

// Resynchronisation immédiate au déverrouillage de l'écran ou retour sur l'onglet
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isRunning) {
    tickTimer();
    requestWakeLock();
  }
});
