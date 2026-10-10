let timerMode = 'pomodoro';
let durationMinutes = 25;
let secondsLeft = durationMinutes * 60;
let elapsedSeconds = 0;
let isRunning = false;
let isOvertime = false;
let isBreakSession = false;
let timerInterval = null;

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
  if (mode === 'pomodoro') {
    presetContainer.style.display = 'flex';
    setDuration(25);
  } else if (mode === 'custom') {
    presetContainer.style.display = 'none';
    const userMin = prompt('Enter focus duration (minutes):', '45');
    setDuration(parseInt(userMin) || 25);
  } else if (mode === 'stopwatch') {
    presetContainer.style.display = 'none';
    elapsedSeconds = 0;
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

function toggleTimer() {
  if (isRunning) {
    clearInterval(timerInterval);
    toggleBtn.textContent = 'Resume';
    isRunning = false;
    handleTimerAudioSync(false, isBreakSession);
  } else {
    if (isOvertime) {
      confirmCompletedSession();
      return;
    }
    isRunning = true;
    toggleBtn.textContent = 'Pause';
    handleTimerAudioSync(true, isBreakSession);

    timerInterval = setInterval(() => {
      if (timerMode === 'stopwatch') {
        elapsedSeconds++;
        logFocusedSecond();
      } else {
        secondsLeft--;
        if (secondsLeft >= 0) {
          if (!isBreakSession) logFocusedSecond();
        } else {
          if (!isOvertime) {
            isOvertime = true;
            display.classList.add('overtime');
            playBell();
            toggleBtn.textContent = 'Confirm Session';
          }
        }
      }
      updateDisplay();
    }, 1000);
  }
}

function confirmCompletedSession() {
  clearInterval(timerInterval);
  isRunning = false;
  isOvertime = false;
  display.classList.remove('overtime');
  handleTimerAudioSync(false, isBreakSession);
  alert('Focus session recorded!');
  resetTimer();
}

function resetTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  isOvertime = false;
  display.classList.remove('overtime');
  secondsLeft = durationMinutes * 60;
  elapsedSeconds = 0;
  toggleBtn.textContent = 'Start';
  handleTimerAudioSync(false, isBreakSession);
  updateDisplay();
}
