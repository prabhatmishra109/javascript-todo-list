(() => {
  "use strict";

  const STORAGE_KEY = "flowtask-tasks-v1";
  const THEME_KEY = "flowtask-theme-v1";
  const $ = (selector) => document.querySelector(selector);

  const form = $("#task-form");
  const taskInput = $("#task-input");
  const priorityInput = $("#priority-input");
  const dateInput = $("#date-input");
  const submitButton = $("#submit-btn");
  const formTitle = $("#form-title");
  const cancelEditButton = $("#cancel-edit");
  const formError = $("#form-error");
  const taskList = $("#task-list");
  const emptyState = $("#empty-state");
  const searchInput = $("#search-input");
  const filterButtons = [...document.querySelectorAll(".filter-btn")];
  const clearCompletedButton = $("#clear-completed");
  const toast = $("#toast");

  let tasks = loadTasks();
  let currentFilter = "all";
  let editingId = null;
  let toastTimer = null;

  function loadTasks() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(saved)) return [];
      return saved.filter((task) =>
        task && typeof task.id === "string" &&
        typeof task.title === "string" &&
        typeof task.completed === "boolean"
      ).map((task) => ({
        id: task.id,
        title: task.title.slice(0, 180),
        completed: task.completed,
        priority: ["low", "medium", "high"].includes(task.priority) ? task.priority : "medium",
        dueDate: typeof task.dueDate === "string" ? task.dueDate : "",
        createdAt: typeof task.createdAt === "number" ? task.createdAt : Date.now()
      }));
    } catch (error) {
      console.warn("Could not read saved tasks:", error);
      return [];
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.warn("Could not save tasks:", error);
      showToast("Could not save changes in this browser.");
    }
  }

  function makeId() {
    return (window.crypto && typeof window.crypto.randomUUID === "function")
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function escapeDate(value) {
    if (!value) return "";
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return "";
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function isOverdue(task) {
    if (!task.dueDate || task.completed) return false;
    const today = new Date();
    const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return task.dueDate < localToday;
  }

  function makeSvg(path, viewBox = "0 0 24 24") {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("aria-hidden", "true");
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path");
    element.setAttribute("d", path);
    svg.appendChild(element);
    return svg;
  }

  function makeActionButton(label, path, action, id, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `action-btn ${extraClass}`.trim();
    button.setAttribute("aria-label", label);
    button.title = label;
    button.appendChild(makeSvg(path));
    button.addEventListener("click", () => action(id));
    return button;
  }

  function buildTask(task, index) {
    const article = document.createElement("article");
    article.className = `task-item${task.completed ? " is-completed" : ""}`;
    article.style.animationDelay = `${Math.min(index * 35, 210)}ms`;

    const check = document.createElement("button");
    check.type = "button";
    check.className = `task-check${task.completed ? " checked" : ""}`;
    check.setAttribute("aria-label", task.completed ? "Mark task as not completed" : "Mark task as completed");
    check.setAttribute("aria-pressed", String(task.completed));
    check.appendChild(makeSvg("m5 12 4 4L19 6"));
    check.addEventListener("click", () => toggleTask(task.id));

    const main = document.createElement("div");
    main.className = "task-main";
    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = task.title;
    main.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "task-meta";
    const priority = document.createElement("span");
    priority.className = `priority-badge priority-${task.priority}`;
    priority.textContent = `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`;
    meta.appendChild(priority);

    if (task.dueDate) {
      const due = document.createElement("span");
      due.className = `due-badge${isOverdue(task) ? " overdue" : ""}`;
      due.textContent = `${isOverdue(task) ? "Overdue · " : "Due · "}${escapeDate(task.dueDate)}`;
      meta.appendChild(due);
    }
    main.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "task-actions";
    actions.appendChild(makeActionButton("Edit task", "M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z", startEdit, task.id));
    actions.appendChild(makeActionButton("Delete task", "M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v5 M14 11v5", deleteTask, task.id, "delete"));

    article.append(check, main, actions);
    return article;
  }

  function getVisibleTasks() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    return tasks.filter((task) => {
      const matchesFilter =
        currentFilter === "all" ||
        (currentFilter === "active" && !task.completed) ||
        (currentFilter === "completed" && task.completed);
      return matchesFilter && task.title.toLocaleLowerCase().includes(query);
    }).sort((a, b) => {
      if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return b.createdAt - a.createdAt;
    });
  }

  function render() {
    const completed = tasks.filter((task) => task.completed).length;
    const active = tasks.length - completed;
    const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
    $("#total-count").textContent = tasks.length;
    $("#completed-count").textContent = completed;
    $("#remaining-count").textContent = active;
    $("#progress-text").textContent = `${percent}%`;
    $("#progress-bar").style.width = `${percent}%`;
    $("#progress-caption").textContent = `${completed} of ${tasks.length} completed`;
    $("#all-filter-count").textContent = tasks.length;
    $("#active-filter-count").textContent = active;
    $("#done-filter-count").textContent = completed;

    const visibleTasks = getVisibleTasks();
    $("#visible-count").textContent = `${visibleTasks.length} ${visibleTasks.length === 1 ? "task" : "tasks"}`;
    taskList.replaceChildren(...visibleTasks.map(buildTask));
    emptyState.classList.toggle("show", visibleTasks.length === 0);
    if (visibleTasks.length === 0) {
      const heading = emptyState.querySelector("h3");
      const description = emptyState.querySelector("p");
      if (searchInput.value.trim()) {
        heading.textContent = "No matching tasks.";
        description.textContent = "Try a different search or add a new task.";
      } else if (currentFilter === "completed" && tasks.length) {
        heading.textContent = "Nothing completed just yet.";
        description.textContent = "Finish a task and it will show up here.";
      } else if (currentFilter === "active" && tasks.length) {
        heading.textContent = "You're all caught up!";
        description.textContent = "Every task is complete. Take a little breather.";
      } else {
        heading.textContent = "Your space is wide open.";
        description.textContent = "Add a task above and make today count.";
      }
    }
    clearCompletedButton.disabled = completed === 0;
    $("#footer-message").textContent = completed && active === 0
      ? "Everything is done. You earned that little win."
      : "A little progress is still progress.";
    filterButtons.forEach((button) => {
      const selected = button.dataset.filter === currentFilter;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function resetForm() {
    editingId = null;
    form.reset();
    priorityInput.value = "medium";
    formTitle.textContent = "Add a new task";
    submitButton.querySelector("span:first-child").textContent = "Add task";
    cancelEditButton.hidden = true;
    formError.textContent = "";
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function toggleTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    task.completed = !task.completed;
    saveTasks();
    render();
    showToast(task.completed ? "Nice work — task completed!" : "Task moved back to your list.");
    if (editingId === id && task.completed) resetForm();
  }

  function startEdit(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    editingId = id;
    taskInput.value = task.title;
    priorityInput.value = task.priority;
    dateInput.value = task.dueDate;
    formTitle.textContent = "Edit your task";
    submitButton.querySelector("span:first-child").textContent = "Save changes";
    cancelEditButton.hidden = false;
    formError.textContent = "";
    $("#task-form").scrollIntoView({ behavior: "smooth", block: "center" });
    taskInput.focus({ preventScroll: true });
  }

  function deleteTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    tasks = tasks.filter((item) => item.id !== id);
    if (editingId === id) resetForm();
    saveTasks();
    render();
    showToast("Task deleted.");
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = taskInput.value.trim();
    if (!title) {
      formError.textContent = "Please enter a task before saving.";
      taskInput.focus();
      return;
    }
    if (title.length > 180) {
      formError.textContent = "Keep your task under 180 characters.";
      return;
    }
    formError.textContent = "";
    if (editingId) {
      const task = tasks.find((item) => item.id === editingId);
      if (task) {
        task.title = title;
        task.priority = priorityInput.value;
        task.dueDate = dateInput.value;
        showToast("Changes saved.");
      }
    } else {
      tasks.unshift({
        id: makeId(),
        title,
        completed: false,
        priority: priorityInput.value,
        dueDate: dateInput.value,
        createdAt: Date.now()
      });
      showToast("Task added. You've got this!");
    }
    saveTasks();
    resetForm();
    currentFilter = "all";
    searchInput.value = "";
    render();
    taskInput.focus();
  });

  cancelEditButton.addEventListener("click", resetForm);
  searchInput.addEventListener("input", render);
  filterButtons.forEach((button) => button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    render();
  }));

  clearCompletedButton.addEventListener("click", () => {
    const count = tasks.filter((task) => task.completed).length;
    if (!count) return;
    tasks = tasks.filter((task) => !task.completed);
    if (editingId && !tasks.some((task) => task.id === editingId)) resetForm();
    saveTasks();
    render();
    showToast(`${count} completed ${count === 1 ? "task" : "tasks"} cleared.`);
  });

  function applyTheme(theme) {
    document.body.classList.toggle("light", theme === "light");
    const icon = $("#theme-icon");
    icon.replaceChildren();
    if (theme === "light") {
      const sun = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      sun.setAttribute("cx", "12"); sun.setAttribute("cy", "12"); sun.setAttribute("r", "4");
      icon.appendChild(sun);
      ["M12 2v2", "M12 20v2", "M2 12h2", "M20 12h2", "m4.93 4.93 1.42 1.42", "m17.65 17.65 1.42 1.42", "m19.07 4.93-1.42 1.42", "m6.35 17.65-1.42 1.42"].forEach((d) => icon.appendChild(makeSvg(d).firstChild));
    } else {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.7 8.7 0 1 0 20.5 14.2Z");
      icon.appendChild(path);
    }
  }

  $("#theme-toggle").addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("light") ? "dark" : "light";
    applyTheme(nextTheme);
    try { localStorage.setItem(THEME_KEY, nextTheme); } catch (_) {}
  });

  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === "light" || savedTheme === "dark") applyTheme(savedTheme);
  } catch (_) {}

  const now = new Date();
  $("#today-label").textContent = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  $("#year").textContent = now.getFullYear();
  render();
})();
