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

var selectedTaskIndex = 0;
var editingTaskId = null;
var editingCategory = 'Work';
var editingEstimate = 1;
var editingIsFavorite = false;
var editingActionType = 'auto';
var isPastOpen = false;
var isPastFocusDayExpanded = false;
var newlyAddedTaskId = null;
var activeTagFilter = null;
var activeInboxActionFilter = 'all';
var focusHideActionsInAll = localStorage.getItem('span_focus_hide_actions_in_all') !== 'false'; // default true

function updateFocusHideActionsToggleUI() {
  const btn = document.getElementById('btnToggleHideActionsFocus');
  const badge = document.getElementById('focusToggleBadgeText');
  if (btn) btn.classList.toggle('active', focusHideActionsInAll);
  if (badge) badge.textContent = focusHideActionsInAll ? 'ON' : 'OFF';
}
window.updateFocusHideActionsToggleUI = updateFocusHideActionsToggleUI;

function toggleFocusHideActionsInAll(forceVal) {
  if (typeof forceVal === 'boolean') {
    focusHideActionsInAll = forceVal;
  } else {
    focusHideActionsInAll = !focusHideActionsInAll;
  }
  localStorage.setItem('span_focus_hide_actions_in_all', focusHideActionsInAll ? 'true' : 'false');
  updateFocusHideActionsToggleUI();
  renderTasks();
  if (typeof showToast === 'function') {
    showToast(focusHideActionsInAll ? 'Actions (Calls/Mails/Pay) masquées dans "Tous"' : 'Actions affichées dans "Tous"', 'info');
  }
}
window.toggleFocusHideActionsInAll = toggleFocusHideActionsInAll;

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

var quickAddAction = 'auto';
var quickSubtaskAction = 'auto';

const FOCUS_ACTION_CYCLE = ['auto', 'call', 'mail', 'pay', 'other'];
const FOCUS_ACTION_ICONS = {
  auto: '⚡',
  call: '📞',
  mail: '✉️',
  pay: '💳',
  other: '📦'
};
const FOCUS_ACTION_TITLES = {
  auto: "Type d'action : ⚡ Auto (Détection auto)",
  call: "Type d'action : 📞 Call (Appel)",
  mail: "Type d'action : ✉️ Mail (Email)",
  pay: "Type d'action : 💳 Pay (Paiement)",
  other: "Type d'action : 📦 Standard"
};

function updateFocusActionSelectButton() {
  const btn = document.getElementById('btnFocusActionSelect');
  const iconSpan = document.getElementById('focusActionSelectIcon');
  if (btn && iconSpan) {
    iconSpan.textContent = FOCUS_ACTION_ICONS[quickAddAction] || '⚡';
    btn.title = FOCUS_ACTION_TITLES[quickAddAction] || "Type d'action";
    btn.className = `btn-focus-action-select action-${quickAddAction}`;
  }
}
window.updateFocusActionSelectButton = updateFocusActionSelectButton;

function cycleFocusQuickAddAction() {
  const currentIndex = FOCUS_ACTION_CYCLE.indexOf(quickAddAction);
  const nextIndex = (currentIndex + 1) % FOCUS_ACTION_CYCLE.length;
  setQuickAddAction(FOCUS_ACTION_CYCLE[nextIndex]);
}
window.cycleFocusQuickAddAction = cycleFocusQuickAddAction;

function setQuickAddAction(action) {
  quickAddAction = action || 'auto';
  document.querySelectorAll('#quickAddActionChips .quick-action-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.action === quickAddAction);
  });
  updateFocusActionSelectButton();
}
window.setQuickAddAction = setQuickAddAction;

function setQuickSubtaskAction(action) {
  quickSubtaskAction = action || 'auto';
  document.querySelectorAll('#quickSubtaskActionChips .quick-action-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.action === quickSubtaskAction);
  });
}
window.setQuickSubtaskAction = setQuickSubtaskAction;

function setFocusTaskAction(taskId, action) {
  const task = tasks.find(t => String(t.id) === String(taskId));
  if (!task) return;
  task.actionType = (action === 'auto') ? null : action;
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
    showToast(labels[action] || 'Action modifiée', '💾');
  }
}
window.setFocusTaskAction = setFocusTaskAction;

function cycleFocusTaskAction(taskId) {
  const task = tasks.find(t => String(t.id) === String(taskId));
  if (!task) return;
  const current = task.actionType || 'auto';
  const order = ['auto', 'call', 'mail', 'pay', 'other'];
  const nextIdx = (order.indexOf(current) + 1) % order.length;
  const nextType = order[nextIdx];
  setFocusTaskAction(taskId, nextType);
}
window.cycleFocusTaskAction = cycleFocusTaskAction;

function cycleFocusSubtaskAction(taskId) {
  cycleFocusTaskAction(taskId);
}
window.cycleFocusSubtaskAction = cycleFocusSubtaskAction;

function setInboxActionFilter(filter) {
  activeInboxActionFilter = filter;
  document.querySelectorAll('.inbox-filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  if (filter === 'call' || filter === 'mail' || filter === 'pay') {
    setQuickAddAction(filter);
  }
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

var isBacklogOpen = localStorage.getItem('span_backlog_open') !== 'false';
var activeCategories = new Set(); // Empty Set means 'all' (all categories shown)

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

var activeTaskTab = localStorage.getItem('span_active_task_tab') || 'today';

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

var currentDayOffset = 0;

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
    actionType: (quickAddAction === 'auto') ? null : quickAddAction,
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


// Unified live time indicator & background task refresher
let lastFocusMinuteStr = '';
setInterval(() => {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const formatted = `${h}:${m}`;

  // Update text labels directly without full list re-renders
  const timeEl = document.querySelector('.now-indicator-time');
  if (timeEl && timeEl.textContent !== formatted) {
    timeEl.textContent = formatted;
  }

  const liveMarker = document.querySelector('.live-marker-time');
  if (liveMarker && liveMarker.textContent !== formatted) {
    liveMarker.textContent = formatted;
  }

  // Once per minute when time changes, check if tasks need soft update
  if (formatted !== lastFocusMinuteStr) {
    lastFocusMinuteStr = formatted;
    const modal = document.getElementById('taskDetailModal');
    const isModalOpen = modal && modal.classList.contains('active');
    const isDragging = document.querySelector('.dragging') !== null;
    if (!isModalOpen && !isDragging && typeof renderTasks === 'function') {
      if (typeof autoArchivePastDays === 'function') autoArchivePastDays();
      renderTasks();
    }
  }
}, 10000);


