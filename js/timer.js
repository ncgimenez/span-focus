let timerMode = 'pomodoro';
let durationMinutes = 25;
let secondsLeft = durationMinutes * 60;
let elapsedSeconds = 0;
let isRunning = false;
let isOvertime = false;
let timerInterval = null;

const display = document.getElementById('timeDisplay');
const toggleBtn = document.getElementById('btnToggle');

function updateDisplay() {
  let secToFormat = timerMode === 'stopwatch' ? elapsedSeconds : Math.abs(secondsLeft);
  const mins = Math.floor(secToFormat / 60);
  const secs = secToFormat % 60;
  const formatted = `${isOvertime ? '+' : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  display.textContent = formatted;
  document.title = `${isRunning ? '▶ ' : '⏸ '}${formatted} — Span Focus`;

  const progress = timerMode === 'stopwatch' ? Math.min(elapsedSeconds / 3600, 1) : 1 - (secondsLeft / (durationMinutes * 60));
  const curve = 28 - (progress * 12);
  const leaf = document.getElementById('growthLeaf');
  if (leaf) leaf.setAttribute('d', `M20 28 C20 28 ${16 + progress * 6} ${curve} 20 ${18 - progress * 4}`);
}

function setTimerMode(mode) {
  if (isRunning) toggleTimer();
  timerMode = mode;
  isOvertime = false;
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

function setDuration(mins) {
  if (isRunning) toggleTimer();
  durationMinutes = mins;
  secondsLeft = mins * 60;
  isOvertime = false;
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
  } else {
    if (isOvertime) {
      confirmCompletedSession();
      return;
    }
    isRunning = true;
    toggleBtn.textContent = 'Pause';
    timerInterval = setInterval(() => {
      if (timerMode === 'stopwatch') {
        elapsedSeconds++;
        logFocusedSecond();
      } else {
        secondsLeft--;
        if (secondsLeft >= 0) {
          logFocusedSecond();
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
  updateDisplay();
}
