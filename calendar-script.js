// Calendar and Booking Management with Cloudflare Worker Email
class BookingCalendar {
    constructor() {
        this.currentDate = new Date();
        this.bookedDates = [];
        this.selectedDate = null;
        this.adminEmails = [
            { email: 'zoee.burley@yahoo.com', name: 'Zoee Burley' },
            { email: 'h.m.ward1846@gmail.com', name: 'Admin' }
        ];
        // Replace this with your actual Cloudflare Worker URL
        this.workerUrl = 'https://send-booking-email.yourusername.workers.dev';
        
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
            
            day.className = 'calendar-day';
            day.textContent = i;

            if (dateObj.toDateString() === today.toDateString()) {
                day.classList.add('today');
            }

            if (dateObj < today) {
                day.classList.add('other-month');
                day.style.cursor = 'not-allowed';
            } else if (this.bookedDates.includes(dateString)) {
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

        const bookingData = {
            name: document.getElementById('bookingName').value,
            email: document.getElementById('bookingEmail').value,
            phone: document.getElementById('bookingPhone').value,
            date: this.formatDateDisplay(this.selectedDate),
            service: document.getElementById('bookingService').value,
            message: document.getElementById('bookingMessage').value,
            bookingDate: new Date().toLocaleString()
        };

        const submitBtn = document.querySelector('.btn-submit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        try {
            await this.sendBookingEmails(bookingData);

            this.bookedDates.push(this.formatDate(this.selectedDate));
            this.saveBookedDates();

            this.showConfirmation(bookingData);

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

    async sendBookingEmails(bookingData) {
        // Build email HTML
        const emailHtml = this.buildBookingEmailHTML(bookingData);

        // Send to both admin emails via Cloudflare Worker
        const emailPromises = this.adminEmails.map(admin =>
            this.sendEmailViaCloudflare({
                to: admin.email,
                subject: `🎉 New Booking: ${bookingData.name} - ${bookingData.date}`,
                html: emailHtml,
                from: {
                    email: 'bookings@wildwolfehaircostyling.com',
                    name: 'Zoee - Bridal Hair Styling'
                }
            })
        );

        // Wait for all emails to be sent
        const results = await Promise.all(emailPromises);
        
        // Check if any failed
        const failed = results.find(r => !r.success);
        if (failed) {
            throw new Error('Failed to send booking notification');
        }

        console.log('Booking emails sent successfully to all recipients');
    }

    async sendEmailViaCloudflare(emailData) {
        try {
            const response = await fetch(this.workerUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(emailData),
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error(`Worker returned ${response.status}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error sending email via Cloudflare:', error);
            throw error;
        }
    }

    buildBookingEmailHTML(bookingData) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: 'Lato', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f3f0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #d4af37;
        }
        .header h1 {
            color: #6b7e5b;
            margin: 0;
            font-size: 28px;
        }
        .header p {
            color: #a8b8a8;
            margin: 5px 0 0 0;
            font-size: 14px;
        }
        .booking-details {
            background-color: #f5f3f0;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 25px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #e0e0e0;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            font-weight: 600;
            color: #6b7e5b;
            width: 40%;
        }
        .detail-value {
            color: #333;
            width: 60%;
            text-align: right;
        }
        .message-section {
            margin-top: 25px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
        }
        .message-section h3 {
            color: #6b7e5b;
            margin: 0 0 10px 0;
            font-size: 16px;
        }
        .message-text {
            color: #666;
            background-color: #f9f9f9;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #d4af37;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            color: #999;
            font-size: 12px;
        }
        .action-button {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 30px;
            background-color: #6b7e5b;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            text-align: center;
        }
        .action-button:hover {
            background-color: #5a6f4c;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 New Booking!</h1>
            <p>A client has requested a booking appointment</p>
        </div>

        <div class="booking-details">
            <div class="detail-row">
                <span class="detail-label">👤 Client Name:</span>
                <span class="detail-value"><strong>${bookingData.name}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">📧 Email:</span>
                <span class="detail-value"><strong>${bookingData.email}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">📱 Phone:</span>
                <span class="detail-value"><strong>${bookingData.phone}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">📅 Booking Date:</span>
                <span class="detail-value"><strong>${bookingData.date}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">🎯 Service:</span>
                <span class="detail-value"><strong>${bookingData.service}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">⏰ Submitted:</span>
                <span class="detail-value"><strong>${bookingData.bookingDate}</strong></span>
            </div>
        </div>

        ${bookingData.message ? `
        <div class="message-section">
            <h3>📝 Client's Message:</h3>
            <div class="message-text">
                ${bookingData.message.replace(/\n/g, '<br>')}
            </div>
        </div>
        ` : ''}

        <div style="text-align: center;">
            <a href="https://wildwolfehairo-com.pages.dev/admin.html" class="action-button">View in Admin Panel</a>
        </div>

        <div class="footer">
            <p>This is an automated booking notification from Zoee's Bridal Hair Styling website.</p>
            <p>© 2026 Zoee - Bridal Hair Styling. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;
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
