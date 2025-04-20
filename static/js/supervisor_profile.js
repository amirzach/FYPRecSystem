document.addEventListener('DOMContentLoaded', function() {
    // Get supervisor ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const supervisorId = urlParams.get('id');
    
    if (!supervisorId) {
        document.getElementById('profileContent').innerHTML = `
            <div class="section">
                <div class="section-title">No supervisor selected</div>
                <p>Please go back to the supervisor list and select a supervisor to view their profile.</p>
                <a href="/homepage" class="back-btn"><i class="fas fa-arrow-left"></i> Back to Homepage</a>
            </div>`;
        return;
    }
    
    // Fetch supervisor details
    fetchSupervisorProfile(supervisorId);
    
    // Add back to top button
    addBackToTopButton();
    
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
        // Show loading animation
        document.getElementById('profileContent').innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner fa-spin"></i> Loading supervisor profile...
            </div>`;
            
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
        
        // Add event listeners after rendering
        addEventListeners();
        
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('profileContent').innerHTML = `
            <div class="section">
                <div class="section-title">Error</div>
                <p>Failed to load supervisor profile. Please try again later.</p>
                <button class="retry-btn" onclick="fetchSupervisorProfile('${supervisorId}')">
                    <i class="fas fa-sync-alt"></i> Retry
                </button>
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
            <img src="${imageUrl}" alt="${supervisor.SvName}" class="profile-image">
            <div class="profile-info">
                <div class="profile-name">${supervisor.SvName}</div>
                <div class="profile-title">Faculty of Computing</div>
                <div class="contact-info"><i class="fas fa-envelope"></i> ${supervisor.SvEmail || 'Not available'}</div>
                <div class="contact-info"><i class="fas fa-id-card"></i> ID: ${supervisor.SupervisorID}</div>
            </div>
        </div>

        <div class="section" id="expertiseSection">
            <div class="section-title">
                <i class="fas fa-star"></i> Areas of Expertise
            </div>
            <div class="expertise-tags">
                ${expertiseAreas.map(area => `
                    <div class="expertise-item" data-tooltip="Click to search related supervisors" 
                         onclick="searchByExpertise('${area.trim()}')">
                        ${area.trim()}
                    </div>`).join('')}
            </div>
            
            <canvas id="expertiseChart" class="expertise-chart"></canvas>
        </div>

        <div class="section" id="similarSection">
            <div class="section-title">
                <i class="fas fa-users"></i> Similar Supervisors
            </div>
            <div class="similar-supervisors" id="similarSupervisors">
                ${renderSimilarSupervisors(similarSupervisors, supervisor.SupervisorID)}
            </div>
        </div>

        <div class="section" id="projectsSection">
            <div class="section-title">
                <i class="fas fa-project-diagram"></i> Past FYP Projects Supervised
            </div>
            ${renderFypProjects(fypProjects)}
        </div>
    `;
    
    document.getElementById('profileContent').innerHTML = profileHTML;
    
    // Create expertise chart with animation
    setTimeout(() => {
        createExpertiseChart(expertiseAreas);
    }, 500);
}

function renderFypProjects(projects) {
    if (!projects || projects.length === 0) {
        return '<p>No past FYP projects found for this supervisor.</p>';
    }
    
    return projects.map(project => `
        <div class="fyp-item">
            <div class="fyp-title">${project.Title}</div>
            <div class="fyp-description">${project.Abstract || 'No abstract available.'}</div>
            <div class="fyp-meta">
                <i class="fas fa-user-graduate"></i> <span>${project.Author}</span>
                <i class="fas fa-calendar-alt"></i> <span>${project.Year}</span>
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
                    <a href="supervisor_profile.html?id=${supervisor.supervisor_id}">
                        <i class="fas fa-user-tie"></i> ${supervisor.supervisor_name}
                    </a>
                </div>
                <div class="similar-expertise">${supervisor.key_terms}</div>
                <div class="similarity-score">Similarity: ${(supervisor.similarity * 100).toFixed(1)}%</div>
            </div>
        `).join('');
}

function createExpertiseChart(expertiseAreas) {
    if (!expertiseAreas || expertiseAreas.length === 0) return;
    
    const ctx = document.getElementById('expertiseChart').getContext('2d');
    
    // Generate colors with more vibrant gradients
    const backgroundColors = expertiseAreas.map((_, i) => {
        const hue = (i * 360 / expertiseAreas.length) % 360;
        return {
            backgroundColor: `linear-gradient(135deg, hsla(${hue}, 70%, 60%, 0.7), hsla(${hue + 30}, 70%, 60%, 0.7))`,
            borderColor: `hsla(${hue}, 70%, 50%, 1)`
        };
    });
    
    // Create random values for demonstration (in a real app, you'd use actual data)
    const values = expertiseAreas.map(() => Math.floor(Math.random() * 50) + 50);
    
    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: expertiseAreas,
            datasets: [{
                label: 'Expertise Level',
                data: values,
                backgroundColor: backgroundColors.map(c => c.backgroundColor),
                borderColor: backgroundColors.map(c => c.borderColor),
                borderWidth: 1,
                borderRadius: 6,
                maxBarThickness: 50
            }]
        },
        options: {
            responsive: true,
            animation: {
                duration: 1500,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Expertise Distribution',
                    font: {
                        size: 16,
                        family: 'Poppins'
                    },
                    padding: {
                        top: 10,
                        bottom: 20
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleFont: {
                        family: 'Poppins',
                        size: 14
                    },
                    bodyFont: {
                        family: 'Poppins',
                        size: 13
                    },
                    padding: 12,
                    cornerRadius: 6,
                    displayColors: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Knowledge Level',
                        font: {
                            family: 'Poppins',
                            size: 14
                        }
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    },
                    ticks: {
                        font: {
                            family: 'Poppins',
                            size: 12
                        }
                    }
                },
                x: {
                    ticks: {
                        font: {
                            family: 'Poppins',
                            size: 12
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
    
    // Add interactivity to the chart
    document.getElementById('expertiseChart').addEventListener('click', function(evt) {
        const activePoints = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
        
        if (activePoints.length > 0) {
            const firstPoint = activePoints[0];
            const label = chart.data.labels[firstPoint.index];
            searchByExpertise(label);
        }
    });
}

function addEventListeners() {
    // Add smooth scrolling to section links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });
    
    // Add hover effects to expertise tags
    document.querySelectorAll('.expertise-item').forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-3px)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
}

function searchByExpertise(expertise) {
    window.location.href = `search_results.html?query=${encodeURIComponent(expertise)}`;
}

function addBackToTopButton() {
    // Create the button
    const backToTopBtn = document.createElement('div');
    backToTopBtn.className = 'back-to-top';
    backToTopBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    document.body.appendChild(backToTopBtn);
    
    // Show/hide button based on scroll position
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            backToTopBtn.classList.add('visible');
        } else {
            backToTopBtn.classList.remove('visible');
        }
    });
    
    // Scroll to top when clicked
    backToTopBtn.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// Function to show section content gradually
function animateSections() {
    const sections = document.querySelectorAll('.section');
    sections.forEach((section, index) => {
        section.style.animationDelay = `${0.1 * (index + 1)}s`;
    });
}