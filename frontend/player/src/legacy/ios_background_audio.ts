type AudioRuntime = {
    init: (audioContext: AudioContext, analyserNode: AnalyserNode) => void;
    ensureAnchorPlaying: () => void;
    isActive: () => boolean;
    isIOS: () => boolean;
};

function isIOS(): boolean {
    const ua = navigator.userAgent;
    const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return /iPhone|iPod/.test(ua) || isIPad;
}

let streamDestination: MediaStreamAudioDestinationNode | null = null;
let anchorAudio: HTMLAudioElement | null = null;
let active = false;
let audioContext: AudioContext | null = null;

function syncAnchorWithContext(): void {
    if (!anchorAudio || !audioContext) return;
    const mainAudio = document.getElementById('audio-player') as HTMLAudioElement | null;
    const shouldPlay = audioContext.state === 'running' && !!mainAudio && !mainAudio.paused;
    if (shouldPlay && anchorAudio.paused) {
        void anchorAudio.play().then(() => (window as any).updatePositionState?.()).catch(error => {
            if (error?.name !== 'NotAllowedError') console.warn('[iOSAudio] Play failed:', error);
        });
    } else if (!shouldPlay && !anchorAudio.paused) {
        anchorAudio.pause();
    }
}

function onMainPlay(): void {
    if (!audioContext) return;
    if (audioContext.state === 'suspended') void audioContext.resume().then(syncAnchorWithContext);
    else syncAnchorWithContext();
}

function onContextStateChange(): void {
    syncAnchorWithContext();
}

function onVisibilityChange(): void {
    if (document.visibilityState === 'visible' && audioContext?.state === 'suspended') {
        void audioContext.resume().then(syncAnchorWithContext);
    }
}

function init(nextAudioContext: AudioContext, analyserNode: AnalyserNode): void {
    if (!isIOS() || active) return;
    audioContext = nextAudioContext;
    try {
        try { analyserNode.disconnect(audioContext.destination); } catch { /* already disconnected */ }
        streamDestination = audioContext.createMediaStreamDestination();
        analyserNode.connect(streamDestination);

        anchorAudio = document.createElement('audio');
        anchorAudio.id = 'ios-audio-anchor';
        anchorAudio.setAttribute('playsinline', '');
        anchorAudio.setAttribute('webkit-playsinline', '');
        anchorAudio.volume = 1;
        anchorAudio.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0.01;pointer-events:none;';
        anchorAudio.srcObject = streamDestination.stream;
        document.body.appendChild(anchorAudio);

        document.getElementById('audio-player')?.addEventListener('play', onMainPlay);
        document.getElementById('audio-player')?.addEventListener('pause', syncAnchorWithContext);
        audioContext.addEventListener('statechange', onContextStateChange);
        document.addEventListener('visibilitychange', onVisibilityChange);
        active = true;
        syncAnchorWithContext();
    } catch (error) {
        console.error('[iOSAudio] Failed to initialize:', error);
    }
}

const iOSBackgroundAudio: AudioRuntime = {
    init,
    ensureAnchorPlaying: syncAnchorWithContext,
    isActive: () => active,
    isIOS,
};

(window as any).iOSBackgroundAudio = iOSBackgroundAudio;
export { iOSBackgroundAudio };
