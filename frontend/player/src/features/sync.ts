import {
    escapeHtmlText,
    safeInlineString,
} from '../player_security';

export type SyncState = {
    currentListData: any;
    syncModeResolve: ((mode: string) => void) | null;
    currentRemoteOverwriteClient: any;
    remoteSyncModeResolve: ((mode: string) => void) | null;
    lastSelectedRemoteSyncMode: string | null;
    userToken: string | null;
};

export type SyncFeatureContext = {
    state: SyncState;
    syncManager: any;
    credentialStorage: Storage;
    getCredential: (key: string) => string | null;
    getSettings: () => Record<string, any>;
    setUserToken: (token: string | null) => void;
    getUserToken: () => string | null;
    audio: HTMLAudioElement | null;
    getLyricPlayer: () => any;
    persistSettings: (...args: any[]) => any;
    pushSettingsToServer: (...args: any[]) => any;
    loadTokenConfig: (...args: any[]) => any;
    loadLibraryData: (...args: any[]) => any;
    updateUserUI: (...args: any[]) => any;
    updateSetting: (...args: any[]) => any;
    renderMyLists: (...args: any[]) => any;
    pushDataChange: (...args: any[]) => any;
    updateAdminUI: (...args: any[]) => any;
    showSelect: (...args: any[]) => any;
    showSuccess: (...args: any[]) => any;
    showError: (...args: any[]) => any;
};

export function initSyncFeature(context: SyncFeatureContext) {
    const state = context.state;
    const syncManager = context.syncManager;
    const credentialStorage = context.credentialStorage;
    const audio = context.audio;
    const settings = new Proxy<Record<string, any>>({}, {
        get: (_target, property) => context.getSettings()?.[property],
        set: (_target, property, value) => {
            const current = context.getSettings();
            if (current) current[property] = value;
            return true;
        },
    });
    const getCredential = context.getCredential;
    const persistSettings = context.persistSettings;
    const pushSettingsToServer = context.pushSettingsToServer;
    const loadTokenConfig = context.loadTokenConfig;
    const loadLibraryData = context.loadLibraryData;
    const updateUserUI = context.updateUserUI;
    const updateSetting = context.updateSetting;
    const renderMyLists = context.renderMyLists;
    const pushDataChange = context.pushDataChange;
    const updateAdminUI = context.updateAdminUI;
    const showSelect = context.showSelect;
    const showSuccess = context.showSuccess;
    const showError = context.showError;
    const getUserToken = context.getUserToken;
    const setUserToken = context.setUserToken;

function switchSyncMode(mode) {
    const btnLocal = document.getElementById('btn-mode-local');
    const btnRemote = document.getElementById('btn-mode-remote');
    const formLocal = document.getElementById('sync-form-local');
    const formRemote = document.getElementById('sync-form-remote');

    if (mode === 'local') {
        btnLocal.className = "px-4 py-2 rounded-lg text-sm font-medium bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500 transition-all";
        btnRemote.className = "px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 t-text-muted hover:bg-gray-200 transition-all";
        formLocal.classList.remove('hidden');
        formRemote.classList.add('hidden');
    } else {
        btnLocal.className = "px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 t-text-muted hover:bg-gray-200 transition-all";
        btnRemote.className = "px-4 py-2 rounded-lg text-sm font-medium bg-blue-100 text-blue-700 ring-2 ring-blue-500 transition-all";
        formLocal.classList.add('hidden');
        formRemote.classList.remove('hidden');
        // Reset Remote Flow
        handleRemoteBack();
    }
}

function updateSyncStatus(html, showLogout = true) {
    const statusEl = document.getElementById('sync-status');
    const settingsOption = document.getElementById('sync-settings-file-option');
    if (!statusEl) return;

    let fullHtml = html;
    // Show logout button if requested AND we have active data or connection
    const hasActiveLogin = state.currentListData || (syncManager && syncManager.client && syncManager.client.isConnected);
    if (showLogout && hasActiveLogin) {
        fullHtml += ` <button onclick="handleSyncLogout()" class="ml-2 text-red-500 hover:text-red-600 text-[10px] md:text-xs font-bold px-2 py-0.5 rounded border border-red-200 hover:bg-red-300/10 transition-all inline-flex items-center gap-1" title="退出登录"><i class="fas fa-sign-out-alt"></i><span class="hidden sm:inline">退出登录</span></button>`;

        // Add "Sync from Remote" button if in LOCAL mode
        if (localStorage.getItem('lx_sync_mode') === 'local') {
            const username = localStorage.getItem('lx_sync_user') || '该用户';
            fullHtml += ` <button onclick="showRemoteOverwriteModal(${safeInlineString(username)})" class="ml-2 text-emerald-500 hover:text-emerald-600 text-[10px] md:text-xs font-bold px-2 py-0.5 rounded border border-emerald-200 hover:bg-emerald-300/10 transition-all inline-flex items-center gap-1" title="连接远程服务器"><i class="fas fa-satellite-dish"></i><span class="hidden sm:inline">连接远程服务器</span></button>`;
        }
    }
    statusEl.innerHTML = fullHtml;
    // [新增] 状态变化后刷新登录界面禁用状态
    if (typeof updateAdminUI === 'function') updateAdminUI();
}

async function handleSyncLogout(skipConfirm = false) {
    if (!skipConfirm) {
        const confirmed = typeof showSelect === 'function' 
            ? await showSelect('退出同步账号', '确定要退出当前账号并清除同步凭证？', { danger: true })
            : confirm('确定要退出当前账号并清除同步凭证？');
        if (!confirmed) return;
    }

    try {
        // 1. 服务端注销 Token/HttpOnly Session。即使当前页面没有内存 Token，
        // 也必须发起请求，否则浏览器重启后仍会凭 Cookie 自动恢复登录。
        try {
            await fetch('/api/user/logout', {
                method: 'POST',
                headers: state.userToken ? { 'x-user-token': state.userToken } : undefined,
                credentials: 'same-origin'
            });
        } catch (e) { console.warn('[Auth] 用户会话注销失败:', e); }
        state.userToken = null;

        // 2. 关闭 WebSocket 同步连接
        if (syncManager && syncManager.client && typeof syncManager.client.close === 'function') {
            syncManager.client.close();
        }

        // 3. 停止音频播放及歌词，清空内存播放状态
        if (typeof audio !== 'undefined' && audio) {
            try {
                audio.pause();
                audio.currentTime = 0;
                audio.src = '';
            } catch (e) {}
        }
        if (typeof context.getLyricPlayer() !== 'undefined' && context.getLyricPlayer() && typeof context.getLyricPlayer().stop === 'function') {
            try { context.getLyricPlayer().stop(); } catch (e) {}
        }

        window.currentSong = null;
        if (typeof currentSong !== 'undefined') currentSong = null;
        window.playlist = [];
        if (typeof playlist !== 'undefined') playlist = [];
        if (typeof playHistory !== 'undefined') playHistory = [];

        // 4. 重置内存歌单数据
        state.currentListData = null;
        window.currentListData = null;
        window.myPersonalListData = null;
        window.publicListData = null;
        window.isViewingPublicFavorites = false;

        // 5. 清理 IndexedDB 数据
        if (window.ListStore && typeof window.ListStore.remove === 'function') {
            await window.ListStore.remove().catch(e => console.warn('[IDBStore] 清除失败:', e));
        }

        // 6. 清理 CacheStorage 物理缓存 (如 Service Worker / Audio Cache)
        if ('caches' in window) {
            try {
                const keys = await caches.keys();
                await Promise.all(keys.map(key => caches.delete(key)));
            } catch (e) {
                console.warn('[Cache] 物理缓存删除失败:', e);
            }
        }

        // 7. 彻底清空 localStorage & sessionStorage
        const agreementAccepted = localStorage.getItem('lx_agreement_accepted');
        localStorage.clear();
        sessionStorage.clear();
        if (agreementAccepted) {
            localStorage.setItem('lx_agreement_accepted', agreementAccepted);
        }

        // Clear forms if they exist in DOM
        const localUser = document.getElementById('sync-local-user');
        const localPass = document.getElementById('sync-local-pass');
        const remoteUrl = document.getElementById('sync-remote-url');
        const remoteCode = document.getElementById('sync-remote-code');
        if (localUser) localUser.value = '';
        if (localPass) localPass.value = '';
        if (remoteUrl) remoteUrl.value = '';
        if (remoteCode) remoteCode.value = '';

        if (typeof showSuccess === 'function') {
            showSuccess('已安全退出登录并清除所有缓存，正在刷新页面...');
        }

        // 8. 自动刷新网页
        setTimeout(() => {
            window.location.reload();
        }, 300);

    } catch (err) {
        console.error('[Logout] 清除缓存或退出过程出错:', err);
        window.location.reload();
    }
}

async function handleLocalLogin() {
    const user = document.getElementById('sync-local-user').value;
    const pass = document.getElementById('sync-local-pass').value;
    const statusEl = document.getElementById('sync-status');

    if (!user || !pass) {
        showError('请输入用户名和密码');
        return;
    }

    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin text-emerald-500"></i> 正在登录...';

    try {
        syncManager.initLocal(user, pass);
        const success = await syncManager.client.login();

        if (success) {
            statusEl.innerHTML = '<i class="fas fa-check-circle text-emerald-500"></i> 登录成功，正在同步...';

            // [核心优化] 如果已有有效 Token，则不用再请求 /api/user/login 获取新 Token
            if (state.userToken) {
                console.log('[Auth] 检测到现有的 User Token，跳过登录接口直接尝试数据同步。');
            } else {
                try {
                    const tokenRes = await fetch('/api/user/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: user, password: pass })
                    });
                    if (tokenRes.ok) {
                        const tokenData = await tokenRes.json();
                        if (tokenData.token) {
                            state.userToken = tokenData.token;
                            credentialStorage.setItem('lx_user_token', state.userToken);
                            console.log('[Auth] 新用户 Token 已获取并保存');
                        }
                    }
                } catch (e) {
                    console.warn('[Auth] Token 获取失败，回退到旧式认证方式:', e);
                }
            }

            // [新增] 显示并加载 Token 管理面板
            const tokenSection = document.getElementById('token-management-section');
            if (tokenSection) {
                tokenSection.classList.remove('hidden');
                loadTokenConfig();
            }

            // Fetch List
            const listData = await syncManager.sync();
            state.currentListData = listData;
            if (state.currentListData) state.currentListData.username = user; // Attach username
            window.myPersonalListData = state.currentListData; // [个人数据缓存]
            renderMyLists(listData);

            // [Library] 登录后加载收藏歌手/专辑
            loadLibraryData();

            // [Cache] Save list data immediately for offline availability / quick load
            await window.ListStore.set(listData).catch(e => console.error('[IDBStore] 保存失败:', e));

            updateSyncStatus(`<i class="fas fa-check-circle text-emerald-500"></i> 已同步 (用户: ${escapeHtmlText(user)})`);
            // Save credentials to localStorage (Simple version)
            localStorage.setItem('lx_sync_mode', 'local'); // [Fix] Save mode
            localStorage.setItem('lx_sync_user', user);
            credentialStorage.setItem('lx_sync_pass', pass);

            // [新增] 成功登录后立即更新顶部栏 UI
            if (typeof updateUserUI === 'function') updateUserUI();

            // [New] Fetch settings from server if enabled
            if (settings.saveAccountSettingsToFile) {
                fetchSettingsFromServer();
            }

            // [新增] 客户端模式：登录本地服务器后自动触发远程同步
            if (settings.enableClientModeSync && settings.remoteSyncUrl && settings.remoteSyncCode) {
                console.info('[Sync] Client mode auto-triggering remote sync after local login...');
                setTimeout(() => {
                    handleRemoteOverwriteConnect(true);
                }, 1000);
            }
        } else {
            statusEl.innerHTML = '<i class="fas fa-times-circle text-red-500"></i> 登录失败: 用户名或密码错误';
        }
    } catch (e) {
        statusEl.innerHTML = `<i class="fas fa-exclamation-circle text-red-500"></i> 错误: ${escapeHtmlText(e.message)}`;
    }
}

function showSyncModeModal() {
    const modal = document.getElementById('sync-auth-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('sync-connect-form').classList.add('hidden');
    document.getElementById('sync-mode-selection').classList.remove('hidden');
}
window.showSyncModeModal = showSyncModeModal;


function closeSyncModal() {
    const modal = document.getElementById('sync-auth-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    // Reset views
    document.getElementById('sync-connect-form').classList.remove('hidden');
    document.getElementById('sync-mode-selection').classList.add('hidden');

    if (state.syncModeResolve) {
        state.syncModeResolve('cancel');
        state.syncModeResolve = null;
    }
}

function selectSyncMode(mode) {
    const fullOverwrite = document.getElementById('sync-full-overwrite').checked;
    if (fullOverwrite && mode.startsWith('overwrite')) {
        mode += '_full';
    }

    const translatedMode = mode;

    if (state.syncModeResolve) {
        state.syncModeResolve(translatedMode);
        state.syncModeResolve = null;
    }
    closeSyncModal();
}

function cancelSyncMode() {
    if (state.syncModeResolve) {
        state.syncModeResolve('cancel');
        state.syncModeResolve = null;
    }
    closeSyncModal();
}

function handleRemoteStep1() {
    const url = document.getElementById('sync-remote-url').value.trim();
    if (!url) {
        showError('请输入链接地址');
        return;
    }
    // Basic validation
    if (!url.match(/^(ws|http)s?:\/\//)) {
        showError('链接格式错误，应以 http://, https://, ws:// 或 wss:// 开头');
        return;
    }

    document.getElementById('sync-remote-step1').classList.add('hidden');
    document.getElementById('sync-remote-step2').classList.remove('hidden');
}

function handleRemoteBack() {
    document.getElementById('sync-remote-step1').classList.remove('hidden');
    document.getElementById('sync-remote-step2').classList.add('hidden');
    document.getElementById('sync-remote-code').value = ''; // Optional clear
}

function handleRemoteConnect() {
    const url = document.getElementById('sync-remote-url').value;
    const code = document.getElementById('sync-remote-code').value;
    const statusEl = document.getElementById('sync-status');

    if (!code) {
        showError('请输入连接码');
        return;
    }

    statusEl.innerHTML = '<i class="fas fa-spinner fa-spin text-blue-500"></i> 正在连接远程服务器...';

    try {
        let authInfo = null;
        if (localStorage.getItem('lx_sync_url') === url && getCredential('lx_sync_code') === code) {
            try {
                const savedStr = getCredential('lx_ws_auth');
                if (savedStr) authInfo = JSON.parse(savedStr);
            } catch (e) { }
        }

        syncManager.initRemote(url, code, {
            getData: async () => {
                // Try to load from cache first
                const cachedData = await window.ListStore.get().catch(() => null);
                if (cachedData) {
                    console.log('[Cache] 从缓存加载列表数据');
                    return cachedData;
                }
                return state.currentListData || { defaultList: [], loveList: [], userList: [] };
            },
            setData: async (data) => {
                console.log('[Sync] 远程数据已同步:', data);
                // Save to cache
                await window.ListStore.set(data).catch(e => console.error('[IDBStore] 保存失败:', e));
                // Update global
                const oldUsername = state.currentListData ? state.currentListData.username : null;
                state.currentListData = data;
                if (oldUsername) state.currentListData.username = oldUsername; // Preserve username

                // Render UI
                renderMyLists(data);
                updateSyncStatus('<i class="fas fa-check-circle text-blue-500"></i> 数据已同步');
            },
            getSyncMode: async () => {
                return new Promise((resolve) => {
                    state.syncModeResolve = resolve;
                    showSyncModeModal();
                });
            }
        }, authInfo);

        // Setup Callbacks
        syncManager.client.onLogin = async (success, msg) => {
            if (success) {
                updateSyncStatus('<i class="fas fa-check-circle text-green-500"></i> 已连接 (等待同步...)');
                // Remove manual sync() call. Let the server drive the sync via RPC.

                // Save connection info and authInfo to localStorage
                localStorage.setItem('lx_sync_mode', 'remote');
                localStorage.setItem('lx_sync_url', url);
                credentialStorage.setItem('lx_sync_code', code);

                // Save authInfo for reconnection
                if (syncManager.client.authInfo) {
                    credentialStorage.setItem('lx_ws_auth', JSON.stringify(syncManager.client.authInfo));
                    console.log('[Cache] WS认证信息已保存');
                }
            } else {
                statusEl.innerHTML = `<i class="fas fa-times-circle text-red-500"></i> 连接失败: ${escapeHtmlText(msg || '未知错误')}`;
            }
        };

        syncManager.client.connect();

    } catch (e) {
        statusEl.innerHTML = `<i class="fas fa-exclamation-circle text-red-500"></i> 错误: ${escapeHtmlText(e.message)}`;
    }
}

// --- Remote Overwrite Modal Logic ---

function switchRemoteModalStep(stepId) {
    const steps = ['remote-overwrite-step1', 'remote-overwrite-mode-selection', 'remote-overwrite-step2', 'remote-overwrite-result'];
    steps.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === stepId) el.classList.remove('hidden');
            else el.classList.add('hidden');
        }
    });
}

function showRemoteOverwriteModal(username) {
    const modal = document.getElementById('modal-remote-overwrite');
    const content = document.getElementById('modal-remote-overwrite-content');
    if (!modal) return;

    // Reset state and cleanup previous client if any
    if (state.currentRemoteOverwriteClient) {
        state.currentRemoteOverwriteClient.close();
        state.currentRemoteOverwriteClient = null;
    }

    switchRemoteModalStep('remote-overwrite-step1');
    document.getElementById('remote-overwrite-status').innerHTML = '';
    state.remoteSyncModeResolve = null;
    state.lastSelectedRemoteSyncMode = null;

    // Pre-fill from settings
    const urlInput = document.getElementById('remote-overwrite-url');
    const codeInput = document.getElementById('remote-overwrite-code');
    if (urlInput && settings.remoteSyncUrl) urlInput.value = settings.remoteSyncUrl;
    else if (urlInput) {
        const savedUrl = localStorage.getItem('lx_sync_url');
        if (savedUrl) urlInput.value = savedUrl;
    }
    if (codeInput && settings.remoteSyncCode) codeInput.value = settings.remoteSyncCode;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
    }, 10);
}

function closeRemoteOverwriteModal(refresh = false) {
    const modal = document.getElementById('modal-remote-overwrite');
    const content = document.getElementById('modal-remote-overwrite-content');
    if (!modal) return;

    if (state.currentRemoteOverwriteClient) {
        state.currentRemoteOverwriteClient.close();
        state.currentRemoteOverwriteClient = null;
    }

    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

function selectRemoteOverwriteMode(mode) {
    if (state.remoteSyncModeResolve) {
        state.lastSelectedRemoteSyncMode = mode;
        // 保存上次选择的同步模式到设置中，以便客户端模式自动使用
        if (settings.lastRemoteSyncMode !== mode) {
            updateSetting('lastRemoteSyncMode', mode);
        }
        state.remoteSyncModeResolve(mode);
        state.remoteSyncModeResolve = null;
    }
}

async function handleRemoteOverwriteConnect(silent = false) {
    let url = settings.remoteSyncUrl || '';
    let code = settings.remoteSyncCode || '';

    // If not silent or inputs are accessible, try to get from DOM
    const urlInput = document.getElementById('remote-overwrite-url');
    const codeInput = document.getElementById('remote-overwrite-code');
    if (urlInput && urlInput.value.trim()) url = urlInput.value.trim();
    if (codeInput && codeInput.value.trim()) code = codeInput.value.trim();

    const statusEl = document.getElementById('remote-overwrite-status');

    if (!url || !code) {
        if (!silent && statusEl) statusEl.innerText = '请输入完整的连接信息';
        return;
    }

    if (!silent && statusEl) {
        statusEl.innerHTML = '<i class="fas fa-spinner fa-spin text-emerald-500"></i> 正在建立安全连接...';
    }

    if (state.currentRemoteOverwriteClient) state.currentRemoteOverwriteClient.close();
    state.currentRemoteOverwriteClient = new (window as any).RemoteClient(url, code);
    const tempRemoteClient = state.currentRemoteOverwriteClient;

    tempRemoteClient.listHandlers = {
        getData: async () => {
            return state.currentListData || { defaultList: [], loveList: [], userList: [] };
        },
        setData: async (data) => {
            console.log('[RemoteOverwrite] 收到远程数据，准备覆盖本地...');
            try {
                // 1. Update UI and global memory (Preserve username)
                const oldUsername = state.currentListData ? state.currentListData.username : localStorage.getItem('lx_sync_user');
                state.currentListData = data;
                if (oldUsername) state.currentListData.username = oldUsername;

                await window.ListStore.set(data).catch(e => console.error('[IDBStore] 保存失败:', e));
                renderMyLists(data);

                // 2. Push to local server (important!)
                if (syncManager && syncManager.mode === 'local') {
                    await syncManager.push(data);
                    console.log('[RemoteOverwrite] 已推送到本地服务器');
                }
            } catch (err) {
                console.error('[RemoteOverwrite] 覆盖应用失败:', err);
            }
        },
        getSyncMode: async () => {
            console.log('[RemoteOverwrite] Server requested sync mode');
            // 如果开启了客户端模式且有上次选择的模式，则自动选择
            if (settings.enableClientModeSync && settings.lastRemoteSyncMode) {
                console.log('[RemoteOverwrite] Client mode: auto-selecting mode:', settings.lastRemoteSyncMode);
                state.lastSelectedRemoteSyncMode = settings.lastRemoteSyncMode;
                return settings.lastRemoteSyncMode;
            }

            return new Promise((resolve) => {
                state.remoteSyncModeResolve = resolve;
                // If silent and no mode saved, we might have to show the modal anyway
                switchRemoteModalStep('remote-overwrite-mode-selection');
                if (silent) {
                    // Force show modal if it's hidden during silent sync but needs interaction
                    const modal = document.getElementById('modal-remote-overwrite');
                    if (modal && modal.classList.contains('hidden')) {
                        showRemoteOverwriteModal();
                    }
                }
            });
        }
    };

    tempRemoteClient.onLogin = (success, msg) => {
        if (success) {
            // Save address and code to settings and sync to server
            settings.remoteSyncUrl = url;
            settings.remoteSyncCode = code;
            credentialStorage.setItem('lx_sync_code', code);
            persistSettings();
            if (settings.saveAccountSettingsToFile) {
                pushSettingsToServer();
            }
            if (!silent && statusEl) {
                statusEl.innerHTML = '<i class="fas fa-check-circle text-emerald-500"></i> 已连通，等待同步指令...';
            }
        } else {
            if (!silent && statusEl) {
                statusEl.classList.remove('t-text-muted');
                statusEl.classList.add('text-red-500');
                statusEl.innerText = '连接失败: ' + (msg || '未知错误');
            } else if (silent) {
                console.warn('[Sync] Silent connect failed:', msg);
            }
        }
    };

    tempRemoteClient.onSync = (status) => {
        if (status === 'finished') {
            if (!silent) {
                switchRemoteModalStep('remote-overwrite-result');
            } else {
                console.info('[Sync] Silent sync finished.');
                if (window.showInfo) showInfo('远程同步成功');
            }
            tempRemoteClient.close();
            state.currentRemoteOverwriteClient = null;

            // Updated result text logic below...
            const titleEl = document.getElementById('remote-overwrite-result-title');
            const textEl = document.getElementById('remote-overwrite-result-text');
            const username = localStorage.getItem('lx_sync_user') || '该用户';

            if (state.lastSelectedRemoteSyncMode === 'overwrite_local_remote_full') {
                if (titleEl) titleEl.innerText = '推送同步成功！';
                if (textEl) textEl.innerText = '当前本地账户歌单已成功覆盖至远程服务器。';
            } else if (state.lastSelectedRemoteSyncMode === 'merge_local_remote') {
                if (titleEl) titleEl.innerText = '合并同步成功！';
                if (textEl) textEl.innerText = '当前本地账户歌单已成功合并至远程服务器。';
            } else if (state.lastSelectedRemoteSyncMode === 'overwrite_remote_local_full') {
                if (titleEl) titleEl.innerText = '拉取覆盖成功！';
                if (textEl) textEl.innerText = '远程服务器歌单已成功覆盖至当前本地账户。';
            } else if (state.lastSelectedRemoteSyncMode === 'merge_remote_local') {
                if (titleEl) titleEl.innerText = '拉取合并成功！';
                if (textEl) textEl.innerText = '远程服务器歌单已成功合并至当前本地账户。';
            } else {
                if (titleEl) titleEl.innerText = '连接成功';
                if (textEl) textEl.innerText = '远程服务器已连接，当前数据内容与本地完全一致。';
            }

            // Update the status on the main settings page too
            updateSyncStatus(`<i class="fas fa-check-circle text-emerald-500"></i> 远程同步任务已完成 (${escapeHtmlText(username)})`);
        } else if (status === 'started' || status === 'syncing') {
            if (!silent) {
                switchRemoteModalStep('remote-overwrite-step2');
            }
        }
    };

    try {
        await tempRemoteClient.connect();
    } catch (err) {
        if (!silent && statusEl) statusEl.innerText = '初始化失败: ' + err.message;
        else console.error('[Sync] Silent connect failed:', err);
    }
}



    return {
        switchSyncMode,
        updateSyncStatus,
        handleSyncLogout,
        handleLocalLogin,
        showSyncModeModal,
        closeSyncModal,
        selectSyncMode,
        cancelSyncMode,
        handleRemoteStep1,
        handleRemoteBack,
        handleRemoteConnect,
        switchRemoteModalStep,
        showRemoteOverwriteModal,
        closeRemoteOverwriteModal,
        selectRemoteOverwriteMode,
        handleRemoteOverwriteConnect,
    };
}
