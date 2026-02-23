/**
 * integration.js - COMPLETE FIX for all Ezee Money issues
 * This single file replaces everything and fixes:
 * 1. Admin dashboard fetching from JSON files
 * 2. Photos appearing INSIDE the boxes
 * 3. Proper submission to GitHub
 * 4. No more double photo taking
 */

// ==================== CONFIGURATION MANAGER ====================
const CONFIG = {
    repoOwner: 'BarasaGodwilTech',
    repoName: 'Ezee-money',
    branch: 'main',
    token: ''
};

// ==================== GLOBAL STATE ====================
window.AppState = {
    submissions: [],
    agents: [],
    config: { ...CONFIG },
    images: {
        idFront: null,
        idBack: null,
        agentPhoto: null
    }
};

// ==================== GITHUB API SERVICE ====================
const GitHubAPI = {
    // Load configuration from gitconfig.json
    async loadConfig() {
        try {
            const response = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/gitconfig.json`, {
                headers: { 'Accept': 'application/vnd.github.v3+json' }
            });
            
            if (response.ok) {
                const data = await response.json();
                const config = JSON.parse(atob(data.content));
                window.AppState.config = { ...window.AppState.config, ...config };
                localStorage.setItem('ezeeAdminConfig', JSON.stringify({ github: config }));
                return config;
            }
        } catch (e) {
            console.log('No gitconfig.json found, using defaults');
        }
        
        // Try localStorage
        const saved = localStorage.getItem('ezeeAdminConfig');
        if (saved) {
            try {
                const config = JSON.parse(saved).github;
                window.AppState.config = { ...window.AppState.config, ...config };
                return config;
            } catch (e) {}
        }
        
        return window.AppState.config;
    },
    
    // Save configuration to gitconfig.json
    async saveConfig(config) {
        try {
            window.AppState.config = { ...window.AppState.config, ...config };
            
            // Get existing file SHA
            let sha = null;
            const checkResponse = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/gitconfig.json`, {
                headers: {
                    'Authorization': `token ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (checkResponse.ok) {
                const data = await checkResponse.json();
                sha = data.sha;
            }
            
            // Save to GitHub
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(config, null, 2))));
            const response = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/gitconfig.json`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Update GitHub configuration',
                    content: content,
                    branch: 'main',
                    sha: sha
                })
            });
            
            if (!response.ok) throw new Error('Failed to save config');
            
            localStorage.setItem('ezeeAdminConfig', JSON.stringify({ github: config }));
            return true;
        } catch (error) {
            console.error('Save config error:', error);
            throw error;
        }
    },
    
    // Fetch data.json (submissions)
    async fetchSubmissions() {
        try {
            const response = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/data.json`, {
                headers: {
                    'Authorization': `token ${window.AppState.config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const content = JSON.parse(atob(data.content));
                window.AppState.submissions = content.agents || [];
                return window.AppState.submissions;
            }
            return [];
        } catch (error) {
            console.error('Fetch submissions error:', error);
            return [];
        }
    },
    
    // Fetch agents.json
    async fetchAgents() {
        try {
            const response = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/agents.json`, {
                headers: {
                    'Authorization': `token ${window.AppState.config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const content = JSON.parse(atob(data.content));
                window.AppState.agents = content.agents || [];
                return window.AppState.agents;
            }
            return [];
        } catch (error) {
            console.error('Fetch agents error:', error);
            return [];
        }
    },
    
    // Upload image
    async uploadImage(submissionId, type, file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const base64Data = e.target.result.split(',')[1];
                    const filename = `images/${submissionId}_${type}_${Date.now()}.jpg`;
                    
                    const response = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/${filename}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `token ${window.AppState.config.token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            message: `Upload ${type} for ${submissionId}`,
                            content: base64Data,
                            branch: 'main'
                        })
                    });
                    
                    if (response.ok) {
                        resolve(`https://raw.githubusercontent.com/BarasaGodwilTech/Ezee-money/main/${filename}`);
                    } else {
                        reject(new Error('Upload failed'));
                    }
                } catch (error) {
                    reject(error);
                }
            };
            reader.readAsDataURL(file);
        });
    },
    
    // Save submission to data.json
    async saveSubmission(submission) {
        try {
            // Get existing data
            let existingData = { agents: [] };
            let sha = null;
            
            const response = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/data.json`, {
                headers: {
                    'Authorization': `token ${window.AppState.config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                existingData = JSON.parse(atob(data.content));
                sha = data.sha;
            }
            
            // Add new submission
            existingData.agents.push(submission);
            existingData.lastUpdated = new Date().toISOString();
            
            // Save back
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(existingData, null, 2))));
            const saveResponse = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/data.json`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${window.AppState.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `New submission from ${submission.fullName}`,
                    content: content,
                    branch: 'main',
                    sha: sha
                })
            });
            
            if (!saveResponse.ok) throw new Error('Failed to save submission');
            return submission.id;
        } catch (error) {
            console.error('Save submission error:', error);
            throw error;
        }
    },
    
    // Save agents to agents.json
    async saveAgents(agents) {
        try {
            let sha = null;
            
            const response = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/agents.json`, {
                headers: {
                    'Authorization': `token ${window.AppState.config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                sha = data.sha;
            }
            
            const data = {
                agents: agents,
                lastUpdated: new Date().toISOString(),
                totalAgents: agents.length
            };
            
            const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
            const saveResponse = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/agents.json`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${window.AppState.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Update agents list',
                    content: content,
                    branch: 'main',
                    sha: sha
                })
            });
            
            if (!saveResponse.ok) throw new Error('Failed to save agents');
            return true;
        } catch (error) {
            console.error('Save agents error:', error);
            throw error;
        }
    }
};

// ==================== FIELD AGENT PAGE FIXES ====================
(function fixFieldAgentPage() {
    if (!window.location.pathname.includes('submit.html')) return;
    
    console.log('🔧 Fixing field agent page...');
    
    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupFieldAgentPage);
    } else {
        setupFieldAgentPage();
    }
    
    function setupFieldAgentPage() {
        // Clear any existing data
        window.AppState.images = {
            idFront: null,
            idBack: null,
            agentPhoto: null
        };
        
        // Setup all photo upload areas
        setupPhotoUpload('idFront', 'idFrontUpload', 'idFrontInput', 'idFrontPreview', 'idFrontImage');
        setupPhotoUpload('idBack', 'idBackUpload', 'idBackInput', 'idBackPreview', 'idBackImage');
        setupPhotoUpload('agentPhoto', 'agentPhotoUpload', 'agentPhotoInput', 'agentPhotoPreview', 'agentPhotoImage');
        
        // Setup remove buttons
        setupRemoveButtons();
        
        // Setup submit button
        setupSubmitButton();
        
        // Apply gallery settings
        applyGallerySettings();
    }
    
    function setupPhotoUpload(type, uploadId, inputId, previewId, imageId) {
        const uploadArea = document.getElementById(uploadId);
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        const img = document.getElementById(imageId);
        
        if (!uploadArea || !input) return;
        
        // Style the upload area for proper image display
        uploadArea.style.position = 'relative';
        uploadArea.style.overflow = 'hidden';
        uploadArea.style.backgroundSize = 'cover';
        uploadArea.style.backgroundPosition = 'center';
        uploadArea.style.transition = 'all 0.3s';
        
        // Remove all existing event listeners by cloning
        const newUploadArea = uploadArea.cloneNode(true);
        uploadArea.parentNode.replaceChild(newUploadArea, uploadArea);
        
        // Get new references
        const newInput = document.getElementById(inputId);
        const newPreview = document.getElementById(previewId);
        const newImg = document.getElementById(imageId);
        
        // Click handler
        newUploadArea.addEventListener('click', function(e) {
            if (e.target.classList.contains('remove-photo-btn')) return;
            newInput.click();
        });
        
        // Change handler
        newInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(readerEvent) {
                // Store the file
                window.AppState.images[type] = file;
                
                // Set as background image of the upload area
                newUploadArea.style.backgroundImage = `url('${readerEvent.target.result}')`;
                
                // Hide the icons/text by making them semi-transparent
                const icon = newUploadArea.querySelector('.photo-icon');
                const textElements = newUploadArea.querySelectorAll('p, strong');
                
                if (icon) icon.style.opacity = '0.2';
                textElements.forEach(el => el.style.opacity = '0.2');
                
                // Add checkmark
                let checkmark = newUploadArea.querySelector('.photo-checkmark');
                if (!checkmark) {
                    checkmark = document.createElement('div');
                    checkmark.className = 'photo-checkmark';
                    checkmark.innerHTML = '✓';
                    checkmark.style.cssText = `
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        width: 30px;
                        height: 30px;
                        background: #28a745;
                        color: white;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 18px;
                        font-weight: bold;
                        z-index: 10;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    `;
                    newUploadArea.appendChild(checkmark);
                }
                
                // Add remove button if not exists
                let removeBtn = newUploadArea.querySelector('.remove-photo-btn');
                if (!removeBtn) {
                    removeBtn = document.createElement('div');
                    removeBtn.className = 'remove-photo-btn';
                    removeBtn.innerHTML = '×';
                    removeBtn.style.cssText = `
                        position: absolute;
                        top: 10px;
                        left: 10px;
                        width: 30px;
                        height: 30px;
                        background: #dc3545;
                        color: white;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 20px;
                        font-weight: bold;
                        z-index: 10;
                        cursor: pointer;
                        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    `;
                    removeBtn.dataset.target = type;
                    removeBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        removePhoto(type, newUploadArea, newInput);
                    });
                    newUploadArea.appendChild(removeBtn);
                }
                
                // Hide the old preview
                if (newPreview) newPreview.classList.add('hidden');
                
                console.log(`✅ ${type} photo captured`);
            };
            reader.readAsDataURL(file);
        });
    }
    
    function removePhoto(type, uploadArea, input) {
        // Clear from state
        window.AppState.images[type] = null;
        
        // Reset background
        uploadArea.style.backgroundImage = '';
        
        // Show icons/text again
        const icon = uploadArea.querySelector('.photo-icon');
        const textElements = uploadArea.querySelectorAll('p, strong');
        
        if (icon) icon.style.opacity = '1';
        textElements.forEach(el => el.style.opacity = '1');
        
        // Remove checkmark and remove button
        const checkmark = uploadArea.querySelector('.photo-checkmark');
        const removeBtn = uploadArea.querySelector('.remove-photo-btn');
        
        if (checkmark) checkmark.remove();
        if (removeBtn) removeBtn.remove();
        
        // Clear input
        if (input) input.value = '';
    }
    
    function setupRemoveButtons() {
        // Handle the original remove buttons if they exist
        document.querySelectorAll('.remove-photo').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                const target = this.dataset.target;
                const uploadArea = document.getElementById(target + 'Upload');
                const input = document.getElementById(target + 'Input');
                
                if (uploadArea && input) {
                    removePhoto(target, uploadArea, input);
                }
            });
        });
    }
    
    function setupSubmitButton() {
        const submitBtn = document.getElementById('submitBtn');
        if (!submitBtn) return;
        
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        
        newSubmitBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            
            try {
                // Check photos
                const missingPhotos = [];
                if (!window.AppState.images.idFront) missingPhotos.push('ID Front');
                if (!window.AppState.images.idBack) missingPhotos.push('ID Back');
                if (!window.AppState.images.agentPhoto) missingPhotos.push('Agent Photo');
                
                if (missingPhotos.length > 0) {
                    alert(`Please upload: ${missingPhotos.join(', ')}`);
                    return;
                }
                
                // Check form fields
                const formData = {
                    fullName: document.getElementById('fullName')?.value,
                    personalNumber: document.getElementById('personalNumber')?.value,
                    email: document.getElementById('email')?.value,
                    nationalId: document.getElementById('nationalId')?.value,
                    dob: document.getElementById('dob')?.value,
                    gender: document.getElementById('gender')?.value,
                    businessAddress: document.getElementById('businessAddress')?.value,
                    residentialAddress: document.getElementById('residentialAddress')?.value,
                    nextOfKinName: document.getElementById('nextOfKinName')?.value,
                    nextOfKinRelationship: document.getElementById('nextOfKinRelationship')?.value,
                    nextOfKinPhone: document.getElementById('nextOfKinPhone')?.value
                };
                
                const missingFields = Object.entries(formData).filter(([_, v]) => !v).map(([k]) => k);
                if (missingFields.length > 0) {
                    alert('Please fill all fields');
                    return;
                }
                
                // Load config
                await GitHubAPI.loadConfig();
                
                if (!window.AppState.config.token) {
                    alert('System not configured. Please contact admin.');
                    return;
                }
                
                // Show loading
                newSubmitBtn.disabled = true;
                newSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
                
                // Upload images
                const submissionId = 'AGENT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 3);
                
                const [idFrontUrl, idBackUrl, agentPhotoUrl] = await Promise.all([
                    GitHubAPI.uploadImage(submissionId, 'idFront', window.AppState.images.idFront),
                    GitHubAPI.uploadImage(submissionId, 'idBack', window.AppState.images.idBack),
                    GitHubAPI.uploadImage(submissionId, 'agentPhoto', window.AppState.images.agentPhoto)
                ]);
                
                // Create submission
                const submission = {
                    id: submissionId,
                    ...formData,
                    tradingName: `SC${formData.personalNumber}`,
                    submissionDate: new Date().toISOString(),
                    status: 'pending',
                    emailVerified: false,
                    adminVerified: false,
                    idFrontUrl,
                    idBackUrl,
                    agentPhotoUrl
                };
                
                // Save to data.json
                await GitHubAPI.saveSubmission(submission);
                
                // Show success
                document.querySelector('.form-container').classList.add('hidden');
                document.getElementById('successMessage').classList.remove('hidden');
                document.getElementById('submissionId').textContent = submissionId;
                
            } catch (error) {
                console.error('Submission error:', error);
                alert('Submission failed: ' + error.message);
                newSubmitBtn.disabled = false;
                newSubmitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Agent Registration';
            }
        });
    }
    
    async function applyGallerySettings() {
        await GitHubAPI.loadConfig();
        const galleryEnabled = window.AppState.config.galleryUploadEnabled;
        
        const fileInputs = document.querySelectorAll('input[type="file"]');
        fileInputs.forEach(input => {
            if (galleryEnabled) {
                input.removeAttribute('capture');
            } else {
                input.setAttribute('capture', 'environment');
            }
        });
        
        // Add indicator
        const indicator = document.createElement('div');
        indicator.style.cssText = `
            background: ${galleryEnabled ? '#ffc107' : '#28a745'};
            color: white;
            padding: 8px 15px;
            border-radius: 20px;
            font-size: 13px;
            margin-bottom: 15px;
            display: inline-block;
        `;
        indicator.innerHTML = galleryEnabled ? 
            '📱 Gallery + Camera Mode' : 
            '📸 Camera Only Mode';
        
        const photoSection = document.querySelector('.photo-section');
        if (photoSection && !photoSection.querySelector('.mode-indicator')) {
            indicator.className = 'mode-indicator';
            photoSection.insertBefore(indicator, photoSection.firstChild);
        }
    }
})();

// ==================== ADMIN DASHBOARD FIXES ====================
(function fixAdminDashboard() {
    if (!window.location.pathname.includes('dashboard.html')) return;
    
    console.log('🔧 Fixing admin dashboard...');
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupAdminDashboard);
    } else {
        setupAdminDashboard();
    }
    
    async function setupAdminDashboard() {
        await GitHubAPI.loadConfig();
        
        if (window.AppState.config.token) {
            // Load initial data
            await loadDashboardData();
            
            // Start polling for updates
            startPolling();
            
            // Fix GitHub config form
            fixGitHubConfigForm();
            
            // Fix agent management
            fixAgentManagement();
        }
    }
    
    async function loadDashboardData() {
        await GitHubAPI.fetchSubmissions();
        await GitHubAPI.fetchAgents();
        
        updateSubmissionsTable();
        updateAgentsList();
        updateStats();
    }
    
    function updateSubmissionsTable() {
        const tbody = document.querySelector('#submissionsTable tbody');
        if (!tbody) return;
        
        if (window.AppState.submissions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No submissions found</td></tr>';
            return;
        }
        
        tbody.innerHTML = window.AppState.submissions.map(sub => `
            <tr>
                <td>${sub.personalNumber || 'N/A'}</td>
                <td>${sub.fullName || 'N/A'}</td>
                <td>${new Date(sub.submissionDate).toLocaleDateString()}</td>
                <td><span class="status-badge status-${sub.status}">${sub.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="viewSubmissionDetails('${sub.id}')">View</button>
                </td>
            </tr>
        `).join('');
    }
    
    function updateAgentsList() {
        const agentList = document.getElementById('agentList');
        if (!agentList) return;
        
        if (window.AppState.agents.length === 0) {
            agentList.innerHTML = '<p style="text-align: center;">No field agents configured</p>';
            return;
        }
        
        agentList.innerHTML = window.AppState.agents.map(agent => `
            <div class="agent-item">
                <div class="agent-info">
                    <div class="agent-name">${agent.fullName}</div>
                    <div class="agent-details">SC Code: ${agent.scCode} | Status: ${agent.status}</div>
                </div>
                <div class="agent-actions">
                    <button class="btn btn-sm btn-warning" onclick="editAgent('${agent.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteAgent('${agent.id}')">Delete</button>
                </div>
            </div>
        `).join('');
    }
    
    function updateStats() {
        document.getElementById('totalAgents').textContent = window.AppState.agents.length;
        document.getElementById('totalSubmissions').textContent = window.AppState.submissions.length;
        
        const today = new Date().toDateString();
        const todayCount = window.AppState.submissions.filter(s => 
            new Date(s.submissionDate).toDateString() === today
        ).length;
        document.getElementById('todaySubmissions').textContent = todayCount;
        
        const activeAgents = window.AppState.agents.filter(a => a.status === 'active').length;
        document.getElementById('activeAgents').textContent = activeAgents;
    }
    
    function startPolling() {
        setInterval(async () => {
            await GitHubAPI.fetchSubmissions();
            await GitHubAPI.fetchAgents();
            updateSubmissionsTable();
            updateAgentsList();
            updateStats();
        }, 3000);
    }
    
    function fixGitHubConfigForm() {
        const form = document.getElementById('githubConfigForm');
        if (!form) return;
        
        // Pre-fill form
        document.getElementById('repoOwner').value = window.AppState.config.repoOwner;
        document.getElementById('repoName').value = window.AppState.config.repoName;
        document.getElementById('branchName').value = window.AppState.config.branchName;
        document.getElementById('githubToken').value = window.AppState.config.token;
        
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const config = {
                repoOwner: document.getElementById('repoOwner').value,
                repoName: document.getElementById('repoName').value,
                branchName: document.getElementById('branchName').value,
                token: document.getElementById('githubToken').value,
                galleryUploadEnabled: window.AppState.config.galleryUploadEnabled || false
            };
            
            try {
                await GitHubAPI.saveConfig(config);
                alert('Configuration saved successfully!');
            } catch (error) {
                alert('Error saving configuration: ' + error.message);
            }
        });
    }
    
    function fixAgentManagement() {
        // Override add agent
        const addButton = document.querySelector('.card-header .btn-primary');
        if (addButton && addButton.textContent.includes('Add New Agent')) {
            addButton.onclick = showAddAgentModal;
        }
    }
    
    window.showAddAgentModal = async function() {
        const fullName = prompt('Enter agent full name:');
        if (!fullName) return;
        
        const scCode = prompt('Enter agent SC code:');
        if (!scCode) return;
        
        const password = prompt('Enter agent password:');
        if (!password) return;
        
        const newAgent = {
            id: Date.now().toString(),
            fullName,
            scCode,
            password,
            status: 'active',
            createdAt: new Date().toISOString()
        };
        
        window.AppState.agents.push(newAgent);
        await GitHubAPI.saveAgents(window.AppState.agents);
        updateAgentsList();
    };
    
    window.editAgent = async function(agentId) {
        const agent = window.AppState.agents.find(a => a.id === agentId);
        if (!agent) return;
        
        const fullName = prompt('Edit agent name:', agent.fullName);
        if (fullName) agent.fullName = fullName;
        
        const scCode = prompt('Edit SC code:', agent.scCode);
        if (scCode) agent.scCode = scCode;
        
        const status = prompt('Edit status (active/inactive):', agent.status);
        if (status && ['active', 'inactive'].includes(status)) agent.status = status;
        
        await GitHubAPI.saveAgents(window.AppState.agents);
        updateAgentsList();
    };
    
    window.deleteAgent = async function(agentId) {
        if (!confirm('Delete this agent?')) return;
        
        window.AppState.agents = window.AppState.agents.filter(a => a.id !== agentId);
        await GitHubAPI.saveAgents(window.AppState.agents);
        updateAgentsList();
    };
})();

// ==================== VIEW SUBMISSION DETAILS ====================
window.viewSubmissionDetails = function(submissionId) {
    const submission = window.AppState.submissions.find(s => s.id === submissionId);
    if (!submission) return;
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;
    
    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 15px; max-width: 800px; max-height: 90vh; overflow-y: auto;">
            <button onclick="this.parentElement.parentElement.remove()" style="float: right; background: #dc3545; color: white; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer;">×</button>
            <h2 style="margin-bottom: 20px;">Submission Details</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                    <h3>Client Information</h3>
                    <p><strong>Name:</strong> ${submission.fullName}</p>
                    <p><strong>Personal Number:</strong> ${submission.personalNumber}</p>
                    <p><strong>Email:</strong> ${submission.email}</p>
                    <p><strong>National ID:</strong> ${submission.nationalId}</p>
                </div>
                <div>
                    <h3>Next of Kin</h3>
                    <p><strong>Name:</strong> ${submission.nextOfKinName}</p>
                    <p><strong>Relationship:</strong> ${submission.nextOfKinRelationship}</p>
                    <p><strong>Phone:</strong> ${submission.nextOfKinPhone}</p>
                </div>
            </div>
            <div style="margin-top: 20px;">
                <h3>Images</h3>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                    ${submission.idFrontUrl ? `
                        <div>
                            <p><strong>ID Front:</strong></p>
                            <img src="${submission.idFrontUrl}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px;">
                        </div>
                    ` : ''}
                    ${submission.idBackUrl ? `
                        <div>
                            <p><strong>ID Back:</strong></p>
                            <img src="${submission.idBackUrl}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px;">
                        </div>
                    ` : ''}
                    ${submission.agentPhotoUrl ? `
                        <div>
                            <p><strong>Agent Photo:</strong></p>
                            <img src="${submission.agentPhotoUrl}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px;">
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
};

console.log('✅ All fixes applied!');