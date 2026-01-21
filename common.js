const BIRDNET = {
    apiUrl: 'https://birdnet.cornell.edu/api2/requeststats',
    iconUrl: 'https://birdnet.cornell.edu/img/logo-birdnet-circle.png',
    themeColor: '#1976d2'
};

const BIRDNET_DATA_WINDOW_HOURS = 24;

function setFooterDataSourceText(text) {
    const sourceElement = document.getElementById('dataSource');
    if (sourceElement) {
        sourceElement.textContent = text;
    }
}

function formatBirdnetLiveData({ totalObservations, uniqueSpecies, hours = BIRDNET_DATA_WINDOW_HOURS }) {
    const safeHours = Number.isFinite(hours) && hours > 0 ? Math.round(hours) : BIRDNET_DATA_WINDOW_HOURS;
    const obsText = Number.isFinite(totalObservations) ? totalObservations.toLocaleString() : '0';
    const speciesText = Number.isFinite(uniqueSpecies) ? uniqueSpecies.toLocaleString() : '0';
    return `Live data from BirdNET (${obsText} observations, ${speciesText} species in last ${safeHours}h)`;
}

function setDynamicManifest(manifestObject) {
    const manifestBlob = new Blob([JSON.stringify(manifestObject)], { type: 'application/json' });
    const manifestURL = URL.createObjectURL(manifestBlob);
    const manifestLink = document.getElementById('manifest-placeholder');
    if (manifestLink) {
        manifestLink.setAttribute('href', manifestURL);
    }
}

function buildInlineServiceWorkerCode({ cacheName }) {
    return `
        const CACHE_NAME = '${cacheName}';
        const ALLOWED_ORIGINS = [self.location.origin, 'https://birdnet.cornell.edu'];
        const API_PATH = '/api2/requeststats';
        const BIRD_IMAGE_PREFIX = '/api2/bird/';

        self.addEventListener('install', () => self.skipWaiting());

        self.addEventListener('activate', (event) => {
            event.waitUntil((async () => {
                const keys = await caches.keys();
                await Promise.all(keys.map((key) => (key === CACHE_NAME ? Promise.resolve() : caches.delete(key))));
                await clients.claim();
            })());
        });

        async function cacheFirst(request) {
            const cached = await caches.match(request);
            if (cached) return cached;
            const response = await fetch(request);
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
            return response;
        }

        async function networkFirst(request) {
            try {
                const response = await fetch(request);
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, response.clone());
                return response;
            } catch (err) {
                const cached = await caches.match(request);
                if (cached) return cached;
                throw err;
            }
        }

        async function staleWhileRevalidate(request) {
            const cached = await caches.match(request);
            const fetchPromise = fetch(request).then(async (response) => {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, response.clone());
                return response;
            }).catch(() => null);
            return cached || (await fetchPromise);
        }

        self.addEventListener('fetch', (event) => {
            const request = event.request;
            if (request.method !== 'GET') return;

            const url = new URL(request.url);
            if (!ALLOWED_ORIGINS.includes(url.origin)) return;

            if (url.origin === 'https://birdnet.cornell.edu' && url.pathname === API_PATH) {
                event.respondWith(networkFirst(request));
                return;
            }

            if (url.origin === 'https://birdnet.cornell.edu' && url.pathname.startsWith(BIRD_IMAGE_PREFIX)) {
                event.respondWith(cacheFirst(request));
                return;
            }

            event.respondWith(staleWhileRevalidate(request));
        });
    `;
}

async function registerInlineServiceWorker({ cacheName, logLabel }) {
    if (!('serviceWorker' in navigator)) return;
    try {
        const swCode = buildInlineServiceWorkerCode({ cacheName });
        const swBlob = new Blob([swCode], { type: 'application/javascript' });
        const swURL = URL.createObjectURL(swBlob);
        await navigator.serviceWorker.register(swURL);
        console.log(`${logLabel}: Service Worker registered`);
    } catch (error) {
        console.log(`${logLabel}: Service Worker registration failed:`, error);
    }
}

function setupFullscreen(buttonId = 'fullscreenBtn') {
    const fullscreenBtn = document.getElementById(buttonId);
    if (!fullscreenBtn) return;

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.log('Error attempting to enable fullscreen:', err);
            });
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }

    function updateFullscreenButton() {
        if (document.fullscreenElement) {
            fullscreenBtn.textContent = '⛶';
            fullscreenBtn.title = 'Exit Fullscreen';
        } else {
            fullscreenBtn.textContent = '⛶';
            fullscreenBtn.title = 'Enter Fullscreen';
        }
    }

    fullscreenBtn.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', updateFullscreenButton);
}

function setupInstallPrompt({ promptId = 'installPrompt', buttonId = 'installButton' } = {}) {
    const installPrompt = document.getElementById(promptId);
    const installButton = document.getElementById(buttonId);
    if (!installPrompt || !installButton) return;

    let deferredPrompt;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installPrompt.classList.add('show');
    });

    installButton.addEventListener('click', async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;

        if (outcome === 'accepted') {
            installPrompt.classList.remove('show');
        }

        deferredPrompt = null;
    });

    window.addEventListener('appinstalled', () => {
        installPrompt.classList.remove('show');
        deferredPrompt = null;
    });
}

function initCommon({
    name,
    shortName,
    description,
    startUrl,
    cacheName,
    logLabel,
    promptId,
    buttonId,
    fullscreenButtonId
} = {}) {
    if (name && startUrl) {
        setDynamicManifest({
            name,
            short_name: shortName || name,
            description: description || name,
            start_url: startUrl,
            display: 'standalone',
            background_color: '#ffffff',
            theme_color: BIRDNET.themeColor,
            orientation: 'portrait',
            icons: [
                {
                    src: BIRDNET.iconUrl,
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'any maskable'
                }
            ]
        });
    }

    if (cacheName && logLabel) {
        registerInlineServiceWorker({ cacheName, logLabel });
    }

    setupInstallPrompt({ promptId, buttonId });
    setupFullscreen(fullscreenButtonId || 'fullscreenBtn');
}
