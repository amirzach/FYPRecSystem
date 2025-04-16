document.addEventListener('DOMContentLoaded', function() {
    // Get supervisor ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const supervisorId = urlParams.get('id');
    
    if (!supervisorId) {
        document.getElementById('profileContent').innerHTML = '<div class="section">No supervisor selected. Please go back to the supervisor list.</div>';
        return;
    }
    
    // Fetch supervisor details
    fetchSupervisorProfile(supervisorId);
    
    // Setup search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keyup', function(event) {
            if (event.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) {
                    window.location.href = `search_results.html?query=${encodeURIComponent(query)}`;
                }
            }
        });
    }
});

async function fetchSupervisorProfile(supervisorId) {
    try {
        // Fetch supervisor data
        const response = await fetch(`/api/supervisor/${supervisorId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch supervisor details');
        }
        
        const supervisor = await response.json();
        
        // Fetch past FYP projects supervised by this supervisor
        const fypResponse = await fetch(`/api/supervisor_fyp/${supervisorId}`);
        const fypData = await fypResponse.json();
        
        // Once we have the supervisor data, find similar supervisors
        const similarSupervisors = await fetchSimilarSupervisors(supervisor.expertise_areas);
        
        // Render the profile
        renderProfile(supervisor, similarSupervisors, fypData.projects);
        
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('profileContent').innerHTML = `
            <div class="section">
                <div class="section-title">Error</div>
                <p>Failed to load supervisor profile. Please try again later.</p>
            </div>
        `;
    }
}

async function fetchSimilarSupervisors(expertise) {
    try {
        const response = await fetch(`/api/search_supervisors?query=${encodeURIComponent(expertise)}&min_score=0.3&top_n=4`);
        if (!response.ok) {
            throw new Error('Failed to fetch similar supervisors');
        }
        
        const data = await response.json();
        return data.results || [];
    } catch (error) {
        console.error('Error fetching similar supervisors:', error);
        return [];
    }
}

function renderProfile(supervisor, similarSupervisors, fypProjects) {
    // Generate image URL - use supervisor's name for the image file
    // Convert supervisor name to a filename by replacing spaces with underscores
    const imageFilename = `${supervisor.SvName.replace(/\s+/g, '_')}.jpg`;
    const imageUrl = `static/SV PICTURE/${imageFilename}`;
    // Split expertise into array
    const expertiseAreas = supervisor.expertise_areas ? supervisor.expertise_areas.split(', ') : [];
    
    // Create the profile HTML
    const profileHTML = `
        <div class="profile-header">
            <img src="${imageUrl}" alt="Supervisor" class="profile-image">
            <div class="profile-info">
                <div class="profile-name">${supervisor.SvName}</div>
                <div class="profile-title">Faculty of Computing</div>
                <div class="contact-info">Email: ${supervisor.SvEmail || 'Not available'}</div>
                <div class="contact-info">ID: ${supervisor.SupervisorID}</div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Areas of Expertise</div>
            ${expertiseAreas.map(area => `<div class="expertise-item">${area.trim()}</div>`).join('')}
            
            <canvas id="expertiseChart" class="expertise-chart"></canvas>
        </div>

        <div class="section">
            <div class="section-title">Similar Supervisors</div>
            <div class="similar-supervisors" id="similarSupervisors">
                ${renderSimilarSupervisors(similarSupervisors, supervisor.SupervisorID)}
            </div>
        </div>

        <div class="section">
            <div class="section-title">Past FYP Projects Supervised</div>
            ${renderFypProjects(fypProjects)}
        </div>
    `;
    
    document.getElementById('profileContent').innerHTML = profileHTML;
    
    // Create expertise chart
    createExpertiseChart(expertiseAreas);
}

function renderFypProjects(projects) {
    if (!projects || projects.length === 0) {
        return '<p>No past FYP projects found for this supervisor.</p>';
    }
    
    return projects.map(project => `
        <div class="fyp-item">
            <div class="fyp-title">${project.Title}</div>
            <div class="fyp-description">${project.Abstract || 'No abstract available.'}</div>
            <div style="font-size: 12px; color: #666; margin-top: 5px;">
                Student: ${project.Author} | Year: ${project.Year}
            </div>
        </div>
    `).join('');
}

function renderSimilarSupervisors(supervisors, currentId) {
    if (!supervisors || supervisors.length === 0) {
        return '<p>No similar supervisors found.</p>';
    }
    
    return supervisors
        .filter(s => s.supervisor_id != currentId) // Remove current supervisor
        .slice(0, 4) // Take only top 4
        .map(supervisor => `
            <div class="similar-item">
                <div class="similar-name">
                    <a href="supervisor_profile.html?id=${supervisor.supervisor_id}">${supervisor.supervisor_name}</a>
                </div>
                <div class="similar-expertise">${supervisor.key_terms}</div>
                <div class="similarity-score">Similarity: ${(supervisor.similarity * 100).toFixed(1)}%</div>
            </div>
        `).join('');
}

function createExpertiseChart(expertiseAreas) {
    if (!expertiseAreas || expertiseAreas.length === 0) return;
    
    const ctx = document.getElementById('expertiseChart').getContext('2d');
    
    // Generate colors
    const backgroundColors = generateColors(expertiseAreas.length);
    
    // Create random values for demonstration (in a real app, you'd use actual data)
    const values = expertiseAreas.map(() => Math.floor(Math.random() * 50) + 50);
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: expertiseAreas,
            datasets: [{
                label: 'Expertise Level',
                data: values,
                backgroundColor: backgroundColors,
                borderColor: backgroundColors.map(color => color.replace('0.6', '1')),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Expertise Distribution'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Knowledge Level'
                    }
                }
            }
        }
    });
}

function generateColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        const hue = (i * 360 / count) % 360;
        colors.push(`hsla(${hue}, 70%, 60%, 0.6)`);
    }
    return colors;
}