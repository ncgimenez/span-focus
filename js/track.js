window.SpanState = window.SpanState || {};

window.SpanState.dailyTargetMinutes = parseInt(localStorage.getItem('span_daily_target_minutes')) || 100;
window.SpanState.trackingData = JSON.parse(localStorage.getItem('span_tracking')) || {
  date: new Date().toISOString().slice(0, 10),
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

// VÉRIFICATION DE MINUIT : Remise automatique à 0%
function checkMidnightReset() {
  const todayStr = new Date().toISOString().slice(0, 10);
  
  if (trackingData.date !== todayStr) {
    trackingData.date = todayStr;
    trackingData.totalSecondsToday = 0;
    trackingData.categories = { Code: 0, Study: 0, Write: 0, Admin: 0, None: 0 };
    
    window.SpanState.trackingData = trackingData;
    localStorage.setItem('span_tracking', JSON.stringify(trackingData));
    
    updateGoalBar();
    renderChart();
    if (typeof saveStateToCloud === 'function') saveStateToCloud();
  }
}

function logFocusedSecond() {
  checkMidnightReset();
  trackingData.totalSecondsToday++;
  
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
  checkMidnightReset();
  const targetSec = dailyTargetMinutes * 60;
  const pct = Math.min(Math.round((trackingData.totalSecondsToday / targetSec) * 100), 100);
  
  const percentEl = document.getElementById('goalPercent');
  const barEl = document.getElementById('goalBar');
  if (percentEl) percentEl.textContent = `${pct}%`;
  if (barEl) barEl.style.width = `${pct}%`;
}

function updateDailyGoalTarget(val) {
  dailyTargetMinutes = parseInt(val, 10);
  window.SpanState.dailyTargetMinutes = dailyTargetMinutes;
  localStorage.setItem('span_daily_target_minutes', dailyTargetMinutes);
  
  const summaryEl = document.getElementById('targetDisplaySummary');
  if (summaryEl) {
    summaryEl.textContent = `${dailyTargetMinutes} min (~${Math.round(dailyTargetMinutes / 25)} blocks)`;
  }
  
  const modalSummaryEl = document.getElementById('modalTargetSummary');
  if (modalSummaryEl) {
    modalSummaryEl.textContent = `${dailyTargetMinutes} min (~${Math.round(dailyTargetMinutes / 25)} blocks)`;
  }

  // Aligner les deux curseurs (mobile & modale)
  const rangeInput = document.getElementById('goalRangeInput');
  const modalRangeInput = document.getElementById('modalGoalRangeInput');
  if (rangeInput && rangeInput.value != val) rangeInput.value = val;
  if (modalRangeInput && modalRangeInput.value != val) modalRangeInput.value = val;

  updateGoalBar();
  if (typeof saveStateToCloud === 'function') saveStateToCloud();
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

  // Cible à la fois le panneau mobile et la modale Track
  const pies = [document.getElementById('pieChart'), document.getElementById('modalPieChart')].filter(Boolean);
  const legends = [document.getElementById('pieLegend'), document.getElementById('modalPieLegend')].filter(Boolean);

  if (pies.length === 0) return;

  if (total === 0) {
    pies.forEach(p => p.style.background = 'conic-gradient(rgba(255,255,255,0.08) 0deg 360deg)');
    legends.forEach(l => l.innerHTML = '<span style="color:var(--text-muted)">No sessions recorded today</span>');
    return;
  }

  let gradientSteps = [];
  let currentDeg = 0;
  let legendHtml = '';

  const labels = (window.SpanState && window.SpanState.categoryLabels) || JSON.parse(localStorage.getItem('span_category_labels')) || {};

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

    let displayName = 'None';
    if (cat !== 'None') {
      displayName = labels[cat] || cat;
    }

    legendHtml += `
      <div class="legend-item">
        <span><span class="legend-dot" style="background:${catColor}"></span>${displayName}</span>
        <span style="font-weight:600">${valString}</span>
      </div>
    `;
  }

  pies.forEach(p => {
    if (gradientSteps.length > 0) p.style.background = `conic-gradient(${gradientSteps.join(', ')})`;
  });
  legends.forEach(l => l.innerHTML = legendHtml);
}

// Vérification immédiate au chargement
checkMidnightReset();
