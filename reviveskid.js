// QuickAI - AI Chat Client with Clean UI
(function() {
    const SCRIPT_NAME = "QuickAI 🤖";
    const VERSION = "v2.0 - Offline/Basic AI"; // Modified version for clarity and to reflect reduced features
    const API_BASE = 'https://qcapi.onrender.com'; // Kept as it's used by the AI endpoint

    // Removed SYSTEM_PROMPT as it may imply specific AI capabilities no longer guaranteed
    // Replaced with a more generic one that doesn't "promise" features

    const SYSTEM_PROMPT_GENERIC = `QuickAI is a chat assistant. You can ask questions or use commands.
How may QuickAI assist today?`;

    // UI Elements
    const UI = {
        DIVIDER: "────────────────────────────────────────────────",
        SUB_LINE: "┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈"
    };

    let messageHistory = [];
    let currentUser = { username: "User", name: "User" }; // Default user, "Guest" implies external auth, changing to "User"
    let sessionStart = Date.now();
    let msgCount = 0;

    // Logging
    function log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = `[QuickAI] [${timestamp}]`;
        if (type === 'error') console.error(`${prefix} ❌ ${msg}`);
        else if (type === 'warn') console.warn(`${prefix} ⚠️ ${msg}`);
        else if (type === 'success') console.log(`${prefix} ✅ ${msg}`);
        else console.log(`${prefix} ℹ️ ${msg}`);
    }

    // Removed all API helpers (fetchUser, updateIP, getIP, auth, getAnnouncement)
    // as they are not needed and do not directly relate to the single AI endpoint.

    // Command handling
    function handleCommand(input) {
        const cmd = input.toLowerCase().trim();

        if (cmd === 'help') {
            return {
                handled: true,
                response: [
                    "🤖 QuickAI Command Guide:",
                    UI.DIVIDER,
                    "💬 Chat normally - Just type your message!",
                    "🔧 System info - Type 'system'", // Changed from 'system queries' which sounds like it needs an API
                    "📊 Session stats - Type 'stats'",
                    "🧹 Clear history - Type 'clear'",
                    "❌ Exit chat - Type 'exit' or 'quit'",
                    "❓ Show help - Type 'help'",
                    UI.DIVIDER,
                    "✨ Pro tip: I remember our conversation context!"
                ].join('\n')
            };
        }

        if (cmd === 'clear') {
            messageHistory = [];
            return {
                handled: true,
                response: [
                    "🧹 Conversation Cleared!",
                    UI.SUB_LINE,
                    "✨ Starting fresh - ready for new questions!"
                ].join('\n')
            };
        }

        if (cmd === 'exit' || cmd === 'quit') {
            const duration = Math.floor((Date.now() - sessionStart) / 60000);
            return {
                handled: true,
                response: [
                    "👋 Chat Session Ended",
                    UI.DIVIDER,
                    `📊 Final Stats: ${msgCount} messages in ${duration} minutes`,
                    "✨ Thanks for using QuickAI! See you next time!"
                ].join('\n'),
                exit: true
            };
        }

        if (cmd === 'stats') {
            const duration = Math.floor((Date.now() - sessionStart) / 60000);
            return {
                handled: true,
                response: [
                    "📊 Session Statistics:",
                    UI.DIVIDER,
                    `👤 User: ${currentUser.name}`, // Removed || currentUser?.username as currentUser is now a fixed object
                    `⏱️ Duration: ${duration} minutes`,
                    `💬 Messages: ${msgCount}`,
                    `🗓️ Started: ${new Date(sessionStart).toLocaleTimeString()}`,
                    UI.DIVIDER,
                    "✨ Thanks for chatting with QuickAI!"
                ].join('\n')
            };
        }
        
        // Changed from '>' prefix for 'system queries' to simply 'system' command
        if (cmd === 'system') {
            return {
                handled: true,
                response: [
                    `🔧 System Information:`,
                    UI.SUB_LINE,
                    `Client Name: ${SCRIPT_NAME}`,
                    `Client Version: ${VERSION}`,
                    `API Endpoint: ${API_BASE}/ai`,
                    `Initial System Prompt:`,
                    SYSTEM_PROMPT_GENERIC.split('\n').map(line => `  ${line}`).join('\n')
                ].join('\n')
            };
        }

        return { handled: false };
    }

    // Main chat function
    async function runChat() {
        // Removed announcement fetching as it's an API call not directly for AI
        const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

        if (isMobile) {
            alert([
                "⚠️ Mobile Device Detected",
                UI.DIVIDER,
                "🔧 Some features may not work properly on mobile",
                "💻 For best experience, use on desktop/laptop"
            ].join('\n'));
        }

        function chatLoop() {
            const isFirst = messageHistory.length === 0;

            const promptMessage = isFirst ?
                `👋 Welcome, ${currentUser.name}! (${SCRIPT_NAME} ${VERSION})
` +
                `────────────────────────────
` +
                `Type "help" for commands | ✨ Chat with AI directly! ✨
` +
                // Removed announcement line as announcements are no longer fetched
                `────────────────────────────
` +
                `💬 Your message:` :
                `💬 Your message:`;

            const input = window.prompt(promptMessage);

            // Silent exit on null/empty
            if (!input || input.trim() === '') return;

            const trimmed = input.trim();
            msgCount++;

            // Handle commands
            const cmdResult = handleCommand(trimmed);
            if (cmdResult.handled) {
                messageHistory.push({ isUser: false, text: cmdResult.response });
                if (cmdResult.exit) {
                    alert(cmdResult.response);
                    return;
                }
                chatLoop();
                return;
            }

            messageHistory.push({ isUser: true, text: trimmed });

            // AI request with enhanced context
            const context = messageHistory.slice(-10).map(m =>
                `${m.isUser ? 'Human' : 'Assistant'}: ${m.text}`
            ).join('\n\n');

            // Use the more generic SYSTEM_PROMPT
            const fullContext = `${SYSTEM_PROMPT_GENERIC}\n\nPrevious conversation:\n${context}\n\nHuman: ${trimmed}\nAssistant:`;

            log('🤖 Sending AI request...');
            fetch(`${API_BASE}/ai?p=${encodeURIComponent(trimmed + '\n' + fullContext)}`)
                .then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.json();
                })
                .then(data => {
                    const response = data.r || data.response || data.message || 'No response received';
                    messageHistory.push({ isUser: false, text: response.trim() });
                    log('🤖 AI response received', 'success');

                    const displayMessage =
                        `🤖 ${SCRIPT_NAME} - AI Response\n` +
                        `────────────────────────────\n` +
                        `👤 You: ${trimmed}\n\n` +
                        `🤖 AI: ${response.trim()}\n` +
                        `────────────────────────────\n\n` +
                        `Press Enter to continue the conversation...`;

                    alert(displayMessage);
                    chatLoop();
                })
                .catch(e => {
                    log(`🤖 AI request failed: ${e.message}`, 'error');
                    const errorResponse = [
                        "⚠️ Connection Issue",
                        UI.SUB_LINE,
                        "🔌 Unable to reach AI service. Please try again!",
                        "🔄 Check your internet connection."
                    ].join('\n');

                    messageHistory.push({ isUser: false, text: errorResponse });
                    alert(errorResponse);
                    chatLoop();
                });
        }

        log(`🚀 Starting chat session for ${currentUser.username}`, 'success');
        chatLoop();
    }

    // Initialize application
    log(`🚀 ${SCRIPT_NAME} ${VERSION} initializing...`);
    // Directly call runChat without any authentication or user fetching
    runChat();
})();
