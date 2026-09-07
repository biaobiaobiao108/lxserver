let customSelectId = 0;

export function initCustomSelectManager(getSettingsUiMap, getDefaultSettings) {
    const manager = {
        activeTrigger: null as HTMLButtonElement | null,
        activeWrapper: null as HTMLElement | null,

        initAll() {
            document.querySelectorAll('select:not(.cs-hidden)').forEach(select => {
                this.init(select as HTMLSelectElement);
            });
        },

        init(select: HTMLSelectElement) {
            if (select.classList.contains('cs-hidden') || select.dataset.csInitialized === 'true') return;

            const parent = select.parentNode;
            if (!parent) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'cs-wrapper';

            // 继承原 select 的布局类（如 flex-1, flex-shrink-0）
            const layoutClasses = Array.from(select.classList).filter(c =>
                c.startsWith('flex-') || c.startsWith('md:flex-') ||
                c.startsWith('w-') || c.startsWith('md:w-') ||
                c.startsWith('shrink-') || c.startsWith('md:shrink-')
            );
            if (layoutClasses.length) wrapper.classList.add(...layoutClasses);
            if (select.id) wrapper.id = 'cs-w-' + select.id;

            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'cs-trigger';
            trigger.id = `cs-trigger-${select.id || ++customSelectId}`;
            trigger.setAttribute('aria-haspopup', 'listbox');
            trigger.setAttribute('aria-expanded', 'false');

            const dropdownId = `cs-dropdown-${select.id || customSelectId}`;
            trigger.setAttribute('aria-controls', dropdownId);

            // 精准克隆外观属性以防止大小不一致（匹配现有 Tailwind 值）
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
            icon.setAttribute('aria-hidden', 'true');

            trigger.append(text, icon);
            wrapper.appendChild(trigger);
            select.classList.add('cs-hidden');
            select.style.display = 'none';
            select.setAttribute('aria-hidden', 'true');
            parent.insertBefore(wrapper, select);
            select.dataset.csInitialized = 'true';

            trigger.addEventListener('click', event => {
                event.stopPropagation();
                if (wrapper.classList.contains('active')) {
                    this.closeAll();
                } else {
                    this.closeAll();
                    this.open(select, wrapper, trigger, true);
                }
            });
            trigger.addEventListener('keydown', event => this.handleTriggerKeydown(event, select, wrapper, trigger));

            this.syncUI(select, wrapper);

            // 劫持 value 属性以支持现有 JS 赋值时同步自定义触发器。
            try {
                const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
                if (!valueDescriptor?.set || !valueDescriptor.get) return;
                Object.defineProperty(select, 'value', {
                    set: function (val) {
                        valueDescriptor.set!.call(this, val);
                        window.CustomSelectManager.syncUI(this);
                    },
                    get: function () {
                        return valueDescriptor.get!.call(this);
                    },
                    configurable: true,
                });
            } catch (error) {
                console.warn('[CustomSelect] Value hijack failed:', error);
            }
        },

        handleTriggerKeydown(event: KeyboardEvent, select: HTMLSelectElement, wrapper: HTMLElement, trigger: HTMLButtonElement) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            if (wrapper.classList.contains('active')) {
                this.closeAll();
            } else {
                this.closeAll();
                this.open(select, wrapper, trigger, true);
            }
        },

        open(select: HTMLSelectElement, wrapper: HTMLElement, trigger: HTMLButtonElement, focusSelected = false) {
            wrapper.classList.add('active');
            this.activeTrigger = trigger;
            this.activeWrapper = wrapper;

            const dropdown = document.createElement('div');
            dropdown.className = 'cs-dropdown custom-scrollbar portal-active';
            dropdown.id = trigger.getAttribute('aria-controls') || `cs-dropdown-${++customSelectId}`;
            dropdown.setAttribute('role', 'listbox');
            dropdown.setAttribute('aria-labelledby', trigger.id);
            dropdown.tabIndex = -1;

            const optionsList = document.createElement('ul');
            optionsList.className = 'cs-options';

            Array.from(select.options).forEach((option, index) => {
                const item = document.createElement('li');
                const selected = select.selectedIndex === index;
                item.className = 'cs-option' + (selected ? ' selected' : '');
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', String(selected));
                item.dataset.index = String(index);
                item.dataset.value = option.value;
                item.tabIndex = option.disabled ? -1 : 0;
                if (option.disabled) {
                    item.classList.add('disabled');
                    item.setAttribute('aria-disabled', 'true');
                }

                const label = document.createElement('span');
                label.textContent = option.text;
                const check = document.createElement('i');
                check.className = 'fas fa-check';
                check.setAttribute('aria-hidden', 'true');
                item.append(label, check);

                item.addEventListener('click', event => {
                    event.stopPropagation();
                    if (option.disabled) return;
                    this.selectOption(select, wrapper, trigger, option);
                });
                item.addEventListener('keydown', event => this.handleDropdownKeydown(event, select, wrapper, trigger, dropdown));
                optionsList.appendChild(item);
            });

            dropdown.appendChild(optionsList);
            document.body.appendChild(dropdown);
            trigger.setAttribute('aria-expanded', 'true');

            this.reposition(trigger, dropdown);
            window.addEventListener('scroll', this.handleScrollOrResize, true);
            window.addEventListener('resize', this.handleScrollOrResize);

            requestAnimationFrame(() => {
                dropdown.classList.add('visible');
                if (focusSelected) {
                    const selected = dropdown.querySelector('.cs-option.selected:not(.disabled)') as HTMLElement | null;
                    const first = dropdown.querySelector('.cs-option:not(.disabled)') as HTMLElement | null;
                    (selected || first)?.focus();
                }
            });
        },

        handleDropdownKeydown(
            event: KeyboardEvent,
            select: HTMLSelectElement,
            wrapper: HTMLElement,
            trigger: HTMLButtonElement,
            dropdown: HTMLElement,
        ) {
            const options = Array.from(dropdown.querySelectorAll('.cs-option:not(.disabled)')) as HTMLElement[];
            if (!options.length) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                this.closeAll(true);
                return;
            }

            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const focused = document.activeElement as HTMLElement | null;
                const index = Number(focused?.dataset.index);
                const option = Number.isInteger(index) ? select.options[index] : null;
                if (option && !option.disabled) this.selectOption(select, wrapper, trigger, option);
                return;
            }

            let nextIndex = options.indexOf(document.activeElement as HTMLElement);
            if (event.key === 'ArrowDown') nextIndex = (nextIndex + 1 + options.length) % options.length;
            else if (event.key === 'ArrowUp') nextIndex = (nextIndex - 1 + options.length) % options.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = options.length - 1;
            else return;

            event.preventDefault();
            options[nextIndex]?.focus();
        },

        selectOption(select: HTMLSelectElement, wrapper: HTMLElement, trigger: HTMLButtonElement, option: HTMLOptionElement) {
            select.value = option.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            this.syncUI(select, wrapper);
            this.closeAll(true);
            trigger.focus();
        },

        reposition(trigger: HTMLButtonElement, dropdown: HTMLElement) {
            const rect = trigger.getBoundingClientRect();
            const viewportPadding = 8;
            const width = Math.min(Math.max(rect.width, 120), Math.max(120, window.innerWidth - viewportPadding * 2));
            const left = Math.min(Math.max(viewportPadding, rect.left), window.innerWidth - width - viewportPadding);
            dropdown.style.width = width + 'px';
            dropdown.style.left = left + window.scrollX + 'px';

            const spaceBelow = window.innerHeight - rect.bottom;
            const dropdownHeight = Math.min(dropdown.scrollHeight || 260, 280);
            dropdown.style.maxHeight = Math.max(140, Math.min(280, Math.max(spaceBelow, rect.top) - 16)) + 'px';

            if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
                dropdown.style.top = (rect.top + window.scrollY - dropdownHeight - 6) + 'px';
                dropdown.classList.add('open-up');
            } else {
                dropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
                dropdown.classList.remove('open-up');
            }
        },

        handleScrollOrResize(event?: Event) {
            const target = event?.target;
            if (target instanceof Element && target.closest('.cs-dropdown')) return;
            window.CustomSelectManager.closeAll();
        },

        syncUI(select: HTMLSelectElement, wrapper?: HTMLElement) {
            if (!wrapper) wrapper = select.previousElementSibling as HTMLElement | null;
            if (!wrapper || !wrapper.classList.contains('cs-wrapper')) return;

            const textEl = wrapper.querySelector('.cs-trigger-text');
            const trigger = wrapper.querySelector('.cs-trigger') as HTMLButtonElement | null;
            const selectedOption = select.options[select.selectedIndex];
            if (selectedOption && textEl) {
                textEl.textContent = selectedOption.text;
                if (trigger) trigger.title = selectedOption.text;
                this.updateHighlight(select, wrapper);
                this.updateOpenOptions(select);
            }
        },

        updateOpenOptions(select: HTMLSelectElement) {
            const wrapper = select.previousElementSibling as HTMLElement | null;
            const dropdownId = wrapper?.querySelector('.cs-trigger')?.getAttribute('aria-controls');
            const dropdown = dropdownId ? document.getElementById(dropdownId) : null;
            if (!dropdown) return;
            dropdown.querySelectorAll('.cs-option').forEach(item => {
                const index = Number((item as HTMLElement).dataset.index);
                const selected = index === select.selectedIndex;
                item.classList.toggle('selected', selected);
                item.setAttribute('aria-selected', String(selected));
            });
        },

        updateHighlight(_select: HTMLSelectElement, wrapper: HTMLElement) {
            // Selection is communicated by the checkmark and aria-selected.
            // Keep clearing the legacy class so existing integrations cannot
            // reintroduce a persistent theme highlight for non-default values.
            wrapper.classList.remove('highlight');
        },

        closeAll(restoreFocus = false) {
            const trigger = this.activeTrigger;
            document.querySelectorAll('.cs-wrapper.active').forEach(wrapper => wrapper.classList.remove('active'));
            document.querySelectorAll('.cs-dropdown.portal-active').forEach(dropdown => dropdown.remove());
            document.querySelectorAll('.cs-trigger[aria-expanded="true"]').forEach(element => {
                element.setAttribute('aria-expanded', 'false');
            });
            this.activeTrigger = null;
            this.activeWrapper = null;
            window.removeEventListener('scroll', this.handleScrollOrResize, true);
            window.removeEventListener('resize', this.handleScrollOrResize);
            if (restoreFocus) trigger?.focus();
        },
    };

    (window as any).CustomSelectManager = manager;

    document.addEventListener('click', event => {
        const currentManager = (window as any).CustomSelectManager;
        if (!currentManager || !(event.target instanceof Element)) return;
        if (!event.target.closest('.cs-wrapper') && !event.target.closest('.cs-dropdown')) {
            currentManager.closeAll();
        }

        const sourceContainer = document.getElementById('header-source-container');
        if (sourceContainer && !sourceContainer.contains(event.target)) {
            const dropdown = document.getElementById('header-source-dropdown');
            if (dropdown && !dropdown.classList.contains('hidden')) dropdown.classList.add('hidden');
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        const currentManager = (window as any).CustomSelectManager;
        if (!currentManager) return;
        currentManager.initAll();
        if (typeof (window as any).updateHeaderAppearanceIcon === 'function') {
            (window as any).updateHeaderAppearanceIcon();
        }
    });
}
