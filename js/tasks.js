window.SpanState = window.SpanState || {};

// Standardized Span Tri-Category System
window.SpanState.categoryLabels = {
  Work: 'Work',
  Home: 'Home',
  Fun: 'Fun'
};

window.SpanState.tasks = JSON.parse(localStorage.getItem('span_tasks')) || [
  { id: 't_1', title: "Review Weekly Plan #work", category: "Work", estimate: 2, completed: false, isFavorite: true },
  { id: 't_2', title: "Grocery shopping #home", category: "Home", estimate: 1, completed: false, isFavorite: false }
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
let isPastFocusDayExpanded = false;
let newlyAddedTaskId = null;
let activeTagFilter = null;

// Robust Local Date (YYYY-MM-DD) avoiding UTC day-lag across timezones
function getLocalDateString(dateObj = new Date()) {
  const d = (dateObj instanceof Date && !isNaN(dateObj)) ? dateObj : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
window.getLocalDateString = getLocalDateString;

const nowInit = new Date();
const todayStrInit = getLocalDateString(nowInit);

// ==============================================================
// UNDO HISTORY STACK (CMD+Z / CTRL+Z SUPPORT)
// ==============================================================
const undoStack = [];
const MAX_UNDO_HISTORY = 25;

function pushUndoState(actionName = 'Action') {
  try {
    const snapshot = {
      tasks: JSON.parse(JSON.stringify(tasks)),
      archivedTasks: JSON.parse(JSON.stringify(archivedTasks)),
      activeTask: activeTask ? JSON.parse(JSON.stringify(activeTask)) : null,
      deletedIds: JSON.parse(localStorage.getItem('span_deleted_task_ids') || '[]'),
      dismissedIds: JSON.parse(localStorage.getItem('span_plan_dismissed_focus_ids') || '[]'),
      actionName
    };
    undoStack.push(snapshot);
    if (undoStack.length > MAX_UNDO_HISTORY) {
      undoStack.shift();
    }
  } catch (err) {
    console.warn("Could not record undo state:", err);
  }
}

function undoLastAction() {
  if (undoStack.length === 0) {
    if (typeof showToast === 'function') showToast("Nothing to undo", "ℹ️");
    return;
  }

  const previousState = undoStack.pop();
  if (!previousState) return;

  tasks = previousState.tasks || [];
  archivedTasks = previousState.archivedTasks || [];
  activeTask = previousState.activeTask || null;

  window.SpanState.tasks = tasks;
  window.SpanState.archivedTasks = archivedTasks;
  window.SpanState.activeTask = activeTask;

  localStorage.setItem('span_tasks', JSON.stringify(tasks));
  localStorage.setItem('span_archived_tasks', JSON.stringify(archivedTasks));
  localStorage.setItem('span_active_task', JSON.stringify(activeTask));

  if (previousState.deletedIds) {
    localStorage.setItem('span_deleted_task_ids', JSON.stringify(previousState.deletedIds));
  }
  if (previousState.dismissedIds) {
    localStorage.setItem('span_plan_dismissed_focus_ids', JSON.stringify(previousState.dismissedIds));
  }

  if (typeof exportAllTasksToSpanPlan === 'function') {
    exportAllTasksToSpanPlan();
  }

  renderTasks();
  renderArchivedTasks();
  renderPlannedTasks();
  updateSpotlightUI();
  if (typeof updateStats === 'function') updateStats();
  if (typeof saveStateToCloud === 'function') saveStateToCloud();

  if (typeof showToast === 'function') {
    showToast(`Undone: ${previousState.actionName || 'Action'} ↩️`, '↩️');
  }
}
window.undoLastAction = undoLastAction;

// Migration of legacy categories into inline #tags and the unified tri-category system
function normalizeTaskAndMigrateTags(t) {
  let title = t.title || t.text || 'Untitled Task';
  let cat = t.category || 'Work';

  const legacyCustomCats = ['Code', 'Study', 'Write', 'Admin', 'Finances', 'Organisation', 'Important', 'Personal'];
  if (legacyCustomCats.includes(cat)) {
    const tagCandidate = `#${cat.toLowerCase()}`;
    if (!title.toLowerCase().includes(tagCandidate)) {
      title = `${title} ${tagCandidate}`;
    }
    if (['Code', 'Write', 'Study'].includes(cat)) cat = 'Work';
    else if (['Admin', 'Finances', 'Organisation', 'Important', 'Personal'].includes(cat)) cat = 'Home';
    else cat = 'Work';
  }

  if (cat !== 'Work' && cat !== 'Home' && cat !== 'Fun') {
    cat = 'Work';
  }

  const isEvent = !!t.isEvent;
  const isDone = !isEvent && !!t.completed;
  return {
    ...t,
    title: title.trim(),
    category: cat,
    isFavorite: !!t.isFavorite,
    isEvent: isEvent,
    parentEventId: t.parentEventId || null,
    scheduledDate: t.scheduledDate !== undefined ? t.scheduledDate : todayStrInit,
    scheduledTime: t.scheduledTime || null,
    completed: isDone,
    completedAt: isDone ? (t.completedAt || nowInit.toISOString()) : null,
    completedDate: isDone ? (t.completedDate || todayStrInit) : null
  };
}

tasks = tasks.map(normalizeTaskAndMigrateTags);

function triggerHapticFeedback() {
  if (navigator.vibrate) {
    try { navigator.vibrate(20); } catch (e) {}
  }
}

function getMaxFavoritesAllowed() {
  return activeTask ? 2 : 3;
}

// Convert #tags in titles into clickable pill badges
function renderTitleWithTags(titleStr) {
  if (!titleStr) return 'Untitled Task';
  return titleStr.replace(/#([\w\-]+)/g, (match, tag) => {
    return `<span class="task-inline-tag" onclick="event.stopPropagation(); setTagFilter('${tag}')">#${tag}</span>`;
  });
}

function setTagFilter(tag) {
  if (activeTagFilter === tag) {
    clearTagFilter();
  } else {
    activeTagFilter = tag;
    updateTagFilterUI();
    renderTasks();
  }
}

function clearTagFilter() {
  activeTagFilter = null;
  updateTagFilterUI();
  renderTasks();
}

function updateTagFilterUI() {
  const bar = document.getElementById('tagFilterActiveBar');
  const label = document.getElementById('tagFilterActiveLabel');
  if (bar && label) {
    if (activeTagFilter) {
      label.textContent = `Filter: #${activeTagFilter}`;
      bar.classList.add('show');
    } else {
      bar.classList.remove('show');
    }
  }
}

function checkScheduledTasksForToday() {
  // Keeps scheduledDate intact so planned tasks always show up in Planned view
}

function autoArchivePastDays() {
  const todayStr = getLocalDateString();
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

  if (typeof exportAllTasksToSpanPlan === 'function') {
    exportAllTasksToSpanPlan();
  }

  renderTasks();
  renderArchivedTasks();
  renderPlannedTasks();
  updateSpotlightUI();
  if (typeof updateStats === 'function') updateStats();
  if (typeof saveStateToCloud === 'function') saveStateToCloud();
}

function applyLoadedTasksFromState() {
  tasks = window.SpanState.tasks || [];
  archivedTasks = window.SpanState.archivedTasks || [];
  activeTask = window.SpanState.activeTask || null;
}
window.applyLoadedTasksFromState = applyLoadedTasksFromState;

function handleInputFocus(isFocused) {
  document.body.classList.toggle('is-typing-mode', isFocused);
}

// Close task contextual dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.task-menu-container')) {
    document.querySelectorAll('.task-actions-dropdown.show').forEach(menu => {
      menu.classList.remove('show');
      const item = menu.closest('.task-item');
      if (item) item.style.zIndex = '';
    });
  }
});

function toggleTaskActionMenu(taskId, event) {
  event.stopPropagation();
  const targetMenu = document.getElementById(`menu-dropdown-${taskId}`);
  const isAlreadyOpen = targetMenu && targetMenu.classList.contains('show');

  document.querySelectorAll('.task-actions-dropdown.show').forEach(menu => {
    menu.classList.remove('show');
    const item = menu.closest('.task-item');
    if (item) item.style.zIndex = '';
  });

  if (!isAlreadyOpen && targetMenu) {
    targetMenu.classList.add('show');
    const item = targetMenu.closest('.task-item');
    if (item) item.style.zIndex = '100';
  }
}

let isBacklogOpen = localStorage.getItem('span_backlog_open') !== 'false';
let activeCategories = new Set(); // Empty Set means 'all' (all categories shown)

function setCategoryFilter(cat) {
  if (cat === 'all') {
    activeCategories.clear();
  } else {
    // Si on était sur 'all' (Tout), le premier clic isole la catégorie choisie
    if (activeCategories.size === 0) {
      activeCategories.add(cat);
    } else {
      // Toggle cumulatif de la catégorie cliquée
      if (activeCategories.has(cat)) {
        activeCategories.delete(cat);
        // Si plus aucune catégorie n'est sélectionnée, retour automatique à 'all'
        if (activeCategories.size === 0) {
          activeCategories.clear();
        }
      } else {
        activeCategories.add(cat);
        // Si les 3 catégories sont cochées, c'est identique à Tout
        if (activeCategories.size === 3) {
          activeCategories.clear();
        }
      }
    }
  }

  updateCategoryFilterUI();
  renderTasks();
}

function updateCategoryFilterUI() {
  const isAll = (activeCategories.size === 0);
  document.querySelectorAll('.cat-filter-btn[data-filter]').forEach(btn => {
    const f = btn.dataset.filter;
    if (f === 'all') {
      btn.classList.toggle('active', isAll);
    } else {
      btn.classList.toggle('active', !isAll && activeCategories.has(f));
    }
  });
}

let activeTaskTab = localStorage.getItem('span_active_task_tab') || 'today';

function switchTaskTab(tab) {
  activeTaskTab = tab;
  localStorage.setItem('span_active_task_tab', tab);
  updateTaskTabsUI();
}

function updateTaskTabsUI() {
  const btnToday = document.getElementById('tabBtnToday');
  const btnInbox = document.getElementById('tabBtnInbox');
  const btnBoth = document.getElementById('tabBtnBoth');
  const paneToday = document.getElementById('paneToday');
  const paneInbox = document.getElementById('paneInbox');
  const wrapper = document.getElementById('tasksSectionsWrapper');

  const isBoth = (activeTaskTab === 'both');
  const showToday = (activeTaskTab === 'today') || isBoth;
  const showInbox = (activeTaskTab === 'inbox') || isBoth;

  if (btnToday) btnToday.classList.toggle('active', activeTaskTab === 'today');
  if (btnInbox) btnInbox.classList.toggle('active', activeTaskTab === 'inbox');
  if (btnBoth) btnBoth.classList.toggle('active', isBoth);

  if (paneToday) paneToday.style.display = showToday ? 'flex' : 'none';
  if (paneInbox) paneInbox.style.display = showInbox ? 'flex' : 'none';

  if (wrapper) {
    wrapper.classList.toggle('is-split-view', isBoth);
  }
}

function handleTaskTargetChange() {
  const targetSelect = document.getElementById('taskTarget');
  if (targetSelect) {
    localStorage.setItem('span_task_target_default', targetSelect.value);
  }
}

function initTaskTargetDefault() {
  const targetSelect = document.getElementById('taskTarget');
  if (targetSelect) {
    const saved = localStorage.getItem('span_task_target_default');
    if (saved) {
      targetSelect.value = saved;
    } else {
      targetSelect.value = 'inbox'; // Defaults to Inbox as requested!
    }
  }
}

function toggleShortcutsModal() {
  const modal = document.getElementById('shortcutsModalOverlay');
  if (!modal) return;
  const isOpen = modal.style.display === 'flex';
  modal.style.display = isOpen ? 'none' : 'flex';
}

let currentDayOffset = 0;

function navigateDayOffset(delta) {
  currentDayOffset += delta;
  updateDayNavUI();
  renderTasks();
}

function getSelectedDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + currentDayOffset);
  return getLocalDateString(d);
}

function updateDayNavUI() {
  const label = document.getElementById('dayNavLabel');
  if (label) {
    if (currentDayOffset === 0) {
      label.textContent = "Today";
    } else if (currentDayOffset === 1) {
      label.textContent = "Tomorrow 🌙";
    } else if (currentDayOffset === -1) {
      label.textContent = "Yesterday";
    } else {
      const d = new Date();
      d.setDate(d.getDate() + currentDayOffset);
      label.textContent = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
    }
  }

  const titleHeader = document.getElementById('titleTasksHeader');
  if (titleHeader) {
    if (currentDayOffset === 0) titleHeader.textContent = "⚡ Today's Tasks";
    else if (currentDayOffset === 1) titleHeader.textContent = "🌙 Tomorrow's Tasks";
    else titleHeader.textContent = `📅 Tasks`;
  }
}

function moveTaskToSelectedDay(id) {
  const t = tasks.find(x => String(x.id) === String(id));
  if (!t) return;
  pushUndoState('Schedule Task');
  const targetDate = getSelectedDateStr();
  t.scheduledDate = targetDate;
  saveTasks();
  const dayName = currentDayOffset === 0 ? "today" : (currentDayOffset === 1 ? "tomorrow" : "selected date");
  if (typeof showToast === 'function') showToast(`Scheduled for ${dayName}!`, '⚡');
}

function calculateEndTime(startTimeStr, durationMinutes = 25) {
  if (!startTimeStr || !startTimeStr.includes(':')) return null;
  const [hStr, mStr] = startTimeStr.split(':');
  const totalMins = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + durationMinutes;
  const endH = Math.floor((totalMins / 60) % 24);
  const endM = totalMins % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

function calculateMinutesDiff(startStr, endStr) {
  if (!startStr || !endStr || !startStr.includes(':') || !endStr.includes(':')) return 0;
  const [h1, m1] = startStr.split(':').map(Number);
  const [h2, m2] = endStr.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

function formatMinutesDuration(totalMins) {
  if (totalMins <= 0) return '';
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0 && mins > 0) return `${hours}h${mins < 10 ? '0' + mins : mins}`;
  if (hours > 0) return `${hours}h`;
  return `${mins} min`;
}

function insertTaskAtTime(timeStr, defaultDuration = 30) {
  const title = prompt(`Schedule a task (${defaultDuration} min) for ${timeStr}:`);
  if (!title || !title.trim()) return;
  const targetDate = getSelectedDateStr();
  const newTask = {
    id: 't_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    title: title.trim(),
    category: 'Work',
    estimate: Math.max(1, Math.round(defaultDuration / 25)),
    duration: defaultDuration,
    completed: false,
    isFavorite: false,
    isEvent: false,
    parentEventId: null,
    scheduledDate: targetDate,
    scheduledTime: timeStr
  };
  tasks.push(newTask);
  saveTasks();
  if (typeof showToast === 'function') showToast(`Task set for ${timeStr} (${defaultDuration}m)`, '⏱');
}

function attachTaskToEvent(childTaskId, parentEventId) {
  const child = tasks.find(t => String(t.id) === String(childTaskId));
  const parent = tasks.find(t => String(t.id) === String(parentEventId));
  if (!child || !parent) return;

  child.parentEventId = String(parent.id);
  child.scheduledDate = parent.scheduledDate;
  child.isEvent = false;

  saveTasks();
  if (typeof showToast === 'function') showToast(`Attached to "${parent.title}"!`, '📎');
}

function detachSubtask(taskId) {
  const t = tasks.find(x => String(x.id) === String(taskId));
  if (!t) return;
  pushUndoState('Detach Subtask');
  t.parentEventId = null;
  saveTasks();
  if (typeof showToast === 'function') showToast("Task detached from event!", '📎');
}

function setupGapDropTarget(gapNode, gapStartTime) {
  gapNode.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    gapNode.classList.add('drag-over');
  });

  gapNode.addEventListener('dragleave', (e) => {
    if (!gapNode.contains(e.relatedTarget)) {
      gapNode.classList.remove('drag-over');
    }
  });

  gapNode.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    gapNode.classList.remove('drag-over');
    const draggedTaskId = e.dataTransfer.getData('text/plain');
    if (!draggedTaskId) return;

    const t = tasks.find(x => String(x.id) === String(draggedTaskId));
    if (!t) return;

    t.parentEventId = null;
    t.scheduledDate = getSelectedDateStr();
    t.scheduledTime = gapStartTime;
    if (!t.duration || t.duration === 25) t.duration = 30;
    saveTasks();
    if (typeof showToast === 'function') showToast(`Task scheduled at ${gapStartTime} (${t.duration}m)!`, '⏱');
  });
}

function getSampleTasks(dateStr) {
  const d = dateStr || getLocalDateString();
  return [
    // 1. Scheduled events today (Focus Day / Schedule)
    {
      id: 'ev_standup',
      title: "Team Standup & Sync #work",
      category: "Work",
      estimate: 2,
      duration: 60,
      completed: false,
      isFavorite: false,
      isEvent: true,
      parentEventId: null,
      scheduledDate: d,
      scheduledTime: "09:30" // 09:30 - 10:30
    },
    {
      id: 'sub_standup_1',
      title: "Prepare 3 key discussion points #work",
      category: "Work",
      estimate: 1,
      duration: 25,
      completed: false,
      isFavorite: false,
      isEvent: false,
      parentEventId: 'ev_standup',
      scheduledDate: d,
      scheduledTime: null
    },
    // GAP 1: 10:30 - 11:30 (1h00 free!)
    {
      id: 'ev_deepwork',
      title: "Deep Work: Core Feature Engine #work",
      category: "Work",
      estimate: 2,
      duration: 60,
      completed: false,
      isFavorite: true,
      isEvent: true,
      parentEventId: null,
      scheduledDate: d,
      scheduledTime: "11:30" // 11:30 - 12:30
    },
    // GAP 2: 12:30 - 14:00 (1h30 free / Lunch!)
    {
      id: 'ev_review',
      title: "Architecture & Design Review #work",
      category: "Work",
      estimate: 2,
      duration: 45,
      completed: false,
      isFavorite: false,
      isEvent: true,
      parentEventId: null,
      scheduledDate: d,
      scheduledTime: "14:00" // 14:00 - 14:45
    },
    // GAP 3: 14:45 - 16:30 (1h45 free!)
    {
      id: 'ev_admin',
      title: "Invoices, Taxes & Insurance #home",
      category: "Home",
      estimate: 2,
      duration: 45,
      completed: false,
      isFavorite: false,
      isEvent: true,
      parentEventId: null,
      scheduledDate: d,
      scheduledTime: "16:30" // 16:30 - 17:15
    },

    // 2. Floating tasks today (no fixed hour)
    {
      id: 't_today_1',
      title: "Review PR on GitHub #work",
      category: "Work",
      estimate: 1,
      duration: 25,
      completed: false,
      isFavorite: true,
      isEvent: false,
      parentEventId: null,
      scheduledDate: d,
      scheduledTime: null
    },
    {
      id: 't_today_2',
      title: "Groceries & Healthy Dinner #home",
      category: "Home",
      estimate: 1,
      duration: 25,
      completed: false,
      isFavorite: false,
      isEvent: false,
      parentEventId: null,
      scheduledDate: d,
      scheduledTime: null
    },

    // 3. Inbox / Backlog tasks (ready to be scheduled)
    {
      id: 't_backlog_1',
      title: "Send recap email #work",
      category: "Work",
      estimate: 1,
      duration: 30,
      completed: false,
      isFavorite: false,
      isEvent: false,
      parentEventId: null,
      scheduledDate: null,
      scheduledTime: null
    },
    {
      id: 't_backlog_2',
      title: "Check car insurance quote #home",
      category: "Home",
      estimate: 1,
      duration: 25,
      completed: false,
      isFavorite: false,
      isEvent: false,
      parentEventId: null,
      scheduledDate: null,
      scheduledTime: null
    },
    {
      id: 't_backlog_3',
      title: "Scan and file healthcare receipts #home",
      category: "Home",
      estimate: 1,
      duration: 25,
      completed: false,
      isFavorite: false,
      isEvent: false,
      parentEventId: null,
      scheduledDate: null,
      scheduledTime: null
    },
    {
      id: 't_backlog_4',
      title: "Book restaurant for the weekend #fun",
      category: "Fun",
      estimate: 1,
      duration: 25,
      completed: false,
      isFavorite: false,
      isEvent: false,
      parentEventId: null,
      scheduledDate: null,
      scheduledTime: null
    },
    {
      id: 't_backlog_5',
      title: "Listen to tech podcast #fun",
      category: "Fun",
      estimate: 1,
      duration: 25,
      completed: false,
      isFavorite: false,
      isEvent: false,
      parentEventId: null,
      scheduledDate: null,
      scheduledTime: null
    }
  ];
}

function loadSampleTasksIfEmpty(force = false) {
  const currentToday = getLocalDateString();
  const hasEvents = tasks.some(t => t.isEvent);

  if (force || tasks.length <= 2 || !hasEvents) {
    const samples = getSampleTasks(currentToday);
    const customUserTasks = tasks.filter(t => t.id !== 't_1' && t.id !== 't_2' && !samples.some(s => s.id === t.id));
    tasks = [...samples, ...customUserTasks];
    saveTasks();
    if (typeof showToast === 'function') showToast("Sample day schedule loaded!", "📅");
  }
}

function syncWithSpanPlan() {
  const rawPlanTasks = localStorage.getItem('span_plan_tasks');
  if (!rawPlanTasks) return;

  try {
    const planTasks = JSON.parse(rawPlanTasks);
    if (!Array.isArray(planTasks)) return;

    let modified = false;
    const catMap = { work: 'Work', life: 'Home', fun: 'Fun' };
    const deletedSet = new Set(JSON.parse(localStorage.getItem('span_deleted_task_ids') || '[]'));

    planTasks.forEach(pTask => {
      if (!pTask || !pTask.id) return;
      if (deletedSet.has(String(pTask.id))) return;
      const existing = tasks.find(t => String(t.id) === String(pTask.id) || (t.planId && String(t.planId) === String(pTask.id)));
      const isEv = pTask.type === 'event' || !!pTask.isEvent;
      
      if (!existing) {
        tasks.push({
          id: pTask.id,
          planId: pTask.id,
          title: pTask.title || 'Untitled',
          category: catMap[pTask.context] || 'Work',
          estimate: Math.max(1, Math.round((pTask.duration || 25) / 25)),
          duration: pTask.duration || 25,
          completed: !isEv && !!pTask.completed,
          isFavorite: false,
          isEvent: isEv,
          parentEventId: pTask.parentEventId || null,
          scheduledDate: pTask.date || null,
          scheduledTime: pTask.time || null
        });
        modified = true;
      } else {
        const targetDate = pTask.date || null;
        if (existing.scheduledDate !== targetDate) {
          existing.scheduledDate = targetDate;
          modified = true;
        }
        const targetTime = pTask.time || null;
        if (existing.scheduledTime !== targetTime) {
          existing.scheduledTime = targetTime;
          modified = true;
        }
        if (pTask.title && existing.title !== pTask.title) {
          existing.title = pTask.title;
          modified = true;
        }
        if (typeof pTask.duration === 'number' && existing.duration !== pTask.duration) {
          existing.duration = pTask.duration;
          existing.estimate = Math.max(1, Math.round(pTask.duration / 25));
          modified = true;
        }
        if (existing.isEvent !== isEv) {
          existing.isEvent = isEv;
          modified = true;
        }
        if (!existing.isEvent && typeof pTask.completed === 'boolean' && existing.completed !== pTask.completed) {
          existing.completed = pTask.completed;
          modified = true;
        }
      }

      // Sync nested subtasks from Plan event if present
      if (Array.isArray(pTask.subtasks) && pTask.subtasks.length > 0) {
        pTask.subtasks.forEach(sub => {
          if (!sub || !sub.id || deletedSet.has(String(sub.id))) return;
          const existingSub = tasks.find(t => String(t.id) === String(sub.id));
          if (!existingSub) {
            tasks.push({
              id: sub.id,
              title: sub.title || 'Subtask',
              category: catMap[pTask.context] || 'Work',
              estimate: 1,
              duration: 25,
              completed: !!sub.completed,
              isFavorite: false,
              isEvent: false,
              parentEventId: String(pTask.id),
              scheduledDate: pTask.date || null,
              scheduledTime: null
            });
            modified = true;
          } else {
            if (existingSub.completed !== !!sub.completed) {
              existingSub.completed = !!sub.completed;
              modified = true;
            }
            if (sub.title && existingSub.title !== sub.title) {
              existingSub.title = sub.title;
              modified = true;
            }
          }
        });
      }
    });

    if (modified) {
      window.SpanState.tasks = tasks;
      localStorage.setItem('span_tasks', JSON.stringify(tasks));
      renderTasks();
    }
  } catch (err) {
    console.warn("Span Plan sync error:", err);
  }
}

function exportAllTasksToSpanPlan() {
  const rawPlanTasks = localStorage.getItem('span_plan_tasks');
  if (!rawPlanTasks) return;

  try {
    const planTasks = JSON.parse(rawPlanTasks);
    if (!Array.isArray(planTasks)) return;

    tasks.forEach(task => {
      const foundIdx = planTasks.findIndex(p => String(p.id) === String(task.id) || (task.planId && String(p.id) === String(task.planId)));
      if (foundIdx >= 0) {
        planTasks[foundIdx].completed = !!task.completed;
        planTasks[foundIdx].date = task.scheduledDate || null;
        planTasks[foundIdx].time = task.scheduledTime || '';
        if (task.duration) planTasks[foundIdx].duration = task.duration;
        planTasks[foundIdx].title = task.title;
      }
    });

    localStorage.setItem('span_plan_tasks', JSON.stringify(planTasks));
  } catch (err) {
    console.warn("Export to Span Plan warning:", err);
  }
}

// RENDER TASK LIST: 1. FOCUS DAY • 2. PRIORITÉS • 3. TÂCHES DU JOUR • 4. BACKLOG SANS DATE
function renderTasks() {
  const focusDayList = document.getElementById('focusDayList');
  const groupFocusDay = document.getElementById('groupFocusDay');
  const focusDayCountBadge = document.getElementById('focusDayCountBadge');

  const prioritiesList = document.getElementById('prioritiesList');
  const groupPriorities = document.getElementById('groupPriorities');

  const regularList = document.getElementById('taskList');
  const groupTasks = document.getElementById('groupTasks');

  const backlogList = document.getElementById('backlogList');
  const groupBacklog = document.getElementById('groupBacklog');
  const backlogCountBadge = document.getElementById('backlogCountBadge');

  if (!regularList) return;

  if (focusDayList) focusDayList.innerHTML = '';
  if (prioritiesList) prioritiesList.innerHTML = '';
  regularList.innerHTML = '';
  if (backlogList) backlogList.innerHTML = '';

  const todayRealStr = getLocalDateString();
  const targetDateStr = getSelectedDateStr();

  updateDayNavUI();
  updateCategoryFilterUI();

  // Update Category Filter Badges (All, Work, Home, Fun)
  const allActiveUnfiltered = tasks.filter(t => !t.completed);
  const catCountAll = document.getElementById('catCountAll');
  const catCountWork = document.getElementById('catCountWork');
  const catCountHome = document.getElementById('catCountHome');
  const catCountFun = document.getElementById('catCountFun');
  if (catCountAll) catCountAll.textContent = allActiveUnfiltered.length;
  if (catCountWork) catCountWork.textContent = allActiveUnfiltered.filter(t => (t.category || 'Work') === 'Work').length;
  if (catCountHome) catCountHome.textContent = allActiveUnfiltered.filter(t => t.category === 'Home').length;
  if (catCountFun) catCountFun.textContent = allActiveUnfiltered.filter(t => t.category === 'Fun').length;

  const filterByCondition = (t) => {
    const matchesTag = !activeTagFilter || (t.title && t.title.toLowerCase().includes(`#${activeTagFilter.toLowerCase()}`));
    const cat = t.category || 'Work';
    const matchesCat = (activeCategories.size === 0) || activeCategories.has(cat);
    return matchesTag && matchesCat;
  };

  const isNestedSubtask = (t) => {
    return !t.isEvent && t.parentEventId && tasks.some(parent => String(parent.id) === String(t.parentEventId));
  };

  // Completed items (exclude nested subtasks and scheduled/event timeline items so timeline stays intact)
  const doneToday = tasks.filter(t => t.completed && filterByCondition(t) && !isNestedSubtask(t) && !t.isEvent && !t.scheduledTime);

  // Active items
  const activeTasks = tasks.filter(t => !t.completed && filterByCondition(t));

  const matchesSelectedDay = (t) => {
    if (!t.scheduledDate) return false;
    if (currentDayOffset === 0) {
      // Pour aujourd'hui: la date d'aujourd'hui + les tâches non complétées en retard
      return t.scheduledDate <= targetDateStr;
    } else {
      // Pour demain ou autre jour sélectionné: correspond exactement à la date cible
      return t.scheduledDate === targetDateStr;
    }
  };

  // 1. FOCUS DAY: Événements ou Blocs minutés prévus pour le jour sélectionné
  const focusDayItems = tasks.filter(t => {
    return matchesSelectedDay(t) && (t.isEvent || t.scheduledTime) && !isNestedSubtask(t) && filterByCondition(t);
  });

  // Tri chronologique des blocs du Focus Day (10h, 14h...)
  focusDayItems.sort((a, b) => {
    if (a.scheduledTime && b.scheduledTime) return a.scheduledTime.localeCompare(b.scheduledTime);
    if (a.scheduledTime) return -1;
    if (b.scheduledTime) return 1;
    return 0;
  });

  // 2. PRIORITÉS: Tâches favorites du jour sélectionné
  const priorityItems = activeTasks.filter(t => {
    return matchesSelectedDay(t) && t.isFavorite && !t.isEvent && !t.scheduledTime && !isNestedSubtask(t);
  });

  // 3. TÂCHES FLOTTANTES DU JOUR: Tâches du jour sans heure fixe
  const regularTodayItems = activeTasks.filter(t => {
    return matchesSelectedDay(t) && !t.isEvent && !t.scheduledTime && !t.isFavorite && !isNestedSubtask(t);
  });

  // 4. BACKLOG: Tâches sans date programmée
  const backlogItems = activeTasks.filter(t => {
    return !t.scheduledDate && !isNestedSubtask(t);
  });

  // Counter badge for archives
  const archBadge = document.getElementById('archiveCountBadge');
  if (archBadge) archBadge.textContent = doneToday.length + archivedTasks.length;

  // Counter badge for ALL planned tasks (every task with scheduledDate)
  const allPlannedTasks = tasks.filter(t => !!t.scheduledDate);
  const plannedBadge = document.getElementById('plannedCountBadge');
  if (plannedBadge) plannedBadge.textContent = allPlannedTasks.length;

  // Helper pour rendre un élément (les sous-tâches sont désormais directement intégrées dans le bloc de l'événement)
  function renderItemAndSubtasks(item) {
    return createTaskDOMElement(item, false);
  }

  // Helper pour formater l'heure actuelle (ex: 23:22)
  // Helper to format current time (e.g. 23:22)
  function getNowFormattedTime() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  // Real-time timeline laser marker ("Current time / LIVE")
  function createNowIndicatorElement() {
    const nowLi = document.createElement('li');
    nowLi.className = 'timeline-now-indicator';
    nowLi.id = 'timelineNowIndicator';
    const timeStr = getNowFormattedTime();
    nowLi.innerHTML = `
      <div class="now-indicator-pill" title="Current time: ${timeStr}">
        <span class="now-indicator-pulse">●</span>
        <span class="now-indicator-time">${timeStr}</span>
      </div>
      <div class="now-indicator-line"></div>
    `;
    return nowLi;
  }

  // 1. Render FOCUS DAY / SCHEDULE
  if (groupFocusDay && focusDayList) {
    if (focusDayItems.length > 0) {
      groupFocusDay.style.display = 'block';
      if (focusDayCountBadge) focusDayCountBadge.textContent = focusDayItems.length;

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      // Detect past time slots earlier today
      const isItemPast = (item) => {
        if (currentDayOffset !== 0 || !item.scheduledTime) return false;
        const [h, m] = item.scheduledTime.split(':');
        const startMins = parseInt(h, 10) * 60 + parseInt(m, 10);
        const dur = item.duration || (item.estimate || 1) * 25;
        return (startMins + dur) <= currentMinutes;
      };

      const pastItems = focusDayItems.filter(isItemPast);
      const activeItems = focusDayItems.filter(i => !isItemPast(i));

      // Number of uncompleted tasks from earlier events for Daily Wrap-up
      const uncompletedPastCount = pastItems.reduce((acc, p) => {
        const subs = tasks.filter(t => String(t.parentEventId) === String(p.id) && !t.completed);
        return acc + subs.length + (!p.isEvent && !p.completed ? 1 : 0);
      }, 0);

      // Group past slots in an accordion drawer
      if (pastItems.length > 0 && activeItems.length > 0) {
        const pastToggleLi = document.createElement('li');
        pastToggleLi.className = 'past-focus-toggle-row';
        pastToggleLi.innerHTML = `
          <button type="button" class="btn-toggle-past-slots" onclick="togglePastFocusDay()" title="Show/hide earlier events today">
            <span class="past-toggle-label">⏱️ Earlier today (${pastItems.length} past)</span>
            <span class="past-toggle-icon">${isPastFocusDayExpanded ? '▴ Collapse' : '▾ Expand'}</span>
          </button>
        `;
        focusDayList.appendChild(pastToggleLi);

        if (isPastFocusDayExpanded) {
          pastItems.forEach(item => {
            focusDayList.appendChild(renderItemAndSubtasks(item));
          });
        }

        if (currentDayOffset === 0) {
          focusDayList.appendChild(createNowIndicatorElement());
        }
      } else if (pastItems.length > 0 && activeItems.length === 0) {
        pastItems.forEach(item => {
          focusDayList.appendChild(renderItemAndSubtasks(item));
        });

        if (currentDayOffset === 0) {
          focusDayList.appendChild(createNowIndicatorElement());
        }
      } else if (pastItems.length === 0 && activeItems.length > 0) {
        if (currentDayOffset === 0) {
          focusDayList.appendChild(createNowIndicatorElement());
        }
      }

      // Render LIVE / UPCOMING slots
      activeItems.forEach((item, idx) => {
        focusDayList.appendChild(renderItemAndSubtasks(item));

        // Interstitial free-time gap between scheduled items
        if (idx < activeItems.length - 1) {
          const currentEnd = calculateEndTime(item.scheduledTime, item.duration || (item.estimate || 1) * 25);
          const nextStart = activeItems[idx + 1].scheduledTime;
          if (currentEnd && nextStart) {
            const gapMins = calculateMinutesDiff(currentEnd, nextStart);
            if (gapMins >= 10) {
              const gapDivider = document.createElement('li');
              gapDivider.className = 'free-time-gap-divider';
              const formattedDuration = formatMinutesDuration(gapMins);
              gapDivider.innerHTML = `
                <div class="free-time-line"></div>
                <div class="free-time-pill" title="Free time between ${currentEnd} and ${nextStart}">
                  <span>☕ ${formattedDuration} free</span>
                  <button type="button" class="btn-insert-gap-task" title="Add 30 min task at ${currentEnd}">+ 30m</button>
                </div>
                <div class="free-time-line"></div>
              `;
              const insertBtn = gapDivider.querySelector('.btn-insert-gap-task');
              if (insertBtn) {
                insertBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  insertTaskAtTime(currentEnd, 30);
                });
              }
              setupGapDropTarget(gapDivider, currentEnd);
              focusDayList.appendChild(gapDivider);
            }
          }
        }
      });

      // DAILY WRAP-UP REMINDER
      if (currentDayOffset === 0 && uncompletedPastCount > 0 && (now.getHours() >= 17 || activeItems.length === 0)) {
        const reviewLi = document.createElement('li');
        reviewLi.className = 'daily-review-reminder-card';
        reviewLi.innerHTML = `
          <div class="review-reminder-body">
            <div class="review-reminder-header">
              <span class="review-reminder-icon">🌙</span>
              <span class="review-reminder-title">Daily Wrap-up</span>
              <span class="review-reminder-badge">${uncompletedPastCount} task${uncompletedPastCount > 1 ? 's' : ''} to check</span>
            </div>
            <div class="review-reminder-desc">Check off any completed tasks from earlier events today:</div>
            ${(!isPastFocusDayExpanded && activeItems.length > 0) ? `
              <button type="button" class="btn-review-toggle-past" onclick="togglePastFocusDay()">🔍 Review earlier tasks ▾</button>
            ` : ''}
          </div>
        `;
        focusDayList.appendChild(reviewLi);
      }
    } else {
      groupFocusDay.style.display = 'none';
    }
  }

  // 2. Render PRIORITIES
  if (groupPriorities && prioritiesList) {
    if (priorityItems.length > 0) {
      groupPriorities.style.display = 'block';
      priorityItems.forEach(item => {
        prioritiesList.appendChild(renderItemAndSubtasks(item));
      });
    } else {
      groupPriorities.style.display = 'none';
    }
  }

  // 3. Render TODAY TASKS
  const totalTodayActive = focusDayItems.length + priorityItems.length + regularTodayItems.length;

  // Estimated time for Today
  const todayTimeEl = document.getElementById('todayTimeEstimate');
  if (todayTimeEl) {
    const totalEstMins = (focusDayItems.length + priorityItems.length + regularTodayItems.length) * 25;
    if (totalEstMins > 0) {
      const hours = Math.floor(totalEstMins / 60);
      const mins = totalEstMins % 60;
      const formattedTime = hours > 0 ? `${hours}h${mins > 0 ? (mins < 10 ? '0' + mins : mins) : ''}` : `${mins}m`;
      todayTimeEl.textContent = `⏱ ~${formattedTime} (${totalTodayActive})`;
      todayTimeEl.style.display = 'inline-block';
    } else {
      todayTimeEl.style.display = 'none';
    }
  }

  if (totalTodayActive === 0) {
    if (groupTasks) groupTasks.style.display = 'block';
    if (backlogItems.length > 0) {
      // Warm Kickoff Invitation Card when tasks exist in backlog
      regularList.innerHTML = `
        <div class="today-kickoff-card">
          <div class="kickoff-header">
            <span class="kickoff-sun">☀️</span>
            <div class="kickoff-text">
              <div class="kickoff-title">Plan your day</div>
              <div class="kickoff-sub">You have <strong>${backlogItems.length} task(s)</strong> in your Inbox. Switch to <strong>📥 Inbox</strong> to schedule your priorities!</div>
            </div>
          </div>
        </div>
      `;
    } else {
      // Peaceful Sleeping Otter when all active tasks are zero
      regularList.innerHTML = `
        <div class="empty-state-card">
          <svg class="otter-svg" viewBox="0 0 120 120" width="100" height="100">
            <path d="M 15 90 Q 30 85, 45 90 T 75 90 T 105 90" fill="none" stroke="rgba(129, 140, 248, 0.45)" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M 25 100 Q 40 96, 55 100 T 85 100 T 100 100" fill="none" stroke="rgba(16, 185, 129, 0.35)" stroke-width="2" stroke-linecap="round"/>
            <ellipse cx="60" cy="65" rx="32" ry="18" fill="#a78b71" transform="rotate(-5 60 65)"/>
            <ellipse cx="60" cy="65" rx="20" ry="11" fill="#d4c3b3" transform="rotate(-5 60 65)"/>
            <ellipse cx="28" cy="68" rx="8" ry="6" fill="#8c7058"/>
            <circle cx="54" cy="62" r="4.5" fill="#8c7058"/>
            <circle cx="66" cy="61" r="4.5" fill="#8c7058"/>
            <circle cx="85" cy="55" r="14" fill="#a78b71"/>
            <ellipse cx="89" cy="57" rx="8" ry="6" fill="#d4c3b3"/>
            <ellipse cx="92" cy="54" rx="2.5" ry="2" fill="#3d2c1f"/>
            <path d="M 81 50 Q 84 47, 87 50" fill="none" stroke="#3d2c1f" stroke-width="1.8" stroke-linecap="round"/>
            <circle cx="78" cy="45" r="3.5" fill="#755c47"/>
            <text x="96" y="40" font-size="11" font-weight="bold" fill="#e2b340" opacity="0.9">z</text>
            <text x="105" y="32" font-size="9" font-weight="bold" fill="#e2b340" opacity="0.7">z</text>
          </svg>
          <div class="empty-state-title">All caught up and peaceful... 🦦</div>
          <div class="empty-state-sub">All today's tasks are completed. Enjoy your focus session!</div>
        </div>
      `;
    }
  } else {
    // If there are regular floating tasks, show them
    if (regularTodayItems.length > 0) {
      if (groupTasks) groupTasks.style.display = 'block';
      regularTodayItems.forEach(item => {
        regularList.appendChild(renderItemAndSubtasks(item));
      });
    } else {
      // Hide the empty regular tasks container so there is no orphaned header!
      if (groupTasks) groupTasks.style.display = 'none';
    }
  }

  // 4. Render BACKLOG / INBOX (Unscheduled tasks)
  if (groupBacklog && backlogList) {
    if (backlogItems.length > 0) {
      groupBacklog.style.display = 'block';
      if (backlogCountBadge) backlogCountBadge.textContent = backlogItems.length;
      backlogItems.forEach(item => {
        backlogList.appendChild(createTaskDOMElement(item, false));
      });
    } else {
      groupBacklog.style.display = 'block';
      if (backlogCountBadge) backlogCountBadge.textContent = '0';
      backlogList.innerHTML = `<li style="font-size: 13.5px; color: var(--text-muted); padding: 24px 8px; text-align: center;">Your inbox is empty! 🎉 Use the input above to add tasks.</li>`;
    }
  }

  // Update Main Tab Badges
  const tabBadgeToday = document.getElementById('tabBadgeToday');
  if (tabBadgeToday) tabBadgeToday.textContent = totalTodayActive;
  const tabBadgeInbox = document.getElementById('tabBadgeInbox');
  if (tabBadgeInbox) tabBadgeInbox.textContent = backlogItems.length;

  updateTaskTabsUI();

  doneToday.forEach(task => {
    regularList.appendChild(createTaskDOMElement(task, false));
  });

  setupDragAndDropZones();

  if (newlyAddedTaskId) {
    setTimeout(() => {
      const addedNode = document.getElementById(`task-node-${newlyAddedTaskId}`);
      if (addedNode) {
        addedNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      newlyAddedTaskId = null;
    }, 50);
  }
}

function setupDragAndDropZones() {
  const taskList = document.getElementById('taskList');
  const backlogList = document.getElementById('backlogList');

  [taskList, backlogList].forEach(list => {
    if (!list || list._hasDnD) return;
    list._hasDnD = true;

    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      list.classList.add('drag-over');
    });

    list.addEventListener('dragleave', (e) => {
      if (!list.contains(e.relatedTarget)) {
        list.classList.remove('drag-over');
      }
    });

    list.addEventListener('drop', (e) => {
      e.preventDefault();
      list.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      if (!taskId) return;

      if (list.id === 'taskList') {
        moveTaskToToday(taskId);
      } else if (list.id === 'backlogList') {
        moveTaskToBacklog(taskId);
      }
    });
  });
}

// 1-ROW SINGLE HORIZONTAL COMPACT TASK/EVENT CARD
function createTaskDOMElement(task, isSubtask = false) {
  const wrapper = document.createElement('li');
  wrapper.className = `task-item-wrapper ${isSubtask ? 'event-subtask-wrapper' : ''}`;

  const isJustAdded = task.id === newlyAddedTaskId;
  const isCurrentlyInFocus = activeTask && String(activeTask.id) === String(task.id);
  const durationMinutes = (task.estimate || 1) * 25;
  const todayRealStr = getLocalDateString();
  const todayStr = todayRealStr;
  const targetDateStr = getSelectedDateStr();
  const isOverdue = !task.completed && task.scheduledDate && task.scheduledDate < todayRealStr;

  const childSubtasks = tasks.filter(t => String(t.parentEventId) === String(task.id));
  const doneSubCount = childSubtasks.filter(t => t.completed).length;
  const progressBadge = (childSubtasks.length > 0)
    ? `<span class="event-progress-pill" title="Completed subtasks">${doneSubCount}/${childSubtasks.length}</span>`
    : '';

  const quickPlanBtnTooltip = currentDayOffset === 0 ? "Schedule for today" : (currentDayOffset === 1 ? "Schedule for tomorrow" : "Schedule for this date");
  const taskEndTime = task.scheduledTime ? calculateEndTime(task.scheduledTime, task.duration || durationMinutes) : null;

  let isLiveNow = false;
  let isPastBlock = false;
  if (task.scheduledTime && task.scheduledDate === todayRealStr && !task.completed) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [hStr, mStr] = task.scheduledTime.split(':');
    const startMins = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
    const dur = task.duration || durationMinutes;
    const endMins = startMins + dur;
    isLiveNow = (currentMinutes >= startMins && currentMinutes < endMins);
    isPastBlock = (endMins <= currentMinutes);
  }

  if (task.isEvent) {
    wrapper.innerHTML = `
      <div class="task-item is-event-card ${isJustAdded ? 'just-added' : ''} ${isCurrentlyInFocus ? 'in-focus-active' : ''} ${isLiveNow ? 'is-live-now' : ''} ${isPastBlock ? 'is-past-slot' : ''}" 
           id="task-node-${task.id}" 
           data-cat="${task.category || 'Work'}"
           ondblclick="openEditModalForTask('${task.id}')"
           title="Double-click to edit • Drag to reorder">
        
        <!-- EVENT HEADER: NO CHECKBOX! -->
        <div class="event-card-header">
          <div class="event-header-left">
            ${task.scheduledTime ? `
              <div class="task-time-stacked" title="Scheduled slot: ${task.scheduledTime}${taskEndTime ? ' to ' + taskEndTime : ''}">
                <span class="time-start">${task.scheduledTime}</span>
                ${taskEndTime ? `<span class="time-end">${taskEndTime}</span>` : ''}
              </div>
            ` : ''}
            <span class="event-type-badge">📅</span>
            ${isLiveNow ? '<span class="live-pulse-badge" title="Currently in progress">● LIVE</span>' : ''}
            <span class="event-title-text" title="${(task.title || '').replace(/"/g, '&quot;')}">${renderTitleWithTags(task.title)}</span>
          </div>

          <div class="event-header-right">
            <button class="btn-task-quick-action task-focus-btn ${isCurrentlyInFocus ? 'active' : ''}" type="button" onclick="event.stopPropagation(); toggleTaskFocus('${task.id}')" title="${isCurrentlyInFocus ? 'Unfocus event' : 'Focus this event'}">🎯</button>
            ${(!task.scheduledTime) ? `<span class="task-meta-time">⏱ ${durationMinutes}m</span>` : ''}
            ${(!task.completed && task.isFavorite) ? `<span class="task-meta-star" title="Priority">⭐</span>` : ''}
            
            <div class="task-menu-container">
              <button class="btn-task-menu" type="button" onclick="toggleTaskActionMenu('${task.id}', event)" title="Event actions">⋮</button>
              <div class="task-actions-dropdown" id="menu-dropdown-${task.id}">
                <button class="dropdown-item" type="button" onclick="event.stopPropagation(); openEditModalForTask('${task.id}')">👁️ View details &amp; Edit</button>
                <button class="dropdown-item" type="button" onclick="event.stopPropagation(); toggleTaskFocus('${task.id}')">🎯 ${isCurrentlyInFocus ? 'Unfocus event' : 'Focus this event'}</button>
                <button class="dropdown-item" type="button" onclick="event.stopPropagation(); openQuickSubtaskModal('${task.id}')">➕ Add task to this event</button>
                <button class="dropdown-item" type="button" onclick="event.stopPropagation(); convertToTask('${task.id}')">📝 Convert to simple task</button>
                <button class="dropdown-item" type="button" onclick="event.stopPropagation(); toggleFavorite('${task.id}')">${task.isFavorite ? '☆ Remove priority' : '⭐ Set as priority'}</button>
                <button class="dropdown-item danger" type="button" onclick="event.stopPropagation(); deleteTaskById('${task.id}')">✕ Delete</button>
              </div>
            </div>
          </div>
        </div>

        <!-- INTEGRATED SUBTASKS: Nested directly inside the event card case -->
        ${childSubtasks.length > 0 ? `
          <div class="event-integrated-subtasks">
            ${childSubtasks.map(sub => {
              const isSubInFocus = activeTask && String(activeTask.id) === String(sub.id);
              return `
              <div class="integrated-subtask-row ${sub.completed ? 'completed' : ''} ${isSubInFocus ? 'in-focus-active' : ''}" 
                   id="task-node-${sub.id}" 
                   draggable="true" 
                   ondragstart="event.dataTransfer.setData('text/plain', '${sub.id}'); event.stopPropagation();" 
                   ondblclick="event.stopPropagation(); openEditModalForTask('${sub.id}')" 
                   title="Double-click to edit • Drag to detach">
                <span class="subtask-cat-bar subtask-cat-${(sub.category || 'Work').toLowerCase()}"></span>
                <div class="subtask-checkbox" onclick="event.stopPropagation(); toggleTaskById('${sub.id}')" title="${sub.completed ? 'Mark uncompleted' : 'Mark completed'}">
                  ${sub.completed ? '✓' : ''}
                </div>
                <span class="integrated-subtask-title">${renderTitleWithTags(sub.title)}</span>
                ${sub.isFavorite ? '<span class="task-meta-star" style="font-size:11px; margin-right:2px;" title="Priority">⭐</span>' : ''}
                <button class="btn-subtask-focus ${isSubInFocus ? 'active' : ''}" type="button" onclick="event.stopPropagation(); toggleTaskFocus('${sub.id}')" title="${isSubInFocus ? 'Unfocus subtask' : 'Focus this subtask'}">🎯</button>
                <button class="btn-subtask-detach" type="button" onclick="event.stopPropagation(); detachSubtask('${sub.id}')" title="Detach">✕</button>
              </div>
            `;}).join('')}
          </div>
        ` : ''}

        <!-- DIRECT + ADD TASK TO THIS EVENT BUTTON -->
        <div class="event-add-subtask-action-row">
          <button type="button" class="btn-event-quick-add-subtask" onclick="event.stopPropagation(); openQuickSubtaskModal('${task.id}')">
            <span>+ Add task to this event</span>
          </button>
        </div>

      </div>
    `;
  } else {
    // STANDARD TASK CARD: WITH CHECKBOX
    wrapper.innerHTML = `
      <div class="task-item ${task.completed ? 'completed' : ''} ${isJustAdded ? 'just-added' : ''} ${isCurrentlyInFocus ? 'in-focus-active' : ''} ${isSubtask ? 'is-subtask-item' : ''} ${childSubtasks.length > 0 ? 'has-subtasks' : ''} ${isLiveNow ? 'is-live-now' : ''} ${isPastBlock ? 'is-past-slot' : ''}" 
           id="task-node-${task.id}" 
           data-cat="${task.category || 'Work'}"
           ondblclick="openEditModalForTask('${task.id}')"
           title="Double-click to edit • Drag to reorder">
        
        <div class="parent-task-card-header">
          <!-- LEFT AREA: CHECKBOX + EXPANDED TITLE (INLINE TAGS) -->
          <div class="task-main-left">
            ${isSubtask ? '<span class="subtask-indent-branch" aria-hidden="true">↳</span>' : ''}
            <div class="checkbox" onclick="event.stopPropagation(); toggleTaskById('${task.id}')">
              ${task.completed ? '✓' : ''}
            </div>
            ${task.scheduledTime ? `
              <div class="task-time-stacked" title="Scheduled slot: ${task.scheduledTime}${taskEndTime ? ' to ' + taskEndTime : ''}">
                <span class="time-start">${task.scheduledTime}</span>
                ${taskEndTime ? `<span class="time-end">${taskEndTime}</span>` : ''}
              </div>
            ` : ''}
            ${isLiveNow ? '<span class="live-pulse-badge" title="Currently in progress">● LIVE</span>' : ''}
            ${isOverdue ? '<span class="task-overdue-badge">⚠️ Overdue</span>' : ''}
            <span class="task-title-text" title="${(task.title || '').replace(/"/g, '&quot;')}">${renderTitleWithTags(task.title)}</span>
          </div>

          <!-- RIGHT AREA: DURATION + PRIORITY + FOCUS BADGE + COMPACT MENU ⋮ -->
          <div class="task-right-meta">
            <button class="btn-task-quick-action task-focus-btn ${isCurrentlyInFocus ? 'active' : ''}" type="button" onclick="event.stopPropagation(); toggleTaskFocus('${task.id}')" title="${isCurrentlyInFocus ? 'Unfocus task' : 'Focus this task'}">🎯</button>
            ${!task.completed && (!task.scheduledDate || task.scheduledDate !== targetDateStr)
              ? `<button class="btn-task-quick-action move-today" type="button" onclick="event.stopPropagation(); moveTaskToSelectedDay('${task.id}')" title="${quickPlanBtnTooltip}">⚡</button>`
              : ''}
            ${!task.completed && (task.scheduledDate === targetDateStr && !task.isEvent && !isSubtask)
              ? `<button class="btn-task-quick-action move-backlog" type="button" onclick="event.stopPropagation(); moveTaskToBacklog('${task.id}')" title="Move to Inbox">📦</button>`
              : ''}
            ${(!task.scheduledTime) ? `<span class="task-meta-time">⏱ ${durationMinutes}m</span>` : ''}
            ${(!task.completed && task.isFavorite) ? `<span class="task-meta-star" title="Priority">⭐</span>` : ''}
            
            <div class="task-menu-container">
              <button class="btn-task-menu" type="button" onclick="toggleTaskActionMenu('${task.id}', event)" title="Task actions">⋮</button>
              <div class="task-actions-dropdown" id="menu-dropdown-${task.id}">
                <button class="dropdown-item" type="button" onclick="event.stopPropagation(); openEditModalForTask('${task.id}')">👁️ View details &amp; Edit</button>
                <button class="dropdown-item" type="button" onclick="event.stopPropagation(); toggleTaskFocus('${task.id}')">🎯 ${isCurrentlyInFocus ? 'Unfocus task' : 'Focus this task'}</button>
                <button class="dropdown-item" type="button" onclick="event.stopPropagation(); toggleFavorite('${task.id}')">${task.isFavorite ? '☆ Remove priority' : '⭐ Set as priority'}</button>
                ${(!task.scheduledDate || task.scheduledDate !== targetDateStr)
                  ? `<button class="dropdown-item" type="button" onclick="event.stopPropagation(); moveTaskToSelectedDay('${task.id}')">⚡ Schedule for ${currentDayOffset === 0 ? "today" : "tomorrow"}</button>`
                  : `<button class="dropdown-item" type="button" onclick="event.stopPropagation(); moveTaskToBacklog('${task.id}')">📦 Move to Inbox (no date)</button>`
                }
                <button class="dropdown-item" type="button" onclick="event.stopPropagation(); openQuickSubtaskModal('${task.id}')">➕ Add subtask</button>
                <button class="dropdown-item" type="button" onclick="event.stopPropagation(); convertToEvent('${task.id}')">📅 Convert to Event</button>
                ${isSubtask 
                  ? `<button class="dropdown-item" type="button" onclick="event.stopPropagation(); detachSubtask('${task.id}')">📎 Detach from parent item</button>` 
                  : ''
                }
                <button class="dropdown-item danger" type="button" onclick="event.stopPropagation(); deleteTaskById('${task.id}')">✕ Delete</button>
              </div>
            </div>
          </div>
        </div>

        <!-- INTEGRATED SUBTASKS FOR REGULAR PARENT TASK -->
        ${childSubtasks.length > 0 ? `
          <div class="event-integrated-subtasks">
            ${childSubtasks.map(sub => {
              const isSubInFocus = activeTask && String(activeTask.id) === String(sub.id);
              return `
              <div class="integrated-subtask-row ${sub.completed ? 'completed' : ''} ${isSubInFocus ? 'in-focus-active' : ''}" 
                   id="task-node-${sub.id}"
                   draggable="true"
                   ondragstart="event.dataTransfer.setData('text/plain', '${sub.id}'); event.stopPropagation();"
                   ondblclick="event.stopPropagation(); openEditModalForTask('${sub.id}')"
                   title="Double-click to edit • Drag to detach">
                <span class="subtask-cat-bar subtask-cat-${(sub.category || 'Work').toLowerCase()}"></span>
                <div class="subtask-checkbox" onclick="event.stopPropagation(); toggleTaskById('${sub.id}')" title="${sub.completed ? 'Mark uncompleted' : 'Mark completed'}">
                  ${sub.completed ? '✓' : ''}
                </div>
                <span class="integrated-subtask-title">${renderTitleWithTags(sub.title)}</span>
                ${sub.isFavorite ? '<span class="task-meta-star" style="font-size:11px; margin-right:2px;" title="Priority">⭐</span>' : ''}
                <button class="btn-subtask-focus ${isSubInFocus ? 'active' : ''}" type="button" onclick="event.stopPropagation(); toggleTaskFocus('${sub.id}')" title="${isSubInFocus ? 'Unfocus subtask' : 'Focus this subtask'}">🎯</button>
                <button class="btn-subtask-detach" type="button" onclick="event.stopPropagation(); detachSubtask('${sub.id}')" title="Detach">✕</button>
              </div>
            `;}).join('')}
          </div>
        ` : ''}

      </div>
    `;
  }

  // Drag and drop for tactile task organizing
  wrapper.setAttribute('draggable', 'true');
  wrapper.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(task.id));
    e.dataTransfer.effectAllowed = 'copyMove';
    wrapper.classList.add('is-dragging');
  });
  wrapper.addEventListener('dragend', () => {
    wrapper.classList.remove('is-dragging');
  });

  const itemNode = wrapper.querySelector('.task-item');

  // Allow dropping child tasks directly onto Event or Parent cards to nest them
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    itemNode.classList.add('event-drop-highlight');
  };

  const handleDragLeave = (e) => {
    if (!wrapper.contains(e.relatedTarget)) {
      itemNode.classList.remove('event-drop-highlight');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    itemNode.classList.remove('event-drop-highlight');
    const draggedTaskId = e.dataTransfer.getData('text/plain');
    if (!draggedTaskId || String(draggedTaskId) === String(task.id)) return;
    attachTaskToEvent(draggedTaskId, task.id);
  };

  wrapper.addEventListener('dragover', handleDragOver);
  wrapper.addEventListener('dragleave', handleDragLeave);
  wrapper.addEventListener('drop', handleDrop);

  itemNode.addEventListener('dragover', handleDragOver);
  itemNode.addEventListener('drop', handleDrop);

  // Swipe right gesture to trigger focus directly
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
  const targetSelect = document.getElementById('taskTarget');
  const text = input ? input.value.trim() : '';
  const category = catSelect ? catSelect.value : 'Work';
  const target = targetSelect ? targetSelect.value : 'inbox';

  if (!text) return;

  const isToday = (target === 'today');
  const scheduledDate = isToday ? getLocalDateString() : null;

  const newTask = {
    id: 't_' + Date.now(),
    title: text,
    category: category,
    estimate: 1,
    completed: false,
    isFavorite: false,
    isEvent: false,
    parentEventId: null,
    scheduledDate: scheduledDate,
    scheduledTime: null
  };

  newlyAddedTaskId = newTask.id;
  tasks.unshift(newTask);
  if (input) input.value = '';

  saveTasks();

  if (typeof showToast === 'function') {
    if (isToday) {
      showToast("Task added to Today! ⚡", "⚡");
    } else {
      showToast("Task saved to Inbox! 📥", "📥");
    }
  }
}

function moveTaskToToday(id) {
  const t = tasks.find(x => String(x.id) === String(id));
  if (!t) return;
  pushUndoState('Move to Today');
  const todayStr = getLocalDateString();
  t.scheduledDate = todayStr;
  saveTasks();
  if (typeof showToast === 'function') showToast("Scheduled for today!", '⚡');
}

function moveTaskToBacklog(id) {
  const t = tasks.find(x => String(x.id) === String(id));
  if (!t) return;
  pushUndoState('Move to Inbox');
  t.scheduledDate = null;
  t.scheduledTime = null;
  saveTasks();
  if (typeof showToast === 'function') showToast("Moved to Inbox!", '📦');
}

function toggleTaskById(id) {
  const t = tasks.find(x => String(x.id) === String(id));
  if (!t) return;

  pushUndoState(t.completed ? 'Uncheck Task' : 'Complete Task');
  t.completed = !t.completed;
  if (t.completed) {
    triggerHapticFeedback();
    const now = new Date();
    t.completedAt = now.toISOString();
    t.completedDate = getLocalDateString(now);
    t.isFavorite = false;

    if (typeof triggerCelebration === 'function') triggerCelebration();
    if (typeof showToast === 'function') showToast('Task completed!', '✅');
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
  const targetId = String(id);
  pushUndoState('Delete Task');
  if (activeTask && String(activeTask.id) === targetId) dismissSpotlightTask();

  tasks.forEach(t => {
    if (String(t.parentEventId) === targetId) {
      t.parentEventId = null;
    }
  });

  tasks = tasks.filter(t => String(t.id) !== targetId && String(t.planId) !== targetId);

  try {
    const rawPlan = localStorage.getItem('span_plan_tasks');
    if (rawPlan) {
      const planList = JSON.parse(rawPlan);
      if (Array.isArray(planList)) {
        const updatedPlan = planList.filter(p => String(p.id) !== targetId && String(p.planId) !== targetId);
        localStorage.setItem('span_plan_tasks', JSON.stringify(updatedPlan));
      }
    }
  } catch (e) {
    console.warn('Pruning plan tasks error:', e);
  }

  try {
    const deletedSet = new Set(JSON.parse(localStorage.getItem('span_deleted_task_ids') || '[]'));
    deletedSet.add(targetId);
    localStorage.setItem('span_deleted_task_ids', JSON.stringify(Array.from(deletedSet)));

    let dismissed = JSON.parse(localStorage.getItem('span_plan_dismissed_focus_ids')) || [];
    if (!dismissed.includes(targetId)) {
      dismissed.push(targetId);
      localStorage.setItem('span_plan_dismissed_focus_ids', JSON.stringify(dismissed));
    }
  } catch (e) {}

  saveTasks();
  if (typeof showToast === 'function') showToast('Task deleted', '🗑️');
}

function toggleFavorite(id) {
  const t = tasks.find(x => String(x.id) === String(id));
  if (!t) return;

  const maxAllowed = getMaxFavoritesAllowed();
  const currentFavs = tasks.filter(x => x.isFavorite && !x.completed && String(x.id) !== String(id));

  if (!t.isFavorite && currentFavs.length >= maxAllowed) {
    if (typeof showToast === 'function') {
      showToast(`Maximum ${maxAllowed} priority tasks allowed.`, '⭐');
    } else {
      alert(`Maximum ${maxAllowed} priority tasks allowed.`);
    }
    return;
  }

  pushUndoState('Toggle Priority');
  t.isFavorite = !t.isFavorite;
  saveTasks();
}

function togglePastFocusDay() {
  isPastFocusDayExpanded = !isPastFocusDayExpanded;
  renderTasks();
}

function toggleTaskFocus(id) {
  if (activeTask && String(activeTask.id) === String(id)) {
    dismissSpotlightTask();
    if (typeof showToast === 'function') showToast('Focus removed from timer', '🎯');
  } else {
    setSpotlightTaskById(id);
    const t = tasks.find(x => String(x.id) === String(id));
    if (typeof showToast === 'function') showToast(`🎯 Focus: ${t ? t.title : 'Task'}`, '🎯');
  }
}

function setSpotlightTaskById(id) {
  const target = tasks.find(t => String(t.id) === String(id));
  if (!target) return;

  activeTask = target;
  window.SpanState.activeTask = activeTask;

  const targetDateStr = getSelectedDateStr();
  const isBacklogTask = !target.scheduledDate || target.scheduledDate !== targetDateStr;
  switchTaskTab(isBacklogTask ? 'inbox' : 'today');

  saveTasks();
  if (typeof switchView === 'function' && window.innerWidth < 650) {
    switchView('focus', document.getElementById('nav-btn-focus'));
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
    found.completedDate = getLocalDateString();
    found.isFavorite = false;
    if (typeof triggerCelebration === 'function') triggerCelebration();
    if (typeof showToast === 'function') showToast('Focus task completed!', '🎯');
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
        <div class="task-main-left">
          <span class="task-title-text">${t.title}</span>
        </div>
        <div class="task-right-meta">
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
        <div class="task-main-left">
          <span class="task-title-text">${t.title}</span>
        </div>
        <div class="task-right-meta">
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

// RENDER ALL PLANNED TASKS (COMPREHENSIVE VIEW)
function renderPlannedTasks() {
  const list = document.getElementById('plannedTasksList');
  if (!list) return;

  const todayStr = getLocalDateString();
  
  // Includes all tasks that have a scheduled date, sorted chronologically
  const planned = tasks
    .filter(t => !!t.scheduledDate)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  if (planned.length === 0) {
    list.innerHTML = `<li style="font-size: 13px; color: var(--text-muted); padding: 14px 4px; text-align: center;">No scheduled tasks found.</li>`;
    return;
  }

  list.innerHTML = '';
  planned.forEach(t => {
    const isToday = (t.scheduledDate === todayStr);
    const isPast = (t.scheduledDate < todayStr);
    const dateLabel = isToday ? 'Today' : t.scheduledDate;

    const li = document.createElement('li');
    li.className = `task-item ${t.completed ? 'completed' : ''}`;
    li.dataset.cat = t.category || 'Work';

    li.innerHTML = `
      <div class="task-main-left" onclick="openEditModalForTask('${t.id}')">
        <div class="checkbox" onclick="event.stopPropagation(); toggleTaskById('${t.id}')">
          ${t.completed ? '✓' : ''}
        </div>
        <span class="task-title-text">${renderTitleWithTags(t.title)}</span>
      </div>
      <div class="task-right-meta">
        <span class="task-time-pill" style="${isToday ? 'color: var(--cat-home); font-weight: 600;' : (isPast ? 'color: var(--danger);' : '')}">
          📅 ${dateLabel}
        </span>
        ${!isToday ? `<button class="btn-task-menu" type="button" onclick="event.stopPropagation(); moveTaskToToday('${t.id}')" title="Move to Today">☀️</button>` : ''}
      </div>
    `;
    list.appendChild(li);
  });
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

let quickSubtaskTargetEventId = null;

function openQuickSubtaskModal(eventId) {
  quickSubtaskTargetEventId = String(eventId);
  const parent = tasks.find(t => String(t.id) === quickSubtaskTargetEventId);
  const eventName = parent ? parent.title : 'Event';

  const modal = document.getElementById('quickSubtaskModalOverlay');
  const label = document.getElementById('quickSubtaskParentLabel');
  const input = document.getElementById('quickSubtaskInput');
  const title = document.getElementById('quickSubtaskModalTitle');

  if (title) {
    title.textContent = parent && parent.isEvent ? '➕ Add Task to Event' : '➕ Add Subtask';
  }
  if (label) {
    label.textContent = `${parent && parent.isEvent ? 'Event' : 'Parent'}: "${eventName}"`;
  }
  if (input) {
    input.value = '';
  }
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
  const newTask = {
    id: 't_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    title: val,
    category: parent ? parent.category : 'Work',
    estimate: 1,
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
    showToast(`Task added under "${parent ? parent.title : 'event'}"`, '📎');
  }
}
window.submitQuickSubtaskModal = submitQuickSubtaskModal;

function quickAddSubtaskPrompt(eventId) {
  openQuickSubtaskModal(eventId);
}
window.quickAddSubtaskPrompt = quickAddSubtaskPrompt;

function convertToEvent(id) {
  const t = tasks.find(x => String(x.id) === String(id));
  if (!t) return;
  pushUndoState('Convert to Event');
  t.isEvent = true;
  t.completed = false;
  t.parentEventId = null;
  delete t.completedAt;
  delete t.completedDate;
  saveTasks();
  if (typeof showToast === 'function') showToast('Converted to Event!', '📅');
}

function convertToTask(id) {
  const t = tasks.find(x => String(x.id) === String(id));
  if (!t) return;
  pushUndoState('Convert to Task');
  t.isEvent = false;
  saveTasks();
  if (typeof showToast === 'function') showToast('Converted to Task!', '📝');
}

function openEditModalForTask(id) {
  const task = tasks.find(t => String(t.id) === String(id));
  if (!task) return;

  editingTaskId = id;
  editingCategory = task.category || 'Work';
  editingEstimate = task.estimate || 1;
  editingIsFavorite = !!task.isFavorite;

  // Populate parent event options
  const parentSelect = document.getElementById('editParentEvent');
  if (parentSelect) {
    parentSelect.innerHTML = '<option value="">(Independent Task)</option>';
    const availableEvents = tasks.filter(t => t.isEvent && !t.completed && String(t.id) !== String(id));
    availableEvents.forEach(ev => {
      const opt = document.createElement('option');
      opt.value = ev.id;
      opt.textContent = `📅 ${ev.title}`;
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
  if (minEl) minEl.textContent = editingEstimate * 25;

  const dateInput = document.getElementById('editScheduledDate');
  if (dateInput) dateInput.value = task.scheduledDate || '';

  const timeInput = document.getElementById('editScheduledTime');
  if (timeInput) timeInput.value = task.scheduledTime || '';

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
    task.isFavorite = editingIsFavorite;
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
document.addEventListener('keydown', (e) => {
  const editModal = document.getElementById('editModalOverlay');
  const settingsModal = document.getElementById('settingsModalOverlay');
  const trackModal = document.getElementById('trackModalOverlay');
  const quickSubModal = document.getElementById('quickSubtaskModalOverlay');

  const isEditOpen = editModal && editModal.style.display === 'flex';
  const isSettingsOpen = settingsModal && settingsModal.style.display === 'flex';
  const isTrackOpen = trackModal && trackModal.style.display === 'flex';
  const isQuickSubOpen = quickSubModal && quickSubModal.style.display === 'flex';

  // CMD+Z (Mac) or CTRL+Z (Windows) -> Undo last action (delete, move, complete, priority)
  const isUndo = (e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey;
  if (isUndo) {
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (activeTag !== 'input' && activeTag !== 'textarea') {
      e.preventDefault();
      undoLastAction();
      return;
    }
  }

  // ESCAPE -> Close any open modal
  if (e.key === 'Escape') {
    if (isQuickSubOpen) { closeQuickSubtaskModal(); e.preventDefault(); return; }
    if (isEditOpen) { closeEditModal(); e.preventDefault(); return; }
    if (isSettingsOpen) { closeSettingsModal(); e.preventDefault(); return; }
    if (isTrackOpen) { toggleTrackModal(); e.preventDefault(); return; }
  }

  // ENTER in Edit Modal -> Save changes
  if (isEditOpen && e.key === 'Enter') {
    e.preventDefault();
    saveTaskModal();
    return;
  }

  // Ignore global hotkeys when typing in input, select or textarea
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
    return;
  }

  // SPACEBAR -> Start / Pause Timer
  if (e.code === 'Space') {
    e.preventDefault();
    if (typeof toggleTimer === 'function') toggleTimer();
  }

  // N -> Jump to quick task capture
  if (e.key === 'n' || e.key === 'N') {
    const taskInput = document.getElementById('taskInput');
    if (taskInput) {
      e.preventDefault();
      taskInput.focus();
    }
  }
});

autoArchivePastDays();
checkScheduledTasksForToday();
loadSampleTasksIfEmpty(false);
initTaskTargetDefault();
updateTaskTabsUI();
if (typeof syncWithSpanPlan === 'function') syncWithSpanPlan();

window.addEventListener('focus', () => {
  if (typeof syncWithSpanPlan === 'function') syncWithSpanPlan();
});

// Auto-refresh tasks every 60s so that "● LIVE" badge and current-time indicators update smoothly
setInterval(() => {
  const modal = document.getElementById('taskDetailModal');
  const isModalOpen = modal && modal.classList.contains('active');
  const isDragging = document.querySelector('.dragging') !== null;
  if (!isModalOpen && !isDragging && typeof renderTasks === 'function') {
    renderTasks();
  }
}, 60000);

// Keep the live Now indicator line time text updated in real time
setInterval(() => {
  const timeEl = document.querySelector('.now-indicator-time');
  if (timeEl) {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const formatted = `${h}:${m}`;
    if (timeEl.textContent !== formatted) {
      timeEl.textContent = formatted;
    }
  }
}, 5000);


