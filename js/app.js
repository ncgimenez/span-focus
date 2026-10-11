const appViews = ['focus', 'tasks', 'stats'];
let activeTabIndex = 0;

function switchView(viewName, btnElement) {
  const index = appViews.indexOf(viewName);
  if (index === -1) return;

  activeTabIndex = index;

  // Déplacement fluide de la glissière horizontale
  const slider = document.getElementById('viewsSlider');
  if (slider) {
    slider.style.transform = `translateX(-${index * (100 / 3)}%)`;
  }

  // Mise à jour de la navbar
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const navBtn = btnElement || document.getElementById(`nav-btn-${viewName}`);
  if (navBtn) navBtn.classList.add('active');

  // Titre dans le header
  const titles = { focus: 'Focus', tasks: 'Tasks', stats: 'Track' };
  const header = document.getElementById('headerTitle');
  if (header && titles[viewName]) header.textContent = titles[viewName];

  if (viewName === 'stats' && typeof renderChart === 'function') {
    renderChart();
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
  if (goalInput && typeof dailyTargetMinutes !== 'undefined') {
    goalInput.value = dailyTargetMinutes;
    const targetSummary = document.getElementById('targetDisplaySummary');
    if (targetSummary) {
      targetSummary.textContent = `${dailyTargetMinutes} min (~${Math.round(dailyTargetMinutes / 25)} blocks)`;
    }
  }

  if (typeof updateCategoryDOMNames === 'function') updateCategoryDOMNames();
  if (typeof updateSoundButtonUI === 'function') updateSoundButtonUI();
  if (typeof updateDisplay === 'function') updateDisplay();
  if (typeof renderTasks === 'function') renderTasks();
  if (typeof updateSpotlightUI === 'function') updateSpotlightUI();
  if (typeof updateGoalBar === 'function') updateGoalBar();
});


// Gestion des gestes tactiles (séparation stricte Swipe horizontal vs Pull-to-refresh vertical)
let touchStartX = 0;
let touchStartY = 0;
let touchDiffX = 0;
let touchDiffY = 0;
let isHorizontalGesture = null;

document.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchDiffX = 0;
  touchDiffY = 0;
  isHorizontalGesture = null;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  touchDiffX = e.touches[0].clientX - touchStartX;
  touchDiffY = e.touches[0].clientY - touchStartY;

  // Verrouille la direction dès 10px de mouvement
  if (isHorizontalGesture === null && (Math.abs(touchDiffX) > 10 || Math.abs(touchDiffY) > 10)) {
    isHorizontalGesture = Math.abs(touchDiffX) > Math.abs(touchDiffY);
  }
}, { passive: true });

document.addEventListener('touchend', () => {
  // Swipe Horizontal (Changement d'onglet)
  if (isHorizontalGesture === true && Math.abs(touchDiffX) > 50) {
    if (touchDiffX < 0 && activeTabIndex < appViews.length - 1) {
      switchView(appViews[activeTabIndex + 1]);
    } else if (touchDiffX > 0 && activeTabIndex > 0) {
      switchView(appViews[activeTabIndex - 1]);
    }
  }

  // Pull-to-refresh Vertical (Rechargement page)
  if (isHorizontalGesture === false && touchDiffY > 85 && window.scrollY === 0) {
    if (navigator.vibrate) navigator.vibrate(15);
    window.location.reload();
  }

  touchStartX = 0;
  touchStartY = 0;
  touchDiffX = 0;
  touchDiffY = 0;
  isHorizontalGesture = null;
});

// --- NAVIGATION PAR SWIPE HORIZONTAL SUR TRACKPAD (MAC / PC) ---
let isWheelLocked = false;
let wheelCooldownTimer = null;

window.addEventListener('wheel', (e) => {
  // Ignore si l'utilisateur est dans une modale ouverte ou fait défiler une liste verticalement
  const isModalOpen = document.querySelector('.modal-overlay[style*="display: flex"]');
  if (isModalOpen) return;

  // On vérifie que le geste est nettement horizontal (deltaX dominant)
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 40) {
    if (isWheelLocked) return;

    if (e.deltaX > 0 && activeTabIndex < appViews.length - 1) {
      // Glissement vers la gauche (doigts vers la gauche) -> Vue suivante
      switchView(appViews[activeTabIndex + 1]);
      lockWheelNavigation();
    } else if (e.deltaX < 0 && activeTabIndex > 0) {
      // Glissement vers la droite (doigts vers la droite) -> Vue précédente
      switchView(appViews[activeTabIndex - 1]);
      lockWheelNavigation();
    }
  }
}, { passive: true });

function lockWheelNavigation() {
  isWheelLocked = true;
  clearTimeout(wheelCooldownTimer);
  // Bloque les déclenchements répétés pendant 450ms le temps que le geste se termine
  wheelCooldownTimer = setTimeout(() => {
    isWheelLocked = false;
  }, 450);
}

