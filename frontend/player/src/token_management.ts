import { escapeHtmlText, safeInlineString } from './player_security';

function getUserAuthHeaders() {
    const handler = (window as any).getUserAuthHeaders;
    return typeof handler === 'function' ? handler() : {};
}

function getPlayerSettings() {
    return (window as any).settings || {};
}

function showSuccess(message) {
    const handler = (window as any).showSuccess;
    if (typeof handler === 'function') handler(message);
}

function showError(message) {
    const handler = (window as any).showError;
    if (typeof handler === 'function') handler(message);
    else console.error(message);
}

function showSelect(...args: any[]) {
    const handler = (window as any).showSelect;
    return typeof handler === 'function' ? handler(...args) : Promise.resolve(false);
}

function updatePlayerSetting(...args: any[]) {
    const handler = (window as any).updateSetting;
    return typeof handler === 'function' ? handler(...args) : Promise.resolve();
}

// ===== 持久化 Token 管理逻辑 =====

/**
 * 加载并渲染持久化 Token 配置
 */
export async function loadTokenConfig() {
    const section = document.getElementById('token-management-section');
    if (!section) return;

    try {
        const res = await fetch('/api/user/token/config', {
            headers: getUserAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to load token config');

        const { config } = await res.json();
        const toggle = document.getElementById('setting-enable-persistent-token');
        const container = document.getElementById('token-list-container');

        if (toggle) toggle.checked = config.enabled;

        // [核心改进] 关闭认证时彻底隐藏下方列表
        if (config.enabled) {
            container.classList.remove('hidden', 'opacity-50', 'pointer-events-none');
        } else {
            container.classList.add('hidden');
        }

        // 同步到全局 settings
        getPlayerSettings().enablePersistentToken = config.enabled;

        renderTokenList(config.tokens || []);
    } catch (e) {
        console.error('[Token] Failed to load config:', e);
    }
}

/**
 * 渲染 Token 列表 UI
 */
function renderTokenList(tokens) {
    const list = document.getElementById('token-items');
    if (!list) return;

    if (tokens.length === 0) {
        list.innerHTML = '<div class="text-[10px] t-text-muted text-center py-6 border-2 border-dashed t-border-main rounded-xl italic opacity-60">暂无生成的 API Token</div>';
        return;
    }

    list.innerHTML = tokens.map(t => {
        const tokenValue = String(t.token ?? '');
        const tokenNameValue = String(t.name ?? '未命名 Token');
        const masked = `${tokenValue.slice(0, 6)}...${tokenValue.slice(-4)}`;
        const maskedArg = safeInlineString(masked);
        const tokenArg = safeInlineString(tokenValue);
        const tokenName = escapeHtmlText(tokenNameValue);
        const tokenNameArg = safeInlineString(tokenNameValue);
        const expiresAt = Number(t.expiresAt) || 0;
        const isExpired = expiresAt > 0 && expiresAt < Date.now();
        const isDisabled = !!t.disabled;

        return `
        <div class="t-bg-item rounded-3xl p-4 md:p-6 border t-border-main hover:t-border-primary transition-all duration-300 group ${isExpired || isDisabled ? 'opacity-60' : ''}">
            <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-bold t-text-main mb-1.5 truncate flex flex-wrap items-center gap-2">
                        <span>${tokenName}</span>
                        <span class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-mono border border-emerald-500/20">${escapeHtmlText(masked)}</span>
                        ${isExpired ? '<span class="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[9px] font-bold border border-red-500/20 whitespace-nowrap">已过期</span>' : ''}
                        ${isDisabled ? '<span class="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 text-[9px] font-bold border border-orange-500/20 whitespace-nowrap">已禁用</span>' : ''}
                    </div>
                    <div class="text-[11px] t-text-muted mt-2 flex flex-col sm:flex-row sm:flex-wrap gap-y-1 sm:gap-x-4 items-start sm:items-center opacity-80">
                        <span class="inline-flex items-center gap-1.5"><i class="far fa-calendar-plus opacity-50 text-[10px]"></i> ${new Date(t.createdAt).toLocaleString()}</span>
                        <span class="inline-flex items-center gap-1.5"><i class="far fa-clock opacity-50 text-[10px]"></i> ${expiresAt ? escapeHtmlText(new Date(expiresAt).toLocaleString()) : '永久有效'}</span>
                    </div>
                    ${t.lastUsed ? `<div class="text-[10px] text-emerald-500/90 mt-2 flex items-center gap-1.5 font-medium"><i class="fas fa-history text-[9px]"></i> 最后调用: ${new Date(t.lastUsed).toLocaleString()}</div>` : ''}
                </div>

                <div class="flex items-center justify-between md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-0 t-border-main border-dashed">
                    <!-- 状态切换 (使用统一的 Tailwind 样式) -->
                    <div class="flex items-center gap-2">
                        <span class="text-[11px] t-text-muted opacity-70 hidden sm:inline">${isDisabled ? '停用中' : '生效中'}</span>
                        <label class="relative inline-flex items-center cursor-pointer scale-[0.85]">
                            <input type="checkbox" ${!isDisabled ? 'checked' : ''} data-event-change-action="handleToggleTokenStatus" data-event-change-args="[${maskedArg}, &quot;@not-checked&quot;]" class="sr-only peer">
                            <div class="w-11 h-6 bg-gray-200/50 peer-focus:outline-none rounded-full peer dark:bg-gray-700/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500"></div>
                        </label>
                    </div>

                    <div class="flex items-center gap-1">
                        <button data-event-click-action="openTokenLogsModal" data-event-click-args="[${maskedArg}, ${tokenNameArg}]"
                            class="p-2 md:p-2.5 rounded-xl t-bg-track hover:t-bg-primary hover:text-white transition-all group/btn" title="查看日志">
                            <i class="fas fa-list-ul text-[13px] md:text-[14px]"></i>
                        </button>
                        <button data-event-click-action="openEditTokenModal" data-event-click-args="[${maskedArg}, ${tokenNameArg}, ${expiresAt}]"
                            class="p-2 md:p-2.5 rounded-xl t-bg-track hover:t-bg-primary hover:text-white transition-all group/btn" title="编辑信息">
                            <i class="fas fa-pencil-alt text-[13px] md:text-[14px]"></i>
                        </button>
                        <button data-event-click-action="copyTokenToClipboard" data-event-click-args="[${tokenArg}]"
                            class="p-2 md:p-2.5 rounded-xl t-bg-track hover:bg-blue-500 hover:text-white transition-all group/btn" title="复制 Token">
                            <i class="far fa-copy text-[13px] md:text-[14px]"></i>
                        </button>
                        <button data-event-click-action="handleRemoveToken" data-event-click-args="[${tokenArg}]"
                            class="p-2 md:p-2.5 rounded-xl t-bg-track hover:bg-red-500 hover:text-white transition-all group/btn" title="删除 Token">
                            <i class="far fa-trash-alt text-[13px] md:text-[14px]"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `
    }).join('');
}

/**
 * 切换单个 Token 的启用/禁用状态
 */
async function handleToggleTokenStatus(tokenMasked, disabled) {
    try {
        const res = await fetch('/api/user/token/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
            body: JSON.stringify({ tokenMasked, disabled })
        });
        if (res.ok) {
            showSuccess(`已${disabled ? '停用' : '启用'}该凭证`);
            loadTokenConfig();
        } else {
            showError('操作失败');
            loadTokenConfig(); // 失败则回刷状态
        }
    } catch (e) {
        showError('请求异常');
        loadTokenConfig();
    }
}

/**
 * 切换 Token 校验功能显隐
 */
async function toggleTokenAuthSetting(enabled, silent = false) {
    try {
        const res = await fetch('/api/user/token/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
            body: JSON.stringify({ enabled })
        });
        if (res.ok) {
            if (!silent) showSuccess(`持久化 Token 已${enabled ? '启用' : '禁用'}`);
            // [核心修复] 使用 updateSetting 联动同步 localStorage 和服务器 settings.json
            await updatePlayerSetting('enablePersistentToken', enabled);
            await loadTokenConfig();
        } else {
            throw new Error();
        }
    } catch (e) {
        if (!silent) showError('更新 Token 配置失败');
        // 还原 UI 开关
        const toggle = document.getElementById('setting-enable-persistent-token');
        if (toggle) toggle.checked = !enabled;
    }
}

/**
 * 打开添加 Token 模态框
 */
function openAddTokenModal() {
    const modal = document.getElementById('modal-add-token');
    const content = document.getElementById('modal-add-token-content');
    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);

    // 设置为“生成”模式
    document.getElementById('token-modal-title').innerText = '生成持久化 Token';
    document.getElementById('edit-token-masked').value = '';
    document.getElementById('token-modal-submit-btn').innerText = '生成并保存';
    document.getElementById('token-modal-submit-btn').onclick = handleAddToken;

    document.getElementById('add-token-form').classList.remove('hidden');
    document.getElementById('add-token-result').classList.add('hidden');
    document.getElementById('new-token-name').value = '';

    // 初始化有效期 UI
    document.getElementById('new-token-offset-value').value = '';
    document.getElementById('new-token-exact-date').value = '';
    switchTokenExpireMode('offset');
}

/**
 * 切换有效期设置模式
 */
function switchTokenExpireMode(mode) {
    const btnOffset = document.getElementById('btn-expire-offset');
    const btnDate = document.getElementById('btn-expire-date');
    const areaOffset = document.getElementById('expire-offset-area');
    const areaDate = document.getElementById('expire-date-area');

    if (mode === 'offset') {
        btnOffset.classList.add('t-bg-main', 'bg-white', 'dark:bg-white/10', 'shadow-sm');
        btnOffset.classList.remove('t-text-muted');
        btnDate.classList.remove('t-bg-main', 'bg-white', 'dark:bg-white/10', 'shadow-sm');
        btnDate.classList.add('t-text-muted');
        areaOffset.classList.remove('hidden');
        areaDate.classList.add('hidden');
    } else {
        btnDate.classList.add('t-bg-main', 'bg-white', 'dark:bg-white/10', 'shadow-sm');
        btnDate.classList.remove('t-text-muted');
        btnOffset.classList.remove('t-bg-main', 'bg-white', 'dark:bg-white/10', 'shadow-sm');
        btnOffset.classList.add('t-text-muted');
        areaOffset.classList.add('hidden');
        areaDate.classList.remove('hidden');
    }
    // 保存当前模式到全局或临时变量，以便提交时判断
    document.getElementById('modal-add-token').dataset.expireMode = mode;
}

/**
 * 计算选定的过期时间戳
 */
function calculateSelectedExpiresAt() {
    const mode = document.getElementById('modal-add-token').dataset.expireMode;
    if (mode === 'date') {
        const val = document.getElementById('new-token-exact-date').value;
        return val ? new Date(val).getTime() : null;
    } else {
        const val = parseFloat(document.getElementById('new-token-offset-value').value);
        const unit = document.getElementById('new-token-offset-unit').value;
        if (!val || val <= 0) return null;

        const offsetMs = unit === 'h' ? val * 60 * 60 * 1000 : val * 24 * 60 * 60 * 1000;
        return Date.now() + offsetMs;
    }
}

/**
 * 打开编辑 Token 模态框
 */
function openEditTokenModal(tokenMasked, name, expiresAt) {
    const modal = document.getElementById('modal-add-token');
    const content = document.getElementById('modal-add-token-content');
    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);

    // 设置为“编辑”模式
    document.getElementById('token-modal-title').innerText = '编辑 Token 信息';
    document.getElementById('edit-token-masked').value = tokenMasked;
    document.getElementById('token-modal-submit-btn').innerText = '保存修改';
    document.getElementById('token-modal-submit-btn').onclick = handleUpdateToken;

    document.getElementById('add-token-form').classList.remove('hidden');
    document.getElementById('add-token-result').classList.add('hidden');
    document.getElementById('new-token-name').value = name || '';

    if (expiresAt) {
        switchTokenExpireMode('date');
        // 将时间戳转为 datetime-local 格式: YYYY-MM-DDTHH:mm
        const date = new Date(expiresAt);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        document.getElementById('new-token-exact-date').value = `${yyyy}-${mm}-${dd}T${hh}:${min}`;
        document.getElementById('new-token-offset-value').value = '';
    } else {
        switchTokenExpireMode('offset');
        document.getElementById('new-token-offset-value').value = '';
        document.getElementById('new-token-exact-date').value = '';
    }
}

/**
 * 处理更新 Token 信息
 */
async function handleUpdateToken() {
    const tokenMasked = document.getElementById('edit-token-masked').value;
    const name = document.getElementById('new-token-name').value.trim();
    const expiresAt = calculateSelectedExpiresAt();

    if (!name) return showError('请填写 Token 名称');

    try {
        const res = await fetch('/api/user/token/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
            body: JSON.stringify({ tokenMasked, name, expiresAt })
        });
        if (res.ok) {
            showSuccess('修改已保存');
            closeAddTokenModal();
            loadTokenConfig();
        } else {
            showError('保存失败');
        }
    } catch (e) {
        showError('请求异常');
    }
}

/**
 * 关闭添加 Token 模态框
 */
function closeAddTokenModal() {
    const modal = document.getElementById('modal-add-token');
    const content = document.getElementById('modal-add-token-content');
    content.classList.add('scale-95', 'opacity-0');
    content.classList.remove('scale-100', 'opacity-100');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

/**
 * 处理添加新 Token
 */
async function handleAddToken() {
    const name = document.getElementById('new-token-name').value.trim();
    const expiresAt = calculateSelectedExpiresAt();

    if (!name) {
        showError('请填写 Token 名称');
        return;
    }

    try {
        const res = await fetch('/api/user/token/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
            body: JSON.stringify({ name, expiresAt })
        });
        const result = await res.json();
        if (result.success) {
            document.getElementById('add-token-form').classList.add('hidden');
            const resultArea = document.getElementById('add-token-result');
            resultArea.classList.remove('hidden');
            document.getElementById('generated-token-value').value = result.token;
            loadTokenConfig();
        } else {
            showError(result.message || '生成失败');
        }
    } catch (e) {
        showError('生成器异常');
    }
}

/**
 * 处理删除 Token
 */
async function handleRemoveToken(token) {
    if (!await showSelect('确定删除', `确定要永久删除此 Token 吗？\n所有使用此凭证的外部工具将立即无法连接。`, { danger: true })) return;
    try {
        const res = await fetch('/api/user/token/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
            body: JSON.stringify({ token: token })
        });
        if (res.ok) {
            showSuccess('Token 已移除');
            loadTokenConfig();
        }
    } catch (e) {
        showError('删除失败');
    }
}

/**
 * 查看 Token 调用日志
 */
let currentViewingTokenMasked = '';

/**
 * 刷新 Token 调用日志记录
 */
async function handleRefreshTokenLogs() {
    if (!currentViewingTokenMasked) return;
    const list = document.getElementById('token-logs-list');
    const refreshBtn = document.getElementById('btn-refresh-token-logs');

    // 增加旋转动画
    if (refreshBtn) {
        const icon = refreshBtn.querySelector('i');
        if (icon) icon.classList.add('animate-spin');
    }

    try {
        const res = await fetch(`/api/user/token/logs?tokenMasked=${encodeURIComponent(currentViewingTokenMasked)}`, {
            headers: getUserAuthHeaders()
        });
        if (!res.ok) throw new Error('Failed to fetch logs');

        const { logs } = await res.json();
        if (!logs || logs.length === 0) {
            list.innerHTML = '<div class="py-12 text-center t-text-muted italic opacity-50">暂无该 Token 的调用日志</div>';
        } else {
            // 解析日志行，美化显示
            list.innerHTML = logs.map(line => {
                line = String(line ?? '');
                // [语义化解析] 提取审计日志核心字段
                const auditMatch = line.match(/used by (.*?) from (.*?) to access (.*?)$/);
                const timeMatch = line.match(/\[([\d-T:\.]+)\]/);
                const timeStr = timeMatch ? timeMatch[1].split('T')[1]?.split('.')[0] || '未知' : '未知';

                // 情况 A: 标准 API 调用流水
                if (auditMatch) {
                    const [, user, ip, url] = auditMatch;
                    return `
                    <div class="p-3.5 rounded-2xl t-bg-track border t-border-main flex flex-col gap-2 transition-all hover:t-border-primary border-transparent">
                        <div class="flex items-center justify-between border-b t-border-main border-dashed pb-2 mb-1 opacity-80">
                            <div class="flex items-center gap-1.5">
                                <i class="fas fa-fingerprint text-[10px] text-emerald-500"></i>
                                <span class="text-[10px] font-bold t-text-main">用户 ${escapeHtmlText(user)}</span>
                            </div>
                            <span class="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-500 font-mono text-[9px]">${escapeHtmlText(timeStr)}</span>
                        </div>
                        <div class="space-y-1.5">
                            <div class="flex items-center gap-2 text-[11px] t-text-main">
                                <i class="fas fa-network-wired w-4 opacity-40 text-center"></i>
                                <span class="opacity-50">来源 IP:</span> <span class="font-mono text-emerald-500/80 tracking-tighter">${escapeHtmlText(ip)}</span>
                            </div>
                            <div class="flex items-start gap-2 text-[11px] t-text-main">
                                <i class="fas fa-link w-4 opacity-40 text-center mt-0.5"></i>
                                <div class="flex-1">
                                    <span class="opacity-50">请求路径:</span>
                                    <span class="font-medium break-all text-blue-500/80 ml-1 italic font-mono">${escapeHtmlText(url)}</span>
                                </div>
                            </div>
                        </div>
                    </div>`;
                }

                // 情况 B: 系统配置审计 (手动开启/关闭)
                if (line.includes('token auth')) {
                    const isEnabled = line.includes('enabled');
                    return `
                    <div class="p-3 rounded-2xl bg-blue-500/5 border border-blue-500/15 flex items-center justify-between">
                         <div class="flex items-center gap-3">
                             <div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500">
                                 <i class="fas ${isEnabled ? 'fa-toggle-on' : 'fa-toggle-off'} text-xs"></i>
                             </div>
                             <div class="text-[11px] t-text-main font-extrabold">全局：${isEnabled ? '启用' : '停用'} API 验证鉴权</div>
                         </div>
                         <span class="text-[9px] t-text-muted opacity-60">${escapeHtmlText(timeStr)}</span>
                    </div>`;
                }

                // 情况 C: 原始日志 (兜底显示)
                return `<div class="p-3 t-bg-track rounded-xl t-text-muted text-[10px] opacity-70 italic border t-border-main border-dashed">${escapeHtmlText(line)}</div>`;
            }).join('');
        }
    } catch (e) {
        console.error('[TokenLog] Error:', e);
        list.innerHTML = `<div class="py-12 text-center text-red-500 italic opacity-50">拉取日志失败: ${escapeHtmlText(e.message)}</div>`;
    } finally {
        if (refreshBtn) {
            setTimeout(() => {
                const icon = refreshBtn.querySelector('i');
                if (icon) icon.classList.remove('animate-spin');
            }, 500);
        }
    }
}

/**
 * 查看 Token 调用日志
 */
async function openTokenLogsModal(tokenMasked, name) {
    currentViewingTokenMasked = tokenMasked;
    const modal = document.getElementById('modal-token-logs');
    const content = document.getElementById('modal-token-logs-content');
    const list = document.getElementById('token-logs-list');
    const nameEl = document.getElementById('log-token-name');

    nameEl.innerText = `Token: ${name} (${tokenMasked})`;
    list.innerHTML = '<div class="py-12 text-center t-text-muted italic opacity-50 animate-pulse">正在从日志服务器拉取记录...</div>';

    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);

    handleRefreshTokenLogs();
}

/**
 * 关闭 Token 调用日志模态框
 */
function closeTokenLogsModal() {
    const modal = document.getElementById('modal-token-logs');
    const content = document.getElementById('modal-token-logs-content');
    if (content) {
        content.classList.add('scale-95', 'opacity-0', 'duration-300');
        content.classList.remove('scale-100', 'opacity-100');
    }
    setTimeout(() => {
        if (modal) modal.classList.add('hidden');
    }, 300);
}

/**
 * 复制到剪切板
 */
function copyTokenToClipboard(token) {
    if (!token) return;
    navigator.clipboard.writeText(token).then(() => showSuccess('Token 已复制到剪贴板'));
}

function copyGeneratedToken() {
    const val = document.getElementById('generated-token-value').value;
    if (val) {
        navigator.clipboard.writeText(val).then(() => showSuccess('Token 已成功保存至剪贴板'));
    }
}

// 暴漏到全局
(window as any).handleToggleTokenStatus = handleToggleTokenStatus;
(window as any).toggleTokenAuthSetting = toggleTokenAuthSetting;
(window as any).openAddTokenModal = openAddTokenModal;
(window as any).switchTokenExpireMode = switchTokenExpireMode;
(window as any).openEditTokenModal = openEditTokenModal;
(window as any).closeAddTokenModal = closeAddTokenModal;
(window as any).handleAddToken = handleAddToken;
(window as any).handleRemoveToken = handleRemoveToken;
(window as any).openTokenLogsModal = openTokenLogsModal;
(window as any).closeTokenLogsModal = closeTokenLogsModal;
(window as any).handleRefreshTokenLogs = handleRefreshTokenLogs;
(window as any).copyTokenToClipboard = copyTokenToClipboard;
(window as any).copyGeneratedToken = copyGeneratedToken;
(window as any).loadTokenConfig = loadTokenConfig;
