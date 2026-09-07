const PLAYER_DRAWER_IDS = ['queue-drawer', 'cache-drawer', 'download-drawer'];

function syncToastOffsets() {
    const footer = document.getElementById('player-footer');
    const footerOffset = footer && !footer.classList.contains('translate-y-[110%]')
        ? Math.ceil(footer.getBoundingClientRect().height)
        : 0;
    const toasts = Array.from(document.querySelectorAll<HTMLElement>('.toast-item'));
    let nextOffset = footerOffset + 12;
    for (let index = toasts.length - 1; index >= 0; index -= 1) {
        const toast = toasts[index];
        toast.style.bottom = `calc(${nextOffset}px + env(safe-area-inset-bottom, 0px))`;
        toast.dataset.offset = String(nextOffset);
        nextOffset += (toast.offsetHeight || 60) + 12;
    }
}

function syncPlayerDrawerOffset() {
    const footer = document.getElementById('player-footer');
    if (!footer) return;

    const isHidden = footer.classList.contains('translate-y-[110%]');
    const footerHeight = isHidden ? 0 : Math.ceil(footer.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--player-footer-offset', `${footerHeight}px`);
    syncToastOffsets();
}

export function setPlayerDrawerOpen(drawerId: string, open: boolean) {
    PLAYER_DRAWER_IDS.forEach((id) => {
        const drawer = document.getElementById(id);
        if (!drawer) return;

        if (open && id === drawerId) {
            drawer.classList.remove('translate-x-full');
        } else {
            drawer.classList.add('translate-x-full');
        }
        document.querySelectorAll<HTMLElement>(`[aria-controls="${id}"]`).forEach(trigger => {
            trigger.setAttribute('aria-expanded', String(open && id === drawerId));
        });
    });

    syncPlayerDrawerOffset();
}

export function initPlayerDrawerLayout() {
    const footer = document.getElementById('player-footer');
    if (!footer) return;

    syncPlayerDrawerOffset();

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(syncPlayerDrawerOffset).observe(footer);
    }

    new MutationObserver(syncPlayerDrawerOffset).observe(footer, {
        attributes: true,
        attributeFilter: ['class', 'style'],
    });

    window.addEventListener('resize', syncPlayerDrawerOffset, { passive: true });
}

Object.assign(window, { setPlayerDrawerOpen });
document.addEventListener('DOMContentLoaded', initPlayerDrawerLayout);
