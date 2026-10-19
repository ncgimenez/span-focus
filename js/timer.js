let timerMode = 'pomodoro';
let durationMinutes = 25;
let secondsLeft = durationMinutes * 60;
let elapsedSeconds = 0;
let isRunning = false;
let isOvertime = false;
let isBreakSession = false;
let timerInterval = null;

// Realtime tracking timestamps and screen wake lock
let targetEndTime = null;
let stopwatchStartTime = null;
let wakeLock = null;

// ==============================================================
// WEB WORKER TICKER (IMMUNE TO BROWSER BACKGROUND TAB THROTTLING)
// Modern browsers throttle setInterval to 1 execution/min in background tabs.
// A dedicated Web Worker guarantees 1-second ticks so document.title stays live!
// ==============================================================
let timerWorker = null;
try {
  timerWorker = new Worker('js/timer-worker.js?v=3.32');
  timerWorker.onmessage = function(e) {
    if (e.data === 'tick' && isRunning) {
      tickTimer();
    }
  };
  timerWorker.onerror = function() {
    timerWorker = null;
  };
} catch (e) {
  try {
    const workerBlob = new Blob([`
      let interval = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (!interval) {
            interval = setInterval(function() {
              self.postMessage('tick');
            }, 1000);
          }
        } else if (e.data === 'stop') {
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
        }
      };
    `], { type: 'application/javascript' });
    timerWorker = new Worker(URL.createObjectURL(workerBlob));
    timerWorker.onmessage = function(e) {
      if (e.data === 'tick' && isRunning) {
        tickTimer();
      }
    };
  } catch (err) {
    timerWorker = null;
  }
}

function startTimerTicker() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 1000);
  if (timerWorker) {
    try { timerWorker.postMessage('start'); } catch (e) {}
  }
}

function stopTimerTicker() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (timerWorker) {
    try { timerWorker.postMessage('stop'); } catch (e) {}
  }
}

// Supabase Realtime channel for cross-device sync
const timerChannel = window.supabaseClient ? window.supabaseClient.channel('timer_sync') : null;

if (timerChannel) {
  timerChannel
    .on('broadcast', { event: 'timer_state' }, ({ payload }) => {
      syncRemoteTimer(payload);
    })
    .subscribe();
}

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

function syncRemoteTimer(state) {
  isRunning = state.isRunning;
  timerMode = state.timerMode;
  durationMinutes = state.durationMinutes;
  isOvertime = state.isOvertime;
  isBreakSession = state.isBreakSession;

  if (isRunning) {
    targetEndTime = state.targetEndTime;
    stopwatchStartTime = state.stopwatchStartTime;

    startTimerTicker();
    if (toggleBtn) toggleBtn.textContent = isBreakSession ? 'Pause Break' : 'Pause';
    requestWakeLock();
  } else {
    stopTimerTicker();
    secondsLeft = state.secondsLeft;
    elapsedSeconds = state.elapsedSeconds;
    if (toggleBtn) toggleBtn.textContent = isBreakSession ? 'Resume Break' : 'Resume';
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
  let secToFormat = timerMode === 'stopwatch' ? elapsedSeconds : Math.max(0, Math.abs(secondsLeft));
  const mins = Math.floor(secToFormat / 60);
  const secs = secToFormat % 60;
  const formatted = `${isOvertime ? '+' : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  if (display) display.textContent = formatted;

  // Real-time dynamic document.title (cleanly formatted for universal browser tab visibility)
  const activeTask = (window.SpanState && window.SpanState.activeTask) ? window.SpanState.activeTask : null;
  const taskTitle = (activeTask && typeof activeTask.title === 'string')
    ? activeTask.title.replace(/#[\w\-]+/g, '').trim().substring(0, 24)
    : '';

  if (isRunning) {
    if (isBreakSession) {
      document.title = `(${formatted}) ☕ Break — Span Focus`;
    } else if (taskTitle) {
      document.title = `(${formatted}) ▶ ${taskTitle} — Span Focus`;
    } else {
      document.title = `(${formatted}) ▶ Span Focus`;
    }
  } else if (secondsLeft === durationMinutes * 60) {
    document.title = `(${formatted}) Span Focus`;
  } else {
    document.title = `(${formatted}) ⏸ Span Focus`;
  }

  // Also update live text on navigation bar Focus button
  const navFocusSpan = document.querySelector('#nav-btn-focus span');
  if (navFocusSpan) {
    navFocusSpan.textContent = isRunning ? `Focus (${formatted})` : 'Focus';
  }

  // Ring progress update
  let progress = 0;
  if (timerMode === 'stopwatch') {
    progress = (elapsedSeconds % 3600) / 3600;
  } else {
    const totalSecs = (durationMinutes * 60) || 1;
    progress = 1 - (secondsLeft / totalSecs);
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
  if (display) display.classList.remove('overtime');

  document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
  const btnEl = document.getElementById(`mode${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
  if (btnEl) btnEl.classList.add('active');

  const presetContainer = document.getElementById('presetPills');
  if (display) display.classList.toggle('editable', mode === 'custom');

  if (mode === 'pomodoro') {
    if (presetContainer) {
      presetContainer.style.display = 'flex';
      presetContainer.innerHTML = `
        <button class="preset-pill active" onclick="setDuration(25)">30m (25+5)</button>
        <button class="preset-pill" onclick="setDuration(50)">60m (50+10)</button>
        <button class="preset-pill" onclick="setDuration(5, true)">5m break</button>
      `;
    }
    const cycleIndicator = document.getElementById('timerCycleIndicator');
    if (cycleIndicator) cycleIndicator.style.display = 'flex';
    setDuration(25);
  } else if (mode === 'custom') {
    const cycleIndicator = document.getElementById('timerCycleIndicator');
    if (cycleIndicator) cycleIndicator.style.display = 'none';
    if (presetContainer) {
      presetContainer.style.display = 'flex';
      presetContainer.innerHTML = `
        <button class="preset-pill active" onclick="setDuration(45)">45m</button>
        <button class="preset-pill" onclick="setDuration(60)">60m</button>
        <button class="preset-pill" onclick="setDuration(90)">90m</button>
      `;
    }
    setDuration(45);
  } else if (mode === 'stopwatch') {
    const cycleIndicator = document.getElementById('timerCycleIndicator');
    if (cycleIndicator) cycleIndicator.style.display = 'none';
    if (presetContainer) presetContainer.style.display = 'none';
    elapsedSeconds = 0;
    updateDisplay();
  }
}

function startEditingCustomTime() {
  if (timerMode !== 'custom' || isRunning) return;
  const input = document.getElementById('customTimeInput');
  if (!input) return;

  if (display) display.style.display = 'none';
  input.style.display = 'block';
  input.value = durationMinutes;
  input.focus();
  input.select();
}

function finishEditingCustomTime() {
  const input = document.getElementById('customTimeInput');
  if (!input || input.style.display === 'none') return;

  const val = parseInt(input.value, 10);
  input.style.display = 'none';
  if (display) display.style.display = 'block';

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
  if (display) display.classList.remove('overtime');
  updateDisplay();

  document.querySelectorAll('.preset-pill').forEach(b => {
    const isAct = (mins === 25 && b.textContent.includes('25')) ||
                  (mins === 50 && b.textContent.includes('50')) ||
                  (mins === 5 && isBreak && b.textContent.includes('break')) ||
                  b.textContent.startsWith(mins);
    b.classList.toggle('active', isAct);
  });
  updateTimerVisualState(isRunning);
}

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

let lastTickTimestamp = 0;

// 1-second ticker logic with automated 30m Pomodoro cycle (25m Focus -> 5m Break)
function tickTimer() {
  const now = Date.now();
  if (now - lastTickTimestamp < 450) return; // avoid duplicate worker/interval rapid double-tick
  lastTickTimestamp = now;

  if (timerMode === 'stopwatch') {
    const totalElapsed = Math.floor((now - stopwatchStartTime) / 1000);
    elapsedSeconds = totalElapsed;
  } else {
    const remaining = Math.round((targetEndTime - now) / 1000);
    
    if (remaining > 0) {
      secondsLeft = remaining;
    } else {
      // Reached 0: handle cycle transitions
      if (timerMode === 'pomodoro') {
        if (!isBreakSession) {
          // 25m Focus cycle finished: automatically trigger 5m break!
          if (typeof playBell === 'function') playBell();
          if (typeof triggerCelebration === 'function') triggerCelebration();
          if (typeof showToast === 'function') {
            showToast('25m Focus finished! 5m break starts now ☕', '🎉');
          }

          isBreakSession = true;
          durationMinutes = 5;
          secondsLeft = 5 * 60;
          targetEndTime = Date.now() + (5 * 60 * 1000);
          handleTimerAudioSync(true, true);
          if (toggleBtn) toggleBtn.textContent = 'Pause Break';
          updateTimerVisualState(true);
        } else {
          // 5m Break finished: notify and prepare next 25m focus cycle!
          if (typeof playBell === 'function') playBell();
          if (typeof showToast === 'function') {
            showToast('☕ Break completed! Ready for next 25m focus 🚀', '☕');
          }

          stopTimerTicker();
          isRunning = false;
          isBreakSession = false;
          isOvertime = false;
          durationMinutes = 25;
          secondsLeft = 25 * 60;
          elapsedSeconds = 0;
          updateTimerVisualState(false);
          if (display) display.classList.remove('overtime');
          if (toggleBtn) toggleBtn.textContent = 'Start Focus (25m)';
          releaseWakeLock();
          handleTimerAudioSync(false, false);
        }
      } else {
        // Custom timer overtime handling
        secondsLeft = remaining;
        if (!isOvertime) {
          isOvertime = true;
          if (display) display.classList.add('overtime');
          if (typeof playBell === 'function') playBell();
          if (toggleBtn) toggleBtn.textContent = 'Confirm Session';
        }
      }
    }
  }
  updateDisplay();
}

function updateTimerVisualState(running) {
  if (toggleBtn) {
    toggleBtn.classList.toggle('is-running', running);
    toggleBtn.classList.toggle('is-break', isBreakSession);
  }
  const circleWrap = document.querySelector('.timer-circle-wrapper');
  if (circleWrap) {
    circleWrap.classList.toggle('is-running', running);
    circleWrap.classList.toggle('is-break', isBreakSession);
  }

  const skipBtn = document.getElementById('btnSkipBreak');
  if (skipBtn) {
    skipBtn.style.display = isBreakSession ? 'inline-flex' : 'none';
  }

  document.body.classList.toggle('timer-active-focus-mode', running && !isBreakSession);
  document.body.classList.toggle('timer-active-break-mode', running && isBreakSession);

  const focusStep = document.querySelector('.timer-cycle-indicator .step-focus');
  const breakStep = document.querySelector('.timer-cycle-indicator .step-break');
  if (focusStep && breakStep) {
    focusStep.classList.toggle('active', !isBreakSession);
    breakStep.classList.toggle('active', isBreakSession);
  }
}

function skipBreak() {
  if (!isBreakSession) return;
  stopTimerTicker();
  isRunning = false;
  isBreakSession = false;
  isOvertime = false;
  durationMinutes = 25;
  secondsLeft = 25 * 60;
  elapsedSeconds = 0;
  updateTimerVisualState(false);
  if (display) display.classList.remove('overtime');
  if (toggleBtn) toggleBtn.textContent = 'Start Focus (25m)';
  releaseWakeLock();
  handleTimerAudioSync(false, false);
  updateDisplay();
  if (typeof showToast === 'function') {
    showToast('Pause passée ⏩ Prêt pour le prochain focus (25m) !', '⚡');
  }
}

function toggleTimer() {
  if (isRunning) {
    stopTimerTicker();
    if (toggleBtn) toggleBtn.textContent = isBreakSession ? 'Resume Break' : 'Resume';
    isRunning = false;
    updateTimerVisualState(false);
    releaseWakeLock();
    handleTimerAudioSync(false, isBreakSession);
    updateDisplay();
  } else {
    if (isOvertime) {
      confirmCompletedSession();
      return;
    }
    isRunning = true;
    if (toggleBtn) toggleBtn.textContent = isBreakSession ? 'Pause Break' : 'Pause';
    updateTimerVisualState(true);
    requestWakeLock();
    handleTimerAudioSync(true, isBreakSession);

    const now = Date.now();
    targetEndTime = now + (secondsLeft * 1000);
    stopwatchStartTime = now - (elapsedSeconds * 1000);

    startTimerTicker();
    updateDisplay();
  }
}

function confirmCompletedSession() {
  stopTimerTicker();
  isRunning = false;
  isOvertime = false;
  updateTimerVisualState(false);
  if (display) display.classList.remove('overtime');
  releaseWakeLock();
  handleTimerAudioSync(false, isBreakSession);
  
  if (typeof triggerCelebration === 'function') triggerCelebration();
  if (typeof showToast === 'function') {
    showToast('Focus session recorded!', '🎉');
  }
  resetTimer();
}

function resetTimer() {
  stopTimerTicker();
  isRunning = false;
  isOvertime = false;
  isBreakSession = false;
  updateTimerVisualState(false);
  if (display) display.classList.remove('overtime');
  secondsLeft = durationMinutes * 60;
  elapsedSeconds = 0;
  if (toggleBtn) toggleBtn.textContent = 'Start';
  releaseWakeLock();
  handleTimerAudioSync(false, false);
  updateDisplay();
}

// Immediate resync upon returning to tab or waking screen
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isRunning) {
    tickTimer();
    requestWakeLock();
  }
});

// Initialize display and tab title immediately on startup
updateDisplay();
