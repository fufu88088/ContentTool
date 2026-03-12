const DB_NAME = "orm-texttool-db";
const DB_VERSION = 1;
const STORE_NAME = "appState";
const STATE_KEY = "main";
const PAGE_SIZE = 15;

const DEFAULT_CATEGORIES = [
  { id: createId(), name: "默认收纳", color: "#5b8cff", createdAt: Date.now() },
  { id: createId(), name: "待处理", color: "#45b0ff", createdAt: Date.now() },
  { id: createId(), name: "灵感池", color: "#7a8dff", createdAt: Date.now() },
];

const state = {
  categories: [],
  entries: [],
  selectedCategoryId: null,
  currentView: "active",
  search: "",
  sort: "sheet",
  currentPage: 1,
  dbReady: false,
};

const refs = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheRefs();
  bindEvents();

  try {
    const savedState = await loadState();
    hydrateState(savedState);
    state.dbReady = true;
  } catch (error) {
    console.error(error);
    hydrateState(null);
  }

  syncCategorySelect();
  render();
}

function cacheRefs() {
  refs.activeCount = document.querySelector("#activeCount");
  refs.historyCount = document.querySelector("#historyCount");
  refs.categoryCount = document.querySelector("#categoryCount");
  refs.fileInput = document.querySelector("#fileInput");
  refs.importTriggerBtn = document.querySelector("#importTriggerBtn");
  refs.importCategorySelect = document.querySelector("#importCategorySelect");
  refs.skipHeaderCheckbox = document.querySelector("#skipHeaderCheckbox");
  refs.importFeedback = document.querySelector("#importFeedback");
  refs.showAllBtn = document.querySelector("#showAllBtn");
  refs.newCategoryInput = document.querySelector("#newCategoryInput");
  refs.createCategoryBtn = document.querySelector("#createCategoryBtn");
  refs.categoryList = document.querySelector("#categoryList");
  refs.categoryItemTemplate = document.querySelector("#categoryItemTemplate");
  refs.listTitle = document.querySelector("#listTitle");
  refs.viewButtons = Array.from(document.querySelectorAll(".segment"));
  refs.searchInput = document.querySelector("#searchInput");
  refs.sortSelect = document.querySelector("#sortSelect");
  refs.entryList = document.querySelector("#entryList");
  refs.emptyState = document.querySelector("#emptyState");
  refs.prevPageBtn = document.querySelector("#prevPageBtn");
  refs.nextPageBtn = document.querySelector("#nextPageBtn");
  refs.pageMeta = document.querySelector("#pageMeta");
  refs.entryCardTemplate = document.querySelector("#entryCardTemplate");
}

function bindEvents() {
  refs.importTriggerBtn.addEventListener("click", function () {
    refs.fileInput.click();
  });

  refs.fileInput.addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (file) importFile(file);
    event.target.value = "";
  });

  refs.importCategorySelect.addEventListener("change", function (event) {
    state.selectedCategoryId = event.target.value || null;
    resetPaging();
    render();
  });

  refs.createCategoryBtn.addEventListener("click", createCategory);
  refs.newCategoryInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") createCategory();
  });

  refs.showAllBtn.addEventListener("click", function () {
    state.selectedCategoryId = null;
    resetPaging();
    render();
  });

  refs.viewButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      state.currentView = button.dataset.view;
      resetPaging();
      render();
    });
  });

  refs.searchInput.addEventListener("input", function (event) {
    state.search = event.target.value.trim().toLowerCase();
    resetPaging();
    renderEntries();
  });

  refs.sortSelect.addEventListener("change", function (event) {
    state.sort = event.target.value;
    resetPaging();
    renderEntries();
  });

  refs.prevPageBtn.addEventListener("click", function () {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      renderEntries();
    }
  });

  refs.nextPageBtn.addEventListener("click", function () {
    const totalPages = getTotalPages();
    if (state.currentPage < totalPages) {
      state.currentPage += 1;
      renderEntries();
    }
  });
}

function hydrateState(savedState) {
  if (savedState && savedState.categories && savedState.categories.length) {
    state.categories = savedState.categories;
    state.entries = savedState.entries || [];
    state.selectedCategoryId = savedState.selectedCategoryId || null;
    return;
  }

  state.categories = DEFAULT_CATEGORIES.map(function (category) {
    return copyObject(category);
  });
  state.entries = [];
  state.selectedCategoryId = null;
}

function createCategory() {
  const name = refs.newCategoryInput.value.trim();
  if (!name) {
    refs.importFeedback.textContent = "请输入目录名称";
    return;
  }

  const category = {
    id: createId(),
    name: name,
    color: pickCategoryColor(state.categories.length),
    createdAt: Date.now(),
  };

  state.categories.unshift(category);
  state.selectedCategoryId = category.id;
  refs.importCategorySelect.value = category.id;
  refs.newCategoryInput.value = "";
  refs.importFeedback.textContent = "";
  refs.categoryList.scrollLeft = 0;
  syncCategorySelect();
  persistAndRender();
}

async function importFile(file) {
  if (!window.XLSX) {
    refs.importFeedback.textContent = "Excel 解析库未加载";
    return;
  }

  refs.importFeedback.textContent = "正在解析 " + file.name;

  try {
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array" });
    const rows = extractRows(workbook, refs.skipHeaderCheckbox.checked);
    const categoryId = refs.importCategorySelect.value || (state.categories[0] && state.categories[0].id);
    const baseOrder = getNextImportOrder();
    const now = Date.now();

    if (!rows.length) {
      refs.importFeedback.textContent = "没有识别到可导入文本";
      return;
    }

    const importedEntries = rows.map(function (rowText, index) {
      return {
        id: createId(),
        text: rowText,
        categoryId: categoryId,
        sourceFile: file.name,
        sourceRow: index + 1 + (refs.skipHeaderCheckbox.checked ? 1 : 0),
        importOrder: baseOrder + index,
        createdAt: now + index,
        updatedAt: now + index,
        usedAt: null,
      };
    });

    state.entries = state.entries.concat(importedEntries);
    state.selectedCategoryId = categoryId;
    state.currentView = "active";
    state.currentPage = 1;
    refs.importFeedback.textContent = "";
    await persistAndRender();
  } catch (error) {
    console.error(error);
    refs.importFeedback.textContent = "文件解析失败";
  }
}

function extractRows(workbook, skipHeader) {
  const collected = [];

  workbook.SheetNames.forEach(function (sheetName) {
    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });

    const normalizedRows = skipHeader ? rows.slice(1) : rows;
    normalizedRows.forEach(function (row) {
      const line = row
        .map(function (cell) {
          return String(cell || "").replace(/\s+/g, " ").trim();
        })
        .filter(Boolean)
        .join(" | ")
        .trim();

      if (line) collected.push(line);
    });
  });

  return collected;
}

function render() {
  syncCategorySelect();
  renderStats();
  renderCategoryList();
  renderViewButtons();
  renderEntries();
}

function renderStats() {
  const usedCount = state.entries.filter(function (entry) {
    return Boolean(entry.usedAt);
  }).length;

  refs.activeCount.textContent = String(state.entries.length - usedCount);
  refs.historyCount.textContent = String(usedCount);
  refs.categoryCount.textContent = String(state.categories.length);
}

function renderCategoryList() {
  refs.showAllBtn.classList.toggle("is-active", !state.selectedCategoryId);
  refs.categoryList.innerHTML = "";

  state.categories.forEach(function (category) {
    const fragment = refs.categoryItemTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".category-item");
    const selectButton = fragment.querySelector(".category-item__select");
    const swatch = fragment.querySelector(".category-item__swatch");
    const name = fragment.querySelector(".category-item__name");
    const count = fragment.querySelector(".category-item__count");
    const deleteButton = fragment.querySelector(".category-item__delete");

    item.classList.toggle("is-active", state.selectedCategoryId === category.id);
    swatch.style.background = category.color;
    name.textContent = category.name;
    count.textContent = String(countCategoryEntries(category.id));

    selectButton.addEventListener("click", function () {
      state.selectedCategoryId = category.id;
      refs.importCategorySelect.value = category.id;
      resetPaging();
      render();
    });

    deleteButton.addEventListener("click", function () {
      deleteCategory(category.id);
    });

    refs.categoryList.appendChild(fragment);
  });
}

function renderViewButtons() {
  refs.viewButtons.forEach(function (button) {
    button.classList.toggle("is-active", button.dataset.view === state.currentView);
  });
}

function renderEntries() {
  const visibleEntries = getVisibleEntries();
  const totalPages = Math.max(1, Math.ceil(visibleEntries.length / PAGE_SIZE));
  state.currentPage = Math.min(state.currentPage, totalPages);
  const start = (state.currentPage - 1) * PAGE_SIZE;
  const pagedEntries = visibleEntries.slice(start, start + PAGE_SIZE);

  refs.listTitle.textContent = state.currentView === "active" ? "当前条目" : "历史记录";
  refs.pageMeta.textContent = "第 " + state.currentPage + " 页";
  refs.entryList.innerHTML = "";
  refs.emptyState.classList.toggle("hidden", visibleEntries.length > 0);
  refs.prevPageBtn.disabled = state.currentPage <= 1;
  refs.nextPageBtn.disabled = state.currentPage >= totalPages;

  pagedEntries.forEach(function (entry) {
    const fragment = refs.entryCardTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".entry-row");
    const badge = fragment.querySelector(".category-badge");
    const text = fragment.querySelector(".entry-row__text");
    const source = fragment.querySelector(".entry-row__source");
    const copyButton = fragment.querySelector(".copy-button");
    const restoreButton = fragment.querySelector(".restore-button");
    const deleteButton = fragment.querySelector(".delete-button");
    const category = getCategoryById(entry.categoryId);

    row.classList.toggle("is-used", Boolean(entry.usedAt));
    badge.textContent = category ? category.name : "未分类";
    badge.style.background = category ? category.color : "#5b8cff";
    text.textContent = compactText(entry.text);
    source.textContent = entry.sourceRow ? "#" + entry.sourceRow : "-";
    copyButton.textContent = entry.usedAt ? "已复制" : "复制";
    copyButton.disabled = Boolean(entry.usedAt) && state.currentView === "active";
    restoreButton.classList.toggle("hidden", state.currentView !== "history");

    copyButton.addEventListener("click", function () {
      copyEntryText(entry);
    });

    restoreButton.addEventListener("click", function () {
      entry.usedAt = null;
      entry.updatedAt = Date.now();
      refs.importFeedback.textContent = "";
      persistAndRender();
    });

    deleteButton.addEventListener("click", function () {
      state.entries = state.entries.filter(function (item) {
        return item.id !== entry.id;
      });
      persistAndRender();
    });

    refs.entryList.appendChild(fragment);
  });
}

async function copyEntryText(entry) {
  const ok = await writeToClipboard(entry.text);
  if (!ok) {
    refs.importFeedback.textContent = "复制失败，请检查浏览器权限";
    return;
  }

  if (!entry.usedAt) {
    entry.usedAt = Date.now();
    entry.updatedAt = Date.now();
  }

  refs.importFeedback.textContent = "";
  persistAndRender();
}

async function writeToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.error(error);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  let result = false;
  try {
    result = document.execCommand("copy");
  } catch (error) {
    console.error(error);
  }

  document.body.removeChild(textarea);
  return result;
}

function getVisibleEntries() {
  let entries = state.entries.slice();

  if (state.currentView === "history") {
    entries = entries.filter(function (entry) {
      return Boolean(entry.usedAt);
    });
  } else {
    entries = entries.filter(function (entry) {
      return !entry.usedAt;
    });
  }

  if (state.selectedCategoryId) {
    entries = entries.filter(function (entry) {
      return entry.categoryId === state.selectedCategoryId;
    });
  }

  if (state.search) {
    entries = entries.filter(function (entry) {
      const haystack = [
        entry.text,
        entry.sourceFile,
        (getCategoryById(entry.categoryId) || {}).name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.indexOf(state.search) !== -1;
    });
  }

  return entries.sort(function (left, right) {
    if (state.sort === "sheet") return (left.importOrder || 0) - (right.importOrder || 0);
    if (state.sort === "oldest") return left.createdAt - right.createdAt;
    if (state.sort === "alpha") return left.text.localeCompare(right.text, "zh-CN");
    return right.createdAt - left.createdAt;
  });
}

function syncCategorySelect() {
  const options = state.categories
    .map(function (category) {
      return '<option value="' + category.id + '">' + escapeHtml(category.name) + "</option>";
    })
    .join("");

  refs.importCategorySelect.innerHTML = options;
  if (state.categories.length) {
    refs.importCategorySelect.value = state.selectedCategoryId || state.categories[0].id;
    state.selectedCategoryId = refs.importCategorySelect.value;
  }
}

function countCategoryEntries(categoryId) {
  return state.entries.filter(function (entry) {
    return entry.categoryId === categoryId;
  }).length;
}

function getTotalPages() {
  return Math.max(1, Math.ceil(getVisibleEntries().length / PAGE_SIZE));
}

async function persistAndRender() {
  if (state.dbReady) {
    try {
      await saveState();
    } catch (error) {
      console.error(error);
      refs.importFeedback.textContent = "本地保存失败，但当前修改已显示";
    }
  }
  render();
}

function resetPaging() {
  state.currentPage = 1;
}

function deleteCategory(categoryId) {
  if (state.categories.length <= 1) {
    refs.importFeedback.textContent = "至少保留一个目录";
    return;
  }

  const category = getCategoryById(categoryId);
  const ok = window.confirm("删除目录“" + (category ? category.name : "") + "”以及该目录下全部内容？");
  if (!ok) return;

  state.categories = state.categories.filter(function (item) {
    return item.id !== categoryId;
  });
  state.entries = state.entries.filter(function (entry) {
    return entry.categoryId !== categoryId;
  });

  if (state.selectedCategoryId === categoryId) {
    state.selectedCategoryId = null;
  }

  refs.importFeedback.textContent = "目录及内容已删除";
  syncCategorySelect();
  persistAndRender();
}

function loadState() {
  return new Promise(function (resolve, reject) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = function () {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onerror = function () {
      reject(request.error);
    };

    request.onsuccess = function () {
      const db = request.result;
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(STATE_KEY);

      getRequest.onerror = function () {
        reject(getRequest.error);
      };

      getRequest.onsuccess = function () {
        resolve(getRequest.result || null);
      };
    };
  });
}

function saveState() {
  return new Promise(function (resolve, reject) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = function () {
      reject(request.error);
    };

    request.onsuccess = function () {
      const db = request.result;
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const payload = {
        categories: state.categories,
        entries: state.entries,
        selectedCategoryId: state.selectedCategoryId,
      };

      const putRequest = store.put(payload, STATE_KEY);
      putRequest.onerror = function () {
        reject(putRequest.error);
      };
      putRequest.onsuccess = function () {
        resolve();
      };
    };
  });
}

function getCategoryById(categoryId) {
  return state.categories.find(function (category) {
    return category.id === categoryId;
  }) || null;
}

function getNextImportOrder() {
  return state.entries.reduce(function (max, entry) {
    return Math.max(max, entry.importOrder || 0);
  }, 0) + 1;
}

function compactText(text) {
  const value = String(text || "").trim();
  if (value.length <= 34) return value;
  return value.slice(0, 14) + "..." + value.slice(-14);
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function pickCategoryColor(index) {
  const colors = ["#5b8cff", "#45b0ff", "#7a8dff", "#58c0d8", "#6f9cff", "#809bff"];
  return colors[index % colors.length];
}

function copyObject(value) {
  return Object.assign({}, value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
