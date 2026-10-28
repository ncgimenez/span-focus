window.SpanState = window.SpanState || {};

let dailyGoalMinutes = parseInt(localStorage.getItem('span_daily_goal_minutes')) || 100;
let showDailyGoalOnHome = localStorage.getItem('span_show_daily_goal_tracker') === 'true';
let showTimeInChart = false;

// Color definition aligned with Span Plan DNA
const TRACK_COLORS = {
  Work: '#818cf8',
  Home: '#10b981',
  Fun: '#fb7185'
};

function updateGoalTrackerVisibility() {
  const goalTracker = document.getElementById('homeGoalTracker') || document.querySelector('.goal-tracker');
  const toggleBtn = document.getElementById('btnToggleGoalTracker');
  if (goalTracker) {
    goalTracker.style.display = showDailyGoalOnHome ? 'flex' : 'none';
  }
  if (toggleBtn) {
    toggleBtn.textContent = showDailyGoalOnHome ? 'Visible' : 'Masqué';
    toggleBtn.classList.toggle('active', showDailyGoalOnHome);
  }
}

function toggleDailyGoalOnHome() {
  showDailyGoalOnHome = !showDailyGoalOnHome;
  localStorage.setItem('span_show_daily_goal_tracker', showDailyGoalOnHome ? 'true' : 'false');
  updateGoalTrackerVisibility();
  if (typeof showToast === 'function') {
    showToast(showDailyGoalOnHome ? "Objectif quotidien visible sur l'accueil" : "Objectif quotidien masqué de l'accueil", "⚙️");
  }
}
window.toggleDailyGoalOnHome = toggleDailyGoalOnHome;
window.updateGoalTrackerVisibility = updateGoalTrackerVisibility;

function initTrack() {
  const goalRange = document.getElementById('goalRangeInput');
  const modalGoalRange = document.getElementById('modalGoalRangeInput');

  if (goalRange) goalRange.value = dailyGoalMinutes;
  if (modalGoalRange) modalGoalRange.value = dailyGoalMinutes;

  updateGoalTrackerVisibility();
  updateDailyGoalDisplays();
  updateStats();
}

function updateDailyGoalTarget(val) {
  dailyGoalMinutes = parseInt(val) || 100;
  localStorage.setItem('span_daily_goal_minutes', dailyGoalMinutes);

  const goalRange = document.getElementById('goalRangeInput');
  const modalGoalRange = document.getElementById('modalGoalRangeInput');
  if (goalRange) goalRange.value = dailyGoalMinutes;
  if (modalGoalRange) modalGoalRange.value = dailyGoalMinutes;

  updateDailyGoalDisplays();
  updateStats();
}

function updateDailyGoalDisplays() {
  const summary = document.getElementById('targetDisplaySummary');
  const modalSummary = document.getElementById('modalTargetSummary');
  const label = `${dailyGoalMinutes} min`;

  if (summary) summary.textContent = label;
  if (modalSummary) modalSummary.textContent = label;
}

function toggleChartUnit() {
  showTimeInChart = !showTimeInChart;
  const btn = document.getElementById('btnToggleUnit');
  if (btn) btn.textContent = showTimeInChart ? 'Show: %' : 'Show: Time';
  updateStats();
}

function toggleTrackModal() {
  const modal = document.getElementById('trackModalOverlay');
  if (!modal) return;
  const isOpen = modal.style.display === 'flex';
  modal.style.display = isOpen ? 'none' : 'flex';
  if (!isOpen) updateStats();
}

// Compute total completed focus time today
function calculateTodayFocusMinutes() {
  const todayStr = (typeof getLocalDateString === 'function') ? getLocalDateString() : new Date().toLocaleDateString('en-CA');

  // Real focus sessions recorded by timer today
  let timerMinutesToday = 0;
  try {
    const sessions = JSON.parse(localStorage.getItem('span_focus_sessions') || '[]');
    timerMinutesToday = sessions
      .filter(s => s && s.date === todayStr)
      .reduce((sum, s) => sum + (s.duration || 25), 0);
  } catch (e) {}

  const tasks = window.SpanState.tasks || [];
  const archived = window.SpanState.archivedTasks || [];
  const doneToday = [
    ...tasks.filter(t => t.completed && (!t.completedDate || t.completedDate === todayStr)),
    ...archived.filter(t => t.archivedDate === todayStr || (t.archivedAt && t.archivedAt.slice(0, 10) === todayStr))
  ];

  // Completed tasks: use explicit duration or realistic estimate (15 min per checkbox if not specified)
  const taskMinutes = doneToday.reduce((total, task) => {
    const mins = task.duration ? parseInt(task.duration) : (task.estimate ? task.estimate * 25 : 15);
    return total + mins;
  }, 0);

  // Return the highest between timer sessions and completed tasks
  return Math.max(timerMinutesToday, taskMinutes);
}

// Compute category breakdown minutes
function calculateCategoryBreakdown() {
  const tasks = window.SpanState.tasks || [];
  const archived = window.SpanState.archivedTasks || [];
  const todayStr = (typeof getLocalDateString === 'function') ? getLocalDateString() : new Date().toLocaleDateString('en-CA');

  const doneToday = [
    ...tasks.filter(t => t.completed && (!t.completedDate || t.completedDate === todayStr)),
    ...archived.filter(t => t.archivedDate === todayStr || (t.archivedAt && t.archivedAt.slice(0, 10) === todayStr))
  ];

  const breakdown = {
    Work: 0,
    Home: 0,
    Fun: 0
  };

  doneToday.forEach(task => {
    let cat = task.category || 'Work';
    if (!breakdown.hasOwnProperty(cat)) cat = 'Work';
    const mins = task.duration ? parseInt(task.duration) : (task.estimate ? task.estimate * 25 : 15);
    breakdown[cat] += mins;
  });

  return breakdown;
}

function updateStats() {
  const totalMinutes = calculateTodayFocusMinutes();
  
  // Update progress bar
  const pct = Math.min(100, Math.round((totalMinutes / dailyGoalMinutes) * 100));
  const goalPercent = document.getElementById('goalPercent');
  const goalBar = document.getElementById('goalBar');
  const modalGoalPercent = document.getElementById('modalGoalPercent');
  const modalGoalBar = document.getElementById('modalGoalBar');
  const goalTracker = document.getElementById('homeGoalTracker') || document.querySelector('.goal-tracker');

  const label = (pct >= 100 && totalMinutes > 0) ? `100% (Atteint)` : `${pct}%`;

  if (goalPercent) goalPercent.textContent = label;
  if (modalGoalPercent) modalGoalPercent.textContent = `${pct}% (${totalMinutes} / ${dailyGoalMinutes}m)`;
  
  if (goalBar) goalBar.style.width = `${pct}%`;
  if (modalGoalBar) modalGoalBar.style.width = `${pct}%`;

  if (pct >= 100 && totalMinutes > 0) {
    if (goalTracker) goalTracker.classList.add('goal-reached');
  } else {
    if (goalTracker) goalTracker.classList.remove('goal-reached');
  }

  // Update Category Pie / Donut Chart
  const breakdown = calculateCategoryBreakdown();
  renderDonutChart('pieChart', 'pieLegend', breakdown, totalMinutes);
  renderDonutChart('modalPieChart', 'modalPieLegend', breakdown, totalMinutes);
}

function renderDonutChart(chartId, legendId, breakdown, totalMinutes) {
  const chartEl = document.getElementById(chartId);
  const legendEl = document.getElementById(legendId);

  if (!chartEl || !legendEl) return;

  if (totalMinutes === 0) {
    chartEl.style.background = 'conic-gradient(rgba(255, 255, 255, 0.08) 0deg 360deg)';
    legendEl.innerHTML = `<span style="font-size: 13px; color: var(--text-muted);">Aucune tâche complétée aujourd'hui</span>`;
    return;
  }

  let currentDeg = 0;
  const gradientStops = [];
  legendEl.innerHTML = '';

  const categories = ['Work', 'Home', 'Fun'];

  categories.forEach(cat => {
    const minutes = breakdown[cat];
    if (minutes > 0) {
      const share = minutes / totalMinutes;
      const deg = share * 360;
      const color = TRACK_COLORS[cat];

      gradientStops.push(`${color} ${currentDeg}deg ${currentDeg + deg}deg`);
      currentDeg += deg;

      // Legend row
      const row = document.createElement('div');
      row.className = 'legend-item';
      
      const valDisplay = showTimeInChart ? `${minutes}m` : `${Math.round(share * 100)}%`;
      row.innerHTML = `
        <div style="display: flex; align-items: center;">
          <span class="legend-dot" style="background: ${color};"></span>
          <span>${cat}</span>
        </div>
        <span style="font-weight: 600; color: var(--text-main);">${valDisplay}</span>
      `;
      legendEl.appendChild(row);
    }
  });

  chartEl.style.background = `conic-gradient(${gradientStops.join(', ')})`;
}

window.addEventListener('DOMContentLoaded', () => {
  initTrack();
});
