/**
 * integration.js - Ezee Money System Integration Layer
 * CORRECTED VERSION - Stores only image URLs in JSON, not the actual image data
 */

// ==================== Configuration Management ====================

class ConfigManager {
    constructor() {
        this.configFile = 'gitconfig.json';
        this.baseURL = 'https://api.github.com';
    }

    /**
     * Load GitHub configuration from gitconfig.json
     */
    async loadConfig() {
        try {
            // Try to load from GitHub first
            const response = await fetch(`${this.baseURL}/repos/BarasaGodwilTech/Ezee-money/contents/${this.configFile}`, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const content = JSON.parse(atob(data.content));
                
                // Cache in localStorage
                localStorage.setItem('ezeeAdminConfig', JSON.stringify({ github: content }));
                
                return content;
            } else {
                // Fallback to localStorage or default
                const saved = localStorage.getItem('ezeeAdminConfig');
                if (saved) {
                    const config = JSON.parse(saved);
                    return config.github || {};
                }
            }
        } catch (error) {
            console.error('Error loading config:', error);
            // Return default config
            return {
                repoOwner: 'BarasaGodwilTech',
                repoName: 'Ezee-money',
                branchName: 'main',
                token: ''
            };
        }
    }

    /**
     * Save configuration to gitconfig.json
     */
    async saveConfig(config) {
        try {
            // Get current file SHA if exists
            let sha = null;
            try {
                const checkResponse = await fetch(`${this.baseURL}/repos/BarasaGodwilTech/Ezee-money/contents/${this.configFile}`, {
                    headers: {
                        'Authorization': `token ${config.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (checkResponse.ok) {
                    const data = await checkResponse.json();
                    sha = data.sha;
                }
            } catch (error) {
                // File doesn't exist, that's okay
            }

            // Prepare file content
            const jsonContent = JSON.stringify(config, null, 2);
            const base64Content = btoa(unescape(encodeURIComponent(jsonContent)));

            // Save to GitHub
            const response = await fetch(`${this.baseURL}/repos/BarasaGodwilTech/Ezee-money/contents/${this.configFile}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Update GitHub configuration',
                    content: base64Content,
                    branch: 'main',
                    sha: sha
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save configuration');
            }

            // Update localStorage
            localStorage.setItem('ezeeAdminConfig', JSON.stringify({ github: config }));

            return await response.json();
        } catch (error) {
            console.error('Error saving config:', error);
            throw error;
        }
    }
}

// ==================== Data Synchronization Service ====================

class DataSyncService {
    constructor() {
        this.baseURL = 'https://api.github.com';
        this.repoOwner = 'BarasaGodwilTech';
        this.repoName = 'Ezee-money';
        this.branch = 'main';
        this.pollingInterval = 5000; // 5 seconds
        this.isPolling = false;
        this.lastKnownState = {
            submissionsHash: null,
            agentsHash: null,
            dataHash: null
        };
        this.subscribers = [];
    }

    /**
     * Initialize with GitHub token
     */
    async init(token) {
        if (token) {
            this.token = token;
            return true;
        }
        
        // Try to load from config
        const config = await new ConfigManager().loadConfig();
        this.token = config.token;
        return !!this.token;
    }

    /**
     * Get file SHA to detect changes
     */
    async getFileSHA(filePath) {
        try {
            const response = await fetch(`${this.baseURL}/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}?ref=${this.branch}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                return data.sha;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get file content
     */
    async getFileContent(filePath) {
        try {
            const response = await fetch(`${this.baseURL}/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}?ref=${this.branch}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`Failed to get file: ${response.status}`);
            }

            const data = await response.json();
            const content = atob(data.content);
            return JSON.parse(content);
        } catch (error) {
            console.error(`Error getting ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Save file content
     */
    async saveFileContent(filePath, content, message) {
        try {
            // Get current file SHA
            let sha = null;
            try {
                const checkResponse = await fetch(`${this.baseURL}/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}?ref=${this.branch}`, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (checkResponse.ok) {
                    const data = await checkResponse.json();
                    sha = data.sha;
                }
            } catch (error) {
                // File doesn't exist
            }

            // Prepare content
            const jsonContent = JSON.stringify(content, null, 2);
            const base64Content = btoa(unescape(encodeURIComponent(jsonContent)));

            // Save to GitHub
            const response = await fetch(`${this.baseURL}/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    content: base64Content,
                    branch: this.branch,
                    sha: sha
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to save ${filePath}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Error saving ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Subscribe to updates
     */
    subscribe(callback) {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter(sub => sub !== callback);
        };
    }

    /**
     * Notify subscribers
     */
    notifySubscribers(data, type) {
        this.subscribers.forEach(callback => {
            try {
                callback(data, type);
            } catch (error) {
                console.error('Subscriber error:', error);
            }
        });
    }

    /**
     * Check for changes
     */
    async checkForChanges() {
        try {
            // Check data.json (submissions)
            const dataSHA = await this.getFileSHA('data.json');
            if (dataSHA && dataSHA !== this.lastKnownState.dataHash) {
                this.lastKnownState.dataHash = dataSHA;
                const data = await this.getFileContent('data.json');
                this.notifySubscribers(data, 'submissions_updated');
            }

            // Check agents.json
            const agentsSHA = await this.getFileSHA('agents.json');
            if (agentsSHA && agentsSHA !== this.lastKnownState.agentsHash) {
                this.lastKnownState.agentsHash = agentsSHA;
                const agents = await this.getFileContent('agents.json');
                this.notifySubscribers(agents, 'agents_updated');
            }

        } catch (error) {
            console.error('Change check error:', error);
        }
    }

    /**
     * Start real-time polling
     */
    startPolling() {
        if (this.isPolling || !this.token) return;
        
        this.isPolling = true;
        console.log('Starting real-time polling...');

        const poll = async () => {
            if (!this.isPolling) return;
            
            await this.checkForChanges();
            setTimeout(poll, this.pollingInterval);
        };

        poll();
    }

    /**
     * Stop polling
     */
    stopPolling() {
        this.isPolling = false;
    }
}

// ==================== Enhanced Submission Handler ====================

class EnhancedSubmissionHandler {
    constructor() {
        this.dataSync = new DataSyncService();
    }

    /**
     * Handle form submission - ONLY STORES URLs, NOT image data
     */
    async handleSubmission(formData, imageFiles) {
        try {
            // Load GitHub token from config
            const config = await new ConfigManager().loadConfig();
            
            if (!config.token) {
                throw new Error('GitHub configuration not found. Please contact admin.');
            }

            await this.dataSync.init(config.token);

            // Create submission object WITHOUT images first
            const submission = {
                id: 'AGENT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 3),
                fullName: formData.fullName,
                personalNumber: formData.personalNumber,
                email: formData.email,
                nationalId: formData.nationalId,
                dob: formData.dob,
                gender: formData.gender,
                businessAddress: formData.businessAddress,
                residentialAddress: formData.residentialAddress,
                nextOfKinName: formData.nextOfKinName,
                nextOfKinRelationship: formData.nextOfKinRelationship,
                nextOfKinPhone: formData.nextOfKinPhone,
                tradingName: `SC${formData.personalNumber}`,
                submissionDate: new Date().toISOString(),
                status: 'pending',
                emailVerified: false,
                adminVerified: false
            };

            // Upload images to GitHub and get URLs
            console.log('Uploading images to GitHub...');
            const imageUrls = await this.uploadImages(submission.id, imageFiles, config.token);

            // Add image URLs to submission
            submission.idFrontUrl = imageUrls.idFront || '';
            submission.idBackUrl = imageUrls.idBack || '';
            submission.agentPhotoUrl = imageUrls.agentPhoto || '';

            // Save ONLY the submission data (with URLs) to data.json
            console.log('Saving submission data to data.json...');
            await this.saveToDataFile(submission, config.token);

            // Clear any localStorage submissions to prevent quota issues
            this.clearLocalStorageSubmissions();

            return {
                success: true,
                submissionId: submission.id
            };

        } catch (error) {
            console.error('Submission error:', error);
            throw error;
        }
    }

    /**
     * Upload images to GitHub images folder
     */
    async uploadImages(submissionId, imageFiles, token) {
        const imageUrls = {};
        const timestamp = Date.now();

        for (const [key, file] of Object.entries(imageFiles)) {
            if (!file) continue;

            try {
                // Convert file to base64
                const base64Data = await this.fileToBase64(file);
                const cleanBase64 = base64Data.split(',')[1];
                
                // Create filename in images folder
                const filename = `images/${submissionId}_${key}_${timestamp}.jpg`;

                // Upload to GitHub
                const response = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/${filename}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Upload ${key} for submission ${submissionId}`,
                        content: cleanBase64,
                        branch: 'main'
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    // Store the raw GitHub URL (not the API URL)
                    imageUrls[key] = `https://raw.githubusercontent.com/BarasaGodwilTech/Ezee-money/main/${filename}`;
                    console.log(`Uploaded ${key}:`, imageUrls[key]);
                } else {
                    const error = await response.json();
                    console.error(`Failed to upload ${key}:`, error);
                }
            } catch (error) {
                console.error(`Error uploading ${key}:`, error);
            }
        }

        return imageUrls;
    }

    /**
     * Convert file to base64
     */
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Save to data.json (ONLY metadata with URLs, NOT image data)
     */
    async saveToDataFile(submission, token) {
        try {
            // Get current submissions from data.json
            let submissions = { agents: [], lastUpdated: new Date().toISOString() };
            
            // Try to fetch existing data.json
            let sha = null;
            const response = await fetch('https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/data.json', {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                submissions = JSON.parse(atob(data.content));
                sha = data.sha;
            }

            // Add new submission (this contains ONLY metadata and image URLs, NOT the actual image data)
            submissions.agents.push(submission);
            submissions.lastUpdated = new Date().toISOString();

            // Save back to GitHub
            const jsonContent = JSON.stringify(submissions, null, 2);
            const base64Content = btoa(unescape(encodeURIComponent(jsonContent)));

            const saveResponse = await fetch('https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/data.json', {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Add new submission from ${submission.fullName}`,
                    content: base64Content,
                    branch: 'main',
                    sha: sha
                })
            });

            if (!saveResponse.ok) {
                const error = await saveResponse.json();
                throw new Error(`Failed to save to data.json: ${error.message}`);
            }

            console.log('Successfully saved to data.json');

        } catch (error) {
            console.error('Error saving to data.json:', error);
            throw error;
        }
    }

    /**
     * Clear localStorage submissions to prevent quota issues
     */
    clearLocalStorageSubmissions() {
        try {
            // Remove large image data from localStorage
            localStorage.removeItem('ezeeSubmissions');
            localStorage.removeItem('adminSubmissions');
            localStorage.removeItem('tempImages');
            console.log('Cleared localStorage submissions');
        } catch (error) {
            console.error('Error clearing localStorage:', error);
        }
    }
}

// ==================== Enhanced Admin Dashboard ====================

class EnhancedAdminDashboard {
    constructor() {
        this.dataSync = new DataSyncService();
        this.configManager = new ConfigManager();
        this.submissions = [];
        this.agents = [];
        this.init();
    }

    /**
     * Initialize dashboard
     */
    async init() {
        // Load configuration
        const config = await this.configManager.loadConfig();
        
        if (config.token) {
            await this.dataSync.init(config.token);
            
            // Subscribe to real-time updates
            this.dataSync.subscribe((data, type) => {
                if (type === 'submissions_updated') {
                    this.handleSubmissionsUpdate(data);
                } else if (type === 'agents_updated') {
                    this.handleAgentsUpdate(data);
                }
            });

            // Start polling
            this.dataSync.startPolling();

            // Load initial data
            await this.loadInitialData();
        }
    }

    /**
     * Handle submissions update
     */
    handleSubmissionsUpdate(data) {
        if (data && data.agents) {
            this.submissions = data.agents;
            this.updateSubmissionsDisplay();
            this.updateStats();
        }
    }

    /**
     * Handle agents update
     */
    handleAgentsUpdate(data) {
        if (data && data.agents) {
            this.agents = data.agents;
            this.updateAgentsDisplay();
            this.updateStats();
        }
    }

    /**
     * Load initial data
     */
    async loadInitialData() {
        // Load submissions from data.json
        const submissionsData = await this.dataSync.getFileContent('data.json');
        if (submissionsData && submissionsData.agents) {
            this.submissions = submissionsData.agents;
            this.updateSubmissionsDisplay();
        }

        // Load agents from agents.json
        const agentsData = await this.dataSync.getFileContent('agents.json');
        if (agentsData && agentsData.agents) {
            this.agents = agentsData.agents;
            this.updateAgentsDisplay();
        }

        this.updateStats();
    }

    /**
     * Update submissions display
     */
    updateSubmissionsDisplay() {
        const tbody = document.querySelector('#submissionsTable tbody');
        if (!tbody) return;

        if (this.submissions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6b7280;">No submissions found</td></tr>';
            return;
        }

        tbody.innerHTML = this.submissions.map(sub => `
            <tr>
                <td>${sub.personalNumber || 'N/A'}</td>
                <td>${sub.fullName || 'N/A'}</td>
                <td>${new Date(sub.submissionDate).toLocaleDateString()}</td>
                <td><span class="status-badge status-${sub.status}">${sub.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="enhancedDashboard.viewSubmission('${sub.id}')">View</button>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Update agents display
     */
    updateAgentsDisplay() {
        const agentList = document.getElementById('agentList');
        if (!agentList) return;

        if (this.agents.length === 0) {
            agentList.innerHTML = '<p style="color: #6b7280; text-align: center;">No field agents configured</p>';
            return;
        }

        agentList.innerHTML = this.agents.map(agent => `
            <div class="agent-item">
                <div class="agent-info">
                    <div class="agent-name">${agent.fullName}</div>
                    <div class="agent-details">SC Code: ${agent.scCode} | Status: ${agent.status}</div>
                </div>
                <div class="agent-actions">
                    <button class="btn btn-sm btn-warning" onclick="enhancedDashboard.editAgent('${agent.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="enhancedDashboard.deleteAgent('${agent.id}')">Delete</button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Update statistics
     */
    updateStats() {
        const totalAgents = document.getElementById('totalAgents');
        const totalSubmissions = document.getElementById('totalSubmissions');
        const todaySubmissions = document.getElementById('todaySubmissions');
        const activeAgents = document.getElementById('activeAgents');

        if (totalAgents) totalAgents.textContent = this.agents.length;
        if (totalSubmissions) totalSubmissions.textContent = this.submissions.length;

        const today = new Date().toDateString();
        const todayCount = this.submissions.filter(s => 
            new Date(s.submissionDate).toDateString() === today
        ).length;
        if (todaySubmissions) todaySubmissions.textContent = todayCount;

        const activeCount = this.agents.filter(a => a.status === 'active').length;
        if (activeAgents) activeAgents.textContent = activeCount;
    }

    /**
     * View submission details - loads images from URLs
     */
    viewSubmission(submissionId) {
        const submission = this.submissions.find(s => s.id === submissionId);
        if (!submission) return;

        // Create modal
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
                <h2 style="color: #1e3c72; margin-bottom: 20px;">Submission Details</h2>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h3>Client Information</h3>
                        <p><strong>Name:</strong> ${submission.fullName}</p>
                        <p><strong>Personal Number:</strong> ${submission.personalNumber}</p>
                        <p><strong>Email:</strong> ${submission.email}</p>
                        <p><strong>National ID:</strong> ${submission.nationalId}</p>
                        <p><strong>DOB:</strong> ${submission.dob}</p>
                        <p><strong>Gender:</strong> ${submission.gender}</p>
                    </div>
                    <div>
                        <h3>Next of Kin</h3>
                        <p><strong>Name:</strong> ${submission.nextOfKinName}</p>
                        <p><strong>Relationship:</strong> ${submission.nextOfKinRelationship}</p>
                        <p><strong>Phone:</strong> ${submission.nextOfKinPhone}</p>
                        <h3 style="margin-top: 20px;">Status</h3>
                        <p><strong>Status:</strong> ${submission.status}</p>
                        <p><strong>Submitted:</strong> ${new Date(submission.submissionDate).toLocaleString()}</p>
                    </div>
                </div>
                <div style="margin-top: 20px;">
                    <h3>Images (loaded from GitHub)</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        ${submission.idFrontUrl ? `
                            <div>
                                <p><strong>ID Front:</strong></p>
                                <img src="${submission.idFrontUrl}" style="max-width: 100%; max-height: 200px; border: 1px solid #ddd;" onerror="this.src='https://via.placeholder.com/200x150?text=Image+Not+Found'">
                            </div>
                        ` : ''}
                        ${submission.idBackUrl ? `
                            <div>
                                <p><strong>ID Back:</strong></p>
                                <img src="${submission.idBackUrl}" style="max-width: 100%; max-height: 200px; border: 1px solid #ddd;" onerror="this.src='https://via.placeholder.com/200x150?text=Image+Not+Found'">
                            </div>
                        ` : ''}
                        ${submission.agentPhotoUrl ? `
                            <div>
                                <p><strong>Agent Photo:</strong></p>
                                <img src="${submission.agentPhotoUrl}" style="max-width: 100%; max-height: 200px; border: 1px solid #ddd;" onerror="this.src='https://via.placeholder.com/200x150?text=Image+Not+Found'">
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    /**
     * Edit agent
     */
    async editAgent(agentId) {
        const agent = this.agents.find(a => a.id === agentId);
        if (!agent) return;

        const fullName = prompt('Edit agent full name:', agent.fullName);
        if (fullName === null) return;

        const scCode = prompt('Edit agent SC code:', agent.scCode);
        if (scCode === null) return;

        const status = prompt('Edit agent status (active/inactive):', agent.status);
        if (status === null) return;

        agent.fullName = fullName || agent.fullName;
        agent.scCode = scCode || agent.scCode;
        agent.status = (status && ['active', 'inactive'].includes(status)) ? status : agent.status;

        // Save to GitHub
        await this.saveAgentsToGitHub();
    }

    /**
     * Delete agent
     */
    async deleteAgent(agentId) {
        if (!confirm('Are you sure you want to delete this agent?')) return;

        this.agents = this.agents.filter(agent => agent.id !== agentId);
        await this.saveAgentsToGitHub();
    }

    /**
     * Save agents to GitHub
     */
    async saveAgentsToGitHub() {
        try {
            const config = await this.configManager.loadConfig();
            const data = {
                agents: this.agents,
                lastUpdated: new Date().toISOString(),
                totalAgents: this.agents.length
            };

            await this.dataSync.saveFileContent('agents.json', data, 'Update agents list');
            alert('Agents saved successfully!');
        } catch (error) {
            console.error('Error saving agents:', error);
            alert('Failed to save agents to GitHub');
        }
    }
}

// ==================== Override Existing Functions ====================

// Global enhanced dashboard instance
let enhancedDashboard;

// Override DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize enhanced features based on current page
    if (window.location.pathname.includes('dashboard.html')) {
        enhancedDashboard = new EnhancedAdminDashboard();
    }
    
    // Override submit handler if on submit page
    if (window.location.pathname.includes('submit.html')) {
        overrideSubmitHandler();
    }
});

/**
 * Override submit handler for submit.html
 */
function overrideSubmitHandler() {
    // Store reference to original submit function
    const originalSubmit = window.handleSubmit;
    
    // Replace with enhanced version
    window.handleSubmit = async function() {
        try {
            const enhancedHandler = new EnhancedSubmissionHandler();
            
            // Show loading
            const submitBtn = document.getElementById('submitBtn');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            submitBtn.disabled = true;
            
            // Collect form data
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

            // Get image files from window.formData (set by photo upload handlers)
            const imageFiles = {
                idFront: window.formData?.idFront,
                idBack: window.formData?.idBack,
                agentPhoto: window.formData?.agentPhoto
            };

            // Validate required images
            if (!imageFiles.idFront || !imageFiles.idBack || !imageFiles.agentPhoto) {
                alert('Please upload all required photos');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                return;
            }

            // Handle submission
            const result = await enhancedHandler.handleSubmission(formData, imageFiles);
            
            if (result.success) {
                showSuccess(result.submissionId);
            }
        } catch (error) {
            alert('Submission failed: ' + error.message);
            console.error(error);
            
            // Reset button
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Agent Registration';
            submitBtn.disabled = false;
        }
    };
}

/**
 * Show success message
 */
function showSuccess(submissionId) {
    const formContainer = document.querySelector('.form-container');
    const successMessage = document.getElementById('successMessage');
    const submitBtn = document.getElementById('submitBtn');
    
    if (formContainer) formContainer.classList.add('hidden');
    if (successMessage) {
        successMessage.classList.remove('hidden');
        const submissionIdEl = document.getElementById('submissionId');
        if (submissionIdEl) submissionIdEl.textContent = submissionId;
    }
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Agent Registration';
        submitBtn.disabled = false;
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ConfigManager,
        DataSyncService,
        EnhancedSubmissionHandler,
        EnhancedAdminDashboard
    };
}
