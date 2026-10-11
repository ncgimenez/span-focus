// Branché sur l'état global partagé
window.SpanState = window.SpanState || {};

window.SpanState.dailyTargetMinutes = parseInt(localStorage.getItem('span_daily_target_minutes')) || 100;
window.SpanState.trackingData = JSON.parse(localStorage.getItem('span_tracking')) || {
  totalSecondsToday: 0,
  categories: { Code: 0, Study: 0, Write: 0, Admin: 0, None: 0 }
};

var dailyTargetMinutes = window.SpanState.dailyTargetMinutes;
var trackingData = window.SpanState.trackingData;

let showAsPercentage = true;
const colors = { 
  Code: '#6366f1', 
  Study: '#10b981', 
  Write: '#ec4899', 
  Admin: '#f59e0b',
  None: '#71717a'
};

function logFocusedSecond() {
  trackingData.totalSecondsToday++;
  
  // Récupération sécurisée de la tâche active
  const currentTask = (window.SpanState && window.SpanState.activeTask) ? window.SpanState.activeTask : null;
  const rawCat = (currentTask && currentTask.category) ? currentTask.category : 'None';
  
  trackingData.categories[rawCat] = (trackingData.categories[rawCat] || 0) + 1;
  
  if (trackingData.totalSecondsToday % 5 === 0) {
    localStorage.setItem('span_tracking', JSON.stringify(trackingData));
    updateGoalBar();
    renderChart();
    if (typeof saveStateToCloud === 'function') saveStateToCloud();
  }
}

function updateGoalBar() {
  const targetSec = dailyTargetMinutes * 60;
  const pct = Math.min(Math.round((trackingData.totalSecondsToday / targetSec) * 100), 100);
  const percentEl = document.getElementById('goalPercent');
  const barEl = document.getElementById('goalBar');
  if (percentEl) percentEl.textContent = `${pct}%`;
  if (barEl) barEl.style.width = `${pct}%`;
}

function updateDailyGoalTarget(val) {
  dailyTargetMinutes = parseInt(val);
  window.SpanState.dailyTargetMinutes = dailyTargetMinutes;
  localStorage.setItem('span_daily_target_minutes', dailyTargetMinutes);
  const summaryEl = document.getElementById('targetDisplaySummary');
  if (summaryEl) {
    summaryEl.textContent = `${dailyTargetMinutes} min (~${Math.round(dailyTargetMinutes / 25)} blocks)`;
  }
  updateGoalBar();
}

function toggleChartUnit() {
  showAsPercentage = !showAsPercentage;
  const btn = document.getElementById('btnToggleUnit');
  if (btn) btn.textContent = `Show: ${showAsPercentage ? 'Time' : '%'}`;
  renderChart();
}

function renderChart() {
  const cats = trackingData.categories;
  const total = Object.values(cats).reduce((a, b) => a + b, 0);
  const pie = document.getElementById('pieChart');
  const legend = document.getElementById('pieLegend');

  if (!pie || !legend) return;

  if (total === 0) {
    pie.style.background = 'conic-gradient(rgba(255,255,255,0.08) 0deg 360deg)';
    legend.innerHTML = '<span style="color:var(--text-muted)">No sessions recorded today</span>';
    return;
  }

  let gradientSteps = [];
  let currentDeg = 0;
  legend.innerHTML = '';

  const labels = (window.SpanState && window.SpanState.categoryLabels) || {};

  for (const [cat, secs] of Object.entries(cats)) {
    if (secs === 0) continue;

    const slicePct = (secs / total);
    const deg = slicePct * 360;
    const catColor = colors[cat] || '#71717a';
    gradientSteps.push(`${catColor} ${currentDeg}deg ${currentDeg + deg}deg`);
    currentDeg += deg;

    const valString = showAsPercentage 
      ? `${Math.round(slicePct * 100)}%` 
      : `${Math.round(secs / 60)} min`;

    let displayName = 'Undefined';
    if (cat !== 'None') {
      displayName = labels[cat] || cat;
    }

    legend.innerHTML += `
      <div class="legend-item">
        <span><span class="legend-dot" style="background:${catColor}"></span>${displayName}</span>
        <span style="font-weight:600">${valString}</span>
      </div>
    `;
  }

  if (gradientSteps.length > 0) {
    pie.style.background = `conic-gradient(${gradientSteps.join(', ')})`;
  }
}

// Clic sur la barre de goal -> redirection fluide vers Track
function goToTrackView() {
  if (typeof switchView === 'function') {
    switchView('stats', document.getElementById('nav-btn-stats'));
  }
}

// Export / Import
function exportData() {
  const exportObject = { 
    tasks: window.SpanState.tasks || tasks, 
    trackingData, 
    activeTask: window.SpanState.activeTask || activeTask, 
    dailyTargetMinutes, 
    categoryLabels: window.SpanState.categoryLabels || {},
    version: "1.2" 
  };
  const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `span-focus-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported.tasks) {
        tasks = imported.tasks;
        window.SpanState.tasks = tasks;
      }
      if (imported.trackingData) {
        trackingData = imported.trackingData;
        window.SpanState.trackingData = trackingData;
      }
      if (imported.activeTask) {
        activeTask = imported.activeTask;
        window.SpanState.activeTask = activeTask;
      }
      if (imported.dailyTargetMinutes) {
        dailyTargetMinutes = imported.dailyTargetMinutes;
        window.SpanState.dailyTargetMinutes = dailyTargetMinutes;
      }
      if (imported.categoryLabels) {
        categoryLabels = imported.categoryLabels;
        window.SpanState.categoryLabels = categoryLabels;
        localStorage.setItem('span_category_labels', JSON.stringify(categoryLabels));
      }
      saveTasks();
      localStorage.setItem('span_tracking', JSON.stringify(trackingData));
      updateGoalBar();
      renderChart();
      if (typeof updateCategoryDOMNames === 'function') updateCategoryDOMNames();
      alert('Preferences imported!');
    } catch {
      alert('Invalid file format.');
    }
  };
  reader.readAsText(file);
}
