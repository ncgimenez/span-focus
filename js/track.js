window.SpanState = window.SpanState || {};

let dailyGoalMinutes = parseInt(localStorage.getItem('span_daily_goal_target')) || 100;
let showPercentageInChart = false;

const CATEGORY_COLORS = {
  Work: '#818cf8',
  Home: '#10b981',
  Fun: '#fb7185'
};

function initTrack() {
  const goalRange = document.getElementById('goalRangeInput');
  const modalRange = document.getElementById('modalGoalRangeInput');

  if (goalRange) goalRange.value = dailyGoalMinutes;
  if (modalRange) modalRange.value = dailyGoalMinutes;

  updateTargetDisplay(dailyGoalMinutes);
  updateStats();
}

function updateDailyGoalTarget(value) {
  dailyGoalMinutes = parseInt(value) || 100;
  localStorage.setItem('span_daily_goal_target', dailyGoalMinutes);

  const goalRange = document.getElementById('goalRangeInput');
  const modalRange = document.getElementById('modalGoalRangeInput');

  if (goalRange && goalRange.value !== String(dailyGoalMinutes)) goalRange.value = dailyGoalMinutes;
  if (modalRange && modalRange.value !== String(dailyGoalMinutes)) modalRange.value = dailyGoalMinutes;

  updateTargetDisplay(dailyGoalMinutes);
  updateStats();
}

function updateTargetDisplay(mins) {
  const targetLabel = `${mins} min`;
  const summaryEl = document.getElementById('targetDisplaySummary');
  const modalSummaryEl = document.getElementById('modalTargetSummary');

  if (summaryEl) summaryEl.textContent = targetLabel;
  if (modalSummaryEl) modalSummaryEl.textContent = targetLabel;
}

function toggleChartUnit() {
  showPercentageInChart = !showPercentageInChart;
  const toggleBtn = document.getElementById('btnToggleUnit');
  if (toggleBtn) {
    toggleBtn.textContent = showPercentageInChart ? 'Show: Time' : 'Show: %';
  }
  updateStats();
}

function calculateCategoryBreakdown() {
  const tasks = window.SpanState.tasks || [];
  const archived = window.SpanState.archivedTasks || [];
  const todayStr = new Date().toISOString().slice(0, 10);

  const breakdown = {
    Work: 0,
    Home: 0,
    Fun: 0
  };

  let totalMinutesToday = 0;

  // Completed tasks today in current list
  tasks.forEach(t => {
    if (t.completed && (!t.completedDate || t.completedDate === todayStr)) {
      const cat = (t.category && breakdown[t.category] !== undefined) ? t.category : 'Work';
      const duration = (t.estimate || 1) * 25;
      breakdown[cat] += duration;
      totalMinutesToday += duration;
    }
  });

  // Completed tasks today in archives
  archived.forEach(t => {
    const isToday = t.archivedDate === todayStr || (t.archivedAt && t.archivedAt.slice(0, 10) === todayStr);
    if (isToday) {
      const cat = (t.category && breakdown[t.category] !== undefined) ? t.category : 'Work';
      const duration = (t.estimate || 1) * 25;
      breakdown[cat] += duration;
      totalMinutesToday += duration;
    }
  });

  return { breakdown, totalMinutesToday };
}

function updateStats() {
  const { breakdown, totalMinutesToday } = calculateCategoryBreakdown();

  // 1. Update Daily Goal Top Bar
  const pct = Math.min(100, Math.round((totalMinutesToday / Math.max(1, dailyGoalMinutes)) * 100));
  const goalBar = document.getElementById('goalBar');
  const goalPercent = document.getElementById('goalPercent');

  if (goalBar) goalBar.style.width = `${pct}%`;
  if (goalPercent) goalPercent.textContent = `${pct}%`;

  // 2. Render Pie Charts & Legends
  renderPieUI('pieChart', 'pieLegend', breakdown, totalMinutesToday);
  renderPieUI('modalPieChart', 'modalPieLegend', breakdown, totalMinutesToday);
}

function renderPieUI(chartId, legendId, breakdown, totalMinutes) {
  const chartEl = document.getElementById(chartId);
  const legendEl = document.getElementById(legendId);

  if (!chartEl || !legendEl) return;

  const categories = ['Work', 'Home', 'Fun'];

  if (totalMinutes === 0) {
    chartEl.style.background = 'conic-gradient(rgba(255, 255, 255, 0.08) 0deg 360deg)';
    legendEl.innerHTML = categories.map(cat => `
      <div class="legend-item">
        <div>
          <span class="legend-dot" style="background: ${CATEGORY_COLORS[cat]};"></span>
          <span>${cat}</span>
        </div>
        <span style="color: var(--text-muted);">0m</span>
      </div>
    `).join('');
    return;
  }

  // Generate Conic Gradient Segments
  let currentAngle = 0;
  const gradientStops = [];

  categories.forEach(cat => {
    const mins = breakdown[cat] || 0;
    const sliceAngle = (mins / totalMinutes) * 360;
    const endAngle = currentAngle + sliceAngle;
    gradientStops.push(`${CATEGORY_COLORS[cat]} ${currentAngle}deg ${endAngle}deg`);
    currentAngle = endAngle;
  });

  chartEl.style.background = `conic-gradient(${gradientStops.join(', ')})`;

  // Render Legend Rows
  legendEl.innerHTML = categories.map(cat => {
    const mins = breakdown[cat] || 0;
    const valText = showPercentageInChart 
      ? `${Math.round((mins / totalMinutes) * 100)}%` 
      : `${mins}m`;

    return `
      <div class="legend-item">
        <div>
          <span class="legend-dot" style="background: ${CATEGORY_COLORS[cat]};"></span>
          <span>${cat}</span>
        </div>
        <strong style="color: var(--text-main); font-weight: 600;">${valText}</strong>
      </div>
    `;
  }).join('');
}

function toggleTrackModal() {
  const modal = document.getElementById('trackModalOverlay');
  if (!modal) return;
  const isOpening = modal.style.display !== 'flex';
  modal.style.display = isOpening ? 'flex' : 'none';
  if (isOpening) updateStats();
}

window.addEventListener('DOMContentLoaded', () => {
  initTrack();
});
