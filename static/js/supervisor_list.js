document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    const supervisorTableBody = document.getElementById('supervisorTableBody');
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    // Function to fetch all supervisors from database
    function loadAllSupervisors() {
        loadingIndicator.style.display = 'block';
        
        // Fetch supervisors from database
        fetch('/api/supervisors')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch supervisors');
                }
                return response.json();
            })
            .then(data => {
                loadingIndicator.style.display = 'none';
                populateSupervisorTable(data);
            })
            .catch(error => {
                console.error('Error loading supervisors:', error);
                loadingIndicator.style.display = 'none';
                
                // If API fails, use sample data (for demo purposes)
                const sampleSupervisors = [
                    {SupervisorID: 1, SvName: "SMITH GAFFIAN BIN SOLIAMAN (DR)", expertise_areas: "SOFTWARE ENGINEERING, CLOUD COMPUTING, DEVOPS"},
                    {SupervisorID: 2, SvName: "MUHAMMAD IZAD RAMLI (DR)", expertise_areas: "IMAGE PROCESSING, SPEECH PROCESSING, NATURAL LANGUAGE PROCESSING"},
                    {SupervisorID: 3, SvName: "MUHAMMAD HANA KHAN (DR)", expertise_areas: "MEDICAL IMAGING, COMPUTER VISION, PATTERN RECOGNITION"},
                    {SupervisorID: 4, SvName: "NABSIAH KY OMAR (ASSOC. PROF. DR)", expertise_areas: "DATA VISUALIZATION, TEXT ANALYTICS, INFORMATION RETRIEVAL"},
                    {SupervisorID: 5, SvName: "NORZIAH BINTI SURYAN (ASSOC. PROF. DR)", expertise_areas: "SPEECH PROCESSING, INFORMATION RETRIEVAL, MACHINE LEARNING"},
                    {SupervisorID: 6, SvName: "NORDIANGILANG BINTI KABARUDDIN (ASSOC. PROF. DR)", expertise_areas: "COMPUTATIONAL INTELLIGENCE, EMOTION RECOGNITION, ARTIFICIAL INTELLIGENCE"},
                    {SupervisorID: 7, SvName: "PRASANNA A/P KANANATHAN (DR)", expertise_areas: "LEARNING ANALYTICS, MULTIMEDIA EDUCATION, EDUCATIONAL TECHNOLOGY"},
                    {SupervisorID: 8, SvName: "AHMAD NOOR HISHAM (DR)", expertise_areas: "DATA SCIENCE, BIG DATA ANALYTICS, BUSINESS INTELLIGENCE"},
                    {SupervisorID: 9, SvName: "SITI MAHFUZAH BINTI ABDUL KHALID (DR)", expertise_areas: "HUMAN-COMPUTER INTERACTION, UX DESIGN, USER INTERFACE DESIGN"},
                    {SupervisorID: 10, SvName: "RAHMAH BINTI ZAINUDDIN (PROF. DR)", expertise_areas: "ARTIFICIAL INTELLIGENCE, DEEP LEARNING, NEURAL NETWORKS"},
                    {SupervisorID: 11, SvName: "LEE CHENG HONG (DR)", expertise_areas: "CYBERSECURITY, NETWORK SECURITY, ETHICAL HACKING"},
                    {SupervisorID: 12, SvName: "AMIRUL HADI BIN YUSOF (DR)", expertise_areas: "IOT, EMBEDDED SYSTEMS, ROBOTICS"} 
                ];
                populateSupervisorTable({supervisors: sampleSupervisors});
            });
    }
    
    // Function to populate the table with supervisor data
    function populateSupervisorTable(data) {
        supervisorTableBody.innerHTML = '';
        
        const supervisors = data.supervisors || [];
        
        supervisors.forEach((supervisor, index) => {
            const row = document.createElement('tr');
            row.onclick = function() {
                window.location.href = `/supervisor_profile.html?id=${supervisor.SupervisorID}`;
            };
            
            row.innerHTML = `
                <td>${index + 1}. ${supervisor.SvName}</td>
                <td>${supervisor.expertise_areas}</td>
            `;
            
            supervisorTableBody.appendChild(row);
        });
    }
    
    // Function to filter supervisors by search input
    function filterSupervisors() {
        const searchTerm = searchInput.value.toLowerCase();
        const rows = supervisorTableBody.getElementsByTagName('tr');
        
        for (let i = 0; i < rows.length; i++) {
            const name = rows[i].getElementsByTagName('td')[0].textContent.toLowerCase();
            const expertise = rows[i].getElementsByTagName('td')[1].textContent.toLowerCase();
            
            if (name.includes(searchTerm) || expertise.includes(searchTerm)) {
                rows[i].style.display = '';
            } else {
                rows[i].style.display = 'none';
            }
        }
    }
    
    // Add event listener for search input
    searchInput.addEventListener('keyup', filterSupervisors);
    
    // Load supervisors when page loads
    loadAllSupervisors();
});