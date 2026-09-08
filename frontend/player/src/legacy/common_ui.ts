function closeActiveTooltips(target: Element | null): void {
    document.querySelectorAll<HTMLElement>('.setting-tooltip-trigger.is-active').forEach(trigger => {
        if (trigger !== target) trigger.classList.remove('is-active');
    });
}

document.addEventListener('click', event => {
    const target = event.target as Element | null;
    const trigger = target?.closest('.setting-tooltip-trigger') || null;
    closeActiveTooltips(trigger);
    if (trigger && matchMedia('(hover: none)').matches) {
        trigger.classList.toggle('is-active');
        event.stopPropagation();
    }
});

document.addEventListener('touchstart', event => {
    const target = event.target as Element | null;
    if (!target?.closest('.setting-tooltip-trigger')) closeActiveTooltips(null);
}, { passive: true });

function checkProjectAgreement(): void {
    if (localStorage.getItem('lx_agreement_accepted') === 'true') return;
    const modal = document.getElementById('project-agreement-modal');
    if (!modal) return;
    document.body.appendChild(modal);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function readAgreementInAbout(): void {
    if (typeof (window as any).switchTab === 'function') {
        (window as any).switchTab('about');
        setTimeout(() => {
            const about = document.getElementById('view-about');
            const header = [...(about?.querySelectorAll('h2') || [])].find(element => element.textContent?.includes('项目协议'));
            header?.scrollIntoView({ behavior: 'smooth' });
            if (!header && about) about.scrollTo({ top: about.scrollHeight, behavior: 'smooth' });
        }, 500);
    }
    if (innerWidth <= 1024 && typeof (window as any).toggleSidebar === 'function') {
        const sidebar = document.getElementById('main-sidebar');
        if (sidebar && !sidebar.classList.contains('-translate-x-full')) (window as any).toggleSidebar();
    }
}

function acceptProjectAgreement(): void {
    localStorage.setItem('lx_agreement_accepted', 'true');
    const modal = document.getElementById('project-agreement-modal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        readAgreementInAbout();
    }, 300);
}

Object.assign(window, { checkProjectAgreement, acceptProjectAgreement, readAgreementInAbout });
document.addEventListener('DOMContentLoaded', checkProjectAgreement);
