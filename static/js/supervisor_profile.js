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
        
        // Fetch papers published by this supervisor (changed from FYP projects)
        const papersResponse = await fetch(`/api/supervisor_papers/${supervisorId}`);
        const papersData = await papersResponse.json();
        
        // Once we have the supervisor data, find similar supervisors
        const similarSupervisors = await fetchSimilarSupervisors(supervisor.expertise_areas);
        
        // Render the profile
        renderProfile(supervisor, similarSupervisors, papersData.projects);
        
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

function renderProfile(supervisor, similarSupervisors, papers) {
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
            
            <div class="chart-container">
                <canvas id="expertiseChart" class="expertise-chart"></canvas>
            </div>
        </div>

        <div class="section" id="similarSection">
            <div class="section-title">
                <i class="fas fa-users"></i> Similar Supervisors Network
            </div>
            <div class="venn-container" id="vennContainer">
                ${renderVennDiagram(similarSupervisors, supervisor)}
            </div>
        </div>

        <div class="section" id="papersSection">
            <div class="section-title">
                <i class="fas fa-file-alt"></i> Published Papers
            </div>
            ${renderPapers(papers)}
        </div>
    `;
    
    document.getElementById('profileContent').innerHTML = profileHTML;
    
    // Create expertise chart with animation
    setTimeout(() => {
        createExpertiseChart(expertiseAreas);
    }, 500);
    
    setTimeout(() => {
        initializeVennDiagram(similarSupervisors, supervisor);
    }, 500);
}

function renderPapers(papers) {
    if (!papers || papers.length === 0) {
        return '<p>No published papers found for this supervisor.</p>';
    }
    
    return papers.map(paper => `
        <div class="paper-item">
            <div class="paper-title">${paper.PaperTitle}</div>
            <div class="paper-abstract">${paper.PaperAbstract || 'No abstract available.'}</div>
            <div class="paper-keywords">
                ${paper.PaperKeywords ? `<i class="fas fa-tags"></i> <span class="keywords">${paper.PaperKeywords}</span>` : ''}
            </div>
            <div class="paper-meta">
                <i class="fas fa-calendar-alt"></i> <span>Published: ${paper.PaperYear}</span>
                <i class="fas fa-user"></i> <span>Supervisor ID: ${paper.SupervisorID}</span>
            </div>
        </div>
    `).join('');
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
    
    // Generate vibrant colors for pie chart segments
    const colors = expertiseAreas.map((_, i) => {
        const hue = (i * 360 / expertiseAreas.length) % 360;
        return {
            backgroundColor: `hsla(${hue}, 70%, 60%, 0.8)`,
            borderColor: `hsla(${hue}, 70%, 45%, 1)`,
            hoverBackgroundColor: `hsla(${hue}, 70%, 65%, 0.9)`,
            hoverBorderColor: `hsla(${hue}, 70%, 40%, 1)`
        };
    });
    
    // Create random values for demonstration (in a real app, you'd use actual data)
    const values = expertiseAreas.map(() => Math.floor(Math.random() * 50) + 50);
    
    const chart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: expertiseAreas,
            datasets: [{
                label: 'Expertise Distribution',
                data: values,
                backgroundColor: colors.map(c => c.backgroundColor),
                borderColor: colors.map(c => c.borderColor),
                hoverBackgroundColor: colors.map(c => c.hoverBackgroundColor),
                hoverBorderColor: colors.map(c => c.hoverBorderColor),
                borderWidth: 2,
                hoverBorderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1500,
                easing: 'easeOutQuart',
                animateRotate: true,
                animateScale: true
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        font: {
                            family: 'Poppins',
                            size: 12
                        },
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                title: {
                    display: true,
                    text: 'Expertise Distribution',
                    font: {
                        size: 16,
                        family: 'Poppins',
                        weight: 'bold'
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
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${percentage}%`;
                        }
                    }
                }
            },
            layout: {
                padding: 20
            },
            onHover: (event, activeElements) => {
                event.native.target.style.cursor = activeElements.length > 0 ? 'pointer' : 'default';
            }
        }
    });
    
    // Add interactivity to the chart - click on pie segments to search by expertise
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

// New function to render Venn diagram structure
function renderVennDiagram(similarSupervisors, currentSupervisor) {
    if (!similarSupervisors || similarSupervisors.length === 0) {
        return '<p>No similar supervisors found.</p>';
    }
    
    return `
        <div class="venn-diagram-container">
            <svg id="vennSvg" width="600" height="400" viewBox="0 0 600 400">
                <!-- Background -->
                <rect width="600" height="400" fill="#f8fafc" rx="12"/>
                
                <!-- Main supervisor circle (center) -->
                <circle id="mainCircle" cx="300" cy="200" r="80" 
                        fill="rgba(58, 123, 213, 0.3)" 
                        stroke="rgba(58, 123, 213, 0.8)" 
                        stroke-width="2"/>
                
                <!-- Similar supervisor circles -->
                ${generateSimilarCircles(similarSupervisors)}
                
                <!-- Labels and names -->
                <text x="300" y="200" text-anchor="middle" 
                      font-family="Poppins" font-weight="600" font-size="12" 
                      fill="#2c3e50">
                    ${truncateName(currentSupervisor.SvName)}
                </text>
                
                ${generateSimilarLabels(similarSupervisors, currentSupervisor.SupervisorID)}
            </svg>
            
            <!-- Legend and details -->
            <div class="venn-legend">
                <div class="legend-item current">
                    <div class="legend-color" style="background: rgba(58, 123, 213, 0.3);"></div>
                    <span>Current Supervisor</span>
                </div>
                <div class="legend-item similar">
                    <div class="legend-color" style="background: rgba(0, 210, 255, 0.3);"></div>
                    <span>Similar Supervisors</span>
                </div>
                <div class="legend-item overlap">
                    <div class="legend-color" style="background: rgba(255, 107, 107, 0.3);"></div>
                    <span>Shared Expertise</span>
                </div>
            </div>
            
            <!-- Supervisor details panel -->
            <div class="supervisor-details" id="supervisorDetails">
                <div class="details-header">Supervisor Information</div>
                <div class="details-content" id="detailsContent">
                    Click on a supervisor circle to view details
                </div>
            </div>
        </div>
    `;
}

// Generate circles for similar supervisors
function generateSimilarCircles(similarSupervisors) {
    const positions = [
        { cx: 180, cy: 140 },  // Top-left
        { cx: 420, cy: 140 },  // Top-right
        { cx: 180, cy: 260 },  // Bottom-left
        { cx: 420, cy: 260 }   // Bottom-right
    ];
    
    return similarSupervisors
        .slice(0, 4)
        .map((supervisor, index) => {
            const pos = positions[index];
            const similarity = supervisor.similarity || 0;
            const opacity = Math.max(0.2, similarity * 0.8);
            
            return `
                <circle id="circle_${supervisor.supervisor_id}" 
                        cx="${pos.cx}" cy="${pos.cy}" r="60"
                        fill="rgba(0, 210, 255, ${opacity})" 
                        stroke="rgba(0, 210, 255, 0.8)" 
                        stroke-width="2"
                        class="similar-circle"
                        data-supervisor-id="${supervisor.supervisor_id}"
                        data-supervisor-name="${supervisor.supervisor_name}"
                        data-expertise="${supervisor.key_terms}"
                        data-similarity="${(similarity * 100).toFixed(1)}"
                        style="cursor: pointer; transition: all 0.3s ease;"/>
            `;
        }).join('');
}

// Generate labels for similar supervisors
function generateSimilarLabels(similarSupervisors, currentId) {
    const positions = [
        { x: 180, y: 140 },
        { x: 420, y: 140 },
        { x: 180, y: 260 },
        { x: 420, y: 260 }
    ];
    
    return similarSupervisors
        .filter(s => s.supervisor_id != currentId)
        .slice(0, 4)
        .map((supervisor, index) => {
            const pos = positions[index];
            return `
                <text x="${pos.x}" y="${pos.y}" text-anchor="middle" 
                      font-family="Poppins" font-weight="500" font-size="10" 
                      fill="#2c3e50" class="supervisor-label"
                      data-supervisor-id="${supervisor.supervisor_id}">
                    ${truncateName(supervisor.supervisor_name)}
                </text>
                <text x="${pos.x}" y="${pos.y + 12}" text-anchor="middle" 
                      font-family="Poppins" font-weight="400" font-size="8" 
                      fill="#7f8c8d">
                    ${(supervisor.similarity * 100).toFixed(1)}%
                </text>
            `;
        }).join('');
}

// Initialize interactive Venn diagram
function initializeVennDiagram(similarSupervisors, currentSupervisor) {
    const svg = document.getElementById('vennSvg');
    if (!svg) return;
    
    // Add hover effects and click handlers
    const circles = svg.querySelectorAll('.similar-circle');
    
    circles.forEach(circle => {
        // Hover effects
        circle.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.1)';
            this.style.transformOrigin = `${this.getAttribute('cx')}px ${this.getAttribute('cy')}px`;
            this.style.filter = 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))';
        });
        
        circle.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
            this.style.filter = 'none';
        });
        
        // Click handler to show details
        circle.addEventListener('click', function() {
            const supervisorId = this.dataset.supervisorId;
            const supervisorName = this.dataset.supervisorName;
            const expertise = this.dataset.expertise;
            const similarity = this.dataset.similarity;
            
            showSupervisorDetails(supervisorId, supervisorName, expertise, similarity);
            
            // Remove previous selection
            circles.forEach(c => c.classList.remove('selected'));
            // Add selection to current circle
            this.classList.add('selected');
        });
    });
    
    // Add click handler to main circle
    const mainCircle = document.getElementById('mainCircle');
    if (mainCircle) {
        mainCircle.addEventListener('click', function() {
            showSupervisorDetails(
                currentSupervisor.SupervisorID, 
                currentSupervisor.SvName, 
                currentSupervisor.expertise_areas, 
                '100.0'
            );
            
            circles.forEach(c => c.classList.remove('selected'));
        });
        
        mainCircle.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.05)';
            this.style.transformOrigin = '300px 200px';
            this.style.filter = 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))';
        });
        
        mainCircle.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
            this.style.filter = 'none';
        });
    }
}

// Show supervisor details in the panel
function showSupervisorDetails(supervisorId, name, expertise, similarity) {
    const detailsContent = document.getElementById('detailsContent');
    if (!detailsContent) return;
    
    const expertiseList = expertise ? expertise.split(', ').slice(0, 5) : [];
    
    detailsContent.innerHTML = `
        <div class="supervisor-info">
            <div class="supervisor-name-detail">
                <i class="fas fa-user-tie"></i> ${name}
            </div>
            <div class="similarity-detail">
                <i class="fas fa-chart-line"></i> Similarity: ${similarity}%
            </div>
            <div class="expertise-detail">
                <i class="fas fa-star"></i> Key Areas:
                <div class="expertise-tags-small">
                    ${expertiseList.map(area => `
                        <span class="expertise-tag-small">${area.trim()}</span>
                    `).join('')}
                </div>
            </div>
            <div class="action-buttons">
                <button class="view-profile-btn" onclick="window.location.href='supervisor_profile.html?id=${supervisorId}'">
                    <i class="fas fa-eye"></i> View Profile
                </button>
                <button class="compare-btn" onclick="compareSupervisors('${supervisorId}')">
                    <i class="fas fa-balance-scale"></i> Compare
                </button>
            </div>
        </div>
    `;
}

// Utility function to truncate long names
function truncateName(name, maxLength = 15) {
    if (!name) return '';
    return name.length > maxLength ? name.substring(0, maxLength) + '...' : name;
}

// Compare supervisors function (placeholder)
function compareSupervisors(supervisorId) {
    // Implement comparison functionality
    console.log('Comparing with supervisor:', supervisorId);
    // You can redirect to a comparison page or show a modal
}