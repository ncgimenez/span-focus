// ==============================================================
// SPAN FOCUS - TASKS RENDERING & DOM BUILDER ENGINE
// ==============================================================

function renderTitleWithTags(titleStr) {
  if (!titleStr) return 'Untitled Task';
  return titleStr.replace(/#([\w\-]+)/g, (match, tag) => {
    return `<span class="task-inline-tag" onclick="event.stopPropagation(); setTagFilter('${tag}')">#${tag}</span>`;
  });
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

  updateFocusHideActionsToggleUI();

  const elAll = document.getElementById('inboxCountAll');
  if (elAll) elAll.textContent = focusHideActionsInAll ? countOther : allBacklogItems.length;
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
    const act = getTaskActionType(t);
    if (activeInboxActionFilter === 'all') {
      if (focusHideActionsInAll) {
        return act === 'other';
      }
      return true;
    }
    return act === activeInboxActionFilter;
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
      const totalCategorized = countCall + countMail + countPay;
      let emptyText = emptyMessages[activeInboxActionFilter] || 'Inbox is empty';
      let emptySub = activeInboxActionFilter === 'all' ? 'Drop tasks here or use input above to add' : 'Cliquez sur "Tous" pour voir l\'ensemble de l\'inbox';
      let quickPillsHtml = '';

      if (activeInboxActionFilter === 'all' && focusHideActionsInAll && totalCategorized > 0) {
        emptyText = 'Aucune tâche standard en attente';
        emptySub = `${totalCategorized} action(s) masquée(s) de "Tous" :`;
        quickPillsHtml = `
          <div style="display: flex; gap: 6px; justify-content: center; margin-top: 8px; flex-wrap: wrap;">
            ${countCall > 0 ? `<button type="button" class="inbox-filter-pill" onclick="setInboxActionFilter('call')" style="font-size:11px; padding:3px 8px;">📞 ${countCall} Calls</button>` : ''}
            ${countMail > 0 ? `<button type="button" class="inbox-filter-pill" onclick="setInboxActionFilter('mail')" style="font-size:11px; padding:3px 8px;">✉️ ${countMail} Mails</button>` : ''}
            ${countPay > 0 ? `<button type="button" class="inbox-filter-pill" onclick="setInboxActionFilter('pay')" style="font-size:11px; padding:3px 8px;">💳 ${countPay} Pay</button>` : ''}
          </div>
        `;
      }

      backlogList.innerHTML = `
        <li class="backlog-empty-state">
          <span class="backlog-empty-icon">${activeInboxActionFilter === 'call' ? '📞' : (activeInboxActionFilter === 'mail' ? '✉️' : (activeInboxActionFilter === 'pay' ? '💳' : '📦'))}</span>
          <span class="backlog-empty-text">${emptyText}</span>
          <span class="backlog-empty-sub">${emptySub}</span>
          ${quickPillsHtml}
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
    // Action Type Badge (Calls / Mails / Paiements) - Clic = changer d'action, Shift-Clic = filtrer
    const actionType = getTaskActionType(task);
    let actionBadge = '';
    if (actionType === 'call') {
      actionBadge = `<span class="task-action-tag-badge action-call" onclick="event.stopPropagation(); cycleFocusTaskAction('${task.id}')" title="Action: Call (cliquer pour changer)">📞 Call</span>`;
    } else if (actionType === 'mail') {
      actionBadge = `<span class="task-action-tag-badge action-mail" onclick="event.stopPropagation(); cycleFocusTaskAction('${task.id}')" title="Action: Mail (cliquer pour changer)">✉️ Mail</span>`;
    } else if (actionType === 'pay') {
      actionBadge = `<span class="task-action-tag-badge action-pay" onclick="event.stopPropagation(); cycleFocusTaskAction('${task.id}')" title="Action: Paiement (cliquer pour changer)">💳 Pay</span>`;
    } else {
      actionBadge = `<span class="task-action-tag-badge action-none" onclick="event.stopPropagation(); cycleFocusTaskAction('${task.id}')" title="Définir une action (Call, Mail, Pay)">+ Action</span>`;
    }

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
                  <div class="dropdown-action-picker">
                    <span class="dropdown-section-title">Type d'action :</span>
                    <div class="dropdown-action-btns">
                      <button class="btn-dropdown-action ${task.actionType === 'call' ? 'active' : ''}" type="button" onclick="event.stopPropagation(); setFocusTaskAction('${task.id}', 'call')">📞 Call</button>
                      <button class="btn-dropdown-action ${task.actionType === 'mail' ? 'active' : ''}" type="button" onclick="event.stopPropagation(); setFocusTaskAction('${task.id}', 'mail')">✉️ Mail</button>
                      <button class="btn-dropdown-action ${task.actionType === 'pay' ? 'active' : ''}" type="button" onclick="event.stopPropagation(); setFocusTaskAction('${task.id}', 'pay')">💳 Pay</button>
                      <button class="btn-dropdown-action ${task.actionType === 'other' ? 'active' : ''}" type="button" onclick="event.stopPropagation(); setFocusTaskAction('${task.id}', 'other')">📦 Standard</button>
                      <button class="btn-dropdown-action ${!task.actionType ? 'active' : ''}" type="button" onclick="event.stopPropagation(); setFocusTaskAction('${task.id}', 'auto')">⚡ Auto</button>
                    </div>
                  </div>
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

function renderPickerRow(t) {
  return `
    <div class="task-picker-item" onclick="selectPickerTask('${t.id}')">
      <span>${t.isFavorite ? '⭐ ' : ''}${t.title}</span>
      <span style="color:var(--cat-${(t.category || 'work').toLowerCase()}); font-weight:600;">${t.category}</span>
    </div>
  `;
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

