(() => {
  const STORAGE_KEY = 'todo.v1';
  const VERSION = 1;
  const DEFAULT_STATE = {
    version: VERSION,
    prefs: {
      theme: 'dark',
      bgImageDataUrl: '',
      filter: 'all',
      lastUndo: null,
      lastLongtermReset: null
    },
    items: []
  };

  const mainSections = ['inProgress', 'done', 'longterm'];
  const sectionLabels = {
    inProgress: '进行中',
    done: '已完成',
    longterm: '长期',
    trash: '垃圾桶'
  };

  const Store = {
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return structuredClone(DEFAULT_STATE);
        const data = JSON.parse(raw);
        return this.migrate(data);
      } catch (err) {
        console.warn('读取存储失败，已重置。', err);
        return structuredClone(DEFAULT_STATE);
      }
    },
    save(state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (err) {
        console.error('保存失败', err);
      }
    },
    migrate(data) {
      if (!data || typeof data !== 'object') {
        return structuredClone(DEFAULT_STATE);
      }
      if (!data.version || data.version < VERSION) {
        data.version = VERSION;
      }
      if (!data.prefs) {
        data.prefs = structuredClone(DEFAULT_STATE.prefs);
      } else {
        data.prefs = { ...structuredClone(DEFAULT_STATE.prefs), ...data.prefs };
      }
      data.prefs.theme = 'dark';
      data.prefs.bgImageDataUrl = '';
      data.prefs.filter = 'all';
      if (!Array.isArray(data.items)) {
        data.items = [];
      }
      data.items = data.items.map((item) => ({
        doneToday: false,
        ...item
      }));
      return data;
    }
  };

  const dom = {
    undoBtn: document.getElementById('undoBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFileInput: document.getElementById('importFileInput'),
    bindFileBtn: document.getElementById('bindFileBtn'),
    fileSyncStatus: document.getElementById('fileSyncStatus'),
    searchInput: document.getElementById('searchInput'),
    newTodoForm: document.getElementById('newTodoForm'),
    newTodoInput: document.getElementById('newTodoInput'),
    addToLongterm: document.getElementById('addToLongterm'),
    trashBtn: document.getElementById('trashBtn'),
    trashPanel: document.getElementById('trashPanel'),
    trashCloseBtn: document.getElementById('trashCloseBtn'),
    trashList: document.getElementById('trashList'),
    trashEmptyState: document.querySelector('#trashPanel .empty-state'),
    clearTrashBtn: document.getElementById('clearTrashBtn'),
    lists: {
      inProgress: document.getElementById('inProgressList'),
      done: document.getElementById('doneList'),
      longterm: document.getElementById('longtermList')
    },
    counts: {
      inProgress: document.getElementById('inProgressCount'),
      done: document.getElementById('doneCount'),
      longterm: document.getElementById('longtermCount'),
      trash: document.getElementById('trashCount')
    },
    columns: {
      inProgress: document.querySelector('section[data-section="inProgress"]'),
      done: document.querySelector('section[data-section="done"]'),
      longterm: document.querySelector('section[data-section="longterm"]')
    },
    toggleControl: document.querySelector('#newTodoForm .toggle')
  };

  let state = Store.load();
  let searchTerm = '';
  let fileSync = null;

  function structuredClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function formatDate(ts) {
    if (!ts) return '';
    const date = new Date(ts);
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    return new Intl.DateTimeFormat('zh-CN', options).format(date);
  }

  function getTodayKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function generateId() {
    return `todo-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function mutate(updater, { skipRender = false } = {}) {
    updater(state);
    Store.save(state);
    if (fileSync && typeof fileSync.persistSnapshot === 'function') {
      fileSync.persistSnapshot(state);
    }
    if (!skipRender) {
      render();
    }
  }

  function resetLongtermDailyIfNeeded() {
    const today = getTodayKey();
    if (state.prefs.lastLongtermReset === today) {
      return;
    }
    state.items.forEach((item) => {
      if (item.section === 'longterm' && item.doneToday) {
        item.doneToday = false;
      }
    });
    state.prefs.lastLongtermReset = today;
    Store.save(state);
    if (fileSync && typeof fileSync.persistSnapshot === 'function') {
      fileSync.persistSnapshot(state);
    }
  }

  function applyTheme() {
    document.body.removeAttribute('data-theme');
    document.body.style.removeProperty('--custom-bg');
  }

  function updateUndoButton() {
    dom.undoBtn.disabled = !state.prefs.lastUndo;
  }

  function updateFileSyncStatus(status = {}) {
    if (!dom.fileSyncStatus) return;
    const {
      supported = true,
      bound = false,
      syncing = false,
      message = '',
      error = ''
    } = status;

    let text = '';
    if (!supported) {
      text = '浏览器不支持直接同步文件';
    } else if (error) {
      text = `同步失败：${error}`;
    } else if (syncing) {
      text = '同步中…';
    } else if (bound) {
      text = message || '已绑定本地文件';
    } else {
      text = '使用浏览器本地存储';
    }

    dom.fileSyncStatus.textContent = text;

    if (dom.bindFileBtn) {
      dom.bindFileBtn.disabled = !supported;
      dom.bindFileBtn.textContent = bound ? '重新绑定' : '绑定文件';
      dom.bindFileBtn.title = !supported
        ? '当前浏览器不支持文件绑定'
        : bound
          ? '重新绑定或更换本地数据文件（右键可解除绑定）'
          : '绑定或创建本地数据文件';
    }
  }

  function getItemsBySection(section) {
    return state.items
      .filter((item) => item.section === section)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  function render() {
    applyTheme();
    updateUndoButton();
    mainSections.forEach((section) => renderSection(section));
    renderTrash();
  }

  function renderSection(section) {
    const list = dom.lists[section];
    const column = dom.columns[section];
    if (!list || !column) return;
    const items = getItemsBySection(section);
    const filteredItems = items.filter((item) => {
      if (!searchTerm) return true;
      return item.text.toLowerCase().includes(searchTerm.toLowerCase());
    });

    list.innerHTML = '';
    filteredItems.forEach((item) => {
      const element = createMainItemElement(item);
      list.appendChild(element);
    });

    dom.counts[section].textContent = items.length;
    const emptyState = column.querySelector('.empty-state');
    if (emptyState) {
      emptyState.style.display = filteredItems.length === 0 ? 'block' : 'none';
    }
    column.classList.toggle('show-empty', filteredItems.length === 0);
  }

  function renderTrash() {
    const items = getItemsBySection('trash');
    const filteredItems = items.filter((item) => {
      if (!searchTerm) return true;
      return item.text.toLowerCase().includes(searchTerm.toLowerCase());
    });

    if (dom.trashList) {
      dom.trashList.innerHTML = '';
      filteredItems.forEach((item) => {
        const element = createTrashItemElement(item);
        dom.trashList.appendChild(element);
      });
    }

    if (dom.counts.trash) {
      dom.counts.trash.textContent = items.length;
    }
    if (dom.trashEmptyState) {
      dom.trashEmptyState.style.display = filteredItems.length === 0 ? 'block' : 'none';
    }
    if (dom.clearTrashBtn) {
      dom.clearTrashBtn.disabled = items.length === 0;
    }
    if (dom.trashBtn) {
      dom.trashBtn.classList.toggle('highlight', items.length > 0);
      dom.trashBtn.setAttribute('aria-label', items.length > 0 ? `垃圾桶（${items.length}）` : '打开垃圾桶');
      dom.trashBtn.title = items.length > 0 ? `垃圾桶（${items.length}）` : '垃圾桶';
    }
  }

  function isTrashPanelOpen() {
    return !!(dom.trashPanel && dom.trashPanel.classList.contains('open'));
  }

  function openTrashPanel() {
    if (!dom.trashPanel) return;
    dom.trashPanel.classList.add('open');
    dom.trashPanel.setAttribute('aria-hidden', 'false');
    renderTrash();
    if (dom.trashCloseBtn) {
      dom.trashCloseBtn.focus();
    } else {
      dom.trashPanel.focus();
    }
  }

  function closeTrashPanel() {
    if (!dom.trashPanel) return;
    dom.trashPanel.classList.remove('open');
    dom.trashPanel.setAttribute('aria-hidden', 'true');
    if (dom.trashBtn) {
      dom.trashBtn.focus();
    }
  }

  function createMainItemElement(item) {
    const template = document.getElementById('todoItemTemplate');
    const clone = template.content.firstElementChild.cloneNode(true);
    clone.dataset.id = item.id;
    clone.dataset.section = item.section;
    clone.classList.toggle('done', item.section === 'done');
    clone.classList.toggle('longterm', item.section === 'longterm');
    clone.classList.toggle('done-today', !!item.doneToday);

    const checkbox = clone.querySelector('input[type="checkbox"]');
    const content = clone.querySelector('.item-content');
    const deleteBtn = clone.querySelector('.delete-btn');
    const longtermStatus = clone.querySelector('.longterm-status');
    const timestampDot = clone.querySelector('.timestamp-dot');

    content.textContent = item.text;
    clone.setAttribute('aria-label', item.text);
    clone.title = `创建：${formatDate(item.createdAt)}${
      item.updatedAt && item.updatedAt !== item.createdAt ? `\n更新：${formatDate(item.updatedAt)}` : ''
    }`;

    if (longtermStatus) {
      longtermStatus.textContent = '';
    }

    if (item.section === 'inProgress') {
      checkbox.checked = false;
      checkbox.setAttribute('aria-label', '标记为完成');
    } else if (item.section === 'done') {
      checkbox.checked = true;
      checkbox.setAttribute('aria-label', '还原为进行中');
    } else if (item.section === 'longterm') {
      checkbox.checked = !!item.doneToday;
      checkbox.setAttribute('aria-label', '标记今日已完成');
      if (longtermStatus) {
        longtermStatus.textContent = item.doneToday ? '今日已打卡' : '';
      }
    }

    if (timestampDot) {
      const tooltipParts = [`创建：${formatDate(item.createdAt)}`];
      if (item.updatedAt && item.updatedAt !== item.createdAt) {
        tooltipParts.push(`更新：${formatDate(item.updatedAt)}`);
      }
      const tooltipText = tooltipParts.join(' / ');
      timestampDot.dataset.tooltip = tooltipText;
      timestampDot.setAttribute('aria-label', tooltipParts.join('，'));
      timestampDot.title = tooltipText;
    }

    checkbox.addEventListener('change', () => handleCheckboxChange(item));
    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleDelete(item.id);
    });

    content.addEventListener('dblclick', () => {
      startEditing(clone, item);
    });

    clone.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && document.activeElement === clone) {
        event.preventDefault();
        const check = clone.querySelector('input[type="checkbox"]');
        if (check && !check.disabled) {
          check.click();
        }
      }
    });

    return clone;
  }

  function createTrashItemElement(item) {
    const template = document.getElementById('trashItemTemplate');
    const clone = template.content.firstElementChild.cloneNode(true);
    clone.dataset.id = item.id;

    const text = clone.querySelector('.trash-text');
    const meta = clone.querySelector('.trash-meta');
    const restoreBtn = clone.querySelector('.restore-btn');
    const deleteBtn = clone.querySelector('.delete-btn');

    text.textContent = item.text;
    const metaParts = [];
    if (item.trashedFrom) {
      metaParts.push(`来自：${sectionLabels[item.trashedFrom] || '未知'}`);
    }
    metaParts.push(`创建：${formatDate(item.createdAt)}`);
    if (item.updatedAt && item.updatedAt !== item.createdAt) {
      metaParts.push(`更新：${formatDate(item.updatedAt)}`);
    }
    meta.textContent = metaParts.join(' · ');

    restoreBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleRestore(item.id);
    });

    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handlePermanentDelete(item.id);
    });

    clone.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && document.activeElement === clone) {
        event.preventDefault();
        handleRestore(item.id);
      }
    });

    return clone;
  }

  function startEditing(element, item) {
    if (element.classList.contains('editing')) return;
    element.classList.add('editing');
    const body = element.querySelector('.item-body') || element;
    const content = body.querySelector('.item-content');
    const status = body.querySelector('.longterm-status');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = item.text;
    input.className = 'edit-input';
    input.setAttribute('aria-label', '编辑待办');
    if (status) {
      status.hidden = true;
    }
    if (content) {
      content.hidden = true;
    }
    body.insertBefore(input, content || body.firstChild);
    input.focus();
    input.select();

    const cancelEdit = () => {
      element.classList.remove('editing');
      if (content) {
        content.hidden = false;
      }
      if (status) {
        status.hidden = false;
      }
      input.remove();
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const nextValue = input.value.trim();
        if (!nextValue) {
          alert('内容不能为空。');
          return;
        }
        mutate((draft) => {
          const target = draft.items.find((it) => it.id === item.id);
          if (target) {
            target.text = nextValue;
            target.updatedAt = Date.now();
          }
        });
        cancelEdit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });

    input.addEventListener('blur', () => {
      cancelEdit();
    });
  }

  function handleCheckboxChange(item) {
    if (item.section === 'inProgress') {
      mutate((draft) => {
        const target = draft.items.find((it) => it.id === item.id);
        if (target) {
          target.section = 'done';
          target.updatedAt = Date.now();
        }
      });
    } else if (item.section === 'done') {
      mutate((draft) => {
        const target = draft.items.find((it) => it.id === item.id);
        if (target) {
          target.section = 'inProgress';
          target.updatedAt = Date.now();
        }
      });
    } else if (item.section === 'longterm') {
      mutate((draft) => {
        const target = draft.items.find((it) => it.id === item.id);
        if (target) {
          target.doneToday = !target.doneToday;
          target.updatedAt = Date.now();
        }
      });
    }
  }

  function handleDelete(id) {
    const confirmed = window.confirm('确认要删除此条目并移至垃圾桶吗？');
    if (!confirmed) return;
    mutate((draft) => {
      const target = draft.items.find((item) => item.id === id);
      if (!target || target.section === 'trash') return;
      const fromSection = target.section;
      target.trashedFrom = fromSection;
      target.section = 'trash';
      target.doneToday = false;
      target.updatedAt = Date.now();
      draft.prefs.lastUndo = { itemId: target.id, from: fromSection };
    });
  }

  function handlePermanentDelete(id) {
    const confirmed = window.confirm('确认要彻底删除此条目吗？该操作不可撤销。');
    if (!confirmed) return;
    mutate((draft) => {
      draft.items = draft.items.filter((item) => item.id !== id);
      if (draft.prefs.lastUndo && draft.prefs.lastUndo.itemId === id) {
        draft.prefs.lastUndo = null;
      }
    });
  }

  function handleRestore(id) {
    mutate((draft) => {
      const target = draft.items.find((item) => item.id === id);
      if (!target || target.section !== 'trash') return;
      const toSection = target.trashedFrom || 'inProgress';
      target.section = toSection;
      target.updatedAt = Date.now();
      if (draft.prefs.lastUndo && draft.prefs.lastUndo.itemId === id) {
        draft.prefs.lastUndo = null;
      }
    });
  }

  function handleUndo() {
    const undo = state.prefs.lastUndo;
    if (!undo) return;
    mutate((draft) => {
      const target = draft.items.find((item) => item.id === undo.itemId);
      if (!target || target.section !== 'trash') {
        draft.prefs.lastUndo = null;
        return;
      }
      target.section = undo.from || 'inProgress';
      target.updatedAt = Date.now();
      draft.prefs.lastUndo = null;
    });
  }

  function handleClearTrash() {
    if (!state.items.some((item) => item.section === 'trash')) return;
    const confirmed = window.confirm('确认要清空垃圾桶吗？此操作不可恢复。');
    if (!confirmed) return;
    mutate((draft) => {
      draft.items = draft.items.filter((item) => item.section !== 'trash');
      draft.prefs.lastUndo = null;
    });
  }

  function addTodo(text, toLongterm) {
    const trimmed = text.trim();
    if (!trimmed) {
      alert('请输入内容。');
      return;
    }
    mutate((draft) => {
      const now = Date.now();
      draft.items.push({
        id: generateId(),
        text: trimmed,
        section: toLongterm ? 'longterm' : 'inProgress',
        createdAt: now,
        updatedAt: now,
        doneToday: false
      });
    });
  }

  function updateSearch(term) {
    searchTerm = term;
    render();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `todo-export-${getTodayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importFromText(text) {
    if (!text) return;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      alert('JSON 格式错误，请检查。');
      return;
    }
    const confirmed = window.confirm('确定导入并覆盖当前数据吗？');
    if (!confirmed) return;
    const migrated = Store.migrate(parsed);
    state = migrated;
    Store.save(state);
    if (fileSync && typeof fileSync.persistSnapshot === 'function') {
      fileSync.persistSnapshot(state);
    }
    resetLongtermDailyIfNeeded();
    render();
  }

  function createFileSync({ getState, onExternalData, onStatusChange }) {
    const supported = !!(window.showOpenFilePicker || window.showSaveFilePicker);
    const canPersistHandle = supported && typeof indexedDB !== 'undefined';
    const DB_NAME = 'todo-file-sync';
    const STORE_NAME = 'handles';
    const KEY = 'primary';
    let handle = null;
    let initializing = false;

    function notify(partial = {}) {
      const base = {
        supported,
        bound: !!handle,
        syncing: false,
        message: handle ? `自动保存：${handle.name}` : '',
        error: ''
      };
      const merged = { ...base, ...partial };
      if (!merged.bound) {
        merged.message = '';
      }
      if (onStatusChange) {
        onStatusChange(merged);
      }
    }

    function openDB() {
      if (!canPersistHandle) {
        return Promise.reject(new Error('无法持久化文件句柄'));
      }
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    async function loadStoredHandle() {
      if (!canPersistHandle) return null;
      try {
        const db = await openDB();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(KEY);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
          tx.oncomplete = () => db.close();
        });
      } catch (err) {
        console.warn('读取文件句柄失败', err);
        return null;
      }
    }

    async function saveStoredHandle(nextHandle) {
      if (!canPersistHandle) return;
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(nextHandle, KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      });
    }

    async function clearStoredHandle() {
      if (!canPersistHandle) return;
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      });
    }

    async function ensurePermission(targetHandle, mode = 'readwrite') {
      if (!targetHandle) return false;
      if (typeof targetHandle.queryPermission !== 'function') {
        return true;
      }
      try {
        let result = await targetHandle.queryPermission({ mode });
        if (result === 'prompt') {
          result = await targetHandle.requestPermission({ mode });
        }
        return result === 'granted';
      } catch (err) {
        console.warn('请求文件权限失败', err);
        return false;
      }
    }

    async function readFromHandle(targetHandle) {
      if (!targetHandle) return null;
      const permitted = await ensurePermission(targetHandle, 'readwrite');
      if (!permitted) {
        notify({ error: '无权限访问绑定文件' });
        return null;
      }
      try {
        const file = await targetHandle.getFile();
        const text = await file.text();
        if (!text.trim()) {
          return null;
        }
        return JSON.parse(text);
      } catch (err) {
        notify({ error: err.message });
        alert(`读取绑定文件失败：${err.message}`);
        return null;
      }
    }

    async function writeSnapshot() {
      if (!handle) return;
      const permitted = await ensurePermission(handle, 'readwrite');
      if (!permitted) {
        notify({ error: '请授权访问绑定文件' });
        return;
      }
      try {
        notify({ syncing: true });
        const writable = await handle.createWritable();
        await writable.truncate(0);
        await writable.write(JSON.stringify(getState(), null, 2));
        await writable.close();
        notify({ syncing: false });
      } catch (err) {
        notify({ syncing: false, error: err.message });
      }
    }

    async function init() {
      if (!supported) {
        notify({ supported: false, bound: false });
        return;
      }
      if (initializing) return;
      initializing = true;
      try {
        handle = await loadStoredHandle();
        notify({});
        if (handle) {
          const externalData = await readFromHandle(handle);
          if (externalData) {
            onExternalData && onExternalData(externalData);
          }
        }
      } catch (err) {
        console.warn('初始化文件同步失败', err);
        handle = null;
        notify({ error: err.message, bound: false });
      } finally {
        initializing = false;
      }
    }

    async function promptBinding() {
      if (!supported) {
        alert('当前浏览器不支持直接同步本地文件。');
        return;
      }
      try {
        let nextHandle = null;
        const useExisting = window.confirm('选择已有 JSON 文件吗？取消则创建新文件。');
        if (useExisting && typeof window.showOpenFilePicker === 'function') {
          const picks = await window.showOpenFilePicker({
            multiple: false,
            types: [
              {
                description: 'JSON 文件',
                accept: { 'application/json': ['.json'] }
              }
            ]
          });
          if (Array.isArray(picks) && picks.length > 0) {
            nextHandle = picks[0];
          }
        } else {
          if (typeof window.showSaveFilePicker !== 'function') {
            alert('浏览器不支持创建文件，请选择已有 JSON 文件。');
            return;
          }
          nextHandle = await window.showSaveFilePicker({
            suggestedName: 'todo-data.json',
            types: [
              {
                description: 'JSON 文件',
                accept: { 'application/json': ['.json'] }
              }
            ]
          });
        }

        if (!nextHandle) {
          return;
        }

        handle = nextHandle;
        if (canPersistHandle) {
          await saveStoredHandle(handle);
        } else {
          alert('当前环境无法记住文件绑定，请在下次打开页面时重新绑定。');
        }
        notify({});
        const externalData = await readFromHandle(handle);
        if (externalData) {
          onExternalData && onExternalData(externalData);
        } else {
          await writeSnapshot();
        }
        alert('已绑定本地文件，后续变动会自动写入。');
      } catch (err) {
        if (err && err.name === 'AbortError') {
          return;
        }
        console.warn('绑定文件失败', err);
        notify({ error: err.message });
      }
    }

    async function forgetBinding() {
      if (!handle) return;
      const confirmed = window.confirm('确定解除文件绑定吗？不会删除现有文件。');
      if (!confirmed) return;
      handle = null;
      try {
        await clearStoredHandle();
      } catch (err) {
        console.warn('清除文件句柄失败', err);
      }
      notify({ bound: false });
    }

    return {
      init,
      persistSnapshot: writeSnapshot,
      promptBinding,
      forgetBinding
    };
  }

  function handleImport() {
    const useFile = window.confirm('确定从本地文件导入吗？取消则粘贴 JSON 文本。');
    if (useFile) {
      dom.importFileInput.click();
    } else {
      const text = window.prompt('请粘贴 JSON 数据，这将覆盖现有内容：');
      if (text && text.trim()) {
        importFromText(text.trim());
      }
    }
  }

  function handleImportFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      importFromText(reader.result);
      dom.importFileInput.value = '';
    };
    reader.readAsText(file, 'utf-8');
  }

  function setupEvents() {
    const syncToggleSwitch = () => {
      if (dom.toggleControl) {
        dom.toggleControl.setAttribute('aria-checked', dom.addToLongterm.checked ? 'true' : 'false');
      }
    };

    if (dom.toggleControl) {
      dom.toggleControl.addEventListener('keydown', (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          dom.addToLongterm.checked = !dom.addToLongterm.checked;
          syncToggleSwitch();
        }
      });
      dom.addToLongterm.addEventListener('change', syncToggleSwitch);
      syncToggleSwitch();
    }

    dom.newTodoForm.addEventListener('submit', (event) => {
      event.preventDefault();
      addTodo(dom.newTodoInput.value, dom.addToLongterm.checked);
      dom.newTodoInput.value = '';
      dom.addToLongterm.checked = false;
      syncToggleSwitch();
      dom.newTodoInput.focus();
    });

    dom.undoBtn.addEventListener('click', handleUndo);
    if (dom.clearTrashBtn) {
      dom.clearTrashBtn.addEventListener('click', handleClearTrash);
    }
    dom.exportBtn.addEventListener('click', exportData);
    dom.importBtn.addEventListener('click', handleImport);
    dom.importFileInput.addEventListener('change', handleImportFileChange);

    if (dom.bindFileBtn) {
      dom.bindFileBtn.addEventListener('click', () => {
        if (fileSync && typeof fileSync.promptBinding === 'function') {
          fileSync.promptBinding();
        }
      });
      dom.bindFileBtn.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (fileSync && typeof fileSync.forgetBinding === 'function') {
          fileSync.forgetBinding();
        }
      });
    }

    if (dom.trashBtn) {
      dom.trashBtn.addEventListener('click', openTrashPanel);
    }
    if (dom.trashCloseBtn) {
      dom.trashCloseBtn.addEventListener('click', closeTrashPanel);
    }
    if (dom.trashPanel) {
      dom.trashPanel.addEventListener('click', (event) => {
        if (event.target === dom.trashPanel) {
          closeTrashPanel();
        }
      });
    }

    dom.searchInput.addEventListener('input', (event) => {
      updateSearch(event.target.value);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (isTrashPanelOpen()) {
          event.preventDefault();
          closeTrashPanel();
          return;
        }
      }

      if (isTrashPanelOpen()) {
        return;
      }

      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        dom.newTodoInput.focus();
      } else if (event.key === '/') {
        event.preventDefault();
        dom.searchInput.focus();
      } else if (event.key === 'Delete') {
        const active = document.activeElement;
        const itemEl = active && active.closest && active.closest('.todo-item');
        if (itemEl) {
          const id = itemEl.dataset.id;
          const section = itemEl.dataset.section;
          if (section !== 'trash') {
            handleDelete(id);
          }
        }
      } else if (event.key === 'z' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        handleUndo();
      }
    });

    dom.searchInput.addEventListener('focus', () => {
      dom.searchInput.select();
    });
  }

  fileSync = createFileSync({
    getState: () => state,
    onExternalData: (externalState) => {
      if (!externalState) return;
      state = Store.migrate(externalState);
      resetLongtermDailyIfNeeded();
      Store.save(state);
      render();
    },
    onStatusChange: updateFileSyncStatus
  });

  updateFileSyncStatus({ supported: !!(window.showOpenFilePicker || window.showSaveFilePicker) });

  resetLongtermDailyIfNeeded();
  setupEvents();
  render();
  if (fileSync && typeof fileSync.init === 'function') {
    fileSync.init();
  }
})();
