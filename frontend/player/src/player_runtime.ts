const lazyScriptPromises = new Map<string, Promise<void>>();
let markedPromise: Promise<void> | undefined;

function loadLazyScript(src: string, globalName?: string): Promise<void> {
    if (globalName && (window as any)[globalName]) return Promise.resolve();
    if (lazyScriptPromises.has(src)) return lazyScriptPromises.get(src)!;

    const promise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`加载模块失败: ${src}`));
        document.head.appendChild(script);
    });
    lazyScriptPromises.set(src, promise);
    return promise;
}

export function ensureMarkedLoaded() {
    if ((window as any).marked) return Promise.resolve();
    if (!markedPromise) {
        markedPromise = import('marked').then(({ marked }) => {
            (window as any).marked = marked;
        });
    }
    return markedPromise;
}

export function ensureVisualizerLoaded() {
    return loadLazyScript('js/wave.js', 'Wave')
        .then(() => loadLazyScript('js/visualizer.js', 'musicVisualizer'));
}

export function ensureLeaderboardLoaded() {
    return loadLazyScript('js/leaderboard_manager.js', 'LeaderboardManager');
}

export function ensureLocalMusicLoaded() {
    return loadLazyScript('js/local_music.js', 'LocalMusicManager');
}

export function ensureLyricCardLoaded() {
    return loadLazyScript('js/lyric-card.js', 'lyricCard');
}

export function ensureSoundEffectsLoaded() {
    return loadLazyScript('js/sound-effects.js', 'soundEffects');
}

function showError(message: string) {
    const handler = (window as any).showError;
    if (typeof handler === 'function') handler(message);
    else console.error(message);
}

export function openLyricCard() {
    const lyricCard = (window as any).lyricCard;
    if (lyricCard) {
        lyricCard.open();
        return;
    }
    ensureLyricCardLoaded()
        .then(() => (window as any).lyricCard?.open())
        .catch(() => showError('歌词卡片模块加载失败，请稍后重试'));
}

export function toggleSoundEffects() {
    const soundEffects = (window as any).soundEffects;
    if (soundEffects) {
        soundEffects.toggle();
        return;
    }
    ensureSoundEffectsLoaded()
        .then(() => (window as any).soundEffects?.toggle())
        .catch(() => showError('音效模块加载失败，请稍后重试'));
}
