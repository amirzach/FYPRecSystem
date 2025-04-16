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
// Modify the initializeSearchData function
function initializeSearchData() {
    let recentSearches = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    let searchCounts = JSON.parse(localStorage.getItem(SEARCH_COUNTS_KEY) || '{}');
    
    displaySearchTrends(recentSearches, searchCounts);
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
}

// Create a search tag element
function createSearchTag(term) {
    const tag = document.createElement('div');
    tag.className = 'trend-tag';
    tag.textContent = term;
    tag.addEventListener('click', function() {
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

// Function to create a supervisor card element
function createSupervisorCard(supervisor) {
    const card = document.createElement('div');
    card.className = 'supervisor-card';
    
    // Calculate similarity percentage for display
    const similarityPercentage = (supervisor.similarity * 100).toFixed(1);
    
    // Generate image URL - use supervisor's name for the image file
    // Convert supervisor name to a filename by replacing spaces with underscores
    const imageFilename = `${supervisor.supervisor_name.replace(/\s+/g, '_')}.jpg`;
    const imageUrl = `/sv_pictures/${imageFilename}`;
    
    card.innerHTML = `
        <img src="${imageUrl}" alt="Supervisor" class="supervisor-image">
        <div class="supervisor-info">
            <div class="supervisor-name">${supervisor.supervisor_name}</div>
            <div class="supervisor-expertise">${supervisor.expertise}</div>
            <div class="similarity-score">Match: ${similarityPercentage}%</div>
            <div class="key-terms">Key terms: ${supervisor.key_terms}</div>
        </div>
        <button class="view-profile-btn" onclick="viewSupervisorProfile(${supervisor.supervisor_id})">View Full Profile</button>
    `;
    
    return card;
}

// Function to view a specific supervisor's profile
function viewSupervisorProfile(supervisorId) {
    // Redirect to the supervisor profile page with the ID as a parameter
    window.location.href = `supervisor_profile.html?id=${supervisorId}`;
}

// Function to search for supervisors using the API
function searchSupervisors(query) {
    // Show loading indicator
    loadingIndicator.style.display = 'block';
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
                data.results.forEach(supervisor => {
                    const card = createSupervisorCard(supervisor);
                    supervisorCardContainer.appendChild(card);
                });
            } else {
                // Show no results message
                noResults.style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Search error:', error);
            loadingIndicator.style.display = 'none';
            noResults.style.display = 'block';
            noResults.textContent = 'An error occurred while searching. Please try again.';
        });
}

function hideCharts() {
    document.getElementById('searchResults').style.display = 'block';
    document.getElementById('chartsView').style.display = 'none';
}

// Initialize search data and trends on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeSearchData();
    
    // Add event listener for search input
    searchInput.addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            const query = searchInput.value.trim();
            
            if (query === '') {
                return; // Don't search on empty query
            }
            
            if (query.toLowerCase().includes('supervisor list') || query.toLowerCase().includes('all supervisors')) {
                window.location.href = 'supervisor_list.html';
            } else if (query.toLowerCase().includes('fyp') || query.toLowerCase().includes('past titles')) {
                window.location.href = 'past_fyp.html';
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
});