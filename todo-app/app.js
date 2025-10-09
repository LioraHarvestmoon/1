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
    filterButtons: Array.from(document.querySelectorAll('.filter-btn')),
    themeToggle: document.getElementById('themeToggle'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    themeFileInput: document.getElementById('themeFileInput'),
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
    cropModal: document.getElementById('cropModal'),
    cropStage: document.getElementById('cropStage'),
    cropImage: document.getElementById('cropImage'),
    cropZoom: document.getElementById('cropZoom'),
    cropConfirmBtn: document.getElementById('cropConfirmBtn'),
    cropCancelBtn: document.getElementById('cropCancelBtn')
  };

  let state = Store.load();
  let searchTerm = '';
  const cropState = {
    img: null,
    scale: 1,
    minScale: 1,
    maxScale: 3,
    translateX: 0,
    translateY: 0,
    pointerId: null,
    startX: 0,
    startY: 0,
    startTranslateX: 0,
    startTranslateY: 0
  };

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

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function mutate(updater, { skipRender = false } = {}) {
    updater(state);
    Store.save(state);
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
  }

  function applyTheme() {
    const theme = state.prefs.theme || 'dark';
    document.body.dataset.theme = theme;
    if (theme === 'image' && state.prefs.bgImageDataUrl) {
      document.body.style.setProperty('--custom-bg', `url(${state.prefs.bgImageDataUrl})`);
    } else {
      document.body.style.removeProperty('--custom-bg');
    }
    const themeButtonLabel = theme === 'image' ? '恢复暗夜' : '自定义背景';
    dom.themeToggle.textContent = themeButtonLabel;
    dom.themeToggle.title = theme === 'image' ? '恢复暗夜背景' : '选择自定义背景图片';
    dom.themeToggle.setAttribute('aria-label', theme === 'image' ? '恢复暗夜背景' : '选择自定义背景图片');
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
    updateFilterButtons();
    mainSections.forEach((section) => renderSection(section));
    renderTrash();
  }

  function updateFilterButtons() {
    dom.filterButtons.forEach((btn) => {
      const active = btn.dataset.filter === state.prefs.filter;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    mainSections.forEach((section) => {
      const column = dom.columns[section];
      if (!column) return;
      if (state.prefs.filter === 'all' || state.prefs.filter === section) {
        column.classList.remove('hidden');
      } else {
        column.classList.add('hidden');
      }
    });
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

    content.textContent = item.text;
    clone.setAttribute('aria-label', item.text);
    clone.title = `创建：${formatDate(item.createdAt)}${
      item.updatedAt && item.updatedAt !== item.createdAt ? `\n更新：${formatDate(item.updatedAt)}` : ''
    }`;

    if (item.section === 'inProgress') {
      checkbox.checked = false;
      checkbox.setAttribute('aria-label', '标记为完成');
    } else if (item.section === 'done') {
      checkbox.checked = true;
      checkbox.setAttribute('aria-label', '还原为进行中');
    } else if (item.section === 'longterm') {
      checkbox.checked = !!item.doneToday;
      checkbox.setAttribute('aria-label', '标记今日已完成');
      longtermStatus.textContent = item.doneToday ? '今日已打卡' : '';
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

  function updateFilter(filter) {
    mutate((draft) => {
      draft.prefs.filter = filter;
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
    resetLongtermDailyIfNeeded();
    render();
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

  function handleThemeToggle() {
    if (state.prefs.theme === 'dark') {
      dom.themeFileInput.click();
    } else {
      const confirmed = window.confirm('恢复暗夜主题？');
      if (!confirmed) return;
      mutate((draft) => {
        draft.prefs.theme = 'dark';
        draft.prefs.bgImageDataUrl = '';
      });
    }
  }

  function handleThemeFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl === 'string') {
        openCropModal(dataUrl);
      }
      dom.themeFileInput.value = '';
    };
    reader.onerror = () => {
      alert('读取图片失败，请重试。');
      dom.themeFileInput.value = '';
    };
    reader.readAsDataURL(file);
  }

  function isCropModalOpen() {
    return !!(dom.cropModal && dom.cropModal.classList.contains('open'));
  }

  function resetCropState() {
    cropState.img = null;
    cropState.scale = 1;
    cropState.minScale = 1;
    cropState.maxScale = 3;
    cropState.translateX = 0;
    cropState.translateY = 0;
    cropState.pointerId = null;
    cropState.startX = 0;
    cropState.startY = 0;
    cropState.startTranslateX = 0;
    cropState.startTranslateY = 0;
    if (dom.cropImage) {
      dom.cropImage.src = '';
      dom.cropImage.style.transform = '';
    }
    if (dom.cropZoom) {
      dom.cropZoom.value = '1';
      dom.cropZoom.min = '1';
      dom.cropZoom.max = '3';
    }
  }

  function openCropModal(dataUrl) {
    if (!dom.cropModal || !dom.cropImage || !dom.cropStage) {
      return;
    }
    resetCropState();
    const img = new Image();
    img.onload = () => {
      cropState.img = img;
      cropState.scale = 1;
      cropState.translateX = 0;
      cropState.translateY = 0;
      dom.cropImage.src = dataUrl;
      requestAnimationFrame(() => {
        updateCropTransform({ updateSlider: true });
      });
    };
    img.onerror = () => {
      alert('无法加载图片，请尝试其他文件。');
      closeCropModal();
    };
    img.src = dataUrl;
    dom.cropModal.classList.add('open');
    dom.cropModal.setAttribute('aria-hidden', 'false');
    const focusTarget = dom.cropCancelBtn || dom.cropConfirmBtn || dom.cropModal;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  }

  function closeCropModal() {
    if (!dom.cropModal) return;
    if (cropState.pointerId && dom.cropStage) {
      try {
        dom.cropStage.releasePointerCapture(cropState.pointerId);
      } catch (err) {
        // ignore
      }
    }
    dom.cropModal.classList.remove('open');
    dom.cropModal.setAttribute('aria-hidden', 'true');
    resetCropState();
    dom.themeFileInput.value = '';
    if (dom.themeToggle) {
      dom.themeToggle.focus();
    }
  }

  function updateCropTransform({ updateSlider = false } = {}) {
    if (!dom.cropStage || !dom.cropImage || !cropState.img) return;
    const rect = dom.cropStage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const minScale = Math.max(rect.width / cropState.img.naturalWidth, rect.height / cropState.img.naturalHeight);
    cropState.minScale = minScale;
    cropState.maxScale = Math.max(minScale * 3, minScale + 0.5);
    cropState.scale = clamp(cropState.scale, cropState.minScale, cropState.maxScale);
    const scaledWidth = cropState.img.naturalWidth * cropState.scale;
    const scaledHeight = cropState.img.naturalHeight * cropState.scale;
    const maxOffsetX = Math.max(0, (scaledWidth - rect.width) / 2);
    const maxOffsetY = Math.max(0, (scaledHeight - rect.height) / 2);
    cropState.translateX = clamp(cropState.translateX, -maxOffsetX, maxOffsetX);
    cropState.translateY = clamp(cropState.translateY, -maxOffsetY, maxOffsetY);
    dom.cropImage.style.transform = `translate(calc(-50% + ${cropState.translateX}px), calc(-50% + ${cropState.translateY}px)) scale(${cropState.scale})`;
    if (updateSlider && dom.cropZoom) {
      dom.cropZoom.min = cropState.minScale.toFixed(2);
      dom.cropZoom.max = cropState.maxScale.toFixed(2);
      dom.cropZoom.value = String(cropState.scale);
    }
  }

  function handleCropZoomChange(event) {
    if (!cropState.img) return;
    const next = parseFloat(event.target.value);
    if (Number.isNaN(next)) return;
    cropState.scale = clamp(next, cropState.minScale, cropState.maxScale);
    updateCropTransform({ updateSlider: true });
  }

  function handleCropPointerDown(event) {
    if (!cropState.img || !dom.cropStage) return;
    event.preventDefault();
    cropState.pointerId = event.pointerId;
    cropState.startX = event.clientX;
    cropState.startY = event.clientY;
    cropState.startTranslateX = cropState.translateX;
    cropState.startTranslateY = cropState.translateY;
    dom.cropStage.setPointerCapture(event.pointerId);
  }

  function handleCropPointerMove(event) {
    if (!cropState.img || cropState.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - cropState.startX;
    const dy = event.clientY - cropState.startY;
    cropState.translateX = cropState.startTranslateX + dx;
    cropState.translateY = cropState.startTranslateY + dy;
    updateCropTransform();
  }

  function handleCropPointerUp(event) {
    if (cropState.pointerId !== event.pointerId) return;
    cropState.pointerId = null;
    if (dom.cropStage) {
      try {
        dom.cropStage.releasePointerCapture(event.pointerId);
      } catch (err) {
        // ignore
      }
    }
  }

  function handleCropConfirm() {
    if (!cropState.img || !dom.cropStage) {
      closeCropModal();
      return;
    }
    const rect = dom.cropStage.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      closeCropModal();
      return;
    }
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      alert('当前环境不支持绘制图片。');
      closeCropModal();
      return;
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(rect.width / 2, rect.height / 2);
    ctx.translate(cropState.translateX, cropState.translateY);
    ctx.scale(cropState.scale, cropState.scale);
    ctx.drawImage(cropState.img, -cropState.img.naturalWidth / 2, -cropState.img.naturalHeight / 2);
    ctx.restore();
    const dataUrl = canvas.toDataURL('image/png');
    mutate((draft) => {
      draft.prefs.bgImageDataUrl = dataUrl;
      draft.prefs.theme = 'image';
    });
    closeCropModal();
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

    dom.filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        updateFilter(btn.dataset.filter);
      });
    });

    dom.undoBtn.addEventListener('click', handleUndo);
    if (dom.clearTrashBtn) {
      dom.clearTrashBtn.addEventListener('click', handleClearTrash);
    }
    dom.exportBtn.addEventListener('click', exportData);
    dom.importBtn.addEventListener('click', handleImport);
    dom.themeToggle.addEventListener('click', handleThemeToggle);
    dom.themeFileInput.addEventListener('change', handleThemeFileChange);
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

    if (dom.cropCancelBtn) {
      dom.cropCancelBtn.addEventListener('click', (event) => {
        event.preventDefault();
        closeCropModal();
      });
    }
    if (dom.cropConfirmBtn) {
      dom.cropConfirmBtn.addEventListener('click', (event) => {
        event.preventDefault();
        handleCropConfirm();
      });
    }
    if (dom.cropZoom) {
      dom.cropZoom.addEventListener('input', handleCropZoomChange);
    }
    if (dom.cropStage) {
      dom.cropStage.addEventListener('pointerdown', handleCropPointerDown);
      dom.cropStage.addEventListener('pointermove', handleCropPointerMove);
      dom.cropStage.addEventListener('pointerup', handleCropPointerUp);
      dom.cropStage.addEventListener('pointercancel', handleCropPointerUp);
      dom.cropStage.addEventListener('lostpointercapture', handleCropPointerUp);
    }
    if (dom.cropModal) {
      dom.cropModal.addEventListener('click', (event) => {
        if (event.target === dom.cropModal) {
          closeCropModal();
        }
      });
    }

    dom.searchInput.addEventListener('input', (event) => {
      updateSearch(event.target.value);
    });

    window.addEventListener('resize', () => {
      if (isCropModalOpen()) {
        updateCropTransform({ updateSlider: true });
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (isCropModalOpen()) {
          event.preventDefault();
          closeCropModal();
          return;
        }
        if (isTrashPanelOpen()) {
          event.preventDefault();
          closeTrashPanel();
          return;
        }
      }

      if (isCropModalOpen()) {
        return;
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

  resetLongtermDailyIfNeeded();
  setupEvents();
  render();
})();
