function switchView(viewName, btnElement) {
  document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  document.getElementById(`view-${viewName}`).classList.add('active');
  btnElement.classList.add('active');

  const titles = { focus: 'Focus', tasks: 'Tasks', stats: 'Track' };
  document.getElementById('headerTitle').textContent = titles[viewName];
  if (viewName === 'stats') renderChart();
}

// Démarrage initial
window.addEventListener('DOMContentLoaded', () => {
  updateDisplay();
  renderTasks();
  updateSpotlightUI();
  updateGoalBar();
});
