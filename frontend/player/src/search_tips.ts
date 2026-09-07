function runSearch() {
    const handler = (window as any).doSearch;
    if (typeof handler === 'function') handler();
}

// Search suggestions logic
let searchTipsDebounceTimer = null;
let currentSelectedTipIndex = -1;
let currentTipAbortController = null;

export function initSearchTips() {
    const searchInput = document.getElementById('search-input');
    const suggestionsContainer = document.getElementById('search-suggestions');

    if (!searchInput || !suggestionsContainer) return;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTipsDebounceTimer);

        if (!query) {
            hideSearchSuggestions();
            return;
        }

        searchTipsDebounceTimer = setTimeout(() => {
            fetchSearchTips(query);
        }, 300);
    });

    searchInput.addEventListener('focus', () => {
        const query = searchInput.value.trim();
        if (query) {
            suggestionsContainer.classList.remove('hidden');
        }
    });

    searchInput.addEventListener('keydown', (e) => {
        const list = document.getElementById('search-suggestions-list');
        const items = list ? list.querySelectorAll('.search-tip-item') : [];

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (items.length === 0) return;
            currentSelectedTipIndex = (currentSelectedTipIndex + 1) % items.length;
            updateTipSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (items.length === 0) return;
            currentSelectedTipIndex = (currentSelectedTipIndex - 1 + items.length) % items.length;
            updateTipSelection(items);
        } else if (e.key === 'Enter') {
            if (currentSelectedTipIndex >= 0 && items[currentSelectedTipIndex]) {
                e.preventDefault();
                const text = items[currentSelectedTipIndex].textContent.trim();
                searchInput.value = text;
                hideSearchSuggestions();
                runSearch();
            }
        } else if (e.key === 'Escape') {
            hideSearchSuggestions();
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            hideSearchSuggestions();
        }
    });
}

function updateTipSelection(items) {
    items.forEach((item, index) => {
        if (index === currentSelectedTipIndex) {
            item.classList.add('t-bg-muted');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('t-bg-muted');
        }
    });
}

async function fetchSearchTips(query) {
    if (currentTipAbortController) currentTipAbortController.abort();
    currentTipAbortController = new AbortController();
    const signal = currentTipAbortController.signal;

    const source = (document.getElementById('search-source')) ? document.getElementById('search-source').value : 'kw';
    try {
        const resp = await fetch(`/api/music/tipSearch?name=${encodeURIComponent(query)}&source=${source}`, { signal });
        if (!resp.ok) return;
        const tips = await resp.json();
        renderSearchTips(tips);
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('[TipSearch] Fetch error:', err);
    } finally {
        if (currentTipAbortController && currentTipAbortController.signal === signal) {
            currentTipAbortController = null;
        }
    }
}

function renderSearchTips(tips) {
    const container = document.getElementById('search-suggestions');
    const list = document.getElementById('search-suggestions-list');
    const input = document.getElementById('search-input');
    if (!container || !list || !input) return;

    // 如果输入框已失去焦点（除非是操作建议列表），或者已经触发了正式搜索，则不再渲染
    if (document.activeElement !== input) {
        container.classList.add('hidden');
        return;
    }

    list.innerHTML = '';
    currentSelectedTipIndex = -1;

    if (!tips || tips.length === 0) {
        container.classList.add('hidden');
        return;
    }

    tips.forEach((tip, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search-tip-item w-full border-0 bg-transparent px-4 py-2.5 hover:t-bg-muted cursor-pointer transition-colors text-sm flex items-center gap-3 text-left';
        button.setAttribute('aria-label', `搜索 ${String(tip ?? '')}`);
        const icon = document.createElement('i');
        icon.className = 'fas fa-search t-text-muted text-xs';
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'truncate';
        label.textContent = String(tip ?? '');
        button.append(icon, label);
        button.onclick = (e) => {
            e.stopPropagation(); // 防止触发 document click
            input.value = tip;
            hideSearchSuggestions();
            runSearch();
        };
        list.appendChild(button);
    });

    container.classList.remove('hidden');
}

function hideSearchSuggestions() {
    const container = document.getElementById('search-suggestions');
    if (container) container.classList.add('hidden');
    currentSelectedTipIndex = -1;

    // 清除待执行的防抖定时器
    if (searchTipsDebounceTimer) {
        clearTimeout(searchTipsDebounceTimer);
        searchTipsDebounceTimer = null;
    }

    // 中止正在进行的请求
    if (currentTipAbortController) {
        currentTipAbortController.abort();
        currentTipAbortController = null;
    }
}
