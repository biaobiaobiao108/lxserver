export const getNow = typeof performance === 'object' && window.performance?.now
    ? window.performance.now.bind(window.performance)
    : Date.now.bind(Date);

export class TimeoutTools {
    private invokeTime = 0;
    private animationFrameId: number | null = null;
    private timeoutId: number | null = null;
    private callback: (diff: number) => void = () => undefined;

    constructor(private readonly thresholdTime = 80) {}

    private run(): void {
        this.animationFrameId = requestAnimationFrame(() => {
            this.animationFrameId = null;
            const diff = this.invokeTime - getNow();
            if (diff > 0) {
                if (diff < this.thresholdTime) return this.run();
                this.timeoutId = window.setTimeout(() => {
                    this.timeoutId = null;
                    this.run();
                }, diff - this.thresholdTime);
                return;
            }
            this.callback(diff);
        });
    }

    start(callback = () => undefined, timeout = 0): void {
        this.callback = callback;
        this.invokeTime = getNow() + timeout;
        this.run();
    }

    clear(): void {
        if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
        if (this.timeoutId !== null) clearTimeout(this.timeoutId);
        this.animationFrameId = null;
        this.timeoutId = null;
    }
}

(window as any).LyricUtils = { getNow, TimeoutTools };
