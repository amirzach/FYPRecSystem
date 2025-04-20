const searchInput = document.getElementById('searchInput');
const supervisorCardContainer = document.getElementById('supervisorCardContainer');
const loadingIndicator = document.getElementById('loadingIndicator');
const noResults = document.getElementById('noResults');
const recentSearchesContainer = document.getElementById('recentSearches');
const mostSearchedContainer = document.getElementById('mostSearched');

// Local storage keys
const RECENT_SEARCHES_KEY = 'recentSearches';
const SEARCH_COUNTS_KEY = 'searchCounts';

// Initialize from local storage or defaults
function initializeSearchData() {
    let recentSearches = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    let searchCounts = JSON.parse(localStorage.getItem(SEARCH_COUNTS_KEY) || '{}');
    
    displaySearchTrends(recentSearches, searchCounts);
    
    // Add placeholder text animation to search input
    animateSearchPlaceholder();
}

// Animated placeholder text for search input
function animateSearchPlaceholder() {
    const placeholders = [
        "Search for AI expertise...",
        "Looking for image processing specialists?",
        "Find blockchain researchers...",
        "Discover data mining experts...",
        "Search for machine learning supervisors..."
    ];
    
    let currentIndex = 0;
    
    // Initial placeholder
    searchInput.placeholder = placeholders[0];
    
    // Change placeholder text every 3 seconds
    setInterval(() => {
        currentIndex = (currentIndex + 1) % placeholders.length;
        
        // Fade out current placeholder
        searchInput.style.opacity = '0.3';
        
        setTimeout(() => {
            // Update placeholder and fade it in
            searchInput.placeholder = placeholders[currentIndex];
            searchInput.style.opacity = '1';
        }, 200);
    }, 3000);
}

// Display recent and most searched terms
function displaySearchTrends(recentSearches, searchCounts) {
    // Clear containers
    recentSearchesContainer.innerHTML = '';
    mostSearchedContainer.innerHTML = '';
    
    // Display recent searches (most recent first, limit to 5)
    recentSearches.slice(0, 5).forEach(term => {
        const tag = createSearchTag(term);
        recentSearchesContainer.appendChild(tag);
    });
    
    // Sort search counts and display top 5
    const sortedSearches = Object.entries(searchCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
        
    sortedSearches.forEach(([term, count]) => {
        const tag = createSearchTag(term);
        mostSearchedContainer.appendChild(tag);
    });
    
    // If we have no search trends yet, display some suggested searches
    if (recentSearches.length === 0) {
        const suggestedTerms = ['Artificial Intelligence', 'Virtual Reality', 'Machine Learning', 'Big Data', 'Cybersecurity'];
        suggestedTerms.forEach(term => {
            const tag = createSearchTag(term);
            tag.innerHTML += ' <span class="suggested-tag">suggested</span>';
            recentSearchesContainer.appendChild(tag);
        });
    }
    
    if (Object.keys(searchCounts).length === 0) {
        const popularTerms = ['Data Science', 'Computer Vision', 'Blockchain', 'Robotics', 'Natural Language Processing'];
        popularTerms.forEach(term => {
            const tag = createSearchTag(term);
            tag.innerHTML += ' <span class="suggested-tag">popular</span>';
            mostSearchedContainer.appendChild(tag);
        });
    }
}

// Function to create a search tag element
function createSearchTag(term) {
    const tag = document.createElement('div');
    tag.className = 'trend-tag';
    tag.textContent = term;
    
    // Add ripple effect on click
    tag.addEventListener('click', function(e) {
        // Create ripple element
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        this.appendChild(ripple);
        
        // Position the ripple where clicked
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = e.clientX - rect.left - size/2 + 'px';
        ripple.style.top = e.clientY - rect.top - size/2 + 'px';
        
        // Remove ripple after animation completes
        setTimeout(() => ripple.remove(), 600);
        
        // Set search and perform search
        searchInput.value = term;
        searchSupervisors(term);
        updateSearchHistory(term);
    });
    
    return tag;
}

// Update search history when a new search is performed
function updateSearchHistory(query) {
    // Update recent searches
    let recentSearches = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    
    // Remove if already exists
    recentSearches = recentSearches.filter(term => term !== query);
    
    // Add to beginning of array
    recentSearches.unshift(query);
    
    // Keep only most recent 10
    recentSearches = recentSearches.slice(0, 10);
    
    // Update local storage
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recentSearches));
    
    // Update search counts
    let searchCounts = JSON.parse(localStorage.getItem(SEARCH_COUNTS_KEY) || '{}');
    searchCounts[query] = (searchCounts[query] || 0) + 1;
    localStorage.setItem(SEARCH_COUNTS_KEY, JSON.stringify(searchCounts));
    
    // Refresh display
    displaySearchTrends(recentSearches, searchCounts);
}

// Function to create a supervisor card element with enhanced visuals
function createSupervisorCard(supervisor, index) {
    const card = document.createElement('div');
    card.className = 'supervisor-card';
    card.style.opacity = '0';  // Start invisible for animation
    
    // Calculate similarity percentage for display
    const similarityPercentage = (supervisor.similarity * 100).toFixed(1);
    
    // Generate image URL - use supervisor's name for the image file
    // Convert supervisor name to a filename by replacing spaces with underscores
    const imageFilename = `${supervisor.supervisor_name.replace(/\s+/g, '_')}.jpg`;
    const imageUrl = `static/SV PICTURE/${imageFilename}`;
    
    // Create expertise badges from expertise field
    const expertiseArray = supervisor.expertise.split(',').map(item => item.trim());
    const expertiseBadges = expertiseArray.map(exp => 
        `<span class="expertise-badge">${exp}</span>`
    ).join('');
    
    card.innerHTML = `
        <img src="${imageUrl}" alt="Supervisor" class="supervisor-image" onerror="this.src='static/default_profile.jpg'">
        <div class="supervisor-info">
            <div class="supervisor-name">${supervisor.supervisor_name}</div>
            <div class="expertise-badges">${expertiseBadges}</div>
            <div class="similarity-score">Match Score: ${similarityPercentage}%</div>
            <div class="key-terms">Key terms: ${supervisor.key_terms}</div>
        </div>
        <button class="view-profile-btn" onclick="viewSupervisorProfile(${supervisor.supervisor_id})">
            <i class="fas fa-user-circle"></i> View Profile
        </button>
    `;
    
    // Add animation delay based on index
    setTimeout(() => {
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
    }, 100 * (index + 1));
    
    return card;
}

// Function to view a specific supervisor's profile
function viewSupervisorProfile(supervisorId) {
    // Add transition effect before navigating
    document.body.style.opacity = '0.7';
    
    // Redirect to the supervisor profile page with the ID as a parameter
    setTimeout(() => {
        window.location.href = `supervisor_profile.html?id=${supervisorId}`;
    }, 300);
}

// Function to search for supervisors using the API
function searchSupervisors(query) {
    // Show loading indicator with animation
    loadingIndicator.style.display = 'block';
    loadingIndicator.innerHTML = `
        <div class="loading-spinner"></div>
        <div class="loading-text">Finding matching supervisors for "${query}"...</div>
    `;
    
    supervisorCardContainer.innerHTML = '';
    noResults.style.display = 'none';
    
    // Make API request
    fetch(`/api/search_supervisors?query=${encodeURIComponent(query)}&min_score=0.1&top_n=10`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Search failed');
            }
            return response.json();
        })
        .then(data => {
            // Hide loading indicator
            loadingIndicator.style.display = 'none';
            
            // Check if results were found
            if (data.results && data.results.length > 0) {
                // Create and append supervisor cards
                data.results.forEach((supervisor, index) => {
                    const card = createSupervisorCard(supervisor, index);
                    supervisorCardContainer.appendChild(card);
                });
                
                // Add success notification
                showNotification(`Found ${data.results.length} matching supervisors!`, 'success');
            } else {
                // Show no results message
                noResults.style.display = 'block';
                noResults.innerHTML = `
                    <i class="fas fa-search" style="font-size: 40px; color: #ccc; margin-bottom: 15px;"></i>
                    <div>No supervisors found matching "${query}"</div>
                    <div style="font-size: 14px; margin-top: 10px;">Try searching with different keywords</div>
                `;
            }
        })
        .catch(error => {
            console.error('Search error:', error);
            loadingIndicator.style.display = 'none';
            noResults.style.display = 'block';
            noResults.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="font-size: 40px; color: #e74c3c; margin-bottom: 15px;"></i>
                <div>An error occurred while searching</div>
                <div style="font-size: 14px; margin-top: 10px;">Please try again later</div>
            `;
            
            // Show error notification
            showNotification('Search failed. Please try again.', 'error');
        });
}

function hideCharts() {
    document.getElementById('searchResults').style.display = 'block';
    document.getElementById('chartsView').style.display = 'none';
}

// Show notification function
function showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        document.body.appendChild(notification);
    }
    
    // Set class based on type
    notification.className = `notification ${type}`;
    
    // Set icon based on type
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    
    // Set content
    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;
    
    // Show notification
    notification.style.display = 'flex';
    notification.style.opacity = '0';
    notification.style.transform = 'translateY(20px)';
    
    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 10);
    
    // Hide after 3 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        
        // Remove from DOM after animation
        setTimeout(() => {
            notification.style.display = 'none';
        }, 300);
    }, 3000);
}

// Initialize search data and trends on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeSearchData();
    
    // Add event listener for search input
    searchInput.addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            const query = searchInput.value.trim();
            
            if (query === '') {
                showNotification('Please enter a search term', 'error');
                return; // Don't search on empty query
            }
            
            if (query.toLowerCase().includes('supervisor list') || query.toLowerCase().includes('all supervisors')) {
                document.body.style.opacity = '0.7';
                setTimeout(() => {
                    window.location.href = 'supervisor_list.html';
                }, 300);
            } else if (query.toLowerCase().includes('fyp') || query.toLowerCase().includes('past titles')) {
                document.body.style.opacity = '0.7';
                setTimeout(() => {
                    window.location.href = 'past_fyp.html';
                }, 300);
            } else {
                // Show search results view
                document.getElementById('searchResults').style.display = 'block';
                document.getElementById('chartsView').style.display = 'none';
                
                // Perform search
                searchSupervisors(query);
                
                // Update search history
                updateSearchHistory(query);
            }
        }
    });
    
    // Add focus effect to search input
    searchInput.addEventListener('focus', function() {
        this.parentElement.classList.add('search-focus');
    });
    
    searchInput.addEventListener('blur', function() {
        this.parentElement.classList.remove('search-focus');
    });
    
    // If there are URL parameters, check if we need to perform a search
    const urlParams = new URLSearchParams(window.location.search);
    const queryParam = urlParams.get('query');
    if (queryParam) {
        searchInput.value = queryParam;
        searchSupervisors(queryParam);
        updateSearchHistory(queryParam);
    }
    
    // Add subtle hover effect to cards
    document.addEventListener('mousemove', function(e) {
        const cards = document.querySelectorAll('.supervisor-card');
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            if (x > 0 && x < rect.width && y > 0 && y < rect.height) {
                const xPercent = x / rect.width - 0.5;
                const yPercent = y / rect.height - 0.5;
                card.style.transform = `perspective(1000px) rotateY(${xPercent * 2}deg) rotateX(${yPercent * -2}deg) scale(1.01)`;
            } else {
                card.style.transform = 'perspective(1000px) rotateY(0) rotateX(0) scale(1)';
            }
        });
    });
});         