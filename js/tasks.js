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

// Auto-migrate legacy 25m blocks to 30m standard (25m focus + 5m break)
if (Array.isArray(tasks)) {
  let hasMigrated = false;
  tasks.forEach(t => {
    if (t.duration === 25) {
      t.duration = 30;
      hasMigrated = true;
    }
    if (!t.duration && t.estimate) {
      t.duration = t.estimate * 30;
      hasMigrated = true;
    }
  });
  if (hasMigrated) {
    try {
      localStorage.setItem('span_tasks', JSON.stringify(tasks));
    } catch (e) {}
  }
}

let selectedTaskIndex = 0;
let editingTaskId = null;
let editingCategory = 'Work';
let editingEstimate = 1;
let editingIsFavorite = false;
let editingActionType = 'auto';
let isPastOpen = false;
let isPastFocusDayExpanded = false;
let newlyAddedTaskId = null;
let activeTagFilter = null;
let activeInboxActionFilter = 'all';

// Helper de détection intelligente du type d'action (Calls / Mails / Paiements)
function getTaskActionType(task) {
  if (!task) return 'other';
  if (task.actionType && task.actionType !== 'auto') return task.actionType;
  const title = (task.title || '').trim().toLowerCase();
  
  // 1. Tags explicites
  if (/#(call|calls|appel|appels|phone)\b/i.test(title)) return 'call';
  if (/#(mail|mails|email|emails|courriel)\b/i.test(title)) return 'mail';
  if (/#(pay|paiement|paiements|facture|factures|virement|virements)\b/i.test(title)) return 'pay';

  // 2. Mots-clés naturels
  if (/\b(call|calls|appel|appels|appeler|téléphone|téléphoner|coup de fil|rdv|rendez-vous)\b/i.test(title)) {
    return 'call';
  }
  if (/\b(mail|mails|email|emails|e-mail|courriel|newsletter|écrire à|envoyer mail)\b/i.test(title)) {
    return 'mail';
  }
  if (/\b(payer|paiement|paiements|pay|virement|facture|factures|mutuelle|solidaris|poubelle|poubelles|banque|bank)\b/i.test(title)) {
    return 'pay';
  }
  return 'other';
}

function selectEditActionType(type) {
  editingActionType = type || 'auto';
  document.querySelectorAll('#modalFocusActionPills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.action === editingActionType);
  });
}
window.selectEditActionType = selectEditActionType;

function cycleFocusSubtaskAction(taskId) {
  const task = tasks.find(t => String(t.id) === String(taskId));
  if (!task) return;
  const current = task.actionType || 'auto';
  const order = ['auto', 'call', 'mail', 'pay', 'other'];
  const nextIdx = (order.indexOf(current) + 1) % order.length;
  const nextType = order[nextIdx];
  task.actionType = (nextType === 'auto') ? null : nextType;
  saveTasks();
  renderTasks();
  if (typeof showToast === 'function') {
    const labels = {
      auto: '⚡ Action: Détection auto',
      call: '📞 Action: Call',
      mail: '✉️ Action: Mail',
      pay: '💳 Action: Paiement',
      other: '📦 Action: Standard'
    };
    showToast(labels[nextType] || 'Action modifiée', '💾');
  }
}
window.cycleFocusSubtaskAction = cycleFocusSubtaskAction;

function setInboxActionFilter(filter) {
  activeInboxActionFilter = filter;
  document.querySelectorAll('.inbox-filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderTasks();
}
window.setInboxActionFilter = setInboxActionFilter;
window.getTaskActionType = getTaskActionType;

// Créer en un clic un bloc Focus pour le lot d'actions sélectionné (ex: lot de 3 appels)
function scheduleActionBatch(type) {
  const allBacklog = (tasks || []).filter(t => !t.completed && !t.isEvent && !t.parentEventId && !t.scheduledDate);
  const matching = allBacklog.filter(t => getTaskActionType(t) === type);
  if (matching.length === 0) return;

  const typeConfig = {
    call: { title: '📞 Session Appels', cat: 'Work' },
    mail: { title: '✉️ Session Mails', cat: 'Work' },
    pay: { title: '💳 Session Paiements & Admin', cat: 'Home' },
    other: { title: '📦 Session Backlog', cat: 'Work' }
  };
  const cfg = typeConfig[type] || { title: 'Session Focus', cat: 'Work' };
  const duration = Math.max(30, Math.min(120, Math.ceil((matching.length * 15) / 30) * 30));
  const todayStr = getLocalDateString();

  const newEventId = 'ev_' + Date.now();
  const newEvent = {
    id: newEventId,
    title: cfg.title,
    category: cfg.cat,
    duration: duration,
    estimate: Math.max(1, Math.round(duration / 30)),
    completed: false,
    isFavorite: false,
    isEvent: true,
    parentEventId: null,
    scheduledDate: todayStr,
    scheduledTime: null
  };

  tasks.unshift(newEvent);

  matching.forEach(item => {
    item.parentEventId = newEventId;
    item.scheduledDate = todayStr;
    item.scheduledTime = null;
  });

  saveTasks();
  if (typeof showToast === 'function') {
    showToast(`Bloc "${cfg.title}" créé avec ${matching.length} tâche(s) pour aujourd'hui !`, 'success');
  }
  switchTaskTab('today');
}
window.scheduleActionBatch = scheduleActionBatch;

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

  // 1. Archiver les tâches complétées des jours passés
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

  // 2. Balayage automatique vers le Backlog (Inbox) :
  // A. Tâches seules non terminées de la veille -> Remises dans le Backlog (sans date)
  // B. Sous-tâches non faites restées dans des blocs du passé -> Détachées et remises dans le Backlog
  stillActive.forEach(t => {
    if (t.completed) return;

    // A. Tâche seule du passé non réalisée -> Backlog (Inbox)
    if (!t.isEvent && !t.parentEventId && t.scheduledDate && t.scheduledDate < todayStr) {
      t.scheduledDate = null;
      t.scheduledTime = null;
      t.isFavorite = false;
      changed = true;
    }

    // B. Sous-tâche non terminée d'un bloc/événement passé -> Extraite vers le Backlog (Inbox)
    if (t.parentEventId) {
      const parent = stillActive.find(p => p && (
        String(p.id) === String(t.parentEventId) || 
        (p.planId && String(p.planId) === String(t.parentEventId)) || 
        (p.focusId && String(p.focusId) === String(t.parentEventId))
      ));
      const parentDate = parent ? parent.scheduledDate : t.scheduledDate;
      if (parentDate && parentDate < todayStr) {
        t.parentEventId = null;
        t.scheduledDate = null;
        t.scheduledTime = null;
        changed = true;
      }
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

    // Auto-flip menu up if near bottom of viewport
    const rect = targetMenu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 20) {
      targetMenu.style.top = 'auto';
      targetMenu.style.bottom = 'calc(100% + 4px)';
    } else {
      targetMenu.style.top = 'calc(100% + 4px)';
      targetMenu.style.bottom = 'auto';
    }
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

function calculateEndTime(startTimeStr, durationMinutes = 30) {
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
    estimate: Math.max(1, Math.round(defaultDuration / 30)),
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

  pushUndoState('Attach to Item');
  child.parentEventId = String(parent.id);
  child.scheduledDate = parent.scheduledDate;
  child.isEvent = false;

  saveTasks();
  if (typeof showToast === 'function') showToast(`Attached under "${parent.title}"!`, '📎');
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
      duration: 30,
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
      duration: 60,
      completed: false,
      isFavorite: false,
      isEvent: true,
      parentEventId: null,
      scheduledDate: d,
      scheduledTime: "14:00" // 14:00 - 15:00
    },
    // GAP 3: 15:00 - 16:30 (1h30 free!)
    {
      id: 'ev_admin',
      title: "Invoices, Taxes & Insurance #home",
      category: "Home",
      estimate: 2,
      duration: 60,
      completed: false,
      isFavorite: false,
      isEvent: true,
      parentEventId: null,
      scheduledDate: d,
      scheduledTime: "16:30" // 16:30 - 17:30
    },

    // 2. Floating tasks today (no fixed hour)
    {
      id: 't_today_1',
      title: "Review PR on GitHub #work",
      category: "Work",
      estimate: 1,
      duration: 30,
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
      duration: 30,
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
      duration: 30,
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
      duration: 30,
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
      duration: 30,
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
      duration: 30,
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
    let dismissedIds = [];
    try {
      dismissedIds = JSON.parse(localStorage.getItem('span_plan_dismissed_focus_ids')) || [];
    } catch (e) {}
    dismissedIds.forEach(id => deletedSet.add(String(id)));

    // Purger les tâches existantes supprimées
    const prevCount = tasks.length;
    tasks = tasks.filter(t => {
      if (!t || !t.id) return false;
      const tid = String(t.id);
      if (deletedSet.has(tid)) return false;
      if (t.planId && deletedSet.has(String(t.planId))) return false;
      if (t.parentEventId && deletedSet.has(String(t.parentEventId))) return false;
      if (t.title && deletedSet.has('title:' + t.title.trim().toLowerCase())) return false;
      return true;
    });
    if (tasks.length !== prevCount) modified = true;

    planTasks.forEach(pTask => {
      if (!pTask || !pTask.id) return;
      if (deletedSet.has(String(pTask.id))) return;
      const existing = tasks.find(t => 
        (t.id && String(t.id) === String(pTask.id)) || 
        (t.planId && String(t.planId) === String(pTask.id)) || 
        (pTask.focusId && t.id && String(t.id) === String(pTask.focusId))
      );
      const isEv = pTask.type === 'event' || !!pTask.isEvent;
      
      if (!existing) {
        tasks.push({
          id: pTask.focusId || pTask.id,
          planId: pTask.id,
          title: pTask.title || 'Untitled',
          category: catMap[pTask.context] || 'Work',
          estimate: Math.max(1, Math.round((pTask.duration || 30) / 30)),
          duration: pTask.duration || 30,
          completed: !isEv && !!pTask.completed,
          isFavorite: false,
          isEvent: isEv,
          parentEventId: pTask.parentEventId || null,
          scheduledDate: pTask.date || null,
          scheduledTime: pTask.time || null
        });
        modified = true;
      } else {
        if (!existing.planId) existing.planId = pTask.id;
        if (pTask.focusId && !existing.focusId) existing.focusId = pTask.focusId;
        if (pTask.context && catMap[pTask.context]) {
          const targetCat = catMap[pTask.context];
          if (existing.category !== targetCat) {
            existing.category = targetCat;
            modified = true;
          }
        }
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
          existing.estimate = Math.max(1, Math.round(pTask.duration / 30));
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

      // Sync nested subtasks STRICTEMENT par ID
      const parentFocusId = existing ? existing.id : (pTask.focusId || pTask.id);
      const planSubIds = new Set((pTask.subtasks || []).map(s => String(s.id)));

      // Nettoyer dans Focus les anciennes sous-tâches orphelines de cet événement
      const prevTaskLen = tasks.length;
      tasks = tasks.filter(t => {
        if (!t || !t.parentEventId) return true;
        const isChildOfThisEvent = String(t.parentEventId) === String(parentFocusId) || 
                                   String(t.parentEventId) === String(pTask.id) ||
                                   (existing && existing.planId && String(t.parentEventId) === String(existing.planId));
        if (isChildOfThisEvent) {
          return planSubIds.has(String(t.id));
        }
        return true;
      });
      if (tasks.length !== prevTaskLen) modified = true;

      if (Array.isArray(pTask.subtasks) && pTask.subtasks.length > 0) {
        pTask.subtasks.forEach(sub => {
          if (!sub || !sub.id || deletedSet.has(String(sub.id))) return;

          let subCat = 'Work';
          if (sub.context && catMap[sub.context]) subCat = catMap[sub.context];
          else if (sub.category && catMap[String(sub.category).toLowerCase()]) subCat = catMap[String(sub.category).toLowerCase()];
          else if (sub.category) subCat = sub.category;
          else if (/#(life|perso|home)\b/i.test(sub.title || '')) subCat = 'Home';
          else if (/#(fun|sport)\b/i.test(sub.title || '')) subCat = 'Fun';
          else if (pTask.context && catMap[pTask.context]) subCat = catMap[pTask.context];

          const existingSub = tasks.find(t => String(t.id) === String(sub.id));
          if (!existingSub) {
            tasks.push({
              id: sub.id,
              title: sub.title || 'Subtask',
              category: subCat,
              estimate: 1,
              duration: 30,
              completed: !!sub.completed,
              isFavorite: false,
              isEvent: false,
              parentEventId: String(parentFocusId),
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
            if (String(existingSub.parentEventId) !== String(parentFocusId)) {
              existingSub.parentEventId = String(parentFocusId);
              modified = true;
            }
            if (subCat && existingSub.category !== subCat) {
              existingSub.category = subCat;
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
  let planTasks = [];
  try {
    const rawPlanTasks = localStorage.getItem('span_plan_tasks');
    if (rawPlanTasks) planTasks = JSON.parse(rawPlanTasks);
  } catch (e) {
    planTasks = [];
  }
  if (!Array.isArray(planTasks)) planTasks = [];

  try {
    const catReverseMap = { 'Work': 'work', 'Home': 'life', 'Fun': 'fun' };
    const deletedSet = new Set(JSON.parse(localStorage.getItem('span_deleted_task_ids') || '[]'));
    let dismissedIds = [];
    try {
      dismissedIds = JSON.parse(localStorage.getItem('span_plan_dismissed_focus_ids')) || [];
    } catch (e) {}
    dismissedIds.forEach(id => deletedSet.add(String(id)));

    const isDeleted = (t) => {
      if (!t || !t.id) return true;
      const idStr = String(t.id);
      if (deletedSet.has(idStr)) return true;
      if (t.planId && deletedSet.has(String(t.planId))) return true;
      if (t.focusId && deletedSet.has(String(t.focusId))) return true;
      if (t.parentEventId && deletedSet.has(String(t.parentEventId))) return true;
      return false;
    };

    // Filter planTasks against deleted
    planTasks = planTasks.filter(p => !isDeleted(p));

    const childSubtasks = tasks.filter(t => t && !!t.parentEventId && !isDeleted(t));
    const rootTasks = tasks.filter(t => t && !t.parentEventId && !isDeleted(t));

    rootTasks.forEach(task => {
      const mySubtasks = childSubtasks.filter(c => 
        String(c.parentEventId) === String(task.id) || 
        (task.planId && String(c.parentEventId) === String(task.planId))
      );
      const formattedSubtasks = mySubtasks.map(c => {
        let subCtx = catReverseMap[c.category] || 'work';
        if (/#(life|perso|home)\b/i.test(c.title)) subCtx = 'life';
        else if (/#(fun|sport)\b/i.test(c.title)) subCtx = 'fun';
        else if (/#(work|code|pro)\b/i.test(c.title)) subCtx = 'work';
        return {
          id: c.id,
          title: c.title,
          context: subCtx,
          completed: !!c.completed,
          parentEventId: task.planId || task.id,
          actionType: c.actionType || null
        };
      });

      const foundIdx = planTasks.findIndex(p => 
        String(p.id) === String(task.id) || 
        (task.planId && String(p.id) === String(task.planId)) ||
        (p.focusId && String(p.focusId) === String(task.id))
      );

      if (foundIdx >= 0) {
        planTasks[foundIdx].completed = !task.isEvent && !!task.completed;
        planTasks[foundIdx].date = task.scheduledDate || null;
        planTasks[foundIdx].time = task.scheduledTime || '';
        planTasks[foundIdx].actionType = task.actionType || null;
        if (task.duration) planTasks[foundIdx].duration = task.duration;
        if (task.category && catReverseMap[task.category]) {
          planTasks[foundIdx].context = catReverseMap[task.category];
        }
        planTasks[foundIdx].title = task.title;
        planTasks[foundIdx].focusId = task.id;
        task.planId = planTasks[foundIdx].id;
        if (task.isEvent) planTasks[foundIdx].type = 'event';

        // Merge subtasks STRICTEMENT par ID
        const existingSubs = Array.isArray(planTasks[foundIdx].subtasks) ? planTasks[foundIdx].subtasks : [];
        const mergedSubs = formattedSubtasks.map(fs => {
          const es = existingSubs.find(e => String(e.id) === String(fs.id));
          if (es) {
            return {
              ...es,
              title: fs.title,
              actionType: fs.actionType !== undefined ? fs.actionType : es.actionType,
              completed: (typeof fs.completed === 'boolean') ? fs.completed : es.completed
            };
          }
          return fs;
        });
        existingSubs.forEach(es => {
          const isDetachedOrMovedInFocus = tasks.some(ft => ft && String(ft.id) === String(es.id) && String(ft.parentEventId) !== String(task.id) && String(ft.parentEventId) !== String(task.planId));
          if (!deletedSet.has(String(es.id)) && !isDetachedOrMovedInFocus && !mergedSubs.some(m => String(m.id) === String(es.id))) {
            mergedSubs.push(es);
          }
        });
        planTasks[foundIdx].subtasks = mergedSubs;
      } else {
        const pId = task.planId || ('p_' + task.id);
        task.planId = pId;
        let subCtx = catReverseMap[task.category] || 'work';
        if (/#(life|perso|home)\b/i.test(task.title)) subCtx = 'life';
        else if (/#(fun|sport)\b/i.test(task.title)) subCtx = 'fun';
        else if (/#(work|code|pro)\b/i.test(task.title)) subCtx = 'work';

        planTasks.push({
          id: pId,
          focusId: task.id,
          title: task.title,
          type: task.isEvent ? 'event' : 'task',
          actionType: task.actionType || null,
          date: task.scheduledDate || null,
          time: task.scheduledTime || '',
          duration: task.duration || (task.estimate ? task.estimate * 30 : 30),
          context: subCtx,
          completed: !task.isEvent && !!task.completed,
          isRollover: false,
          fromFocus: true,
          subtasks: formattedSubtasks
        });
      }
    });

    localStorage.setItem('span_plan_tasks', JSON.stringify(planTasks));
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bridge = new BroadcastChannel('span_suite_bridge');
        bridge.postMessage({ type: 'FOCUS_UPDATED', timestamp: Date.now() });
      } catch (e) {}
    }
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
    return !t.isEvent && t.parentEventId && tasks.some(parent => 
      String(parent.id) === String(t.parentEventId) ||
      (parent.planId && String(parent.planId) === String(t.parentEventId)) ||
      (parent.focusId && String(parent.focusId) === String(t.parentEventId))
    );
  };

  // Completed items (exclude nested subtasks and scheduled/event timeline items so timeline stays intact)
  // For the selected day, only show tasks completed for that day
  const doneToday = tasks.filter(t => {
    if (!t.completed || !filterByCondition(t) || isNestedSubtask(t) || t.isEvent || t.scheduledTime) return false;
    if (t.completedDate) return t.completedDate === targetDateStr;
    return t.scheduledDate === targetDateStr;
  });

  // Active items
  const activeTasks = tasks.filter(t => !t.completed && filterByCondition(t));

  // Vérifier si un élément est prévu strictement pour le jour sélectionné
  const isItemForSelectedDay = (t) => {
    if (!t.scheduledDate) return false;
    return t.scheduledDate === targetDateStr;
  };

  // Pour aujourd'hui uniquement: tâches non complétées en retard (rollover)
  // Les événements (isEvent) ne sont JAMAIS des tâches en retard: ils restent sur leur date d'origine
  const isOverdueTask = (t) => {
    return currentDayOffset === 0 && !t.isEvent && !t.completed && !!t.scheduledDate && t.scheduledDate < targetDateStr;
  };

  // 1. FOCUS DAY: Événements ou Blocs minutés prévus STRICTEMENT pour le jour sélectionné
  // Les événements passés d'hier ou blocs complétés restent sur leur journée et ne polluent pas le jour actuel
  const focusDayItems = tasks.filter(t => {
    return isItemForSelectedDay(t) && (t.isEvent || t.scheduledTime) && !isNestedSubtask(t) && filterByCondition(t);
  });

  // Tri chronologique des blocs du Focus Day (10h, 14h...)
  focusDayItems.sort((a, b) => {
    if (a.scheduledTime && b.scheduledTime) return a.scheduledTime.localeCompare(b.scheduledTime);
    if (a.scheduledTime) return -1;
    if (b.scheduledTime) return 1;
    return 0;
  });

  // 2. PRIORITÉS: Tâches favorites du jour sélectionné ou tâches favorites en retard
  const priorityItems = activeTasks.filter(t => {
    if (isNestedSubtask(t) || t.isEvent || !t.isFavorite) return false;
    if (isItemForSelectedDay(t) && !t.scheduledTime) return true;
    if (isOverdueTask(t)) return true;
    return false;
  });

  // 3. TÂCHES FLOTTANTES DU JOUR: Tâches du jour sans heure fixe ou tâches en retard non complétées
  const regularTodayItems = activeTasks.filter(t => {
    if (isNestedSubtask(t) || t.isEvent || t.isFavorite) return false;
    if (isItemForSelectedDay(t) && !t.scheduledTime) return true;
    if (isOverdueTask(t)) return true;
    return false;
  });

  // 4. BACKLOG: Tâches sans date programmée
  const allBacklogItems = activeTasks.filter(t => {
    return !t.scheduledDate && !isNestedSubtask(t);
  });

  // Action counts for Inbox filter pills
  let countCall = 0, countMail = 0, countPay = 0, countOther = 0;
  allBacklogItems.forEach(t => {
    const at = getTaskActionType(t);
    if (at === 'call') countCall++;
    else if (at === 'mail') countMail++;
    else if (at === 'pay') countPay++;
    else countOther++;
  });

  const elAll = document.getElementById('inboxCountAll');
  if (elAll) elAll.textContent = allBacklogItems.length;
  const elCall = document.getElementById('inboxCountCall');
  if (elCall) elCall.textContent = countCall;
  const elMail = document.getElementById('inboxCountMail');
  if (elMail) elMail.textContent = countMail;
  const elPay = document.getElementById('inboxCountPay');
  if (elPay) elPay.textContent = countPay;
  const elOther = document.getElementById('inboxCountOther');
  if (elOther) elOther.textContent = countOther;

  // Filtrage actif des items de l'Inbox selon le pill sélectionné
  const backlogItems = allBacklogItems.filter(t => {
    if (activeInboxActionFilter === 'all') return true;
    return getTaskActionType(t) === activeInboxActionFilter;
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
      // Detect past time slots earlier today
      const isItemPast = (item) => {
        if (currentDayOffset !== 0 || !item.scheduledTime) return false;
        const [h, m] = item.scheduledTime.split(':');
        const startMins = parseInt(h, 10) * 60 + parseInt(m, 10);
        const dur = item.duration || (item.estimate || 1) * 30;
        return (startMins + dur) <= currentMinutes;
      };

      // Detect if an event/task is currently LIVE in progress right now
      const isItemLive = (item) => {
        if (currentDayOffset !== 0 || !item.scheduledTime || item.completed) return false;
        const [h, m] = item.scheduledTime.split(':');
        const startMins = parseInt(h, 10) * 60 + parseInt(m, 10);
        const dur = item.duration || (item.estimate || 1) * 30;
        const endMins = startMins + dur;
        return (currentMinutes >= startMins && currentMinutes < endMins);
      };

      const anyItemLive = focusDayItems.some(isItemLive);
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

        // Place standalone red line between past and upcoming blocks ONLY if no event is currently live
        if (currentDayOffset === 0 && !anyItemLive) {
          focusDayList.appendChild(createNowIndicatorElement());
        }
      } else if (pastItems.length > 0 && activeItems.length === 0) {
        pastItems.forEach(item => {
          focusDayList.appendChild(renderItemAndSubtasks(item));
        });

        // Placed after all past items
        if (currentDayOffset === 0 && !anyItemLive) {
          focusDayList.appendChild(createNowIndicatorElement());
        }
      } else if (pastItems.length === 0 && activeItems.length > 0) {
        // Placed before upcoming items only if not currently live in the first block
        if (currentDayOffset === 0 && !anyItemLive) {
          focusDayList.appendChild(createNowIndicatorElement());
        }
      }

      // Render LIVE / UPCOMING slots
      activeItems.forEach((item, idx) => {
        focusDayList.appendChild(renderItemAndSubtasks(item));

        // Interstitial free-time gap between scheduled items
        if (idx < activeItems.length - 1) {
          const currentEnd = calculateEndTime(item.scheduledTime, item.duration || (item.estimate || 1) * 30);
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
    const totalEstMins = (focusDayItems.length + priorityItems.length + regularTodayItems.length) * 30;
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

  // Batch Plan prompt bar
  const batchPlanContainer = document.getElementById('inboxBatchPlanContainer');
  if (batchPlanContainer) {
    if (activeInboxActionFilter !== 'all' && backlogItems.length > 0) {
      const typeNames = { call: 'appels', mail: 'mails', pay: 'paiements / factures', other: 'tâches' };
      const typeIcons = { call: '📞', mail: '✉️', pay: '💳', other: '📦' };
      batchPlanContainer.innerHTML = `
        <div class="inbox-batch-plan-bar">
          <span>${typeIcons[activeInboxActionFilter] || '⚡'} <strong>${backlogItems.length} ${typeNames[activeInboxActionFilter] || 'éléments'}</strong> dans ce filtre</span>
          <button type="button" class="inbox-batch-plan-btn" onclick="scheduleActionBatch('${activeInboxActionFilter}')">⚡ Planifier en bloc aujourd'hui</button>
        </div>
      `;
    } else {
      batchPlanContainer.innerHTML = '';
    }
  }

  // 4. Render BACKLOG / INBOX (Unscheduled tasks in rectangular drop container)
  if (groupBacklog && backlogList) {
    if (backlogItems.length > 0) {
      groupBacklog.style.display = 'flex';
      if (backlogCountBadge) backlogCountBadge.textContent = allBacklogItems.length;
      backlogItems.forEach(item => {
        backlogList.appendChild(createTaskDOMElement(item, false));
      });
    } else {
      groupBacklog.style.display = 'flex';
      if (backlogCountBadge) backlogCountBadge.textContent = allBacklogItems.length;
      const emptyMessages = {
        call: 'Aucun appel en attente dans l\'Inbox',
        mail: 'Aucun mail en attente dans l\'Inbox',
        pay: 'Aucun paiement en attente dans l\'Inbox',
        other: 'Aucune autre tâche en attente',
        all: 'Inbox is empty'
      };
      backlogList.innerHTML = `
        <li class="backlog-empty-state">
          <span class="backlog-empty-icon">${activeInboxActionFilter === 'call' ? '📞' : (activeInboxActionFilter === 'mail' ? '✉️' : (activeInboxActionFilter === 'pay' ? '💳' : '📦'))}</span>
          <span class="backlog-empty-text">${emptyMessages[activeInboxActionFilter] || 'Inbox is empty'}</span>
          <span class="backlog-empty-sub">${activeInboxActionFilter === 'all' ? 'Drop tasks here or use input above to add' : 'Cliquez sur "Tous" pour voir l\'ensemble de l\'inbox'}</span>
        </li>
      `;
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
  const groupBacklog = document.getElementById('groupBacklog');
  const tabInbox = document.getElementById('tabBtnInbox');
  const tabToday = document.getElementById('tabBtnToday');

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

  // Make the entire rectangular Backlog container beneath the title an active elongated drop zone
  if (groupBacklog && !groupBacklog._hasDnD) {
    groupBacklog._hasDnD = true;

    groupBacklog.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      groupBacklog.classList.add('drag-over');
    });

    groupBacklog.addEventListener('dragleave', (e) => {
      if (!groupBacklog.contains(e.relatedTarget)) {
        groupBacklog.classList.remove('drag-over');
      }
    });

    groupBacklog.addEventListener('drop', (e) => {
      e.preventDefault();
      groupBacklog.classList.remove('drag-over');
      document.body.classList.remove('is-dragging-task');
      const taskId = e.dataTransfer.getData('text/plain');
      if (!taskId) return;

      triggerHapticFeedback();
      moveTaskToBacklog(taskId);
    });
  }

  // Also allow dropping directly on the header Tab Buttons!
  [tabToday, tabInbox].forEach(btn => {
    if (!btn || btn._hasDnD) return;
    btn._hasDnD = true;

    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      btn.classList.add('tab-drag-hover');
    });

    btn.addEventListener('dragleave', (e) => {
      if (!btn.contains(e.relatedTarget)) {
        btn.classList.remove('tab-drag-hover');
      }
    });

    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      btn.classList.remove('tab-drag-hover');
      const taskId = e.dataTransfer.getData('text/plain');
      if (!taskId) return;

      triggerHapticFeedback();
      if (btn.id === 'tabBtnToday') {
        moveTaskToSelectedDay(taskId);
      } else if (btn.id === 'tabBtnInbox') {
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
  const durationMinutes = task.duration || (task.estimate || 1) * 30;
  const todayRealStr = getLocalDateString();
  const todayStr = todayRealStr;
  const targetDateStr = getSelectedDateStr();
  const isOverdue = !task.completed && !task.isEvent && task.scheduledDate && task.scheduledDate < todayRealStr;

  const childSubtasks = tasks.filter(t => 
    t && t.parentEventId && (
      String(t.parentEventId) === String(task.id) ||
      (task.planId && String(t.parentEventId) === String(task.planId)) ||
      (task.focusId && String(t.parentEventId) === String(task.focusId))
    )
  );
  const doneSubCount = childSubtasks.filter(t => t.completed).length;
  const progressBadge = (childSubtasks.length > 0)
    ? `<span class="event-progress-pill" title="Completed subtasks">${doneSubCount}/${childSubtasks.length}</span>`
    : '';

  const quickPlanBtnTooltip = currentDayOffset === 0 ? "Schedule for today" : (currentDayOffset === 1 ? "Schedule for tomorrow" : "Schedule for this date");
  const taskEndTime = task.scheduledTime ? calculateEndTime(task.scheduledTime, task.duration || (task.estimate || 1) * 30) : null;

  let isLiveNow = false;
  let isPastBlock = false;
  let liveProgressPct = 0;
  let liveElapsedMinutes = 0;
  let liveRemainingMinutes = 0;
  let currentFormattedTime = '';

  if (task.scheduledTime && task.scheduledDate === todayRealStr && !task.completed) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const hNow = String(now.getHours()).padStart(2, '0');
    const mNow = String(now.getMinutes()).padStart(2, '0');
    currentFormattedTime = `${hNow}:${mNow}`;

    const [hStr, mStr] = task.scheduledTime.split(':');
    const startMins = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
    const dur = task.duration || (task.estimate || 1) * 30;
    const endMins = startMins + dur;
    isLiveNow = (currentMinutes >= startMins && currentMinutes < endMins);
    isPastBlock = (endMins <= currentMinutes);

    if (isLiveNow) {
      liveElapsedMinutes = Math.max(0, currentMinutes - startMins);
      liveRemainingMinutes = Math.max(0, endMins - currentMinutes);
      liveProgressPct = Math.min(100, Math.max(0, Math.round((liveElapsedMinutes / Math.max(1, dur)) * 100)));
    }
  }

  let humanRemainingText = '';
  if (liveRemainingMinutes > 0) {
    if (liveRemainingMinutes >= 60) {
      const rh = Math.floor(liveRemainingMinutes / 60);
      const rm = liveRemainingMinutes % 60;
      humanRemainingText = rm > 0 ? `${rh}h${String(rm).padStart(2, '0')} restant` : `${rh}h restant`;
    } else {
      humanRemainingText = `${liveRemainingMinutes}m restant`;
    }
  } else {
    humanRemainingText = 'Fin imminente';
  }

  if (task.isEvent) {
    wrapper.innerHTML = `
      <div class="task-item is-event-card ${isJustAdded ? 'just-added' : ''} ${isCurrentlyInFocus ? 'in-focus-active' : ''} ${isLiveNow ? 'is-live-now' : ''} ${isPastBlock ? 'is-past-slot' : ''}" 
           id="task-node-${task.id}" 
           data-cat="${task.category || 'Work'}"
           ondblclick="openEditModalForTask('${task.id}')"
           title="Double-click to edit • Drag to reorder">
        
        <!-- EVENT CARD: 2-LINE LAYOUT (TOP: TITLE • BOTTOM: METADATA & ACTIONS) -->
        <div class="task-card-content is-event">
          <div class="task-card-top-row">
            <span class="event-type-badge">📅</span>
            <span class="event-title-text" title="${(task.title || '').replace(/"/g, '&quot;')}">${renderTitleWithTags(task.title)}</span>
          </div>

          <div class="task-card-bottom-row">
            <div class="task-bottom-left">
              ${task.scheduledTime ? `
                <span class="task-time-pill" title="Scheduled slot: ${task.scheduledTime}${taskEndTime ? ' to ' + taskEndTime : ''}">
                  🕒 ${task.scheduledTime}${taskEndTime ? '–' + taskEndTime : ''}
                </span>
              ` : `<span class="task-meta-time">⏱ ${durationMinutes}m</span>`}
              ${(!task.completed && task.isFavorite) ? `<span class="task-meta-star" title="Priority">⭐</span>` : ''}
              ${progressBadge}
            </div>

            <div class="task-bottom-right">
              <button class="btn-task-quick-action task-focus-btn ${isCurrentlyInFocus ? 'active' : ''}" type="button" onclick="event.stopPropagation(); toggleTaskFocus('${task.id}')" title="${isCurrentlyInFocus ? 'Unfocus event' : 'Focus this event'}">🎯</button>
              <button class="btn-task-quick-action btn-card-quick-subtask" type="button" onclick="event.stopPropagation(); openQuickSubtaskModal('${task.id}')" title="Add subtask">➕</button>
              
              <div class="task-menu-container">
                <button class="btn-task-menu" type="button" onclick="toggleTaskActionMenu('${task.id}', event)" title="Event actions">⋮</button>
                <div class="task-actions-dropdown" id="menu-dropdown-${task.id}">
                  <button class="dropdown-item" type="button" onclick="event.stopPropagation(); openEditModalForTask('${task.id}')">👁️ View details &amp; Edit</button>
                  <button class="dropdown-item" type="button" onclick="event.stopPropagation(); toggleTaskFocus('${task.id}')">🎯 ${isCurrentlyInFocus ? 'Unfocus event' : 'Focus this event'}</button>
                  <button class="dropdown-item" type="button" onclick="event.stopPropagation(); openQuickSubtaskModal('${task.id}')">➕ Add subtask</button>
                  <button class="dropdown-item" type="button" onclick="event.stopPropagation(); convertToTask('${task.id}')">📝 Convert to simple task</button>
                  <button class="dropdown-item" type="button" onclick="event.stopPropagation(); toggleFavorite('${task.id}')">${task.isFavorite ? '☆ Remove priority' : '⭐ Set as priority'}</button>
                  <button class="dropdown-item danger" type="button" onclick="event.stopPropagation(); deleteTaskById('${task.id}')">✕ Delete</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        ${isLiveNow ? `
          <div class="live-event-progress-container" title="En cours: ${currentFormattedTime} • ${liveElapsedMinutes}m écoulées, ${humanRemainingText}">
            <div class="live-event-progress-track">
              <div class="live-event-progress-fill" style="width: ${liveProgressPct}%;"></div>
              <div class="live-event-progress-marker" style="left: ${Math.min(92, Math.max(8, liveProgressPct))}%;">
                <span class="live-marker-dot">●</span>
                <span class="live-marker-time">${currentFormattedTime}</span>
              </div>
            </div>
            <div class="live-event-progress-footer">
              <span class="live-progress-edge-start">${task.scheduledTime}</span>
              <span class="live-progress-stats">
                <strong>${humanRemainingText}</strong>
              </span>
              <span class="live-progress-edge-end">${taskEndTime || ''}</span>
            </div>
          </div>
        ` : ''}

        <!-- INTEGRATED SUBTASKS: Nested directly inside the event card case -->
        ${childSubtasks.length > 0 ? `
          <div class="event-integrated-subtasks">
            ${childSubtasks.map(sub => {
              const isSubInFocus = activeTask && String(activeTask.id) === String(sub.id);
              const subAction = getTaskActionType(sub);
              let subActionIcon = '⚡';
              let subActionLabel = 'Auto';
              if (subAction === 'call') { subActionIcon = '📞'; subActionLabel = 'Call'; }
              else if (subAction === 'mail') { subActionIcon = '✉️'; subActionLabel = 'Mail'; }
              else if (subAction === 'pay') { subActionIcon = '💳'; subActionLabel = 'Paiement'; }
              else if (sub.actionType === 'other') { subActionIcon = '📦'; subActionLabel = 'Standard'; }
              return `
              <div class="integrated-subtask-row ${sub.completed ? 'completed' : ''} ${isSubInFocus ? 'in-focus-active' : ''}" 
                   id="task-node-${sub.id}" 
                   draggable="true" 
                   ondragstart="event.dataTransfer.setData('text/plain', '${sub.id}'); event.stopPropagation(); document.body.classList.add('is-dragging-task');" 
                   ondragend="document.body.classList.remove('is-dragging-task');"
                   ondblclick="event.stopPropagation(); openEditModalForTask('${sub.id}')" 
                   title="Double-cliquer pour modifier • Cliquer sur l'icône pour changer d'action">
                <span class="subtask-cat-bar subtask-cat-${(sub.category || 'Work').toLowerCase()}"></span>
                <button class="btn-subtask-action-toggle action-${subAction}" 
                        type="button" 
                        onclick="event.stopPropagation(); cycleFocusSubtaskAction('${sub.id}')" 
                        title="Type d'action: ${subActionLabel} (cliquer pour changer)">
                  ${subActionIcon}
                </button>
                <div class="subtask-checkbox" onclick="event.stopPropagation(); toggleTaskById('${sub.id}')" title="${sub.completed ? 'Mark uncompleted' : 'Mark completed'}">
                  ${sub.completed ? '✓' : ''}
                </div>
                <span class="integrated-subtask-title">${renderTitleWithTags(sub.title)}</span>
                ${sub.isFavorite ? '<span class="task-meta-star" style="font-size:11px; margin-right:2px;" title="Priority">⭐</span>' : ''}
                <button class="btn-subtask-focus ${isSubInFocus ? 'active' : ''}" type="button" onclick="event.stopPropagation(); toggleTaskFocus('${sub.id}')" title="${isSubInFocus ? 'Unfocus subtask' : 'Focus this subtask'}">🎯</button>
                <button class="btn-subtask-detach" type="button" onclick="event.stopPropagation(); detachSubtask('${sub.id}')" title="Detach">✕</button>
              </div>
            `;}).join('')}
            <button type="button" class="btn-subtask-add-compact" onclick="event.stopPropagation(); openQuickSubtaskModal('${task.id}')">
              <span>+ Add subtask</span>
            </button>
          </div>
        ` : ''}

      </div>
    `;
  } else {
    // Action Type Badge (Calls / Mails / Paiements)
    const actionType = getTaskActionType(task);
    let actionBadge = '';
    if (actionType === 'call') actionBadge = '<span class="task-action-tag-badge action-call" onclick="event.stopPropagation(); setInboxActionFilter(\'call\'); switchTaskTab(\'inbox\');" title="Filtre Inbox: Calls">📞 Call</span>';
    else if (actionType === 'mail') actionBadge = '<span class="task-action-tag-badge action-mail" onclick="event.stopPropagation(); setInboxActionFilter(\'mail\'); switchTaskTab(\'inbox\');" title="Filtre Inbox: Mails">✉️ Mail</span>';
    else if (actionType === 'pay') actionBadge = '<span class="task-action-tag-badge action-pay" onclick="event.stopPropagation(); setInboxActionFilter(\'pay\'); switchTaskTab(\'inbox\');" title="Filtre Inbox: Paiements">💳 Pay</span>';

    // STANDARD TASK CARD: 2-LINE LAYOUT (TOP: CHECKBOX + FULL TITLE • BOTTOM: METADATA & ACTIONS)
    wrapper.innerHTML = `
      <div class="task-item ${task.completed ? 'completed' : ''} ${isJustAdded ? 'just-added' : ''} ${isCurrentlyInFocus ? 'in-focus-active' : ''} ${isSubtask ? 'is-subtask-item' : ''} ${childSubtasks.length > 0 ? 'has-subtasks' : ''} ${isLiveNow ? 'is-live-now' : ''} ${isPastBlock ? 'is-past-slot' : ''}" 
           id="task-node-${task.id}" 
           data-cat="${task.category || 'Work'}"
           ondblclick="openEditModalForTask('${task.id}')"
           title="Double-click to edit • Drag to reorder">
        
        <div class="task-card-content">
          <!-- TOP ROW: CHECKBOX + EXPANDED FULL-WIDTH TITLE -->
          <div class="task-card-top-row">
            ${isSubtask ? '<span class="subtask-indent-branch" aria-hidden="true">↳</span>' : ''}
            <div class="checkbox" onclick="event.stopPropagation(); toggleTaskById('${task.id}')">
              ${task.completed ? '✓' : ''}
            </div>
            <span class="task-title-text" title="${(task.title || '').replace(/"/g, '&quot;')}">${renderTitleWithTags(task.title)}</span>
          </div>

          <!-- BOTTOM ROW: METADATA (LEFT) + QUICK ACTIONS & MENU (RIGHT) -->
          <div class="task-card-bottom-row">
            <div class="task-bottom-left">
              ${task.scheduledTime ? `
                <span class="task-time-pill" title="Scheduled slot: ${task.scheduledTime}${taskEndTime ? ' to ' + taskEndTime : ''}">
                  🕒 ${task.scheduledTime}${taskEndTime ? '–' + taskEndTime : ''}
                </span>
              ` : `<span class="task-meta-time">⏱ ${durationMinutes}m</span>`}
              ${actionBadge}
              ${(!task.completed && task.isFavorite) ? `<span class="task-meta-star" title="Priority">⭐</span>` : ''}
              ${isOverdue ? '<span class="task-overdue-badge">⚠️ Overdue</span>' : ''}
              ${progressBadge}
            </div>

            <div class="task-bottom-right">
              <button class="btn-task-quick-action task-focus-btn ${isCurrentlyInFocus ? 'active' : ''}" type="button" onclick="event.stopPropagation(); toggleTaskFocus('${task.id}')" title="${isCurrentlyInFocus ? 'Unfocus task' : 'Focus this task'}">🎯</button>
              ${!isSubtask ? `<button class="btn-task-quick-action btn-card-quick-subtask" type="button" onclick="event.stopPropagation(); openQuickSubtaskModal('${task.id}')" title="Add subtask">➕</button>` : ''}
              ${!task.completed && (!task.scheduledDate || task.scheduledDate !== targetDateStr)
                ? `<button class="btn-task-quick-action move-today" type="button" onclick="event.stopPropagation(); moveTaskToSelectedDay('${task.id}')" title="${quickPlanBtnTooltip}">⚡</button>`
                : ''}
              ${!task.completed && (task.scheduledDate === targetDateStr && !task.isEvent && !isSubtask)
                ? `<button class="btn-task-quick-action move-backlog" type="button" onclick="event.stopPropagation(); moveTaskToBacklog('${task.id}')" title="Move to Inbox">📦</button>`
                : ''}
              
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
        </div>

        ${isLiveNow ? `
          <div class="live-event-progress-container" title="En cours: ${currentFormattedTime} • ${liveElapsedMinutes}m écoulées, ${humanRemainingText}">
            <div class="live-event-progress-track">
              <div class="live-event-progress-fill" style="width: ${liveProgressPct}%;"></div>
              <div class="live-event-progress-marker" style="left: ${Math.min(92, Math.max(8, liveProgressPct))}%;">
                <span class="live-marker-dot">●</span>
                <span class="live-marker-time">${currentFormattedTime}</span>
              </div>
            </div>
            <div class="live-event-progress-footer">
              <span class="live-progress-edge-start">${task.scheduledTime}</span>
              <span class="live-progress-stats">
                <strong>${humanRemainingText}</strong>
              </span>
              <span class="live-progress-edge-end">${taskEndTime || ''}</span>
            </div>
          </div>
        ` : ''}

        <!-- INTEGRATED SUBTASKS FOR REGULAR PARENT TASK -->
        ${childSubtasks.length > 0 ? `
          <div class="event-integrated-subtasks">
            ${childSubtasks.map(sub => {
              const isSubInFocus = activeTask && String(activeTask.id) === String(sub.id);
              const subAction = getTaskActionType(sub);
              let subActionIcon = '⚡';
              let subActionLabel = 'Auto';
              if (subAction === 'call') { subActionIcon = '📞'; subActionLabel = 'Call'; }
              else if (subAction === 'mail') { subActionIcon = '✉️'; subActionLabel = 'Mail'; }
              else if (subAction === 'pay') { subActionIcon = '💳'; subActionLabel = 'Paiement'; }
              else if (sub.actionType === 'other') { subActionIcon = '📦'; subActionLabel = 'Standard'; }
              return `
              <div class="integrated-subtask-row ${sub.completed ? 'completed' : ''} ${isSubInFocus ? 'in-focus-active' : ''}" 
                   id="task-node-${sub.id}" 
                   draggable="true" 
                   ondragstart="event.dataTransfer.setData('text/plain', '${sub.id}'); event.stopPropagation(); document.body.classList.add('is-dragging-task');" 
                   ondragend="document.body.classList.remove('is-dragging-task');"
                   ondblclick="event.stopPropagation(); openEditModalForTask('${sub.id}')" 
                   title="Double-cliquer pour modifier • Cliquer sur l'icône pour changer d'action">
                <span class="subtask-cat-bar subtask-cat-${(sub.category || 'Work').toLowerCase()}"></span>
                <button class="btn-subtask-action-toggle action-${subAction}" 
                        type="button" 
                        onclick="event.stopPropagation(); cycleFocusSubtaskAction('${sub.id}')" 
                        title="Type d'action: ${subActionLabel} (cliquer pour changer)">
                  ${subActionIcon}
                </button>
                <div class="subtask-checkbox" onclick="event.stopPropagation(); toggleTaskById('${sub.id}')" title="${sub.completed ? 'Mark uncompleted' : 'Mark completed'}">
                  ${sub.completed ? '✓' : ''}
                </div>
                <span class="integrated-subtask-title">${renderTitleWithTags(sub.title)}</span>
                ${sub.isFavorite ? '<span class="task-meta-star" style="font-size:11px; margin-right:2px;" title="Priority">⭐</span>' : ''}
                <button class="btn-subtask-focus ${isSubInFocus ? 'active' : ''}" type="button" onclick="event.stopPropagation(); toggleTaskFocus('${sub.id}')" title="${isSubInFocus ? 'Unfocus subtask' : 'Focus this subtask'}">🎯</button>
                <button class="btn-subtask-detach" type="button" onclick="event.stopPropagation(); detachSubtask('${sub.id}')" title="Detach">✕</button>
              </div>
            `;}).join('')}
            <button type="button" class="btn-subtask-add-compact" onclick="event.stopPropagation(); openQuickSubtaskModal('${task.id}')">
              <span>+ Add subtask</span>
            </button>
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
    document.body.classList.add('is-dragging-task');
  });
  wrapper.addEventListener('dragend', () => {
    wrapper.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging-task');
    const groupBacklog = document.getElementById('groupBacklog');
    if (groupBacklog) groupBacklog.classList.remove('drag-over');
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
      if (touchDiffX > 85 && task.scheduledDate && !task.isEvent) {
        triggerHapticFeedback();
        itemNode.style.transform = `translateX(140px)`;
        setTimeout(() => {
          moveTaskToBacklog(task.id);
        }, 160);
      } else if (touchDiffX > 55) {
        triggerHapticFeedback();
        itemNode.style.transform = `translateX(90px)`;
        setTimeout(() => {
          setSpotlightTaskById(task.id);
          itemNode.style.transform = `translateX(0px)`;
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
    duration: 30,
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
  t.parentEventId = null;
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

  // Identifier tous les enfants (sous-tâches) de cette tâche/événement à supprimer aussi
  const childIds = [];
  tasks.forEach(t => {
    if (String(t.parentEventId) === targetId) {
      childIds.push(String(t.id));
    }
  });

  const allIdsToRemove = new Set([targetId, ...childIds]);

  tasks = tasks.filter(t => !allIdsToRemove.has(String(t.id)) && !(t.planId && allIdsToRemove.has(String(t.planId))));

  try {
    const rawPlan = localStorage.getItem('span_plan_tasks');
    if (rawPlan) {
      const planList = JSON.parse(rawPlan);
      if (Array.isArray(planList)) {
        const updatedPlan = planList.filter(p => !allIdsToRemove.has(String(p.id)) && !(p.planId && allIdsToRemove.has(String(p.planId))) && !(p.focusId && allIdsToRemove.has(String(p.focusId))));
        localStorage.setItem('span_plan_tasks', JSON.stringify(updatedPlan));
      }
    }
  } catch (e) {
    console.warn('Pruning plan tasks error:', e);
  }

  try {
    const deletedSet = new Set(JSON.parse(localStorage.getItem('span_deleted_task_ids') || '[]'));
    allIdsToRemove.forEach(k => deletedSet.add(String(k)));
    localStorage.setItem('span_deleted_task_ids', JSON.stringify(Array.from(deletedSet)));

    let dismissed = JSON.parse(localStorage.getItem('span_plan_dismissed_focus_ids')) || [];
    allIdsToRemove.forEach(k => {
      if (!dismissed.includes(k)) dismissed.push(k);
    });
    localStorage.setItem('span_plan_dismissed_focus_ids', JSON.stringify(dismissed));
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
  if (typeof updateDisplay === 'function') updateDisplay();
  if (typeof switchView === 'function' && window.innerWidth < 650) {
    switchView('focus', document.getElementById('nav-btn-focus'));
  }
}

function dismissSpotlightTask() {
  activeTask = null;
  window.SpanState.activeTask = null;
  saveTasks();
  if (typeof updateDisplay === 'function') updateDisplay();
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
  if (typeof updateDisplay === 'function') updateDisplay();
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

window.addEventListener('dragend', () => {
  document.body.classList.remove('is-dragging-task');
  const groupBacklog = document.getElementById('groupBacklog');
  if (groupBacklog) groupBacklog.classList.remove('drag-over');
});

autoArchivePastDays();
checkScheduledTasksForToday();
loadSampleTasksIfEmpty(false);
initTaskTargetDefault();
updateTaskTabsUI();
if (typeof syncWithSpanPlan === 'function') syncWithSpanPlan();

// Cross-app & cross-tab real-time sync
if (typeof BroadcastChannel !== 'undefined') {
  try {
    const focusSuiteBridge = new BroadcastChannel('span_suite_bridge');
    focusSuiteBridge.onmessage = (event) => {
      if (event.data && (event.data.type === 'PLAN_UPDATED' || event.data.type === 'PLAN_TASKS_SAVED')) {
        if (typeof syncWithSpanPlan === 'function') syncWithSpanPlan();
        if (typeof renderTasks === 'function') renderTasks();
      }
    };
  } catch (e) {}
}

window.addEventListener('storage', (e) => {
  if (e.key === 'span_plan_tasks' || e.key === 'span_tasks') {
    if (typeof syncWithSpanPlan === 'function') syncWithSpanPlan();
    if (typeof renderTasks === 'function') renderTasks();
  }
});

window.addEventListener('focus', () => {
  if (typeof syncWithSpanPlan === 'function') syncWithSpanPlan();
});


// Auto-refresh tasks every 60s so that "● LIVE" badge and current-time indicators update smoothly
setInterval(() => {
  const modal = document.getElementById('taskDetailModal');
  const isModalOpen = modal && modal.classList.contains('active');
  const isDragging = document.querySelector('.dragging') !== null;
  if (!isModalOpen && !isDragging && typeof renderTasks === 'function') {
    if (typeof autoArchivePastDays === 'function') autoArchivePastDays();
    renderTasks();
  }
}, 60000);

// Keep the live Now indicator line time text and in-progress progress bar updated in real time
setInterval(() => {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const formatted = `${h}:${m}`;

  const timeEl = document.querySelector('.now-indicator-time');
  if (timeEl && timeEl.textContent !== formatted) {
    timeEl.textContent = formatted;
  }

  const liveMarker = document.querySelector('.live-marker-time');
  if (liveMarker && liveMarker.textContent !== formatted) {
    liveMarker.textContent = formatted;
    // Minute ticked over: refresh task list to update progress bar smoothly
    const isDragging = document.querySelector('.dragging') !== null;
    const modal = document.getElementById('taskDetailModal');
    const isModalOpen = modal && modal.classList.contains('active');
    if (!isDragging && !isModalOpen && typeof renderTasks === 'function') {
      renderTasks();
    }
  }
}, 5000);


