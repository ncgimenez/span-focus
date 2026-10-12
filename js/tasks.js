// Initialisation de l'état partagé global
window.SpanState = window.SpanState || {};

window.SpanState.categoryLabels = JSON.parse(localStorage.getItem('span_category_labels')) || {
  Code: 'Code',
  Study: 'Study',
  Write: 'Write',
  Admin: 'Admin'
};

window.SpanState.tasks = JSON.parse(localStorage.getItem('span_tasks')) || [
  { id: 't_1', title: "Build Span Focus MVP", category: "Code", estimate: 2, completed: false },
  { id: 't_2', title: "Review Weekly Plan", category: "Admin", estimate: 1, completed: false }
];

window.SpanState.archivedTasks = JSON.parse(localStorage.getItem('span_archived_tasks')) || [];
window.SpanState.activeTask = JSON.parse(localStorage.getItem('span_active_task')) || null;

// Raccourcis pour le reste du code
var categoryLabels = window.SpanState.categoryLabels;
var tasks = window.SpanState.tasks;
var archivedTasks = window.SpanState.archivedTasks;
var activeTask = window.SpanState.activeTask;

let selectedTaskIndex = 0;
let editingTaskId = null;
let editingCategory = 'None';
let editingEstimate = 1;

let isArchivedOpen = false;
let archiveFilter = 'today'; // 'today' ou 'all'

tasks = tasks.map(t => ({
  ...t,
  title: t.title || t.text || 'Untitled Task',
  category: t.category || 'None'
}));

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

// Remplit le champ texte avec le nom actuel dès qu'on change de catégorie dans le select
function syncRenameCategoryInput() {
  const select = document.getElementById('renameCategorySelect');
  const input = document.getElementById('renameCategoryInput');
  if (!select || !input) return;
  const key = select.value;
  input.value = categoryLabels[key] || key;
}

// Valide et enregistre le nouveau nom
function saveRenamedCategory() {
  const select = document.getElementById('renameCategorySelect');
  const input = document.getElementById('renameCategoryInput');
  if (!select || !input) return;

  const key = select.value;
  const newName = input.value.trim();

  if (!newName) {
    alert('Please enter a valid category name.');
    return;
  }

  categoryLabels[key] = newName;
  window.SpanState.categoryLabels = categoryLabels;
  localStorage.setItem('span_category_labels', JSON.stringify(categoryLabels));

  updateCategoryDOMNames();
  renderTasks();
  renderArchivedTasks();
  if (typeof renderChart === 'function') renderChart();
  if (typeof saveStateToCloud === 'function') saveStateToCloud();

  alert(`Category "${key}" renamed to "${newName}"!`);
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

// Tri des tâches : non cochées d'abord, cochées à la fin
function sortTasksWithCompletedAtBottom() {
  const uncompleted = tasks.filter(t => !t.completed);
  const completed = tasks.filter(t => t.completed);
  tasks = [...uncompleted, ...completed];
}

function renderTasks() {
  const list = document.getElementById('taskList');
  if (!list) return;
  list.innerHTML = '';

  tasks.forEach((task, index) => {
    const li = document.createElement('li');
    const isTargetVisible = (index === selectedTaskIndex) || (selectedTaskIndex === -1 && index === 0);
    li.className = `task-item ${task.completed ? 'completed' : ''} ${index === selectedTaskIndex ? 'selected' : ''} ${isTargetVisible ? 'show-focus-btn' : ''}`;
    li.draggable = !task.completed;
    li.dataset.index = index;

    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dragover', handleDragOver);
    li.addEventListener('drop', handleDrop);
    li.addEventListener('dragend', handleDragEnd);

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

    li.innerHTML = `
      <div class="task-left" onclick="openEditModalForTask('${task.id}')">
        <div class="checkbox" onclick="event.stopPropagation(); toggleTask(${index})">${task.completed ? '✓' : ''}</div>
        <span class="task-text">${taskTitle}</span>
        ${tagHtml}
        <span class="task-est">⏱ ${task.estimate || 1}</span>
      </div>
      <div class="task-actions">
        <button class="btn-task-action btn-focus-target" onclick="event.stopPropagation(); setSpotlightTask(${index})" title="Focus this task">🎯</button>
        <button class="btn-task-action" onclick="event.stopPropagation(); deleteTask(${index})" title="Delete">✕</button>
      </div>
    `;
    list.appendChild(li);
  });

  const countBadge = document.getElementById('archivedCount');
  if (countBadge) countBadge.textContent = archivedTasks.length;
}

function updateTaskSelectionUI() {
  document.querySelectorAll('.task-item').forEach((item, idx) => {
    item.classList.toggle('selected', idx === selectedTaskIndex);
    item.classList.toggle('show-focus-btn', idx === selectedTaskIndex);
  });
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
    completed: false
  };

  tasks.unshift(newTask);
  sortTasksWithCompletedAtBottom();
  if (input) input.value = '';

  activeTask = newTask;
  window.SpanState.activeTask = activeTask;
  selectedTaskIndex = 0;
  saveTasks();
}

function toggleTask(index) {
  if (!tasks[index]) return;
  tasks[index].completed = !tasks[index].completed;
  
  if (activeTask && activeTask.id === tasks[index].id) {
    dismissSpotlightTask();
  }

  // Déplace immédiatement les tâches cochées vers le bas
  sortTasksWithCompletedAtBottom();
  saveTasks();
}

function deleteTask(index) {
  if (!tasks[index]) return;
  if (activeTask && activeTask.id === tasks[index].id) dismissSpotlightTask();
  tasks.splice(index, 1);
  selectedTaskIndex = 0;
  saveTasks();
}

// ARCHIVAGE
function archiveCompletedTasks() {
  const completed = tasks.filter(t => t.completed);
  if (completed.length === 0) {
    alert('No completed tasks to archive.');
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // Format YYYY-MM-DD

  completed.forEach(t => {
    archivedTasks.unshift({
      ...t,
      archivedAt: now.toISOString(),
      archivedDate: dateStr
    });
  });

  tasks = tasks.filter(t => !t.completed);
  saveTasks();
}

function toggleArchivedSection() {
  isArchivedOpen = !isArchivedOpen;
  const content = document.getElementById('archivedContent');
  const icon = document.getElementById('archivedToggleIcon');

  if (content) content.style.display = isArchivedOpen ? 'block' : 'none';
  if (icon) icon.textContent = isArchivedOpen ? '▼' : '▶';

  if (isArchivedOpen) {
    renderArchivedTasks();
  }
}

function setArchiveFilter(filter) {
  archiveFilter = filter;
  const btnToday = document.getElementById('btnFilterToday');
  const btnAll = document.getElementById('btnFilterAll');

  if (btnToday) btnToday.classList.toggle('active', filter === 'today');
  if (btnAll) btnAll.classList.toggle('active', filter === 'all');

  renderArchivedTasks();
}

function renderArchivedTasks() {
  const list = document.getElementById('archivedTaskList');
  const countBadge = document.getElementById('archivedCount');
  if (countBadge) countBadge.textContent = archivedTasks.length;
  if (!list) return;

  list.innerHTML = '';

  const todayStr = new Date().toISOString().slice(0, 10);
  const items = archiveFilter === 'today'
    ? archivedTasks.filter(t => t.archivedDate === todayStr)
    : archivedTasks;

  if (items.length === 0) {
    list.innerHTML = `<li style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 12px;">No archived tasks ${archiveFilter === 'today' ? 'today' : ''}</li>`;
    return;
  }

  items.forEach((task) => {
    const li = document.createElement('li');
    li.className = 'task-item completed';

    const taskTitle = task.title || task.text || '';
    const hasCategory = task.category && task.category !== 'None';
    const catLabel = hasCategory ? (categoryLabels[task.category] || task.category) : '';
    const tagHtml = hasCategory 
      ? `<span class="task-tag" style="background: rgba(255,255,255,0.06); color: var(--tag-${task.category.toLowerCase()})">${catLabel}</span>`
      : '';

    li.innerHTML = `
      <div class="task-left">
        <span class="task-text">${taskTitle}</span>
        ${tagHtml}
      </div>
      <div class="task-actions">
        <button class="btn-task-action" onclick="unarchiveTask('${task.id}')" title="Restore task">↩</button>
        <button class="btn-task-action" onclick="deleteArchivedTask('${task.id}')" title="Delete permanently">✕</button>
      </div>
    `;
    list.appendChild(li);
  });
}

function unarchiveTask(id) {
  const idx = archivedTasks.findIndex(t => String(t.id) === String(id));
  if (idx !== -1) {
    const item = archivedTasks.splice(idx, 1)[0];
    item.completed = false;
    delete item.archivedAt;
    delete item.archivedDate;
    tasks.unshift(item);
    sortTasksWithCompletedAtBottom();
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
  if (!activeTask && tasks.length > 0) {
    const firstPending = tasks.find(t => !t.completed);
    if (firstPending) {
      activeTask = firstPending;
      window.SpanState.activeTask = activeTask;
      localStorage.setItem('span_active_task', JSON.stringify(activeTask));
    }
  }

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

function completeSpotlightTask() {
  if (!activeTask) return;
  const found = tasks.find(t => String(t.id) === String(activeTask.id));
  if (found) found.completed = true;
  activeTask = null;
  window.SpanState.activeTask = null;
  sortTasksWithCompletedAtBottom();
  saveTasks();
}

function dismissSpotlightTask() {
  activeTask = null;
  window.SpanState.activeTask = null;
  saveTasks();
}

// MODALE D'ÉDITION
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
  if (editingCategory === cat) {
    editingCategory = 'None';
  } else {
    editingCategory = cat;
  }

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

// DRAG AND DROP
let dragSrcIndex = null;
function handleDragStart() {
  dragSrcIndex = this.dataset.index;
  this.classList.add('dragging');
}
function handleDragOver(e) {
  e.preventDefault();
}
function handleDrop(e) {
  e.stopPropagation();
  const dropIndex = this.dataset.index;
  if (dragSrcIndex !== null && dragSrcIndex !== dropIndex) {
    const item = tasks.splice(dragSrcIndex, 1)[0];
    tasks.splice(dropIndex, 0, item);
    selectedTaskIndex = parseInt(dropIndex, 10);
    saveTasks();
  }
}
function handleDragEnd() {
  this.classList.remove('dragging');
}

// RACCOURCIS CLAVIER
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
