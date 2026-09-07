import type { AdminFeatureContext } from '../types';

export function initLogsFeature(context: AdminFeatureContext) {
    const app = context.app;

    function bindLogsEvents() {
        document.getElementById('refresh-logs-btn')?.addEventListener('click', () => app.loadLogs());
        document.getElementById('log-type-select')?.addEventListener('change', () => app.loadLogs());
    }

    async function loadLogs() {
        const logType = document.getElementById('log-type-select')?.value || 'app';

        try {
            const data = await app.request(`/api/logs?type=${logType}&lines=200`);
            const container = document.getElementById('logs-content');

            if (data.logs && data.logs.length) {
                container.innerHTML = data.logs
                    .filter(line => line.trim())
                    .map(line => `<div class="log-line">${app.escapeHtml(line)}</div>`)
                    .join('');

                // 滚动到底部
                container.scrollTop = container.scrollHeight;
            } else {
                container.innerHTML = '<p style="color: var(--text-secondary);">暂无日志</p>';
            }
        } catch (err) {
            document.getElementById('logs-content').innerHTML = '<p style="color: var(--accent-error);">加载日志失败</p>';
        }
    }
    return {
        bindLogsEvents,
        loadLogs,
    };
}
