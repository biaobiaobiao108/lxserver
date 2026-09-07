import { normalizeStoredSettings } from '../player_settings';

export interface SyncSettingsFeatureContext {
    getSettings: () => Record<string, any>;
    setSettings: (settings: Record<string, any>) => void;
    getCredential: (key: string) => string | null;
    getUserAuthHeaders: () => Record<string, string>;
    persistSettings: () => void;
    restoreRemoteSyncCode: (value: any) => void;
    syncSettingsUI: () => void;
    setupNetworkListAutoCheck: () => void;
    pushSoundEffects: () => void;
    fetchSoundEffects: () => void;
    showSuccess: (message: string) => void;
    showError: (message: string) => void;
}

export function initSyncSettingsFeature(context: SyncSettingsFeatureContext) {
    async function pushSettingsToServer(force = false): Promise<void> {
        const settings = context.getSettings();
        if (!force && !settings.saveAccountSettingsToFile) return;
        if (localStorage.getItem('lx_sync_mode') !== 'local'
            && !window.lx_config?.['user.enablePublicRestriction']
            && !force) return;

        const user = localStorage.getItem('lx_sync_user');
        const isPublicMode = !user && window.lx_config?.['user.enablePublicRestriction'];
        if (!user && !isPublicMode && !force) return;

        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (isPublicMode) {
                headers['x-user-name'] = 'default';
                const adminPass = context.getCredential('lx_admin_password');
                if (adminPass) headers['x-frontend-auth'] = adminPass;
            } else {
                Object.assign(headers, context.getUserAuthHeaders());
                const adminPass = context.getCredential('lx_admin_password');
                if (adminPass) headers['x-frontend-auth'] = adminPass;
            }

            const response = await fetch('/api/user/settings', {
                method: 'POST',
                headers,
                body: JSON.stringify(settings),
            });
            if (response.ok) console.log('[Settings] 已成功同步到服务器');
            context.pushSoundEffects();
        } catch (error) {
            console.error('[Settings] 同步到服务器失败:', error);
            if (force) throw error;
        }
    }

    async function manualSaveSettings(button: HTMLButtonElement): Promise<void> {
        const originalText = button.innerHTML;
        try {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> 正在处理...';
            context.persistSettings();
            await pushSettingsToServer(true);

            button.innerHTML = '<i class="fas fa-check mr-2"></i> 保存成功 (已同步到服务器)';
            button.classList.add('bg-emerald-50', 'dark:bg-emerald-500/10', 'text-emerald-600', 'dark:text-emerald-400', 'border-emerald-200');
            button.classList.remove('bg-blue-50', 'dark:bg-blue-500/10', 'text-blue-600', 'dark:text-blue-400', 'border-blue-100');
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('bg-emerald-50', 'dark:bg-emerald-500/10', 'text-emerald-600', 'dark:text-emerald-400', 'border-emerald-200');
                button.classList.add('bg-blue-50', 'dark:bg-blue-500/10', 'text-blue-600', 'dark:text-blue-400', 'border-blue-100');
                button.disabled = false;
            }, 2000);
            context.showSuccess('配置已成功保存并同步至服务器');
        } catch (error) {
            console.error('[Settings] 手动保存失败:', error);
            button.innerHTML = '<i class="fas fa-times mr-2"></i> 保存失败';
            button.classList.add('text-red-500', 'border-red-200');
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('text-red-500', 'border-red-200');
                button.disabled = false;
            }, 2000);
            context.showError('同步失败，请检查网络或登录状态');
        }
    }

    async function fetchSettingsFromServer(): Promise<void> {
        const settings = context.getSettings();
        if (!settings.saveAccountSettingsToFile) return;

        const user = localStorage.getItem('lx_sync_user');
        const isPublicMode = !user && window.lx_config?.['user.enablePublicRestriction'];
        if (!user && !isPublicMode) return;

        try {
            console.log('[Settings] 正在从服务器尝试加载设置...');
            const headers: Record<string, string> = {};
            if (isPublicMode) {
                headers['x-user-name'] = 'default';
                const adminPass = context.getCredential('lx_admin_password');
                if (adminPass) headers['x-frontend-auth'] = adminPass;
            } else {
                Object.assign(headers, context.getUserAuthHeaders());
                const adminPass = context.getCredential('lx_admin_password');
                if (adminPass) headers['x-frontend-auth'] = adminPass;
            }

            const response = await fetch('/api/user/settings', { headers });
            if (!response.ok) {
                console.log('[Settings] 服务器无设置文件或加载失败');
                return;
            }

            const serverSettings = await response.json();
            console.log('[Settings] 从服务器加载设置成功:', serverSettings);
            const mergedSettings = normalizeStoredSettings({ ...context.getSettings(), ...serverSettings });
            context.setSettings(mergedSettings);
            context.restoreRemoteSyncCode(serverSettings?.remoteSyncCode);
            context.persistSettings();
            context.syncSettingsUI();
            context.setupNetworkListAutoCheck();
            context.showSuccess('已从服务器恢复设置');
            context.fetchSoundEffects();
        } catch (error) {
            console.error('[Settings] 从服务器加载设置失败:', error);
        }
    }

    const feature = { pushSettingsToServer, manualSaveSettings, fetchSettingsFromServer };
    Object.assign(window, feature);
    return feature;
}
