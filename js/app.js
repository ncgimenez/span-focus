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

// Support du Swipe horizontal sur mobile (Focus <-> Tasks <-> Track)
const views = ['focusView', 'tasksView', 'trackView'];
let currentViewIndex = 0;
let touchStartX = 0;
let touchEndX = 0;

function switchViewByIndex(index) {
  if (index < 0 || index >= views.length) return;
  currentViewIndex = index;
  const targetViewName = views[index].replace('View', '');
  // Appelle ta fonction existante de switch d'onglet
  if (typeof switchTab === 'function') {
    switchTab(targetViewName);
  }
}

document.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipeGesture();
}, { passive: true });

function handleSwipeGesture() {
  const swipeThreshold = 60; // Seuil minimum de déplacement en px
  const diff = touchEndX - touchStartX;

  if (Math.abs(diff) > swipeThreshold) {
    if (diff < 0 && currentViewIndex < views.length - 1) {
      // Swipe vers la gauche -> Onglet suivant
      switchViewByIndex(currentViewIndex + 1);
    } else if (diff > 0 && currentViewIndex > 0) {
      // Swipe vers la droite -> Onglet précédent
      switchViewByIndex(currentViewIndex - 1);
    }
  }
}

