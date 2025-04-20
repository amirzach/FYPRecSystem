const modal = document.getElementById('abstractModal');
const modalTitle = document.getElementById('modalTitle');
const modalAuthor = document.getElementById('modalAuthor');
const modalYear = document.getElementById('modalYear');
const modalAbstract = document.getElementById('modalAbstract');
const searchInput = document.getElementById('searchInput');

// Enhanced modal opening with animation
function showAbstract(projectId, title, author, year, abstract) {
    modalTitle.textContent = title;
    modalAuthor.textContent = author;
    modalYear.textContent = year;
    modalAbstract.textContent = abstract;
    modal.style.display = 'block';
    
    // Add class for opening animation
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}

// Enhanced modal closing with animation
function closeModal() {
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = 'none';
    }, 300);
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

// Real-time filtering on input rather than just Enter key
searchInput.addEventListener('input', function() {
    const searchText = searchInput.value.toLowerCase();
    filterProjects(searchText);
});

// Keep the original Enter key functionality as well
searchInput.addEventListener('keyup', function(event) {
    if (event.key === 'Enter') {
        const searchText = searchInput.value.toLowerCase();
        filterProjects(searchText);
    }
});

function filterProjects(searchText) {
    const rows = document.querySelectorAll('tbody tr');
    let resultsFound = false;
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const title = row.cells[1].textContent.toLowerCase();
        const author = row.cells[0].textContent.toLowerCase();
        const year = row.cells[2].textContent.toLowerCase();
        
        // Enhanced search to include year as well
        if (searchText === '' || 
            title.includes(searchText) || 
            author.includes(searchText) ||
            year.includes(searchText)) {
            row.style.display = '';
            resultsFound = true;
            
            // Reset any highlight from previous searches
            highlightMatchedText(row, searchText);
        } else {
            row.style.display = 'none';
        }
    }
    
    // Show or hide "no results" message
    const noResultsElement = document.getElementById('noResults');
    if (noResultsElement) {
        noResultsElement.style.display = resultsFound || searchText === '' ? 'none' : 'block';
    }
}

// Highlight matching text in search results
function highlightMatchedText(row, searchText) {
    if (!searchText) return;
    
    const cells = [row.cells[0], row.cells[1]]; // Author and title cells
    
    cells.forEach(cell => {
        const originalText = cell.textContent;
        if (!originalText.toLowerCase().includes(searchText.toLowerCase())) return;
        
        // Create highlighted HTML
        const regex = new RegExp(`(${escapeRegExp(searchText)})`, 'gi');
        const highlightedText = originalText.replace(regex, '<span class="highlight">$1</span>');
        cell.innerHTML = highlightedText;
    });
}

// Helper function to escape regex special characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Add ripple effect to table rows
document.addEventListener('DOMContentLoaded', function() {
    const tableRows = document.querySelectorAll('tbody tr');
    
    tableRows.forEach(row => {
        row.addEventListener('click', function(e) {
            const ripple = document.createElement('span');
            ripple.classList.add('ripple');
            this.appendChild(ripple);
            
            const x = e.clientX - this.getBoundingClientRect().left;
            const y = e.clientY - this.getBoundingClientRect().top;
            
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
    
    // Focus search input when page loads
    if (searchInput) {
        setTimeout(() => {
            searchInput.focus();
        }, 500);
    }
});