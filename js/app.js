function switchView(viewName, btnElement) {
  document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  document.getElementById(`view-${viewName}`).classList.add('active');
  if (btnElement) btnElement.classList.add('active');

  const titles = { focus: 'Focus', tasks: 'Tasks', stats: 'Track' };
  document.getElementById('headerTitle').textContent = titles[viewName];
  if (viewName === 'stats') renderChart();
}

// Thème Dark / Light
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('span_theme', next);
  document.getElementById('themeToggleBtn').textContent = next.charAt(0).toUpperCase() + next.slice(1);
  
  const metaColor = document.getElementById('themeMetaColor');
  if (metaColor) metaColor.setAttribute('content', next === 'dark' ? '#0d0d0f' : '#f8f8fa');
}

function openSettingsModal() { document.getElementById('settingsModalOverlay').style.display = 'flex'; }
function closeSettingsModal() { document.getElementById('settingsModalOverlay').style.display = 'none'; }

// Init
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('span_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.getElementById('themeToggleBtn').textContent = savedTheme.charAt(0).toUpperCase() + savedTheme.slice(1);

  document.getElementById('goalRangeInput').value = dailyTargetMinutes;
  document.getElementById('targetDisplaySummary').textContent = `${dailyTargetMinutes} min (~${Math.round(dailyTargetMinutes/25)} blocks)`;

  updateSoundButtonUI();
  updateDisplay();
  renderTasks();
  updateSpotlightUI();
  updateGoalBar();
});
// Navigation Swipe horizontal (Focus <-> Tasks <-> Track)
const appViews = ['focus', 'tasks', 'stats'];
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  const diffX = touchEndX - touchStartX;
  const threshold = 60;

  if (Math.abs(diffX) > threshold) {
    const activeBtn = document.querySelector('.nav-btn.active');
    const currentTab = activeBtn ? activeBtn.id.replace('nav-btn-', '') : 'focus';
    const currentIndex = appViews.indexOf(currentTab);

    if (diffX < 0 && currentIndex < appViews.length - 1) {
      const nextTab = appViews[currentIndex + 1];
      switchView(nextTab, document.getElementById(`nav-btn-${nextTab}`));
    } else if (diffX > 0 && currentIndex > 0) {
      const prevTab = appViews[currentIndex - 1];
      switchView(prevTab, document.getElementById(`nav-btn-${prevTab}`));
    }
  }
}, { passive: true });

// Pull-to-refresh
let pullStartY = 0;
let pullDiffY = 0;

window.addEventListener('touchstart', (e) => {
  pullStartY = window.scrollY === 0 ? e.touches[0].clientY : 0;
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (pullStartY === 0) return;
  pullDiffY = e.touches[0].clientY - pullStartY;
}, { passive: true });

window.addEventListener('touchend', () => {
  if (pullDiffY > 80 && window.scrollY === 0) {
    if (navigator.vibrate) navigator.vibrate(15);
    window.location.reload();
  }
  pullStartY = 0;
  pullDiffY = 0;
});
