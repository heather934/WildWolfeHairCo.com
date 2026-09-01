// Admin Calendar Management
class AdminCalendarManager {
    constructor() {
        this.blockedDates = [];
        this.bookedDates = [];
        this.currentDate = new Date();
        // Reads share the same Worker + KV namespace the public booking
        // calendar reads from. Mutations (block/unblock/remove booking) go
        // through this site's own /api/admin/* routes instead, which are
        // gated by Cloudflare Access + a same-origin check.
        this.workerUrl = 'https://send-booking-email.h-m-ward1846.workers.dev';

        this.initializeEventListeners();
        this.init();
    }

    async init() {
        await this.loadData();
        this.renderAdminCalendar();
    }

    initializeEventListeners() {
        document.getElementById('addBlockedDateBtn')?.addEventListener('click', () => this.toggleBlockDateForm());
        document.getElementById('blockDateForm')?.addEventListener('submit', (e) => this.blockDate(e));
        document.getElementById('cancelBlockBtn')?.addEventListener('click', () => this.toggleBlockDateForm());
        document.getElementById('prevAdminMonth')?.addEventListener('click', () => this.previousMonth());
        document.getElementById('nextAdminMonth')?.addEventListener('click', () => this.nextMonth());
        document.getElementById('sendSMSNotificationBtn')?.addEventListener('click', () => this.setupSMSNotifications());
        document.getElementById('saveSMSSettingsBtn')?.addEventListener('click', () => this.saveSMSSettings());
    }

    renderAdminCalendar() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        // Update header
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
        document.getElementById('adminCurrentMonth').textContent = `${monthNames[month]} ${year}`;

        const grid = document.getElementById('adminCalendarGrid');
        grid.innerHTML = '';

        // Add day headers
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            const header = document.createElement('div');
            header.className = 'admin-calendar-day-header';
            header.textContent = day;
            grid.appendChild(header);
        });

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        // Previous month days
        for (let i = firstDay - 1; i >= 0; i--) {
            const day = document.createElement('div');
            day.className = 'admin-calendar-day other-month';
            day.textContent = daysInPrevMonth - i;
            grid.appendChild(day);
        }

        // Current month days
        const today = new Date();
        for (let i = 1; i <= daysInMonth; i++) {
            const day = document.createElement('div');
            const dateObj = new Date(year, month, i);
            const dateString = this.formatDate(dateObj);

            day.className = 'admin-calendar-day';
            day.textContent = i;

            if (dateObj.toDateString() === today.toDateString()) {
                day.classList.add('today');
            }

            if (dateObj < today) {
                day.classList.add('other-month');
            } else if (this.bookedDates.includes(dateString)) {
                day.classList.add('booked');
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'admin-date-action';
                deleteBtn.textContent = '✕';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.removeBooking(dateString);
                };
                day.appendChild(deleteBtn);
            } else if (this.blockedDates.includes(dateString)) {
                day.classList.add('blocked');
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'admin-date-action';
                deleteBtn.textContent = '✕';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.removeBlocked(dateString);
                };
                day.appendChild(deleteBtn);
            } else {
                day.classList.add('available');
                day.addEventListener('click', () => this.blockDateClick(dateObj));
            }

            grid.appendChild(day);
        }

        // Next month days
        const totalCells = grid.children.length - 7;
        const remainingCells = 42 - totalCells;
        for (let i = 1; i <= remainingCells; i++) {
            const day = document.createElement('div');
            day.className = 'admin-calendar-day other-month';
            day.textContent = i;
            grid.appendChild(day);
        }

        const countEl = document.getElementById('bookedDatesCount');
        if (countEl) {
            countEl.textContent = this.bookedDates.length;
        }
    }

    toggleBlockDateForm() {
        const form = document.getElementById('blockDateForm');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }

    blockDateClick(dateObj) {
        document.getElementById('blockDate').value = this.formatDateDisplay(dateObj);
        this.toggleBlockDateForm();
    }

    async blockDate(e) {
        e.preventDefault();
        const dateString = document.getElementById('blockDate').value;
        const reason = document.getElementById('blockReason').value;

        if (!dateString) {
            alert('Please select a date');
            return;
        }

        const date = new Date(dateString);
        const formattedDate = this.formatDate(date);

        try {
            const response = await fetch('/api/admin/block', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: formattedDate, reason }),
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            if (!this.blockedDates.includes(formattedDate)) {
                this.blockedDates.push(formattedDate);
            }
            this.renderAdminCalendar();
            document.getElementById('blockDateForm').reset();
            this.toggleBlockDateForm();
            this.showNotification('Date blocked successfully!', 'success');
        } catch (error) {
            console.error('Failed to block date:', error);
            this.showNotification('Failed to block date. Please try again.', 'error');
        }
    }

    async removeBlocked(dateString) {
        if (!confirm('Remove this blocked date?')) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/block?date=${encodeURIComponent(dateString)}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            this.blockedDates = this.blockedDates.filter(d => d !== dateString);
            this.renderAdminCalendar();
            this.showNotification('Blocked date removed!', 'success');
        } catch (error) {
            console.error('Failed to remove blocked date:', error);
            this.showNotification('Failed to remove blocked date. Please try again.', 'error');
        }
    }

    async removeBooking(dateString) {
        if (!confirm('Remove this booking? This will notify the client.')) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/booking?date=${encodeURIComponent(dateString)}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            this.bookedDates = this.bookedDates.filter(d => d !== dateString);
            this.renderAdminCalendar();
            this.showNotification('Booking removed!', 'success');
        } catch (error) {
            console.error('Failed to remove booking:', error);
            this.showNotification('Failed to remove booking. Please try again.', 'error');
        }
    }

    previousMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.renderAdminCalendar();
    }

    nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.renderAdminCalendar();
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    formatDateDisplay(date) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

    setupSMSNotifications() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close" onclick="this.parentElement.parentElement.style.display='none'">&times;</span>
                <h2>Setup SMS Notifications</h2>
                <p>Get instant SMS alerts when clients book appointments.</p>
                <div class="sms-setup">
                    <h3>Step 1: Get Twilio Credentials</h3>
                    <ol>
                        <li>Go to <a href="https://www.twilio.com" target="_blank">Twilio.com</a></li>
                        <li>Sign up for free (includes $15 credit)</li>
                        <li>Get your Account SID and Auth Token</li>
                        <li>Purchase a phone number (starts at $1/month)</li>
                    </ol>
                    <h3>Step 2: Enter Credentials Below</h3>
                    <form id="smsSetupForm">
                        <div class="form-group">
                            <label for="twilioAccountSid">Twilio Account SID:</label>
                            <input type="text" id="twilioAccountSid" placeholder="Your Account SID">
                        </div>
                        <div class="form-group">
                            <label for="twilioAuthToken">Twilio Auth Token:</label>
                            <input type="password" id="twilioAuthToken" placeholder="Your Auth Token">
                        </div>
                        <div class="form-group">
                            <label for="twilioPhoneNumber">Twilio Phone Number:</label>
                            <input type="tel" id="twilioPhoneNumber" placeholder="+1234567890">
                        </div>
                        <div class="form-group">
                            <label for="zoeePhoneNumber">Your Phone Number (to receive SMS):</label>
                            <input type="tel" id="zoeePhoneNumber" placeholder="+1234567890">
                        </div>
                        <button type="submit" class="btn-success">Save SMS Settings</button>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('form').addEventListener('submit', (e) => this.saveSMSCredentials(e, modal));
    }

    saveSMSCredentials(e, modal) {
        e.preventDefault();
        const smsSettings = {
            accountSid: document.getElementById('twilioAccountSid').value,
            authToken: document.getElementById('twilioAuthToken').value,
            twilioPhone: document.getElementById('twilioPhoneNumber').value,
            zoeePhone: document.getElementById('zoeePhoneNumber').value,
            enabled: true
        };

        localStorage.setItem('smsSettings', JSON.stringify(smsSettings));
        this.showNotification('SMS settings saved! Notifications enabled.', 'success');
        modal.style.display = 'none';
    }

    saveSMSSettings() {
        const enableSMS = document.getElementById('enableSMS').checked;
        const settings = JSON.parse(localStorage.getItem('smsSettings') || '{}');
        settings.enabled = enableSMS;
        localStorage.setItem('smsSettings', JSON.stringify(settings));
        this.showNotification('SMS settings updated!', 'success');
    }

    async loadData() {
        try {
            const response = await fetch(`${this.workerUrl}/availability`);
            if (!response.ok) {
                throw new Error(`Worker returned ${response.status}`);
            }
            const data = await response.json();
            this.bookedDates = data.bookedDates || [];
            this.blockedDates = data.blockedDates || [];
        } catch (error) {
            console.error('Failed to load availability:', error);
            this.showNotification('Failed to load availability from the server.', 'error');
        }
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 6px;
            color: white;
            font-weight: 600;
            background-color: ${type === 'success' ? '#10b981' : '#ef4444'};
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideInRight 0.3s ease-out;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('adminCalendarGrid')) {
        window.adminCalendarManager = new AdminCalendarManager();
    }
});
