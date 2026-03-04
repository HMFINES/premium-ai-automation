(function initSupportChatbot() {
    const CHAT_STORAGE_KEY = 'elevatex_support_profile';
    const AUTH_STORAGE_KEY = 'elevatex_auth';

    function normalizeBaseUrl(url) {
        return String(url || '').replace(/\/+$/, '');
    }

    function getMetaBaseUrl() {
        const metaTag = document.querySelector('meta[name="elevatex-api-base-url"]');
        return normalizeBaseUrl(metaTag?.content || '');
    }

    function getApiBaseUrl() {
        if (window.ELEVATEX_API_BASE_URL) {
            return normalizeBaseUrl(window.ELEVATEX_API_BASE_URL);
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

    function safeParse(value) {
        try {
            return JSON.parse(value);
        } catch (_error) {
            return null;
        }
    }

    function readAuthProfile() {
        const fromLocal = localStorage.getItem(AUTH_STORAGE_KEY);
        const fromSession = sessionStorage.getItem(AUTH_STORAGE_KEY);
        const auth = safeParse(fromLocal || fromSession || '');
        return auth?.user || null;
    }

    function readSupportProfile() {
        const saved = safeParse(localStorage.getItem(CHAT_STORAGE_KEY) || '');
        const authUser = readAuthProfile();

        return {
            clientName: saved?.clientName || (authUser ? `${authUser.firstName || ''} ${authUser.lastName || ''}`.trim() : ''),
            clientEmail: saved?.clientEmail || authUser?.email || ''
        };
    }

    function saveSupportProfile(profile) {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(profile));
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function parseJsonSafe(response) {
        const raw = await response.text();
        if (!raw) return null;
        return safeParse(raw);
    }

    async function requestSupportReply(payload) {
        let response;
        try {
            response = await fetch(`${getApiBaseUrl()}/support/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
        } catch (_error) {
            throw new Error('Unable to connect to support server. Verify API URL and backend availability.');
        }

        const data = await parseJsonSafe(response);
        if (!response.ok || !data?.success) {
            throw new Error(data?.error?.message || `Support service unavailable (${response.status})`);
        }
        return data.data;
    }

    function createChatbotDom() {
        const toggle = document.createElement('button');
        toggle.className = 'support-chatbot-toggle';
        toggle.setAttribute('aria-label', 'Open support chat');
        toggle.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2z"/>
            </svg>
        `;

        const windowEl = document.createElement('section');
        windowEl.className = 'support-chatbot-window';
        windowEl.innerHTML = `
            <header class="support-chatbot-header">
                <div class="support-chatbot-header-top">
                    <div class="support-chatbot-title">
                        <span class="status-dot"></span>
                        <span>AI Support Assistant</span>
                    </div>
                    <button class="support-chatbot-close" type="button" aria-label="Close chat">×</button>
                </div>
                <div class="support-chatbot-meta">
                    <input id="supportClientName" type="text" placeholder="Your name">
                    <input id="supportClientEmail" type="email" placeholder="Your email">
                </div>
            </header>
            <div class="support-chatbot-messages" id="supportChatMessages"></div>
            <div class="support-chatbot-footer">
                <input id="supportChatInput" type="text" placeholder="Describe your issue or ask a question...">
                <button class="support-chatbot-send" id="supportChatSend" type="button">Send</button>
            </div>
        `;

        document.body.appendChild(toggle);
        document.body.appendChild(windowEl);

        return { toggle, windowEl };
    }

    function addMessage(container, type, message) {
        const div = document.createElement('div');
        div.className = `support-message ${type}`;
        div.innerHTML = escapeHtml(message);
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    function setWelcome(container) {
        addMessage(
            container,
            'bot',
            'Hi, I am your AI customer support assistant. Share your query and I will suggest the best solution. If there is an issue, I will log a support ticket.'
        );
    }

    function boot() {
        const { toggle, windowEl } = createChatbotDom();
        const closeBtn = windowEl.querySelector('.support-chatbot-close');
        const messagesEl = windowEl.querySelector('#supportChatMessages');
        const inputEl = windowEl.querySelector('#supportChatInput');
        const sendBtn = windowEl.querySelector('#supportChatSend');
        const nameEl = windowEl.querySelector('#supportClientName');
        const emailEl = windowEl.querySelector('#supportClientEmail');

        const profile = readSupportProfile();
        nameEl.value = profile.clientName || '';
        emailEl.value = profile.clientEmail || '';

        let history = [];
        let sending = false;

        function openChat() {
            windowEl.classList.add('active');
            inputEl.focus();
            if (messagesEl.childElementCount === 0) {
                setWelcome(messagesEl);
            }
        }

        function closeChat() {
            windowEl.classList.remove('active');
        }

        async function sendMessage() {
            const message = inputEl.value.trim();
            if (!message || sending) return;

            const clientName = nameEl.value.trim();
            const clientEmail = emailEl.value.trim();

            saveSupportProfile({ clientName, clientEmail });

            addMessage(messagesEl, 'user', message);
            inputEl.value = '';
            sending = true;
            sendBtn.disabled = true;
            addMessage(messagesEl, 'bot', 'Working on your solution...');

            try {
                const data = await requestSupportReply({
                    message,
                    history,
                    clientName,
                    clientEmail
                });

                messagesEl.lastChild?.remove();
                addMessage(messagesEl, 'bot', data.reply || 'Here is what I found.');

                history.push({ role: 'user', content: message });
                history.push({ role: 'assistant', content: data.reply || '' });
                history = history.slice(-12);

                if (data.issueLogged && data.ticket) {
                    addMessage(
                        messagesEl,
                        'ticket',
                        `Issue logged successfully. Ticket: ${data.ticket.ticketNumber} | Priority: ${data.ticket.priority} | Status: ${data.ticket.status}`
                    );
                }
            } catch (error) {
                messagesEl.lastChild?.remove();
                addMessage(messagesEl, 'bot', error.message || 'Unable to process your request right now.');
            } finally {
                sending = false;
                sendBtn.disabled = false;
                inputEl.focus();
            }
        }

        toggle.addEventListener('click', openChat);
        closeBtn.addEventListener('click', closeChat);
        sendBtn.addEventListener('click', sendMessage);
        inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') sendMessage();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
