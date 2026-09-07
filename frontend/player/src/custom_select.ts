export function initCustomSelectManager(getSettingsUiMap, getDefaultSettings) {
    const manager = {
    initAll() {
        document.querySelectorAll('select:not(.cs-hidden)').forEach(select => {
            this.init(select);
        });
    },
    init(select) {
        if (select.classList.contains('cs-hidden')) return;

        // 创建包装器，继承原 select 的布局类（如 flex-1, flex-shrink-0）
        const wrapper = document.createElement('div');
        wrapper.className = 'cs-wrapper';
        // 提取布局类
        const layoutClasses = Array.from(select.classList).filter(c =>
            c.startsWith('flex-') || c.startsWith('md:flex-') ||
            c.startsWith('w-') || c.startsWith('md:w-') ||
            c.startsWith('shrink-') || c.startsWith('md:shrink-')
        );
        if (layoutClasses.length) wrapper.classList.add(...layoutClasses);
        if (select.id) wrapper.id = 'cs-w-' + select.id;

        const trigger = document.createElement('div');
        trigger.className = 'cs-trigger';

        // 精准克隆外观属性以防止大小不一致 (匹配 Tailwind 值)
        if (select.classList.contains('px-4')) { trigger.style.paddingLeft = '1rem'; trigger.style.paddingRight = '1rem'; }
        if (select.classList.contains('py-3')) { trigger.style.paddingTop = '0.75rem'; trigger.style.paddingBottom = '0.75rem'; }
        if (select.classList.contains('py-2')) { trigger.style.paddingTop = '0.5rem'; trigger.style.paddingBottom = '0.5rem'; }
        if (select.classList.contains('rounded-xl')) trigger.style.borderRadius = '0.75rem';
        if (select.classList.contains('text-sm')) trigger.style.fontSize = '0.875rem';
        if (select.classList.contains('font-medium')) trigger.style.fontWeight = '500';

        const text = document.createElement('span');
        text.className = 'cs-trigger-text truncate mr-2';

        const icon = document.createElement('i');
        icon.className = 'fas fa-chevron-down cs-trigger-icon';

        trigger.appendChild(text);
        trigger.appendChild(icon);
        wrapper.appendChild(trigger);

        // 隐藏原始 select
        select.classList.add('cs-hidden');
        select.style.display = 'none';
        select.parentNode.insertBefore(wrapper, select);

        trigger.onclick = (e) => {
            e.stopPropagation();
            const isActive = wrapper.classList.contains('active');
            if (isActive) {
                this.closeAll();
            } else {
                this.closeAll();
                this.open(select, wrapper, trigger);
            }
        };

        // 初始同步 UI
        this.syncUI(select, wrapper);

        // 劫持 value 属性以支持 JS 赋值同步
        try {
            const originalSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
            Object.defineProperty(select, 'value', {
                set: function(val) {
                    originalSetter.call(this, val);
                    window.CustomSelectManager.syncUI(this);
                },
                get: function() {
                    return Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').get.call(this);
                },
                configurable: true
            });
        } catch (e) { console.warn('[CustomSelect] Value hijack failed:', e); }
    },
    open(select, wrapper, trigger) {
        wrapper.classList.add('active');

        // 创建下拉菜单并存入 body
        const dropdown = document.createElement('div');
        dropdown.className = 'cs-dropdown custom-scrollbar portal-active';
        dropdown.id = 'cs-dropdown-' + (select.id || Math.random().toString(36).substr(2, 9));

        const optionsList = document.createElement('ul');
        optionsList.className = 'cs-options';

        Array.from(select.options).forEach(opt => {
            const li = document.createElement('li');
            li.className = 'cs-option' + (opt.selected ? ' selected' : '');
            li.innerHTML = `<span>${opt.text}</span><i class="fas fa-check"></i>`;

            li.onclick = (e) => {
                e.stopPropagation();
                select.value = opt.value;
                select.dispatchEvent(new Event('change'));
                this.syncUI(select, wrapper);
                this.closeAll();
            };
            optionsList.appendChild(li);
        });

        dropdown.appendChild(optionsList);
        document.body.appendChild(dropdown);

        // 计算位置
        this.reposition(trigger, dropdown);

        // 监听滚动以保持同步或关闭
        window.addEventListener('scroll', this.handleScrollOrResize, true);
        window.addEventListener('resize', this.handleScrollOrResize);

        requestAnimationFrame(() => {
            dropdown.classList.add('visible');
        });
    },
    reposition(trigger, dropdown) {
        const rect = trigger.getBoundingClientRect();
        dropdown.style.width = rect.width + 'px';
        dropdown.style.left = rect.left + 'px';

        // 检查空间，自动决定向上还是向下展开
        const spaceBelow = window.innerHeight - rect.bottom;
        const dropdownHeight = dropdown.offsetHeight || 260;

        if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
            dropdown.style.top = (rect.top + window.scrollY - dropdownHeight - 6) + 'px';
            dropdown.classList.add('open-up');
        } else {
            dropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
            dropdown.classList.remove('open-up');
        }
    },
    handleScrollOrResize(e) {
        if (e && e.target && e.target.closest && e.target.closest('.cs-dropdown')) {
            return;
        }
        window.CustomSelectManager.closeAll();
    },
    syncUI(select, wrapper) {
        if (!wrapper) wrapper = select.previousSibling;
        if (!wrapper || !wrapper.classList.contains('cs-wrapper')) return;

        const textEl = wrapper.querySelector('.cs-trigger-text');
        const selectedOpt = select.options[select.selectedIndex];
        if (selectedOpt) {
            textEl.innerText = selectedOpt.text;
            this.updateHighlight(select, wrapper);
        }
    },
    updateHighlight(select, wrapper) {
        const val = select.value;
        let isDefault = false;
        if (select.id) {
            const settingsUiMap = getSettingsUiMap?.() || {};
            const defaultSettings = getDefaultSettings?.() || {};
            const key = Object.keys(settingsUiMap).find(k => settingsUiMap[k].id === select.id);
            if (key && defaultSettings[key] !== undefined) {
                isDefault = (String(val) === String(defaultSettings[key]));
            }
        }

        if (!select.id || isDefault || ['all', 'none', 'root', 'mtime', 'desc', 'wy', '20', 'song'].includes(val)) {
            wrapper.classList.remove('highlight');
        } else {
            wrapper.classList.add('highlight');
        }
    },
    closeAll() {
        document.querySelectorAll('.cs-wrapper.active').forEach(w => w.classList.remove('active'));
        document.querySelectorAll('.cs-dropdown.portal-active').forEach(d => {
            d.remove();
        });
        window.removeEventListener('scroll', this.handleScrollOrResize, true);
        window.removeEventListener('resize', this.handleScrollOrResize);
    }
};

    (window as any).CustomSelectManager = manager;

    document.addEventListener('click', (e) => {
        const manager = (window as any).CustomSelectManager;
        if (!manager) return;
        if (!e.target.closest('.cs-wrapper') && !e.target.closest('.cs-dropdown')) {
            manager.closeAll();
        }
        const sourceContainer = document.getElementById('header-source-container');
        if (sourceContainer && !sourceContainer.contains(e.target as Node)) {
            const dropdown = document.getElementById('header-source-dropdown');
            if (dropdown && !dropdown.classList.contains('hidden')) {
                dropdown.classList.add('hidden');
            }
        }
    });

    // 初始化
    document.addEventListener('DOMContentLoaded', () => {
        const manager = (window as any).CustomSelectManager;
        if (!manager) return;
        manager.initAll();
        if (typeof (window as any).updateHeaderAppearanceIcon === 'function') {
            (window as any).updateHeaderAppearanceIcon();
        }
    });
}
