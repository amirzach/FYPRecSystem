document.addEventListener('DOMContentLoaded', function() {
    // Fetch student profile data
    fetchStudentProfile();
    fetchSupervisorHistory();            
});

// Fetch student profile data
function fetchStudentProfile() {
    // First check if there's student data in the session
    const studentName = "{{ session.get('username', '') }}";
    const studentId = "{{ session.get('user_id', '') }}";
    
    if (studentName && studentId) {
        // If data is available directly from session, use it
        updateProfileWithSessionData(studentName, studentId);
    } else {
        // Otherwise make an API call to get the data
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
}

// Update profile with session data and then fetch additional data
function updateProfileWithSessionData(name, id) {
    // Update the visible fields with the data we have
    document.getElementById('studentName').textContent = name;
    document.getElementById('studentId').textContent = 'Student ID: ' + id;
    
    // Set profile initial
    const initial = name.charAt(0).toUpperCase();
    document.getElementById('profileInitial').textContent = initial;
    
    // Then fetch the rest of the data (email) from the database
    fetch(`/api/student_email?id=${id}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch email data');
            }
            return response.json();
        })
        .then(data => {
            document.getElementById('studentEmail').textContent = data.email || 'Not available';
        })
        .catch(error => {
            console.error('Error fetching student email:', error);
            document.getElementById('studentEmail').textContent = 'Email not available';
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