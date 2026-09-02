// Calendar and Booking Management with Cloudflare Worker Email
class BookingCalendar {
    constructor() {
        this.currentDate = new Date();
        this.bookedDates = [];
        this.blockedDates = [];
        this.selectedDate = null;
        // Availability (booked/blocked dates) and booking emails are both
        // handled by this Worker, backed by a shared KV namespace so the
        // public calendar and the admin panel stay in sync.
        this.workerUrl = 'https://send-booking-email.h-m-ward1846.workers.dev';

        this.initializeEventListeners();
        this.init();
    }

    async init() {
        await this.loadAvailability();
        this.renderCalendar();
    }

    initializeEventListeners() {
        document.getElementById('prevMonth')?.addEventListener('click', () => this.previousMonth());
        document.getElementById('nextMonth')?.addEventListener('click', () => this.nextMonth());
        document.getElementById('bookingForm')?.addEventListener('submit', (e) => this.submitBooking(e));
        document.querySelector('.close')?.addEventListener('click', () => this.closeModal());
    }

    renderCalendar() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
        document.getElementById('currentMonth').textContent = `${monthNames[month]} ${year}`;

        const grid = document.getElementById('calendarGrid');
        grid.innerHTML = '';

        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            const header = document.createElement('div');
            header.className = 'calendar-day-header';
            header.textContent = day;
            grid.appendChild(header);
        });

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        for (let i = firstDay - 1; i >= 0; i--) {
            const day = document.createElement('div');
            day.className = 'calendar-day other-month';
            day.textContent = daysInPrevMonth - i;
            grid.appendChild(day);
        }

        const today = new Date();
        for (let i = 1; i <= daysInMonth; i++) {
            const day = document.createElement('div');
            const dateObj = new Date(year, month, i);
            const dateString = this.formatDate(dateObj);
            const isUnavailable = this.bookedDates.includes(dateString) || this.blockedDates.includes(dateString);

            day.className = 'calendar-day';
            day.textContent = i;

            if (dateObj.toDateString() === today.toDateString()) {
                day.classList.add('today');
            }

            if (dateObj < today) {
                day.classList.add('other-month');
                day.style.cursor = 'not-allowed';
            } else if (isUnavailable) {
                day.classList.add('booked');
            } else if (dateObj >= today) {
                day.classList.add('available');
                day.addEventListener('click', () => this.selectDate(dateObj));
            }

            if (this.selectedDate && dateString === this.formatDate(this.selectedDate)) {
                day.classList.add('selected');
            }

            grid.appendChild(day);
        }

        const totalCells = grid.children.length - 7;
        const remainingCells = 42 - totalCells;
        for (let i = 1; i <= remainingCells; i++) {
            const day = document.createElement('div');
            day.className = 'calendar-day other-month';
            day.textContent = i;
            grid.appendChild(day);
        }
    }

    selectDate(dateObj) {
        this.selectedDate = dateObj;
        document.getElementById('selectedDate').value = this.formatDateDisplay(dateObj);
        this.renderCalendar();
    }

    previousMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.renderCalendar();
    }

    nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.renderCalendar();
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

    async submitBooking(e) {
        e.preventDefault();

        if (!this.selectedDate) {
            alert('Please select a date from the calendar');
            return;
        }

        const turnstileToken = (window.turnstileBookingWidgetId !== null && window.turnstileBookingWidgetId !== undefined && typeof turnstile !== 'undefined')
            ? turnstile.getResponse(window.turnstileBookingWidgetId)
            : '';
        if (!turnstileToken) {
            alert('Please complete the verification checkbox before confirming.');
            return;
        }

        const dateString = this.formatDate(this.selectedDate);
        const bookingData = {
            date: dateString,
            name: document.getElementById('bookingName').value,
            email: document.getElementById('bookingEmail').value,
            phone: document.getElementById('bookingPhone').value,
            service: document.getElementById('bookingService').value,
            message: document.getElementById('bookingMessage').value,
            turnstileToken,
        };

        const submitBtn = document.querySelector('.btn-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        try {
            const response = await fetch(`${this.workerUrl}/availability/book`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to submit booking');
            }

            this.bookedDates.push(dateString);
            this.showConfirmation({ ...bookingData, date: this.formatDateDisplay(this.selectedDate) });

            document.getElementById('bookingForm').reset();
            document.getElementById('selectedDate').value = '';
            this.selectedDate = null;
            this.renderCalendar();

        } catch (error) {
            console.error('Booking error:', error);
            if (error.message === 'That date is no longer available') {
                alert('Sorry, that date was just booked by someone else. Please choose another date.');
                await this.loadAvailability();
                this.renderCalendar();
            } else {
                alert('There was an error processing your booking. Please try again or contact Zoee directly.');
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirm Booking';
            if (window.turnstileBookingWidgetId !== null && window.turnstileBookingWidgetId !== undefined && typeof turnstile !== 'undefined') {
                turnstile.reset(window.turnstileBookingWidgetId);
            }
        }
    }

    showConfirmation(bookingData) {
        const modal = document.getElementById('confirmationModal');
        const details = document.getElementById('confirmationDetails');

        details.innerHTML = `
            <p><strong>Name:</strong> ${bookingData.name}</p>
            <p><strong>Booking Date:</strong> ${bookingData.date}</p>
            <p><strong>Service:</strong> ${bookingData.service}</p>
            <p><strong>Phone:</strong> ${bookingData.phone}</p>
        `;

        document.getElementById('confirmEmail').textContent = bookingData.email;
        modal.style.display = 'block';
    }

    closeModal() {
        document.getElementById('confirmationModal').style.display = 'none';
    }

    async loadAvailability() {
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
        }
    }
}

// Initialize calendar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('calendarGrid')) {
        window.bookingCalendar = new BookingCalendar();
        console.log('Booking Calendar initialized with Cloudflare email worker');
    }
});

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    const modal = document.getElementById('confirmationModal');
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

function closeConfirmationModal() {
    document.getElementById('confirmationModal').style.display = 'none';
}
