window.SpanState = window.SpanState || {};

// Standardized Span Tri-Category System
window.SpanState.categoryLabels = {
  Work: 'Work',
  Home: 'Home',
  Fun: 'Fun'
};

window.SpanState.tasks = JSON.parse(localStorage.getItem('span_tasks')) || [
  { id: 't_1', title: "Review Weekly Plan", category: "Work", estimate: 2, completed: false, isFavorite: true },
  { id: 't_2', title: "Grocery shopping", category: "Home", estimate: 1, completed: false, isFavorite: false }
];

window.SpanState.archivedTasks = JSON.parse(localStorage.getItem('span_archived_tasks')) || [];
window.SpanState.activeTask = JSON.parse(localStorage.getItem('span_active_task')) || null;

var categoryLabels = window.SpanState.categoryLabels;
var tasks = window.SpanState.tasks;
var archivedTasks = window.SpanState.archivedTasks;
var activeTask = window.SpanState.activeTask;

let selectedTaskIndex = 0;
let editingTaskId = null;
let editingCategory = 'Work';
let editingEstimate = 1;
let editingIsFavorite = false;
let isPastOpen = false;
let newlyAddedTaskId = null;

const nowInit = new Date();
const todayStrInit = nowInit.toISOString().slice(0, 10);

// Migrate legacy categories to the unified tri-category system
function normalizeCategory(cat) {
  if (cat === 'Code' || cat === 'Write' || cat === 'Study') return 'Work';
  if (cat === 'Admin' || cat === 'Personal') return 'Home';
  if (cat === 'Fun') return 'Fun';
  return 'Work';
}

tasks = tasks.map(t => {
  const isDone = !!t.completed;
  return {
    ...t,
    title: t.title || t.text || 'Untitled Task',
    category: normalizeCategory(t.category),
    isFavorite: !!t.isFavorite,
    scheduledDate: t.scheduledDate || null,
    scheduledTime: t.scheduledTime || null,
    completed: isDone,
    completedAt: isDone ? (t.completedAt || nowInit.toISOString()) : null,
    completedDate: isDone ? (t.completedDate || todayStrInit) : null
  };
});

function triggerHapticFeedback() {
  if (navigator.vibrate) {
    try { navigator.vibrate(20); } catch (e) {}
  }
}

function getMaxFavoritesAllowed() {
  return activeTask ? 2 : 3;
}

function checkScheduledTasksForToday() {
  const todayStr = new Date().toISOString().slice(0, 10);
  let changed = false;

  tasks.forEach(t => {
    if (t.scheduledDate && t.scheduledDate <= todayStr && !t.completed) {
      t.scheduledDate = null;
      changed = true;
    }
  });

  if (changed) saveTasks();
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
  renderPlannedTasks();
  updateSpotlightUI();
  if (typeof saveStateToCloud === 'function') saveStateToCloud();
}

function handleInputFocus(isFocused) {
  document.body.classList.toggle('is-typing-mode', isFocused);
}

// Close all task contextual menus when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.task-menu-container')) {
    document.querySelectorAll('.task-actions-dropdown.show').forEach(menu => {
      menu.classList.remove('show');
    });
  }
});

function toggleTaskActionMenu(taskId, event) {
  event.stopPropagation();
  const targetMenu = document.getElementById(`menu-dropdown-${taskId}`);
  const isAlreadyOpen = targetMenu && targetMenu.classList.contains('show');

  document.querySelectorAll('.task-actions-dropdown.show').forEach(menu => {
    menu.classList.remove('show');
  });

  if (!isAlreadyOpen && targetMenu) {
    targetMenu.classList.add('show');
  }
}

// RENDER TASK LIST WITH PRIORITY & REGULAR SECTIONS
function renderTasks() {
  const prioritiesList = document.getElementById('prioritiesList');
  const regularList = document.getElementById('taskList');
  const groupPriorities = document.getElementById('groupPriorities');

  if (!regularList || !prioritiesList) return;

  prioritiesList.innerHTML = '';
  regularList.innerHTML = '';

  const todayStr = new Date().toISOString().slice(0, 10);

  const activeToday = tasks.filter(t => !t.completed && (!t.scheduledDate || t.scheduledDate <= todayStr));
  const doneToday = tasks.filter(t => t.completed);

  const favTasks = activeToday.filter(t => t.isFavorite);
  const regularTasks = activeToday.filter(t => !t.isFavorite);

  // Update counter badges
  const archBadge = document.getElementById('archiveCountBadge');
  if (archBadge) archBadge.textContent = doneToday.length + archivedTasks.length;

  const plannedTasks = tasks.filter(t => !t.completed && t.scheduledDate && t.scheduledDate > todayStr);
  const plannedBadge = document.getElementById('plannedCountBadge');
  if (plannedBadge) plannedBadge.textContent = plannedTasks.length;

  if (groupPriorities) {
    groupPriorities.style.display = favTasks.length > 0 ? 'block' : 'none';
  }
  favTasks.forEach(task => {
    prioritiesList.appendChild(createTaskDOMElement(task));
  });

  regularTasks.forEach(task => {
    regularList.appendChild(createTaskDOMElement(task));
  });
  doneToday.forEach(task => {
    regularList.appendChild(createTaskDOMElement(task));
  });

  newlyAddedTaskId = null;
}

// 2-ROW TASK CARD (SPAN PLAN ARCHITECTURE)
function createTaskDOMElement(task) {
  const wrapper = document.createElement('li');
  wrapper.className = 'task-item-wrapper';

  const isJustAdded = task.id === newlyAddedTaskId;
  const isCurrentlyInFocus = activeTask && String(activeTask.id) === String(task.id);
  const durationMinutes = (task.estimate || 1) * 25;

  wrapper.innerHTML = `
    <div class="task-item ${task.completed ? 'completed' : ''} ${isJustAdded ? 'just-added' : ''} ${isCurrentlyInFocus ? 'in-focus-active' : ''}" 
         id="task-node-${task.id}" 
         data-cat="${task.category || 'Work'}"
         onclick="openEditModalForTask('${task.id}')">
      
      <!-- LINE 1: CHECKBOX + TITLE + COMPACT MENU ⋮ -->
      <div class="task-row-main">
        <div class="task-main-left">
          <div class="checkbox" onclick="event.stopPropagation(); toggleTaskById('${task.id}')">
            ${task.completed ? '✓' : ''}
          </div>
          <span class="task-title-text">${task.title}</span>
        </div>

        <div class="task-menu-container">
          <button class="btn-task-menu" type="button" onclick="toggleTaskActionMenu('${task.id}', event)" title="Task actions">⋮</button>
          <div class="task-actions-dropdown" id="menu-dropdown-${task.id}">
            <button class="dropdown-item" type="button" onclick="event.stopPropagation(); setSpotlightTaskById('${task.id}')">🎯 Focus this task</button>
            <button class="dropdown-item" type="button" onclick="event.stopPropagation(); toggleFavorite('${task.id}')">${task.isFavorite ? '☆ Remove priority' : '⭐ Set as priority'}</button>
            <button class="dropdown-item" type="button" onclick="event.stopPropagation(); openEditModalForTask('${task.id}')">✏️ Edit task</button>
            <button class="dropdown-item danger" type="button" onclick="event.stopPropagation(); deleteTaskById('${task.id}')">✕ Delete</button>
          </div>
        </div>
      </div>

      <!-- LINE 2: METADATA SUB-ROW -->
      <div class="task-row-meta">
        ${task.scheduledTime ? `<span class="task-meta-time">🕒 ${task.scheduledTime} •</span>` : ''}
        <span class="task-meta-time">⏱ ${durationMinutes}m</span>
        ${task.category ? `<span class="task-meta-tag" data-cat="${task.category}">${task.category}</span>` : ''}
        ${isCurrentlyInFocus ? `<span class="task-meta-focus">🎯 Focus</span>` : ''}
        ${(!task.completed && task.isFavorite && !isCurrentlyInFocus) ? `<span class="task-meta-star" title="Priority">⭐</span>` : ''}
      </div>

    </div>
  `;

  const itemNode = wrapper.querySelector('.task-item');

  // SWIPE RIGHT TO TRIGGER FOCUS DIRECTLY
  let touchStartX = 0;
  let touchStartY = 0;
  let touchDiffX = 0;
  let touchDiffY = 0;
  let isHorizontalGesture = null;

  itemNode.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchDiffX = 0;
    touchDiffY = 0;
    isHorizontalGesture = null;
  }, { passive: true });

  itemNode.addEventListener('touchmove', (e) => {
    touchDiffX = e.touches[0].clientX - touchStartX;
    touchDiffY = e.touches[0].clientY - touchStartY;

    if (isHorizontalGesture === null && (Math.abs(touchDiffX) > 10 || Math.abs(touchDiffY) > 10)) {
      isHorizontalGesture = Math.abs(touchDiffX) > Math.abs(touchDiffY);
    }

    if (isHorizontalGesture === true && touchDiffX > 10) {
      itemNode.style.transition = 'none';
      const moveDistance = Math.min(touchDiffX, 75);
      itemNode.style.transform = `translateX(${moveDistance}px)`;
    }
  }, { passive: true });

  itemNode.addEventListener('touchend', () => {
    if (isHorizontalGesture === true) {
      itemNode.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
      if (touchDiffX > 65) {
        triggerHapticFeedback();
        itemNode.style.transform = `translateX(120px)`;
        setTimeout(() => {
          setSpotlightTaskById(task.id);
        }, 150);
      } else {
        itemNode.style.transform = `translateX(0px)`;
      }
    } else {
      itemNode.style.transform = `translateX(0px)`;
    }
  });

  return wrapper;
}

function addTask() {
  const input = document.getElementById('taskInput');
  const catSelect = document.getElementById('taskCategory');
  const text = input ? input.value.trim() : '';
  const category = catSelect ? catSelect.value : 'Work';

  if (!text) return;

  const newTask = {
    id: 't_' + Date.now(),
    title: text,
    category: category,
    estimate: 1,
    completed: false,
    isFavorite: false,
    scheduledDate: null,
    scheduledTime: null
  };

  newlyAddedTaskId = newTask.id;
  tasks.unshift(newTask);
  if (input) input.value = '';

  saveTasks();
}

function toggleTaskById(id) {
  const t = tasks.find(x => String(x.id) === String(id));
  if (!t) return;

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

  if (activeTask && String(activeTask.id) === String(t.id)) {
    dismissSpotlightTask();
  }

  saveTasks();
}

function deleteTaskById(id) {
  if (activeTask && String(activeTask.id) === String(id)) dismissSpotlightTask();
  tasks = tasks.filter(t => String(t.id) !== String(id));
  saveTasks();
}

function toggleFavorite(id) {
  const t = tasks.find(x => String(x.id) === String(id));
  if (!t) return;

  const maxAllowed = getMaxFavoritesAllowed();
  const currentFavs = tasks.filter(x => x.isFavorite && !x.completed && String(x.id) !== String(id));

  if (!t.isFavorite && currentFavs.length >= maxAllowed) {
    alert(`Maximum ${maxAllowed} priority tasks allowed.`);
    return;
  }

  t.isFavorite = !t.isFavorite;
  saveTasks();
}

function setSpotlightTaskById(id) {
  const target = tasks.find(t => String(t.id) === String(id));
  if (!target) return;

  target.isFavorite = false;
  activeTask = target;
  window.SpanState.activeTask = activeTask;

  const favs = tasks.filter(t => t.isFavorite && !t.completed);
  if (favs.length > 2) {
    favs[favs.length - 1].isFavorite = false;
  }

  saveTasks();
  if (typeof switchView === 'function') {
    switchView('focus', document.getElementById('nav-btn-focus'));
  }
}

function dismissSpotlightTask() {
  if (activeTask) {
    const prev = tasks.find(t => String(t.id) === String(activeTask.id));
    if (prev && !prev.completed) {
      const currentFavs = tasks.filter(t => t.isFavorite && !t.completed);
      if (currentFavs.length >= 3) {
        currentFavs[currentFavs.length - 1].isFavorite = false;
      }
      prev.isFavorite = true;
    }
  }
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
  saveTasks();
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
      if (spotlightText) spotlightText.textContent = activeTask.title;
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const pending = tasks.filter(t => !t.completed && (!t.scheduledDate || t.scheduledDate <= todayStr));

  if (pending.length === 0) {
    dropdown.innerHTML = `<div class="task-picker-item" style="color:var(--text-muted); padding: 12px;">No pending tasks</div>`;
  } else {
    const favs = pending.filter(t => t.isFavorite);
    const others = pending.filter(t => !t.isFavorite);

    let html = '';
    if (favs.length > 0) {
      html += `<div class="task-picker-header">⭐ Priorities</div>`;
      html += favs.map(t => renderPickerRow(t)).join('');
    }
    if (others.length > 0) {
      html += `<div class="task-picker-header">Tasks</div>`;
      html += others.map(t => renderPickerRow(t)).join('');
    }
    dropdown.innerHTML = html;
  }
  dropdown.style.display = 'block';
}

function renderPickerRow(t) {
  return `
    <div class="task-picker-item" onclick="selectPickerTask('${t.id}')">
      <span>${t.isFavorite ? '⭐ ' : ''}${t.title}</span>
      <span style="color:var(--cat-${(t.category || 'work').toLowerCase()}); font-weight:600;">${t.category}</span>
    </div>
  `;
}

function selectPickerTask(taskId) {
  const found = tasks.find(x => String(x.id) === String(taskId));
  if (found) {
    found.isFavorite = false;
    activeTask = found;
    window.SpanState.activeTask = activeTask;
  }
  saveTasks();
}

function openArchiveSubView() {
  document.getElementById('tasks-main-subview').style.display = 'none';
  document.getElementById('tasks-planned-subview').style.display = 'none';
  document.getElementById('tasks-archive-subview').style.display = 'block';
  renderArchivedTasks();
}

function openPlannedSubView() {
  document.getElementById('tasks-main-subview').style.display = 'none';
  document.getElementById('tasks-archive-subview').style.display = 'none';
  document.getElementById('tasks-planned-subview').style.display = 'block';
  renderPlannedTasks();
}

function closeSubViews() {
  document.getElementById('tasks-archive-subview').style.display = 'none';
  document.getElementById('tasks-planned-subview').style.display = 'none';
  document.getElementById('tasks-main-subview').style.display = 'block';
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
    todayList.innerHTML = `<li style="font-size: 13px; color: var(--text-muted); padding: 8px 4px;">No tasks completed today yet</li>`;
  } else {
    completedToday.forEach(t => {
      const li = document.createElement('li');
      li.className = 'task-item completed';
      const timeStr = t.completedAt ? new Date(t.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      li.innerHTML = `
        <div class="task-row-main">
          <span class="task-title-text">${t.title}</span>
          ${timeStr ? `<span class="task-time-pill">${timeStr}</span>` : ''}
        </div>
      `;
      todayList.appendChild(li);
    });
  }

  if (archivedTasks.length === 0) {
    pastList.innerHTML = `<li style="font-size: 13px; color: var(--text-muted); padding: 8px 4px;">No past archives</li>`;
  } else {
    archivedTasks.forEach(t => {
      const li = document.createElement('li');
      li.className = 'task-item completed';
      const dateStr = t.archivedDate || (t.archivedAt ? t.archivedAt.slice(0, 10) : '');
      li.innerHTML = `
        <div class="task-row-main">
          <span class="task-title-text">${t.title}</span>
          ${dateStr ? `<span class="task-time-pill">${dateStr}</span>` : ''}
          <div style="display: flex; gap: 4px;">
            <button class="btn-task-menu" type="button" onclick="unarchiveTask('${t.id}')" title="Restore">↩</button>
            <button class="btn-task-menu" type="button" onclick="deleteArchivedTask('${t.id}')" title="Delete">✕</button>
          </div>
        </div>
      `;
      pastList.appendChild(li);
    });
  }
}

function renderPlannedTasks() {
  const list = document.getElementById('plannedTasksList');
  if (!list) return;

  const todayStr = new Date().toISOString().slice(0, 10);
  const planned = tasks.filter(t => !t.completed && t.scheduledDate && t.scheduledDate > todayStr);

  if (planned.length === 0) {
    list.innerHTML = `<li style="font-size: 13px; color: var(--text-muted); padding: 14px 4px; text-align: center;">No upcoming tasks planned yet.</li>`;
    return;
  }

  list.innerHTML = '';
  planned.forEach(t => {
    const li = document.createElement('li');
    li.className = 'task-item';
    li.dataset.cat = t.category || 'Work';
    li.innerHTML = `
      <div class="task-row-main" onclick="openEditModalForTask('${t.id}')">
        <span class="task-title-text">${t.title}</span>
        <span class="task-time-pill">📅 ${t.scheduledDate}</span>
        <button class="btn-task-menu" type="button" onclick="event.stopPropagation(); moveTaskToToday('${t.id}')" title="Move to Today">☀️</button>
      </div>
    `;
    list.appendChild(li);
  });
}

function moveTaskToToday(id) {
  const t = tasks.find(x => String(x.id) === String(id));
  if (t) {
    t.scheduledDate = null;
    saveTasks();
    closeSubViews();
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
    saveTasks();
  }
}

function deleteArchivedTask(id) {
  archivedTasks = archivedTasks.filter(t => String(t.id) !== String(id));
  saveTasks();
}

function openEditModalForTask(id) {
  const task = tasks.find(t => String(t.id) === String(id));
  if (!task) return;

  editingTaskId = id;
  editingCategory = task.category || 'Work';
  editingEstimate = task.estimate || 1;
  editingIsFavorite = !!task.isFavorite;

  const titleInput = document.getElementById('editTaskTitle');
  if (titleInput) titleInput.value = task.title;

  const estEl = document.getElementById('editPomodoroEstimate');
  if (estEl) estEl.textContent = editingEstimate;

  const minEl = document.getElementById('editEstMinutes');
  if (minEl) minEl.textContent = editingEstimate * 25;

  const dateInput = document.getElementById('editScheduledDate');
  if (dateInput) dateInput.value = task.scheduledDate || '';

  document.querySelectorAll('.cat-pill').forEach(btn => {
    const catKey = btn.dataset.cat;
    btn.classList.toggle('active', catKey === editingCategory);
  });

  const favBtn = document.getElementById('modalFavToggleBtn');
  if (favBtn) {
    favBtn.textContent = editingIsFavorite ? '⭐ Priority Active' : '☆ Normal';
  }

  const modal = document.getElementById('editModalOverlay');
  if (modal) modal.style.display = 'flex';
}

function toggleModalFavorite() {
  editingIsFavorite = !editingIsFavorite;
  const favBtn = document.getElementById('modalFavToggleBtn');
  if (favBtn) favBtn.textContent = editingIsFavorite ? '⭐ Priority Active' : '☆ Normal';
}

function selectEditCategory(cat) {
  editingCategory = cat;
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
  const dateInput = document.getElementById('editScheduledDate');
  const title = titleInput ? titleInput.value.trim() : '';
  if (!title) return;

  const task = tasks.find(t => String(t.id) === String(editingTaskId));
  if (task) {
    task.title = title;
    task.category = editingCategory || 'Work';
    task.estimate = editingEstimate;
    task.isFavorite = editingIsFavorite;
    task.scheduledDate = dateInput ? (dateInput.value || null) : null;

    if (activeTask && String(activeTask.id) === String(task.id)) {
      activeTask = task;
      window.SpanState.activeTask = activeTask;
    }
  }
  closeEditModal();
  saveTasks();
}

autoArchivePastDays();
checkScheduledTasksForToday();
