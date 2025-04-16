const modal = document.getElementById('abstractModal');
const modalTitle = document.getElementById('modalTitle');
const modalAuthor = document.getElementById('modalAuthor');
const modalYear = document.getElementById('modalYear');
const modalAbstract = document.getElementById('modalAbstract');

function showAbstract(projectId, title, author, year, abstract) {
    modalTitle.textContent = title;
    modalAuthor.textContent = author;
    modalYear.textContent = year;
    modalAbstract.textContent = abstract;
    modal.style.display = 'block';
}

function closeModal() {
    modal.style.display = 'none';
}

// Close modal when clicking outside of it
window.onclick = function(event) {
    if (event.target == modal) {
        closeModal();
    }
}

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeModal();
    }
});

const searchInput = document.getElementById('searchInput');

searchInput.addEventListener('keyup', function(event) {
    if (event.key === 'Enter') {
        const searchText = searchInput.value.toLowerCase();
        filterProjects(searchText);
    }
});

function filterProjects(searchText) {
    const rows = document.querySelectorAll('tbody tr');
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const title = row.cells[1].textContent.toLowerCase();
        const author = row.cells[0].textContent.toLowerCase();
        
        // Search in title and author only (abstracts are hidden)
        if (searchText === '' || 
            title.includes(searchText) || 
            author.includes(searchText)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    }
}