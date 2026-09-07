import { escapeHtmlText } from './player_security';

/**
 * 初始化播放器内的 Toast 和全局加载提示。
 * 跑马灯逻辑由入口文件提供，避免通知模块反向依赖播放器渲染实现。
 */
export function initPlayerNotifications(getMarqueeHelpers) {
    // 通用 Toast 显示函数 (支持宽屏、滚动文字、点击重置倒计时、动态堆叠)
    function showToast(type, message, duration = 3000) {
        const config = {
            success: { bg: 'bg-emerald-500', icon: 'fa-check-circle' },
            info: { bg: 'bg-blue-500', icon: 'fa-info-circle' },
            error: { bg: 'bg-red-500', icon: 'fa-exclamation-circle' }
        };
        const conf = config[type] || config.info;

        const toast = document.createElement('div');
        // 添加 toast-item 类用于后续高度计算
        toast.className = `toast-item fixed right-4 ${conf.bg} text-white px-4 py-3 rounded-lg shadow-lg z-[1000] animate-slide-in flex items-center gap-3 w-80 md:w-96 max-w-[90vw] cursor-pointer transition-all duration-300`;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
        toast.setAttribute('aria-atomic', 'true');

        const { createMarqueeHtml, applyMarqueeChecks } = getMarqueeHelpers();
        // 使用通用跑马灯逻辑，自动检测文字是否超出容器宽度
        const contentHtml = createMarqueeHtml(message, 'flex-1 font-medium');

        toast.innerHTML = `
            <i class="fas ${conf.icon} text-xl shrink-0"></i>
            ${contentHtml}
        `;

        // Keep notifications above the real player height and the device safe area.
        const footer = document.getElementById('player-footer');
        const footerOffset = footer && !footer.classList.contains('translate-y-[110%]')
            ? Math.ceil(footer.getBoundingClientRect().height)
            : 0;
        const bottomBase = footerOffset + 12;
        const gap = 12;

        toast.style.visibility = 'hidden';
        document.body.appendChild(toast);

        // 触发动态滚动检测
        applyMarqueeChecks();

        const toastHeight = toast.offsetHeight || 60;
        const shiftAmt = toastHeight + gap;

        document.querySelectorAll('.toast-item').forEach(el => {
            if (el === toast) return;
            const oldB = parseFloat(el.dataset.offset || String(bottomBase));
            const newB = oldB + shiftAmt;
            el.style.bottom = `calc(${newB}px + env(safe-area-inset-bottom, 0px))`;
            el.dataset.offset = newB;
        });

        toast.style.bottom = `calc(${bottomBase}px + env(safe-area-inset-bottom, 0px))`;
        toast.dataset.offset = bottomBase;
        toast.style.visibility = 'visible';

        let hideTimer = null;

        const startTimer = () => {
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-4');
                setTimeout(() => {
                    const h = toast.offsetHeight + gap;
                    toast.remove();
                    document.querySelectorAll('.toast-item').forEach(el => {
                        const elB = parseFloat(el.dataset.offset || '0');
                        if (elB > parseFloat(toast.dataset.offset)) {
                            const newB = elB - h;
                            el.style.bottom = `calc(${newB}px + env(safe-area-inset-bottom, 0px))`;
                            el.dataset.offset = newB;
                        }
                    });
                }, 300);
            }, duration);
        };

        startTimer();

        // 点击事件: 重新计时 (用户请求: 点击了那个信息就重新计时隐藏)
        toast.addEventListener('click', () => {
            // 视觉反馈
            toast.classList.add('scale-[1.02]', 'brightness-110');
            setTimeout(() => toast.classList.remove('scale-[1.02]', 'brightness-110'), 150);

            // 重置计时器
            startTimer();
            console.log('[Toast] Timer reset by click');
        });

        // 鼠标悬停暂停计时 (优化体验)
        toast.addEventListener('mouseenter', () => {
            if (hideTimer) clearTimeout(hideTimer);
        });

        toast.addEventListener('mouseleave', () => {
            startTimer();
        });
    }

    // 封装旧 API
    function showSuccess(message) { showToast('success', message, 2000); }
    function showInfo(message) { showToast('info', message, 2000); }
    function showError(message) { showToast('error', message, 2000); }

    /**
     * 全局加载提示 (showLoading)
     */
    function showLoading(message = '正在处理...') {
        if (document.getElementById('global-loading-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'global-loading-overlay';
        overlay.className = "fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in";
        overlay.innerHTML = `
            <div class="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300"></div>
            <div class="t-bg-panel rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 relative z-[210] border t-border-main animate-slide-up">
                <div class="relative">
                    <div class="w-12 h-12 rounded-full border-4 border-emerald-100 border-t-emerald-500 animate-spin"></div>
                    <i class="fas fa-music text-emerald-500 absolute inset-0 flex items-center justify-center text-xs"></i>
                </div>
                <p class="text-sm font-bold t-text-main animate-pulse">${escapeHtmlText(message)}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    function hideLoading() {
        const overlay = document.getElementById('global-loading-overlay');
        if (overlay) {
            overlay.classList.add('opacity-0');
            const content = overlay.querySelector('.t-bg-panel');
            if (content) content.classList.add('scale-95');
            setTimeout(() => overlay.remove(), 300);
        }
    }

    // 清除所有当前显示的 Toast
    function dismissAllToasts() {
        const toasts = document.querySelectorAll('.toast-item');
        toasts.forEach(toast => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        });
    }

    Object.assign(window, {
        showToast,
        showSuccess,
        showInfo,
        showError,
        showLoading,
        hideLoading,
        dismissAllToasts,
    });

    return {
        showToast,
        showSuccess,
        showInfo,
        showError,
        showLoading,
        hideLoading,
        dismissAllToasts,
    };
}
