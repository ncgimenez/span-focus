const appViews = ['focus', 'tasks', 'stats'];
let activeTabIndex = 0;

function switchView(viewName, btnElement) {
  if (window.innerWidth >= 650) {
    if (viewName === 'stats') toggleTrackModal();
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

// GESTION MODALE TRACK
function toggleTrackModal() {
  const modal = document.getElementById('trackModalOverlay');
  if (!modal) return;

  const isOpen = modal.style.display === 'flex';
  if (!isOpen) {
    // Aligner le curseur avec la valeur actuelle
    const targetMin = (window.SpanState && window.SpanState.dailyTargetMinutes) || 100;
    const modalRangeInput = document.getElementById('modalGoalRangeInput');
    const modalSummaryEl = document.getElementById('modalTargetSummary');
    if (modalRangeInput) modalRangeInput.value = targetMin;
    if (modalSummaryEl) modalSummaryEl.textContent = `${targetMin} min (~${Math.round(targetMin / 25)} blocks)`;

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

// Gestes tactiles sur mobile
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

// ==============================================================
// TOAST NOTIFICATIONS HELPER
// ==============================================================
function showToast(message, icon = '✨') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.innerHTML = `<span style="font-size: 15px;">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 2800);
}

// ==============================================================
// LIGHTWEIGHT CANVAS CELEBRATION (CONFETTI BURST)
// ==============================================================
function triggerCelebration(originX, originY) {
  const canvas = document.getElementById('celebrationCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#818cf8', '#10b981', '#fb7185', '#e2b340', '#ffffff'];
  const particles = [];
  const startX = originX || window.innerWidth / 2;
  const startY = originY || window.innerHeight / 2;

  for (let i = 0; i < 42; i++) {
    const angle = (Math.PI * 2 * i) / 42 + (Math.random() - 0.5);
    const speed = 3 + Math.random() * 5;
    particles.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.5,
      size: 4 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      decay: 0.02 + Math.random() * 0.02,
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 12
    });
  }

  let animId = null;
  function updateConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15; // Gravity
      p.alpha -= p.decay;
      p.rotation += p.vRot;

      if (p.alpha > 0) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    });

    if (alive) {
      animId = requestAnimationFrame(updateConfetti);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(animId);
    }
  }

  updateConfetti();
}

// ==============================================================
// SERVICE WORKER REGISTRATION (OFFLINE PWA)
// ==============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      console.log('Span Focus Service Worker registered:', reg.scope);
    }).catch((err) => {
      console.warn('Service Worker registration skipped:', err.message);
    });
  });
}
