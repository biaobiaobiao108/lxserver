export interface AuthFeatureContext {
    credentialStorage: Storage;
    getCredential: (key: string) => string | null;
    getUserToken: () => string | null;
    setUserToken: (token: string | null) => void;
    isUserSessionActive: () => boolean;
    showSelect: (...args: any[]) => Promise<boolean>;
    handleSyncLogout: (skipConfirm?: boolean) => Promise<void>;
}

export function initAuthFeature(context: AuthFeatureContext) {
    let userTokenRefreshPromise: Promise<boolean> | null = null;

    /**
     * 生成用户 API 请求所需的认证 Headers。
     * 优先使用 Token，若无 Token 则兼容旧的 x-user-password 方式。
     * 注意：此函数总是返回“真实用户”的凭证，不受公开收藏视图影响。
     */
    function getUserAuthHeaders(): Record<string, string> {
        let username = localStorage.getItem('lx_sync_user') || '';
        if (username === '_open') username = '';

        const headers: Record<string, string> = {};
        const userToken = context.getUserToken();
        const adminPass = context.getCredential('lx_admin_password');

        if (userToken) {
            headers['x-user-name'] = username;
            headers['x-user-token'] = userToken;
        } else {
            const pass = context.getCredential('lx_sync_pass');
            if (username && pass) {
                headers['x-user-name'] = username;
                headers['x-user-password'] = pass;
            } else if (username) {
                headers['x-user-name'] = username;
            }
        }
        if (adminPass) headers['x-frontend-auth'] = adminPass;
        return headers;
    }

    function isUserLoggedIn(): boolean {
        const user = localStorage.getItem('lx_sync_user');
        const token = context.getCredential('lx_user_token');
        const pass = context.getCredential('lx_sync_pass');
        return !!user && user !== '_open' && !!(token || pass || context.isUserSessionActive());
    }

    function isPublicLibraryContext(): boolean {
        return !isUserLoggedIn();
    }

    async function ensureUserAuthToken(options: { force?: boolean } = {}): Promise<boolean> {
        const force = options.force === true;
        const username = localStorage.getItem('lx_sync_user') || '';
        const password = context.getCredential('lx_sync_pass') || '';
        const currentToken = context.getUserToken();

        if (!username || !password) {
            if (force) {
                context.setUserToken(null);
                context.credentialStorage.removeItem('lx_user_token');
                updateUserUI();
            }
            return false;
        }
        if (currentToken && !force) return true;
        if (userTokenRefreshPromise) return userTokenRefreshPromise;

        userTokenRefreshPromise = (async () => {
            if (force) {
                context.setUserToken(null);
                context.credentialStorage.removeItem('lx_user_token');
            }
            try {
                const response = await fetch('/api/user/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                if (!response.ok) return false;

                const result = await response.json();
                if (!result.success || !result.token) return false;

                context.setUserToken(result.token);
                context.credentialStorage.setItem('lx_user_token', result.token);
                updateUserUI();
                return true;
            } catch (error) {
                console.warn('[Auth] Token 自动续签失败:', error);
                return false;
            } finally {
                userTokenRefreshPromise = null;
            }
        })();

        return userTokenRefreshPromise;
    }

    /** 更新顶部栏的用户状态显示。 */
    function updateUserUI() {
        const loginBtn = document.getElementById('header-login-btn');
        const userDisplay = document.getElementById('header-user-display');
        const usernameEl = document.getElementById('header-username');
        if (!loginBtn || !userDisplay || !usernameEl) return;

        const username = localStorage.getItem('lx_sync_user');
        const token = context.getCredential('lx_user_token');
        if ((token || context.isUserSessionActive()) && username) {
            loginBtn.classList.add('hidden');
            loginBtn.classList.remove('flex');
            userDisplay.classList.add('flex');
            userDisplay.classList.remove('hidden');
            usernameEl.innerText = username;
        } else {
            loginBtn.classList.add('flex');
            loginBtn.classList.remove('hidden');
            userDisplay.classList.add('hidden');
            userDisplay.classList.remove('flex');
        }
    }

    /** 顶部栏退出登录处理。 */
    async function handleHeaderLogout(event?: Event) {
        event?.stopPropagation();
        await context.handleSyncLogout(false);
    }

    const feature = {
        getUserAuthHeaders,
        isUserLoggedIn,
        isPublicLibraryContext,
        ensureUserAuthToken,
        updateUserUI,
        handleHeaderLogout,
    };
    Object.assign(window, feature);
    return feature;
}
