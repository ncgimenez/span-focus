let tasks = JSON.parse(localStorage.getItem('span_tasks')) || [
  { id: 1, text: "Build Span Focus MVP", category: "Code", estimate: 2, completed: false },
  { id: 2, text: "Review Weekly Plan", category: "Admin", estimate: 1, completed: false }
];
let activeTask = JSON.parse(localStorage.getItem('span_active_task')) || null;
let selectedTaskIndex = 0;
let editingTaskId = null;
let editingCategory = 'Code';
let editingEstimate = 1;

function saveTasks() {
  localStorage.setItem('span_tasks', JSON.stringify(tasks));
  localStorage.setItem('span_active_task', JSON.stringify(activeTask));
  renderTasks();
  updateSpotlightUI();
}

function renderTasks() {
  const list = document.getElementById('taskList');
  list.innerHTML = '';

  tasks.forEach((task, index) => {
    const li = document.createElement('li');
    // Le bouton focus 🎯 est affiché sur la première tâche par défaut ou sur la tâche sélectionnée
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

    li.innerHTML = `
      <div class="task-left" onclick="openEditModalForTask(${task.id})">
        <div class="checkbox" onclick="event.stopPropagation(); toggleTask(${index})">${task.completed ? '✓' : ''}</div>
        <span class="task-text">${task.text}</span>
        <span class="task-tag" style="background: rgba(255,255,255,0.06); color: var(--tag-${task.category.toLowerCase()})">${task.category}</span>
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
  const category = document.getElementById('taskCategory').value;
  const text = input.value.trim();
  if (!text) return;

  tasks.unshift({ id: Date.now(), text, category, estimate: 1, completed: false });
  input.value = '';
  selectedTaskIndex = 0;
  saveTasks();
}

function toggleTask(index) {
  tasks[index].completed = !tasks[index].completed;
  if (activeTask && activeTask.id === tasks[index].id) dismissSpotlightTask();
  saveTasks();
}

function deleteTask(index) {
  if (activeTask && activeTask.id === tasks[index].id) dismissSpotlightTask();
  tasks.splice(index, 1);
  selectedTaskIndex = 0;
  saveTasks();
}

// SPOTLIGHT & DROPDOWN PICKER
function setSpotlightTask(index) {
  activeTask = tasks[index];
  saveTasks();
  switchView('focus', document.getElementById('nav-btn-focus'));
}

function updateSpotlightUI() {
  const card = document.getElementById('spotlightCard');
  const emptyBtn = document.getElementById('spotlightEmptyBtn');
  const dropdown = document.getElementById('taskPickerDropdown');
  dropdown.style.display = 'none';

  if (activeTask) {
    card.style.display = 'flex';
    emptyBtn.style.display = 'none';
    document.getElementById('spotlightText').textContent = activeTask.text;
  } else {
    card.style.display = 'none';
    emptyBtn.style.display = 'block';
  }
}

function toggleTaskPicker() {
  const dropdown = document.getElementById('taskPickerDropdown');
  if (dropdown.style.display === 'block') {
    dropdown.style.display = 'none';
    return;
  }
  const pending = tasks.filter(t => !t.completed);
  if (pending.length === 0) {
    dropdown.innerHTML = `<div class="task-picker-item" style="color:var(--text-muted)">No pending tasks</div>`;
  } else {
    dropdown.innerHTML = pending.map(t => `
      <div class="task-picker-item" onclick="selectPickerTask(${t.id})">
        <span>${t.text}</span>
        <span style="color:var(--text-muted)">${t.category}</span>
      </div>
    `).join('');
  }
  dropdown.style.display = 'block';
}

function selectPickerTask(taskId) {
  const t = tasks.find(x => x.id === taskId);
  if (t) activeTask = t;
  saveTasks();
}

function completeSpotlightTask() {
  if (!activeTask) return;
  const found = tasks.find(t => t.id === activeTask.id);
  if (found) found.completed = true;
  activeTask = null;
  saveTasks();
}

function dismissSpotlightTask() {
  activeTask = null;
  saveTasks();
}

// MODALE D'ÉDITION PROPRE
function openEditModalForTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;
  editingCategory = task.category || 'Code';
  editingEstimate = task.estimate || 1;

  document.getElementById('editTaskTitle').value = task.text;
  document.getElementById('editPomodoroEstimate').textContent = editingEstimate;
  document.getElementById('editEstMinutes').textContent = editingEstimate * 25;
  selectEditCategory(editingCategory);

  document.getElementById('editModalOverlay').style.display = 'flex';
}

function selectEditCategory(cat) {
  editingCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
}

function stepEstimate(delta) {
  editingEstimate = Math.max(1, Math.min(12, editingEstimate + delta));
  document.getElementById('editPomodoroEstimate').textContent = editingEstimate;
  document.getElementById('editEstMinutes').textContent = editingEstimate * 25;
}

function closeEditModal() {
  document.getElementById('editModalOverlay').style.display = 'none';
  editingTaskId = null;
}

function saveTaskModal() {
  const title = document.getElementById('editTaskTitle').value.trim();
  if (!title) return;
  const task = tasks.find(t => t.id === editingTaskId);
  if (task) {
    task.text = title;
    task.category = editingCategory;
    task.estimate = editingEstimate;
    if (activeTask && activeTask.id === task.id) activeTask = task;
  }
  closeEditModal();
  saveTasks();
}

// DRAG AND DROP
let dragSrcIndex = null;
function handleDragStart() { dragSrcIndex = this.dataset.index; this.classList.add('dragging'); }
function handleDragOver(e) { e.preventDefault(); }
function handleDrop(e) {
  e.stopPropagation();
  const dropIndex = this.dataset.index;
  if (dragSrcIndex !== dropIndex) {
    const item = tasks.splice(dragSrcIndex, 1)[0];
    tasks.splice(dropIndex, 0, item);
    selectedTaskIndex = parseInt(dropIndex);
    saveTasks();
  }
}
function handleDragEnd() { this.classList.remove('dragging'); }

// RACCOURCIS CLAVIER
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || document.getElementById('editModalOverlay').style.display === 'flex') return;

  if (e.code === 'Space') {
    e.preventDefault();
    toggleTimer();
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
