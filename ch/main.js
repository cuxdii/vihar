(function() {
    // --- Configuration & Constants ---
    const APP_ID = 'chatium-bookmarklet-app';
    const APP_NAME = 'chatium';
    const LOGO_URL = 'https://cuxdi.nekoweb.org/chatium-logo.png';
    const DEFAULT_SETTINGS = { 
        roomCode: 'rpschat', 
        keybind: 'Shift+C', 
        width: 55, 
        height: 45, 
        showAncNotifications: true, // New setting
        isPanelUnlocked: false      // New setting
    };
    
    const LANYARD_API_URL = 'https://api.lanyard.rest/v1/users/1156381555875385484';
    const LANYARD_PUT_KEY = 'anc';
    const LANYARD_AUTH_TOKEN = '7ec87932736ad0f082203f3abb112e8b';
    const UNLOCK_CODE = '8508';
    const POLLING_INTERVAL = 10000; // 10 seconds

    let settings = DEFAULT_SETTINGS;
    let container = document.getElementById(APP_ID);
    let isHidden = false;
    let isRecordingKeybind = false;
    let recordedKeybind = DEFAULT_SETTINGS.keybind;
    let isFullscreen = false;
    let previousWidth, previousHeight, previousX, previousY;
    let isDragging = false;
    let isResizing = false;
    let initialX, initialY;
    
    let currentAnnouncement = null; // State for tracking the latest announcement
    let announcementInterval = null;

    // --- Utility Functions ---
    function loadSettings() {
        try {
            const storedSettings = localStorage.getItem('chatiumSettings');
            if (storedSettings) {
                const loaded = JSON.parse(storedSettings);
                settings = { 
                    ...DEFAULT_SETTINGS, 
                    // Load existing values, falling back to defaults
                    roomCode: loaded.roomCode || DEFAULT_SETTINGS.roomCode,
                    keybind: loaded.keybind || DEFAULT_SETTINGS.keybind,
                    width: loaded.width || DEFAULT_SETTINGS.width,
                    height: loaded.height || DEFAULT_SETTINGS.height,
                    showAncNotifications: loaded.showAncNotifications !== undefined ? loaded.showAncNotifications : DEFAULT_SETTINGS.showAncNotifications,
                    isPanelUnlocked: loaded.isPanelUnlocked || DEFAULT_SETTINGS.isPanelUnlocked,
                };
            }
        } catch (e) { console.error("Failed to load settings:", e); }
    }

    function saveSettings() {
        try {
            const settingsToSave = { 
                roomCode: settings.roomCode, 
                keybind: settings.keybind, 
                width: settings.width, 
                height: settings.height,
                showAncNotifications: settings.showAncNotifications,
                isPanelUnlocked: settings.isPanelUnlocked
            };
            localStorage.setItem('chatiumSettings', JSON.stringify(settingsToSave));
            // Removed notification for saving settings to reduce clutter
        } catch (e) { console.error("Failed to save settings:", e); showNotification('error saving settings. browser storage may be restricted.', 5000); }
    }

    function addMultipleListeners(element, events, handler) {
        events.forEach(event => element.addEventListener(event, handler));
    }
    
    // --- Notification Logic ---
    function showNotification(message, duration = 3000) {
        const NOTIF_ID = 'chatium-generic-notif';
        let existingNotif = document.getElementById(NOTIF_ID);
        if (existingNotif) existingNotif.remove();

        const notif = document.createElement('div');
        notif.id = NOTIF_ID;
        notif.className = 'notification-bar';
        
        notif.innerHTML = `
            <div class="timer-bar" style="animation: shrink-bar ${duration / 1000}s linear forwards;"></div>
            <div class="flex items-center justify-between">
                <span class="text-sm font-medium lowercase">${message}</span>
                <button class="ml-4 text-gray-400 hover:text-white transition-colors p-1 -mt-1" onclick="document.getElementById('${NOTIF_ID}').remove();">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>
        `;
        document.body.appendChild(notif);
        setTimeout(() => { if (notif && notif.parentNode) { notif.remove(); } }, duration);
    }
    
    // Notification for new announcement (triggers three times)
    function triggerNewAnnouncementNotification(ancText) {
        if (!settings.showAncNotifications) return;

        const alarmEmoji = '🚨';
        const notifMsg = `${alarmEmoji} <strong class="text-red-400">NEW ANNOUNCEMENT</strong> ${alarmEmoji}<br><span class="text-xs italic">${ancText}</span>`;
        
        // Simulate three sequential notifications
        showNotification(notifMsg, 1500);
        setTimeout(() => showNotification(notifMsg, 1500), 500);
        setTimeout(() => showNotification(notifMsg, 1500), 1000);
    }

    function toggleAppVisibility() {
        if (!container) return;
        if (isHidden) {
            container.style.display = 'flex';
            isHidden = false;
        } else {
            container.style.display = 'none';
            isHidden = true;
        }
        // Removed all notifications after keybind/button press
    }

    // --- Keybind Logic (Unchanged) ---
    function handleKeybind(e) {
        if (isRecordingKeybind) return;
        let keys = [];
        if (e.shiftKey && e.key.toUpperCase() !== 'SHIFT') keys.push('Shift');
        if (e.ctrlKey && e.key.toUpperCase() !== 'CONTROL') keys.push('Ctrl');
        if (e.altKey && e.key.toUpperCase() !== 'ALT') keys.push('Alt');

        const mainKey = e.key.toUpperCase();
        if (mainKey !== 'SHIFT' && mainKey !== 'CONTROL' && mainKey !== 'ALT') {
            keys.push(mainKey);
        }
        const keyString = keys.join('+');

        if (keyString.toUpperCase() === settings.keybind.toUpperCase()) {
            e.preventDefault();
            if (!container) {
                startBookmarkletApp();
            } else {
                toggleAppVisibility();
            }
        }
    }
    
    function startKeybindRecording() {
        if (isRecordingKeybind) return;
        isRecordingKeybind = true;
        recordedKeybind = '';
        
        const keybindInput = document.getElementById('keybind-input');
        const setKeybindBtn = document.getElementById('set-keybind-btn');
        
        if (keybindInput) {
            keybindInput.value = '...';
            keybindInput.classList.add('italic', 'text-gray-500');
            keybindInput.blur();
        }
        if (setKeybindBtn) setKeybindBtn.disabled = true;

        document.removeEventListener('keydown', handleKeybind); 
        document.addEventListener('keydown', captureKeybind, { once: true, capture: true }); 
    }

    function captureKeybind(e) {
        if (!isRecordingKeybind) return;
        e.preventDefault();
        
        const keybindInput = document.getElementById('keybind-input');
        const setKeybindBtn = document.getElementById('set-keybind-btn');

        let keys = [];
        if (e.shiftKey && e.ctrlKey && e.altKey) { keys.push('Shift+Ctrl+Alt'); }
        else if (e.shiftKey && e.key.toUpperCase() !== 'SHIFT') keys.push('Shift');
        else if (e.ctrlKey && e.key.toUpperCase() !== 'CONTROL') keys.push('Ctrl');
        else if (e.altKey && e.key.toUpperCase() !== 'ALT') keys.push('Alt');

        const mainKey = e.key.toUpperCase();
        if (mainKey !== 'SHIFT' && mainKey !== 'CONTROL' && mainKey !== 'ALT') {
            keys.push(mainKey);
        }
        
        recordedKeybind = keys.join('+');

        if (recordedKeybind.length === 0 || keys.length === 0) {
             showNotification('please press a main key along with modifiers (or just a key).', 3000);
             document.addEventListener('keydown', captureKeybind, { once: true, capture: true });
             return;
        }

        if (keybindInput) {
            keybindInput.value = recordedKeybind;
            keybindInput.classList.remove('italic', 'text-gray-500');
        }
        if (setKeybindBtn) setKeybindBtn.disabled = false;
        
        document.addEventListener('keydown', handleKeybind); 
        isRecordingKeybind = false;
    }

    // --- Drag and Resize Handlers (Unchanged) ---
    const dragStart = (e) => {
        if (isFullscreen || e.target.closest('button')) return;
        isDragging = true;
        initialX = e.clientX - container.offsetLeft;
        initialY = e.clientY - container.offsetTop;
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        const header = document.getElementById(`${APP_ID}-header`);
        if(header) header.style.cursor = 'grabbing';
    };

    const drag = (e) => {
        if (!isDragging || isResizing || isFullscreen) return;
        e.preventDefault();
        container.style.left = `${e.clientX - initialX}px`;
        container.style.top = `${e.clientY - initialY}px`;
        container.style.transform = `none`;
    };

    const dragEnd = () => {
        isDragging = false;
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', dragEnd);
        const header = document.getElementById(`${APP_ID}-header`);
        if(header) header.style.cursor = 'grab';
    };

    const resizeStart = (e) => {
        if (isFullscreen) return;
        isResizing = true;
        e.preventDefault();
        const activeResizer = e.target;
        const initialWidth = container.offsetWidth;
        const initialHeight = container.offsetHeight;
        const initialMouseX = e.clientX;
        const initialMouseY = e.clientY;
        const initialLeft = container.offsetLeft;
        const initialTop = container.offsetTop;
        
        const minWidth = 350;
        const minHeight = 250;

        const resize = (e) => {
            if (!isResizing) return;
            const dx = e.clientX - initialMouseX;
            const dy = e.clientY - initialMouseY;
            let newWidth = initialWidth;
            let newHeight = initialHeight;
            let newX = initialLeft;
            let newY = initialTop;

            if (activeResizer.classList.contains('right') || activeResizer.classList.contains('bottom-right') || activeResizer.classList.contains('top-right')) {
                newWidth = Math.max(minWidth, initialWidth + dx);
            }
            if (activeResizer.classList.contains('bottom') || activeResizer.classList.contains('bottom-left') || activeResizer.classList.contains('bottom-right')) {
                newHeight = Math.max(minHeight, initialHeight + dy);
            }
            if (activeResizer.classList.contains('left') || activeResizer.classList.contains('top-left') || activeResizer.classList.contains('bottom-left')) {
                const calculatedWidth = initialWidth - dx;
                if (calculatedWidth >= minWidth) {
                     newWidth = calculatedWidth;
                     newX = initialLeft + dx;
                }
            }
            if (activeResizer.classList.contains('top') || activeResizer.classList.contains('top-left') || activeResizer.classList.contains('top-right')) {
                const calculatedHeight = initialHeight - dy;
                if (calculatedHeight >= minHeight) {
                    newHeight = calculatedHeight;
                    newY = initialTop + dy;
                }
            }

            container.style.width = `${newWidth}px`;
            container.style.height = `${newHeight}px`;
            container.style.left = `${newX}px`;
            container.style.top = `${newY}px`;
        };

        const resizeEnd = () => {
            isResizing = false;
            settings.width = Math.round((container.offsetWidth / window.innerWidth) * 100);
            settings.height = Math.round((container.offsetHeight / window.innerHeight) * 100);
            saveSettings();
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', resizeEnd);
        };

        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', resizeEnd);
    };

    // --- Announcement and Admin Logic ---
    function updateAnnouncementDisplay(text, isError = false) {
        const container = document.getElementById('announcement-display');
        if (container) {
            container.innerHTML = isError 
                ? `<p class="text-xs text-red-500">${text}</p>`
                : `<p class="text-sm italic">${text || 'No current announcement.'}</p>`;
        }
    }
    
    function fetchAndCheckAnnouncement() {
        fetch(LANYARD_API_URL)
            .then(response => response.json())
            .then(data => {
                const newAnnouncement = data?.data?.kv?.anc || '';
                
                // On first load (initial check)
                if (currentAnnouncement === null) {
                    currentAnnouncement = newAnnouncement;
                    updateAnnouncementDisplay(newAnnouncement);
                    return;
                }
                
                // Check for difference and trigger notifications
                if (newAnnouncement && newAnnouncement !== currentAnnouncement) {
                    currentAnnouncement = newAnnouncement;
                    updateAnnouncementDisplay(newAnnouncement);
                    triggerNewAnnouncementNotification(newAnnouncement);
                } else if (newAnnouncement !== currentAnnouncement) {
                    // Handle case where announcement is removed or set to empty
                    currentAnnouncement = newAnnouncement;
                    updateAnnouncementDisplay(newAnnouncement);
                }

                // Update panel UI placeholder if the panel is unlocked
                if (settings.isPanelUnlocked) {
                    const newAncInput = document.getElementById('new-anc-input');
                    if (newAncInput) newAncInput.placeholder = currentAnnouncement;
                }
            })
            .catch(error => {
                console.error("Lanyard API error:", error);
                updateAnnouncementDisplay('Failed to load announcements.', true);
            });
    }

    function startAnnouncementPolling() {
        if (announcementInterval) clearInterval(announcementInterval);
        fetchAndCheckAnnouncement(); // Initial check
        announcementInterval = setInterval(fetchAndCheckAnnouncement, POLLING_INTERVAL);
    }
    
    // Function with exponential backoff for Lanyard PUT request
    async function retryFetch(url, options, maxRetries = 5) {
        let lastError = null;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status} - ${await response.text().catch(() => 'No body')}`);
                }
                return response;
            } catch (error) {
                lastError = error;
                const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw new Error(`Failed to update announcement after ${maxRetries} attempts: ${lastError ? lastError.message : 'Unknown error'}`);
    }

    async function setAnnouncement(newAncText) {
        const url = `${LANYARD_API_URL}/kv/${LANYARD_PUT_KEY}`;
        
        const options = {
            method: 'PUT',
            headers: {
                'Authorization': LANYARD_AUTH_TOKEN,
                'Content-Type': 'text/plain', 
            },
            body: newAncText // The text content
        };

        const setBtn = document.getElementById('set-anc-btn');
        if (setBtn) {
            setBtn.disabled = true;
            setBtn.textContent = 'setting...';
        }

        try {
            await retryFetch(url, options);
            showNotification('announcement updated successfully!', 4000);
            
            // Immediately update the current state in the app
            currentAnnouncement = newAncText; 
            updateAnnouncementDisplay(newAncText);
            updatePanelUI(); // Re-render panel to update placeholder

        } catch (error) {
            console.error('Failed to set announcement:', error);
            showNotification(`error setting announcement: ${error.message.substring(0, 100)}...`, 6000);
        } finally {
            if (setBtn) {
                setBtn.disabled = false;
                setBtn.textContent = 'set announcement';
            }
        }
    }
    
    // --- Panel Content Generation ---
    function getLockedContent() {
        return `
            <h3 class="text-xl font-semibold mb-3">locked <i class="fas fa-lock ml-1"></i></h3>
            <p class="lowercase text-gray-400 mb-6">access the admin panel by entering the 4-digit code.</p>
            <div class="bg-primary p-4 rounded-lg border border-gray-700">
                <h4 class="text-lg font-semibold mb-2 lowercase">panel code</h4>
                <div class="flex space-x-2">
                    <input type="password" id="unlock-code-input" maxlength="4" placeholder="••••" class="flex-grow p-2 rounded bg-primary border border-gray-700 text-gray-200 focus:ring-accent focus:border-accent text-center font-mono tracking-widest" inputmode="numeric">
                    <button id="unlock-btn" class="p-2 rounded bg-red-700 text-white font-semibold hover:bg-red-600 transition-colors whitespace-nowrap lowercase">unlock</button>
                </div>
            </div>
        `;
    }

    function getPanelContent() {
        return `
            <h3 class="text-xl font-semibold mb-3">admin panel <i class="fas fa-unlock ml-1 text-green-500"></i></h3>
            <p class="lowercase text-gray-400 mb-6">control announcements and notification settings.</p>
            
            <!-- Set Announcement -->
            <div class="bg-primary p-4 rounded-lg mb-6 border border-gray-700">
                <h4 class="text-lg font-bold mb-2 lowercase text-accent flex items-center"><i class="fas fa-bullhorn mr-2"></i> set announcement</h4>
                <p class="text-xs text-gray-500 mb-2">current: <strong class="text-gray-300 italic">${currentAnnouncement || 'No announcement set.'}</strong></p>
                <div class="flex space-x-2">
                    <input type="text" id="new-anc-input" placeholder="${currentAnnouncement || 'enter new announcement text'}" class="flex-grow p-2 rounded bg-gray-800 border border-gray-700 text-gray-200 focus:ring-accent focus:border-accent lowercase">
                    <button id="set-anc-btn" class="p-2 rounded bg-green-700 text-white font-semibold hover:bg-green-600 transition-colors whitespace-nowrap lowercase">set announcement</button>
                </div>
            </div>

            <!-- Notification Toggle -->
            <div class="bg-primary p-4 rounded-lg border border-gray-700">
                <h4 class="text-lg font-bold mb-2 lowercase text-accent flex items-center"><i class="fas fa-bell mr-2"></i> notification settings</h4>
                <label class="inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="anc-notif-checkbox" class="form-checkbox h-5 w-5 text-accent rounded transition duration-150 ease-in-out bg-gray-700 border-gray-600" ${settings.showAncNotifications ? 'checked' : ''}>
                    <span class="ml-3 text-gray-300 lowercase">show new announcement notifications</span>
                </label>
            </div>
        `;
    }

    // --- Panel UI Update and Handlers ---
    function updatePanelUI() {
        const lockedItem = document.querySelector('[data-content-id="locked"]');
        const lockedPanel = document.getElementById('locked-content');
        
        if (!lockedItem || !lockedPanel) return;

        lockedItem.querySelector('span').textContent = settings.isPanelUnlocked ? 'panel' : 'locked';
        lockedItem.querySelector('i').className = settings.isPanelUnlocked ? 'fas fa-unlock-alt sidebar-item-icon mr-3' : 'fas fa-lock sidebar-item-icon mr-3';

        if (settings.isPanelUnlocked) {
            lockedPanel.innerHTML = getPanelContent();
            
            // Attach Set Announcement Handler
            document.getElementById('set-anc-btn')?.addEventListener('click', () => {
                const newAncInput = document.getElementById('new-anc-input');
                setAnnouncement(newAncInput.value.trim());
                newAncInput.value = ''; 
            });
            
            // Attach Notification Checkbox Handler
            const notifCheckbox = document.getElementById('anc-notif-checkbox');
            if (notifCheckbox) {
                notifCheckbox.checked = settings.showAncNotifications;
                notifCheckbox.addEventListener('change', (e) => {
                    settings.showAncNotifications = e.target.checked;
                    saveSettings();
                    showNotification(`announcement notifications ${e.target.checked ? 'enabled' : 'disabled'}.`);
                });
            }

        } else {
            lockedPanel.innerHTML = getLockedContent();
            
            // Attach Unlock Button Handler
            document.getElementById('unlock-btn')?.addEventListener('click', () => {
                const unlockCodeInput = document.getElementById('unlock-code-input');
                if (unlockCodeInput.value === UNLOCK_CODE) {
                    settings.isPanelUnlocked = true;
                    saveSettings();
                    showNotification('panel unlocked! settings will persist for this site.', 4000);
                    updatePanelUI(); // Re-render the panel now that it's unlocked
                } else {
                    showNotification('incorrect code. try again.', 3000);
                    unlockCodeInput.value = '';
                }
            });
        }
    }


    // --- Dependency and Style Injection (Modified for new look) ---
    function injectDependencies() {
        // 1. Inject Tailwind CSS
        if (!document.querySelector('script[src*="cdn.tailwindcss.com"]')) {
            const twScript = document.createElement('script');
            twScript.src = 'https://cdn.tailwindcss.com';
            document.head.appendChild(twScript);
        }

        // 2. Inject Font Awesome CSS
        if (!document.querySelector('link[href*="font-awesome"]')) {
            const faLink = document.createElement('link');
            faLink.rel = 'stylesheet';
            faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css';
            document.head.appendChild(faLink);
        }

        // 3. Inject Custom Styles
        if (!document.getElementById('chatium-custom-style')) {
            const style = document.createElement('style');
            style.id = 'chatium-custom-style';
            style.textContent = `
                .bg-primary{background-color:#20201d}.text-accent{color:#7d7a68}.bg-accent{background-color:#7d7a68}
                .btn-accent-hover:hover{background-color:#7d7a68;color:white}
                .btn-minimize-hover:hover{background-color:#fbbf24;color:#111827}
                .bookmarklet-popup-container{position:fixed;z-index:99999;min-width:350px;min-height:250px;overflow:hidden;box-shadow:0 10px 20px rgba(0,0,0,.5);display:flex;flex-direction:column;background-color:#1a1a18;border:1px solid #333;border-radius:8px;color:#e5e7eb}
                .bookmarklet-popup-container.dark{background-color:#1a1a18}
                .bookmarklet-popup-container.fullscreen{top:0!important;left:0!important;width:100%!important;height:100%!important;transform:none!important;border-radius:0!important;box-shadow:none!important}
                .drag-handle{cursor:grab;user-select:none}.drag-handle:active{cursor:grabbing}
                .resizer{position:absolute;width:12px;height:12px;background:transparent;z-index:100000}
                .resizer.top-left{top:-6px;left:-6px;cursor:nwse-resize}.resizer.top-right{top:-6px;right:-6px;cursor:nesw-resize}
                .resizer.bottom-left{bottom:-6px;left:-6px;cursor:nesw-resize}.resizer.bottom-right{bottom:-6px;right:-6px;cursor:nwse-resize}
                .resizer.top{top:-6px;left:6px;right:6px;height:12px;cursor:ns-resize}
                .resizer.bottom{bottom:-6px;left:6px;right:6px;height:12px;cursor:ns-resize}
                .resizer.left{left:-6px;top:6px;bottom:6px;width:12px;cursor:ew-resize}
                .resizer.right{right:-6px;top:6px;bottom:6px;width:12px;cursor:ew-resize}
                .sidebar-overlay{transform:translateX(100%);transition:transform .2s ease-in-out;z-index:10}.sidebar-overlay.open{transform:translateX(0)}
                .sidebar-menu-fixed-width{width:208px;min-width:208px;max-width:208px}
                .sidebar-item{display:flex;align-items:center;padding:10px 15px;color:#b0b0b0;cursor:pointer;transition:background-color .15s,color .15s;border-radius:6px;margin:0 0 5px 0;background-color:#2b2b28}
                .sidebar-item:hover{background-color:#7d7a68;color:white}
                .sidebar-item.active{background-color:#7d7a68;color:white;font-weight:600;box-shadow:0 1px 5px rgba(125,122,104,.5)}
                .bookmarklet-iframe{width:100%;height:100%;border:none}
                .notification-bar{position:fixed;bottom:20px;right:20px;z-index:100000;background-color:#333;color:#eee;padding:12px 16px;border-radius:8px;box-shadow:0 5px 15px rgba(0,0,0,.4);overflow:hidden;width:auto;max-width:90vw}
                .timer-bar{position:absolute;top:0;left:0;height:3px;width:100%;background-color:#7d7a68;animation:shrink-bar 3s linear forwards}
                @keyframes shrink-bar{from{width:100%}to{width:0%}}
            `;
            document.head.appendChild(style);
        }
    }

    // --- Main App Logic (startBookmarkletApp) ---
    function startBookmarkletApp() {
        injectDependencies();
        loadSettings();
        container = document.getElementById(APP_ID);

        if (container) {
            toggleAppVisibility();
            return;
        }

        container = document.createElement('div');
        container.id = APP_ID;
        container.className = `bookmarklet-popup-container shadow-2xl flex flex-col dark`; 
        document.body.appendChild(container);

        function centerPopup() {
            container.style.width = `${settings.width}vw`;
            container.style.height = `${settings.height}vh`;
            const rect = container.getBoundingClientRect();
            container.style.left = `${(window.innerWidth / 2) - (rect.width / 2)}px`;
            container.style.top = `${(window.innerHeight / 2) - (rect.height / 2)}px`;
            container.style.transform = `none`;
        }
        centerPopup();

        // --- Window Controls and HTML Structure ---
        container.innerHTML = `
            <!-- Resize Handles -->
            <div class="resizer top-left"></div><div class="resizer top-right"></div><div class="resizer bottom-left"></div><div class="resizer bottom-right"></div>
            <div class="resizer top"></div><div class="resizer bottom"></div><div class="resizer left"></div><div class="resizer right"></div>

            <!-- Header Bar -->
            <div id="${APP_ID}-header" class="drag-handle flex items-center justify-between p-2 border-b border-gray-700 bg-primary">
                <div class="flex items-center flex-grow">
                    <img src="${LOGO_URL}" alt="Chatium Logo" class="h-6 w-6 ml-2 mr-3 rounded-full border border-gray-600">
                    <span class="font-semibold text-lg text-gray-100 lowercase">${APP_NAME}</span>
                </div>
                <div class="flex space-x-1">
                    <button id="${APP_ID}-hamburger" class="p-2 rounded btn-accent-hover text-gray-400 transition-colors" title="menu"><i class="fas fa-bars h-5 w-5"></i></button>
                    <button id="${APP_ID}-minimize" class="p-2 rounded btn-minimize-hover text-gray-400 transition-colors" title="hide"><i class="fas fa-minus h-5 w-5"></i></button>
                    <button id="${APP_ID}-fullscreen" class="p-2 rounded btn-accent-hover text-gray-400 transition-colors" title="expand"><i class="far fa-square h-5 w-5"></i></button>
                    <button id="${APP_ID}-close" class="p-2 rounded hover:bg-red-700 text-gray-400 hover:text-white transition-colors" title="close permanently"><i class="fas fa-times h-5 w-5"></i></button>
                </div>
            </div>

            <!-- Main Content Area -->
            <div class="flex flex-grow overflow-hidden relative">
                
                <!-- Iframe (Chat) -->
                <iframe id="${APP_ID}-iframe" class="bookmarklet-iframe" src="https://hack.chat/?${settings.roomCode}" sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals"></iframe>
                
                <!-- Sidebar/Content Overlay - Slides over the Iframe -->
                <div id="${APP_ID}-overlay" class="absolute inset-0 flex sidebar-overlay bg-primary">
                    
                    <!-- Sidebar Menu (Fixed Width) -->
                    <div id="${APP_ID}-sidebar-menu" class="sidebar-menu-fixed-width h-full p-3 bg-primary border-r border-gray-700 flex flex-col">
                        <div class="flex items-center justify-between mb-5 border-b border-gray-700 pb-2">
                            <button id="${APP_ID}-back-to-chat" class="p-2 rounded btn-accent-hover text-gray-400 transition-colors" title="back to chat"><i class="fas fa-arrow-left h-5 w-5"></i></button>
                            <h2 class="text-lg font-semibold text-gray-100 lowercase">navigation</h2>
                        </div>
                        <div class="flex-grow space-y-1 overflow-y-auto pr-1" id="menu-items-container"></div>
                        <div class="mt-auto pt-4 border-t border-gray-700">
                            <div class="flex space-x-2">
                                <button id="reload-iframe-btn" class="w-1/2 p-2 rounded text-xs font-semibold bg-accent text-white hover:opacity-80 transition-opacity lowercase" title="Reloads the embedded chat">reload chat</button>
                                <button id="reload-full-btn" class="w-1/2 p-2 rounded text-xs font-semibold bg-accent text-white hover:opacity-80 transition-opacity lowercase" title="Reloads the entire bookmarklet app">full restart</button>
                            </div>
                        </div>
                    </div>

                    <!-- Content Panels -->
                    <div id="${APP_ID}-content-panels" class="flex-grow overflow-auto p-0 bg-[#1a1a18]">
                        
                        <!-- 1. SETTINGS CONTENT -->
                        <div id="settings-content" class="content-panel h-full p-6 text-gray-200 bg-[#1a1a18]">
                            <h3 class="text-xl font-semibold mb-3">settings</h3>
                            <p class="lowercase text-gray-400 mb-6">adjust your preferences here. save to persist changes.</p>
                            
                            <!-- Announcements -->
                            <div class="bg-primary p-4 rounded-lg mb-6 border border-gray-700">
                                <h4 class="text-lg font-bold mb-2 text-accent lowercase flex items-center"><i class="fas fa-bullhorn mr-2"></i> announcements (live)</h4>
                                <div id="announcement-display" class="text-gray-300"><p class="text-xs text-gray-500">loading announcements...</p></div>
                            </div>

                            <!-- Room Code Setting -->
                            <div class="mb-6">
                                <h4 class="text-lg font-semibold mb-2 lowercase">chat room code</h4>
                                <div class="flex space-x-2">
                                    <input type="text" id="room-code-input" placeholder="e.g., rpschat" class="flex-grow p-2 rounded bg-primary border border-gray-700 text-gray-200 focus:ring-accent focus:border-accent lowercase">
                                    <button id="set-room-code-btn" class="p-2 rounded bg-accent text-white font-semibold hover:opacity-80 transition-opacity whitespace-nowrap lowercase">set</button>
                                </div>
                                <p class="text-xs text-gray-500 mt-1">sets the chat URL: hack.chat/?<span id="current-room-code">${settings.roomCode}</span></p>
                            </div>

                            <!-- Keybind Changer -->
                            <div class="mb-6">
                                <h4 class="text-lg font-semibold mb-2 lowercase">toggle keybind</h4>
                                <div class="flex space-x-2">
                                    <input type="text" id="keybind-input" readonly placeholder="click to record" class="flex-grow p-2 rounded bg-primary border border-gray-700 text-gray-200 focus:ring-accent focus:border-accent lowercase cursor-pointer" value="${settings.keybind}">
                                    <button id="set-keybind-btn" disabled class="p-2 rounded bg-accent text-white font-semibold hover:opacity-80 transition-opacity whitespace-nowrap lowercase">save</button>
                                </div>
                                <p class="text-xs text-gray-500 mt-1">click the box above and press the key combination you want to use.</p>
                            </div>

                            <!-- Window Size Sliders -->
                            <div class="mb-6">
                                <h4 class="text-lg font-semibold mb-2 lowercase">window size</h4>
                                <label for="width-slider" class="block text-sm text-gray-400 mb-1 lowercase">width: <span id="width-value">${settings.width}</span>vw</label>
                                <input type="range" id="width-slider" min="20" max="80" step="1" value="${settings.width}" class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-accent">

                                <label for="height-slider" class="block text-sm text-gray-400 mt-3 mb-1 lowercase">height: <span id="height-value">${settings.height}</span>vh</label>
                                <input type="range" id="height-slider" min="30" max="95" step="1" value="${settings.height}" class="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-accent">
                            </div>

                        </div>
                        
                        <!-- 2. HELP CONTENT -->
                        <div id="help-content" class="content-panel h-full hidden p-6 text-gray-200 bg-[#1a1a18]">
                            <h3 class="text-xl font-semibold mb-3">help center</h3>
                            <div class="space-y-6">
                                <div class="bg-primary p-4 rounded-lg border border-gray-700">
                                    <h4 class="text-lg font-bold mb-2 lowercase text-accent flex items-center"><i class="fas fa-shield-alt mr-2"></i> rate limits & blocking</h4>
                                    <p class="text-sm text-gray-300 lowercase">in the chat, getting blocked or rate limited isn't the host's fault; the service automatically does it to block spamming and people rapidly rejoining. this can be frustrating but there's no way around it.</p>
                                </div>
                                <div class="bg-primary p-4 rounded-lg border border-gray-700">
                                    <h4 class="text-lg font-bold mb-2 lowercase text-accent flex items-center"><i class="fas fa-exclamation-circle mr-2"></i> embedded mode</h4>
                                    <p class="text-sm text-gray-300 lowercase mb-3">the chat is embedded into this popup using some **hacky and complex code**. if you'd like to see it, just not inside of the popup, please go to:</p>
                                    <a id="external-chat-link" href="https://hack.chat/?${settings.roomCode}" target="_blank" class="text-sm text-yellow-500 hover:text-yellow-400 font-mono transition-colors lowercase underline">hack.chat/?<span id="help-room-code">${settings.roomCode}</span></a>
                                </div>
                                <div class="bg-primary p-4 rounded-lg border border-gray-700">
                                    <h4 class="text-lg font-bold mb-2 lowercase text-accent flex items-center"><i class="fas fa-globe mr-2"></i> settings persistence</h4>
                                    <p class="text-sm text-gray-300 lowercase">the settings you apply will not reflect on other sites, only the site you first applied them. we may work on an account system that fixes this.</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 3. ERROR LOG CONTENT -->
                        <div id="errors-content" class="content-panel h-full hidden p-6 text-gray-200 bg-[#1a1a18]">
                            <h3 class="text-xl font-semibold mb-3 text-white">error log <i class="fas fa-exclamation-triangle text-gray-400"></i></h3>
                            <p class="lowercase text-gray-400 mb-6">this page will have any errors you run into with the code that makes this work. if there's any you can't resolve, contact the developer.</p>
                            <div class="bg-primary/50 p-4 rounded-lg border border-gray-700 text-sm text-gray-300 font-mono overflow-auto max-h-96">
                                <p class="text-gray-400 italic">No recorded launch errors.</p>
                            </div>
                        </div>
                        
                        <!-- 4. ABOUT CONTENT -->
                        <div id="about-content" class="content-panel h-full hidden p-6 text-gray-200 bg-[#1a1a18] text-center">
                            <div class="flex flex-col items-center">
                                <img src="${LOGO_URL}" alt="Chatium Logo" class="h-16 w-16 mb-4 rounded-full border border-gray-600">
                                <h3 class="text-4xl font-extrabold mb-1">CHATIUM</h3>
                                <p class="text-lg font-mono text-gray-400 mb-6 lowercase">hack.chat wrapper</p>
                                <ul class="text-left space-y-2 mb-8 text-gray-300 w-full max-w-xs">
                                    <li class="lowercase"><i class="fas fa-code mr-2 text-accent"></i> Version: 0.6.0</li>
                                    <li class="lowercase"><i class="fas fa-user-tie mr-2 text-accent"></i> Developer: vihar</li>
                                    <li class="lowercase"><i class="fas fa-hands-helping mr-2 text-accent"></i> Helper: eugene</li>
                                    <li class="lowercase"><i class="fas fa-laptop-code mr-2 text-accent"></i> Language: javascript</li>
                                </ul>
                                <div class="w-full max-w-xs border-t border-gray-700 pt-4 mb-4">
                                    <p class="text-gray-400 italic mb-3">try some of our other projects!</p>
                                    <div class="space-y-3">
                                        <div class="text-sm text-gray-500 font-semibold lowercase text-left">
                                            <i class="fas fa-exclamation-circle mr-2 text-red-500"></i> quick client <span class="text-xs text-red-500">(deprecated)</span>
                                            <span class="block text-xs text-gray-500 ml-6">open your sites with speed and precision</span>
                                        </div>
                                        <div class="text-sm text-gray-500 font-semibold lowercase text-left">
                                            <i class="fas fa-shield-alt mr-2 text-green-500"></i> quickai <span class="text-xs text-gray-500">(ask vihar)</span>
                                            <span class="block text-xs text-gray-500 ml-6">undetectable ai assistant in your browser</span>
                                        </div>
                                    </div>
                                </div>
                                <p class="mt-8 text-sm text-gray-500">made with <i class="fas fa-heart text-red-500"></i> by vihar</p>
                            </div>
                        </div>

                        <!-- 5. LOCKED/PANEL CONTENT -->
                        <div id="locked-content" class="content-panel h-full hidden p-6 text-gray-200 bg-[#1a1a18]">
                            <!-- Content generated by updatePanelUI() -->
                        </div>
                    </div>
                </div>
            </div>
        `;

        // --- Element References ---
        const header = document.getElementById(`${APP_ID}-header`);
        const closeButton = document.getElementById(`${APP_ID}-close`);
        const minimizeButton = document.getElementById(`${APP_ID}-minimize`);
        const fullscreenButton = document.getElementById(`${APP_ID}-fullscreen`);
        const hamburgerButton = document.getElementById(`${APP_ID}-hamburger`);
        const backToChatButton = document.getElementById(`${APP_ID}-back-to-chat`);
        const overlay = document.getElementById(`${APP_ID}-overlay`);
        const menuContainer = document.getElementById('menu-items-container');
        const contentPanels = container.querySelectorAll('.content-panel');
        const iframe = document.getElementById(`${APP_ID}-iframe`); 
        
        // --- Settings References ---
        const roomCodeInput = document.getElementById('room-code-input');
        const setRoomCodeBtn = document.getElementById('set-room-code-btn');
        const currentRoomCodeDisplay = document.getElementById('current-room-code');
        const helpRoomCodeDisplay = document.getElementById('help-room-code');
        const keybindInput = document.getElementById('keybind-input');
        const setKeybindBtn = document.getElementById('set-keybind-btn');
        const widthSlider = document.getElementById('width-slider');
        const heightSlider = document.getElementById('height-slider');
        const widthValue = document.getElementById('width-value');
        const heightValue = document.getElementById('height-value');

        // --- Dynamic Menu Generation ---
        const menuItems = [
            { id: 'settings', icon: 'fas fa-cog', label: 'settings' },
            { id: 'help', icon: 'fas fa-question-circle', label: 'help' },
            { id: 'errors', icon: 'fas fa-exclamation-triangle', label: 'errors' },
            { id: 'about', icon: 'fas fa-info-circle', label: 'about' },
            { id: 'locked', icon: settings.isPanelUnlocked ? 'fas fa-unlock-alt' : 'fas fa-lock', label: settings.isPanelUnlocked ? 'panel' : 'locked' },
        ];


        menuItems.forEach(item => {
            const itemHtml = document.createElement('div');
            itemHtml.className = `sidebar-item ${item.id === 'settings' ? 'active' : ''}`;
            itemHtml.setAttribute('data-content-id', item.id);
            itemHtml.innerHTML = `<i class="${item.icon} sidebar-item-icon mr-3"></i><span>${item.label}</span>`;
            if(menuContainer) menuContainer.appendChild(itemHtml);
        });
        
        const sidebarItems = container.querySelectorAll('.sidebar-item');
        const reloadIframeBtn = document.getElementById('reload-iframe-btn');
        const reloadFullBtn = document.getElementById('reload-full-btn');
        
        // --- Core Event Handlers ---

        closeButton.addEventListener('click', () => { container.remove(); clearInterval(announcementInterval); });
        minimizeButton.addEventListener('click', toggleAppVisibility);

        // Fullscreen Toggle
        fullscreenButton.addEventListener('click', () => {
            if (!isFullscreen) {
                previousWidth = container.style.width;
                previousHeight = container.style.height;
                previousX = container.style.left;
                previousY = container.style.top;
                container.classList.add('fullscreen');
            } else {
                container.classList.remove('fullscreen');
                container.style.width = previousWidth;
                container.style.height = previousHeight;
                container.style.left = previousX;
                container.style.top = previousY;
            }
            isFullscreen = !isFullscreen;
        });

        function openOverlay(defaultContentId) {
            if(overlay) overlay.classList.add('open');
            
            sidebarItems.forEach(si => si.classList.remove('active'));
            contentPanels.forEach(cp => cp.classList.add('hidden'));

            const defaultItem = container.querySelector(`[data-content-id="${defaultContentId}"]`);
            const defaultPanel = document.getElementById(`${defaultContentId}-content`);

            if (defaultItem) defaultItem.classList.add('active');
            if (defaultPanel) defaultPanel.classList.remove('hidden');

            if (defaultContentId === 'settings') {
                if(roomCodeInput) roomCodeInput.value = settings.roomCode;
                if(keybindInput) keybindInput.value = settings.keybind;
                if(widthSlider) widthSlider.value = settings.width;
                if(heightSlider) heightSlider.value = settings.height;
                if(widthValue) widthValue.textContent = settings.width;
                if(heightValue) heightValue.textContent = settings.height;
            }
            
            // Re-run panel UI setup if locked is selected, to ensure fresh handlers
            if (defaultContentId === 'locked') {
                updatePanelUI();
            }
        }

        hamburgerButton.addEventListener('click', () => {
            if (overlay.classList.contains('open')) {
                overlay.classList.remove('open');
            } else {
                openOverlay('settings');
            }
        });
        
        backToChatButton.addEventListener('click', () => {
            overlay.classList.remove('open');
        });
        
        reloadIframeBtn.addEventListener('click', () => {
            if(iframe) iframe.src = iframe.src;
            overlay.classList.remove('open');
            showNotification('chat room reloaded.');
        });

        reloadFullBtn.addEventListener('click', () => {
            container.remove();
            clearInterval(announcementInterval);
            container = null;
            startBookmarkletApp();
            showNotification('full app restart complete.');
        });

        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                const contentId = item.dataset.contentId;
                sidebarItems.forEach(si => si.classList.remove('active'));
                item.classList.add('active');
                contentPanels.forEach(cp => cp.classList.add('hidden'));
                document.getElementById(`${contentId}-content`).classList.remove('hidden');

                if (contentId === 'locked') {
                    updatePanelUI(); // Call updatePanelUI to ensure correct content and handlers are set
                }
            });
        });

        // --- SETTINGS HANDLERS ---
        if(setRoomCodeBtn) setRoomCodeBtn.addEventListener('click', () => {
            const newCode = roomCodeInput.value.trim().toLowerCase() || DEFAULT_SETTINGS.roomCode;
            settings.roomCode = newCode;
            if(iframe) iframe.src = `https://hack.chat/?${newCode}`;
            if(currentRoomCodeDisplay) currentRoomCodeDisplay.textContent = newCode;
            if(helpRoomCodeDisplay) helpRoomCodeDisplay.textContent = newCode;
            document.getElementById('external-chat-link').href = `https://hack.chat/?${newCode}`;
            saveSettings();
            showNotification('room code updated. chat reloaded.');
        });

        if(keybindInput) addMultipleListeners(keybindInput, ['click', 'focus'], (e) => { e.preventDefault(); startKeybindRecording(); });

        if(setKeybindBtn) setKeybindBtn.addEventListener('click', () => {
            if (recordedKeybind && !isRecordingKeybind) {
                settings.keybind = recordedKeybind;
                saveSettings();
                showNotification(`keybind set to: <strong>${settings.keybind.toLowerCase()}</strong>`);
            } else {
                showNotification('please press a key combination first.', 3000);
            }
        });

        if(widthSlider) widthSlider.addEventListener('input', (e) => {
            const newWidth = parseInt(e.target.value);
            settings.width = newWidth;
            container.style.width = `${newWidth}vw`;
            widthValue.textContent = newWidth;
        });
        if(widthSlider) widthSlider.addEventListener('change', saveSettings);

        if(heightSlider) heightSlider.addEventListener('input', (e) => {
            const newHeight = parseInt(e.target.value);
            settings.height = newHeight;
            container.style.height = `${newHeight}vh`;
            heightValue.textContent = newHeight;
        });
        if(heightSlider) heightSlider.addEventListener('change', saveSettings);

        // --- Drag and Resize Setup ---
        addMultipleListeners(header, ['mousedown'], dragStart);
        container.querySelectorAll('.resizer').forEach(resizer => { resizer.addEventListener('mousedown', resizeStart); });
        
        // --- Initialization Calls ---
        updatePanelUI(); // Initialize the locked/panel content
        startAnnouncementPolling(); // Start the Lanyard polling
    }

    // --- Global Keybind Listener ---
    document.removeEventListener('keydown', handleKeybind); 
    document.addEventListener('keydown', handleKeybind);
    
    // --- Initial Execution ---
    startBookmarkletApp();
})();
