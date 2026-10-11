// Dictionnaire des libellés de catégories personnalisés
let categoryLabels = JSON.parse(localStorage.getItem('span_category_labels')) || {
  Code: 'Code',
  Study: 'Study',
  Write: 'Write',
  Admin: 'Admin'
};

let tasks = JSON.parse(localStorage.getItem('span_tasks')) || [
  { id: 't_1', title: "Build Span Focus MVP", category: "Code", estimate: 2, completed: false },
  { id: 't_2', title: "Review Weekly Plan", category: "Admin", estimate: 1, completed: false }
];
let activeTask = JSON.parse(localStorage.getItem('span_active_task')) || null;
let selectedTaskIndex = 0;
let editingTaskId = null;
let editingCategory = 'None';
let editingEstimate = 1;

tasks = tasks.map(t => ({
  ...t,
  title: t.title || t.text || 'Untitled Task',
  category: t.category || 'None'
}));

function saveTasks() {
  localStorage.setItem('span_tasks', JSON.stringify(tasks));
  localStorage.setItem('span_active_task', JSON.stringify(activeTask));
  renderTasks();
  updateSpotlightUI();
  if (typeof saveStateToCloud === 'function') saveStateToCloud();
}

// Fonction pour renommer une catégorie
function handleCategoryRename(key, newName) {
  categoryLabels[key] = newName.trim() || key;
  localStorage.setItem('span_category_labels', JSON.stringify(categoryLabels));
  updateCategoryDOMNames();
  renderTasks();
  if (typeof renderChart === 'function') renderChart();
}

// Met à jour les libellés partout dans le DOM
function updateCategoryDOMNames() {
  ['Code', 'Study', 'Write', 'Admin'].forEach(key => {
    const opt = document.getElementById(`optCat${key}`);
    if (opt) opt.textContent = categoryLabels[key];

    const input = document.getElementById(`renameCat${key}`);
    if (input && !input.value) input.value = categoryLabels[key];

    const pill = document.querySelector(`.cat-pill[data-cat="${key}"]`);
    if (pill) pill.textContent = categoryLabels[key];
  });
}

function renderTasks() {
  const list = document.getElementById('taskList');
  if (!list) return;
  list.innerHTML = '';

  tasks.forEach((task, index) => {
    const li = document.createElement('li');
    const isTargetVisible = (index === selectedTaskIndex) || (selectedTaskIndex === -1 && index === 0);
    li.className = `task-item ${task.completed ? 'completed' : ''} ${index === selectedTaskIndex ? 'selected' : ''} ${isTargetVisible ? 'show-focus-btn' : ''}`;
    li.draggable = true;
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
  if (input) input.value = '';

  activeTask = newTask;
  selectedTaskIndex = 0;
  saveTasks();
}

function toggleTask(index) {
  if (!tasks[index]) return;
  tasks[index].completed = !tasks[index].completed;
  if (activeTask && activeTask.id === tasks[index].id) {
    dismissSpotlightTask();
  } else {
    saveTasks();
  }
}

function deleteTask(index) {
  if (!tasks[index]) return;
  if (activeTask && activeTask.id === tasks[index].id) dismissSpotlightTask();
  tasks.splice(index, 1);
  selectedTaskIndex = 0;
  saveTasks();
}

function setSpotlightTask(index) {
  activeTask = tasks[index];
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
  if (found) activeTask = found;
  saveTasks();
}

function completeSpotlightTask() {
  if (!activeTask) return;
  const found = tasks.find(t => String(t.id) === String(activeTask.id));
  if (found) found.completed = true;
  activeTask = null;
  saveTasks();
}

function dismissSpotlightTask() {
  activeTask = null;
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

// Sélection / Désélection en recliquant
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

// Initialisation au chargement de la page
window.addEventListener('DOMContentLoaded', () => {
  updateCategoryDOMNames();
});
