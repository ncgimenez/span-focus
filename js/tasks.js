let tasks = JSON.parse(localStorage.getItem('span_tasks')) || [
  { id: 1, text: "Build Span Focus MVP", category: "Code", completed: false },
  { id: 2, text: "Read research paper", category: "Study", completed: false }
];
let activeTask = JSON.parse(localStorage.getItem('span_active_task')) || null;
let selectedTaskIndex = -1;

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
    li.className = `task-item ${task.completed ? 'completed' : ''} ${index === selectedTaskIndex ? 'selected' : ''}`;
    li.draggable = true;
    li.dataset.index = index;

    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dragover', handleDragOver);
    li.addEventListener('drop', handleDrop);
    li.addEventListener('dragend', handleDragEnd);

    li.innerHTML = `
      <div class="task-left" onclick="selectTask(${index})">
        <div class="checkbox" onclick="event.stopPropagation(); toggleTask(${index})">${task.completed ? '✓' : ''}</div>
        <span class="task-text">${task.text}</span>
        <span class="task-tag" style="background: rgba(255,255,255,0.06); color: var(--tag-${task.category.toLowerCase()})">${task.category}</span>
      </div>
      <div class="task-actions">
        <button class="btn-task-action" onclick="setSpotlightTask(${index})" title="Focus this task">🎯</button>
        <button class="btn-task-action" onclick="deleteTask(${index})" title="Delete">✕</button>
      </div>
    `;
    list.appendChild(li);
  });
}

function addTask() {
  const input = document.getElementById('taskInput');
  const category = document.getElementById('taskCategory').value;
  const text = input.value.trim();
  if (!text) return;

  tasks.unshift({ id: Date.now(), text, category, completed: false });
  input.value = '';
  saveTasks();
}

function toggleTask(index) {
  tasks[index].completed = !tasks[index].completed;
  saveTasks();
}

function deleteTask(index) {
  if (activeTask && activeTask.id === tasks[index].id) dismissSpotlightTask();
  tasks.splice(index, 1);
  selectedTaskIndex = -1;
  saveTasks();
}

function selectTask(index) {
  selectedTaskIndex = index;
  renderTasks();
}

function setSpotlightTask(index) {
  activeTask = tasks[index];
  saveTasks();
  switchView('focus', document.querySelectorAll('.nav-btn')[0]);
}

function updateSpotlightUI() {
  const card = document.getElementById('spotlightCard');
  if (activeTask) {
    card.style.display = 'flex';
    document.getElementById('spotlightText').textContent = activeTask.text;
  } else {
    card.style.display = 'none';
  }
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

// Drag and drop
let dragSrcIndex = null;
function handleDragStart(e) {
  dragSrcIndex = this.dataset.index;
  this.classList.add('dragging');
}
function handleDragOver(e) { e.preventDefault(); }
function handleDrop(e) {
  e.stopPropagation();
  const dropIndex = this.dataset.index;
  if (dragSrcIndex !== dropIndex) {
    const item = tasks.splice(dragSrcIndex, 1)[0];
    tasks.splice(dropIndex, 0, item);
    saveTasks();
  }
}
function handleDragEnd() { this.classList.remove('dragging'); }

// Raccourcis clavier
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  if (e.code === 'Space') {
    e.preventDefault();
    toggleTimer();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (tasks.length > 0) {
      selectedTaskIndex = (selectedTaskIndex + 1) % tasks.length;
      renderTasks();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (tasks.length > 0) {
      selectedTaskIndex = (selectedTaskIndex - 1 + tasks.length) % tasks.length;
      renderTasks();
    }
  } else if (e.key === 'Enter') {
    if (selectedTaskIndex >= 0 && selectedTaskIndex < tasks.length) {
      toggleTask(selectedTaskIndex);
    }
  } else if (e.key === 'Tab') {
    e.preventDefault();
    if (selectedTaskIndex >= 0 && selectedTaskIndex < tasks.length) {
      const newName = prompt('Edit task:', tasks[selectedTaskIndex].text);
      if (newName) {
        tasks[selectedTaskIndex].text = newName;
        saveTasks();
      }
    }
  } else if (e.key === 'd' || e.key === 'D') {
    if (selectedTaskIndex >= 0 && selectedTaskIndex < tasks.length) {
      deleteTask(selectedTaskIndex);
    }
  }
});

