document.addEventListener('DOMContentLoaded', function() {
    // Fetch student profile data
    fetchStudentProfile();
    fetchSupervisorHistory();            
});

// Fetch student profile data
function fetchStudentProfile() {
    fetch('/api/student_profile')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch profile data');
            }
            return response.json();
        })
        .then(data => {
            displayStudentProfile(data);
        })
        .catch(error => {
            console.error('Error fetching student profile:', error);
            document.getElementById('errorMessage').textContent = 
                'Failed to load profile data. Please try again later.';
            document.getElementById('errorMessage').style.display = 'block';
        });
}

// Display student profile data
function displayStudentProfile(data) {
    document.getElementById('studentName').textContent = data.name;
    document.getElementById('studentId').textContent = 'Student ID: ' + data.id;
    document.getElementById('studentEmail').textContent = data.email;
    
    // Set profile initial
    const initial = data.name.charAt(0).toUpperCase();
    document.getElementById('profileInitial').textContent = initial;
}

function fetchSupervisorHistory() {
    fetch('/api/student_supervisor_history')
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch history data');
            }
            return response.json();
        })
        .then(data => {
            displaySupervisorHistory(data);
        })
        .catch(error => {
            console.error('Error fetching supervisor history:', error);
            document.getElementById('recentlyViewed').innerHTML = 
                '<div class="empty-history">Failed to load history.</div>';
            document.getElementById('mostViewed').innerHTML = 
                '<div class="empty-history">Failed to load history.</div>';
        });
}

function displaySupervisorHistory(data) {
    const recentContainer = document.getElementById('recentlyViewed');
    const mostViewedContainer = document.getElementById('mostViewed');
    
    // Display recently viewed
    if (data.recent && data.recent.length > 0) {
        recentContainer.innerHTML = data.recent.map(supervisor => `
            <div class="history-item" onclick="navigateToSupervisor(${supervisor.SupervisorID})">
                ${supervisor.SvName}
                <span class="view-count">${supervisor.view_count}</span>
            </div>
        `).join('');
    } else {
        recentContainer.innerHTML = '<div class="empty-history">No recently viewed supervisors</div>';
    }
    
    // Display most viewed
    if (data.most_viewed && data.most_viewed.length > 0) {
        mostViewedContainer.innerHTML = data.most_viewed.map(supervisor => `
            <div class="history-item" onclick="navigateToSupervisor(${supervisor.SupervisorID})">
                ${supervisor.SvName}
                <span class="view-count">${supervisor.view_count}</span>
            </div>
        `).join('');
    } else {
        mostViewedContainer.innerHTML = '<div class="empty-history">No supervisor viewing history</div>';
    }
}

function navigateToSupervisor(supervisorId) {
    window.location.href = `/supervisor_profile.html?id=${supervisorId}`;
}