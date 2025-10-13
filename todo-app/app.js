(() => {
  const VERSION = 1;
  const FILE_RELATIVE_PATH = ['data', 'todos.json'];
  const FILE_DISPLAY_PATH = FILE_RELATIVE_PATH.join('/');
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

  const FileBridge = (() => {
    const DB_NAME = 'todo-file-bridge';
    const STORE_NAME = 'handles';
    const DIR_KEY = 'directory';
    const statusListeners = new Set();
    const readyListeners = new Set();
    const errorListeners = new Set();
    let status = 'init';
    let directoryHandle = null;
    let fileHandle = null;
    let cachedText = null;
    let queue = Promise.resolve();
    let lastError = null;
    let dbPromise = null;

    function notifyStatus() {
      statusListeners.forEach((handler) => {
        try {
          handler(status);
        } catch (err) {
          console.error(err);
        }
      });
    }

    function notifyReady() {
      readyListeners.forEach((handler) => {
        try {
          handler();
        } catch (err) {
          console.error(err);
        }
      });
    }

    function notifyError(error) {
      lastError = error;
      errorListeners.forEach((handler) => {
        try {
          handler(error);
        } catch (err) {
          console.error(err);
        }
      });
    }

    function setStatus(next) {
      if (status === next) return;
      status = next;
      notifyStatus();
      if (status === 'ready') {
        notifyReady();
      }
    }

    function onStatusChange(handler) {
      statusListeners.add(handler);
      try {
        handler(status);
      } catch (err) {
        console.error(err);
      }
      return () => statusListeners.delete(handler);
    }

    function onReady(handler) {
      readyListeners.add(handler);
      if (status === 'ready') {
        Promise.resolve().then(handler);
      }
      return () => readyListeners.delete(handler);
    }

    function onError(handler) {
      errorListeners.add(handler);
      if (lastError) {
        Promise.resolve().then(() => handler(lastError));
      }
      return () => errorListeners.delete(handler);
    }

    function isSupported() {
      return typeof window.showDirectoryPicker === 'function' && 'indexedDB' in window;
    }

    function getDB() {
      if (!isSupported()) {
        return Promise.resolve(null);
      }
      if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
          const request = indexedDB.open(DB_NAME, 1);
          request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }
      return dbPromise;
    }

    async function loadStoredDirectoryHandle() {
      const db = await getDB();
      if (!db) return null;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(DIR_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    }

    async function saveDirectoryHandle(handle) {
      const db = await getDB();
      if (!db) return;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(handle, DIR_KEY);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    async function clearStoredDirectoryHandle() {
      const db = await getDB();
      if (!db) return;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(DIR_KEY);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    async function verifyPermission(handle) {
      if (!handle) return false;
      const opts = { mode: 'readwrite' };
      if ((await handle.queryPermission(opts)) === 'granted') {
        return true;
      }
      return (await handle.requestPermission(opts)) === 'granted';
    }

    async function resolveFileHandle(baseHandle) {
      if (!baseHandle) return null;
      let current = baseHandle;
      try {
        for (let i = 0; i < FILE_RELATIVE_PATH.length - 1; i += 1) {
          const segment = FILE_RELATIVE_PATH[i];
          current = await current.getDirectoryHandle(segment, { create: true });
        }
        const fileName = FILE_RELATIVE_PATH[FILE_RELATIVE_PATH.length - 1];
        return await current.getFileHandle(fileName, { create: true });
      } catch (err) {
        throw new Error('无法访问 data/todos.json，请确认所选文件夹。');
      }
    }

    async function ensureFileHandle() {
      if (fileHandle) {
        return fileHandle;
      }
      if (!directoryHandle) {
        return null;
      }
      try {
        fileHandle = await resolveFileHandle(directoryHandle);
        return fileHandle;
      } catch (err) {
        notifyError(err);
        setStatus('pending');
        return null;
      }
    }

    async function performWrite(snapshot) {
      const handle = await ensureFileHandle();
      if (!handle) {
        throw new Error('数据文件不可用');
      }
      const writable = await handle.createWritable();
      await writable.write(snapshot);
      await writable.close();
    }

    async function init() {
      if (!isSupported()) {
        setStatus('unsupported');
        return;
      }
      try {
        const stored = await loadStoredDirectoryHandle();
        if (stored) {
          const allowed = await verifyPermission(stored);
          if (allowed) {
            directoryHandle = stored;
            fileHandle = await resolveFileHandle(directoryHandle);
            setStatus('ready');
            return;
          }
          await clearStoredDirectoryHandle();
        }
      } catch (err) {
        notifyError(err);
      }
      setStatus('pending');
    }

    let requesting = false;
    async function requestAccess() {
      if (!isSupported()) {
        setStatus('unsupported');
        throw new Error('当前浏览器不支持文件系统访问。');
      }
      if (requesting) return fileHandle;
      requesting = true;
      setStatus('requesting');
      try {
        const dir = await window.showDirectoryPicker({ id: 'todo-app-folder' });
        const allowed = await verifyPermission(dir);
        if (!allowed) {
          throw new Error('未授予访问项目文件夹的权限。');
        }
        directoryHandle = dir;
        await saveDirectoryHandle(directoryHandle);
        fileHandle = await resolveFileHandle(directoryHandle);
        cachedText = null;
        lastError = null;
        setStatus('ready');
        return fileHandle;
      } catch (err) {
        if (!err || (err.name !== 'AbortError' && err.name !== 'NotAllowedError')) {
          notifyError(err);
        }
        if (!fileHandle) {
          setStatus('pending');
        } else {
          setStatus('ready');
        }
        throw err;
      } finally {
        requesting = false;
      }
    }

    async function read() {
      const handle = await ensureFileHandle();
      if (!handle) return null;
      try {
        const file = await handle.getFile();
        const text = await file.text();
        cachedText = text;
        return text;
      } catch (err) {
        notifyError(err);
        throw err;
      }
    }

    function write(snapshot) {
      if (status !== 'ready') {
        return Promise.reject(new Error('文件尚未就绪'));
      }
      cachedText = snapshot;
      const task = queue.then(() => performWrite(snapshot));
      queue = task.catch(() => {});
      return task.catch((err) => {
        notifyError(err);
        throw err;
      });
    }

    function isReady() {
      return status === 'ready';
    }

    function whenReady() {
      if (isReady()) return Promise.resolve();
      if (status === 'unsupported') {
        return Promise.reject(new Error('当前浏览器不支持文件访问'));
      }
      return new Promise((resolve) => {
        const off = onReady(() => {
          off();
          resolve();
        });
      });
    }

    function getStatus() {
      return status;
    }

    function getLastError() {
      return lastError;
    }

    function getDisplayPath() {
      return FILE_DISPLAY_PATH;
    }

    return {
      init,
      requestAccess,
      onStatusChange,
      onReady,
      onError,
      isReady,
      whenReady,
      read,
      write,
      getStatus,
      getLastError,
      getDisplayPath
    };
  })();

  const Store = {
    async load() {
      try {
        await FileBridge.whenReady();
        const raw = await FileBridge.read();
        if (!raw) return structuredClone(DEFAULT_STATE);
        const data = JSON.parse(raw);
        return this.migrate(data);
      } catch (err) {
        console.warn('读取存储失败，已使用默认数据。', err);
        return structuredClone(DEFAULT_STATE);
      }
    },
    save(state) {
      const snapshot = JSON.stringify(state, null, 2);
      FileBridge.whenReady()
        .then(() => FileBridge.write(snapshot))
        .catch((err) => {
          console.error('保存失败', err);
        });
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
    toggleControl: document.querySelector('#newTodoForm .toggle'),
    storageStatus: document.getElementById('storageStatus'),
    fileOverlay: document.getElementById('fileAccessOverlay'),
    chooseFolderBtn: document.getElementById('chooseFolderBtn'),
    overlayMessage: document.getElementById('fileOverlayMessage'),
    overlayTip: document.querySelector('#fileAccessOverlay .overlay-tip')
  };

  let state = structuredClone(DEFAULT_STATE);
  let searchTerm = '';
  let hasLoadedFromFile = false;

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
    if (hasLoadedFromFile) {
      Store.save(state);
    }
    if (!skipRender) {
      render();
    }
  }

  function updateStorageStatus(status) {
    if (!dom.storageStatus) return;
    let message = '';
    switch (status) {
      case 'ready':
        message = `数据已保存至项目内的 ${FileBridge.getDisplayPath()}。`;
        break;
      case 'requesting':
        message = '正在请求访问项目文件夹，请在弹窗中完成授权。';
        break;
      case 'pending':
        message = `请点击“选择项目文件夹”，系统会把数据写入 ${FileBridge.getDisplayPath()}。`;
        break;
      case 'unsupported':
        message = '当前浏览器不支持写入项目文件，请使用支持 File System Access API 的 Chromium 浏览器。';
        break;
      default:
        message = '正在初始化项目文件存储…';
        break;
    }
    const lastError = FileBridge.getLastError();
    if (lastError) {
      const detail = lastError && lastError.message ? lastError.message : String(lastError);
      message += `\n⚠️ ${detail}`;
    }
    dom.storageStatus.textContent = message;
  }

  function updateFileOverlay(status) {
    if (!dom.fileOverlay) return;
    const shouldShow = status !== 'ready';
    dom.fileOverlay.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    if (dom.chooseFolderBtn) {
      dom.chooseFolderBtn.disabled = status === 'requesting' || status === 'unsupported';
    }
    if (dom.overlayMessage) {
      if (status === 'unsupported') {
        dom.overlayMessage.textContent = '当前浏览器不支持直接写入项目文件，请更换支持 File System Access API 的浏览器。';
      } else {
        dom.overlayMessage.innerHTML = `为了将数据直接写入 <code>${FileBridge.getDisplayPath()}</code>，请点击下方按钮并在弹窗中选择当前 todo 应用所在的项目文件夹。`;
      }
    }
    if (dom.overlayTip) {
      if (status === 'requesting') {
        dom.overlayTip.textContent = '浏览器已弹出目录选择窗口，请选择项目文件夹并授权访问。';
      } else if (status === 'unsupported') {
        dom.overlayTip.textContent = '如需继续，请改用导出功能备份或切换到支持的浏览器。';
      } else {
        dom.overlayTip.textContent = '授权完成后会自动继续，若浏览器提示权限，请允许访问。';
      }
    }
    if (shouldShow && dom.chooseFolderBtn && status === 'pending') {
      setTimeout(() => {
        try {
          dom.chooseFolderBtn.focus({ preventScroll: true });
        } catch (err) {
          dom.chooseFolderBtn.focus();
        }
      }, 30);
    }
  }

  function isFileOverlayActive() {
    return dom.fileOverlay && dom.fileOverlay.getAttribute('aria-hidden') !== 'true';
  }

  function resetLongtermDailyIfNeeded() {
    if (!hasLoadedFromFile) {
      return;
    }
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
  }

  function applyTheme() {
    document.body.removeAttribute('data-theme');
    document.body.style.removeProperty('--custom-bg');
  }

  function updateUndoButton() {
    dom.undoBtn.disabled = !state.prefs.lastUndo;
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
    if (!dom.trashPanel || isFileOverlayActive()) return;
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
    if (!hasLoadedFromFile) return;
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
    if (!hasLoadedFromFile) return;
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
    if (!hasLoadedFromFile) return;
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
    if (!hasLoadedFromFile) return;
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
    if (!hasLoadedFromFile) return;
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
    if (!hasLoadedFromFile) return;
    if (!state.items.some((item) => item.section === 'trash')) return;
    const confirmed = window.confirm('确认要清空垃圾桶吗？此操作不可恢复。');
    if (!confirmed) return;
    mutate((draft) => {
      draft.items = draft.items.filter((item) => item.section !== 'trash');
      draft.prefs.lastUndo = null;
    });
  }

  function addTodo(text, toLongterm) {
    if (!hasLoadedFromFile) return;
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
    if (!hasLoadedFromFile) return;
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
    hasLoadedFromFile = true;
    Store.save(state);
    resetLongtermDailyIfNeeded();
    render();
  }

  function handleImport() {
    if (!hasLoadedFromFile) return;
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
    if (!hasLoadedFromFile) {
      event.target.value = '';
      return;
    }
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

    if (dom.chooseFolderBtn) {
      dom.chooseFolderBtn.addEventListener('click', async () => {
        try {
          await FileBridge.requestAccess();
        } catch (err) {
          if (!err || (err.name !== 'AbortError' && err.name !== 'NotAllowedError')) {
            console.warn('文件夹授权未完成：', err);
          }
        }
      });
    }

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
      if (!hasLoadedFromFile || isFileOverlayActive()) return;
      addTodo(dom.newTodoInput.value, dom.addToLongterm.checked);
      dom.newTodoInput.value = '';
      dom.addToLongterm.checked = false;
      syncToggleSwitch();
      dom.newTodoInput.focus();
    });

    dom.undoBtn.addEventListener('click', () => {
      if (isFileOverlayActive()) return;
      handleUndo();
    });
    if (dom.clearTrashBtn) {
      dom.clearTrashBtn.addEventListener('click', () => {
        if (isFileOverlayActive()) return;
        handleClearTrash();
      });
    }
    dom.exportBtn.addEventListener('click', () => {
      if (isFileOverlayActive()) return;
      exportData();
    });
    dom.importBtn.addEventListener('click', () => {
      if (isFileOverlayActive()) return;
      handleImport();
    });
    dom.importFileInput.addEventListener('change', handleImportFileChange);

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
      if (isFileOverlayActive()) {
        if (event.key === 'Escape') {
          event.preventDefault();
        }
        return;
      }
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

  FileBridge.onStatusChange((status) => {
    updateStorageStatus(status);
    updateFileOverlay(status);
  });

  FileBridge.onError(() => {
    updateStorageStatus(FileBridge.getStatus());
  });

  async function handleFileReady() {
    state = await Store.load();
    hasLoadedFromFile = true;
    resetLongtermDailyIfNeeded();
    render();
  }

  FileBridge.onReady(handleFileReady);

  async function initialize() {
    setupEvents();
    await FileBridge.init();
    if (!FileBridge.isReady()) {
      render();
    }
  }

  initialize();
})();
