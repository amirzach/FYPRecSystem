// Global variables
let projects = [];
let supervisors = [];
let deleteProjectId = null;

// DOM Elements
const projectTableBody = document.getElementById('projectTableBody');
const projectModal = document.getElementById('projectModal');
const deleteModal = document.getElementById('deleteModal');
const projectForm = document.getElementById('projectForm');
const searchInput = document.getElementById('searchInput');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    loadProjects();
    loadSupervisors();
    
    // Add event listeners
    document.getElementById('addNewBtn').addEventListener('click', showAddModal);
    document.getElementById('saveProjectBtn').addEventListener('click', saveProject);
    document.getElementById('confirmDeleteBtn').addEventListener('click', deleteProject);
    document.getElementById('closeProjectModal').addEventListener('click', () => projectModal.style.display = 'none');
    document.getElementById('cancelProjectBtn').addEventListener('click', () => projectModal.style.display = 'none');
    document.getElementById('closeDeleteModal').addEventListener('click', () => deleteModal.style.display = 'none');
    document.getElementById('cancelDeleteBtn').addEventListener('click', () => deleteModal.style.display = 'none');
    searchInput.addEventListener('input', filterProjects);
    
    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target === projectModal) {
            projectModal.style.display = 'none';
        }
        if (event.target === deleteModal) {
            deleteModal.style.display = 'none';
        }
    });
});

// Load all projects
async function loadProjects() {
    try {
        const response = await fetch('/api/admin/fyp');
        const data = await response.json();
        
        if (data.projects) {
            projects = data.projects;
            renderProjects(projects);
        }
    } catch (error) {
        console.error('Error loading projects:', error);
        alert('Failed to load projects. Please try again.');
    }
}

// Load all supervisors for dropdown
async function loadSupervisors() {
    try {
        const response = await fetch('/api/admin/supervisors');
        const data = await response.json();
        
        if (data.supervisors) {
            supervisors = data.supervisors;
            const supervisorSelect = document.getElementById('supervisor');
            
            // Clear existing options except the first one
            while (supervisorSelect.options.length > 1) {
                supervisorSelect.remove(1);
            }
            
            // Add supervisor options
            supervisors.forEach(supervisor => {
                const option = document.createElement('option');
                option.value = supervisor.SupervisorID;
                option.textContent = supervisor.SvName;
                supervisorSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading supervisors:', error);
        alert('Failed to load supervisors. Please try again.');
    }
}

// Render projects in table
function renderProjects(projectsList) {
    projectTableBody.innerHTML = '';
    
    projectsList.forEach(project => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${project.ProjectID}</td>
            <td>${project.Title}</td>
            <td>${project.Author}</td>
            <td>${project.Year}</td>
            <td>${project.SupervisorName || 'N/A'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-info" onclick="showEditModal(${project.ProjectID})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger" onclick="showDeleteModal(${project.ProjectID})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        projectTableBody.appendChild(row);
    });
}

// Filter projects based on search input
function filterProjects() {
    const searchTerm = searchInput.value.toLowerCase();
    
    const filteredProjects = projects.filter(project => 
        project.Title.toLowerCase().includes(searchTerm) ||
        project.Author.toLowerCase().includes(searchTerm) ||
        (project.Abstract && project.Abstract.toLowerCase().includes(searchTerm)) ||
        project.Year.toString().includes(searchTerm) ||
        (project.SupervisorName && project.SupervisorName.toLowerCase().includes(searchTerm))
    );
    
    renderProjects(filteredProjects);
}

// Show add modal
function showAddModal() {
    document.getElementById('modalTitle').textContent = 'Add New Project';
    document.getElementById('projectId').value = '';
    projectForm.reset();
    projectModal.style.display = 'block';
}

// Show edit modal
async function showEditModal(projectId) {
    try {
        const response = await fetch(`/api/admin/fyp/${projectId}`);
        const data = await response.json();
        
        if (data.project) {
            const project = data.project;
            
            document.getElementById('modalTitle').textContent = 'Edit Project';
            document.getElementById('projectId').value = project.ProjectID;
            document.getElementById('title').value = project.Title;
            document.getElementById('author').value = project.Author;
            document.getElementById('abstract').value = project.Abstract || '';
            document.getElementById('year').value = project.Year;
            document.getElementById('supervisor').value = project.SupervisorID;
            
            projectModal.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading project details:', error);
        alert('Failed to load project details. Please try again.');
    }
}

// Show delete confirmation modal
function showDeleteModal(projectId) {
    deleteProjectId = projectId;
    deleteModal.style.display = 'block';
}

// Save (create or update) project
async function saveProject() {
    // Get form values
    const projectId = document.getElementById('projectId').value;
    const title = document.getElementById('title').value;
    const author = document.getElementById('author').value;
    const abstract = document.getElementById('abstract').value;
    const year = document.getElementById('year').value;
    const supervisorId = document.getElementById('supervisor').value;
    
    // Validate required fields
    if (!title || !author || !year || !supervisorId) {
        alert('Please fill in all required fields.');
        return;
    }
    
    const projectData = {
        Title: title,
        Author: author,
        Abstract: abstract,
        Year: parseInt(year),
        SupervisorID: parseInt(supervisorId)
    };
    
    try {
        let response;
        
        if (projectId) {
            // Update existing project
            response = await fetch(`/api/admin/fyp/${projectId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(projectData)
            });
        } else {
            // Create new project
            response = await fetch('/api/admin/fyp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(projectData)
            });
        }
        
        const data = await response.json();
        
        if (data.success) {
            projectModal.style.display = 'none';
            loadProjects(); // Reload the projects list
        } else {
            alert(`Error: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error saving project:', error);
        alert('Failed to save project. Please try again.');
    }
}

// Delete project
async function deleteProject() {
    if (!deleteProjectId) return;
    
    try {
        const response = await fetch(`/api/admin/fyp/${deleteProjectId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            deleteModal.style.display = 'none';
            loadProjects(); // Reload the projects list
        } else {
            alert(`Error: ${data.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error deleting project:', error);
        alert('Failed to delete project. Please try again.');
    }
}