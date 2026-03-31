let tasks          = [];
let filterStatus   = "all";   // "all" | "active" | "done" | "overdue"
let filterPriority = "all";   // "all" | "high" | "medium" | "low"
let searchQuery    = "";       // 实时搜索关键词（小写）
let sortOrder      = "created"; // "created" | "dueDate" | "priority"
let savedViews     = [];       // 收藏视图列表
let activeViewId   = null;     // 当前激活的视图 id
let currentView    = "list";   // "list" | "kanban"
let dragSrcId      = null;     // 当前正在拖拽的任务 id

const taskInput      = document.getElementById("taskInput");
const dueDateInput   = document.getElementById("dueDateInput");
const prioritySelect = document.getElementById("prioritySelect");
const container      = document.getElementById("taskContainer");
const emptyTip       = document.getElementById("emptyTip");
const todayLabel     = document.getElementById("todayLabel");
const errorTip       = document.getElementById("errorTip");
const globalStats    = document.getElementById("globalStats");
const searchInput    = document.getElementById("searchInput");
const searchClear    = document.getElementById("searchClear");
const sortSelect     = document.getElementById("sortSelect");

let errorTimer = null;

const todayStr = getTodayStr();
todayLabel.textContent = "今天是 " + toDisplayDate(todayStr);

taskInput.addEventListener("keydown", e => {
  if (e.key === "Enter") addTask();
});

/* ── localStorage ── */
function saveTasks() {
  localStorage.setItem("checkly-tasks", JSON.stringify(tasks));
}
function loadTasks() {
  const saved = localStorage.getItem("checkly-tasks");
  tasks = saved ? JSON.parse(saved) : [];
}

function persistViews() {
  localStorage.setItem("checkly-views", JSON.stringify(savedViews));
}
function loadViews() {
  const saved = localStorage.getItem("checkly-views");
  savedViews = saved ? JSON.parse(saved) : [];
}

/* ── 工具函数 ── */
function getTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDaysRemaining(dueDateStr) {
  if (!dueDateStr) return null;
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const [dy, dm, dd] = dueDateStr.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  const due   = new Date(dy, dm - 1, dd);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

function getDueBadgeInfo(days, done) {
  if (days === null) return null;
  if (done) return null;
  if (days < 0)   return { text: `已过期 ${Math.abs(days)} 天`, cls: "overdue" };
  if (days === 0) return { text: "今天截止",              cls: "today"  };
  if (days <= 3)  return { text: `还剩 ${days} 天`,       cls: "soon"   };
  return                 { text: `还剩 ${days} 天`,       cls: "normal" };
}

function toDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${y} 年 ${m} 月 ${d} 日  ${weekNames[date.getDay()]}`;
}

/* ── 筛选：切换状态按钮高亮 ── */
function setStatusFilter(value) {
  filterStatus = value;
  document.querySelectorAll(".filter-btn[data-group='status']").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
  applyFilter();
}

function setPriorityFilter(value) {
  filterPriority = value;
  document.querySelectorAll(".filter-btn[data-group='priority']").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.value === value);
  });
  applyFilter();
}

/* ── 收藏视图 ── */
function saveCurrentView() {
  const auto = [
    { all:"全部", active:"未完成", done:"已完成", overdue:"已过期" }[filterStatus],
    filterPriority !== "all" ? ({ high:"高优先", medium:"中优先", low:"低优先" }[filterPriority]) : null,
    searchQuery ? `"${searchQuery}"` : null,
  ].filter(Boolean).join(" · ") || "我的视图";

  const name = window.prompt("视图名称", auto);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) return;

  const view = { id: Date.now(), name: trimmed,
    status: filterStatus, priority: filterPriority,
    search: searchQuery,  sort: sortOrder };
  savedViews.push(view);
  persistViews();
  activeViewId = view.id;
  renderViews();
}

function applyView(id) {
  const view = savedViews.find(v => v.id === id);
  if (!view) return;

  filterStatus   = view.status;
  filterPriority = view.priority;
  searchQuery    = view.search || "";
  sortOrder      = view.sort   || "created";

  document.querySelectorAll(".filter-btn[data-group='status']")
    .forEach(b => b.classList.toggle("active", b.dataset.value === filterStatus));
  document.querySelectorAll(".filter-btn[data-group='priority']")
    .forEach(b => b.classList.toggle("active", b.dataset.value === filterPriority));
  searchInput.value = searchQuery;
  searchClear.classList.toggle("visible", searchQuery.length > 0);
  sortSelect.value = sortOrder;

  applySort();
  applyFilter();
  activeViewId = id;
  renderViews();
}

function deleteView(id) {
  savedViews = savedViews.filter(v => v.id !== id);
  persistViews();
  if (activeViewId === id) activeViewId = null;
  renderViews();
}

function renderViews() {
  const list = document.getElementById("viewsList");
  list.innerHTML = "";
  savedViews.forEach(view => {
    const chip = document.createElement("span");
    chip.className = "view-chip" + (view.id === activeViewId ? " active" : "");

    const label = document.createElement("span");
    label.className = "view-chip-label";
    label.textContent = view.name;
    label.title = view.name;
    label.onclick = () => applyView(view.id);

    const del = document.createElement("button");
    del.className = "view-del";
    del.textContent = "×";
    del.title = "删除此视图";
    del.onclick = e => { e.stopPropagation(); deleteView(view.id); };

    chip.appendChild(label);
    chip.appendChild(del);
    list.appendChild(chip);
  });
}

/* ── 搜索 ── */
function handleSearch() {
  searchQuery = searchInput.value.trim().toLowerCase();
  searchClear.classList.toggle("visible", searchQuery.length > 0);
  applyFilter();
}

function clearSearch() {
  searchInput.value = "";
  searchQuery = "";
  searchClear.classList.remove("visible");
  searchInput.focus();
  applyFilter();
}

/* ── 排序 ── */
function handleSort() {
  sortOrder = sortSelect.value;
  applySort();
}

function applySort() {
  const priorityRank = { high: 0, medium: 1, low: 2 };

  container.querySelectorAll(".date-group").forEach(group => {
    const ul = group.querySelector("ul");
    if (!ul) return;

    const lis = [...ul.querySelectorAll("li[data-id]")];

    lis.sort((a, b) => {
      const idA  = Number(a.dataset.id);
      const idB  = Number(b.dataset.id);
      const taskA = tasks.find(t => t.id === idA);
      const taskB = tasks.find(t => t.id === idB);
      if (!taskA || !taskB) return 0;

      if (sortOrder === "created") {
        return idA - idB;                              // 按创建时间升序
      } else if (sortOrder === "dueDate") {
        const dA = taskA.dueDate || "9999-99-99";      // 无截止日期排最后
        const dB = taskB.dueDate || "9999-99-99";
        return dA.localeCompare(dB);
      } else if (sortOrder === "priority") {
        const rA = priorityRank[taskA.priority] ?? 1;
        const rB = priorityRank[taskB.priority] ?? 1;
        return rA - rB;                                // 高 > 中 > 低
      }
      return 0;
    });

    // 仅移动 li 顺序，不重建元素
    lis.forEach(li => ul.appendChild(li));
  });
}

/* ── 筛选：显示/隐藏 li 和空日期组 ── */
function applyFilter() {
  let visibleCount = 0;

  tasks.forEach(task => {
    const li = document.querySelector(`li[data-id="${task.id}"]`);
    if (!li) return;

    const taskDays = getDaysRemaining(task.dueDate);
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "done"    &&  task.done) ||
      (filterStatus === "active"  && !task.done) ||
      (filterStatus === "overdue" && !task.done && taskDays !== null && taskDays < 0);

    const matchPriority =
      filterPriority === "all" || task.priority === filterPriority;

    const matchSearch =
      !searchQuery || task.text.toLowerCase().includes(searchQuery);

    const visible = matchStatus && matchPriority && matchSearch;
    li.classList.toggle("filter-hidden", !visible);
    if (visible) visibleCount++;
  });

  // 日期组内全部被隐藏则隐藏整组标题
  container.querySelectorAll(".date-group").forEach(group => {
    const anyVisible = [...group.querySelectorAll("li")]
      .some(li => !li.classList.contains("filter-hidden"));
    group.classList.toggle("filter-hidden", !anyVisible);
  });

  // 空状态提示
  if (tasks.length === 0) {
    showEmptyState("no-tasks");
  } else if (visibleCount === 0) {
    showEmptyState("no-match");
  } else {
    emptyTip.style.display = "none";
  }
}

/* ── 填充截止日期区域（日期 + 剩余天数标签 + 编辑按钮）── */
function fillDueContainer(container, task) {
  container.innerHTML = "";
  const taskId = task.id;

  // 截止日期文字（M/D 格式）
  if (task.dueDate) {
    const [, dm, dd] = task.dueDate.split("-").map(Number);
    const dateLabel = document.createElement("span");
    dateLabel.className = "due-date-label";
    dateLabel.textContent = `${dm}/${dd}`;
    container.appendChild(dateLabel);
  }

  // 剩余/过期天数标签
  const badgeInfo = getDueBadgeInfo(getDaysRemaining(task.dueDate), task.done);
  if (badgeInfo) {
    const badge = document.createElement("span");
    badge.className = `due-badge ${badgeInfo.cls}`;
    badge.textContent = badgeInfo.text;
    container.appendChild(badge);
  }

  // 编辑按钮（hover 可见）
  const editBtn = document.createElement("button");
  editBtn.className = "btn-edit-due";
  editBtn.textContent = "✎";
  editBtn.title = "修改截止日期";
  editBtn.onclick = e => { e.stopPropagation(); openDueDateEditor(taskId, container); };
  container.appendChild(editBtn);
}

/* ── 打开内联截止日期编辑 ── */
function openDueDateEditor(id, container) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  container.innerHTML = "";
  const input = document.createElement("input");
  input.type = "date";
  input.className = "due-date-input-inline";
  input.value = task.dueDate || "";

  let saved = false;

  const commit = () => {
    if (saved) return;
    saved = true;
    updateTaskDueDate(id, input.value || null);
  };

  input.onchange  = commit;
  input.onkeydown = e => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") { saved = true; fillDueContainer(container, task); }
  };
  input.onblur = () => { if (!saved) setTimeout(() => { const t = tasks.find(t => t.id === id); if (t) fillDueContainer(container, t); }, 150); };

  container.appendChild(input);
  input.focus();
}

/* ── 保存修改后的截止日期 ── */
function updateTaskDueDate(id, newDueDate) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.dueDate = newDueDate || null;
  saveTasks();

  const container = document.querySelector(`.due-container[data-task-id="${id}"]`);
  if (container) fillDueContainer(container, task);

  const li = document.querySelector(`li[data-id="${id}"]`);
  if (li) {
    const days = getDaysRemaining(task.dueDate);
    li.classList.toggle("overdue-task", days !== null && days < 0 && !task.done);
  }
  applyFilter();
}

/* ── 空输入提示 ── */
function showError() {
  taskInput.classList.remove("shake");
  void taskInput.offsetWidth;
  taskInput.classList.add("shake");
  errorTip.classList.add("visible");
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => errorTip.classList.remove("visible"), 2500);
}

/* ── 创建单个任务 li 元素 ── */
function createTaskLi(task, isNew = false) {
  const li = document.createElement("li");
  li.dataset.id = task.id;

  const classes = [];
  if (isNew) classes.push("new-item");
  if (task.done) classes.push("done-item");

  const days = getDaysRemaining(task.dueDate);
  if (days !== null && days < 0 && !task.done) classes.push("overdue-task");

  if (classes.length) li.className = classes.join(" ");

  const bar = document.createElement("div");
  bar.className = `priority-bar ${task.priority || "medium"}`;

  const checkbox = document.createElement("div");
  checkbox.className = "checkbox" + (task.done ? " checked" : "");
  checkbox.onclick = () => toggleDone(task.id);

  const span = document.createElement("span");
  span.className = "task-text" + (task.done ? " done" : "");
  span.textContent = task.text;

  const delBtn = document.createElement("button");
  delBtn.className = "btn-delete";
  delBtn.textContent = "×";
  delBtn.title = "删除";
  delBtn.onclick = () => deleteTask(task.id);

  // 截止日期容器（含日期文字 + 剩余标签 + 编辑按钮）
  const dueContainer = document.createElement("span");
  dueContainer.className = "due-container";
  dueContainer.dataset.taskId = task.id;
  fillDueContainer(dueContainer, task);

  li.appendChild(bar);
  li.appendChild(checkbox);
  li.appendChild(span);

  // AI 分析转圈（默认隐藏，analyzeTaskWithAI 时显示）
  const aiDot = document.createElement("span");
  aiDot.className    = "ai-pending-dot";
  aiDot.title        = "AI 分析中…";
  aiDot.style.display = "none";
  li.appendChild(aiDot);

  // 分类标签（已分析过的任务直接渲染）
  if (task.category) {
    const catMap  = { work:"工作", study:"学习", life:"生活", other:"其他" };
    const catBadge = document.createElement("span");
    catBadge.className   = `category-badge ${task.category}`;
    catBadge.textContent = catMap[task.category] || task.category;
    catBadge.title       = "点击切换分类";
    catBadge.onclick     = () => cycleCategory(task.id);
    li.appendChild(catBadge);
  }

  // 预估用时（已分析过的任务直接渲染）
  if (task.estimatedMinutes) {
    const estBadge = document.createElement("span");
    estBadge.className   = "estimate-badge";
    estBadge.textContent = `⏱ ${task.estimatedMinutes}m`;
    li.appendChild(estBadge);
  }

  // 备注/描述图标（notes 来自旧数据，description 来自 AI 拆解）
  const noteText = task.notes || task.description;
  if (noteText) {
    const noteIcon = document.createElement("span");
    noteIcon.className   = "note-icon";
    noteIcon.textContent = "📝";
    noteIcon.title       = noteText;
    li.appendChild(noteIcon);
  }

  li.appendChild(dueContainer);
  li.appendChild(delBtn);
  return li;
}

/* ── 更新全局统计栏 ── */
function updateGlobalStats() {
  const totalDone = tasks.filter(t => t.done).length;
  if (tasks.length === 0) {
    globalStats.innerHTML = "";
    showEmptyState("no-tasks");
  } else {
    emptyTip.style.display = "none";
    globalStats.innerHTML =
      `<span class="g-done">已完成 ${totalDone}</span>` +
      `<span class="g-sep">/</span>` +
      `<span class="g-total">共 ${tasks.length} 条</span>`;
  }
}

/* ── 更新某日期组的统计标签；若组内清空则淡出整组 ── */
function updateGroupStats(dateStr) {
  const groupEl = container.querySelector(`.date-group[data-date="${dateStr}"]`);
  if (!groupEl) return;

  const groupTasks = tasks.filter(t => t.date === dateStr);
  if (groupTasks.length === 0) {
    groupEl.classList.add("removing-group");
    groupEl.addEventListener("animationend", () => groupEl.remove(), { once: true });
    return;
  }

  const doneCount    = groupTasks.filter(t => t.done).length;
  const pendingCount = groupTasks.length - doneCount;
  const statsEl = groupEl.querySelector(".date-stats");
  statsEl.innerHTML = "";

  if (doneCount > 0) {
    const sd = document.createElement("span");
    sd.className = "stat-done";
    sd.textContent = `✓ 已完成 ${doneCount}`;
    statsEl.appendChild(sd);
  }
  if (pendingCount > 0) {
    const sp = document.createElement("span");
    sp.className = "stat-pending";
    sp.textContent = `○ 未完成 ${pendingCount}`;
    statsEl.appendChild(sp);
  }
}

/* ── 找到或新建日期分组（按日期降序排列）── */
function getOrCreateDateGroup(dateStr) {
  let groupEl = container.querySelector(`.date-group[data-date="${dateStr}"]`);
  if (groupEl) return groupEl;

  groupEl = document.createElement("div");
  groupEl.className = "date-group";
  groupEl.dataset.date = dateStr;

  const header = document.createElement("div");
  header.className = "date-header";

  const titleEl = document.createElement("span");
  titleEl.className = "date-title";
  titleEl.textContent = toDisplayDate(dateStr);

  const statsDiv = document.createElement("div");
  statsDiv.className = "date-stats";

  header.appendChild(titleEl);
  header.appendChild(statsDiv);

  const ul = document.createElement("ul");
  groupEl.appendChild(header);
  groupEl.appendChild(ul);

  // 按日期降序插入到正确位置
  const existing = [...container.querySelectorAll(".date-group")];
  const insertBefore = existing.find(g => g.dataset.date < dateStr);
  if (insertBefore) {
    container.insertBefore(groupEl, insertBefore);
  } else {
    container.appendChild(groupEl);
  }

  return groupEl;
}

/* ── 添加任务（直接追加到 DOM，不重渲全部）── */
function addTask() {
  const text = taskInput.value.trim();
  if (!text) { showError(); taskInput.focus(); return; }

  const catSelect = document.getElementById("categorySelect");
  const newTask = {
    id:       Date.now(),
    text,
    date:     getTodayStr(),
    dueDate:  dueDateInput.value || null,
    done:     false,
    priority: prioritySelect.value,
    status:   "todo",
    category: catSelect.value || null,
  };
  tasks.push(newTask);
  saveTasks();

  taskInput.value  = "";
  catSelect.value  = "";
  taskInput.focus();

  // 直接向对应日期组追加 li，其他元素完全不动
  const groupEl = getOrCreateDateGroup(newTask.date);
  const ul = groupEl.querySelector("ul");
  ul.appendChild(createTaskLi(newTask, true));  // true = 淡入动画

  updateGroupStats(newTask.date);
  updateGlobalStats();
  applySort();
  applyFilter();
  if (currentView === "kanban")   renderKanban();
  if (currentView === "timeline") renderTimeline();

  // 触发 AI 智能分类（异步，不阻塞主流程）
  const newLi = ul.querySelector(`li[data-id="${newTask.id}"]`);
  const dot   = newLi?.querySelector(".ai-pending-dot");
  if (dot) dot.style.display = "";
  analyzeTaskWithAI(newTask.id);
}

/* ── 切换完成状态（就地修改 li，不重渲）── */
function toggleDone(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  // 同步看板 status 字段
  if (task.done) {
    task.status = "done";
  } else if (task.status === "done") {
    task.status = "todo";
  }
  saveTasks();

  const li = document.querySelector(`li[data-id="${id}"]`);
  if (li) {
    li.querySelector(".checkbox").className = "checkbox" + (task.done ? " checked" : "");
    li.querySelector(".task-text").className = "task-text" + (task.done ? " done" : "");

    // 已完成降低存在感；过期未完成显示红色
    li.classList.toggle("done-item", task.done);
    const d = getDaysRemaining(task.dueDate);
    li.classList.toggle("overdue-task", d !== null && d < 0 && !task.done);

    // 刷新截止日期容器（日期 + 标签 + 编辑按钮）
    const dueContainer = li.querySelector(".due-container");
    if (dueContainer) fillDueContainer(dueContainer, task);
  }

  updateGroupStats(task.date);
  updateGlobalStats();
  applyFilter();           // 完成状态变了，重新评估是否符合筛选
}

/* ── 删除任务（先播淡出动画，再从 DOM 移除）── */
function deleteTask(id) {
  const task = tasks.find(t => t.id === id);
  const li   = document.querySelector(`li[data-id="${id}"]`);

  tasks = tasks.filter(t => t.id !== id);
  saveTasks();

  if (li) {
    li.classList.add("removing");
    li.addEventListener("animationend", () => {
      li.remove();
      if (task) updateGroupStats(task.date);
      updateGlobalStats();
    }, { once: true });
  } else {
    if (task) updateGroupStats(task.date);
    updateGlobalStats();
  }
}

/* ════════════════════════════════
   视图切换
   ════════════════════════════════ */
function switchView(view) {
  currentView = view;
  document.querySelectorAll(".view-btn")
    .forEach(b => b.classList.toggle("active", b.dataset.view === view));

  const listViewEl  = document.getElementById("listView");
  const kanbanEl    = document.getElementById("kanbanContainer");
  const timelineEl  = document.getElementById("timelineContainer");
  const containerEl = document.querySelector(".container");

  listViewEl.style.display  = view === "list"     ? ""     : "none";
  kanbanEl.style.display    = view === "kanban"   ? "flex" : "none";
  timelineEl.style.display  = view === "timeline" ? ""     : "none";
  containerEl.classList.toggle("kanban-active", view === "kanban");

  if (view === "kanban")   renderKanban();
  if (view === "timeline") renderTimeline();
}

/* ── 读取任务的看板状态（兼容旧数据）── */
function getTaskStatus(task) {
  if (task.status) return task.status;
  return task.done ? "done" : "todo";
}

/* ── 渲染看板（全量，点击箭头后刷新）── */
function renderKanban() {
  const kanbanEl = document.getElementById("kanbanContainer");
  kanbanEl.innerHTML = "";

  const cols = [
    { status: "todo",       label: "待开始" },
    { status: "inProgress", label: "进行中" },
    { status: "done",       label: "已完成" },
  ];

  cols.forEach(col => {
    const colTasks = tasks.filter(t => getTaskStatus(t) === col.status);

    const colEl = document.createElement("div");
    colEl.className = "kanban-col";
    colEl.dataset.status = col.status;

    const header = document.createElement("div");
    header.className = "kanban-col-header";

    const title = document.createElement("span");
    title.className = "kanban-col-title";
    title.textContent = col.label;

    const count = document.createElement("span");
    const overWip = colTasks.length > 5;
    count.className = "kanban-col-count" + (overWip ? " wip-warning" : "");
    count.textContent = colTasks.length;
    if (overWip) count.title = "超出建议上限（WIP Limit: 5）";

    header.appendChild(title);
    header.appendChild(count);

    const body = document.createElement("div");
    body.className = "kanban-col-body";
    colTasks.forEach(task => body.appendChild(createKanbanCard(task)));

    // 拖放落点
    body.addEventListener("dragover",  e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    body.addEventListener("dragenter", e => { e.preventDefault(); body.classList.add("drag-over"); });
    body.addEventListener("dragleave", e => { if (!body.contains(e.relatedTarget)) body.classList.remove("drag-over"); });
    body.addEventListener("drop", e => {
      e.preventDefault();
      body.classList.remove("drag-over");
      const id = Number(e.dataTransfer.getData("text/plain"));
      if (id) moveTaskToColumn(id, col.status);
    });

    colEl.appendChild(header);
    colEl.appendChild(body);
    kanbanEl.appendChild(colEl);
  });
}

/* ── 创建看板卡片 ── */
function createKanbanCard(task) {
  const status = getTaskStatus(task);

  const card = document.createElement("div");
  card.className = "kanban-card";
  card.dataset.id = task.id;
  card.draggable = true;

  card.addEventListener("dragstart", e => {
    dragSrcId = task.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(task.id));
    // rAF：等浏览器截完拖影再加半透明，避免鬼影也变透明
    requestAnimationFrame(() => card.classList.add("dragging"));
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    dragSrcId = null;
    document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
  });

  const bar = document.createElement("div");
  bar.className = `kanban-priority-bar ${task.priority || "medium"}`;

  const body = document.createElement("div");
  body.className = "kanban-card-body";

  const title = document.createElement("div");
  title.className = "kanban-card-title";
  title.textContent = task.text;
  body.appendChild(title);

  if (task.dueDate) {
    const days = getDaysRemaining(task.dueDate);
    const [, dm, dd] = task.dueDate.split("-").map(Number);
    const badgeInfo  = getDueBadgeInfo(days, task.done);

    const dueEl = document.createElement("div");
    dueEl.className = "kanban-card-due" + (badgeInfo ? " " + badgeInfo.cls : "");
    dueEl.textContent = `📅 ${dm}/${dd}` + (badgeInfo ? "  " + badgeInfo.text : "");
    body.appendChild(dueEl);
  }

  const actions = document.createElement("div");
  actions.className = "kanban-card-actions";

  const prevBtn = document.createElement("button");
  prevBtn.className = "kanban-move-btn";
  prevBtn.textContent = "←";
  prevBtn.disabled = (status === "todo");
  prevBtn.title = "向左移动";
  prevBtn.onclick = () => moveTaskStatus(task.id, -1);

  const nextBtn = document.createElement("button");
  nextBtn.className = "kanban-move-btn";
  nextBtn.textContent = "→";
  nextBtn.disabled = (status === "done");
  nextBtn.title = "向右移动";
  nextBtn.onclick = () => moveTaskStatus(task.id, 1);

  actions.appendChild(prevBtn);
  actions.appendChild(nextBtn);
  body.appendChild(actions);

  card.appendChild(bar);
  card.appendChild(body);
  return card;
}

/* ── 拖拽落定：移动任务到指定列 ── */
function moveTaskToColumn(id, newStatus) {
  const task = tasks.find(t => t.id === id);
  if (!task || getTaskStatus(task) === newStatus) return;

  task.status = newStatus;
  task.done   = (newStatus === "done");
  saveTasks();
  renderKanban();
  updateGlobalStats();
}

/* ── 更新看板各列的任务计数徽章（不重建整个看板）── */
function updateKanbanCounts() {
  ["todo", "inProgress", "done"].forEach(status => {
    const col   = document.querySelector(`.kanban-col[data-status="${status}"]`);
    const badge = col?.querySelector(".kanban-col-count");
    if (!badge) return;
    const n = tasks.filter(t => getTaskStatus(t) === status).length;
    badge.textContent = n;
    badge.className   = "kanban-col-count" + (n > 5 ? " wip-warning" : "");
  });
}

/* ── 按钮移动任务到相邻列（带滑动动画）── */
function moveTaskStatus(id, dir) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const stages = ["todo", "inProgress", "done"];
  const cur    = getTaskStatus(task);
  const newIdx = stages.indexOf(cur) + dir;
  if (newIdx < 0 || newIdx >= stages.length) return;

  const newStatus     = stages[newIdx];
  const card          = document.querySelector(`.kanban-card[data-id="${id}"]`);
  const targetColBody = document.querySelector(`.kanban-col[data-status="${newStatus}"] .kanban-col-body`);

  // 若找不到 DOM 元素（如从时间轴调用），走全量刷新兜底
  if (!card || !targetColBody) {
    task.status = newStatus;
    task.done   = (newStatus === "done");
    saveTasks();
    renderKanban();
    updateGlobalStats();
    return;
  }

  // ① 卡片飞出当前列
  card.style.transition = "opacity 0.22s ease, transform 0.22s ease";
  card.style.opacity    = "0";
  card.style.transform  = dir > 0
    ? "translateX(52px) scale(0.93)"
    : "translateX(-52px) scale(0.93)";

  setTimeout(() => {
    // ② 更新数据
    task.status = newStatus;
    task.done   = (newStatus === "done");
    saveTasks();

    // ③ 从原列移除，更新计数
    card.remove();
    updateKanbanCounts();

    // ④ 新卡片从对侧飞入目标列
    const newCard = createKanbanCard(task);
    newCard.style.transition = "none";
    newCard.style.opacity    = "0";
    newCard.style.transform  = dir > 0
      ? "translateX(-52px) scale(0.93)"
      : "translateX(52px) scale(0.93)";
    targetColBody.appendChild(newCard);

    // 强制回流后启动入场动画
    newCard.getBoundingClientRect();
    newCard.style.transition = "opacity 0.28s ease, transform 0.28s ease";
    newCard.style.opacity    = "1";
    newCard.style.transform  = "translateX(0) scale(1)";

    updateKanbanCounts();
    updateGlobalStats();
  }, 240);
}

/* ── 初始全量渲染（仅页面首次加载时调用）── */
function render() {
  container.innerHTML = "";

  const totalDone = tasks.filter(t => t.done).length;
  if (tasks.length === 0) {
    globalStats.innerHTML = "";
    showEmptyState("no-tasks");
    return;
  }
  emptyTip.style.display = "none";
  globalStats.innerHTML =
    `<span class="g-done">已完成 ${totalDone}</span>` +
    `<span class="g-sep">/</span>` +
    `<span class="g-total">共 ${tasks.length} 条</span>`;

  const groups = {};
  tasks.forEach(t => {
    if (!groups[t.date]) groups[t.date] = [];
    groups[t.date].push(t);
  });

  Object.keys(groups)
    .sort((a, b) => b.localeCompare(a))
    .forEach(date => {
      const items        = groups[date];
      const doneCount    = items.filter(t => t.done).length;
      const pendingCount = items.length - doneCount;

      const group = document.createElement("div");
      group.className  = "date-group";
      group.dataset.date = date;           // ← 必须标记，供后续查找

      const header = document.createElement("div");
      header.className = "date-header";

      const titleEl = document.createElement("span");
      titleEl.className = "date-title";
      titleEl.textContent = toDisplayDate(date);

      const statsDiv = document.createElement("div");
      statsDiv.className = "date-stats";

      if (doneCount > 0) {
        const sd = document.createElement("span");
        sd.className = "stat-done";
        sd.textContent = `✓ 已完成 ${doneCount}`;
        statsDiv.appendChild(sd);
      }
      if (pendingCount > 0) {
        const sp = document.createElement("span");
        sp.className = "stat-pending";
        sp.textContent = `○ 未完成 ${pendingCount}`;
        statsDiv.appendChild(sp);
      }

      header.appendChild(titleEl);
      header.appendChild(statsDiv);

      const ul = document.createElement("ul");
      items.forEach(task => ul.appendChild(createTaskLi(task, false)));

      group.appendChild(header);
      group.appendChild(ul);
      container.appendChild(group);
    });
}

/* ════════════════════════════════
   时间轴视图
   ════════════════════════════════ */
function renderTimeline() {
  const el = document.getElementById("timelineContainer");
  el.innerHTML = "";

  // 按截止日期分组，无截止日期单独收集
  const groups = {};
  const noDue  = [];
  tasks.forEach(t => {
    if (t.dueDate) {
      (groups[t.dueDate] = groups[t.dueDate] || []).push(t);
    } else {
      noDue.push(t);
    }
  });

  const dates = Object.keys(groups).sort();   // 日期升序

  if (dates.length === 0 && noDue.length === 0) {
    const tip = document.createElement("p");
    tip.className = "empty-tip";
    tip.style.display = "block";
    tip.textContent = "还没有任务，快添加一条吧！";
    el.appendChild(tip);
    return;
  }

  const total = dates.length + (noDue.length > 0 ? 1 : 0);
  let   idx   = 0;

  dates.forEach(date => {
    const isToday = date === todayStr;
    const isPast  = date < todayStr;
    el.appendChild(buildTlItem(date, groups[date], isToday, isPast, ++idx === total));
  });

  if (noDue.length > 0) {
    el.appendChild(buildTlItem(null, noDue, false, false, true));
  }
}

function buildTlItem(date, itemTasks, isToday, isPast, isLast) {
  const wrap = document.createElement("div");
  wrap.className = "timeline-item" +
    (isToday ? " tl-today" : "") + (isPast ? " tl-past" : "");

  // 左：圆点 + 竖线
  const marker = document.createElement("div");
  marker.className = "tl-marker";

  const dot = document.createElement("div");
  dot.className = "tl-dot" + (isToday ? " today" : "") + (isPast ? " past" : "");

  const line = document.createElement("div");
  line.className = "tl-line";
  if (isLast) line.style.visibility = "hidden";

  marker.appendChild(dot);
  marker.appendChild(line);

  // 右：日期标题 + 任务卡片
  const content = document.createElement("div");
  content.className = "tl-content";

  const label = document.createElement("div");
  label.className = "tl-date-label" +
    (isToday      ? " today"  : "") +
    (isPast       ? " past"   : "") +
    (date === null ? " no-due" : "");
  label.textContent = date === null  ? "无截止日期"
                    : isToday        ? "今天  ·  " + formatTlDate(date)
                    :                  formatTlDate(date);
  content.appendChild(label);

  const cards = document.createElement("div");
  cards.className = "tl-cards";
  itemTasks.forEach(t => cards.appendChild(createTlCard(t)));
  content.appendChild(cards);

  wrap.appendChild(marker);
  wrap.appendChild(content);
  return wrap;
}

function formatTlDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const w = ["周日","周一","周二","周三","周四","周五","周六"][new Date(y, m-1, d).getDay()];
  return `${m} 月 ${d} 日  ${w}`;
}

function createTlCard(task) {
  const card = document.createElement("div");
  card.className = "tl-card";

  const bar = document.createElement("div");
  bar.className = `tl-priority-bar ${task.priority || "medium"}`;

  const body = document.createElement("div");
  body.className = "tl-card-body";

  const title = document.createElement("span");
  title.className = "tl-card-title" + (task.done ? " done" : "");
  title.textContent = task.text;

  const st = getTaskStatus(task);
  const badge = document.createElement("span");
  badge.className = `tl-status-badge ${st}`;
  badge.textContent = ({ todo:"待开始", inProgress:"进行中", done:"已完成" })[st] || "待开始";

  body.appendChild(title);
  body.appendChild(badge);
  card.appendChild(bar);
  card.appendChild(body);
  return card;
}

/* ════════════════════════════════
   AI 拆解任务
   ════════════════════════════════ */
/* ════════════════════════════════
   自然语言解析添加任务
   ════════════════════════════════ */
const AI_URL    = "https://api.deepseek.com/v1/chat/completions";
const AI_KEY    = "sk-604609d1f9064367815c83b1a2a2c7bf";
const AI_MODEL  = "deepseek-chat";
const AI_SYSTEM = "你是一个任务拆解助手。用户会给你一个粗略目标，请拆解成 3-5 个具体可执行的子任务。严格返回 JSON 数组格式：[{\"title\": string, \"description\": string, \"priority\": \"high\"|\"medium\"|\"low\", \"estimatedMinutes\": number}]。不要返回 JSON 以外的任何文字。title 要简洁，description 要具体说明任务内容。";
// {TODAY} 在调用时替换为当天日期，让 AI 推算合理截止日
const AI_CLASSIFY_SYSTEM = "你是一个任务分析助手。今天是 {TODAY}。用户给你一条任务描述，请分析并严格返回如下 JSON（不要有其他文字）：{\"priority\":\"high|medium|low\",\"category\":\"work|study|life|other\",\"estimatedMinutes\":number,\"dueDate\":\"YYYY-MM-DD或null\"}。截止日期规则：紧急任务1-3天内，普通任务1-2周内，长期任务1个月内，无法判断则返回null。只返回JSON。";

/* ── AI 智能分类（添加任务时自动触发）── */
async function analyzeTaskWithAI(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  incrementCallCount();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${AI_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: AI_CLASSIFY_SYSTEM.replace("{TODAY}", todayStr) },
          { role: "user",   content: task.text },
        ],
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) throw new Error(`${res.status}`);

    const data    = await res.json();
    const raw     = data.choices?.[0]?.message?.content ?? "";
    const jsonStr = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
    const result  = JSON.parse(jsonStr);

    if (["high","medium","low"].includes(result.priority))                             task.priority = result.priority;
    if (!task.category && ["work","study","life","other"].includes(result.category)) task.category = result.category; // 不覆盖手动设置
    if (result.estimatedMinutes > 0)                               task.estimatedMinutes = Number(result.estimatedMinutes);
    // 写入 AI 推算的截止日期（格式校验）
    if (result.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(result.dueDate)) {
      task.dueDate = result.dueDate;
    }
    saveTasks();
    updateTaskAIDisplay(taskId);

  } catch (err) {
    console.warn("[AI Classify]", err.message);
  } finally {
    const li  = document.querySelector(`li[data-id="${taskId}"]`);
    const dot = li?.querySelector(".ai-pending-dot");
    if (dot) dot.style.display = "none";
  }
}

/* ── 把 AI 结果刷到任务 li 上 ── */
function updateTaskAIDisplay(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const li = document.querySelector(`li[data-id="${taskId}"]`);
  if (!li) {
    if (currentView === "kanban") renderKanban();
    return;
  }

  const catMap = { work:"工作", study:"学习", life:"生活", other:"其他" };

  // 刷新优先级色条
  const bar = li.querySelector(".priority-bar");
  if (bar) bar.className = `priority-bar ${task.priority || "medium"}`;

  // 更新/新建分类标签
  let catBadge = li.querySelector(".category-badge");
  if (task.category) {
    if (!catBadge) {
      catBadge = document.createElement("span");
      catBadge.title   = "点击切换分类";
      catBadge.onclick = () => cycleCategory(taskId);
      li.insertBefore(catBadge, li.querySelector(".due-container"));
    }
    catBadge.className   = `category-badge ${task.category}`;
    catBadge.textContent = catMap[task.category] || task.category;
  }

  // 更新/新建预估用时
  let estBadge = li.querySelector(".estimate-badge");
  if (task.estimatedMinutes) {
    if (!estBadge) {
      estBadge = document.createElement("span");
      estBadge.className = "estimate-badge";
      li.insertBefore(estBadge, li.querySelector(".due-container"));
    }
    estBadge.textContent = `⏱ ${task.estimatedMinutes}m`;
  }

  // 刷新截止日期容器（日期文字 + 剩余天数徽章 + 编辑按钮）
  const dueContainer = li.querySelector(`.due-container[data-task-id="${taskId}"]`);
  if (dueContainer) fillDueContainer(dueContainer, task);

  // 同步过期红边样式
  const days = getDaysRemaining(task.dueDate);
  li.classList.toggle("overdue-task", days !== null && days < 0 && !task.done);

  if (currentView === "kanban")   renderKanban();
  if (currentView === "timeline") renderTimeline();
}

/* ── 手动点击切换分类 ── */
function cycleCategory(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const cats = ["work","study","life","other"];
  task.category = cats[(cats.indexOf(task.category) + 1) % cats.length];
  saveTasks();
  updateTaskAIDisplay(taskId);
}

async function runAIDecompose() {
  const goalInput = document.getElementById("aiGoalInput");
  const aiBtn     = document.getElementById("aiBtn");
  const aiStatus  = document.getElementById("aiStatus");
  const aiResults = document.getElementById("aiResults");

  const goal = goalInput.value.trim();
  if (!goal) { goalInput.focus(); return; }

  // 进入加载状态
  aiBtn.disabled   = true;
  aiResults.innerHTML = "";
  aiStatus.className  = "";
  aiStatus.innerHTML  = 'AI 正在思考<span class="ai-dots"><span>.</span><span>.</span><span>.</span></span>';
  incrementCallCount();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const modelSelect = document.getElementById("aiModelSelect");
    const model = modelSelect ? modelSelect.value : AI_MODEL;
    console.log("[AI API] 使用模型：", model);

    const res = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${AI_KEY}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: AI_SYSTEM },
          { role: "user",   content: goal },
        ],
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) {
      let errMsg = `服务器返回 ${res.status}`;
      try {
        const errData = await res.json();
        const detail = errData?.error?.message || errData?.message || JSON.stringify(errData);
        errMsg += `：${detail}`;
      } catch {
        const errText = await res.text();
        if (errText) errMsg += `：${errText.slice(0, 300)}`;
      }
      console.error("[AI API]", errMsg);
      throw new Error(errMsg);
    }

    const data = await res.json();
    const raw  = data.choices?.[0]?.message?.content ?? "";

    // 去掉可能被包裹的 markdown 代码块
    const jsonStr = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
    const items   = JSON.parse(jsonStr);
    if (!Array.isArray(items) || items.length === 0) throw new Error("返回格式有误");

    aiStatus.className  = "";
    aiStatus.textContent = `✓ 共拆解出 ${items.length} 个子任务`;
    renderAIResults(items, aiResults);
    initChat(goal, items);

  } catch (err) {
    clearTimeout(timer);
    aiStatus.className  = "error";
    aiStatus.textContent = err.name === "AbortError"
      ? "⚠️ 请求超时，请检查网络后重试"
      : `⚠️ ${err.message}`;
  } finally {
    aiBtn.disabled = false;
  }
}

function renderAIResults(items, container) {
  container.innerHTML = "";
  items.forEach((item, i) => {
    const priority = ["high", "medium", "low"].includes(item.priority)
      ? item.priority : "medium";

    const row = document.createElement("div");
    row.className = "ai-task-item";
    row.style.animationDelay = `${i * 0.06}s`;

    const bar = document.createElement("div");
    bar.className = `ai-task-bar ${priority}`;

    const info = document.createElement("div");
    info.className = "ai-task-info";

    const title = document.createElement("div");
    title.className = "ai-task-title";
    title.textContent = item.title;
    info.appendChild(title);

    if (item.description) {
      const desc = document.createElement("div");
      desc.className = "ai-task-desc";
      desc.textContent = item.description;
      info.appendChild(desc);
    }

    if (item.estimatedMinutes) {
      const meta = document.createElement("div");
      meta.className = "ai-task-meta";
      meta.textContent = `⏱ 预计 ${item.estimatedMinutes} 分钟`;
      info.appendChild(meta);
    }

    const addBtn = document.createElement("button");
    addBtn.className = "ai-add-btn";
    addBtn.textContent = "+ 添加";
    addBtn.onclick = (e) => {
      e.stopPropagation();
      if (addBtn.disabled) return;
      openAIPopover(addBtn, { ...item, priority });
    };

    row.appendChild(bar);
    row.appendChild(info);
    row.appendChild(addBtn);
    container.appendChild(row);
  });
}

function addTaskFromAI(text, priority, description, estimatedMinutes, dueDate) {
  const newTask = {
    id:               Date.now(),
    text,
    date:             getTodayStr(),
    dueDate:          dueDate || null,
    done:             false,
    priority:         priority || "medium",
    status:           "todo",
    description:      description || null,
    estimatedMinutes: estimatedMinutes || null,
  };
  tasks.push(newTask);
  saveTasks();

  // 列表视图是增量 DOM，无论当前在哪个视图都必须更新
  const groupEl = getOrCreateDateGroup(newTask.date);
  const ul = groupEl.querySelector("ul");
  ul.appendChild(createTaskLi(newTask, true));
  updateGroupStats(newTask.date);
  applySort();
  applyFilter();

  // 当前是看板或时间轴则同步刷新
  if (currentView === "kanban")   renderKanban();
  if (currentView === "timeline") renderTimeline();
  updateGlobalStats();

  // AI 智能分类（为子任务补充 category，与手动添加行为一致）
  const newLi = ul.querySelector(`li[data-id="${newTask.id}"]`);
  const dot   = newLi?.querySelector(".ai-pending-dot");
  if (dot) dot.style.display = "";
  analyzeTaskWithAI(newTask.id);
}

/* ════════════════════════════════
   AI 添加弹窗（popover）
   ════════════════════════════════ */
let _popoverItem   = null;
let _popoverAddBtn = null;

function _getOrCreatePopover() {
  let el = document.getElementById("aiAddPopover");
  if (el) return el;

  el = document.createElement("div");
  el.id = "aiAddPopover";
  el.className = "ai-add-popover";
  el.innerHTML = `
    <div class="ai-popover-task-name" id="popoverTaskName"></div>
    <div class="ai-popover-field">
      <span class="ai-popover-label">截止日期（选填）</span>
      <input type="date" class="ai-popover-input" id="popoverDueDate" />
    </div>
    <div class="ai-popover-field">
      <span class="ai-popover-label">优先级</span>
      <select class="ai-popover-select" id="popoverPriority">
        <option value="high">🔴 高优先</option>
        <option value="medium">🟡 中优先</option>
        <option value="low">🟢 低优先</option>
      </select>
    </div>
    <div class="ai-popover-actions">
      <button class="ai-popover-cancel"  id="popoverCancelBtn">取消</button>
      <button class="ai-popover-confirm" id="popoverConfirmBtn">确认添加</button>
    </div>
  `;
  document.body.appendChild(el);

  document.getElementById("popoverCancelBtn").onclick  = closeAIPopover;
  document.getElementById("popoverConfirmBtn").onclick = confirmAIPopover;

  // 点击弹窗外部关闭（capture 阶段捕获，避免被子元素阻止）
  document.addEventListener("click", e => {
    if (!el.classList.contains("visible")) return;
    if (el.contains(e.target)) return;
    if (_popoverAddBtn && _popoverAddBtn.contains(e.target)) return;
    closeAIPopover();
  }, true);

  return el;
}

function openAIPopover(btn, item) {
  const popover = _getOrCreatePopover();
  _popoverItem   = item;
  _popoverAddBtn = btn;

  document.getElementById("popoverTaskName").textContent = item.title;
  document.getElementById("popoverDueDate").value        = "";
  document.getElementById("popoverPriority").value       = item.priority || "medium";

  // 定位：出现在按钮下方，右对齐；若超出底部则显示在上方
  const rect = btn.getBoundingClientRect();
  const pw   = 248;
  let   left = rect.right - pw;
  if (left < 8) left = 8;
  let   top  = rect.bottom + 8;
  if (top + 220 > window.innerHeight) top = rect.top - 220 - 8;

  popover.style.left = `${left}px`;
  popover.style.top  = `${top}px`;
  popover.classList.add("visible");
}

function closeAIPopover() {
  const popover = document.getElementById("aiAddPopover");
  if (popover) popover.classList.remove("visible");
  _popoverItem   = null;
  _popoverAddBtn = null;
}

function confirmAIPopover() {
  if (!_popoverItem) return;

  const dueDate  = document.getElementById("popoverDueDate").value  || null;
  const priority = document.getElementById("popoverPriority").value;
  const item     = _popoverItem;
  const btn      = _popoverAddBtn;

  addTaskFromAI(item.title, priority, item.description, item.estimatedMinutes, dueDate);

  if (btn) {
    btn.textContent = "✓ 已添加";
    btn.className   = "ai-add-btn added";
    btn.disabled    = true;
  }

  closeAIPopover();
}

/* ════════════════════════════════
   AI 调用计数器
   ════════════════════════════════ */
let aiCallCount = 0;

function loadCallCount() {
  aiCallCount = Number(localStorage.getItem("checkly-ai-count") || 0);
  renderCallCount();
}

function renderCallCount() {
  const el = document.getElementById("aiCallCount");
  if (el) el.textContent = `API ${aiCallCount} 次`;
}

function incrementCallCount() {
  aiCallCount++;
  localStorage.setItem("checkly-ai-count", aiCallCount);
  const el = document.getElementById("aiCallCount");
  if (!el) return;
  renderCallCount();
  el.classList.remove("bumped");
  void el.offsetWidth;
  el.classList.add("bumped");
  setTimeout(() => el.classList.remove("bumped"), 1200);
}

/* ════════════════════════════════
   流式输出工具函数
   ════════════════════════════════ */
async function streamToEl(res, el, onDone) {
  el.classList.add("ai-streaming-cursor");
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") {
        el.classList.remove("ai-streaming-cursor");
        onDone?.(fullText);
        return;
      }
      try {
        const delta = JSON.parse(raw).choices?.[0]?.delta?.content ?? "";
        if (delta) { fullText += delta; el.textContent = fullText; }
      } catch {}
    }
  }
  el.classList.remove("ai-streaming-cursor");
  onDone?.(fullText);
}

/* ════════════════════════════════
   AI 智能提醒
   ════════════════════════════════ */
const AI_REMIND_SYSTEM = "你是一个高效工作助手，请根据用户今天的待办任务数据，用 2-3 句话给出简洁、实用的提醒和建议。语气友好，语言简洁，不要重复列举数字。";

function buildReminderContext() {
  const total       = tasks.length;
  const done        = tasks.filter(t => t.done).length;
  const highPending = tasks.filter(t => !t.done && t.priority === "high").length;
  const overdue     = tasks.filter(t => {
    const d = getDaysRemaining(t.dueDate);
    return !t.done && d !== null && d < 0;
  }).length;
  const dueToday = tasks.filter(t => {
    const d = getDaysRemaining(t.dueDate);
    return !t.done && d === 0;
  }).length;

  return `今天是 ${toDisplayDate(todayStr)}。
任务总数：${total} 条，已完成：${done} 条，未完成：${total - done} 条。
高优先级未完成：${highPending} 条。
已过期未完成：${overdue} 条。
今日截止未完成：${dueToday} 条。
请给出今日提醒和行动建议。`;
}

async function runAIReminder() {
  if (tasks.filter(t => !t.done).length === 0) return;
  const wrap = document.getElementById("aiSmartRemind");
  const text = document.getElementById("aiRemindText");

  wrap.style.display = "";
  text.textContent   = "";
  incrementCallCount();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AI_KEY}` },
      body: JSON.stringify({
        model:    AI_MODEL,
        stream:   true,
        messages: [
          { role: "system", content: AI_REMIND_SYSTEM },
          { role: "user",   content: buildReminderContext() },
        ],
        temperature: 0.6,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`服务器返回 ${res.status}`);
    await streamToEl(res, text);
  } catch (err) {
    clearTimeout(timer);
    text.textContent = err.name === "AbortError"
      ? "⚠️ 请求超时，请重试"
      : `⚠️ ${err.message}`;
    text.classList.remove("ai-streaming-cursor");
  } finally {
    /* 无按钮，无需重置 */
  }
}

function dismissReminder() {
  document.getElementById("aiSmartRemind").style.display = "none";
}

/* ════════════════════════════════
   多轮对话
   ════════════════════════════════ */
let chatHistory = [];
let chatGoal    = "";
let chatItems   = [];

const AI_CHAT_SYSTEM_TPL =
  "你是一个任务管理助手。今天是 {TODAY}。\n" +
  "用户正在分解目标：「{GOAL}」，已拆解出以下子任务：\n{SUBTASKS}\n" +
  "请根据用户的追问给出简洁、具体的建议或分析，用中文回答。";

function initChat(goal, items) {
  chatGoal    = goal;
  chatItems   = items;
  chatHistory = [];
  const msgs = document.getElementById("aiChatMessages");
  if (msgs) msgs.innerHTML = "";
  document.getElementById("aiChat").style.display = "";
}

function clearChat() {
  chatHistory = [];
  const msgs = document.getElementById("aiChatMessages");
  if (msgs) msgs.innerHTML = "";
}

function appendChatMsg(role, text) {
  const msgs = document.getElementById("aiChatMessages");
  const div = document.createElement("div");
  div.className = `ai-chat-msg ${role}`;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

async function sendChatMessage() {
  const input   = document.getElementById("aiChatInput");
  const sendBtn = document.getElementById("aiChatSend");
  const text    = input.value.trim();
  if (!text) { input.focus(); return; }

  input.value   = "";
  sendBtn.disabled = true;

  appendChatMsg("user", text);
  chatHistory.push({ role: "user", content: text });

  const aiDiv = appendChatMsg("assistant", "");

  const subtasksStr = chatItems.length
    ? chatItems.map((it, i) => `${i + 1}. ${it.title}`).join("\n")
    : "（暂无）";

  const sysPrompt = AI_CHAT_SYSTEM_TPL
    .replace("{TODAY}", todayStr)
    .replace("{GOAL}",  chatGoal)
    .replace("{SUBTASKS}", subtasksStr);

  const messages = [
    { role: "system", content: sysPrompt },
    ...chatHistory.slice(0, -1),
    { role: "user", content: text },
  ];

  incrementCallCount();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AI_KEY}` },
      body: JSON.stringify({ model: AI_MODEL, stream: true, messages, temperature: 0.7 }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`服务器返回 ${res.status}`);

    await streamToEl(res, aiDiv, fullText => {
      chatHistory.push({ role: "assistant", content: fullText });
    });
  } catch (err) {
    clearTimeout(timer);
    aiDiv.textContent = err.name === "AbortError"
      ? "⚠️ 请求超时，请重试"
      : `⚠️ ${err.message}`;
    aiDiv.classList.remove("ai-streaming-cursor");
  } finally {
    sendBtn.disabled = false;
    input.focus();
    const msgs = document.getElementById("aiChatMessages");
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }
}

/* ── 主题 ── */
function initTheme() {
  const saved = localStorage.getItem("checkly-theme") || "dark";
  const btn = document.getElementById("themeToggle");
  if (saved === "light") {
    document.body.classList.add("light");
    btn.textContent = "🌙 深色";
  } else {
    btn.textContent = "☀️ 浅色";
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle("light");
  document.getElementById("themeToggle").textContent = isLight ? "🌙 深色" : "☀️ 浅色";
  localStorage.setItem("checkly-theme", isLight ? "light" : "dark");
}

initTheme();
loadCallCount();
loadTasks();
loadViews();
render();
applySort();
applyFilter();
renderViews();
runAIReminder();

// 每分钟检查是否跨过午夜，若跨了则刷新页面更新剩余天数
setInterval(() => {
  if (getTodayStr() !== todayStr) location.reload();
}, 60 * 1000);

/* ════════════════════════════════
   数据导出 / 导入
   ════════════════════════════════ */
function exportData() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: tasks,
    views: savedViews
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `checkly-backup-${getTodayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData() {
  const input = document.createElement("input");
  input.type   = "file";
  input.accept = ".json,application/json";
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.tasks || !Array.isArray(data.tasks)) {
          alert("文件格式不正确，请选择由 Checkly 导出的备份文件。");
          return;
        }
        if (!confirm(`将导入 ${data.tasks.length} 条任务，并替换当前所有数据，确认继续？`)) return;
        tasks = data.tasks;
        savedViews = Array.isArray(data.views) ? data.views : [];
        saveTasks();
        persistViews();
        render();
        applySort();
        applyFilter();
        renderViews();
        updateGlobalStats();
        if (currentView === "kanban")   renderKanban();
        if (currentView === "timeline") renderTimeline();
      } catch {
        alert("文件解析失败，请检查文件是否损坏。");
      }
    };
    reader.readAsText(file);
  };
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

/* ════════════════════════════════
   空状态辅助
   ════════════════════════════════ */
function showEmptyState(type) {
  const icon     = document.getElementById("emptyIcon");
  const title    = document.getElementById("emptyTitle");
  const sub      = document.getElementById("emptySub");
  const clearBtn = document.getElementById("emptyClearFilter");
  if (type === "no-tasks") {
    icon.textContent  = "📋";
    title.textContent = "还没有任务，快来添加第一条吧 ✨";
    sub.textContent   = "点击上方输入框，开始规划你的一天";
    clearBtn.style.display = "none";
  } else {
    icon.textContent  = "🔍";
    title.textContent = "没有符合条件的任务";
    sub.textContent   = "试试调整筛选条件或搜索关键词";
    clearBtn.style.display = "inline-block";
  }
  emptyTip.style.display = "flex";
}

function clearAllFilters() {
  filterStatus   = "all";
  filterPriority = "all";
  searchQuery    = "";
  searchInput.value = "";
  searchClear.style.display = "none";
  document.querySelectorAll('.filter-btn[data-group="status"]').forEach(b => b.classList.remove("active"));
  document.querySelector('.filter-btn[data-group="status"][data-value="all"]').classList.add("active");
  document.querySelectorAll('.filter-btn[data-group="priority"]').forEach(b => b.classList.remove("active"));
  document.querySelector('.filter-btn[data-group="priority"][data-value="all"]').classList.add("active");
  applyFilter();
}

/* ── PWA Service Worker 注册 ── */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
