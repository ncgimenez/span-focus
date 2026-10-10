let dailyTargetSeconds = 4 * 25 * 60; // 100 min
let trackingData = JSON.parse(localStorage.getItem('span_tracking')) || {
  totalSecondsToday: 0,
  categories: { Code: 0, Study: 0, Write: 0, Admin: 0 }
};
let showAsPercentage = true;
const colors = { Code: '#6366f1', Study: '#10b981', Write: '#ec4899', Admin: '#f59e0b' };

function logFocusedSecond() {
  trackingData.totalSecondsToday++;
  const currentCategory = activeTask ? activeTask.category : 'Code';
  trackingData.categories[currentCategory] = (trackingData.categories[currentCategory] || 0) + 1;

  if (trackingData.totalSecondsToday % 5 === 0) {
    localStorage.setItem('span_tracking', JSON.stringify(trackingData));
    updateGoalBar();
    renderChart();
  }
}

function updateGoalBar() {
  const pct = Math.min(Math.round((trackingData.totalSecondsToday / dailyTargetSeconds) * 100), 100);
  document.getElementById('goalPercent').textContent = `${pct}%`;
  document.getElementById('goalBar').style.width = `${pct}%`;
}

function toggleChartUnit() {
  showAsPercentage = !showAsPercentage;
  document.getElementById('btnToggleUnit').textContent = `Show: ${showAsPercentage ? 'Time' : '%'}`;
  renderChart();
}

function renderChart() {
  const cats = trackingData.categories;
  const total = Object.values(cats).reduce((a, b) => a + b, 0);
  const pie = document.getElementById('pieChart');
  const legend = document.getElementById('pieLegend');

  if (total === 0) {
    pie.style.background = 'conic-gradient(rgba(255,255,255,0.1) 0deg 360deg)';
    legend.innerHTML = '<span style="color:var(--text-muted)">No sessions logged yet</span>';
    return;
  }

  let gradientSteps = [];
  let currentDeg = 0;
  legend.innerHTML = '';

  for (const [cat, secs] of Object.entries(cats)) {
    const slicePct = (secs / total);
    const deg = slicePct * 360;
    gradientSteps.push(`${colors[cat]} ${currentDeg}deg ${currentDeg + deg}deg`);
    currentDeg += deg;

    const valString = showAsPercentage 
      ? `${Math.round(slicePct * 100)}%` 
      : `${Math.round(secs / 60)} min`;

    legend.innerHTML += `
      <div class="legend-item">
        <span><span class="legend-dot" style="background:${colors[cat]}"></span>${cat}</span>
        <span style="font-weight:600">${valString}</span>
      </div>
    `;
  }
  pie.style.background = `conic-gradient(${gradientSteps.join(', ')})`;
}

// Backup JSON
function exportData() {
  const exportObject = { tasks, trackingData, activeTask, version: "1.0" };
  const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `span-focus-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
      if (imported.tasks) tasks = imported.tasks;
      if (imported.trackingData) trackingData = imported.trackingData;
      if (imported.activeTask) activeTask = imported.activeTask;
      saveTasks();
      localStorage.setItem('span_tracking', JSON.stringify(trackingData));
      updateGoalBar();
      renderChart();
      alert('Backup imported successfully!');
    } catch (err) {
      alert('Invalid JSON file.');
    }
  };
  reader.readAsText(file);
}
