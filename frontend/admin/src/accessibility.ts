type AdminOverlay = HTMLElement & { inert?: boolean };

let activeAdminOverlay: AdminOverlay | null = null;
let adminRestoreFocus: HTMLElement | null = null;
let adminBodyOverflow = '';

function setAdminAttributeIfChanged(element: HTMLElement, name: string, value: string): void {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

function adminOverlayIsOpen(element: AdminOverlay): boolean {
    return !element.classList.contains('hidden') && getComputedStyle(element).display !== 'none';
}

function adminFocusableElements(element: HTMLElement): HTMLElement[] {
    return Array.from(element.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(item => getComputedStyle(item).display !== 'none' && getComputedStyle(item).visibility !== 'hidden');
}

function syncAdminOverlays(): void {
    const overlays = Array.from(document.querySelectorAll<AdminOverlay>('#login-overlay, .modal'));
    const next = overlays.filter(adminOverlayIsOpen).at(-1) || null;
    const app = document.getElementById('app') as AdminOverlay | null;

    overlays.forEach(overlay => {
        setAdminAttributeIfChanged(overlay, 'role', 'dialog');
        setAdminAttributeIfChanged(overlay, 'aria-modal', 'true');
        setAdminAttributeIfChanged(overlay, 'aria-hidden', String(!adminOverlayIsOpen(overlay)));
        if (!overlay.hasAttribute('tabindex')) overlay.setAttribute('tabindex', '-1');
        const title = overlay.querySelector<HTMLElement>('h1, h2, h3');
        if (title) {
            if (!title.id) title.id = `${overlay.id || 'admin-overlay'}-title`;
            setAdminAttributeIfChanged(overlay, 'aria-labelledby', title.id);
        }
    });

    if (next && next !== activeAdminOverlay) {
        if (document.activeElement instanceof HTMLElement && !next.contains(document.activeElement)) {
            adminRestoreFocus = document.activeElement;
        }
        activeAdminOverlay = next;
        adminBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        if (app) {
            if (!app.inert) app.inert = true;
            if (!app.hasAttribute('inert')) app.setAttribute('inert', '');
        }
        requestAnimationFrame(() => {
            const focusable = adminFocusableElements(next);
            (focusable[0] || next).focus({ preventScroll: true });
        });
    } else if (!next && activeAdminOverlay) {
        activeAdminOverlay = null;
        document.body.style.overflow = adminBodyOverflow;
        if (app) {
            if (app.inert) app.inert = false;
            app.removeAttribute('inert');
        }
        if (adminRestoreFocus?.isConnected) adminRestoreFocus.focus({ preventScroll: true });
        adminRestoreFocus = null;
    }
}

export function initAdminAccessibility(): void {
    document.querySelectorAll<HTMLElement>('input, select, textarea').forEach(control => {
        const field = control as HTMLInputElement;
        if (field.type === 'hidden') return;
        if (field.getAttribute('aria-label') || field.getAttribute('aria-labelledby') || field.labels?.length) return;
        const nearbyLabel = control.parentElement?.querySelector('label')?.textContent?.trim();
        const fallback = nearbyLabel || field.placeholder || field.name || field.id || field.type;
        if (fallback) field.setAttribute('aria-label', fallback.replace(/\s+/g, ' '));
    });

    document.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
        if (button.getAttribute('aria-label') || button.textContent?.trim()) return;
        const fallback = button.title || button.id.replace(/[-_]+/g, ' ').trim() || '操作按钮';
        button.setAttribute('aria-label', fallback);
    });

    document.addEventListener('keydown', event => {
        if (!activeAdminOverlay) return;
        if (event.key === 'Escape') {
            if (activeAdminOverlay.id === 'login-overlay') return;
            event.preventDefault();
            const closeButton = activeAdminOverlay.querySelector<HTMLButtonElement>('.modal-close');
            if (closeButton) closeButton.click();
            else activeAdminOverlay.classList.add('hidden');
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = adminFocusableElements(activeAdminOverlay);
        if (!focusable.length) {
            event.preventDefault();
            activeAdminOverlay.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }, true);

    const observer = new MutationObserver(syncAdminOverlays);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'hidden', 'style', 'inert'], childList: true, subtree: true });
    syncAdminOverlays();
}
