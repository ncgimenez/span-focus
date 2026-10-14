window.SpanState = window.SpanState || {};

let dailyGoalMinutes = parseInt(localStorage.getItem('span_daily_goal_minutes')) || 100;
let showTimeInChart = false;

// Color definition aligned with Span Plan DNA
const TRACK_COLORS = {
  Work: '#818cf8',
  Home: '#10b981',
  Fun: '#fb7185'
};

function initTrack() {
  const goalRange = document.getElementById('goalRangeInput');
  const modalGoalRange = document.getElementById('modalGoalRangeInput');

  if (goalRange) goalRange.value = dailyGoalMinutes;
  if (modalGoalRange) modalGoalRange.value = dailyGoalMinutes;

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
  const tasks = window.SpanState.tasks || [];
  const archived = window.SpanState.archivedTasks || [];
  const todayStr = new Date().toISOString().slice(0, 10);

  const doneToday = [
    ...tasks.filter(t => t.completed && (!t.completedDate || t.completedDate === todayStr)),
    ...archived.filter(t => t.archivedDate === todayStr || (t.archivedAt && t.archivedAt.slice(0, 10) === todayStr))
  ];

  return doneToday.reduce((total, task) => {
    return total + ((task.estimate || 1) * 25);
  }, 0);
}

// Compute category breakdown minutes
function calculateCategoryBreakdown() {
  const tasks = window.SpanState.tasks || [];
  const archived = window.SpanState.archivedTasks || [];
  const todayStr = new Date().toISOString().slice(0, 10);

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
    breakdown[cat] += ((task.estimate || 1) * 25);
  });

  return breakdown;
}

function updateStats() {
  const totalMinutes = calculateTodayFocusMinutes();
  
  // Update progress bar
  const pct = Math.min(100, Math.round((totalMinutes / dailyGoalMinutes) * 100));
  const goalPercent = document.getElementById('goalPercent');
  const goalBar = document.getElementById('goalBar');

  if (goalPercent) goalPercent.textContent = `${pct}%`;
  if (goalBar) goalBar.style.width = `${pct}%`;

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
    legendEl.innerHTML = `<span style="font-size: 13px; color: var(--text-muted);">No completed tasks today</span>`;
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
