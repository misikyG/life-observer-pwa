// --- IndexedDB 資料庫小幫手 (DBHelper) ---
const DBHelper = {
    db: null,
    dbName: 'LifeObserverDB',
    dbVersion: 1,

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error('資料庫開啟失敗:', event.target.error);
                reject('資料庫開啟失敗');
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('資料庫成功開啟');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                console.log('資料庫升級中...');
                this.db = event.target.result;
                if (!this.db.objectStoreNames.contains('moods')) {
                    this.db.createObjectStore('moods', { keyPath: 'id' });
                }
                if (!this.db.objectStoreNames.contains('habits')) {
                    this.db.createObjectStore('habits', { keyPath: 'id' });
                }
                if (!this.db.objectStoreNames.contains('tasks')) {
                    this.db.createObjectStore('tasks', { keyPath: 'id' });
                }
                if (!this.db.objectStoreNames.contains('chatHistory')) {
                    this.db.createObjectStore('chatHistory', { autoIncrement: true });
                }
                if (!this.db.objectStoreNames.contains('appState')) {
                    this.db.createObjectStore('appState', { keyPath: 'key' });
                }
                if (!this.db.objectStoreNames.contains('punchRecords')) {
                    this.db.createObjectStore('punchRecords', { autoIncrement: true });
                }
                if (!this.db.objectStoreNames.contains('workTimeRecords')) {
                    this.db.createObjectStore('workTimeRecords', { autoIncrement: true });
                }
            };
        });
    },

    put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(`儲存到 ${storeName} 失敗: ${event.target.error}`);
        });
    },

    get(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(`從 ${storeName} 讀取失敗: ${event.target.error}`);
        });
    },

    getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(`從 ${storeName} 讀取全部資料失敗: ${event.target.error}`);
        });
    },

    delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(`從 ${storeName} 刪除失敗: ${event.target.error}`);
        });
    },

    clear(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(`清空 ${storeName} 失敗: ${event.target.error}`);
        });
    },

    async saveAll(storeName, dataArray) {
        await this.clear(storeName);
        const putPromises = dataArray.map(item => this.put(storeName, item));
        return Promise.all(putPromises);
    }
};

// --- 全域 UI 控制 ---
let currentReviewDate = new Date();
let selectedDateForReview = null;
let moodChartInstance = null;
let timeUpdateInterval = null;

function togglePinnedNoteView(id) {
    const noteElement = document.getElementById(`pinned-note-${id}`);
    const previewElement = noteElement.querySelector('.pinned-note-preview');
    const fullElement = noteElement.querySelector('.pinned-note-full');

    noteElement.classList.toggle('expanded');

    if (noteElement.classList.contains('expanded')) {
        previewElement.style.display = 'none';
        fullElement.style.display = 'block';
    } else {
        previewElement.style.display = 'block';
        fullElement.style.display = 'none';
    }
}


function showSection(sectionId) {
    DBHelper.put('appState', { key: 'lastActiveSection', value: sectionId });
    document.querySelectorAll('.content-section').forEach(section => section.classList.add('hidden'));
    const sectionElement = document.getElementById(sectionId + '-section');
    if (sectionElement) sectionElement.classList.remove('hidden');

    let activeLinkText = '';
    document.querySelectorAll('.sidebar-menu a').forEach(link => {
        const isTargetLink = link.getAttribute('onclick').includes(`'${sectionId}'`);
        link.classList.toggle('active', isTargetLink);
        if (isTargetLink) activeLinkText = link.textContent.trim();
    });

    document.getElementById('app-title').textContent = activeLinkText;

    clearInterval(timeUpdateInterval);
    const dateDisplay = document.getElementById('current-date');

    if (sectionId === 'attendance-tracker') {
        if (!AttendanceTracker.isInitialized) AttendanceTracker.init();
        dateDisplay.style.fontSize = '1.2rem';
        AttendanceTracker.updateCurrentTime();
        timeUpdateInterval = setInterval(() => AttendanceTracker.updateCurrentTime(), 1000);
    } else {
        dateDisplay.style.fontSize = '1rem';
        updateCurrentDate();
        timeUpdateInterval = setInterval(updateCurrentDate, 60000);
    }

    if (sectionId === 'time-quadrant') {
        if (!TimeQuadrantTracker.isInitialized) TimeQuadrantTracker.init();
        TimeQuadrantTracker.render();
    }

    if (sectionId === 'habit-tracker') {
        HabitTracker.renderHabits();
        HabitTracker.renderReportChart();
    }

    if (sectionId === 'image-memory') {
        ImageMemory.render();
    }

    if (sectionId === 'review-stats') {
        const now = new Date();
        document.getElementById('review-month').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        currentReviewDate = now;
        MoodTracker.renderCalendar();
        MoodTracker.renderMoodChart();

        const getLocalDateStringForTaiwan = (date) => {
            const options = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
            const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
            const y = parts.find(p => p.type === 'year').value;
            const m = parts.find(p => p.type === 'month').value;
            const d = parts.find(p => p.type === 'day').value;
            return `${y}-${m}-${d}`;
        };

        const todayStr = getLocalDateStringForTaiwan(now);

        MoodTracker.loadReviewData(todayStr);

        setTimeout(() => {
            const todayEl = document.querySelector(`.calendar-day[data-date="${todayStr}"]`);
            if (todayEl) {
                document.querySelectorAll('.calendar-day.selected').forEach(d => d.classList.remove('selected'));
                todayEl.classList.add('selected');
            }
        }, 100);
    }
    if (sectionId === 'data-settings') {
        MoodTracker.renderCustomTagsList();
    }
}

function updateCurrentDate() {
    const now = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    document.getElementById('current-date').textContent = now.toLocaleDateString('zh-TW', options);
}
const InputSaver = {
    targetIds: [
        'general-mood-content',
        'custom-tag-input',
        'new-habit-input',
        'ai-prompt',
        'ai-chat-input'
    ],

    async init() {
        for (const id of this.targetIds) {
            const element = document.getElementById(id);
            if (element) {
                const savedItem = await DBHelper.get('appState', `input_${id}`);
                if (savedItem) {
                    element.value = savedItem.value;
                }
                element.addEventListener('input', (event) => {
                    DBHelper.put('appState', { key: `input_${id}`, value: event.target.value });
                });
            }
        }
    },
    clear(id) {
        DBHelper.delete('appState', `input_${id}`);
    }
};

function autoResizeTextarea(element) {
    element.style.height = 'auto';
    element.style.height = (element.scrollHeight) + 'px';
}

// --- 打卡追蹤模組 ---
const AttendanceTracker = {
    PUNCH_TYPES: {
        WORK_IN: 'work-in',
        WORK_OUT: 'work-out',
        BREAK_START: 'break-start',
        BREAK_END: 'break-end'
    },

    updateCurrentTime() {
        const now = new Date();
        const dateDisplay = document.getElementById('current-date');
        if (dateDisplay) {
            dateDisplay.textContent = this.formatDateTime(now);
        }
    },

    isInitialized: false,
    currentStatus: 'idle',
    workStartTime: null,
    breakStartTime: null,
    weekChart: null,
    monthChart: null,
    reminderTimeout: null,
    breakReminderTimeout: null,
    notificationPermission: 'default',
    appNotificationsEnabled: true,

    async init() {
        await this.loadSettings();
        await this.loadData();
        this.updateStatus();
        await this.updateCharts();
        await this.updateRecords();
        this.checkNotificationPermission();
        this.restoreReminders();
        setInterval(() => this.checkReminders(), 60000);
        this.isInitialized = true;
    },

    checkNotificationPermission() {
        const permissionDiv = document.getElementById('notificationPermission');
        if (!permissionDiv) return;

        permissionDiv.classList.remove('permission-granted', 'permission-denied');

        if ('Notification' in window) {
            this.notificationPermission = Notification.permission;
            if (this.notificationPermission === 'granted') {
                if (this.appNotificationsEnabled) {
                    permissionDiv.innerHTML = '<span>✅ 桌面通知已啟用</span><button onclick="AttendanceTracker.toggleAppNotifications(false)" style="margin-left: 10px; cursor: pointer;">關閉通知</button>';
                    permissionDiv.classList.add('permission-granted');
                } else {
                    permissionDiv.innerHTML = '<span>🔕 桌面通知已由您手動關閉</span><button onclick="AttendanceTracker.toggleAppNotifications(true)" style="margin-left: 10px; cursor: pointer;">重新啟用</button>';
                }
            } else if (this.notificationPermission === 'denied') {
                permissionDiv.innerHTML = '<span>❌ 桌面通知已被拒絕，請在瀏覽器設定中手動啟用</span>';
                permissionDiv.classList.add('permission-denied');
            } else { // default
                permissionDiv.innerHTML = '<span>🔔 啟用桌面通知以接收下工和休息提醒</span><button onclick="AttendanceTracker.requestNotificationPermission()">啟用通知</button>';
            }
        } else {
            permissionDiv.innerHTML = '<span>❌ 你的瀏覽器不支援桌面通知功能</span>';
        }
    },

    async toggleAppNotifications(enable) {
        this.appNotificationsEnabled = enable;
        await this.saveSettings();
        this.checkNotificationPermission();
    },

    requestNotificationPermission() {
        Notification.requestPermission().then(async permission => {
            this.notificationPermission = permission;
            if (permission === 'granted') {
                this.appNotificationsEnabled = true;
                await this.saveSettings();
                this.showNotification('通知啟用成功', '你現在可以收到打卡提醒通知了！', 'success');
            }
            this.checkNotificationPermission();
        });
    },

    showNotification(title, body, type = 'info') {
        if (!this.appNotificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;

        new Notification(title, {
            body: body,
            icon: 'https://cdn.discordapp.com/attachments/1345376114272505918/1402580818563567626/ICON1.png?ex=68946ead&is=68931d2d&hm=51bc4c8f5df4bfa1d772dc2af2aa972cda9fd204c61665d1b20353c190f859d7&'
        });

        if (document.getElementById('enableSound')?.checked) {
            this.playNotificationSound();
        }
    },

    playNotificationSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (e) {
            console.warn("無法播放音效", e);
        }
    },

    async punchCard(type) {
        const now = new Date();

        try {
            await DBHelper.put('punchRecords', { type: type, timestamp: now.getTime(), dateTime: this.formatDateTime(now) });
        } catch (error) {
            console.error('打卡記錄儲存失敗:', error);
            alert('錯誤：無法儲存您的打卡記錄，請稍後再試。');
            return;
        }

        switch (type) {
            case this.PUNCH_TYPES.WORK_IN:
                this.currentStatus = 'working';
                this.workStartTime = now;
                this.setWorkEndReminder();
                this.showNotification('上工打卡成功', `開始時間：${this.formatDateTime(now)}`, 'success');
                break;
            case this.PUNCH_TYPES.WORK_OUT:
                if (this.currentStatus === 'working') {
                    const workDuration = await this.calculateWorkTime();
                    this.showNotification('下工打卡成功', `今日工作時長：${this.formatDuration(workDuration)}`, 'success');
                }
                this.currentStatus = 'idle';
                this.workStartTime = null;
                this.clearReminders();
                break;
            case this.PUNCH_TYPES.BREAK_START:
                this.currentStatus = 'break';
                this.breakStartTime = now;
                this.setBreakEndReminder();
                this.showNotification('中場休息', `開始時間：${this.formatDateTime(now)}`, 'info');
                break;
            case this.PUNCH_TYPES.BREAK_END:
                this.currentStatus = 'working';
                this.breakStartTime = null;
                clearTimeout(this.breakReminderTimeout);
                this.showNotification('結束休息', '繼續工作', 'info');
                break;
        }

        this.saveCurrentStatus();
        this.updateStatus();
        this.updateRecords();
        await this.updateCharts();
    },

    setWorkEndReminder() {
        clearTimeout(this.reminderTimeout);
        const workHours = parseInt(document.getElementById('workHours').value);
        this.reminderTimeout = setTimeout(() => {
            this.showNotification('⏰ 下工提醒', `你已經工作了 ${workHours} 小時，該下工了！`, 'reminder');
        }, workHours * 3600000);
    },

    setBreakEndReminder() {
        clearTimeout(this.breakReminderTimeout);
        const breakMinutes = parseInt(document.getElementById('breakMinutes').value);
        this.breakReminderTimeout = setTimeout(() => {
            this.showNotification('⏰ 休息結束提醒', `休息時間已結束（${breakMinutes}分鐘），該回到工作崗位了！`, 'reminder');
        }, breakMinutes * 60000);
    },

    clearReminders() {
        clearTimeout(this.reminderTimeout);
        clearTimeout(this.breakReminderTimeout);
    },

    restoreReminders() {
        if (this.currentStatus === 'working' && this.workStartTime) {
            const workHours = parseInt(document.getElementById('workHours').value) * 3600000;
            const elapsedTime = new Date().getTime() - this.workStartTime.getTime();
            const remainingTime = workHours - elapsedTime;

            if (remainingTime > 0) {
                console.log(`重新設定下工提醒，剩餘 ${remainingTime / 60000} 分鐘`);
                this.setWorkEndReminder();
            }
        }
        if (this.currentStatus === 'break' && this.breakStartTime) {
            const breakMinutes = parseInt(document.getElementById('breakMinutes').value) * 60000;
            const elapsedTime = new Date().getTime() - this.breakStartTime.getTime();
            const remainingTime = breakMinutes - elapsedTime;

            if (remainingTime > 0) {
                console.log(`重新設定休息結束提醒，剩餘 ${remainingTime / 60000} 分鐘`);
                this.setBreakEndReminder();
            }
        }
    },

    checkReminders() {
        this.updateStatus();
    },

    updateStatus() {
        const statusContent = document.getElementById('statusContent');
        if (!statusContent) return;

        const btns = {
            workIn: document.getElementById('workInBtn'),
            workOut: document.getElementById('workOutBtn'),
            breakStart: document.getElementById('breakStartBtn'),
            breakEnd: document.getElementById('breakEndBtn')
        };

        Object.values(btns).forEach(btn => { if (btn) btn.disabled = false; });

        switch (this.currentStatus) {
            case 'idle':
                statusContent.innerHTML = '🛌 目前狀態：待命中';
                if (btns.workOut) btns.workOut.disabled = true;
                if (btns.breakStart) btns.breakStart.disabled = true;
                if (btns.breakEnd) btns.breakEnd.disabled = true;
                break;
            case 'working':
                const workDuration = this.workStartTime ? this.formatDuration(new Date().getTime() - this.workStartTime.getTime()) : '0分鐘';
                statusContent.innerHTML = `💼 目前狀態：工作中<br>已工作時間：${workDuration}`;
                if (btns.workIn) btns.workIn.disabled = true;
                if (btns.breakEnd) btns.breakEnd.disabled = true;
                break;
            case 'break':
                const breakDuration = this.breakStartTime ? this.formatDuration(new Date().getTime() - this.breakStartTime.getTime()) : '0分鐘';
                statusContent.innerHTML = `☕ 目前狀態：休息中<br>已休息時間：${breakDuration}`;
                if (btns.workIn) btns.workIn.disabled = true;
                if (btns.workOut) btns.workOut.disabled = true;
                if (btns.breakStart) btns.breakStart.disabled = true;
                break;
        }
    },

    async updateRecords() {
        const recordsList = document.getElementById('recordsList');
        if (!recordsList) return;

        try {
            let allRecords = await this.getRecords();

            if (allRecords.length === 0) {
                recordsList.innerHTML = '<div class="record-item">暫無打卡記錄</div>';
                return;
            }

            allRecords.sort((a, b) => b.timestamp - a.timestamp);
            const recordsToDisplay = allRecords.slice(0, 16);

            const icons = {
                [this.PUNCH_TYPES.WORK_IN]: '🕛',
                [this.PUNCH_TYPES.WORK_OUT]: '🛌',
                [this.PUNCH_TYPES.BREAK_START]: '☕',
                [this.PUNCH_TYPES.BREAK_END]: '💼'
            };

            recordsList.innerHTML = recordsToDisplay.map(r =>
                `<div class="record-item">${icons[r.type] || '📝'} ${this.getActionName(r.type)} - ${r.dateTime}</div>`
            ).join('');

        } catch (error) {
            console.error("更新打卡紀錄失敗:", error);
            recordsList.innerHTML = '<div class="record-item" style="color: red;">讀取紀錄失敗</div>';
        }
    },

    async updateCharts() {
        await this.updateWeekChart().catch(err => console.error("更新週圖表失敗:", err));
        await this.updateMonthChart().catch(err => console.error("更新月圖表失敗:", err));
    },

    async updateWeekChart() {
        const ctx = document.getElementById('weekChart')?.getContext('2d');
        if (!ctx) return;

        const workTimeRecords = await DBHelper.getAll('workTimeRecords') || [];
        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - (now.getDay() || 7) + 1));
        startOfWeek.setHours(0, 0, 0, 0);

        const weekData = Array(7).fill(0);
        workTimeRecords.forEach(r => {
            const recordDate = new Date(r.date);
            if (recordDate >= startOfWeek) {
                const dayIndex = (recordDate.getDay() + 6) % 7;
                weekData[dayIndex] += r.duration / 3600000;
            }
        });

        if (this.weekChart) this.weekChart.destroy();

        this.weekChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['一', '二', '三', '四', '五', '六', '日'],
                datasets: [{
                    label: '工作時數',
                    data: weekData.map(h => h.toFixed(2)),
                    backgroundColor: 'rgba(99, 196, 77, 0.7)'
                }]
            },
            options: {
                scales: { y: { beginAtZero: true, title: { display: true, text: '小時' } } }
            }
        });
    },

    async updateMonthChart() {
        const ctx = document.getElementById('monthChart')?.getContext('2d');
        if (!ctx) return;

        const workTimeRecords = await DBHelper.getAll('workTimeRecords') || [];
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const dailyData = {};
        workTimeRecords.forEach(r => {
            const recordDate = new Date(r.date);
            if (recordDate >= startOfMonth) {
                const dateKey = recordDate.toISOString().split('T')[0];
                dailyData[dateKey] = (dailyData[dateKey] || 0) + r.duration / 3600000; // 小時
            }
        });

        const labels = Object.keys(dailyData).sort().map(d => `${new Date(d).getMonth() + 1}/${new Date(d).getDate()}`);
        const data = Object.values(dailyData).map(h => h.toFixed(2));

        if (this.monthChart) this.monthChart.destroy();

        this.monthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '工作時數',
                    data,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.7)',
                    tension: 0.1
                }]
            },
            options: {
                scales: { y: { beginAtZero: true, title: { display: true, text: '小時' } } }
            }
        });
    },

    async calculateWorkTime() {
        if (!this.workStartTime) return 0;
        const now = new Date();
        const workTime = now.getTime() - this.workStartTime.getTime();

        const workRecord = {
            date: new Date().toISOString().split('T')[0],
            duration: workTime
        };

        try {
            await DBHelper.put('workTimeRecords', workRecord);
        } catch (error) {
            console.error("儲存工作時長記錄失敗:", error);
        }

        return workTime;
    },

    getActionName(type) {
        const names = {
            [this.PUNCH_TYPES.WORK_IN]: '上工打卡',
            [this.PUNCH_TYPES.WORK_OUT]: '下工打卡',
            [this.PUNCH_TYPES.BREAK_START]: '開始休息',
            [this.PUNCH_TYPES.BREAK_END]: '結束休息'
        };
        return names[type] || '未知操作';
    },

    formatDateTime(date) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const weekday = weekdays[date.getDay()];
        return `${year}/${month}/${day} (${weekday}) ${hours}:${minutes}:${seconds}`;
    },

    formatDuration(ms) {
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        let parts = [];
        if (h > 0) parts.push(`${h}小時`);
        if (m > 0) parts.push(`${m}分鐘`);
        if (h === 0 && m === 0) parts.push(`${s}秒`);
        return parts.join(' ') || '0秒';
    },

    async getRecords() {
        try {
            return await DBHelper.getAll('punchRecords') || [];
        } catch (error) {
            console.error("獲取打卡記錄失敗:", error);
            throw error;
        }
    },

    async saveSettings() {
        try {
            const settings = {
                workHours: document.getElementById('workHours').value,
                breakMinutes: document.getElementById('breakMinutes').value,
                appNotificationsEnabled: this.appNotificationsEnabled,
                enableSound: document.getElementById('enableSound').checked,
            };
            await DBHelper.put('appState', { key: 'trackerSettings', value: settings });
        } catch (error) {
            console.error("儲存設定失敗:", error);
            alert("錯誤：無法儲存您的設定。");
        }
    },

    async loadSettings() {
        try {
            const settings = await DBHelper.get('appState', 'trackerSettings');
            if (document.getElementById('workHours')) {
                document.getElementById('workHours').value = settings?.value.workHours || 8;
                document.getElementById('breakMinutes').value = settings?.value.breakMinutes || 15;
                this.appNotificationsEnabled = settings?.value.appNotificationsEnabled !== false;
                document.getElementById('enableSound').checked = settings?.value.enableSound !== false;
            }
        } catch (error) {
            console.error("讀取設定失敗:", error);
        }
    },

    async saveCurrentStatus() {
        try {
            const status = {
                currentStatus: this.currentStatus,
                workStartTime: this.workStartTime ? this.workStartTime.getTime() : null,
                breakStartTime: this.breakStartTime ? this.breakStartTime.getTime() : null
            };
            await DBHelper.put('appState', { key: 'trackerCurrentStatus', value: status });
        } catch (error) {
            console.error("儲存當前狀態失敗:", error);
        }
    },

    async loadData() {
        try {
            const status = await DBHelper.get('appState', 'trackerCurrentStatus');
            this.currentStatus = status?.value.currentStatus || 'idle';
            this.workStartTime = status?.value.workStartTime ? new Date(status.value.workStartTime) : null;
            this.breakStartTime = status?.value.breakStartTime ? new Date(status.value.breakStartTime) : null;
        } catch (error) {
            console.error("讀取狀態資料失敗:", error);
        }
    },

    async exportData() {
        try {
            const data = {
                punchRecords: await DBHelper.getAll('punchRecords'),
                workTimeRecords: await DBHelper.getAll('workTimeRecords'),
                settings: (await DBHelper.get('appState', 'trackerSettings'))?.value || {}
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `punch_data_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (error) {
            console.error("匯出資料失敗:", error);
            alert("錯誤：無法匯出資料。");
        }
    },

    async importData(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (confirm('確定要匯入打卡資料嗎？這會覆蓋現有的所有打卡記錄與設定。')) {
                    await Promise.all([
                        data.punchRecords ? DBHelper.saveAll('punchRecords', data.punchRecords) : Promise.resolve(),
                        data.workTimeRecords ? DBHelper.saveAll('workTimeRecords', data.workTimeRecords) : Promise.resolve(),
                        data.settings ? DBHelper.put('appState', { key: 'trackerSettings', value: data.settings }) : Promise.resolve()
                    ]);
                    alert('資料匯入成功！頁面將重新載入。');
                    window.location.reload();
                }
            } catch (error) {
                alert('❌ 檔案格式錯誤或匯入失敗，請檢查檔案內容。');
                console.error("匯入失敗:", error);
            }
        };
        reader.readAsText(file);
        input.value = '';
    },

    async clearAllData() {
        if (confirm('【警告】確定要清除所有打卡資料與設定嗎？此操作無法復原。')) {
            try {
                await Promise.all([
                    DBHelper.clear('punchRecords'),
                    DBHelper.clear('workTimeRecords'),
                    DBHelper.delete('appState', 'trackerCurrentStatus'),
                    DBHelper.delete('appState', 'trackerSettings')
                ]);
                alert('所有資料已清除。頁面將重新載入。');
                window.location.reload();
            } catch (error) {
                console.error("清除資料失敗:", error);
                alert("錯誤：清除資料時發生問題。");
            }
        }
    },
};

// TimeQuadrantTracker模組
const TimeQuadrantTracker = {
    isInitialized: false,
    getMonthlyTitle(score) {
        if (score >= 800) return "非常好現在你有冰淇淋";
        if (score >= 551) return "時間暫停壓路機";
        if (score >= 381) return "你是有錢人了";
        if (score >= 251) return "時間管理大師";
        if (score >= 151) return "意志力修行者";
        if (score >= 80) return "逐漸照亮自己";
        return "沙發馬鈴薯";
    },
    getLocalDateString(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },
    convertTo24Hour(time12h) {
        if (!time12h || !time12h.includes(' ')) return time12h;

        const [time, modifier] = time12h.split(' ');
        let [hours, minutes] = time.split(':');

        if (hours === '12') {
            hours = '00';
        }

        if (modifier.toUpperCase() === 'PM') {
            hours = parseInt(hours, 10) + 12;
        }

        return `${String(hours).padStart(2, '0')}:${minutes}`;
    },
    tasks: [],
    currentDate: new Date(),
    dailyChart: null,
    monthlyChart: null,
    matrixReminders: { a: [], b: [], c: [], d: [] },
    quadrantColors: {
        'A': { name: '緊急且重要', color: 'rgba(173, 64, 56, 0.7)' },
        'B': { name: '重要但不緊急', color: 'rgba(56, 185, 121, 0.7)' },
        'C': { name: '緊急但不重要', color: 'rgba(90, 110, 224, 0.7)' },
        'D': { name: '不緊急不重要', color: 'rgba(188, 130, 206, 0.7)' }
    },

    async init() {
        await this.loadData();
        document.getElementById('prev-day-btn').addEventListener('click', () => this.changeDay(-1));
        document.getElementById('next-day-btn').addEventListener('click', () => this.changeDay(1));

        flatpickr("#current-date-display", {
            onChange: (selectedDates, dateStr, instance) => {
                this.currentDate = selectedDates[0];
                this.render();
            }
        });

        flatpickr("#task-time-input", {
            enableTime: true,
            noCalendar: true,
            dateFormat: "h:i K",
            time_24hr: false
        });

        flatpickr("#task-dates-input", {
            mode: "multiple",
            dateFormat: "Y-m-d",
            conjunction: ", ",
        });

        await this.initMatrixReminders();
        this.isInitialized = true;
    },

    async loadData() {
        this.tasks = await DBHelper.getAll('tasks') || [];
    },

    async saveData() {
        await DBHelper.saveAll('tasks', this.tasks);
    },

    changeDay(offset) {
        this.currentDate.setDate(this.currentDate.getDate() + offset);
        this.render();
    },

    render() {
        this.renderDateDisplay();
        this.renderTimeline();
        this.renderStatistics();
    },

    renderDateDisplay() {
        const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
        document.getElementById('current-date-display').textContent = this.currentDate.toLocaleDateString('zh-TW', options);
    },

    renderTimeline() {
        const container = document.getElementById('timeline-container');
        const pixelPerMinute = 1;
        const totalHeight = 24 * 60 * pixelPerMinute;
        container.innerHTML = '';
        container.style.height = `${totalHeight}px`;

        for (let hour = 0; hour < 24; hour++) {
            const timeStr = String(hour).padStart(2, '0') + ':00';
            const timeBlock = document.createElement('div');
            timeBlock.className = 'time-block';
            timeBlock.style.top = `${hour * 60 * pixelPerMinute}px`;
            timeBlock.style.position = 'absolute';
            timeBlock.style.width = '100%';
            timeBlock.innerHTML = `
                <div class="time-label">${timeStr}</div>
                <button class="add-task-btn-left" onclick="TimeQuadrantTracker.openTaskForm(null, '${timeStr}')" title="新增任務">+</button>
                <div class="task-area"></div> 
            `;
            container.appendChild(timeBlock);
        }

        const currentDateStr = this.getLocalDateString(this.currentDate);
        const dailyTasks = this.tasks.filter(task => task.date === currentDateStr)
            .sort((a, b) => {
                const timeA = this.convertTo24Hour(a.time);
                const timeB = this.convertTo24Hour(b.time);
                if (timeA === timeB) {
                    return (b.duration || 0) - (a.duration || 0);
                }
                return timeA.localeCompare(timeB);
            });

        dailyTasks.forEach(task => {
            const [startHour, startMinute] = this.convertTo24Hour(task.time).split(':').map(Number);
            const startTimeInMinutes = startHour * 60 + startMinute;
            const duration = task.duration || 30;

            const taskElement = document.createElement('div');
            taskElement.className = `task-item ${task.completed ? 'completed' : ''}`;
            taskElement.dataset.quadrant = task.quadrant;

            taskElement.style.top = `${startTimeInMinutes * pixelPerMinute}px`;
            taskElement.style.height = `${duration * pixelPerMinute}px`;

            taskElement.style.left = '130px';
            taskElement.style.width = 'calc(100% - 140px)';

            taskElement.setAttribute('onclick', `if(event.target.closest('.task-actions, .task-completion')) return; TimeQuadrantTracker.openTaskForm(${task.id})`);
            taskElement.style.cursor = 'pointer';

            const durationBadgeText = task.duration || 30;
            const hours = Math.floor(durationBadgeText / 60);
            const mins = durationBadgeText % 60;
            let durationText = '';
            if (hours > 0) durationText += `${hours}h `;
            if (mins > 0) durationText += `${mins}m`;

            taskElement.innerHTML = `
                            <div class="task-header">
                                <div class="task-completion">
                                    <input type="checkbox" id="task-check-${task.id}" class="pretty-checkbox" ${task.completed ? 'checked' : ''} 
                                        onchange="TimeQuadrantTracker.toggleTaskComplete(${task.id}); event.stopPropagation();">
                                    <label for="task-check-${task.id}" onclick="event.stopPropagation();"></label>
                                </div>
                                <div class="task-content-display">${DOMPurify.sanitize(marked.parse(task.content))}</div>
                                <div class="task-duration-badge">${durationText.trim()}</div>
                            </div>
                        `;

            container.appendChild(taskElement);
        });
    },

    extendTaskDuration(taskId, minutesToAdd) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            if (!task.duration) {
                task.duration = 0;
            }
            task.duration += minutesToAdd;
            this.saveData();
            this.render();
        }
    },

    openTaskForm(taskId = null, defaultTime = '09:00') {
        const modal = document.getElementById('task-form-modal');
        const formTitle = document.getElementById('form-title');
        const idInput = document.getElementById('task-id-input');
        const timeInput = document.getElementById('task-time-input');
        const durationInput = document.getElementById('task-duration-input');
        const contentInput = document.getElementById('task-content-input');
        const colorSelector = document.getElementById('color-selector');
        const recurringSection = document.getElementById('recurring-task-section');
        const deleteBtn = document.getElementById('delete-task-btn');

        colorSelector.innerHTML = Object.keys(this.quadrantColors).map(key => `
                <span class="color-dot" data-quadrant="${key}" style="background-color: ${this.quadrantColors[key].color};" title="${this.quadrantColors[key].name}"></span>
            `).join('');

        colorSelector.querySelectorAll('.color-dot').forEach(dot => {
            dot.addEventListener('click', (e) => {
                colorSelector.querySelector('.selected')?.classList.remove('selected');
                e.target.classList.add('selected');
            });
        });

        if (taskId) {
            const task = this.tasks.find(t => t.id === taskId);
            formTitle.textContent = '編輯任務';
            idInput.value = task.id;
            timeInput.value = task.time;
            durationInput.value = task.duration || 30;
            contentInput.value = task.content;
            colorSelector.querySelector(`[data-quadrant="${task.quadrant}"]`).classList.add('selected');
            recurringSection.style.display = 'none';
            deleteBtn.style.display = 'inline-block';
        } else {
            formTitle.textContent = '新增任務';
            idInput.value = '';
            timeInput.value = defaultTime;
            durationInput.value = 30;
            contentInput.value = '';
            colorSelector.querySelector('.color-dot').classList.add('selected');
            recurringSection.style.display = 'block';
            deleteBtn.style.display = 'none';
        }
        modal.style.display = 'flex';
        const taskTextarea = document.getElementById('task-content-input');
        taskTextarea.addEventListener('input', () => autoResizeTextarea(taskTextarea));
        autoResizeTextarea(taskTextarea);
    },

    closeTaskForm() {
        const datesInput = document.querySelector("#task-dates-input")._flatpickr;
        datesInput.clear();
        document.getElementById('recurring-task-checkbox').checked = false;
        document.getElementById('recurring-dates-container').style.display = 'none';
        document.getElementById('task-form-modal').style.display = 'none';
    },

    saveTask() {
        const id = document.getElementById('task-id-input').value;
        const time = document.getElementById('task-time-input').value;
        const duration = parseInt(document.getElementById('task-duration-input').value, 10);
        const content = document.getElementById('task-content-input').value.trim();
        const selectedQuadrant = document.querySelector('#color-selector .selected').dataset.quadrant;

        const isRecurring = document.getElementById('recurring-task-checkbox').checked;
        const datesInput = document.querySelector("#task-dates-input")._flatpickr;
        const selectedDates = datesInput.selectedDates;

        if (!content || !time) {
            alert('請填寫時間和內容！');
            return;
        }

        if (id) {
            const taskIndex = this.tasks.findIndex(t => t.id == id);
            if (taskIndex > -1) {
                this.tasks[taskIndex].time = time;
                this.tasks[taskIndex].content = content;
                this.tasks[taskIndex].quadrant = selectedQuadrant;
                this.tasks[taskIndex].duration = duration;
            }
        }
        else {
            if (isRecurring && selectedDates.length > 0) {
                selectedDates.forEach((date, index) => {
                    const newTask = {
                        id: Date.now() + index,
                        date: this.getLocalDateString(date),
                        time: time,
                        content: content,
                        quadrant: selectedQuadrant,
                        completed: false,
                        duration: duration
                    };
                    this.tasks.push(newTask);
                });
                alert(`已成功為 ${selectedDates.length} 個日期新增任務！`);
            }
            else {
                const newTask = {
                    id: Date.now(),
                    date: this.getLocalDateString(this.currentDate),
                    time: time,
                    content: content,
                    quadrant: selectedQuadrant,
                    completed: false,
                    duration: duration
                };
                this.tasks.push(newTask);
            }
        }

        this.saveData();
        this.render();
        this.closeTaskForm();
    },
    deleteTaskFromModal() {
        const taskId = parseInt(document.getElementById('task-id-input').value, 10);
        if (!taskId) {
            alert("找不到任務 ID，無法刪除。");
            return;
        }

        this.deleteTask(taskId);

        this.closeTaskForm();
    },

    async deleteTask(taskId) {
        this.tasks = this.tasks.filter(t => t.id !== taskId);
        await this.saveData();
        if (!FloatingSearch.isWindowOpen) {
            this.render();
        }
    },

    toggleTaskComplete(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            this.saveData();
            this.render();

            ProactiveAIManager.checkTriggers({ type: 'TASK_STATE_CHANGED', data: { taskId: taskId, completed: task.completed } });
        }
    },

    renderStatistics() {
        this.renderPieChart('daily');
        this.renderPieChart('monthly');
    },

    renderPieChart(period) {
        const isDaily = period === 'daily';
        const containerId = isDaily ? 'daily-pie-chart-container' : 'monthly-pie-chart-container';
        const container = document.getElementById(containerId);

        if (!container) return;
        container.innerHTML = '';

        const now = new Date();
        const startOfPeriod = isDaily
            ? new Date(this.currentDate).setHours(0, 0, 0, 0)
            : new Date(now.getFullYear(), now.getMonth(), 1).setHours(0, 0, 0, 0);
        const endOfPeriod = isDaily
            ? new Date(this.currentDate).setHours(23, 59, 59, 999)
            : new Date(now.getFullYear(), now.getMonth() + 1, 0).setHours(23, 59, 59, 999);

        const tasksInPeriod = this.tasks.filter(t => {
            const taskDate = new Date(t.date);
            const taskTimestamp = taskDate.getTime();
            return taskTimestamp >= startOfPeriod && taskTimestamp <= endOfPeriod;
        });

        const completedTasks = tasksInPeriod.filter(t => t.completed);

        if (completedTasks.length === 0) {
            container.innerHTML = `<div class="no-data-message">${isDaily ? '完成任務後<br>將顯示圖表' : '完成本月任務後<br>將顯示分析圖表'}</div>`;
            return;
        }

        const quadrantScores = { 'A': 4, 'B': 3, 'C': 2, 'D': 1 };
        let totalPossibleScore = 0;
        let earnedScore = 0;
        tasksInPeriod.forEach(task => { totalPossibleScore += quadrantScores[task.quadrant] || 0; });
        completedTasks.forEach(task => { earnedScore += quadrantScores[task.quadrant] || 0; });

        const dataForD3 = [];
        const quadrantCounts = { 'A': 0, 'B': 0, 'C': 0, 'D': 0 };
        completedTasks.forEach(task => { quadrantCounts[task.quadrant]++; });

        for (const key in quadrantCounts) {
            if (quadrantCounts[key] > 0) {
                dataForD3.push({
                    quadrant: key,
                    label: this.quadrantColors[key].name,
                    value: quadrantCounts[key]
                });
            }
        }

        const width = container.clientWidth;
        const height = width;
        const radius = Math.min(width, height) / 2.2 - 10;

        const svg = d3.select("#" + containerId)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .append("g")
            .attr("transform", `translate(${width / 2}, ${height / 2})`);

        const defs = svg.append("defs");
        const gradientColors = {
            'A': ['rgba(255, 97, 86, 0.9)', 'rgba(201, 34, 22, 0.6)'],
            'B': ['rgba(72, 253, 163, 0.9)', 'rgba(56, 185, 121, 0.6)'],
            'C': ['rgba(144, 160, 255, 0.9)', 'rgba(90, 110, 224, 0.6)'],
            'D': ['rgba(203, 145, 226, 0.9)', 'rgba(160, 84, 184, 0.6)']
        };

        for (const key in gradientColors) {
            const gradient = defs.append("radialGradient")
                .attr("id", `gradient-${key}`)
                .attr("cx", "50%").attr("cy", "50%").attr("r", "50%").attr("fx", "50%").attr("fy", "50%");

            gradient.append("stop").attr("offset", "0%").style("stop-color", gradientColors[key][0]);
            gradient.append("stop").attr("offset", "100%").style("stop-color", gradientColors[key][1]);
        }

        const pie = d3.pie().value(d => d.value).sort(null);
        const arc = d3.arc().innerRadius(radius * 0.65).outerRadius(radius);

        svg.selectAll('path')
            .data(pie(dataForD3))
            .enter()
            .append('path')
            .attr('d', arc)
            .attr('fill', d => `url(#gradient-${d.data.quadrant})`)
            .attr('stroke', 'white')
            .style('stroke-width', '2px');

        const centerText = svg.append("text")
            .attr("text-anchor", "middle")
            .style("font-family", "inherit")
            .style("fill", "#966232ff");

        if (isDaily) {
            centerText.append("tspan")
                .attr("x", 0)
                .attr("dy", "-0.1em")
                .style("font-size", `${radius * 0.35}px`)
                .style("font-weight", "bold")
                .text(earnedScore);
            centerText.append("tspan")
                .attr("x", 0)
                .attr("dy", "1.2em")
                .style("font-size", `${radius * 0.18}px`)
                .text(` / ${totalPossibleScore}`);
        } else {
            const title = this.getMonthlyTitle(earnedScore);
            centerText.append("tspan")
                .attr("x", 0)
                .attr("dy", "-0.4em")
                .style("font-size", `${radius * 0.2}px`)
                .style("font-weight", "bold")
                .text(title);
            centerText.append("tspan")
                .attr("x", 0)
                .attr("dy", "1.3em")
                .style("font-size", `${radius * 0.3}px`)
                .text(`${earnedScore} / ${totalPossibleScore}`);
        }
    },

    exportData() {
        if (this.tasks.length === 0) {
            return alert('沒有時間表資料可供匯出。');
        }
        const dataStr = JSON.stringify({ tasks: this.tasks }, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `time_quadrant_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        alert('時間表資料匯出成功！');
    },

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            if (!confirm('匯入資料將【覆蓋】現有所有時間表任務，確定嗎？')) {
                event.target.value = '';
                return;
            }
            try {
                const data = JSON.parse(e.target.result);
                if (data.tasks && Array.isArray(data.tasks)) {
                    this.tasks = data.tasks;
                    await this.saveData();
                    alert('時間表資料匯入成功！頁面將重新整理。');
                    location.reload();
                } else {
                    alert('檔案格式錯誤，找不到 "tasks" 資料。');
                }
            } catch (error) {
                alert('檔案格式錯誤或已損毀。');
                console.error(error);
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    },
    matrixReminders: { a: [], b: [], c: [], d: [] },

    async initMatrixReminders() {
        const savedReminders = await DBHelper.get('appState', 'matrixReminders');
        if (savedReminders) {
            this.matrixReminders = savedReminders.value;
        }
        this.renderMatrixReminders();
    },

    renderMatrixReminders() {
        const container = document.getElementById('eisenhower-matrix-container');
        if (!container) return;
        container.innerHTML = '';
        const quadrants = {
            a: { title: 'A象限', subtitle: '緊急且重要' },
            b: { title: 'B象限', subtitle: '重要但不緊急' },
            c: { title: 'C象限', subtitle: '緊急但不重要' },
            d: { title: 'D象限', subtitle: '不緊急不重要' },
        };

        for (const key in quadrants) {
            const quad = quadrants[key];
            const remindersHtml = this.matrixReminders[key].map((text, index) =>
                `<div class="task-tag">${text}<button class="task-delete-btn" onclick="TimeQuadrantTracker.deleteMatrixReminder('${key}', ${index})">×</button></div>`
            ).join('');

            container.innerHTML += `
                <div class="quadrant quadrant-${key}" data-quadrant="${key}">
                    <div class="quadrant-header">
                        <div class="quadrant-title">${quad.title}</div>
                        <div class="quadrant-subtitle">${quad.subtitle}</div>
                    </div>
                    <div class="tasks-area">${remindersHtml}</div>
                    <button class="add-task-btn" onclick="TimeQuadrantTracker.addMatrixReminder('${key}')">+</button>
                </div>
                `;
        }
    },

    addMatrixReminder(quadrantKey) {
        const text = prompt(`請為 ${quadrants[quadrantKey].title} 新增提醒事項：`);
        if (text && text.trim()) {
            this.matrixReminders[quadrantKey].push(text.trim());
            this.saveAndRenderMatrix();
        }
    },

    deleteMatrixReminder(quadrantKey, index) {
        this.matrixReminders[quadrantKey].splice(index, 1);
        this.saveAndRenderMatrix();
    },

    async saveAndRenderMatrix() {
        await DBHelper.put('appState', { key: 'matrixReminders', value: this.matrixReminders });
        this.renderMatrixReminders();
    },
    hexToRgba(hex, alpha = 1) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },
    async initMatrixReminders() {
        const savedReminders = await DBHelper.get('appState', 'matrixReminders');
        if (savedReminders && savedReminders.value) {
            this.matrixReminders = savedReminders.value;
        }
        this.renderMatrixReminders();
    },

    renderMatrixReminders() {
        const container = document.getElementById('eisenhower-matrix-container');
        if (!container) return;
        container.innerHTML = '';
        const quadrants = {
            a: { title: 'A象限', subtitle: '緊急且重要' },
            b: { title: 'B象限', subtitle: '重要但不緊急' },
            c: { title: 'C象限', subtitle: '緊急但不重要' },
            d: { title: 'D象限', subtitle: '不緊急不重要' },
        };

        for (const key in quadrants) {
            const quad = quadrants[key];
            const remindersHtml = this.matrixReminders[key].map((text, index) =>
                `<div class="task-tag"><span>${text}</span><button class="task-delete-btn" onclick="TimeQuadrantTracker.deleteMatrixReminder('${key}', ${index})">×</button></div>`
            ).join('');

            const quadrantDiv = document.createElement('div');
            quadrantDiv.className = `quadrant quadrant-${key}`;
            quadrantDiv.dataset.quadrant = key;
            quadrantDiv.innerHTML = `
                            <div class="quadrant-header">
                                <div class="quadrant-title">${quad.title}</div>
                                <div class="quadrant-subtitle">${quad.subtitle}</div>
                            </div>
                            <div class="tasks-area">${remindersHtml}</div>
                            <button class="add-task-btn" onclick="TimeQuadrantTracker.addMatrixReminder('${key}')">+</button>
                        `;
            container.appendChild(quadrantDiv);
        }
    },

    addMatrixReminder(quadrantKey) {
        const text = prompt(`請為 ${this.quadrantColors[quadrantKey.toUpperCase()].name} 新增提醒事項：`);
        if (text && text.trim()) {
            this.matrixReminders[quadrantKey].push(text.trim());
            this.saveAndRenderMatrix();
        }
    },

    deleteMatrixReminder(quadrantKey, index) {
        if (confirm('確定要刪除這個提醒嗎？')) {
            this.matrixReminders[quadrantKey].splice(index, 1);
            this.saveAndRenderMatrix();
        }
    },

    async saveAndRenderMatrix() {
        await DBHelper.put('appState', { key: 'matrixReminders', value: this.matrixReminders });
        this.renderMatrixReminders();
    },

};
// --- 任務時長按鈕 ---

function adjustDuration(minutesToAdd) {
    const durationInput = document.getElementById('task-duration-input');
    if (durationInput) {
        let currentValue = parseInt(durationInput.value, 10);
        if (isNaN(currentValue)) {
            currentValue = 0;
        }
        durationInput.value = currentValue + minutesToAdd;
    }
}
// --- 習慣追蹤模組 ---
const HabitTracker = {
    habits: [],
    reportChart: null,

    init() {
        this.loadData();
    },

    async loadData() {
        this.habits = await DBHelper.getAll('habits') || [];
    },

    async saveData() {
        await DBHelper.saveAll('habits', this.habits);
    },

    async addHabit() {
        const input = document.getElementById('new-habit-input');
        const habitName = input.value.trim();
        if (!habitName) {
            alert('請輸入習慣名稱！');
            return;
        }

        const newHabit = {
            id: Date.now(),
            name: habitName,
            checkIns: [],
        };

        this.habits.unshift(newHabit);
        this.saveData();
        this.renderHabits();
        InputSaver.clear('new-habit-input');
        input.value = '';
    },

    async deleteHabit(id) {
        if (confirm('確定要刪除這個習慣嗎？所有進度將會遺失。')) {
            this.habits = this.habits.filter(h => h.id !== id);
            this.saveData();
            this.renderHabits();
            this.renderReportChart();
        }
    },

    editHabit(id) {
        const habitElement = document.querySelector(`.habit-item[data-id="${id}"]`);
        if (!habitElement) return;

        if (habitElement.querySelector('.habit-edit-input')) {
            return;
        }

        const habit = this.habits.find(h => h.id === id);
        if (!habit) return;

        const nameSpan = habitElement.querySelector('.habit-name');
        nameSpan.innerHTML = `<input type="text" class="input-field-Details habit-edit-input" value="${habit.name}">`;

        const inputField = nameSpan.querySelector('.habit-edit-input');
        inputField.focus();
        inputField.select();

        const actionsContainer = habitElement.querySelector('.habit-actions');
        if (!actionsContainer) {
            console.error("找不到 .habit-actions 容器！");
            return;
        }

        actionsContainer.innerHTML = '';

        const saveButton = document.createElement('button');
        const cancelButton = document.createElement('button');

        saveButton.classList.add('btn-save-unified');
        cancelButton.classList.add('btn-cancel-unified');

        saveButton.innerHTML = '💾';
        cancelButton.innerHTML = '❌';

        saveButton.addEventListener('click', () => {
            this.saveEditedHabit(id);
        });

        cancelButton.addEventListener('click', () => {
            this.renderHabits();
        });
        actionsContainer.append(saveButton, cancelButton);
    },

    saveEditedHabit(id) {
        const habitElement = document.querySelector(`.habit-item[data-id="${id}"]`);
        if (!habitElement) return;

        const inputField = habitElement.querySelector('.habit-edit-input');
        if (!inputField) return;

        const newName = inputField.value.trim();
        if (newName) {
            const habit = this.habits.find(h => h.id === id);
            if (habit) {
                habit.name = newName;
                this.saveData();
                this.renderHabits();
            }
        }
    },

    getLocalDateString(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    renderHabits() {
        const container = document.getElementById('habit-list-container');
        if (!container) return;

        if (this.habits.length === 0) {
            container.innerHTML = '<p>尚未建立任何習慣，從下方開始新增吧！</p>';
            return;
        }

        const todayStr = this.getLocalDateString(new Date());

        let html = this.habits.map(habit => {
            const checkInCount = habit.checkIns.length;
            const milestone = this.calculateMilestone(checkInCount);
            const isCompletedToday = habit.checkIns.some(ts => this.getLocalDateString(ts) === todayStr);

            return `
                    <div class="habit-item" data-id="${habit.id}" style="border-left-color: ${milestone.color};">
                        <div class="habit-main-row">
                            <button
                                class="habit-check-toggle ${isCompletedToday ? 'completed' : ''}"
                                onclick="HabitTracker.checkInHabit(${habit.id})"
                                ${isCompletedToday ? 'disabled' : ''}>
                                ${isCompletedToday ? '✔' : ''}
                            </button>
                            <span class="habit-name">${habit.name}</span>
                            <div class="habit-actions">
                                <button class="btn-pin" onclick="HabitTracker.editHabit(${habit.id})">✏️</button>
                                <button class="btn-delete" onclick="HabitTracker.deleteHabit(${habit.id})">🗑️</button>
                            </div>
                        </div>
                        <div class="habit-progress-details">
                            <div class="habit-progress-text">
                                <span>等級 ${milestone.level}: ${milestone.name}</span>
                                <span>總完成: ${checkInCount} / ${milestone.nextMilestone} 次</span>
                            </div>
                            <div class="habit-progress-bar-container">
                                <div class="habit-progress-bar" style="width: ${milestone.progress}%; background-color: ${milestone.color};"></div>
                            </div>
                        </div>
                    </div>
                `;
        }).join('');

        container.innerHTML = html;
    },

    calculateMilestone(count) {
        const milestones = [
            { level: 0, name: '種子', min: 0, next: 10, color: '#CDA283' },
            { level: 1, name: '萌芽', min: 10, next: 25, color: '#b3c458ff' },
            { level: 2, name: '幼苗', min: 25, next: 50, color: '#83c769ff' },
            { level: 3, name: '小樹', min: 50, next: 100, color: '#4b914eff' },
            { level: 4, name: '大樹', min: 100, next: 200, color: '#357e56ff' },
            { level: 5, name: '森林', min: 200, next: 500, color: '#24613fff' },
            { level: 6, name: '世界樹', min: 500, next: Infinity, color: '#278378ff' }
        ];

        let current = milestones[0];
        for (let i = milestones.length - 1; i >= 0; i--) {
            if (count >= milestones[i].min) {
                current = milestones[i];
                break;
            }
        }

        const progress = current.next === Infinity ? 100 : Math.round(((count - current.min) / (current.next - current.min)) * 100);

        return {
            level: current.level,
            name: current.name,
            nextMilestone: current.next === Infinity ? "∞" : current.next,
            progress: Math.min(progress, 100),
            color: current.color
        };
    },

    checkInHabit(id) {
        const habit = this.habits.find(h => h.id === id);
        if (!habit) return;

        const todayStr = this.getLocalDateString(new Date());
        const isCompletedToday = habit.checkIns.some(ts => this.getLocalDateString(ts) === todayStr);

        if (isCompletedToday) {
            alert('今天已經打過卡囉！');
        } else {
            habit.checkIns.push(Date.now());
            this.saveData();
            this.renderHabits();
            this.renderReportChart();

            ProactiveAIManager.checkTriggers({ type: 'HABIT_CHECKED_IN', data: { habitId: id, habitName: habit.name } });
        }
    },

    renderReportChart() {
        const ctx = document.getElementById('habit-report-chart')?.getContext('2d');
        if (!ctx) return;

        const period = document.getElementById('habit-report-period').value;
        const reportData = this.calculateReportData(period);

        if (this.reportChart) {
            this.reportChart.destroy();
        }

        this.reportChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: reportData.labels,
                datasets: [{
                    label: '完成率 (%)',
                    data: reportData.completionRates,
                    backgroundColor: 'rgba(75, 192, 192, 0.7)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: '完成率 (%)' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return `完成率: ${context.raw}%`;
                            }
                        }
                    }
                }
            }
        });
    },

    calculateReportData(period) {
        const labels = this.habits.map(h => h.name);
        const completionRates = this.habits.map(habit => {
            const now = new Date();
            let startDate;
            let totalDaysInPeriod = 0;

            if (period === 'weekly') {
                startDate = new Date(now.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)));
                totalDaysInPeriod = new Date().getDay() || 7;
            } else {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                totalDaysInPeriod = new Date().getDate();
            }
            startDate.setHours(0, 0, 0, 0);

            const habitStartDate = new Date(habit.id);
            const actualStartDate = habitStartDate > startDate ? habitStartDate : startDate;

            const diffTime = new Date().getTime() - actualStartDate.getTime();
            const existingDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

            const checkInsInPeriod = habit.checkIns.filter(ts => ts >= startDate.getTime()).length;

            if (existingDays === 0) return 0;

            return Math.round((checkInsInPeriod / Math.min(totalDaysInPeriod, existingDays)) * 100);
        });

        return { labels, completionRates };
    },
    exportData() {
        if (this.habits.length === 0) {
            return alert('沒有習慣資料可供匯出。');
        }
        const dataStr = JSON.stringify({ habits: this.habits }, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `habit_tracker_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        alert('習慣資料匯出成功！');
    },

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            if (!confirm('匯入資料將【覆蓋】現有所有習慣記錄，確定嗎？')) {
                event.target.value = '';
                return;
            }
            try {
                const data = JSON.parse(e.target.result);
                if (data.habits && Array.isArray(data.habits)) {
                    this.habits = data.habits;
                    await this.saveData();
                    alert('習慣資料匯入成功！頁面將重新整理。');
                    location.reload();
                } else {
                    alert('檔案格式錯誤，找不到 "habits" 資料。');
                }
            } catch (error) {
                alert('檔案格式錯誤或已損毀。');
                console.error(error);
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    },
};

// --- 主動式 AI 管理器 (Proactive AI Manager) ---
const ProactiveAIManager = {
    lastTriggered: {},

    async checkTriggers(event) {
        console.log(`[AI Manager] 收到事件: ${event.type}`, event.data);

        if (event.type === 'TASK_STATE_CHANGED') {
            await this.checkTaskRules();
        }
        if (event.type === 'HABIT_CHECKED_IN') {
            await this.checkHabitRules(event.data.habitId);
        }
        if (event.type === 'MOOD_ENTRY_SAVED') {
            await this.checkMoodRules();
        }
    },

    async checkTaskRules() {
        const todayStr = new Date().toISOString().split('T')[0];
        const allTasks = await DBHelper.getAll('tasks') || [];
        const todayTasks = allTasks.filter(t => t.date === todayStr);
        if (todayTasks.length === 0) return;

        const completedTasks = todayTasks.filter(t => t.completed);
        const quadrantScores = { 'A': 4, 'B': 3, 'C': 2, 'D': 1 };
        const totalScore = completedTasks.reduce((sum, task) => sum + (quadrantScores[task.quadrant] || 0), 0);

        if (totalScore >= 20 && this.canTrigger('taskScoreHigh20')) {
            const prompt = `[系統指令] 使用者今天生產力爆發，任務總得分已達 ${totalScore} 分。充滿活力的語氣恭喜，並溫馨提醒記得要適度休息。`;
            this.triggerAI(prompt, 'taskScoreHigh20');
        }

        const uncompletedImportantTasks = todayTasks.filter(t => !t.completed && (t.quadrant === 'A' || t.quadrant === 'B')).length;
        if (new Date().getHours() >= 19 && uncompletedImportantTasks > 2 && this.canTrigger('taskRemindLate')) {
            const prompt = `[系統指令] 現在已經晚上，使用者還有 ${uncompletedImportantTasks} 個重要任務尚未完成。用溫和語氣提醒。`;
            this.triggerAI(prompt, 'taskRemindLate');
        }
    },

    async checkHabitRules(justCompletedHabitId) {
        const todayStr = new Date().toISOString().split('T')[0];
        const allHabits = await DBHelper.getAll('habits') || [];

        const todayCompletedHabits = allHabits.filter(h => h.checkIns.some(ts => new Date(ts).toISOString().split('T')[0] === todayStr));
        if (todayCompletedHabits.length === 3 && this.canTrigger('habitMilestone3')) {
            const completedNames = todayCompletedHabits.map(h => `「${h.name}」`).join('、');
            const prompt = `[系統指令] 使用者展現了毅力，今天已經完成 ${completedNames} 共 3 個習慣！請稱讚並鼓勵繼續保持。`;
            this.triggerAI(prompt, 'habitMilestone3');
        }

        const habit = allHabits.find(h => h.id === justCompletedHabitId);
        if (!habit) return;

        const oldMilestone = HabitTracker.calculateMilestone(habit.checkIns.length - 1);
        const newMilestone = HabitTracker.calculateMilestone(habit.checkIns.length);

        if (newMilestone.level > oldMilestone.level && this.canTrigger(`habitLevelUp_${habit.id}`)) {
            const prompt = `[系統指令] 使用者的習慣「${habit.name}」剛剛升級到了 Lv.${newMilestone.level} - ${newMilestone.name}！請為他的努力和堅持給予祝賀。`;
            this.triggerAI(prompt, `habitLevelUp_${habit.id}`);
        }
    },

    async checkMoodRules() {
        const todayStr = new Date().toISOString().split('T')[0];
        const allMoods = await DBHelper.getAll('moods') || [];
        const todayEntries = allMoods.filter(e => e.date === todayStr);
        if (todayEntries.length < 2) return;

        const moodValue = { '快樂': 5, '感恩': 4, '平靜': 3, '疲憊': 1, '壓力': -2 };
        let totalScore = 0;
        let moodCount = 0;
        todayEntries.forEach(entry => {
            entry.moods.forEach(mood => {
                totalScore += (moodValue[mood] || 0);
                moodCount++;
            });
        });

        if (moodCount === 0) return;
        const averageScore = totalScore / moodCount;

        if (averageScore >= 4.5 && this.canTrigger('moodHigh')) {
            const prompt = `[系統指令] 偵測到使用者今天的心情指數高達 ${averageScore.toFixed(1)} 分！這真是美好的一天。祝賀與喜悅。`;
            this.triggerAI(prompt, 'moodHigh');
        }
        if (averageScore <= 2.0 && this.canTrigger('moodLow')) {
            const prompt = `[系統指令] 偵測到使用者今天的心情指數偏低，只有 ${averageScore.toFixed(1)} 分。以溫和支持語氣關心，提供一些能緩和情緒的建議（例如深呼吸、聽音樂、散步），但不要過度追問。`;
            this.triggerAI(prompt, 'moodLow');
        }
    },

    canTrigger(ruleId) {
        const todayStr = new Date().toISOString().split('T')[0];
        if (this.lastTriggered[ruleId] !== todayStr) {
            return true;
        }
        return false;
    },

    triggerAI(systemInstruction, ruleId) {
        console.log(`[AI Manager] 觸發規則 "${ruleId}"`);
        FloatingAIChat.sendSystemMessage(systemInstruction);

        const todayStr = new Date().toISOString().split('T')[0];
        this.lastTriggered[ruleId] = todayStr;
        DBHelper.put('appState', { key: 'proactiveAITriggers', value: this.lastTriggered });
    },

    async init() {
        const savedTriggers = await DBHelper.get('appState', 'proactiveAITriggers');
        if (savedTriggers) {
            this.lastTriggered = savedTriggers.value;
        }
    }
};

// --- 浮動 AI 聊天室模組 ---
const FloatingAIChat = {
    isWindowOpen: false,
    chatHistory: [],
    isLoading: false,
    attachedFile: null,
    currentAIController: null,
    sendIconSVG: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M10 14l11 -11" /><path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5" /></svg>`,
    stopIconSVG: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
  <path d="M17 4h-10a3 3 0 0 0 -3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3 -3v-10a3 3 0 0 0 -3 -3z" stroke-width="0" fill="currentColor" />
</svg>`,

    async init() {
        const storedHistory = await DBHelper.get('appState', 'floatingChatHistory');
        this.chatHistory = storedHistory ? storedHistory.value : [];
        this.renderChatHistory();

        document.getElementById('ai-chat-bubble').addEventListener('click', () => this.toggleWindow());
        document.getElementById('ai-chat-send-btn').addEventListener('click', () => this.sendChatMessage());

        document.getElementById('ai-chat-attach-btn').addEventListener('click', () => document.getElementById('ai-chat-file-input').click());
        document.getElementById('ai-chat-file-input').addEventListener('change', (event) => this.handleFileSelect(event));

        const chatInput = document.getElementById('ai-chat-input');
        if (chatInput) {
            chatInput.addEventListener('keypress', (event) => this.handleChatKeypress(event));
            chatInput.addEventListener('paste', (event) => this.handlePaste(event));
        }
    },

    showContextMenu(event, messageIndex) {
        this.hideContextMenu();
        const menu = document.getElementById('chat-context-menu');
        const chatWindow = document.getElementById('ai-chat-window');
        if (!menu || !chatWindow) return;

        menu.classList.remove('hidden');

        const rect = chatWindow.getBoundingClientRect();
        let x, y;

        if (event.touches) {
            x = event.touches[0].clientX - rect.left;
            y = event.touches[0].clientY - rect.top;
        } else {
            x = event.clientX - rect.left;
            y = event.clientY - rect.top;
        }

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        document.getElementById('ctx-copy-btn').onclick = () => this.copyMessage(messageIndex);
        document.getElementById('ctx-quote-btn').onclick = () => this.quoteMessage(messageIndex);
        document.getElementById('ctx-edit-btn').onclick = () => this.editMessage(messageIndex);
        document.getElementById('ctx-delete-btn').onclick = () => this.deleteChatMessage(messageIndex);

        document.getElementById('ctx-edit-btn').style.display = this.chatHistory[messageIndex].sender === 'user' ? 'block' : 'none';

        setTimeout(() => document.addEventListener('click', this.hideContextMenu, { once: true }), 0);
    },

    hideContextMenu() {
        const menu = document.getElementById('chat-context-menu');
        if (menu) menu.classList.add('hidden');
    },

    copyMessage(index) {
        const message = this.chatHistory[index].message;
        navigator.clipboard.writeText(message).then(() => {
            console.log('訊息已複製');
        }).catch(err => {
            console.error('複製失敗:', err);
        });
        this.hideContextMenu();
    },

    quoteMessage(index) {
        const message = this.chatHistory[index].message;
        const chatInput = document.getElementById('ai-chat-input');
        chatInput.value = `> ${message.split('\n').join('\n> ')}\n\n`;
        chatInput.focus();
        this.hideContextMenu();
    },

    editMessage(index) {
        this.chatHistory.forEach((msg, i) => {
            if (i !== index) delete msg.isEditing;
        });
        this.chatHistory[index].isEditing = true;
        this.renderChatHistory();
        this.hideContextMenu();
    },

    saveEditedMessage(index, newMessage) {
        const chatMessages = document.getElementById('ai-chat-messages');
        const scrollPosition = chatMessages.scrollTop;

        if (newMessage.trim() !== "") {
            this.chatHistory[index].message = newMessage.trim();
        }
        delete this.chatHistory[index].isEditing;
        this.saveChatHistory();
        this.renderChatHistory();

        chatMessages.scrollTop = scrollPosition;
    },

    cancelEdit(index) {
        const chatMessages = document.getElementById('ai-chat-messages');
        const scrollPosition = chatMessages.scrollTop;

        delete this.chatHistory[index].isEditing;
        this.renderChatHistory();

        chatMessages.scrollTop = scrollPosition;
    },

    handlePaste(event) {
        const items = event.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const file = items[i].getAsFile();
                const mockEvent = { target: { files: [file] } };
                this.handleFileSelect(mockEvent);
                event.preventDefault();
                break;
            }
        }
    },

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            this.attachedFile = {
                name: file.name,
                type: file.type,
                content: e.target.result.split(',')[1],
            };
            this.displayFilePreview(file, e.target.result);
        };
        if (file.type.startsWith('image/')) {
            reader.readAsDataURL(file);
        } else {
            reader.readAsText(file, 'UTF-8');
        }
        event.target.value = '';
    },

    displayFilePreview(file, dataUrl) {
        const container = document.getElementById('file-preview-container');
        let previewHTML = '';
        if (file.type.startsWith('image/')) {
            previewHTML = `<img src="${dataUrl}" alt="Image preview">`;
        } else {
            previewHTML = `<div style="font-size: 2rem;">📄</div>`;
        }
        container.innerHTML = `
            ${previewHTML}
            <div class="file-info">
                <span>${file.name}</span>
                (${(file.size / 1024).toFixed(2)} KB)
            </div>
            <button onclick="FloatingAIChat.clearAttachedFile()">×</button>
        `;
        container.classList.remove('hidden');
    },

    clearAttachedFile() {
        this.attachedFile = null;
        const container = document.getElementById('file-preview-container');
        container.innerHTML = '';
        container.classList.add('hidden');
    },

    toggleWindow() {
        this.isWindowOpen = !this.isWindowOpen;
        const windowEl = document.getElementById('ai-chat-window');
        windowEl.classList.toggle('hidden', !this.isWindowOpen);
        if (this.isWindowOpen) {
            const notification = document.getElementById('ai-chat-notification');
            if (notification) {
                notification.classList.add('hidden');
                notification.textContent = '';
            }
        }
    },

    renderChatHistory() {
        const chatMessages = document.getElementById('ai-chat-messages');
        if (!chatMessages) return;
        chatMessages.innerHTML = '';
        if (this.chatHistory.length === 0) {
            chatMessages.innerHTML = `<div class="chat-message-container"><div class="chat-message ai">你好，我是你的 AI 心情助手，有什麼事想聊聊嗎？</div></div>`;
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return;
        }

        this.chatHistory.forEach((msg, index) => {
            const messageContainer = document.createElement('div');
            messageContainer.className = `chat-message-container`;
            if (msg.sender === 'user') {
                messageContainer.classList.add('user-container');
            }
            let filePreviewHTML = '';
            if (msg.file && !msg.isEditing) {
                if (msg.file.type.startsWith('image/')) {
                    filePreviewHTML = `<img src="data:${msg.file.type};base64,${msg.file.content}" class="chat-message-image-preview" />`;
                } else {
                    filePreviewHTML = `<div class="chat-message-file-preview">📄 ${msg.file.name}</div>`;
                }
            }
            const messageBubble = document.createElement('div');
            messageBubble.className = `chat-message ${msg.sender}`;

            if (msg.sender === 'ai-loading') {
                const loadingText = "AI 思考中";
                messageBubble.innerHTML = loadingText.split('').map((char, i) =>
                    `<span style="--delay: ${i * 0.1}s;">${char}</span>`
                ).join('');
            } else if (msg.isEditing) {
                const editContainer = document.createElement('div');
                editContainer.className = 'edit-container';
                editContainer.innerHTML = `
                    <textarea class="edit-textarea">${msg.message}</textarea>
                    <div class="edit-buttons">
                        <button class="btn-save-unified">💾</button>
                        <button class="btn-cancel-unified">❌</button>
                    </div>
                `;
                editContainer.querySelector('.btn-save-unified').onclick = () => this.saveEditedMessage(index, editContainer.querySelector('.edit-textarea').value);
                editContainer.querySelector('.btn-cancel-unified').onclick = () => this.cancelEdit(index);

                const textarea = editContainer.querySelector('.edit-textarea');
                setTimeout(() => {
                    textarea.style.height = 'auto';
                    textarea.style.height = (textarea.scrollHeight) + 'px';
                    textarea.focus();
                    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
                }, 0);
                messageBubble.innerHTML = '';
                messageBubble.appendChild(editContainer);
            } else {
                let markdownHTML = marked.parse(msg.message || '');
                markdownHTML = markdownHTML.replace(/<p>\s*<\/p>$/g, '').replace(/\s+$/g, '');
                messageBubble.innerHTML = `${filePreviewHTML}${DOMPurify.sanitize(markdownHTML)}`;
            }

            if (msg.sender !== 'ai-loading' && !msg.isEditing) {
                messageBubble.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.showContextMenu(e, index);
                });
                let pressTimer;
                messageBubble.addEventListener('touchstart', (e) => {
                    pressTimer = window.setTimeout(() => {
                        e.preventDefault();
                        this.showContextMenu(e, index);
                    }, 500);
                });
                messageBubble.addEventListener('touchend', () => clearTimeout(pressTimer));
                messageBubble.addEventListener('touchmove', () => clearTimeout(pressTimer));
            }
            messageContainer.appendChild(messageBubble);
            chatMessages.appendChild(messageContainer);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    },

    async saveChatHistory() {
        await DBHelper.put('appState', { key: 'floatingChatHistory', value: this.chatHistory });
    },

    clearChatHistory() {
        if (confirm('確定要清除所有對話記錄嗎？')) {
            this.chatHistory = [];
            this.saveChatHistory();
            this.renderChatHistory();
            alert('對話記錄已清除。');
        }
    },

    deleteChatMessage(index) {
        if (confirm('您確定要刪除這則訊息嗎？')) {
            const chatMessages = document.getElementById('ai-chat-messages');
            const scrollPosition = chatMessages.scrollTop;
            this.chatHistory.splice(index, 1);
            this.saveChatHistory();
            this.renderChatHistory();

            chatMessages.scrollTop = scrollPosition;
        }
        this.hideContextMenu();
    },

    handleChatKeypress(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendChatMessage();
        }
    },

    addChatMessage(messagePayload, sender) {
        let newEntry;
        if (typeof messagePayload === 'object' && messagePayload !== null) {
            newEntry = messagePayload;
        } else {
            newEntry = { message: messagePayload, sender };
        }

        if (sender === 'ai' && this.isLoading) {
            const loadingIndex = this.chatHistory.findIndex(msg => msg.sender === 'ai-loading');
            if (loadingIndex !== -1) {
                this.chatHistory[loadingIndex] = newEntry;
            }
            this.isLoading = false;
        } else {
            this.chatHistory.push(newEntry);
            if (sender === 'ai-loading') {
                this.isLoading = true;
            }
        }
        this.saveChatHistory();
        this.renderChatHistory();
        if (sender === 'ai' && !this.isWindowOpen) {
            const notification = document.getElementById('ai-chat-notification');
            if (notification) {
                const notificationText = newEntry.message || "AI 有新訊息";
                notification.textContent = notificationText.substring(0, 30) + '...';
                notification.classList.remove('hidden');
            }
        }
    },

    async prepareAIPrompt(basePrompt) {
        let finalPrompt = basePrompt;
        const daysToFetch = MoodTracker.settings.aiDataDays || 1;
        const getPastDateString = (daysAgo) => {
            const date = new Date();
            date.setDate(date.getDate() - daysAgo);
            return date.toISOString().split('T')[0];
        };

        if (finalPrompt.includes('{{mood}}')) {
            let moodReport = "以下是最近的心情數據：\n";
            let hasMoodData = false;
            for (let i = 0; i < daysToFetch; i++) {
                const dateStr = getPastDateString(i);
                const entries = MoodTracker.moodData.filter(e => e.date === dateStr);
                if (entries.length > 0) {
                    hasMoodData = true;
                    moodReport += `[${dateStr}]: `;
                    entries.forEach(entry => {
                        moodReport += `${entry.type === 'morning' ? '起床時' : '睡前'}的心情是[${entry.moods.join(', ')}], 筆記「${entry.content}」。`;
                    });
                    moodReport += "\n";
                }
            }
            if (!hasMoodData) {
                moodReport += `過去 ${daysToFetch} 天內沒有心情記錄。\n`;
            }
            finalPrompt = finalPrompt.replace('{{mood}}', moodReport);
        }

        if (finalPrompt.includes('{{habits}}')) {
            let habitReport = "以下是最近的習慣數據：\n";
            if (HabitTracker.habits.length === 0) {
                habitReport += "尚未設定任何習慣。\n";
            } else {
                for (let i = 0; i < daysToFetch; i++) {
                    const dateStr = getPastDateString(i);
                    habitReport += `[${dateStr}]: `;
                    const habitStatus = HabitTracker.habits.map(h => {
                        const isDone = h.checkIns.some(ts => new Date(ts).toISOString().split('T')[0] === dateStr);
                        return `「${h.name}」${isDone ? '(✔)' : '(❌)'}`;
                    }).join(', ');
                    habitReport += habitStatus + "。\n";
                }
            }
            finalPrompt = finalPrompt.replace('{{habits}}', habitReport);
        }

        if (finalPrompt.includes('{{schedule}}')) {
            let scheduleReport = "以下是最近的時間表安排與完成資訊：\n";
            let hasScheduleData = false;
            const scheduleTasks = TimeQuadrantTracker.tasks || [];

            for (let i = 0; i < daysToFetch; i++) {
                const dateStr = getPastDateString(i);
                const entries = scheduleTasks.filter(t => t.date === dateStr);
                if (entries.length > 0) {
                    hasScheduleData = true;
                    scheduleReport += `[${dateStr}]:\n`;
                    entries.forEach(task => {
                        const status = task.completed ? '(✔ 已完成)' : '(❌ 未完成)';
                        const quadrantName = TimeQuadrantTracker.quadrantColors[task.quadrant].name;
                        scheduleReport += `  - ${task.time} ${task.content} [${quadrantName}] ${status}\n`;
                    });
                }
            }
            if (!hasScheduleData) {
                scheduleReport += `過去 ${daysToFetch} 天內沒有時間表安排。\n`;
            }
            finalPrompt = finalPrompt.replace('{{schedule}}', scheduleReport);
        }

        return finalPrompt;
    },

    async _callAIAPI(apiKey, model, body, signal) {
        let apiUrl = '';
        const headers = {
            'Content-Type': 'application/json',
        };

        if (model.includes('gemini')) {
            apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        } else if (model.includes('gpt') || model.includes('chatgpt')) {
            apiUrl = 'https://api.openai.com/v1/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
        } else if (model.includes('mistral')) {
            apiUrl = 'https://api.mistral.ai/v1/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
        } else if (model.includes('grok')) {
            apiUrl = 'https://api.x.ai/v1/chat/completions';
            headers['Authorization'] = `Bearer ${apiKey}`;
        } else {
            throw new Error(`不支援的模型類型: ${model}`);
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
            signal: signal
        });

        const result = await response.json();
        if (!response.ok) {
            console.error("AI API Error Details:", result);
            const errorMessage = result?.error?.message || `HTTP 錯誤! 狀態碼: ${response.status}`;
            throw new Error(errorMessage);
        }

        let aiResponse = '';
        if (model.includes('gemini')) {
            if (result.candidates && result.candidates[0].content.parts[0].text) {
                aiResponse = result.candidates[0].content.parts[0].text;
            } else {
                throw new Error("AI 回應的資料格式不正確 (Gemini)。");
            }
        } else {
            if (result.choices && result.choices[0].message.content) {
                aiResponse = result.choices[0].message.content;
            } else {
                throw new Error("AI 回應的資料格式不正確 (OpenAI/Mistral/Grok)。");
            }
        }
        return aiResponse;
    },

    abortAICall() {
        if (this.currentAIController) {
            this.currentAIController.abort();
            console.log('AI request aborted by user.');

            const sendBtn = document.getElementById('ai-chat-send-btn');
            const input = document.getElementById('ai-chat-input');
            input.disabled = false;
            sendBtn.innerHTML = this.sendIconSVG;
            sendBtn.onclick = () => this.sendChatMessage();
            this.currentAIController = null;
        }
    },

    async sendChatMessage() {
        const input = document.getElementById('ai-chat-input');
        const sendBtn = document.getElementById('ai-chat-send-btn');
        const message = input.value.trim();

        if (!message && !this.attachedFile) return;
        if (this.isLoading) return;

        const selectedKeyName = MoodTracker.settings.selectedApiKeyName;
        const apiKeyEntry = MoodTracker.settings.apiKeys.find(k => k.name === selectedKeyName);
        if (!apiKeyEntry || !apiKeyEntry.value) {
            return alert('請先在「資料管理」頁面的「AI 設定」中新增並選擇一個有效的 AI API Key。');
        }

        const messagePayload = {
            message: message || `Analyze this file:${this.attachedFile.name}`,
            sender: 'user',
            file: this.attachedFile
        };

        this.addChatMessage(messagePayload, 'user');
        input.value = '';
        autoResizeTextarea(input);
        InputSaver.clear('ai-chat-input');
        this.clearAttachedFile();

        input.disabled = true;
        this.addChatMessage("AI 思考中", 'ai-loading');

        this.currentAIController = new AbortController();
        const signal = this.currentAIController.signal;

        sendBtn.innerHTML = this.stopIconSVG;
        sendBtn.onclick = () => this.abortAICall();
        sendBtn.disabled = false;

        try {
            const now = new Date();
            const currentTimeString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            const basePrompt = (MoodTracker.settings.aiPrompt || "") + `\n\n[System note] User sent this message at:${currentTimeString}。`;
            const finalPrompt = await this.prepareAIPrompt(basePrompt);
            const selectedModel = MoodTracker.settings.model || 'gemini-2.5-flash';

            const maxLen = (MoodTracker.settings.contextLength || 10) * 2;
            const recentHistory = this.chatHistory.length > maxLen
                ? this.chatHistory.slice(this.chatHistory.length - maxLen)
                : this.chatHistory;

            const historyForApi = recentHistory
                .filter(msg => msg.sender !== 'ai-loading')
                .map(msg => {
                    const role = msg.sender === 'user' ? 'user' : 'model';
                    const parts = [];
                    if (msg.message && typeof msg.message === 'string') {
                        parts.push({ text: msg.message });
                    }
                    if (msg.sender === 'user' && msg.file) {
                        if (!msg.file.type.startsWith('image/')) {
                            const fileText = atob(msg.file.content);
                            parts.push({ text: `\n\n <Attachment> ${msg.file.name} \n${fileText}\n </Attachment>` });
                        } else {
                            parts.push({
                                inlineData: {
                                    mimeType: msg.file.type,
                                    data: msg.file.content
                                }
                            });
                        }
                    }
                    return { role, parts };
                });

            let body = {};
            if (selectedModel.includes('gemini')) {
                body = {
                    contents: [
                        { role: "user", parts: [{ text: finalPrompt }] },
                        { role: "model", parts: [{ text: "OK." }] },
                        ...historyForApi
                    ]
                };
            } else {
                const openAIHistory = historyForApi.map(msg => {
                    const contentParts = msg.parts.map(part => {
                        if (part.text) return { type: "text", text: part.text };
                        if (part.inlineData) {
                            return {
                                type: "image_url",
                                image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }
                            };
                        }
                        return null;
                    }).filter(Boolean);
                    return { role: msg.role === 'model' ? 'assistant' : 'user', content: contentParts };
                });
                body = {
                    model: selectedModel,
                    messages: [
                        { role: 'system', content: finalPrompt },
                        ...openAIHistory
                    ]
                };
            }

            const aiResponse = await this._callAIAPI(apiKeyEntry.value, selectedModel, body, signal);
            this.addChatMessage(aiResponse, 'ai');

        } catch (error) {
            if (error.name === 'AbortError') {
                const abortedMessage = 'AI 回應已被您中斷。';
                this.addChatMessage(abortedMessage, 'ai');
            } else {
                console.error('AI API 請求失敗:', error);
                const errorMessage = `與 AI 連線時發生錯誤。\n錯誤詳情: ${error.message}\n`;
                this.addChatMessage(errorMessage, 'ai');
            }
        } finally {
            if (this.currentAIController) {
                input.disabled = false;
                sendBtn.disabled = false;
                sendBtn.innerHTML = this.sendIconSVG;
                sendBtn.onclick = () => this.sendChatMessage();
                this.currentAIController = null;
                input.focus();
            }
        }
    },

    async sendSystemMessage(systemInstruction) {
        if (!this.isWindowOpen) {
            this.toggleWindow();
        }

        const selectedKeyName = MoodTracker.settings.selectedApiKeyName;
        const apiKeyEntry = MoodTracker.settings.apiKeys.find(k => k.name === selectedKeyName);
        if (!apiKeyEntry || !apiKeyEntry.value) {
            console.warn("Proactive AI: 無法觸發，因為沒有設定有效的 API Key。");
            return;
        }

        this.addChatMessage("AI 思考中", 'ai-loading');

        try {
            const basePrompt = (MoodTracker.settings.aiPrompt || "") + "\n\n" + systemInstruction;
            const finalPrompt = await this.prepareAIPrompt(basePrompt);
            const selectedModel = MoodTracker.settings.model || 'gemini-2.5-flash';

            let body = {};
            const userMessage = "Respond naturally and contextually based on all received information."; //Prompt

            if (selectedModel.includes('gemini')) {
                body = { contents: [{ role: "user", parts: [{ text: finalPrompt + "\n\n" + userMessage }] }] };
            } else {
                body = {
                    model: selectedModel,
                    messages: [
                        { role: 'system', content: finalPrompt },
                        { role: 'user', content: userMessage }
                    ]
                };
            }

            const aiResponse = await this._callAIAPI(apiKeyEntry.value, selectedModel, body, new AbortController().signal);
            this.addChatMessage(aiResponse, 'ai');

        } catch (error) {
            console.error('主動式 AI 請求失敗:', error);
            const errorMessage = `抱歉，AI 主動觸發時發生錯誤。\n錯誤詳情: ${error.message}`;
            this.addChatMessage(errorMessage, 'ai');
        }
    },

    exportData() {
        if (this.chatHistory.length === 0) {
            return alert('沒有 AI 聊天記錄可供匯出。');
        }
        const dataStr = JSON.stringify({ floatingChatHistory: this.chatHistory }, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai_chat_history_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        alert('AI 聊天記錄匯出成功！');
    },
};

// --- 心情追蹤模組 ---
const MoodTracker = {
    getLocalDateString(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },
    moodData: [],
    draggedItemId: null,
    dragOverItemId: null,
    settings: {
        apiKeys: [],
        selectedApiKeyName: '',
        model: "gemini-2.5-flash",
        aiPrompt: "",
        customTags: [],
        contextLength: 10,
        pinnedEntryIds: [],
        aiDataDays: 1,
    },
    defaultTags: ['快樂', '感恩', '平靜', '疲憊', '壓力'],

    async init() {
        await this.loadData();
        this.loadSettingsToUI();
        this.updateAllMoodTagUIs();
        this.renderCustomTagsList();
        this.updateYesterdayReview();
        this.renderPinnedNotes();

        document.getElementById('general-mood-image').addEventListener('change', (e) => this.handleImagePreview(e));
        const moodContentTextarea = document.getElementById('general-mood-content');
        if (moodContentTextarea) {
            moodContentTextarea.addEventListener('paste', (e) => this.handlePaste(e));
        }
        document.getElementById('add-api-key-btn').addEventListener('click', () => this.addApiKey());
        document.getElementById('delete-api-key-btn').addEventListener('click', () => this.deleteSelectedApiKey());
        document.getElementById('note-type-selector').addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                document.querySelectorAll('#note-type-selector .btn-pin').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
            }
        });

        document.getElementById('general-mood-tags').addEventListener('click', (e) => {
            if (e.target.classList.contains('mood-tag')) {
                e.target.classList.toggle('selected');
            }
        });
    },

    loadSettingsToUI() {
        if (this.settings) {
            const apiKeySelect = document.getElementById('api-key-select');
            apiKeySelect.innerHTML = '';
            if (this.settings.apiKeys && this.settings.apiKeys.length > 0) {
                this.settings.apiKeys.forEach(key => {
                    const option = document.createElement('option');
                    option.value = key.name;
                    option.textContent = key.name;
                    apiKeySelect.appendChild(option);
                });
                apiKeySelect.value = this.settings.selectedApiKeyName || this.settings.apiKeys[0].name;
            } else {
                const option = document.createElement('option');
                option.textContent = '尚未新增任何 API Key';
                option.disabled = true;
                apiKeySelect.appendChild(option);
            }

            document.getElementById('ai-prompt').value = this.settings.aiPrompt || `你是一個富含創意的陪伴型AI助手，你能精準的掌握使用者的需求與愛好，陪伴使用者用輕鬆但又自律的方式完成每日計畫，能夠適當督促使用者的作息與健康還有任務。
    - 語言需求：使用繁體中文，台灣用語。日常回應大約100-150個字，分析與知識類型大約800字以內。
    - 語言風格：幽默，語言自然且貼近朋友，不須討好與安慰。
    - 使用者稱呼：
    - 使用者資訊：
    - {{mood}}
    - {{habits}}
    - {{schedule}}
    - 可以將對話當前時間與以上記錄時間還有數據都考慮進去，若是遇到節日等等也能主動展現出特殊對話。`;
            document.getElementById('ai-model-select').value = this.settings.model || "gemini-2.5-flash";
            document.getElementById('context-length').value = this.settings.contextLength || 10;
            document.getElementById('ai-data-days').value = this.settings.aiDataDays || 1;
        }
    },

    async loadData() {
        try {
            this.moodData = await DBHelper.getAll('moods') || [];

            const storedSettings = await DBHelper.get('appState', 'moodTrackerSettings');
            if (storedSettings) {
                this.settings = { ...this.settings, ...storedSettings.value };
            }
        } catch (error) {
            console.error('從 IndexedDB 載入資料時發生錯誤:', error);
            this.moodData = [];
        }
    },

    async saveData() {
        try {
            await DBHelper.saveAll('moods', this.moodData);
        } catch (error) {
            console.error('儲存資料到 IndexedDB 時發生錯誤:', error);
        }
    },

    async _saveSettingsData() {
        await DBHelper.put('appState', { key: 'moodTrackerSettings', value: this.settings });
    },

    async saveSettings() {
        const selectedKeyName = document.getElementById('api-key-select').value;
        if (selectedKeyName) {
            this.settings.selectedApiKeyName = selectedKeyName;
        }

        this.settings.aiPrompt = document.getElementById('ai-prompt').value;
        this.settings.model = document.getElementById('ai-model-select').value;
        this.settings.contextLength = parseInt(document.getElementById('context-length').value, 10) || 10;
        this.settings.aiDataDays = parseInt(document.getElementById('ai-data-days').value, 10) || 1;

        await this._saveSettingsData();
        alert('設定已儲存！');
    },

    async addApiKey() {
        const nameInput = document.getElementById('new-api-key-name');
        const valueInput = document.getElementById('new-api-key-value');
        const name = nameInput.value.trim();
        const value = valueInput.value.trim();

        if (!name || !value) {
            return alert('Key 的名稱和值都不能為空！');
        }
        if (!this.settings.apiKeys) {
            this.settings.apiKeys = [];
        }
        if (this.settings.apiKeys.some(k => k.name === name)) {
            return alert('此名稱已被使用，請換一個。');
        }

        this.settings.apiKeys.push({ name, value });

        if (this.settings.apiKeys.length === 1) {
            this.settings.selectedApiKeyName = name;
        }

        await this._saveSettingsData();
        this.loadSettingsToUI();
        nameInput.value = '';
        valueInput.value = '';
        alert(`API Key "${name}" 已成功新增！`);
    },

    async deleteSelectedApiKey() {
        const select = document.getElementById('api-key-select');
        const nameToDelete = select.value;

        if (!nameToDelete || select.options[select.selectedIndex]?.disabled) {
            return alert('沒有可刪除的 Key。');
        }
        if (confirm(`確定要刪除 API Key "${nameToDelete}" 嗎？`)) {
            this.settings.apiKeys = this.settings.apiKeys.filter(k => k.name !== nameToDelete);

            if (this.settings.selectedApiKeyName === nameToDelete) {
                this.settings.selectedApiKeyName = this.settings.apiKeys.length > 0 ? this.settings.apiKeys[0].name : '';
            }

            await this._saveSettingsData();
            this.loadSettingsToUI();
            alert(`API Key "${nameToDelete}" 已被刪除。`);
        }
    },
    updateAllMoodTagUIs() {
        const allTags = [...this.defaultTags, ...(this.settings.customTags || [])];
        const generalTagsContainer = document.getElementById('general-mood-tags');

        generalTagsContainer.innerHTML = '';

        allTags.forEach(tag => {
            const tagButton = `<button class="mood-tag" data-mood="${tag}">${tag}</button>`;
            generalTagsContainer.innerHTML += tagButton;
        });
    },

    updateYesterdayReview() {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        const yesterdayEntries = this.moodData.filter(entry => entry.date === yesterdayStr)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const reviewDiv = document.getElementById('yesterday-review');
        if (yesterdayEntries.length === 0) {
            reviewDiv.innerHTML = '<p>暫無昨日記錄</p>';
            return;
        }

        let html = '';
        yesterdayEntries.forEach(entry => {
            html += `
                            <div style="margin-bottom: 15px; font-size: 0.9rem;">
                                <strong>${entry.type === 'morning' ? '☀️ 起床' : (entry.type === 'evening' ? '🌙 睡前' : '📝 筆記')} (${entry.time})</strong>
                                <div>${entry.moods.map(m => `<span class="mood-tag selected" style="font-size:0.8rem; padding: 2px 8px; cursor:default;">${m}</span>`).join(' ')}</div>
                                <div style="margin-top: 5px; color: var(--secondary-font); word-break: break-all;">${DOMPurify.sanitize(marked.parse(entry.content))}</div>
                            </div>
                        `;
        });
        reviewDiv.innerHTML = html;
    },

    async saveGeneralEntry() {
        const contentEl = document.getElementById('general-mood-content');
        const content = contentEl.value.trim();
        const imageInput = document.getElementById('general-mood-image');
        const file = imageInput.files[0];

        if (!content && !file) return alert('請輸入筆記內容或附加一張圖片');

        const tagsContainer = document.getElementById('general-mood-tags');
        const selectedMoods = [...tagsContainer.querySelectorAll('.mood-tag.selected')].map(tag => tag.dataset.mood);

        const activeButton = document.querySelector('#note-type-selector .btn-pin.active');
        if (!activeButton) {
            alert('請先選擇筆記類型 (例如：起床、睡前或筆記)。');
            return;
        }
        const type = activeButton.dataset.type;

        const now = new Date();
        const entry = {
            id: now.getTime(),
            date: this.getLocalDateString(now),
            time: now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
            type: type,
            moods: selectedMoods,
            content: content,
            timestamp: now.toISOString(),
            file: null
        };

        if (file) {
            try {
                entry.file = await this.readFileAsBase64(file);
            } catch (error) {
                console.error("圖片讀取失敗:", error);
                alert("圖片讀取失敗，請稍後再試。");
                return;
            }
        }

        this.moodData.unshift(entry);
        this.saveData();

        InputSaver.clear('general-mood-content');
        contentEl.value = '';
        tagsContainer.querySelectorAll('.mood-tag.selected').forEach(tag => tag.classList.remove('selected'));
        imageInput.value = '';
        document.getElementById('general-mood-image-preview').innerHTML = '';

        alert(`類型為「${type}」的筆記已儲存！`);

        ProactiveAIManager.checkTriggers({ type: 'MOOD_ENTRY_SAVED' });

        this.updateYesterdayReview();
        this.renderPinnedNotes();
    },

    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
                name: file.name,
                type: file.type,
                data: reader.result
            });
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    },

    async deleteNoteImage(entryId, fromReviewPage = false) {
        if (!confirm("確定要刪除這張圖片嗎？")) return;
        const entry = this.moodData.find(e => e.id === entryId);

        if (entry) {
            if (!entry.content || entry.content.trim() === '') {
                if (confirm("這則筆記沒有文字內容，刪除圖片將會一併刪除整則筆記。確定嗎？")) {
                    await this.deleteEntry(entryId);
                    this.renderPinnedNotes();
                    if (fromReviewPage && selectedDateForReview) {
                        this.loadReviewData(selectedDateForReview);
                    }
                    ImageMemory.render();
                    return;
                } else {
                    return;
                }
            }

            entry.file = null;
            await this.saveData();
            alert("圖片已刪除。");

            this.renderPinnedNotes();
            if (fromReviewPage && selectedDateForReview) {
                this.loadReviewData(selectedDateForReview);
            }
        }
    },

    handleImagePreview(event) {
        const previewContainer = document.getElementById('general-mood-image-preview');
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                previewContainer.innerHTML = `
                <div class="note-image-preview-container">
                    <img src="${e.target.result}" class="note-image-preview" alt="Image Preview">
                    <button class="delete-image-btn" style="top:5px; right:5px;" onclick="document.getElementById('general-mood-image').value=''; document.getElementById('general-mood-image-preview').innerHTML='';">×</button>
                </div>
            `;
            }
            reader.readAsDataURL(file);
        } else {
            previewContainer.innerHTML = '';
        }
    },
    handlePaste(event) {
        const items = event.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const file = items[i].getAsFile();

                const imageInput = document.getElementById('general-mood-image');

                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                imageInput.files = dataTransfer.files;

                imageInput.dispatchEvent(new Event('change', { bubbles: true }));

                event.preventDefault();
                break;
            }
        }
    },

    async deleteEntry(id) {
        const entryDate = this.moodData.find(e => e.id === id)?.date;
        this.moodData = this.moodData.filter(entry => entry.id !== id);
        await this.saveData();
        await this.togglePinEntry(id, true);
        if (!FloatingSearch.isWindowOpen) {
            alert('筆記已刪除。');
            this.renderCalendar();
            if (selectedDateForReview === entryDate) {
                this.loadReviewData(entryDate);
            }
        }
    },

    editEntry(id) {
        const entry = this.moodData.find(e => e.id === id);
        if (!entry) return;

        const entryElement = document.querySelector(`.review-entry[data-id="${id}"]`);
        if (!entryElement) return;

        entryElement.classList.add('is-editing', 'unified-edit-container');

        const allTags = [...this.defaultTags, ...(this.settings.customTags || [])];
        let tagsHtml = allTags.map(tag => {
            const isSelected = entry.moods.includes(tag);
            return `<button class="mood-tag ${isSelected ? 'selected' : ''}" data-mood="${tag}">${tag}</button>`;
        }).join('');

        const editFormHTML = `
                        <div class="edit-mode-form">
                            <div class="mood-tags" style="margin: 10px 0;">${tagsHtml}</div>
                            <textarea class="input-field" style="width: 100%; min-height: 100px;">${entry.content}</textarea>
                        </div>
                        `;

        const newButtonsHTML = `
                        <div class="view-mode-controls">
                            <button class="btn-pin" onclick="MoodTracker.editEntry(${id})">✏️</button>
                            <button class="btn-pin ${this.settings.pinnedEntryIds.includes(id) ? 'pinned' : ''}" onclick="MoodTracker.togglePinEntry(${id})">${this.settings.pinnedEntryIds.includes(id) ? '📌' : '📌'}</button>
                            <button class="btn-delete" onclick="MoodTracker.deleteEntry(${id})">🗑️</button>
                        </div>
                        <div class="edit-mode-controls">
                            <button class="btn-save-unified" onclick="MoodTracker.saveEditedEntry(${id})">💾</button>
                            <button class="btn-cancel-unified" onclick="MoodTracker.loadReviewData('${entry.date}')">❌</button>
                        </div>
                        `;

        const contentContainer = entryElement.querySelector('div:first-child');
        if (!contentContainer) return;

        contentContainer.innerHTML = `
        <div class="edit-mode-form">
            <div class="mood-tags" style="margin: 10px 0;">${tagsHtml}</div>
            <textarea class="input-field" style="width: 100%; min-height: 100px;">${entry.content}</textarea>
        </div>
    `;

        const actionsDiv = entryElement.querySelector('.review-entry-actions');
        actionsDiv.innerHTML = newButtonsHTML;

        const newTextarea = entryElement.querySelector('.edit-mode-form textarea');
        newTextarea.addEventListener('input', () => autoResizeTextarea(newTextarea));
        autoResizeTextarea(newTextarea);

        entryElement.querySelector('.edit-mode-form .mood-tags').addEventListener('click', (e) => {
            if (e.target.classList.contains('mood-tag')) {
                e.target.classList.toggle('selected');
            }
        });
    },

    saveEditedEntry(id) {
        const entryIndex = this.moodData.findIndex(e => e.id === id);
        if (entryIndex === -1) return;

        const entryElement = document.querySelector(`.review-entry[data-id="${id}"]`);
        if (!entryElement) return;

        const newContent = entryElement.querySelector('.edit-mode-form textarea').value.trim();
        if (!newContent) return alert('筆記內容不可為空！');

        const selectedTags = [...entryElement.querySelectorAll('.edit-mode-form .mood-tag.selected')].map(tag => tag.dataset.mood);

        this.moodData[entryIndex].content = newContent;
        this.moodData[entryIndex].moods = selectedTags;

        this.saveData();
        alert('筆記已更新！');
        this.loadReviewData(this.moodData[entryIndex].date);
        this.renderPinnedNotes();
    },

    renderCalendar() {
        const calendarView = document.getElementById('calendar-view');
        calendarView.innerHTML = '';
        const year = currentReviewDate.getFullYear();
        const month = currentReviewDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        ['日', '一', '二', '三', '四', '五', '六'].forEach(day => {
            calendarView.innerHTML += `<div class="calendar-header">${day}</div>`;
        });

        for (let i = 0; i < firstDay; i++) {
            calendarView.innerHTML += `<div class="calendar-day other-month"></div>`;
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const hasEntry = this.moodData.some(entry => entry.date === dateStr);
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            if (hasEntry) dayEl.classList.add('has-entry');
            dayEl.textContent = i;
            dayEl.dataset.date = dateStr;
            dayEl.onclick = () => {
                this.loadReviewData(dateStr);
                document.querySelectorAll('.calendar-day.selected').forEach(d => d.classList.remove('selected'));
                dayEl.classList.add('selected');
            };
            calendarView.appendChild(dayEl);
        }
        this.loadReviewData(null);
    },

    async loadReviewData(date) {
        selectedDateForReview = date;
        const reviewContent = document.getElementById('review-content');
        const summaryCard = document.getElementById('daily-summary-card');
        const summaryContent = document.getElementById('daily-summary-content');
        const summaryTitle = document.getElementById('summary-date-title');

        if (!date) {
            reviewContent.innerHTML = '<p>請從上方月曆選擇日期查看記錄。</p>';
            summaryCard.style.display = 'none';
            return;
        }

        summaryCard.style.display = 'block';
        summaryTitle.textContent = date;
        summaryContent.innerHTML = '<p>正在為你匯總資料...</p>';
        summaryContent.style.display = 'block';

        let summaryHTML = '<ul style="list-style-type: none; padding-left: 0;">';

        const allTasks = await DBHelper.getAll('tasks') || [];
        const dailyTasks = allTasks.filter(task => task.date === date);

        try {
            const workTimeRecords = await DBHelper.getAll('workTimeRecords') || [];
            const dailyWorkRecords = workTimeRecords.filter(r => r.date === date);
            const totalWorkMs = dailyWorkRecords.reduce((acc, curr) => acc + (curr.duration || 0), 0);
            if (totalWorkMs > 0) {
                summaryHTML += `<li style="margin-bottom: 10px;"><strong>⏰ 打卡總時數：</strong> ${(totalWorkMs / 3600000).toFixed(2)} 小時</li>`;
            } else {
                summaryHTML += `<li style="margin-bottom: 10px;"><strong>⏰ 打卡總時數：</strong> 當日無記錄</li>`;
            }
        } catch (e) { console.error("抓取打卡時數失敗:", e); }

        try {
            const allHabits = await DBHelper.getAll('habits') || [];
            const completedHabits = allHabits.filter(h => h.checkIns.some(ts => new Date(ts).toLocaleDateString('sv-SE') === date)).map(h => h.name);
            if (completedHabits.length > 0) {
                summaryHTML += `<li style="margin-bottom: 10px;"><strong>🌱 完成的習慣：</strong> ${completedHabits.join('、')}</li>`;
            } else {
                summaryHTML += `<li style="margin-bottom: 10px;"><strong>🌱 完成的習慣：</strong> 當日無記錄</li>`;
            }
        } catch (e) { console.error("抓取習慣資料失敗:", e); }

        if (dailyTasks.length > 0) {
            const completedCount = dailyTasks.filter(t => t.completed).length;
            const totalCount = dailyTasks.length;

            summaryHTML += `
                    <li onclick="toggleTaskVisibility()" style="cursor: pointer; margin-bottom: 5px;">
                        <strong>📝 時間表安排 (共 ${totalCount} 項，完成 ${completedCount} 項) <span id="task-toggle-icon">▶</span></strong>
                    </li>
                `;

            let tasksListHTML = '';
            dailyTasks.sort((a, b) => a.time.localeCompare(b.time)).forEach(task => {
                const statusIcon = task.completed ? '✔' : '❌';
                tasksListHTML += `<li style="margin-bottom: 5px;">[${task.time}] ${task.content} [${task.quadrant}] ${statusIcon}</li>`;
            });
            summaryHTML += `
                    <li id="task-list-content" style="display: none; padding-left: 25px;">
                        <ul style="margin: 0; padding-left:0; list-style-position: inside;">${tasksListHTML}</ul>
                    </li>
                `;

        } else {
            summaryHTML += `<li style="margin-bottom: 10px;"><strong>📝 時間表安排：</strong> 當日無任務</li>`;
        }

        const entries = this.moodData.filter(entry => entry.date === date);

        try {
            const dailyCompletedTasks = dailyTasks.filter(task => task.completed);
            const quadrantScores = { 'A': 4, 'B': 3, 'C': 2, 'D': 1 };
            const totalScore = dailyCompletedTasks.reduce((sum, task) => sum + (quadrantScores[task.quadrant] || 0), 0);

            if (dailyCompletedTasks.length > 0) {
                summaryHTML += `<li style="margin-bottom: 10px;"><strong>📅 任務總得分：</strong> ${totalScore} 分</li>`;
            } else {
                summaryHTML += `<li style="margin-bottom: 10px;"><strong>📅 任務總得分：</strong> 當日無完成任務</li>`;
            }
        } catch (e) {
            console.error("抓取任務分數失敗:", e);
        }

        if (entries.length > 0) {
            let score = 0, moodCount = 0;
            const moodValue = { '快樂': 5, '感恩': 4, '平靜': 3, '疲憊': 2, '壓力': -2 };
            entries.forEach(entry => entry.moods.forEach(mood => {
                score += (moodValue[mood] || 3);
                moodCount++;
            }));
            if (moodCount > 0) {
                summaryHTML += `<li style="margin-top: 10px;"><strong>💖 心情指數：</strong> ${(score / moodCount).toFixed(1)} / 5.0</li>`;
            } else {
                summaryHTML += `<li style="margin-top: 10px;"><strong>💖 心情指數：</strong> 當日無心情標籤</li>`;
            }
        } else {
            summaryHTML += `<li style="margin-top: 10px;"><strong>💖 心情指數：</strong> 當日無筆記</li>`;
        }

        summaryHTML += '</ul>';
        summaryContent.innerHTML = summaryHTML;

        if (entries.length === 0) {
            reviewContent.innerHTML = '<h4>筆記詳情</h4><p>該日期沒有筆記記錄。</p>';
            return;
        }
        let html = `<h4>筆記詳情</h4>`;

        entries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).forEach(entry => {
            const isPinned = this.settings.pinnedEntryIds.includes(entry.id);

            let imageHtml = '';
            if (entry.file && entry.file.data) {
                imageHtml = `
            <div class="note-image-preview-container">
                <img src="${entry.file.data}" class="note-image-preview" alt="${entry.file.name}" style="cursor:pointer;" onclick="ImageMemory.showModal(${entry.id})">
                <button class="delete-image-btn" onclick="MoodTracker.deleteNoteImage(${entry.id}, true)">×</button>
            </div>
        `;
            }

            html += `
        <div class="review-entry" data-id="${entry.id}">
            <div>
                <strong>${entry.type === 'morning' ? '☀️ 起床' : (entry.type === 'evening' ? '🌙 睡前' : '📝 筆記')} (${entry.time})</strong>
                <div style="margin: 5px 0;">
                    ${entry.moods.map(m => `<button class="mood-tag selected" style="cursor:pointer;" onclick="MoodTracker.findEntriesByTag('${m}')">${m}</button>`).join(' ')}
                </div>
                <div style="color: var(--font-color); margin-top: 8px;">${DOMPurify.sanitize(marked.parse(entry.content))}</div>
                ${imageHtml}
            </div>
            <div class="review-entry-actions">
                <button class="btn-pin ${isPinned ? 'pinned' : ''}" onclick="MoodTracker.togglePinEntry(${entry.id})">📌</button>
                <button class="btn-pin" onclick="MoodTracker.editEntry(${entry.id})">✏️</button>
                <button class="btn-delete" onclick="MoodTracker.deleteEntry(${entry.id})">🗑️</button>
            </div>
        </div>
    `;
        });
        reviewContent.innerHTML = html;
    },

    renderMoodChart() {
        const ctx = document.getElementById('mood-chart')?.getContext('2d');
        if (!ctx) return;
        if (moodChartInstance) moodChartInstance.destroy();

        const year = currentReviewDate.getFullYear();
        const month = currentReviewDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const labels = Array.from({ length: daysInMonth }, (_, i) => `${month + 1}/${i + 1}`);

        Promise.all([
            DBHelper.getAll('moods'),
            DBHelper.getAll('habits'),
            DBHelper.getAll('tasks')
        ]).then(([allMoods, allHabits, allTasks]) => {

            const dailyMoodScores = [];
            const dailyHabitCounts = [];
            const dailyTaskScores = [];

            const moodValueMap = { '快樂': 5, '感恩': 4, '平靜': 3, '疲憊': 1, '壓力': -2 };
            const quadrantScoreMap = { 'A': 4, 'B': 3, 'C': 2, 'D': 1 };

            for (let i = 1; i <= daysInMonth; i++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;

                const dayEntries = allMoods.filter(entry => entry.date === dateStr);
                if (dayEntries.length > 0) {
                    let score = 0, moodCount = 0;
                    dayEntries.forEach(entry => entry.moods.forEach(mood => {
                        score += (moodValueMap[mood] || 0);
                        moodCount++;
                    }));
                    dailyMoodScores.push(moodCount > 0 ? score / moodCount : null);
                } else {
                    dailyMoodScores.push(null);
                }

                const completedHabitsOnDay = allHabits.filter(h => h.checkIns.some(ts => new Date(ts).toISOString().split('T')[0] === dateStr)).length;
                dailyHabitCounts.push(completedHabitsOnDay > 0 ? completedHabitsOnDay : null);

                const completedTasksOnDay = allTasks.filter(t => t.date === dateStr && t.completed);
                const scoreOnDay = completedTasksOnDay.reduce((sum, task) => sum + (quadrantScoreMap[task.quadrant] || 0), 0);
                dailyTaskScores.push(scoreOnDay > 0 ? scoreOnDay : null);
            }

            moodChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            type: 'line',
                            label: '心情指數',
                            data: dailyMoodScores,
                            borderColor: 'rgba(90, 110, 224, 1)',
                            backgroundColor: 'rgba(90, 110, 224, 0.2)',
                            fill: true,
                            tension: 0.3,
                            yAxisID: 'y1',
                            spanGaps: true
                        },
                        {
                            type: 'bar',
                            label: '任務得分',
                            data: dailyTaskScores,
                            backgroundColor: 'rgba(255, 129, 129, 0.7)',
                            yAxisID: 'y',
                            stack: 'achievements'
                        },
                        {
                            type: 'bar',
                            label: '完成習慣數',
                            data: dailyHabitCounts,
                            backgroundColor: 'rgba(43, 165, 124, 0.7)',
                            yAxisID: 'y',
                            stack: 'achievements'
                        },
                    ]
                },
                options: {
                    responsive: true,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                        },
                        title: {
                            display: true,
                            text: `${year}年 ${month + 1}月 綜合數據`
                        }
                    },
                    scales: {
                        x: {
                            stacked: true,
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: '分數 / 數量'
                            },
                            stacked: true
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            min: 1,
                            max: 5,
                            title: {
                                display: true,
                                text: '心情指數 (1-5)'
                            },
                            grid: {
                                drawOnChartArea: false,
                            },
                        }
                    }
                }
            });
        });
    },

    async togglePinEntry(id, forceUnpin = false) {
        if (!this.settings.pinnedEntryIds) this.settings.pinnedEntryIds = [];
        const pinIndex = this.settings.pinnedEntryIds.indexOf(id);

        if (forceUnpin) {
            if (pinIndex > -1) this.settings.pinnedEntryIds.splice(pinIndex, 1);
        } else {
            if (pinIndex > -1) {
                this.settings.pinnedEntryIds.splice(pinIndex, 1);
            } else {
                this.settings.pinnedEntryIds.unshift(id);
            }
        }

        await DBHelper.put('appState', { key: 'moodTrackerSettings', value: this.settings });
        this.renderPinnedNotes();
        if (selectedDateForReview) {
            this.loadReviewData(selectedDateForReview);
        }
    },

    renderPinnedNotes() {
        const container = document.getElementById('pinned-notes-content');
        const pinnedIds = this.settings.pinnedEntryIds || [];

        if (pinnedIds.length === 0) {
            container.innerHTML = '<p>沒有釘選的筆記。</p>';
            return;
        }

        const pinnedEntries = pinnedIds.map(id => this.moodData.find(entry => entry.id === id)).filter(Boolean);

        let html = '';
        pinnedEntries.forEach(entry => {
            const previewText = entry.content.replace(/<[^>]*>/g, '').substring(0, 40) + (entry.content.length > 40 ? '...' : '');
            html += `
    <div class="pinned-item-wrapper" draggable="true" data-id="${entry.id}" style="display: flex; flex-direction:column; gap: 0; margin-bottom: 5px;">
         <div class="drop-indicator top"></div>
        <div style="display: flex; align-items: center; gap: 8px;">
            <div class="review-entry pinned-note" id="pinned-note-${entry.id}" onclick="togglePinnedNoteView(${entry.id})" style="flex-grow: 1; margin-bottom: 0;">
                <div class="pinned-note-header">
                    <strong>${entry.date} (${entry.type === 'morning' ? '☀️' : (entry.type === 'evening' ? '🌙' : '📝')})</strong>
                </div>
                <div class="pinned-note-preview">
                    <p>${previewText}</p>
                </div>
                <div class="pinned-note-full" style="display: none;">
                    <div>${DOMPurify.sanitize(marked.parse(entry.content))}</div>
                </div>
            </div>
            <button class="btn-pin pinned" style="flex-shrink: 0;" onclick="event.stopPropagation(); MoodTracker.togglePinEntry(${entry.id})">📌</button>
        </div>
        <div class="drop-indicator bottom"></div>
    </div>
`;
        });
        container.innerHTML = html;
        this.addDragDropListeners();
    },

    findEntriesByTag(tagName) {
        FloatingSearch.openWindow();

        const foundEntries = this.moodData
            .filter(entry => entry.moods.includes(tagName))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const title = `標籤 "${tagName}" 的搜尋結果`;

        if (foundEntries.length === 0) {
            FloatingSearch.render(title, '<p>找不到包含此標籤的筆記。</p>');
            return;
        }
        let html = '';
        foundEntries.forEach(entry => {
            html += `
            <div class="review-entry" style="margin-bottom: 15px;">
                <div>
                    <strong>${entry.date} - ${entry.type === 'morning' ? '☀️ 起床' : (entry.type === 'evening' ? '🌙 睡前' : '📝 筆記')} (${entry.time})</strong>
                    <div style="margin: 5px 0;">${entry.moods.map(m => `<span class="mood-tag selected" style="cursor:default;">${m}</span>`).join(' ')}</div>
                    <div style="margin-top: 8px;">${DOMPurify.sanitize(marked.parse(entry.content))}</div>
                </div>
            </div>`;
        });
        FloatingSearch.render(title, html);
    },

    async addCustomTag() {
        const input = document.getElementById('custom-tag-input');
        const tagName = input.value.trim();
        if (!tagName) return alert('請輸入標籤名稱');

        const allTags = [...this.defaultTags, ...(this.settings.customTags || [])];
        if (allTags.includes(tagName)) return alert('標籤已存在');

        if (!this.settings.customTags) this.settings.customTags = [];
        this.settings.customTags.push(tagName);
        await this._saveSettingsData();

        InputSaver.clear('custom-tag-input');

        this.updateAllMoodTagUIs();
        this.renderCustomTagsList();
        input.value = '';
        alert('新標籤已新增！');
    },

    async deleteCustomTag(tagName) {
        if (confirm(`確定要刪除標籤 "${tagName}" 嗎？`)) {
            this.settings.customTags = this.settings.customTags.filter(t => t !== tagName);
            await this._saveSettingsData();
            this.updateAllMoodTagUIs();
            this.renderCustomTagsList();
            alert('標籤已刪除！');
        }
    },

    renderCustomTagsList() {
        const listDiv = document.getElementById('custom-tags-list');
        const customTags = this.settings.customTags || [];
        if (customTags.length === 0) {
            listDiv.innerHTML = '<p>目前沒有自訂標籤。</p>';
            return;
        }
        listDiv.innerHTML = customTags.map(tag => `
                        <div class="custom-tag-item">
                            <span>${tag}</span>
                            <button class="btn-delete" onclick="MoodTracker.deleteCustomTag('${tag}')"><svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-tags-off" width="20" height="20" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <path d="M6 6h-.975a2.025 2.025 0 0 0 -2.025 2.025v2.834c0 .537 .213 1.052 .593 1.432l6.116 6.116a2.025 2.025 0 0 0 2.864 0l2.834 -2.834c.028 -.028 .055 -.056 .08 -.085" />
                                <path d="M17.573 18.407l.418 -.418m2 -2l.419 -.419a2.025 2.025 0 0 0 0 -2.864l-7.117 -7.116" />
                                <path d="M6 9h-.01" />
                                <path d="M3 3l18 18" />
                                </svg></button>
                        </div>
                    `).join('');
    },

    exportData() {
        if (this.moodData.length === 0) return alert('沒有心情資料可供匯出');
        const dataStr = JSON.stringify({ moodData: this.moodData, settings: this.settings }, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mood_tracker_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (confirm('匯入資料將【覆蓋】現有所有心情記錄與設定，確定嗎？')) {
                    if (data.moodData && Array.isArray(data.moodData)) this.moodData = data.moodData;
                    if (data.settings && typeof data.settings === 'object') this.settings = { ...this.settings, ...data.settings };

                    await this.saveData();
                    await DBHelper.put('appState', { key: 'moodTrackerSettings', value: this.settings });

                    alert('資料匯入成功！頁面將重新整理。');
                    location.reload();
                }
            } catch (error) {
                alert('檔案格式錯誤或已損毀。');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    },

    addDragDropListeners() {
        const container = document.getElementById('pinned-notes-content');
        if (!container) return;

        container.addEventListener('dragstart', (e) => this.handleDragStart(e));
        container.addEventListener('dragover', (e) => this.handleDragOver(e));
        container.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        container.addEventListener('drop', (e) => this.handleDrop(e));
        container.addEventListener('dragend', (e) => this.handleDragEnd(e));
    },

    handleDragStart(e) {
        const target = e.target.closest('.pinned-item-wrapper');
        if (target) {
            this.draggedItemId = target.dataset.id;
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => {
                target.classList.add('dragging');
            }, 0);
        }
    },

    handleDragOver(e) {
        e.preventDefault();
        const target = e.target.closest('.pinned-item-wrapper');
        if (!target || target.dataset.id === this.draggedItemId) return;

        document.querySelectorAll('.pinned-item-wrapper').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        });

        target.classList.add('drag-over');

        const rect = target.getBoundingClientRect();
        const isAfter = e.clientY > rect.top + rect.height / 2;

        if (isAfter) {
            target.classList.add('drag-over-bottom');
        } else {
            target.classList.add('drag-over-top');
        }
    },

    handleDragLeave(e) {
        const target = e.target.closest('.pinned-item-wrapper');
        if (target) {
            target.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        }
    },

    async handleDrop(e) {
        e.preventDefault();
        const dropTarget = e.target.closest('.pinned-item-wrapper');
        if (!dropTarget || !this.draggedItemId) return;

        const draggedId = parseInt(this.draggedItemId);
        const targetId = parseInt(dropTarget.dataset.id);

        if (draggedId === targetId) return;

        const ids = this.settings.pinnedEntryIds;
        const draggedIndex = ids.indexOf(draggedId);
        let targetIndex = ids.indexOf(targetId);

        if (draggedIndex === -1 || targetIndex === -1) return;

        const rect = dropTarget.getBoundingClientRect();
        const isAfter = e.clientY > rect.top + rect.height / 2;

        const [draggedItem] = ids.splice(draggedIndex, 1);

        targetIndex = ids.indexOf(targetId);

        if (isAfter) {
            ids.splice(targetIndex + 1, 0, draggedItem);
        } else {
            ids.splice(targetIndex, 0, draggedItem);
        }

        await this._saveSettingsData();
        document.querySelectorAll('.pinned-item-wrapper').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        });
        this.renderPinnedNotes();
    },

    handleDragEnd(e) {
        const target = e.target.closest('.pinned-item-wrapper');
        if (target) target.classList.remove('dragging');
        document.querySelectorAll('.pinned-item-wrapper.drag-over-top, .pinned-item-wrapper.drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        this.draggedItemId = null;
    }
};

// --- 用於控制綜合觀察中時間表清單的顯示/隱藏 ---
function toggleTaskVisibility() {
    const content = document.getElementById('task-list-content');
    const icon = document.getElementById('task-toggle-icon');

    if (content && icon) {
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '▼';
        } else {
            content.style.display = 'none';
            icon.textContent = '▶';
        }
    }
}

// --- 圖像記憶模組 ---
const ImageMemory = {
    render() {
        const gallery = document.getElementById('image-gallery-container');
        const notesWithImages = MoodTracker.moodData
            .filter(note => note.file && note.file.data)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (notesWithImages.length === 0) {
            gallery.innerHTML = '<p>目前沒有任何圖片記錄。</p>';
            return;
        }

        gallery.innerHTML = notesWithImages.map(note => `
            <div class="gallery-item" onclick="ImageMemory.showModal(${note.id})">
                <img src="${note.file.data}" alt="${note.file.name}" loading="lazy">
                <div class="overlay">${note.date}</div>
            </div>
        `).join('');
    },

    showModal(noteId) {
        const modal = document.getElementById('image-modal');
        const note = MoodTracker.moodData.find(n => n.id === noteId);
        if (!note) return;

        document.getElementById('modal-image').src = note.file.data;

        document.getElementById('delete-modal-image-btn').onclick = () => this.deleteModalImage(noteId);
        document.getElementById('edit-modal-note-btn').onclick = () => this.toggleEditMode(noteId, true);
        document.getElementById('save-modal-note-btn').onclick = () => this.saveEditedNote(noteId);
        document.getElementById('cancel-modal-note-btn').onclick = () => this.toggleEditMode(noteId, false);

        this.toggleEditMode(noteId, false);

        modal.classList.remove('hidden');
    },

    toggleEditMode(noteId, isEditing) {
        const modal = document.getElementById('image-modal');
        const note = MoodTracker.moodData.find(n => n.id === noteId);
        if (!note) return;

        const contentContainer = document.getElementById('modal-note-content');
        const viewControls = modal.querySelector('.view-mode-controls');
        const editControls = modal.querySelector('.edit-mode-controls');

        if (isEditing) {
            const allTags = [...MoodTracker.defaultTags, ...(MoodTracker.settings.customTags || [])];
            const tagsHtml = allTags.map(tag => {
                const isSelected = note.moods.includes(tag);
                return `<button class="mood-tag ${isSelected ? 'selected' : ''}" data-mood="${tag}">${tag}</button>`;
            }).join('');

            contentContainer.innerHTML = `
                <div class="mood-tags" id="modal-mood-tags">${tagsHtml}</div>
                <textarea class="input-field" style="min-height: 120px;">${note.content}</textarea>
            `;

            contentContainer.querySelector('.mood-tags').onclick = (e) => {
                if (e.target.classList.contains('mood-tag')) {
                    e.target.classList.toggle('selected');
                }
            };
            const textarea = contentContainer.querySelector('textarea');
            textarea.addEventListener('input', () => autoResizeTextarea(textarea));
            setTimeout(() => autoResizeTextarea(textarea), 0);

        } else {
            contentContainer.innerHTML = `
                <strong>${note.date} (${note.time})</strong>
                <div>${note.moods.map(m => `<span class="mood-tag selected" style="font-size:0.8rem; padding: 2px 8px; cursor:default;">${m}</span>`).join(' ')}</div>
                <div style="margin-top: 10px;">${DOMPurify.sanitize(marked.parse(note.content))}</div>
            `;
        }

        viewControls.classList.toggle('hidden', isEditing);
        editControls.classList.toggle('hidden', !isEditing);
    },

    async saveEditedNote(noteId) {
        const modal = document.getElementById('image-modal');
        const note = MoodTracker.moodData.find(e => e.id === noteId);
        if (!note) return;

        const contentContainer = document.getElementById('modal-note-content');
        const newContent = contentContainer.querySelector('textarea').value.trim();
        const selectedTags = [...contentContainer.querySelectorAll('.mood-tags .mood-tag.selected')].map(tag => tag.dataset.mood);

        if (!newContent) {
            alert("筆記內容不能為空！");
            return;
        }

        note.content = newContent;
        note.moods = selectedTags;

        await MoodTracker.saveData();

        this.toggleEditMode(noteId, false);

        if (selectedDateForReview === note.date) {
            MoodTracker.loadReviewData(note.date);
        }
        MoodTracker.renderPinnedNotes();
    },

    async deleteModalImage(noteId) {
        await MoodTracker.deleteNoteImage(noteId, true);
        this.closeModal();
        this.render();
    },

    closeModal() {
        document.getElementById('image-modal').classList.add('hidden');
        document.getElementById('modal-image').src = '';
    }
};
// --- 資料管理模組 ---
const DataManager = {
    async exportAllData() {
        if (!confirm("你確定要匯出所有資料嗎？")) return;
        try {
            const dataToExport = {
                moods: await DBHelper.getAll('moods'),
                habits: await DBHelper.getAll('habits'),
                tasks: await DBHelper.getAll('tasks'),
                punchRecords: await DBHelper.getAll('punchRecords'),
                workTimeRecords: await DBHelper.getAll('workTimeRecords'),
                chatHistory: await DBHelper.getAll('chatHistory'),
                appState: await DBHelper.getAll('appState'),
            };

            const dataStr = JSON.stringify(dataToExport, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `LifeObserver_Backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert('所有資料已成功匯出！');

        } catch (error) {
            console.error("匯出所有資料時發生錯誤:", error);
            alert("匯出失敗，請查看主控台錯誤訊息。");
        }
    },

    async importAllData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            if (!confirm('【警告】匯入資料將會完全覆蓋現有的所有記錄與設定！此操作無法復原，你確定要繼續嗎？')) {
                event.target.value = '';
                return;
            }

            try {
                const importedData = JSON.parse(e.target.result);
                const stores = ['moods', 'habits', 'tasks', 'punchRecords', 'workTimeRecords', 'chatHistory', 'appState'];

                for (const storeName of stores) {
                    if (importedData[storeName] && Array.isArray(importedData[storeName])) {
                        await DBHelper.saveAll(storeName, importedData[storeName]);
                    }
                }

                alert('資料匯入成功！應用程式將重新載入以套用變更。');
                location.reload();

            } catch (error) {
                console.error("匯入所有資料時發生錯誤:", error);
                alert("匯入失敗！檔案可能已損毀或格式不正確。");
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    },

    async clearAllData() {
        if (!confirm('【極度危險】你確定要清除應用程式內的所有資料嗎？\n\n此操作包括所有筆記、習慣、任務、打卡記錄和設定，且無法復原！')) {
            return;
        }
        if (!confirm('最後確認：真的要刪除所有資料嗎？')) {
            return;
        }

        try {
            console.log("開始清除所有資料...");
            const stores = ['moods', 'habits', 'tasks', 'punchRecords', 'workTimeRecords', 'chatHistory', 'appState'];
            for (const storeName of stores) {
                await DBHelper.clear(storeName);
                console.log(`已清空: ${storeName}`);
            }
            alert("所有資料已成功清除。應用程式將重新載入。");
            location.reload();
        } catch (error) {
            console.error("清除資料時發生錯誤:", error);
            alert("清除資料失敗，請查看主控台錯誤訊息。");
        }
    }
};
// --- 浮動搜尋模組 ---
const FloatingSearch = {
    isWindowOpen: false,

    init() {
        document.getElementById('global-search-bubble').addEventListener('click', () => this.toggleWindow());
        document.getElementById('floating-search-btn').addEventListener('click', () => GlobalSearch.performSearch());
        document.getElementById('floating-search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') GlobalSearch.performSearch();
        });
    },

    toggleWindow() {
        this.isWindowOpen = !this.isWindowOpen;
        document.getElementById('global-search-window').classList.toggle('hidden', !this.isWindowOpen);
    },

    openWindow() {
        if (this.isWindowOpen) return;
        this.isWindowOpen = true;
        document.getElementById('global-search-window').classList.remove('hidden');
    },

    closeWindow() {
        if (!this.isWindowOpen) return;
        this.isWindowOpen = false;
        document.getElementById('global-search-window').classList.add('hidden');
    },

    render(title, content) {
        document.getElementById('search-window-title').textContent = title;
        document.getElementById('floating-search-results').innerHTML = content;
    }
};

// --- 全局搜尋模組 ---
const GlobalSearch = {
    async performSearch() {
        const query = document.getElementById('floating-search-input').value.trim().toLowerCase();
        if (!query) return;

        FloatingSearch.render('搜尋中...', '<p>正在搜尋中...</p>');

        try {
            const moods = await DBHelper.getAll('moods');
            const tasks = await DBHelper.getAll('tasks');

            let results = [];
            moods.forEach(entry => {
                const contentMatch = entry.content.toLowerCase().includes(query);
                const tagMatch = entry.moods.some(tag => tag.toLowerCase().includes(query));
                if (contentMatch || tagMatch) {
                    results.push({ type: 'mood', data: entry });
                }
            });

            tasks.forEach(task => {
                if (task.content.toLowerCase().includes(query)) {
                    results.push({ type: 'task', data: task });
                }
            });

            results.sort((a, b) => {
                const dateA = new Date(a.data.timestamp || a.data.date);
                const dateB = new Date(b.data.timestamp || b.data.date);
                return dateB - dateA;
            });

            this.renderResults(results, query);

        } catch (error) {
            console.error("搜尋時發生錯誤:", error);
            FloatingSearch.render('錯誤', '<p>搜尋時發生錯誤，請稍後再試。</p>');
        }
    },

    renderResults(results, query) {
        const title = `找到 ${results.length} 筆關於 "${query}" 的結果`;
        if (results.length === 0) {
            FloatingSearch.render(title, '<p>找不到符合條件的結果。</p>');
            return;
        }

        const highlight = (text, q) => text.replace(new RegExp(q, 'gi'), (match) => `<mark>${match}</mark>`);

        let html = results.map(result => {
            let contentHTML = '';
            let titleHTML = '';
            const resultId = result.data.id;
            const resultType = result.type;
            const resultDate = result.data.date;

            if (resultType === 'mood') {
                const entry = result.data;
                titleHTML = `<strong>[心情筆記] ${entry.date} - ${entry.time}</strong>`;
                contentHTML = `<div class="search-content-display">${DOMPurify.sanitize(marked.parse(highlight(entry.content, query)))}</div>`;
            } else if (resultType === 'task') {
                const task = result.data;
                titleHTML = `<strong>[時間表] ${task.date} (${task.time})</strong>`;
                contentHTML = `<p class="search-content-display">${highlight(task.content, query)}</p><small>象限: ${task.quadrant}, 狀態: ${task.completed ? '已完成' : '未完成'}</small>`;
            }

            const actionsHTML = `
        <div class="search-actions">
            <button class="btn-pin" onclick="GlobalSearch.handleAction('edit', '${resultType}', ${resultId}, '${resultDate}')">✏️</button>
            <button class="btn-delete" onclick="GlobalSearch.handleAction('delete', '${resultType}', ${resultId})">🗑️</button>
        </div>
    `;

            return `<div class="review-entry">
                <div class="search-content-area">${titleHTML}${contentHTML}</div>
                ${actionsHTML}
            </div>`;
        }).join('');

        FloatingSearch.render(title, html);
    },

    handleAction: async function (action, type, id, date = null) {
        if (action === 'delete') {
            if (!confirm('確定要從搜尋結果中刪除此項目嗎？此操作無法復原。')) return;

            if (type === 'mood') {
                await MoodTracker.deleteEntry(id);
            } else if (type === 'task') {
                await TimeQuadrantTracker.deleteTask(id);
            }
            this.performSearch();

        } else if (action === 'edit') {
            if (type === 'mood' && date) {
                showSection('review-stats');

                setTimeout(() => {
                    const newDate = new Date(date + 'T00:00:00');
                    currentReviewDate = newDate;
                    document.getElementById('review-month').value = date.substring(0, 7);

                    MoodTracker.renderCalendar();
                    MoodTracker.renderMoodChart();
                    MoodTracker.loadReviewData(date);

                    setTimeout(() => {
                        const dayEl = document.querySelector(`.calendar-day[data-date="${date}"]`);
                        if (dayEl) {
                            document.querySelectorAll('.calendar-day.selected').forEach(d => d.classList.remove('selected'));
                            dayEl.classList.add('selected');
                        }
                        MoodTracker.editEntry(id);
                    }, 150);
                }, 100);

            } else if (type === 'task') {
                const task = TimeQuadrantTracker.tasks.find(t => t.id === id);
                if (task) {
                    showSection('time-quadrant');
                    setTimeout(() => {
                        TimeQuadrantTracker.currentDate = new Date(task.date + 'T00:00:00');
                        TimeQuadrantTracker.render();
                        TimeQuadrantTracker.openTaskForm(id);
                    }, 50);
                }
            }
            FloatingSearch.closeWindow();
        }
    },
};

// --- 頁面初始化 ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await DBHelper.init();

        const lastSectionItem = await DBHelper.get('appState', 'lastActiveSection');
        const lastSection = lastSectionItem ? lastSectionItem.value : 'attendance-tracker';
        showSection(lastSection);

        await Promise.all([
            MoodTracker.init(),
            HabitTracker.init(),
            TimeQuadrantTracker.init(),
            InputSaver.init(),
            FloatingAIChat.init(),
            ProactiveAIManager.init()
        ]);

        FloatingSearch.init();

        document.querySelectorAll('textarea').forEach(textarea => {
            textarea.addEventListener('input', () => autoResizeTextarea(textarea));
            autoResizeTextarea(textarea);
        });

    } catch (error) {
        console.error("應用程式初始化失敗:", error);
        document.body.innerHTML = "<h1>應用程式載入失敗，請檢查主控台錯誤。</h1>";
    }
});


if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            let updateButton = document.createElement('button');
                            updateButton.style.position = 'fixed';
                            updateButton.style.bottom = '20px';
                            updateButton.style.left = '50%';
                            updateButton.style.transform = 'translateX(-50%)';
                            updateButton.style.padding = '12px 20px';
                            updateButton.style.backgroundColor = '#28a745';
                            updateButton.style.color = 'white';
                            updateButton.style.border = 'none';
                            updateButton.style.borderRadius = '8px';
                            updateButton.style.cursor = 'pointer';
                            updateButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                            updateButton.textContent = '發現新版本，點此更新！';
                            document.body.appendChild(updateButton);

                            updateButton.addEventListener('click', () => {
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                            });
                        }
                    });
                });
            })
            .catch(error => {
                console.log('ServiceWorker registration failed: ', error);
            });
    });
}