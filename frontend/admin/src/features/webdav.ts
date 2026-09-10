import type { AdminFeatureContext } from '../types';
import { safeResourceUrl } from '../utils';

export function initWebDAVFeature(context: AdminFeatureContext) {
    const app = context.app;

    function bindWebDAVFeatureEvents() {
        app.bindWebDAVEvents();
    }

    async function testWebDAV() {
        try {
            const result = await app.request('/api/webdav/test', { method: 'POST' });
            if (result.success) {
                showSuccess('✅ WebDAV连接成功！\n' + result.message);
            } else {
                showError('❌ WebDAV连接失败\n' + result.message);
            }
        } catch (err) {
            showError('❌ 连接失败: ' + err.message);
        }
    }

    async function testProxy() {
        const address = document.querySelector('input[name="proxy.all.address"]').value;
        if (!address) {
            showInfo('请输入代理地址');
            return;
        }

        showInfo('正在测试代理，请稍候...');
        try {
            const result = await app.request('/api/config/test-proxy', {
                method: 'POST',
                body: JSON.stringify({ address })
            });

            if (result.success) {
                showSuccess('✅ ' + result.message);
            } else {
                showError('❌ ' + result.message);
            }
        } catch (err) {
            showError('❌ 测试失败: ' + err.message);
        }
    }

    async function backupToWebDAV() {
        if (!(await showSelect('WebDAV 备份', '确定要创建全量备份并上传到 WebDAV 吗？'))) return;

        const statusEl = document.getElementById('sync-status-content');
        statusEl.innerHTML = '<p style="color: var(--accent-warning);">正在备份...</p>';
        app.showProgress(true);

        try {
            const result = await app.request('/api/webdav/backup', {
                method: 'POST',
                body: JSON.stringify({ force: true })
            });
            if (result.success) {
                statusEl.innerHTML = '<p style="color: var(--accent-success);">✅ 备份成功！</p>';
                app.loadSyncLogs();
            } else {
                statusEl.innerHTML = '<p style="color: var(--accent-error);">❌ 备份失败</p>';
            }
        } catch (err) {
            statusEl.innerHTML = '<p style="color: var(--accent-error);">❌ 备份失败: ' + app.escapeHtml(err.message || '') + '</p>';
        } finally {
            setTimeout(() => app.showProgress(false), 3000);
        }
    }

    async function restoreFromWebDAV() {
        if (!(await showSelect('WebDAV 恢复', '⚠️ 警告：从云端恢复将覆盖本地所有数据！\n\n确定要继续吗？', { danger: true }))) return;

        const statusEl = document.getElementById('sync-status-content');
        statusEl.innerHTML = '<p style="color: var(--accent-warning);">正在从云端恢复数据...</p>';

        try {
            const result = await app.request('/api/webdav/restore', { method: 'POST' });
            if (result.success) {
                statusEl.innerHTML = '<p style="color: var(--accent-success);">✅ 恢复成功！页面将刷新...</p>';
                setTimeout(() => location.reload(), 2000);
            } else {
                statusEl.innerHTML = '<p style="color: var(--accent-error);">❌ 恢复失败</p>';
            }
        } catch (err) {
            statusEl.innerHTML = '<p style="color: var(--accent-error);">❌ 恢复失败: ' + app.escapeHtml(err.message || '') + '</p>';
        }
    }

    async function syncFilesToWebDAV() {
        if (!(await showSelect('同步文件', '确定要强制同步所有文件到 WebDAV 吗？'))) return;

        const statusEl = document.getElementById('sync-status-content');
        statusEl.innerHTML = '<p style="color: var(--accent-warning);">正在同步文件...</p>';
        app.showProgress(true);

        try {
            const result = await app.request('/api/webdav/sync', { method: 'POST' });
            if (result.success) {
                statusEl.innerHTML = '<p style="color: var(--accent-success);">✅ 同步成功！</p>';
                app.loadSyncLogs();
            } else {
                statusEl.innerHTML = '<p style="color: var(--accent-error);">❌ 同步失败</p>';
            }
        } catch (err) {
            statusEl.innerHTML = '<p style="color: var(--accent-error);">❌ 同步失败: ' + app.escapeHtml(err.message || '') + '</p>';
        } finally {
            setTimeout(() => app.showProgress(false), 3000);
        }
    }

    function showProgress(show) {
        const container = document.getElementById('sync-progress-container');
        if (show) {
            container.classList.remove('hidden');
            app.updateProgress(0, '准备中...');
        } else {
            container.classList.add('hidden');
        }
    }

    function updateProgress(percent, text) {
        const bar = document.getElementById('progress-bar');
        const textEl = document.getElementById('progress-text');
        const percentEl = document.getElementById('progress-percent');

        if (bar) bar.style.width = `${percent}%`;
        if (textEl) textEl.textContent = text;
        if (percentEl) percentEl.textContent = `${Math.round(percent)}%`;
    }

    // 辅助方法：生成歌曲标签 HTML

    function renderSongTags(song) {
        let html = '<div class="song-meta-tags">';

        // 来源标签
        if (song.source) {
            html += `<span class="tag tag-source ${song.source}">${app.escapeHtml(song.source)}</span>`;
        }

        // 音质标签
        const qualitys = song.meta ? (song.meta._qualitys || song.meta.qualitys) : null;
        if (qualitys) {
            if (Array.isArray(qualitys)) {
                if (qualitys.some(q => q.type === 'flac24bit')) {
                    html += '<span class="tag tag-quality hr">Hi-Res</span>';
                } else if (qualitys.some(q => q.type === 'flac')) {
                    html += '<span class="tag tag-quality lossless">SQ</span>';
                } else if (qualitys.some(q => q.type === '320k')) {
                    html += '<span class="tag tag-quality high">HQ</span>';
                }
            } else {
                if (qualitys.flac24bit) {
                    html += '<span class="tag tag-quality hr">Hi-Res</span>';
                } else if (qualitys.flac) {
                    html += '<span class="tag tag-quality lossless">SQ</span>';
                } else if (qualitys['320k']) {
                    html += '<span class="tag tag-quality high">HQ</span>';
                }
            }
        }

        // 时长
        if (song.interval) {
            html += `<span class="tag tag-interval">${app.escapeHtml(song.interval)}</span>`;
        }

        html += '</div>';
        return html;
    }

    // 辅助方法：生成歌曲名称列 HTML（包含封面）

    function renderSongNameCell(song) {
        const picUrl = safeResourceUrl(song.meta?.picUrl);
        const songName = app.escapeHtml(song.name || '未知歌曲');
        // 使用默认图占位，data-src 用于懒加载 (IntersectionObserver 稍后实现，这里直接用原生 lazy loading)
        // 注意：Web 原生 loading="lazy" 对 background-image 无效，对 img 标签有效。
        // 这里使用 img 标签
        const coverHtml = picUrl
            ? `<img src="${app.escapeHtml(picUrl)}" class="song-cover" width="48" height="48" loading="lazy" decoding="async" alt="${songName}专辑封面" onerror="this.style.opacity=0">`
            : `<div class="song-cover" style="background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center;">🎵</div>`;

        const singerHtml = song.singer
            ? `<span class="song-singer-mobile">${app.escapeHtml(song.singer)}</span>`
            : '';

        return `
            <div class="song-col-name">
                ${coverHtml}
                <div class="song-info-wrapper min-w-0">
                    <span class="song-title-text dynamic-marquee truncate" title="${songName}">${songName}</span>
                    ${singerHtml}
                    ${app.renderSongTags(song)}
                </div>
            </div>
        `;
    }

    function initSSE() {
        // WebDAV progress has no public SSE endpoint. Keep this hook as a
        // compatibility no-op instead of putting the administrator password in a URL.
    }

    async function loadSyncLogs() {
        try {
            const data = await app.request('/api/webdav/logs');
            const container = document.getElementById('sync-logs-content');

            if (!data.logs || data.logs.length === 0) {
                container.innerHTML = '<p style="color: var(--text-secondary); padding: 2rem; text-align: center;">暂无同步日志</p>';
                return;
            }

            container.innerHTML = data.logs.map(log => {
                const logType = ['upload', 'download', 'backup', 'restore'].includes(log.type) ? log.type : 'unknown';
                const logFile = app.escapeHtml(log.file || '');
                const logMessage = app.escapeHtml(log.message || '');
                const logStatus = log.status === 'success' ? 'success' : 'error';
                return `
            <div class="sync-log-item">
                <div class="log-info">
                    <span class="log-type log-type-${logType}">${app.escapeHtml(app.getLogTypeText(log.type))}</span>
                    <span class="log-file">${logFile}</span>
                    ${logMessage ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${logMessage}</div>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <span class="log-status log-status-${logStatus}">${log.status === 'success' ? '成功' : '失败'}</span>
                    <span class="log-time">${app.formatTime(log.timestamp)}</span>
                </div>
            </div>
        `;
            }).join('');
        } catch (err) {
            console.error('Failed to load sync logs:', err);
            app.renderViewError(
                document.getElementById('sync-logs-content'),
                '同步日志加载失败: ' + err.message,
                'app.loadSyncLogs()'
            );
        }
    }

    function getLogTypeText(type) {
        const types = {
            upload: '上传',
            download: '下载',
            backup: '备份',
            restore: '恢复'
        };
        return types[type] || type;
    }

    function bindWebDAVEvents() {
        document.getElementById('test-webdav-btn')?.addEventListener('click', () => app.testWebDAV());
        document.getElementById('backup-webdav-btn')?.addEventListener('click', () => app.backupToWebDAV());
        document.getElementById('restore-webdav-btn')?.addEventListener('click', () => app.restoreFromWebDAV());
        document.getElementById('sync-files-btn')?.addEventListener('click', () => app.syncFilesToWebDAV());
        document.getElementById('refresh-sync-logs-btn')?.addEventListener('click', () => app.loadSyncLogs());
        document.getElementById('test-proxy-btn')?.addEventListener('click', () => app.testProxy());

        // [新增] 本地备份/还原事件绑定
        document.getElementById('backup-local-btn')?.addEventListener('click', () => app.downloadLocalBackup());
        document.getElementById('restore-local-btn')?.addEventListener('click', () => document.getElementById('local-backup-input').click());
        document.getElementById('local-backup-input')?.addEventListener('change', (e) => app.handleLocalRestore(e));

        app.initSSE();
    }
    return {
        bindWebDAVFeatureEvents,
        testWebDAV,
        testProxy,
        backupToWebDAV,
        restoreFromWebDAV,
        syncFilesToWebDAV,
        showProgress,
        updateProgress,
        renderSongTags,
        renderSongNameCell,
        initSSE,
        loadSyncLogs,
        getLogTypeText,
        bindWebDAVEvents,
    };
}
