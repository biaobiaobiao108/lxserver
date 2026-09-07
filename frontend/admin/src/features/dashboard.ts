import type { AdminFeatureContext } from '../types';

export function initDashboardFeature(context: AdminFeatureContext) {
    const app = context.app;

    async function loadDashboard() {
        app.updateGreeting();
        try {
            const status = await app.request('/api/status');

            // 更新顶部概览卡片
            document.getElementById('stat-users').textContent = status.users;
            document.getElementById('stat-devices').textContent = status.devices;
            document.getElementById('stat-cpu').textContent = status.cpuUsage + '%';
            document.getElementById('stat-memory').textContent = app.formatFileSize(status.memory);

            // 实时监控详情
            app.updateMonitorUI(status);

            // 加载用户列表
            const users = await app.request('/api/users');
            app.allUsers = users;
            app.renderAllUserSelectors();

            // 启动定时刷新
            app.startMonitor();

        } catch (err) {
            console.error('Failed to load dashboard:', err);
        }
    }

    function updateGreeting() {
        const hour = new Date().getHours();
        let greeting = '你好';
        if (hour < 6) greeting = '深夜好';
        else if (hour < 9) greeting = '早安';
        else if (hour < 12) greeting = '上午好';
        else if (hour < 14) greeting = '中午好';
        else if (hour < 18) greeting = '下午好';
        else if (hour < 22) greeting = '晚上好';
        else greeting = '深夜好';

        const greetingEl = document.getElementById('greeting-text');
        if (greetingEl) greetingEl.textContent = greeting;

        const dateEl = document.getElementById('dashboard-date');
        if (dateEl) {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            dateEl.textContent = '今天是 ' + new Date().toLocaleDateString('zh-CN', options);
        }
    }

    function startMonitor() {
        if (app.monitorTimer) return;
        app.monitorTimer = setInterval(async () => {
            if (app.currentView !== 'dashboard' || !app.password) {
                clearInterval(app.monitorTimer);
                app.monitorTimer = null;
                return;
            }
            try {
                const status = await app.request('/api/status');
                app.updateMonitorUI(status);
            } catch (e) {
                console.error('Monitor refresh failed:', e);
            }
        }, 3000);
    }

    function updateMonitorUI(status) {
        // --- CPU 监控 ---
        const sysCpuVal = parseFloat(status.cpuUsage) || 0;
        const procCpuVal = parseFloat(status.processCpuUsage) || 0;

        // 顶部概览
        const statCpu = document.getElementById('stat-cpu');
        const statProcCpu = document.getElementById('stat-process-cpu');
        if (statCpu) statCpu.textContent = sysCpuVal.toFixed(2) + '%';
        if (statProcCpu) statProcCpu.textContent = procCpuVal.toFixed(2) + '%';

        // 详情面板
        const cpuProgress = document.getElementById('monitor-cpu-progress');
        const sysCpuText = document.getElementById('monitor-cpu-val');
        const procCpuText = document.getElementById('monitor-process-cpu-val');
        if (cpuProgress) cpuProgress.style.width = Math.max(sysCpuVal, procCpuVal) + '%';
        if (sysCpuText) sysCpuText.textContent = sysCpuVal.toFixed(2) + '%';
        if (procCpuText) procCpuText.textContent = procCpuVal.toFixed(2) + '%';

        app.systemCpuHistory.push(sysCpuVal);
        app.processCpuHistory.push(procCpuVal);
        if (app.systemCpuHistory.length > 20) {
            app.systemCpuHistory.shift();
            app.processCpuHistory.shift();
        }
        app.renderMultiLineChart('cpu-chart', [
            { data: app.systemCpuHistory, color: 'rgba(59, 130, 246, 0.4)', fill: true, label: 'System' },
            { data: app.processCpuHistory, color: '#a855f7', fill: false, label: 'Process', strokeWidth: 3 }
        ]);

        // --- 内存监控 ---
        const sysMemVal = parseFloat(status.systemMemoryUsage) || 0;
        const procMemVal = parseFloat(status.processMemoryUsage) || 0;

        // 顶部概览
        const statMemPerc = document.getElementById('stat-memory-percent');
        const statProcMemPerc = document.getElementById('stat-process-memory-percent');
        const statMemAbs = document.getElementById('stat-memory');
        if (statMemPerc) statMemPerc.textContent = sysMemVal.toFixed(2) + '%';
        if (statProcMemPerc) statProcMemPerc.textContent = procMemVal.toFixed(2) + '%';
        if (statMemAbs) statMemAbs.textContent = app.formatFileSize(status.memory);

        // 详情面板
        const memProgress = document.getElementById('monitor-mem-progress');
        const sysMemText = document.getElementById('monitor-mem-val');
        const procMemText = document.getElementById('monitor-process-mem-val');
        if (memProgress) memProgress.style.width = sysMemVal + '%';
        if (sysMemText) sysMemText.textContent = sysMemVal.toFixed(2) + '%';
        if (procMemText) procMemText.textContent = procMemVal.toFixed(2) + '%';

        app.systemMemHistory.push(sysMemVal);
        app.processMemHistory.push(procMemVal);
        if (app.systemMemHistory.length > 20) {
            app.systemMemHistory.shift();
            app.processMemHistory.shift();
        }
        app.renderMultiLineChart('mem-chart', [
            { data: app.systemMemHistory, color: 'rgba(16, 185, 129, 0.4)', fill: true, label: 'System' },
            { data: app.processMemHistory, color: '#3b82f6', fill: false, label: 'Process', strokeWidth: 3 }
        ]);

        // --- 状态与概览更新 ---
        const statUsers = document.getElementById('stat-users');
        const statDevices = document.getElementById('stat-devices');
        const statUptime = document.getElementById('stat-uptime');
        if (statUsers) statUsers.textContent = status.users;
        if (statDevices) statDevices.textContent = status.devices;
        if (statUptime) statUptime.textContent = app.formatUptime(status.uptime);

        // 更新硬件详情
        const statCpuInfo = document.getElementById('stat-cpu-info');
        if (statCpuInfo) {
            const speedGhz = (status.cpuSpeed / 1000).toFixed(1);
            statCpuInfo.textContent = `${status.cpus} Cores @ ${speedGhz}GHz`;
        }
    }

    function renderMultiLineChart(svgId, series) {
        const svg = document.getElementById(svgId);
        if (!svg) return;

        const width = 200;
        const height = 60;
        const padding = 5;

        let html = '';
        series.forEach((s, idx) => {
            if (s.data.length < 2) return;

            const points = s.data.map((val, i) => {
                const x = (i / (s.data.length - 1)) * width;
                const y = height - (Math.max(val, 2) / 100) * (height - padding * 2) - padding;
                return { x, y };
            });

            // 二次贝塞尔曲线平滑处理
            let d = `M ${points[0].x} ${points[0].y}`;
            for (let i = 0; i < points.length - 1; i++) {
                const xc = (points[i].x + points[i + 1].x) / 2;
                const yc = (points[i].y + points[i + 1].y) / 2;
                d += ` Q ${points[i].x} ${points[i].y} ${xc} ${yc}`;
            }
            d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`;

            if (s.fill) {
                const fillD = d + ` L ${width} ${height} L 0 ${height} Z`;
                html += `
                    <defs>
                        <linearGradient id="grad-${svgId}-${idx}" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style="stop-color:${s.color};stop-opacity:0.3" />
                            <stop offset="100%" style="stop-color:${s.color};stop-opacity:0" />
                        </linearGradient>
                    </defs>
                    <path d="${fillD}" fill="url(#grad-${svgId}-${idx})" />
                `;
            }

            html += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.strokeWidth || 2}" stroke-linecap="round" />`;
        });

        svg.innerHTML = html;
    }
    return {
        loadDashboard,
        updateGreeting,
        startMonitor,
        updateMonitorUI,
        renderMultiLineChart,
    };
}

