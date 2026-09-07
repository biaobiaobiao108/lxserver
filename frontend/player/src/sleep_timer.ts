function getAudio() {
    return document.getElementById('audio-player') as HTMLAudioElement | null;
}

function showSuccess(message) {
    const handler = (window as any).showSuccess;
    if (typeof handler === 'function') handler(message);
}

function showInfo(message) {
    const handler = (window as any).showInfo;
    if (typeof handler === 'function') handler(message);
}

function showError(message) {
    const handler = (window as any).showError;
    if (typeof handler === 'function') handler(message);
    else console.error(message);
}

// ========================================
// Sleep timer logic
// ========================================

let sleepTimerId = null;
let sleepTimerEnd = 0;

export function openSleepTimerModal() {
    const modal = document.getElementById('sleep-timer-modal');
    const content = document.getElementById('sleep-timer-modal-content');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Trigger animation
    requestAnimationFrame(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    });

    updateSleepTimerModalUI();
}

export function closeSleepTimerModal() {
    const modal = document.getElementById('sleep-timer-modal');
    const content = document.getElementById('sleep-timer-modal-content');
    if (!modal || !content) return;

    content.classList.add('scale-95', 'opacity-0');
    content.classList.remove('scale-100', 'opacity-100');

    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

export function setSleepTimer(minutes) {
    cancelSleepTimer();
    const durationMs = minutes * 60 * 1000;
    sleepTimerEnd = Date.now() + durationMs;

    startSleepTimerLoop();
    closeSleepTimerModal();
    showSuccess(`已设置 ${minutes} 分钟后停止播放`);
}

export function cancelSleepTimer() {
    if (sleepTimerId) {
        clearInterval(sleepTimerId);
        sleepTimerId = null;
    }
    sleepTimerEnd = 0;

    const countdown = document.getElementById('sleep-timer-countdown');
    const triggerIcon = document.querySelector('#sleep-timer-trigger i');
    const activeStatus = document.getElementById('active-timer-status');

    if (countdown) countdown.classList.add('hidden');
    if (activeStatus) activeStatus.classList.add('hidden');
    if (triggerIcon) {
        triggerIcon.classList.replace('fas', 'far');
        triggerIcon.classList.remove('text-emerald-500');
    }
}

function startSleepTimerLoop() {
    const countdown = document.getElementById('sleep-timer-countdown');
    const triggerIcon = document.querySelector('#sleep-timer-trigger i');

    if (countdown) countdown.classList.remove('hidden');
    if (triggerIcon) {
        triggerIcon.classList.replace('far', 'fas');
        triggerIcon.classList.add('text-emerald-500');
    }

    updateSleepTimerDisplay();
    sleepTimerId = setInterval(() => {
        updateSleepTimerDisplay();
    }, 1000);
}

function updateSleepTimerDisplay() {
    const now = Date.now();
    const remain = sleepTimerEnd - now;

    if (remain <= 0) {
        finishSleepTimer();
        return;
    }

    const minutes = Math.floor(remain / 60000);
    const seconds = Math.floor((remain % 60000) / 1000);
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    const countdown = document.getElementById('sleep-timer-countdown');
    const statusCountdown = document.getElementById('status-countdown');

    if (countdown) countdown.innerText = timeStr;
    if (statusCountdown) statusCountdown.innerText = timeStr;
}

function finishSleepTimer() {
    cancelSleepTimer();
    // Use audio.pause directly or togglePlay if music is active
    const audio = getAudio();
    if (audio && !audio.paused) {
        audio.pause();
        const handler = (window as any).updatePlayButton;
        if (typeof handler === 'function') handler(false);
        showInfo('睡眠时间到，音乐已停止播放 🌙');
    }
}

function updateSleepTimerModalUI() {
    const activeStatus = document.getElementById('active-timer-status');
    const customInput = document.getElementById('custom-timer-input');

    if (activeStatus) {
        if (sleepTimerEnd > Date.now()) {
            activeStatus.classList.remove('hidden');
        } else {
            activeStatus.classList.add('hidden');
        }
    }
    if (customInput) customInput.classList.add('hidden');
}

export function showCustomTimerInput() {
    const input = document.getElementById('custom-timer-input');
    if (input) input.classList.remove('hidden');
}

export function applyCustomTimer() {
    const inputEl = document.getElementById('custom-minutes');
    const val = parseInt(inputEl.value);
    if (val > 0) {
        setSleepTimer(val);
        inputEl.value = '';
    } else {
        showError('请输入正确的时间（分钟）');
    }
}

// 监听模态框外部点击关闭
document.addEventListener('mousedown', (e) => {
    const modal = document.getElementById('sleep-timer-modal');
    const content = document.getElementById('sleep-timer-modal-content');
    if (modal && !modal.classList.contains('hidden') && e.target === modal) {
        closeSleepTimerModal();
    }
});
