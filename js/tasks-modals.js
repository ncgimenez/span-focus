// ==============================================================
// SPAN FOCUS - MODALS & SUBVIEWS (EDIT, SUBTASKS, ARCHIVE, PICKER)
// ==============================================================

function toggleShortcutsModal() {
  const modal = document.getElementById('shortcutsModalOverlay');
  if (!modal) return;
  const isOpen = modal.style.display === 'flex';
  modal.style.display = isOpen ? 'none' : 'flex';
}

function toggleTaskPicker() {
  const dropdown = document.getElementById('taskPickerDropdown');
  if (!dropdown) return;

  if (dropdown.style.display === 'block') {
    dropdown.style.display = 'none';
    return;
  }

  const todayStr = getLocalDateString();
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

function selectPickerTask(taskId) {
  const found = tasks.find(x => String(x.id) === String(taskId));
  if (found) {
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

function moveTaskToTodayFromView(id) {
  moveTaskToToday(id);
  closeSubViews();
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
    if (typeof showToast === 'function') {
      showToast("No completed tasks to clean today.", "ℹ️");
    } else {
      alert("No completed tasks to clean today.");
    }
    return;
  }
  const now = new Date();
  completed.forEach(t => {
    archivedTasks.unshift({
      ...t,
      archivedAt: t.completedAt || now.toISOString(),
      archivedDate: t.completedDate || getLocalDateString(now)
    });
  });
  tasks = tasks.filter(t => !t.completed);
  saveTasks();
  renderArchivedTasks();
  if (typeof showToast === 'function') {
    showToast("Completed tasks archived!", "🗄️");
  }
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

let editingItemType = 'task';

function setEditItemType(type) {
  editingItemType = type;
  const btnTask = document.getElementById('btnTypeTask');
  const btnEvent = document.getElementById('btnTypeEvent');
  const rowParent = document.getElementById('rowParentEvent');

  if (btnTask) btnTask.classList.toggle('active', type === 'task');
  if (btnEvent) btnEvent.classList.toggle('active', type === 'event');
  if (rowParent) rowParent.style.display = (type === 'task') ? 'flex' : 'none';
}

var quickSubtaskTargetEventId = null;

function openQuickSubtaskModal(eventId) {
  quickSubtaskTargetEventId = String(eventId);
  const parent = tasks.find(t => String(t.id) === quickSubtaskTargetEventId);
  const eventName = parent ? parent.title : 'Item';

  const modal = document.getElementById('quickSubtaskModalOverlay');
  const label = document.getElementById('quickSubtaskParentLabel');
  const input = document.getElementById('quickSubtaskInput');
  const title = document.getElementById('quickSubtaskModalTitle');

  if (title) {
    title.textContent = parent && parent.isEvent ? '➕ Add Task under Event' : '➕ Add Subtask';
  }
  if (label) {
    label.textContent = `${parent && parent.isEvent ? 'Event' : 'Parent Task'}: "${eventName}"`;
  }
  if (input) {
    input.value = '';
    input.placeholder = parent && parent.isEvent ? 'Task title... (Press Enter)' : 'Subtask title... (Press Enter)';
  }
  setQuickSubtaskAction('auto');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => {
      if (input) input.focus();
    }, 50);
  }
}
window.openQuickSubtaskModal = openQuickSubtaskModal;

function closeQuickSubtaskModal() {
  const modal = document.getElementById('quickSubtaskModalOverlay');
  if (modal) modal.style.display = 'none';
  quickSubtaskTargetEventId = null;
}
window.closeQuickSubtaskModal = closeQuickSubtaskModal;

function submitQuickSubtaskModal() {
  const input = document.getElementById('quickSubtaskInput');
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    input.focus();
    return;
  }

  if (!quickSubtaskTargetEventId) {
    closeQuickSubtaskModal();
    return;
  }

  pushUndoState('Add Subtask');
  const parent = tasks.find(t => String(t.id) === quickSubtaskTargetEventId);
  let subCat = parent ? parent.category : 'Work';
  if (/#(life|perso|home)\b/i.test(val)) subCat = 'Home';
  else if (/#(fun|sport)\b/i.test(val)) subCat = 'Fun';
  else if (/#(work|code|pro)\b/i.test(val)) subCat = 'Work';

  const newTask = {
    id: 't_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    title: val,
    category: subCat,
    actionType: (quickSubtaskAction === 'auto') ? null : quickSubtaskAction,
    estimate: 1,
    duration: 30,
    completed: false,
    isFavorite: false,
    isEvent: false,
    parentEventId: quickSubtaskTargetEventId,
    scheduledDate: parent ? parent.scheduledDate : getLocalDateString(),
    scheduledTime: null
  };

  newlyAddedTaskId = newTask.id;
  tasks.push(newTask);
  closeQuickSubtaskModal();
  saveTasks();
  if (typeof showToast === 'function') {
    showToast(`Subtask added under "${parent ? parent.title : 'item'}"`, '📎');
  }
}
window.submitQuickSubtaskModal = submitQuickSubtaskModal;

function quickAddSubtaskPrompt(eventId) {
  openQuickSubtaskModal(eventId);
}
window.quickAddSubtaskPrompt = quickAddSubtaskPrompt;

function openEditModalForTask(id) {
  const task = tasks.find(t => String(t.id) === String(id));
  if (!task) return;

  editingTaskId = id;
  editingCategory = task.category || 'Work';
  editingEstimate = task.estimate || 1;
  editingIsFavorite = !!task.isFavorite;

  // Populate parent item options (Events or Big Tasks that are not nested)
  const parentSelect = document.getElementById('editParentEvent');
  if (parentSelect) {
    parentSelect.innerHTML = '<option value="">(Independent Task - No Parent)</option>';
    const availableParents = tasks.filter(t => !t.completed && !t.parentEventId && String(t.id) !== String(id));
    availableParents.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.isEvent ? '📅' : '📋'} ${p.title}`;
      parentSelect.appendChild(opt);
    });
    parentSelect.value = task.parentEventId || '';
  }

  setEditItemType(task.isEvent ? 'event' : 'task');

  const modalTitle = document.getElementById('editModalTitle');
  if (modalTitle) {
    modalTitle.textContent = task.isEvent ? "📅 Event Details" : "✏️ Edit Task";
  }

  const titleInput = document.getElementById('editTaskTitle');
  if (titleInput) {
    titleInput.value = task.title;
    setTimeout(() => titleInput.focus(), 50);
  }

  const estEl = document.getElementById('editPomodoroEstimate');
  if (estEl) estEl.textContent = editingEstimate;

  const minEl = document.getElementById('editEstMinutes');
  if (minEl) minEl.textContent = editingEstimate * 30;

  const dateInput = document.getElementById('editScheduledDate');
  if (dateInput) dateInput.value = task.scheduledDate || '';

  const timeInput = document.getElementById('editScheduledTime');
  if (timeInput) timeInput.value = task.scheduledTime || '';

  document.querySelectorAll('#modalCategoryPills .cat-pill').forEach(btn => {
    const catKey = btn.dataset.cat;
    btn.classList.toggle('active', catKey === editingCategory);
  });

  selectEditActionType(task.actionType || 'auto');

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
  if (minEl) minEl.textContent = editingEstimate * 30;
}

function closeEditModal() {
  const modal = document.getElementById('editModalOverlay');
  if (modal) modal.style.display = 'none';
  editingTaskId = null;
}

function deleteCurrentEditingTask() {
  if (!editingTaskId) return;
  const idToDelete = editingTaskId;
  closeEditModal();
  deleteTaskById(idToDelete);
}

function saveTaskModal() {
  const titleInput = document.getElementById('editTaskTitle');
  const dateInput = document.getElementById('editScheduledDate');
  const timeInput = document.getElementById('editScheduledTime');
  const parentSelect = document.getElementById('editParentEvent');
  const title = titleInput ? titleInput.value.trim() : '';
  if (!title) return;

  const task = tasks.find(t => String(t.id) === String(editingTaskId));
  if (task) {
    task.title = title;
    task.category = editingCategory || 'Work';
    task.estimate = editingEstimate;
    if (!task.isEvent || !task.duration) {
      task.duration = editingEstimate * 30;
    }
    task.isFavorite = editingIsFavorite;
    task.actionType = (editingActionType === 'auto') ? null : editingActionType;
    task.scheduledDate = dateInput ? (dateInput.value || null) : null;
    task.scheduledTime = timeInput ? (timeInput.value.trim() || null) : null;
    task.isEvent = (editingItemType === 'event');
    task.parentEventId = (editingItemType === 'task' && parentSelect) ? (parentSelect.value || null) : null;

    if (activeTask && String(activeTask.id) === String(task.id)) {
      activeTask = task;
      window.SpanState.activeTask = activeTask;
    }
  }
  closeEditModal();
  saveTasks();
  if (typeof showToast === 'function') showToast('Changes saved!', '💾');
}

// Global Keyboard Shortcuts (Cmd+Z: Undo, Space: Timer, N: New task, Enter/Esc: Modals)
