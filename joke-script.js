// Joke Generator App
class JokeGenerator {
    constructor() {
        this.jokeCount = 0;
        this.currentJoke = null;
        this.currentCategory = 'any';
        this.isLoading = false;
        this.apiUrl = 'https://official-joke-api.appspot.com';

        this.initElements();
        this.attachEventListeners();
    }

    initElements() {
        this.getJokeBtn = document.getElementById('getJokeBtn');
        this.copyJokeBtn = document.getElementById('copyJokeBtn');
        this.jokeContent = document.getElementById('jokeContent');
        this.jokeType = document.getElementById('jokeType');
        this.jokeCountDisplay = document.getElementById('jokeCount');
        this.feedback = document.getElementById('feedback');
        this.categoryButtons = document.querySelectorAll('.category-btn');
    }

    attachEventListeners() {
        this.getJokeBtn.addEventListener('click', () => this.fetchJoke());
        this.copyJokeBtn.addEventListener('click', () => this.copyJoke());

        this.categoryButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.categoryButtons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentCategory = e.target.dataset.category;
                this.fetchJoke();
            });
        });
    }

    async fetchJoke() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.getJokeBtn.disabled = true;
        this.showLoading();
        this.clearFeedback();

        try {
            let url;

            // Build API URL based on category
            if (this.currentCategory === 'any') {
                url = `${this.apiUrl}/random_joke`;
            } else if (this.currentCategory === 'programming') {
                url = `${this.apiUrl}/jokes/programming/random`;
            } else if (this.currentCategory === 'knock-knock') {
                url = `${this.apiUrl}/jokes/knock-knock/random`;
            } else {
                url = `${this.apiUrl}/random_joke`;
            }

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusCode}`);
            }

            const data = await response.json();
            this.currentJoke = data;
            this.displayJoke(data);
            this.jokeCount++;
            this.jokeCountDisplay.textContent = this.jokeCount;
            this.showFeedback('Joke loaded successfully! 😄', 'success');

        } catch (error) {
            console.error('Error fetching joke:', error);
            this.showError('Failed to fetch joke. Please try again.');
            this.showFeedback('Error loading joke. Please check your connection.', 'error');
        } finally {
            this.isLoading = false;
            this.getJokeBtn.disabled = false;
        }
    }

    displayJoke(joke) {
        let jokeHtml = '';
        let jokeTypeText = 'Single';

        if (joke.setup && joke.delivery) {
            // Two-part joke (setup and delivery)
            jokeHtml = `
                <p class="joke-setup">${this.escapeHtml(joke.setup)}</p>
                <p class="joke-delivery">${this.escapeHtml(joke.delivery)}</p>
            `;
            jokeTypeText = 'Two-Part';
        } else if (joke.joke) {
            // Single line joke
            jokeHtml = `<p>${this.escapeHtml(joke.joke)}</p>`;
            jokeTypeText = 'Single';
        } else {
            jokeHtml = '<p class="error">Could not display joke</p>';
        }

        this.jokeContent.innerHTML = jokeHtml;
        this.jokeType.innerHTML = `<span class="badge">${jokeTypeText}</span>`;
    }

    displayJoke(joke) {
        let jokeHtml = '';
        let jokeTypeText = 'Single';

        if (joke.setup && joke.delivery) {
            // Two-part joke (setup and delivery)
            jokeHtml = `
                <p class="joke-setup">${this.escapeHtml(joke.setup)}</p>
                <p class="joke-delivery">${this.escapeHtml(joke.delivery)}</p>
            `;
            jokeTypeText = 'Two-Part';
        } else if (joke.joke) {
            // Single line joke
            jokeHtml = `<p>${this.escapeHtml(joke.joke)}</p>`;
            jokeTypeText = 'Single';
        } else {
            jokeHtml = '<p class="error">Could not display joke</p>';
        }

        this.jokeContent.innerHTML = jokeHtml;
        this.jokeType.innerHTML = `<span class="badge">${jokeTypeText}</span>`;
    }

    copyJoke() {
        if (!this.currentJoke) {
            this.showFeedback('No joke to copy yet!', 'info');
            return;
        }

        let jokeText = '';
        if (this.currentJoke.setup && this.currentJoke.delivery) {
            jokeText = `${this.currentJoke.setup}\n\n${this.currentJoke.delivery}`;
        } else if (this.currentJoke.joke) {
            jokeText = this.currentJoke.joke;
        }

        navigator.clipboard.writeText(jokeText).then(() => {
            this.showFeedback('Joke copied to clipboard! 📋', 'success');
        }).catch(() => {
            this.showFeedback('Failed to copy to clipboard', 'error');
        });
    }

    showLoading() {
        this.jokeContent.innerHTML = '<div class="spinner"></div>';
    }

    showFeedback(message, type) {
        this.feedback.textContent = message;
        this.feedback.className = `feedback ${type}`;

        // Auto clear after 3 seconds
        setTimeout(() => {
            this.clearFeedback();
        }, 3000);
    }

    clearFeedback() {
        this.feedback.textContent = '';
        this.feedback.className = 'feedback';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new JokeGenerator();
    console.log('Joke Generator initialized!');
});
