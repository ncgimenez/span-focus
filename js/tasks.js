// Initialisation de l'état partagé global
window.SpanState = window.SpanState || {};

window.SpanState.categoryLabels = JSON.parse(localStorage.getItem('span_category_labels')) || {
  Code: 'Code',
  Study: 'Study',
  Write: 'Write',
  Admin: 'Admin'
};

window.SpanState.tasks = JSON.parse(localStorage.getItem('span_tasks')) || [
  { id: 't_1', title: "Build Span Focus MVP", category: "Code", estimate: 2, completed: false, isFavorite: false },
  { id: 't_2', title: "Review Weekly Plan", category: "Admin", estimate: 1, completed: false, isFavorite: false }
];

window.SpanState.archivedTasks = JSON.parse(localStorage.getItem('span_archived_tasks')) || [];
window.SpanState.activeTask = JSON.parse(localStorage.getItem('span_active_task')) || null;

var categoryLabels = window.SpanState.categoryLabels;
var tasks = window.SpanState.tasks;
var archivedTasks = window.SpanState.archivedTasks;
var activeTask = window.SpanState.activeTask;

let selectedTaskIndex = 0;
let editingTaskId = null;
let editingCategory = 'None';
let editingEstimate = 1;
let isPastOpen = false;

// Migration des tâches
const nowInit = new Date();
const todayStrInit = nowInit.toISOString().slice(0, 10);

tasks = tasks.map(t => {
  const isDone = !!t.completed;
  return {
    ...t,
    title: t.title || t.text || 'Untitled Task',
    category: t.category || 'None',
    isFavorite: !!t.isFavorite,
    completed: isDone,
    completedAt: isDone ? (t.completedAt || nowInit.toISOString()) : null,
    completedDate: isDone ? (t.completedDate || todayStrInit) : null
  };
});

function triggerHapticFeedback() {
  if (navigator.vibrate) {
    try { navigator.vibrate(15); } catch (e) {}
  }
}

function autoArchivePastDays() {
  const todayStr = new Date().toISOString().slice(0, 10);
  let changed = false;
  const stillActive = [];

  tasks.forEach(t => {
    if (t.completed && t.completedDate && t.completedDate < todayStr) {
      archivedTasks.unshift({
        ...t,
        archivedAt: t.completedAt || new Date().toISOString(),
        archivedDate: t.completedDate
      });
      changed = true;
    } else {
      stillActive.push(t);
    }
  });

  if (changed) {
    tasks = stillActive;
    saveTasks();
  }
}

function saveTasks() {
  window.SpanState.tasks = tasks;
  window.SpanState.archivedTasks = archivedTasks;
  window.SpanState.activeTask = activeTask;

  localStorage.setItem('span_tasks', JSON.stringify(tasks));
  localStorage.setItem('span_archived_tasks', JSON.stringify(archivedTasks));
  localStorage.setItem('span_active_task', JSON.stringify(activeTask));

  renderTasks();
  renderArchivedTasks();
  updateSpotlightUI();
  if (typeof saveStateToCloud === 'function') saveStateToCloud();
}

function syncRenameCategoryInput() {
  const select = document.getElementById('renameCategorySelect');
  const input = document.getElementById('renameCategoryInput');
  if (!select || !input) return;
  const key = select.value;
  input.value = categoryLabels[key] || key;
}

function saveRenamedCategory() {
  const select = document.getElementById('renameCategorySelect');
  const input = document.getElementById('renameCategoryInput');
  if (!select || !input) return;

  const key = select.value;
  const newName = input.value.trim();
  if (!newName) return;

  categoryLabels[key] = newName;
  window.SpanState.categoryLabels = categoryLabels;
  localStorage.setItem('span_category_labels', JSON.stringify(categoryLabels));

  updateCategoryDOMNames();
  renderTasks();
  renderArchivedTasks();
  if (typeof renderChart === 'function') renderChart();
  if (typeof saveStateToCloud === 'function') saveStateToCloud();
}

function updateCategoryDOMNames() {
  const keys = ['Code', 'Study', 'Write', 'Admin'];
  keys.forEach(key => {
    const currentName = categoryLabels[key] || key;
    const opt = document.getElementById(`optCat${key}`);
    if (opt) opt.textContent = currentName;
    const pill = document.querySelector(`.cat-pill[data-cat="${key}"]`);
    if (pill) pill.textContent = currentName;
    const renameSelectOpt = document.querySelector(`#renameCategorySelect option[value="${key}"]`);
    if (renameSelectOpt) renameSelectOpt.textContent = `${key} (${currentName})`;
  });
  syncRenameCategoryInput();
}

function sortTasks() {
  const favs = tasks.filter(t => !t.completed && t.isFavorite);
  const regular = tasks.filter(t => !t.completed && !t.isFavorite);
  const done = tasks.filter(t => t.completed);
  tasks = [...favs, ...regular, ...done];
}

function renderTasks() {
  const list = document.getElementById('taskList');
  if (!list) return;
  list.innerHTML = '';

  const remaining = tasks.filter(t => !t.completed);
  const completedToday = tasks.filter(t => t.completed);

  const countEl = document.getElementById('tasksRemainingCount');
  if (countEl) {
    countEl.textContent = `${remaining.length} remaining • ${completedToday.length} done`;
  }

  const estTimeEl = document.getElementById('tasksEstTimeLeft');
  if (estTimeEl) {
    const totalBlocks = remaining.reduce((acc, t) => acc + (t.estimate || 1), 0);
    const mins = totalBlocks * 25;
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    estTimeEl.textContent = hrs > 0 ? `~${hrs}h${m > 0 ? m + 'm' : ''}` : `~${mins}m`;
  }

  tasks.forEach((task, index) => {
    const li = document.createElement('li');
    const isTargetVisible = (index === selectedTaskIndex) || (selectedTaskIndex === -1 && index === 0);
    li.className = `task-item ${task.completed ? 'completed' : ''} ${index === selectedTaskIndex ? 'selected' : ''} ${isTargetVisible ? 'show-focus-btn' : ''}`;
    li.draggable = !task.completed;
    li.dataset.index = index;

    li.addEventListener('mouseenter', () => {
      selectedTaskIndex = index;
      updateTaskSelectionUI();
    });

    const taskTitle = task.title || task.text || '';
    const hasCategory = task.category && task.category !== 'None';
    const catLabel = hasCategory ? (categoryLabels[task.category] || task.category) : '';
    const tagHtml = hasCategory 
      ? `<span class="task-tag" style="background: rgba(255,255,255,0.06); color: var(--tag-${task.category.toLowerCase()})">${catLabel}</span>`
      : '';

    const favStar = !task.completed ? `
      <button class="btn-fav ${task.isFavorite ? 'active' : ''}" type="button" onclick="event.stopPropagation(); toggleFavorite('${task.id}')" title="Favorite">⭐</button>
    ` : '';

    li.innerHTML = `
      <div class="task-left" onclick="openEditModalForTask('${task.id}')">
        <div class="checkbox" onclick="event.stopPropagation(); toggleTask(${index})">${task.completed ? '✓' : ''}</div>
        ${favStar}
        <span class="task-text">${taskTitle}</span>
        ${tagHtml}
        <span class="task-est">⏱ ${task.estimate || 1}</span>
      </div>
      <div class="task-actions">
        <button class="btn-task-action btn-focus-target" type="button" onclick="event.stopPropagation(); setSpotlightTask(${index})" title="Focus this task">🎯</button>
        <button class="btn-task-action" type="button" onclick="event.stopPropagation(); deleteTask(${index})" title="Delete">✕</button>
      </div>
    `;
    list.appendChild(li);
  });
}

function updateTaskSelectionUI() {
  document.querySelectorAll('#taskList .task-item').forEach((item, idx) => {
    item.classList.toggle('selected', idx === selectedTaskIndex);
    item.classList.toggle('show-focus-btn', idx === selectedTaskIndex);
  });
}

function toggleFavorite(id) {
  const t = tasks.find(x => String(x.id) === String(id));
  if (!t) return;

  const currentFavs = tasks.filter(x => x.isFavorite && !x.completed);
  if (!t.isFavorite && currentFavs.length >= 3) {
    alert("You can pin up to 3 favorites maximum.");
    return;
  }

  t.isFavorite = !t.isFavorite;
  sortTasks();
  saveTasks();
}

function addTask() {
  const input = document.getElementById('taskInput');
  const catSelect = document.getElementById('taskCategory');
  const text = input ? input.value.trim() : '';
  const category = catSelect ? catSelect.value : 'None';

  if (!text) return;

  const newTask = {
    id: 't_' + Date.now(),
    title: text,
    category: category,
    estimate: 1,
    completed: false,
    isFavorite: false
  };

  tasks.unshift(newTask);
  sortTasks();
  if (input) input.value = '';

  selectedTaskIndex = 0;
  saveTasks();
}

function toggleTask(index) {
  if (!tasks[index]) return;
  const t = tasks[index];
  t.completed = !t.completed;

  if (t.completed) {
    triggerHapticFeedback();
    const now = new Date();
    t.completedAt = now.toISOString();
    t.completedDate = now.toISOString().slice(0, 10);
    t.isFavorite = false;
  } else {
    delete t.completedAt;
    delete t.completedDate;
  }

  if (activeTask && activeTask.id === t.id) {
    dismissSpotlightTask();
  }

  sortTasks();
  saveTasks();
}

function deleteTask(index) {
  if (!tasks[index]) return;
  if (activeTask && activeTask.id === tasks[index].id) dismissSpotlightTask();
  tasks.splice(index, 1);
  selectedTaskIndex = 0;
  saveTasks();
}

function openArchiveSubView() {
  const main = document.getElementById('tasks-main-subview');
  const archive = document.getElementById('tasks-archive-subview');
  if (main && archive) {
    main.style.display = 'none';
    archive.style.display = 'block';
    renderArchivedTasks();
  }
}

function closeArchiveSubView() {
  const main = document.getElementById('tasks-main-subview');
  const archive = document.getElementById('tasks-archive-subview');
  if (main && archive) {
    archive.style.display = 'none';
    main.style.display = 'block';
  }
}

function renderArchivedTasks() {
  const todayList = document.getElementById('archivedTodayList');
  const pastList = document.getElementById('archivedPastList');
  const pastCount = document.getElementById('pastCount');

  if (pastCount) pastCount.textContent = archivedTasks.length;
  if (!todayList || !pastList) return;

  todayList.innerHTML = '';
  pastList.innerHTML = '';

  const completedToday = tasks.filter(t => t.completed);
  if (completedToday.length === 0) {
    todayList.innerHTML = `<li style="font-size: 12px; color: var(--text-muted); padding: 8px 4px;">No tasks completed today yet</li>`;
  } else {
    completedToday.forEach(t => {
      const li = document.createElement('li');
      li.className = 'task-item completed';
      const timeStr = t.completedAt ? new Date(t.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      li.innerHTML = `
        <div class="task-left">
          <span class="task-text">${t.title || t.text}</span>
          ${timeStr ? `<span class="task-time-pill">${timeStr}</span>` : ''}
        </div>
      `;
      todayList.appendChild(li);
    });
  }

  if (archivedTasks.length === 0) {
    pastList.innerHTML = `<li style="font-size: 12px; color: var(--text-muted); padding: 8px 4px;">No past archives</li>`;
  } else {
    archivedTasks.forEach(t => {
      const li = document.createElement('li');
      li.className = 'task-item completed';
      const dateStr = t.archivedDate || (t.archivedAt ? t.archivedAt.slice(0, 10) : '');
      li.innerHTML = `
        <div class="task-left">
          <span class="task-text">${t.title || t.text}</span>
          ${dateStr ? `<span class="task-time-pill">${dateStr}</span>` : ''}
        </div>
        <div class="task-actions">
          <button class="btn-task-action" type="button" onclick="unarchiveTask('${t.id}')" title="Restore">↩</button>
          <button class="btn-task-action" type="button" onclick="deleteArchivedTask('${t.id}')" title="Delete permanently">✕</button>
        </div>
      `;
      pastList.appendChild(li);
    });
  }
}

function togglePastArchives() {
  isPastOpen = !isPastOpen;
  const list = document.getElementById('archivedPastList');
  const icon = document.getElementById('pastToggleIcon');
  if (list) list.style.display = isPastOpen ? 'flex' : 'none';
  if (icon) icon.textContent = isPastOpen ? '▼' : '▶';
}

function archiveDayNow() {
  const completed = tasks.filter(t => t.completed);
  if (completed.length === 0) {
    alert("No completed tasks to clean today.");
    return;
  }
  const now = new Date();
  completed.forEach(t => {
    archivedTasks.unshift({
      ...t,
      archivedAt: t.completedAt || now.toISOString(),
      archivedDate: t.completedDate || now.toISOString().slice(0, 10)
    });
  });
  tasks = tasks.filter(t => !t.completed);
  saveTasks();
  renderArchivedTasks();
}

function unarchiveTask(id) {
  const idx = archivedTasks.findIndex(t => String(t.id) === String(id));
  if (idx !== -1) {
    const item = archivedTasks.splice(idx, 1)[0];
    item.completed = false;
    delete item.archivedAt;
    delete item.archivedDate;
    delete item.completedAt;
    delete item.completedDate;
    tasks.unshift(item);
    sortTasks();
    saveTasks();
  }
}

function deleteArchivedTask(id) {
  archivedTasks = archivedTasks.filter(t => String(t.id) !== String(id));
  saveTasks();
}

function setSpotlightTask(index) {
  activeTask = tasks[index];
  window.SpanState.activeTask = activeTask;
  saveTasks();
  if (typeof switchView === 'function') {
    switchView('focus', document.getElementById('nav-btn-focus'));
  }
}

function updateSpotlightUI() {
  const card = document.getElementById('spotlightCard');
  const emptyBtn = document.getElementById('spotlightEmptyBtn');
  const spotlightText = document.getElementById('spotlightText');
  const dropdown = document.getElementById('taskPickerDropdown');

  if (dropdown) dropdown.style.display = 'none';

  if (card && emptyBtn) {
    if (activeTask) {
      card.style.display = 'flex';
      emptyBtn.style.display = 'none';
      if (spotlightText) spotlightText.textContent = activeTask.title || activeTask.text || '';
    } else {
      card.style.display = 'none';
      emptyBtn.style.display = 'block';
    }
  }
}

function dismissSpotlightTask() {
  activeTask = null;
  window.SpanState.activeTask = null;
  saveTasks();
}

function completeSpotlightTask() {
  if (!activeTask) return;
  const found = tasks.find(t => String(t.id) === String(activeTask.id));
  if (found) {
    found.completed = true;
    found.completedAt = new Date().toISOString();
    found.completedDate = new Date().toISOString().slice(0, 10);
    found.isFavorite = false;
  }
  activeTask = null;
  window.SpanState.activeTask = null;
  sortTasks();
  saveTasks();
}

function toggleTaskPicker() {
  const dropdown = document.getElementById('taskPickerDropdown');
  if (!dropdown) return;

  if (dropdown.style.display === 'block') {
    dropdown.style.display = 'none';
    return;
  }
  const pending = tasks.filter(t => !t.completed);
  if (pending.length === 0) {
    dropdown.innerHTML = `<div class="task-picker-item" style="color:var(--text-muted); padding: 10px;">No pending tasks</div>`;
  } else {
    dropdown.innerHTML = pending.map(t => {
      const hasCat = t.category && t.category !== 'None';
      const catText = hasCat ? (categoryLabels[t.category] || t.category) : '';
      return `
        <div class="task-picker-item" onclick="selectPickerTask('${t.id}')">
          <span>${t.title || t.text}</span>
          <span style="color:var(--text-muted)">${catText}</span>
        </div>
      `;
    }).join('');
  }
  dropdown.style.display = 'block';
}

function selectPickerTask(taskId) {
  const found = tasks.find(x => String(x.id) === String(taskId));
  if (found) {
    activeTask = found;
    window.SpanState.activeTask = activeTask;
  }
  saveTasks();
}

function openEditModalForTask(id) {
  const task = tasks.find(t => String(t.id) === String(id));
  if (!task) return;
  editingTaskId = id;
  editingCategory = (task.category && task.category !== 'None') ? task.category : 'None';
  editingEstimate = task.estimate || 1;

  const titleInput = document.getElementById('editTaskTitle');
  if (titleInput) titleInput.value = task.title || task.text || '';

  const estEl = document.getElementById('editPomodoroEstimate');
  if (estEl) estEl.textContent = editingEstimate;

  const minEl = document.getElementById('editEstMinutes');
  if (minEl) minEl.textContent = editingEstimate * 25;

  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === editingCategory);
  });

  const modal = document.getElementById('editModalOverlay');
  if (modal) modal.style.display = 'flex';
}

function selectEditCategory(cat) {
  editingCategory = editingCategory === cat ? 'None' : cat;
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === editingCategory);
  });
}

function stepEstimate(delta) {
  editingEstimate = Math.max(1, Math.min(12, editingEstimate + delta));
  const estEl = document.getElementById('editPomodoroEstimate');
  if (estEl) estEl.textContent = editingEstimate;
  const minEl = document.getElementById('editEstMinutes');
  if (minEl) minEl.textContent = editingEstimate * 25;
}

function closeEditModal() {
  const modal = document.getElementById('editModalOverlay');
  if (modal) modal.style.display = 'none';
  editingTaskId = null;
}

function saveTaskModal() {
  const titleInput = document.getElementById('editTaskTitle');
  const title = titleInput ? titleInput.value.trim() : '';
  if (!title) return;

  const task = tasks.find(t => String(t.id) === String(editingTaskId));
  if (task) {
    task.title = title;
    task.category = editingCategory || 'None';
    task.estimate = editingEstimate;
    if (activeTask && String(activeTask.id) === String(task.id)) {
      activeTask = task;
      window.SpanState.activeTask = activeTask;
    }
  }
  closeEditModal();
  saveTasks();
}

window.addEventListener('keydown', (e) => {
  const modal = document.getElementById('editModalOverlay');
  const isModalOpen = modal && modal.style.display === 'flex';
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || isModalOpen) return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (typeof toggleTimer === 'function') toggleTimer();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (tasks.length > 0) {
      selectedTaskIndex = (selectedTaskIndex + 1) % tasks.length;
      updateTaskSelectionUI();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (tasks.length > 0) {
      selectedTaskIndex = (selectedTaskIndex - 1 + tasks.length) % tasks.length;
      updateTaskSelectionUI();
    }
  } else if (e.key === 'Enter') {
    if (selectedTaskIndex >= 0 && selectedTaskIndex < tasks.length) toggleTask(selectedTaskIndex);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    if (selectedTaskIndex >= 0 && selectedTaskIndex < tasks.length) openEditModalForTask(tasks[selectedTaskIndex].id);
  } else if (e.key === 'd' || e.key === 'D') {
    if (selectedTaskIndex >= 0 && selectedTaskIndex < tasks.length) deleteTask(selectedTaskIndex);
  }
});

sortTasks();
autoArchivePastDays();
