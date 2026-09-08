type LogEntry = { id: number; time: string; type: 'info' | 'warn' | 'error'; message: string };

const runtime = window as typeof window & { systemLogs: LogEntry[]; autoScrollLogs?: boolean };
const original = { log: console.log, warn: console.warn, error: console.error };
runtime.systemLogs = [];

function formatArgument(value: unknown): string {
    if (value instanceof Error) return `${value}\n${value.stack || ''}`;
    if (typeof value === 'object' && value !== null) {
        try { return JSON.stringify(value, null, 2); } catch { return '[Circular/Object]'; }
    }
    return String(value);
}

function appendLog(container: HTMLElement, log: LogEntry): void {
    const element = document.createElement('div');
    element.className = `font-mono text-xs py-1 border-b t-border-main last:border-0 hover:t-bg-main transition-colors ${
        log.type === 'error' ? 'text-red-600 bg-red-50/50' : log.type === 'warn' ? 'text-amber-600 bg-amber-50/50' : 't-text-muted'
    }`;
    const time = document.createElement('span');
    time.className = 't-text-muted select-none mr-2';
    time.textContent = `[${log.time}]`;
    const message = document.createElement('span');
    message.className = 'whitespace-pre-wrap break-words';
    message.textContent = log.message;
    element.append(time, message);
    container.appendChild(element);
}

function capture(type: LogEntry['type'], args: unknown[]): void {
    const now = new Date();
    const entry: LogEntry = {
        id: Date.now() + Math.random(),
        time: `${now.toLocaleTimeString()}.${String(now.getMilliseconds()).padStart(3, '0')}`,
        type,
        message: args.map(formatArgument).join(' '),
    };
    runtime.systemLogs.push(entry);
    if (runtime.systemLogs.length > 1000) runtime.systemLogs.shift();
    const container = document.getElementById('system-log-container');
    if (container && container.offsetParent !== null) {
        appendLog(container, entry);
        if (runtime.autoScrollLogs) container.scrollTop = container.scrollHeight;
    }
}

console.log = (...args: unknown[]) => { original.log.apply(console, args as []); capture('info', args); };
console.warn = (...args: unknown[]) => { original.warn.apply(console, args as []); capture('warn', args); };
console.error = (...args: unknown[]) => { original.error.apply(console, args as []); capture('error', args); };

(window as any).renderSystemLogs = () => {
    const container = document.getElementById('system-log-container');
    if (!container) return;
    container.replaceChildren(...runtime.systemLogs.map(log => {
        const wrapper = document.createElement('div');
        appendLog(wrapper, log);
        return wrapper.firstElementChild!;
    }));
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
        runtime.autoScrollLogs = true;
    });
};

(window as any).clearSystemLogs = () => {
    runtime.systemLogs = [];
    document.getElementById('system-log-container')?.replaceChildren();
    console.log('[System] Logs cleared by user');
};
