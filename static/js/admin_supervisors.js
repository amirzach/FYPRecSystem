// Global variables
let supervisors = [];
let deleteSupervisorId = null;

// DOM Elements
const supervisorTableBody = document.getElementById('supervisorTableBody');
const supervisorModal = document.getElementById('supervisorModal');
const deleteModal = document.getElementById('deleteModal');
const supervisorForm = document.getElementById('supervisorForm');
const searchInput = document.getElementById('searchInput');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    loadSupervisors();
    
    // Add event listeners
    document.getElementById('addNewBtn').addEventListener('click', showAddModal);
    document.getElementById('saveSupervisorBtn').addEventListener('click', saveSupervisor);
    document.getElementById('confirmDeleteBtn').addEventListener('click', deleteSupervisor);
    document.getElementById('closeSupervisorModal').addEventListener('click', () => supervisorModal.style.display = 'none');
    document.getElementById('cancelSupervisorBtn').addEventListener('click', () => supervisorModal.style.display = 'none');
    document.getElementById('closeDeleteModal').addEventListener('click', () => deleteModal.style.display = 'none');
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => deleteModal.style.display = 'none');
    searchInput.addEventListener('input', filterSupervisors);
    
    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target === supervisorModal) {
            supervisorModal.style.display = 'none';
        }
        if (event.target === deleteModal) {
            deleteModal.style.display = 'none';
        }
    });
});

// Load all supervisors
async function loadSupervisors() {
    try {
        const response = await fetch('/api/admin/supervisors');
        const data = await response.json();
        
        if (data.supervisors) {
            supervisors = data.supervisors;
            renderSupervisors(supervisors);
        }
    } catch (error) {
        console.error('Error loading supervisors:', error);
        alert('Failed to load supervisors. Please try again.');
    }
}

// Render supervisors in table
function renderSupervisors(supervisorsList) {
    supervisorTableBody.innerHTML = '';
    
    supervisorsList.forEach(supervisor => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${supervisor.SupervisorID}</td>
            <td>${supervisor.SvName}</td>
            <td>${supervisor.SvEmail || 'N/A'}</td>
            <td>${supervisor.expertise_areas || 'N/A'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-info" onclick="showEditModal(${supervisor.SupervisorID})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger" onclick="showDeleteModal(${supervisor.SupervisorID})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        supervisorTableBody.appendChild(row);
    });
}

// Filter supervisors based on search input
function filterSupervisors() {
    const searchTerm = searchInput.value.toLowerCase();
    
    const filteredSupervisors = supervisors.filter(supervisor => 
        (supervisor.SvName && supervisor.SvName.toLowerCase().includes(searchTerm)) ||
        (supervisor.SvEmail && supervisor.SvEmail.toLowerCase().includes(searchTerm)) ||
        (supervisor.expertise_areas && supervisor.expertise_areas.toLowerCase().includes(searchTerm))
    );
    
    renderSupervisors(filteredSupervisors);
}

// Show add modal
function showAddModal() {
    document.getElementById('modalTitle').textContent = 'Add New Supervisor';
    document.getElementById('supervisorId').value = '';
    supervisorForm.reset();
    supervisorModal.style.display = 'block';
}

// Show edit modal
async function showEditModal(supervisorId) {
    try {
        const response = await fetch(`/api/admin/supervisors/${supervisorId}`);
        const data = await response.json();
        
        if (data.supervisor) {
            const supervisor = data.supervisor;
            
            document.getElementById('modalTitle').textContent = 'Edit Supervisor';
            document.getElementById('supervisorId').value = supervisor.SupervisorID;
            document.getElementById('name').value = supervisor.SvName;
            document.getElementById('email').value = supervisor.SvEmail || '';
            document.getElementById('expertise').value = supervisor.expertise_areas || '';
            
            supervisorModal.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading supervisor details:', error);
        alert('Failed to load supervisor details. Please try again.');
    }
}

// Show delete confirmation modal
function showDeleteModal(supervisorId) {
    deleteSupervisorId = supervisorId;
    deleteModal.style.display = 'block';
}

// Save (create or update) supervisor
async function saveSupervisor() {
    // Get form values
    const supervisorId = document.getElementById('supervisorId').value;
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const expertise = document.getElementById('expertise').value;
    
    // Validate required fields
    if (!name || !email) {
        alert('Please fill in all required fields.');
        return;
    }
    
    const supervisorData = {
        SvName: name,
        SvEmail: email,
        expertise: expertise || '' // Ensure expertise is never undefined
    };
    
    try {
        let response;
        
        if (supervisorId) {
            // Update existing supervisor
            response = await fetch(`/api/admin/supervisors/${supervisorId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(supervisorData)
            });
        } else {
            // Create new supervisor
            response = await fetch('/api/admin/supervisors', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(supervisorData)
            });
        }
        
        const data = await response.json();
        
        if (data.success) {
            supervisorModal.style.display = 'none';
            loadSupervisors(); // Reload the supervisors list
        } else {
            alert(`Error: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error saving supervisor:', error);
        alert('Failed to save supervisor. Please try again.');
    }
}

// Delete supervisor
async function deleteSupervisor() {
    if (!deleteSupervisorId) return;
    
    try {
        const response = await fetch(`/api/admin/supervisors/${deleteSupervisorId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            deleteModal.style.display = 'none';
            loadSupervisors(); // Reload the supervisors list
        } else {
            alert(`Error: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error deleting supervisor:', error);
        alert('Failed to delete supervisor. Please try again.');
    }
}