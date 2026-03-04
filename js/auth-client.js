(function initAuthClient(global) {
    const AUTH_STORAGE_KEY = 'elevatex_auth';
    const OAUTH_POPUP_NAME = 'elevatex_oauth_popup';
    const OAUTH_POPUP_FEATURES = 'width=540,height=700,left=200,top=80,resizable=yes,scrollbars=yes';

    function normalizeBaseUrl(url) {
        return String(url || '').replace(/\/+$/, '');
    }

    function getMetaBaseUrl() {
        const metaTag = document.querySelector('meta[name="elevatex-api-base-url"]');
        return normalizeBaseUrl(metaTag?.content || '');
    }

    function getApiBaseUrl() {
        if (global.ELEVATEX_API_BASE_URL) {
            return normalizeBaseUrl(global.ELEVATEX_API_BASE_URL);
        }

        const metaBaseUrl = getMetaBaseUrl();
        if (metaBaseUrl) {
            return metaBaseUrl;
        }

        if (window.location.protocol === 'file:') {
            return 'http://localhost:4000/api';
        }

        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:4000/api';
        }

        return `${window.location.origin}/api`;
    }

    function getApiOrigin() {
        const apiUrl = new URL(getApiBaseUrl(), window.location.href);
        return `${apiUrl.protocol}//${apiUrl.host}`;
    }

    async function parseJsonSafe(response) {
        const raw = await response.text();
        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw);
        } catch (_error) {
            return null;
        }
    }

    async function requestJson(path, payload) {
        let response;
        try {
            response = await fetch(`${getApiBaseUrl()}${path}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
        } catch (_error) {
            throw new Error('Unable to connect to backend API. Verify API URL and server availability.');
        }

        const data = await parseJsonSafe(response);
        if (!response.ok || !data?.success) {
            throw new Error(data?.error?.message || `Request failed (${response.status})`);
        }

        return data.data;
    }

    function oauthLogin(provider) {
        const normalizedProvider = String(provider || '').trim().toLowerCase();
        if (!normalizedProvider) {
            return Promise.reject(new Error('OAuth provider is required'));
        }

        return new Promise((resolve, reject) => {
            const popup = window.open(
                `${getApiBaseUrl()}/auth/${normalizedProvider}/start`,
                OAUTH_POPUP_NAME,
                OAUTH_POPUP_FEATURES
            );

            if (!popup) {
                reject(new Error('Popup blocked. Please allow popups and try again.'));
                return;
            }

            const expectedOrigin = getApiOrigin();
            let finished = false;

            const cleanup = () => {
                window.removeEventListener('message', handleMessage);
                clearInterval(closeWatcher);
            };

            const fail = (message) => {
                if (finished) {
                    return;
                }
                finished = true;
                cleanup();
                reject(new Error(message));
            };

            const succeed = (data) => {
                if (finished) {
                    return;
                }
                finished = true;
                cleanup();
                resolve(data);
            };

            const closeWatcher = setInterval(() => {
                if (!popup || popup.closed) {
                    fail('Authentication popup was closed before completion.');
                }
            }, 400);

            const handleMessage = (event) => {
                if (event.origin !== expectedOrigin) {
                    return;
                }

                const payload = event.data;
                if (!payload || payload.source !== 'elevatex_oauth') {
                    return;
                }

                if (!payload.success || !payload.data) {
                    fail(payload.error || 'OAuth login failed');
                    return;
                }

                succeed(payload.data);
            };

            window.addEventListener('message', handleMessage);
        });
    }

    function saveAuth(data, rememberMe) {
        const serialized = JSON.stringify(data);
        localStorage.removeItem(AUTH_STORAGE_KEY);
        sessionStorage.removeItem(AUTH_STORAGE_KEY);

        if (rememberMe) {
            localStorage.setItem(AUTH_STORAGE_KEY, serialized);
            return;
        }

        sessionStorage.setItem(AUTH_STORAGE_KEY, serialized);
    }

    function getAuth() {
        const fromLocal = localStorage.getItem(AUTH_STORAGE_KEY);
        const fromSession = sessionStorage.getItem(AUTH_STORAGE_KEY);
        const value = fromLocal || fromSession;
        if (!value) {
            return null;
        }

        try {
            return JSON.parse(value);
        } catch (_error) {
            return null;
        }
    }

    function clearAuth() {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
    }

    global.ElevatexAuth = {
        requestJson,
        oauthLogin,
        saveAuth,
        getAuth,
        clearAuth
    };
})(window);
