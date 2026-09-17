// Renders the homepage gallery from the real photos Zoee has uploaded in
// the admin panel (functions/api/gallery/*). If there aren't any yet, or
// the request fails, the static placeholder tiles already in index.html
// are left in place.

function escapeGalleryHtml(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    fetch('/api/gallery')
        .then((response) => {
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            return response.json();
        })
        .then((data) => {
            const images = data.images || [];
            if (images.length === 0) return;

            grid.innerHTML = images.map((item) => `
                <div class="gallery-item">
                    <img class="gallery-photo" src="${item.url}" alt="${escapeGalleryHtml(item.caption)}" loading="lazy">
                </div>
            `).join('');
        })
        .catch((err) => {
            console.error('Failed to load gallery:', err);
        });
});
