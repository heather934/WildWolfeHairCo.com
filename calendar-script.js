// Calendar and Booking Management
class BookingCalendar {
    constructor() {
        this.currentDate = new Date();
        this.bookedDates = [];
        this.selectedDate = null;
        this.adminEmails = ['zoee.burley@yahoo.com', 'h.m.ward1846@gmail.com'];
        
        this.initializeEventListeners();
        this.loadBookedDates();
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
        
        // Update header
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
        document.getElementById('currentMonth').textContent = `${monthNames[month]} ${year}`;

        // Get calendar grid
        const grid = document.getElementById('calendarGrid');
        grid.innerHTML = '';

        // Add day headers
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            const header = document.createElement('div');
            header.className = 'calendar-day-header';
            header.textContent = day;
            grid.appendChild(header);
        });

        // Get first day of month and number of days
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        // Add previous month's days
        for (let i = firstDay - 1; i >= 0; i--) {
            const day = document.createElement('div');
            day.className = 'calendar-day other-month';
            day.textContent = daysInPrevMonth - i;
            grid.appendChild(day);
        }

        // Add current month's days
        const today = new Date();
        for (let i = 1; i <= daysInMonth; i++) {
            const day = document.createElement('div');
            const dateObj = new Date(year, month, i);
            const dateString = this.formatDate(dateObj);
            
            day.className = 'calendar-day';
            day.textContent = i;

            // Check if date is today
            if (dateObj.toDateString() === today.toDateString()) {
                day.classList.add('today');
            }

            // Check if date is in past
            if (dateObj < today) {
                day.classList.add('other-month');
                day.style.cursor = 'not-allowed';
            } else if (this.bookedDates.includes(dateString)) {
                day.classList.add('booked');
            } else if (dateObj >= today) {
                day.classList.add('available');
                day.addEventListener('click', () => this.selectDate(dateObj));
            }

            // Check if selected
            if (this.selectedDate && dateString === this.formatDate(this.selectedDate)) {
                day.classList.add('selected');
            }

            grid.appendChild(day);
        }

        // Add next month's days
        const totalCells = grid.children.length - 7; // Subtract day headers
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

        const bookingData = {
            name: document.getElementById('bookingName').value,
            email: document.getElementById('bookingEmail').value,
            phone: document.getElementById('bookingPhone').value,
            date: this.formatDateDisplay(this.selectedDate),
            service: document.getElementById('bookingService').value,
            message: document.getElementById('bookingMessage').value,
            bookingDate: new Date().toLocaleString()
        };

        // Disable submit button
        const submitBtn = document.querySelector('.btn-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        try {
            // Send email to both admin emails
            await this.sendBookingEmail(bookingData);

            // Add to booked dates
            this.bookedDates.push(this.formatDate(this.selectedDate));
            this.saveBookedDates();

            // Show confirmation
            this.showConfirmation(bookingData);

            // Reset form
            document.getElementById('bookingForm').reset();
            document.getElementById('selectedDate').value = '';
            this.selectedDate = null;
            this.renderCalendar();

        } catch (error) {
            console.error('Booking error:', error);
            alert('There was an error processing your booking. Please try again or contact Zoee directly.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirm Booking';
        }
    }

    async sendBookingEmail(bookingData) {
        // Send to both email addresses
        for (const email of this.adminEmails) {
            const formData = new FormData();
            formData.append('name', bookingData.name);
            formData.append('email', bookingData.email);
            formData.append('phone', bookingData.phone);
            formData.append('date', bookingData.date);
            formData.append('service', bookingData.service);
            formData.append('message', bookingData.message);
            formData.append('_subject', `🎉 New Booking: ${bookingData.name} - ${bookingData.date}`);
            formData.append('_captcha', 'false');
            formData.append('_next', `${window.location.origin}/index.html?booking=confirmed`);

            const response = await fetch(`https://formsubmit.co/${email}`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Email sending failed to ${email}`);
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

    saveBookedDates() {
        localStorage.setItem('bookedDates', JSON.stringify(this.bookedDates));
    }

    loadBookedDates() {
        const saved = localStorage.getItem('bookedDates');
        if (saved) {
            this.bookedDates = JSON.parse(saved);
        }
    }
}

// Initialize calendar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('calendarGrid')) {
        window.bookingCalendar = new BookingCalendar();
        console.log('Booking Calendar initialized with admin emails: zoee.burley@yahoo.com, h.m.ward1846@gmail.com');
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
