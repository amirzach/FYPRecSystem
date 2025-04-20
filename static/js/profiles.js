document.addEventListener('DOMContentLoaded', function() {
    // Add loading animation effect
    document.querySelectorAll('.profile-section').forEach(section => {
        section.style.opacity = '0';
    });
    
    setTimeout(() => {
        document.querySelectorAll('.profile-section').forEach(section => {
            section.style.opacity = '1';
        });
    }, 100);
    
    // Fetch student profile data
    fetchStudentProfile();
    fetchSupervisorHistory();
});

// Fetch student profile data
function fetchStudentProfile() {
    // Show loading animation
    const profileElements = {
        name: document.getElementById('studentName'),
        id: document.getElementById('studentId'),
        email: document.getElementById('studentEmail'),
        initial: document.getElementById('profileInitial')
    };
    
    fetch('/api/student_profile')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch profile data');
            }
            return response.json();
        })
        .then(data => {
            displayStudentProfile(data, profileElements);
            
            // Add animation on successful load
            document.querySelector('.profile-card').classList.add('profile-loaded');
        })
        .catch(error => {
            console.error('Error fetching student profile:', error);
            displayError('Failed to load profile data. Please try again later.');
        });
}

// Display student profile data with animation
function displayStudentProfile(data, elements) {
    // Apply fade-in animation
    elements.name.style.opacity = 0;
    elements.id.style.opacity = 0;
    elements.email.style.opacity = 0;
    elements.initial.style.opacity = 0;
    
    setTimeout(() => {
        elements.name.textContent = data.name;
        elements.id.textContent = 'Student ID: ' + data.id;
        elements.email.textContent = data.email;
        
        // Set profile initial with animation
        const initial = data.name.charAt(0).toUpperCase();
        elements.initial.textContent = initial;
        
        // Fade in elements
        elements.name.style.opacity = 1;
        elements.id.style.opacity = 1;
        elements.email.style.opacity = 1;
        elements.initial.style.opacity = 1;
    }, 300);
}

function fetchSupervisorHistory() {
    const containers = {
        recent: document.getElementById('recentlyViewed'),
        most: document.getElementById('mostViewed')
    };
    
    // Show loading animation
    containers.recent.innerHTML = '<div class="loading"><i class="fas fa-sync fa-spin"></i> Loading...</div>';
    containers.most.innerHTML = '<div class="loading"><i class="fas fa-sync fa-spin"></i> Loading...</div>';
    
    fetch('/api/student_supervisor_history')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch history data');
            }
            return response.json();
        })
        .then(data => {
            displaySupervisorHistory(data, containers);
        })
        .catch(error => {
            console.error('Error fetching supervisor history:', error);
            containers.recent.innerHTML = '<div class="empty-history"><i class="fas fa-exclamation-circle"></i> Failed to load history.</div>';
            containers.most.innerHTML = '<div class="empty-history"><i class="fas fa-exclamation-circle"></i> Failed to load history.</div>';
        });
}

function displaySupervisorHistory(data, containers) {
    // Display recently viewed with animation
    if (data.recent && data.recent.length > 0) {
        let recentHTML = '';
        data.recent.forEach((supervisor, index) => {
            recentHTML += `
                <div class="history-item" 
                     onclick="navigateToSupervisor(${supervisor.SupervisorID})"
                     style="animation-delay: ${index * 0.1}s">
                    ${supervisor.SvName}
                    <span class="view-count">${supervisor.view_count}</span>
                </div>
            `;
        });
        containers.recent.innerHTML = recentHTML;
    } else {
        containers.recent.innerHTML = '<div class="empty-history"><i class="fas fa-history"></i> No recently viewed supervisors</div>';
    }
    
    // Display most viewed with animation
    if (data.most_viewed && data.most_viewed.length > 0) {
        let mostHTML = '';
        data.most_viewed.forEach((supervisor, index) => {
            mostHTML += `
                <div class="history-item" 
                     onclick="navigateToSupervisor(${supervisor.SupervisorID})"
                     style="animation-delay: ${index * 0.1}s">
                    ${supervisor.SvName}
                    <span class="view-count">${supervisor.view_count}</span>
                </div>
            `;
        });
        containers.most.innerHTML = mostHTML;
    } else {
        containers.most.innerHTML = '<div class="empty-history"><i class="fas fa-chart-line"></i> No supervisor viewing history</div>';
    }
    
    // Add hover effect to history items
    addHistoryItemEffects();
}

function addHistoryItemEffects() {
    document.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'translateX(3px)';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.transform = 'translateX(0)';
        });
    });
}

function navigateToSupervisor(supervisorId) {
    // Add transition effect before navigation
    document.body.style.opacity = '0.8';
    setTimeout(() => {
        window.location.href = `/supervisor_profile.html?id=${supervisorId}`;
    }, 200);
}

function displayError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    
    // Add subtle shake animation
    errorElement.classList.add('error-shake');
    setTimeout(() => {
        errorElement.classList.remove('error-shake');
    }, 500);
}