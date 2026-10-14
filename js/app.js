const appViews = ['focus', 'tasks', 'stats'];
let activeTabIndex = 0;

function switchView(viewName, btnElement) {
  // Sur grand écran (mode Dashboard), le switch est ignoré car tout est visible
  if (window.innerWidth >= 650) {
    if (viewName === 'stats') toggleStatsModal();
    return;
  }

  const index = appViews.indexOf(viewName);
  if (index === -1) return;

  activeTabIndex = index;
  localStorage.setItem('span_active_view', viewName);

  const slider = document.getElementById('viewsSlider');
  if (slider) {
    slider.style.transform = `translateX(-${index * (100 / 3)}%)`;
  }

  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const navBtn = btnElement || document.getElementById(`nav-btn-${viewName}`);
  if (navBtn) navBtn.classList.add('active');

  const titles = { focus: 'Focus', tasks: 'Tasks', stats: 'Track' };
  const header = document.getElementById('headerTitle');
  if (header && titles[viewName]) header.textContent = titles[viewName];

  if (viewName === 'stats' && typeof renderChart === 'function') {
    renderChart();
  }
}

// GESTION MODALE STATS
function toggleStatsModal() {
  const modal = document.getElementById('statsModalOverlay');
  const modalContent = document.getElementById('modalStatsContent');
  const originalStats = document.getElementById('view-stats');

  if (!modal) return;

  const isOpen = modal.style.display === 'flex';
  if (!isOpen) {
    if (modalContent && originalStats) {
      modalContent.innerHTML = originalStats.innerHTML;
    }
    modal.style.display = 'flex';
    if (typeof renderChart === 'function') renderChart();
  } else {
    modal.style.display = 'none';
  }
}

// Thème Dark / Light
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('span_theme', next);
  
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) toggleBtn.textContent = next.charAt(0).toUpperCase() + next.slice(1);
  
  const metaColor = document.getElementById('themeMetaColor');
  if (metaColor) metaColor.setAttribute('content', next === 'dark' ? '#0d0d0f' : '#f8f8fa');
}

function openSettingsModal() { 
  const modal = document.getElementById('settingsModalOverlay');
  if (modal) modal.style.display = 'flex'; 
}

function closeSettingsModal() { 
  const modal = document.getElementById('settingsModalOverlay');
  if (modal) modal.style.display = 'none'; 
}

// Initialisation globale
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('span_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) toggleBtn.textContent = savedTheme.charAt(0).toUpperCase() + savedTheme.slice(1);

  const goalInput = document.getElementById('goalRangeInput');
  const targetMin = (window.SpanState && window.SpanState.dailyTargetMinutes) || 100;
  if (goalInput) {
    goalInput.value = targetMin;
    const targetSummary = document.getElementById('targetDisplaySummary');
    if (targetSummary) {
      targetSummary.textContent = `${targetMin} min (~${Math.round(targetMin / 25)} blocks)`;
    }
  }

  if (typeof updateCategoryDOMNames === 'function') updateCategoryDOMNames();
  if (typeof updateSoundButtonUI === 'function') updateSoundButtonUI();
  if (typeof updateDisplay === 'function') updateDisplay();
  if (typeof renderTasks === 'function') renderTasks();
  if (typeof updateSpotlightUI === 'function') updateSpotlightUI();
  if (typeof updateGoalBar === 'function') updateGoalBar();

  if (window.innerWidth < 650) {
    const savedView = localStorage.getItem('span_active_view') || 'focus';
    if (savedView !== 'focus') switchView(savedView);
  }
});

// Écoute des redimensionnements de fenêtre
window.addEventListener('resize', () => {
  const slider = document.getElementById('viewsSlider');
  if (window.innerWidth >= 650 && slider) {
    slider.style.transform = 'none';
  } else if (window.innerWidth < 650) {
    switchView(appViews[activeTabIndex]);
  }
});

// GESTES TACTILES (SUR MOBILE UNIQUEMENT)
let touchStartX = 0;
let touchStartY = 0;
let touchDiffX = 0;
let touchDiffY = 0;
let isHorizontalGesture = null;

document.addEventListener('touchstart', (e) => {
  if (window.innerWidth >= 650) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchDiffX = 0;
  touchDiffY = 0;
  isHorizontalGesture = null;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (window.innerWidth >= 650) return;
  touchDiffX = e.touches[0].clientX - touchStartX;
  touchDiffY = e.touches[0].clientY - touchStartY;

  if (isHorizontalGesture === null && (Math.abs(touchDiffX) > 8 || Math.abs(touchDiffY) > 8)) {
    isHorizontalGesture = Math.abs(touchDiffX) > Math.abs(touchDiffY);
  }
}, { passive: true });

document.addEventListener('touchend', () => {
  if (window.innerWidth >= 650) return;
  if (isHorizontalGesture === true && Math.abs(touchDiffX) > 50) {
    if (touchDiffX < 0 && activeTabIndex < appViews.length - 1) {
      switchView(appViews[activeTabIndex + 1]);
    } else if (touchDiffX > 0 && activeTabIndex > 0) {
      switchView(appViews[activeTabIndex - 1]);
    }
  }
  touchStartX = 0;
  touchStartY = 0;
  touchDiffX = 0;
  touchDiffY = 0;
  isHorizontalGesture = null;
});
