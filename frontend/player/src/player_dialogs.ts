import { escapeHtmlText } from './player_security';

/**
 * 弹出输入对话框。
 */
export function showInput(title, message, options = {}) {
    const {
        placeholder = '请输入内容...',
        defaultValue = '',
        confirmText = '确定',
        cancelText = '取消',
        confirmColor = 'bg-emerald-500',
        inputType = 'text'
    } = options;
    const safeTitle = escapeHtmlText(title);
    const safeMessage = escapeHtmlText(message);
    const safePlaceholder = escapeHtmlText(placeholder);
    const safeDefaultValue = escapeHtmlText(defaultValue);
    const safeConfirmText = escapeHtmlText(confirmText);
    const safeCancelText = escapeHtmlText(cancelText);
    const safeInputType = ['text', 'password', 'url', 'number', 'search'].includes(inputType) ? inputType : 'text';

    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.id = `runtime-input-modal-${Date.now()}`;
        modal.dataset.a11yOverlay = 'modal';
        modal.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in";
        modal.innerHTML = `
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"></div>
            <div class="t-bg-panel rounded-xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all animate-slide-up relative z-10 border t-border-main">
                <!-- Header -->
                <div class="px-5 py-4 border-b border-emerald-100/50 flex justify-between items-center bg-emerald-50/50">
                    <h3 class="text-sm font-bold t-text-main">${safeTitle}</h3>
                    <button id="modal-close-x" data-overlay-close aria-label="关闭" class="t-text-muted hover:text-emerald-500 transition-colors">
                        <i class="fas fa-times text-lg"></i>
                    </button>
                </div>
                <!-- Body -->
                <div class="p-6">
                    <div class="flex items-start gap-4 mb-4">
                        <div class="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                            <i class="fas fa-edit text-lg"></i>
                        </div>
                        <div class="flex-1">
                            <p class="text-sm t-text-muted leading-relaxed mb-4">${safeMessage}</p>
                            <input type="${safeInputType}" id="modal-input"
                                class="w-full px-4 py-2.5 t-bg-main border t-border-main rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                                placeholder="${safePlaceholder}" value="${safeDefaultValue}">
                        </div>
                    </div>
                </div>
                <!-- Footer -->
                <div class="p-4 t-bg-main/50 border-t t-border-main/50 flex gap-3 flex-row-reverse">
                    <button id="confirm-ok" class="flex-1 py-2.5 text-sm font-bold text-white ${confirmColor} hover:opacity-90 rounded-xl shadow-lg transition-all active:scale-95">
                        ${safeConfirmText}
                    </button>
                    <button id="confirm-cancel" class="flex-1 py-2.5 text-sm font-bold t-text-muted hover:t-text-main hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all">
                        ${safeCancelText}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const input = modal.querySelector('#modal-input');
        input.focus();
        if (defaultValue) input.select();

        const close = (result) => {
            const content = modal.querySelector('.max-w-sm');
            if (content) {
                content.classList.add('scale-95', 'opacity-0');
            }
            modal.classList.add('opacity-0');
            setTimeout(() => {
                modal.remove();
                resolve(result);
            }, 200);
        };

        modal.querySelector('#confirm-ok').onclick = () => close(input.value.trim() || null);
        modal.querySelector('#confirm-cancel').onclick = () => close(null);
        modal.querySelector('#modal-close-x').onclick = () => close(null);
        modal.querySelector('div:first-child').onclick = () => close(null);

        input.onkeydown = (e) => {
            if (e.key === 'Enter') close(input.value.trim() || null);
            if (e.key === 'Escape') close(null);
        };
    });
}

/**
 * 弹出确认对话框。
 */
export function showSelect(title, message, options = {}) {
    const {
        confirmText = '确定',
        cancelText = '取消',
        confirmColor = 'bg-emerald-500',
        danger = false
    } = options;

    const btnColor = danger ? 'bg-red-500 hover:bg-red-600 shadow-red-100' : `${confirmColor} hover:opacity-90 shadow-emerald-100`;
    const safeTitle = escapeHtmlText(title);
    const safeMessage = escapeHtmlText(message);
    const safeConfirmText = escapeHtmlText(confirmText);
    const safeCancelText = escapeHtmlText(cancelText);

    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.id = `runtime-confirm-modal-${Date.now()}`;
        modal.dataset.a11yOverlay = 'modal';
        modal.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in";
        modal.innerHTML = `
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"></div>
            <div class="t-bg-panel rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all animate-slide-up relative z-10 border t-border-main">
                <!-- Header -->
                <div class="px-5 py-4 border-b border-emerald-100/50 flex justify-between items-center bg-emerald-50/50">
                    <h3 class="text-sm font-bold t-text-main">${safeTitle}</h3>
                    <button id="modal-close-x" data-overlay-close aria-label="关闭" class="t-text-muted hover:text-emerald-500 transition-colors">
                        <i class="fas fa-times text-lg"></i>
                    </button>
                </div>
                <!-- Body -->
                <div class="p-6">
                    <div class="flex items-start gap-4">
                        <div class="w-10 h-10 rounded-full ${danger ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'} flex items-center justify-center shrink-0">
                            <i class="fas ${danger ? 'fa-exclamation-triangle' : 'fa-question-circle'} text-lg"></i>
                        </div>
                        <div class="flex-1">
                            <p class="text-sm t-text-muted leading-relaxed">${safeMessage}</p>
                        </div>
                    </div>
                </div>
                <!-- Footer -->
                <div class="p-4 t-bg-main/50 border-t t-border-main/50 flex gap-3 flex-row-reverse">
                    <button id="confirm-ok" class="flex-1 py-2.5 text-sm font-bold text-white ${btnColor} rounded-xl shadow-lg transition-all active:scale-95">
                        ${safeConfirmText}
                    </button>
                    <button id="confirm-cancel" class="flex-1 py-2.5 text-sm font-bold t-text-muted hover:t-text-main hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all">
                        ${safeCancelText}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const close = (result) => {
            const content = modal.querySelector('.max-w-sm');
            if (content) {
                content.classList.add('scale-95', 'opacity-0');
            }
            modal.classList.add('opacity-0');
            setTimeout(() => {
                modal.remove();
                resolve(result);
            }, 200);
        };

        modal.querySelector('#confirm-ok').onclick = () => close(true);
        modal.querySelector('#confirm-cancel').onclick = () => close(false);
        modal.querySelector('#modal-close-x').onclick = () => close(false);
        modal.querySelector('div:first-child').onclick = () => close(false);
    });
}

/**
 * 通用多选选择列表。
 */
export function showOptions(title, message, options = []) {
    const safeTitle = escapeHtmlText(title);
    const safeMessage = escapeHtmlText(message);
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.id = `runtime-options-modal-${Date.now()}`;
        modal.dataset.a11yOverlay = 'modal';
        modal.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in";

        const optionsHtml = options.map(opt => {
            const optionText = String(opt ?? '');
            const safeOption = escapeHtmlText(optionText);
            return `
            <button class="w-full text-left px-4 py-3.5 t-text-main hover:bg-emerald-500 hover:text-white transition-all rounded-xl font-bold text-sm flex items-center justify-between group" data-value="${safeOption}">
                <span>${safeOption}</span>
                <i class="fas fa-chevron-right text-[10px] opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all"></i>
            </button>
        `;
        }).join('');

        modal.innerHTML = `
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"></div>
            <div class="t-bg-panel rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all animate-slide-up relative z-10 border t-border-main">
                <div class="px-5 py-4 border-b border-emerald-100/50 flex justify-between items-center bg-emerald-50/50">
                    <h3 class="text-sm font-bold t-text-main">${safeTitle}</h3>
                    <button id="opt-close-x" data-overlay-close aria-label="关闭" class="t-text-muted hover:text-emerald-500 transition-colors">
                        <i class="fas fa-times text-lg"></i>
                    </button>
                </div>
                <div class="p-3">
                    <p class="px-3 py-2 text-xs t-text-muted mb-2 font-medium">${safeMessage}</p>
                    <div class="max-h-[60vh] overflow-y-auto custom-scrollbar space-y-1">
                        ${optionsHtml}
                    </div>
                </div>
            </div>
        `;

        const close = (result) => {
            const content = modal.querySelector('.max-w-sm');
            if (content) {
                content.classList.add('scale-95', 'opacity-0');
            }
            modal.classList.add('opacity-0');
            setTimeout(() => {
                modal.remove();
                resolve(result);
            }, 200);
        };

        modal.querySelectorAll('button[data-value]').forEach(btn => {
            btn.onclick = () => close(btn.getAttribute('data-value'));
        });

        modal.querySelector('#opt-close-x').onclick = () => close(null);
        modal.querySelector('div:first-child').onclick = () => close(null);

        document.body.appendChild(modal);
    });
}

// These functions are called by legacy inline handlers and other classic scripts.
(window as any).showInput = showInput;
(window as any).showSelect = showSelect;
(window as any).showOptions = showOptions;
