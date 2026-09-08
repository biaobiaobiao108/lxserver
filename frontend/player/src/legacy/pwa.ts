let deferredPrompt: BeforeInstallPromptEvent | null = null;

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const installButton = document.getElementById('pwa-install-btn');

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(error => console.warn('ServiceWorker registration failed:', error));
    });
}

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    installButton?.classList.remove('hidden');
    installButton?.classList.add('flex');
});

installButton?.addEventListener('click', async () => {
    installButton.classList.add('hidden');
    installButton.classList.remove('flex');
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    console.log(`User ${ (await deferredPrompt.userChoice).outcome } the A2HS prompt`);
    deferredPrompt = null;
});

window.addEventListener('appinstalled', () => {
    installButton?.classList.add('hidden');
    installButton?.classList.remove('flex');
});
