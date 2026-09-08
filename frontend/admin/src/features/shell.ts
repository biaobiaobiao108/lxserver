import type { AdminFeatureContext } from '../types';
import { credentialStorage, renderSafeMarkdown } from '../utils';

export function initShellFeature(context: AdminFeatureContext) {
    const app = context.app;

    function bindShellEvents() {
        document.getElementById('login-btn')?.addEventListener('click', () => app.login());
        document.getElementById('access-password')?.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') app.login();
        });
        document.getElementById('logout-btn')?.addEventListener('click', () => app.logout());

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (event) => {
                const view = item.dataset.view;
                if (view === 'music') return;
                event.preventDefault();
                app.switchView(view);
            });
        });

        document.querySelectorAll('.action-btn').forEach(button => {
            button.addEventListener('click', () => app.handleQuickAction(button.dataset.action));
        });

        document.querySelectorAll('.modal-close').forEach(button => {
            button.addEventListener('click', () => {
                document.getElementById('edit-password-modal')?.classList.add('hidden');
                document.getElementById('rename-user-modal')?.classList.add('hidden');
                document.getElementById('modal')?.classList.add('hidden');
            });
        });

        document.querySelector('.modal-close')?.addEventListener('click', () => app.closeModal());
        document.getElementById('modal')?.addEventListener('click', (event) => {
            if (event.target.id === 'modal') app.closeModal();
        });

        app.deferredPrompt = null;
        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            app.deferredPrompt = event;
            const installButton = document.getElementById('install-pwa-btn');
            if (installButton) {
                installButton.style.display = 'inline-flex';
                installButton.addEventListener('click', () => app.installPWA());
            }
        });

        document.addEventListener('click', (event) => {
            if (!event.target.closest('.custom-user-selector')) {
                document.querySelectorAll('.selector-dropdown').forEach(dropdown => dropdown.classList.add('hidden'));
                document.querySelectorAll('.custom-user-selector').forEach(selector => selector.classList.remove('open'));
            }
        });

        app.initMobileEvents();
        app.initPlayerLink();
    }

    function initMobileEvents() {
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const mobileSidebarOverlay = document.getElementById('mobile-sidebar-overlay');
        const sidebar = document.querySelector('.sidebar');

        const toggleSidebar = () => {
            sidebar.classList.toggle('active');
            mobileSidebarOverlay.classList.toggle('active');
            if (mobileSidebarOverlay.classList.contains('active')) {
                mobileSidebarOverlay.classList.remove('hidden');
            } else {
                // Wait for animation to finish before hiding
                setTimeout(() => {
                    if (!mobileSidebarOverlay.classList.contains('active')) {
                        mobileSidebarOverlay.classList.add('hidden');
                    }
                }, 300);
            }
        };

        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', toggleSidebar);
        }

        if (mobileSidebarOverlay) {
            mobileSidebarOverlay.addEventListener('click', toggleSidebar);
        }

        // Close on nav click (mobile only)
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('active')) {
                    toggleSidebar();
                }
            });
        });
    }

    async function installPWA() {
        if (!app.deferredPrompt) return;
        app.deferredPrompt.prompt();
        const { outcome } = await app.deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        app.deferredPrompt = null;
        document.getElementById('install-pwa-btn').style.display = 'none';
    }

    async function login() {
        const password = document.getElementById('access-password').value;
        const errorEl = document.getElementById('login-error');

        if (!password) {
            errorEl.textContent = '请输入密码';
            return;
        }

        try {
            const res = await app.request('/api/login', {
                method: 'POST',
                body: JSON.stringify({ password })
            });

            if (res.success) {
                app.password = password;
                credentialStorage.setItem('lx_auth', password);
                app.showApp();
                app.loadDashboard();
            } else {
                errorEl.textContent = '密码错误';
            }
        } catch (err) {
            errorEl.textContent = '登录失败，请重试';
        }
    }

    function logout() {
        void fetch('/api/logout', { method: 'POST' }).catch(() => undefined);
        credentialStorage.removeItem('lx_auth');
        location.reload();
    }

    function showApp() {
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
    }

    async function switchView(viewName) {
        // 更新导航状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewName);
        });

        // 切换视图
        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === `view-${viewName}`);
        });

        // 更新标题
        const titles = {
            dashboard: '仪表盘',
            users: '用户管理',
            data: '数据查看',
            config: '系统配置',
            logs: '系统日志',
            webdav: 'WebDAV同步',
            snapshots: '快照管理',
            about: '关于'
        };
        document.getElementById('page-title').textContent = titles[viewName] || viewName;

        app.currentView = viewName;

        // 加载对应数据
        switch (viewName) {
            case 'dashboard':
                app.loadDashboard();
                break;
            case 'users':
                app.loadUsers();
                break;
            case 'data':
                app.loadUserData();
                break;
            case 'config':
                app.loadConfig();
                break;
            case 'logs':
                app.loadLogs();
                break;
            case 'webdav':
                try {
                    const status = await app.request('/api/status');
                    app.checkWebDAVConfig(status.isWebDAVConfigured);
                    app.loadSyncLogs();
                } catch (e) {
                    console.error('Failed to check webdav status:', e);
                }
                break;
            case 'snapshots':
                app.loadSnapshots();
                break;
            case 'about':
                app.loadAbout();
                break;
            case 'music':
                window.location.href = (window.CONFIG && window.CONFIG['player.path']) || '/music';
                return;
        }
    }

    function handleQuickAction(action) {
        switch (action) {
            case 'add-user':
                app.switchView('users');
                setTimeout(() => app.showAddUserModal(), 100);
                break;
            case 'view-logs':
                app.switchView('logs');
                break;
            case 'edit-config':
                app.switchView('config');
                break;
        }
    }

    async function loadAbout() {
        const container = document.getElementById('about-content');
        if (!container) return;

        try {
            const response = await fetch('/about.md');
            if (!response.ok) throw new Error('Failed to load about.md');
            const text = await response.text();

            // Replace the build hash placeholder; application version is intentionally not shown in the UI.
            const buildHash = (window.CONFIG && window.CONFIG.buildHash) || 'unknown';
            const content = text.replace(/{{buildHash}}/g, buildHash);
            renderSafeMarkdown(container, content);
        } catch (e) {
            console.error('Failed to load about content:', e);
            container.innerHTML = '<p style="color: var(--accent-error); text-align: center;">加载关于页面失败</p>';
        }
    }

    function initPlayerLink() {
        // 初始化播放器链接
        const navPlayerLink = document.getElementById('nav-player-link');
        if (navPlayerLink && window.CONFIG && window.CONFIG['player.path']) {
            navPlayerLink.href = window.CONFIG['player.path'];
        }
    }

    function closeModal() {
        document.getElementById('modal').classList.add('hidden');
    }
    return {
        bindShellEvents,
        initMobileEvents,
        installPWA,
        login,
        logout,
        showApp,
        switchView,
        handleQuickAction,
        loadAbout,
        initPlayerLink,
        closeModal,
    };
}
