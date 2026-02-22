/**
 * integration.js - Ezee Money System Integration Layer
 * COMPLETE FIX for all issues: GitHub integration, photo upload, admin controls
 */

// ==================== Global State ====================
let enhancedDashboard = null;
let configManager = null;
let dataSync = null;

// ==================== Configuration Manager ====================
class ConfigManager {
    constructor() {
        this.configFile = 'gitconfig.json';
        this.baseURL = 'https://api.github.com';
        this.rawBaseURL = 'https://raw.githubusercontent.com';
    }

    /**
     * Load GitHub configuration from gitconfig.json
     */
    async loadConfig() {
        try {
            // Try multiple sources in order
            console.log('Loading GitHub configuration...');
            
            // 1. Try GitHub first
            const githubConfig = await this.loadFromGitHub();
            if (githubConfig && githubConfig.token) {
                console.log('Config loaded from GitHub');
                // Cache in localStorage
                localStorage.setItem('ezeeAdminConfig', JSON.stringify({ github: githubConfig }));
                return githubConfig;
            }
            
            // 2. Try localStorage
            const localConfig = this.loadFromLocalStorage();
            if (localConfig && localConfig.token) {
                console.log('Config loaded from localStorage');
                return localConfig;
            }
            
            // 3. Return default
            console.log('Using default config');
            return this.getDefaultConfig();
            
        } catch (error) {
            console.error('Error loading config:', error);
            return this.getDefaultConfig();
        }
    }

    /**
     * Load config from GitHub
     */
    async loadFromGitHub() {
        try {
            const response = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/${this.configFile}`, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const content = JSON.parse(atob(data.content));
                return content;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Load config from localStorage
     */
    loadFromLocalStorage() {
        const saved = localStorage.getItem('ezeeAdminConfig');
        if (saved) {
            try {
                const config = JSON.parse(saved);
                return config.github || null;
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    /**
     * Get default configuration
     */
    getDefaultConfig() {
        return {
            repoOwner: 'BarasaGodwilTech',
            repoName: 'Ezee-money',
            branchName: 'main',
            token: '',
            galleryUploadEnabled: false // Default to camera only
        };
    }

    /**
     * Save configuration to gitconfig.json
     */
    async saveConfig(config) {
        try {
            console.log('Saving configuration to GitHub...', config);
            
            // Get current file SHA if exists
            let sha = null;
            try {
                const checkResponse = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/${this.configFile}`, {
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
                // File doesn't exist
            }

            // Prepare file content
            const jsonContent = JSON.stringify(config, null, 2);
            const base64Content = btoa(unescape(encodeURIComponent(jsonContent)));

            // Save to GitHub
            const response = await fetch(`https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/${this.configFile}`, {
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
                const error = await response.json();
                throw new Error(error.message || 'Failed to save configuration');
            }

            // Update localStorage
            localStorage.setItem('ezeeAdminConfig', JSON.stringify({ github: config }));

            return { success: true };
        } catch (error) {
            console.error('Error saving config:', error);
            throw error;
        }
    }

    /**
     * Toggle gallery upload feature
     */
    async toggleGalleryUpload(enable, token) {
        const config = await this.loadConfig();
        config.galleryUploadEnabled = enable;
        config.token = token || config.token;
        return await this.saveConfig(config);
    }
}

// ==================== Data Sync Service ====================
class DataSyncService {
    constructor() {
        this.baseURL = 'https://api.github.com';
        this.rawBaseURL = 'https://raw.githubusercontent.com';
        this.repoOwner = 'BarasaGodwilTech';
        this.repoName = 'Ezee-money';
        this.branch = 'main';
        this.pollingInterval = 3000; // 3 seconds for real-time feel
        this.isPolling = false;
        this.token = null;
        this.lastKnownState = {
            dataHash: null,
            agentsHash: null
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
        
        const config = await configManager.loadConfig();
        this.token = config.token;
        return !!this.token;
    }

    /**
     * Get file SHA
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
                if (response.status === 404) return null;
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
            } catch (error) {}

            const jsonContent = JSON.stringify(content, null, 2);
            const base64Content = btoa(unescape(encodeURIComponent(jsonContent)));

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
                const error = await response.json();
                throw new Error(error.message || `Failed to save ${filePath}`);
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
            // Check data.json
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
     * Handle form submission
     */
    async handleSubmission(formData, imageFiles) {
        try {
            const config = await configManager.loadConfig();
            
            if (!config.token) {
                throw new Error('GitHub configuration not found. Please contact admin.');
            }

            await this.dataSync.init(config.token);

            // Create submission object
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

            // Upload images
            console.log('Uploading images...');
            const imageUrls = await this.uploadImages(submission.id, imageFiles, config.token);

            // Add URLs to submission
            submission.idFrontUrl = imageUrls.idFront || '';
            submission.idBackUrl = imageUrls.idBack || '';
            submission.agentPhotoUrl = imageUrls.agentPhoto || '';

            // Save to data.json
            console.log('Saving to data.json...');
            await this.saveToDataFile(submission, config.token);

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
     * Upload images to GitHub
     */
    async uploadImages(submissionId, imageFiles, token) {
        const imageUrls = {};
        const timestamp = Date.now();

        for (const [key, file] of Object.entries(imageFiles)) {
            if (!file) continue;

            try {
                // Convert to base64
                const base64Data = await this.fileToBase64(file);
                const cleanBase64 = base64Data.split(',')[1];
                
                const filename = `images/${submissionId}_${key}_${timestamp}.jpg`;

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
     * Save to data.json
     */
    async saveToDataFile(submission, token) {
        try {
            let submissions = { agents: [], lastUpdated: new Date().toISOString() };
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

            submissions.agents.push(submission);
            submissions.lastUpdated = new Date().toISOString();

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
                throw new Error(error.message || 'Failed to save to data.json');
            }

            console.log('Successfully saved to data.json');
        } catch (error) {
            console.error('Error saving to data.json:', error);
            throw error;
        }
    }
}

// ==================== Enhanced Admin Dashboard ====================
class EnhancedAdminDashboard {
    constructor() {
        this.dataSync = new DataSyncService();
        this.configManager = configManager;
        this.submissions = [];
        this.agents = [];
        this.init();
    }

    /**
     * Initialize dashboard
     */
    async init() {
        console.log('Initializing Enhanced Admin Dashboard...');
        
        const config = await this.configManager.loadConfig();
        
        if (config.token) {
            await this.dataSync.init(config.token);
            
            // Subscribe to updates
            this.dataSync.subscribe((data, type) => {
                if (type === 'submissions_updated') {
                    this.handleSubmissionsUpdate(data);
                } else if (type === 'agents_updated') {
                    this.handleAgentsUpdate(data);
                }
            });

            this.dataSync.startPolling();
            await this.loadInitialData();
            this.addGalleryToggleToSettings();
        }
    }

    /**
     * Add gallery toggle to settings
     */
    async addGalleryToggleToSettings() {
        const settingsSection = document.getElementById('settings');
        if (!settingsSection) return;

        const config = await this.configManager.loadConfig();
        
        const toggleHtml = `
            <div class="card" style="margin-top: 20px;">
                <div class="card-header">
                    <h2 class="card-title">Field Agent Camera Settings</h2>
                </div>
                <div style="padding: 20px;">
                    <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                        <div style="flex: 1;">
                            <h3 style="margin-bottom: 10px; color: #333;">Gallery Upload Toggle</h3>
                            <p style="color: #666; margin-bottom: 15px;">
                                When enabled, field agents can upload photos from gallery. When disabled, they can only use camera.
                                Useful when agents are in the field and need to take photos directly.
                            </p>
                            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                                <input type="checkbox" id="galleryUploadToggle" ${config.galleryUploadEnabled ? 'checked' : ''}>
                                <span style="font-weight: 500;">Enable Gallery Upload for Field Agents</span>
                            </label>
                            <button class="btn btn-primary" id="saveGalleryToggle" style="margin-top: 15px;">
                                Save Setting
                            </button>
                            <div id="toggleStatus" style="margin-top: 10px; font-size: 14px;"></div>
                        </div>
                        <div style="flex: 1; background: #f5f5f5; padding: 15px; border-radius: 8px;">
                            <h4 style="margin-bottom: 10px; color: #555;">Current Setting:</h4>
                            <p><strong>Status:</strong> <span style="color: ${config.galleryUploadEnabled ? '#28a745' : '#dc3545'}">${config.galleryUploadEnabled ? 'ENABLED' : 'DISABLED'}</span></p>
                            <p style="font-size: 13px; color: #666; margin-top: 10px;">
                                ${config.galleryUploadEnabled ? 
                                  '✓ Agents can upload from gallery and use camera' : 
                                  '✗ Agents can only use camera (gallery disabled)'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Insert after the configuration management card
        const configCard = settingsSection.querySelector('.card:last-child');
        if (configCard) {
            configCard.insertAdjacentHTML('beforebegin', toggleHtml);
        } else {
            settingsSection.innerHTML += toggleHtml;
        }

        // Add event listener
        document.getElementById('saveGalleryToggle')?.addEventListener('click', async () => {
            await this.toggleGalleryUpload();
        });
    }

    /**
     * Toggle gallery upload
     */
    async toggleGalleryUpload() {
        const toggle = document.getElementById('galleryUploadToggle');
        const statusDiv = document.getElementById('toggleStatus');
        const saveBtn = document.getElementById('saveGalleryToggle');
        
        if (!toggle) return;

        try {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="loading"></span> Saving...';
            
            const config = await this.configManager.loadConfig();
            await this.configManager.toggleGalleryUpload(toggle.checked, config.token);
            
            statusDiv.innerHTML = '<span style="color: #28a745;">✓ Setting saved successfully!</span>';
            
            // Update the info box
            const infoBox = document.querySelector('.card:last-child .flex-1:last-child span');
            if (infoBox) {
                infoBox.style.color = toggle.checked ? '#28a745' : '#dc3545';
                infoBox.textContent = toggle.checked ? 'ENABLED' : 'DISABLED';
            }
            
        } catch (error) {
            statusDiv.innerHTML = `<span style="color: #dc3545;">✗ Error: ${error.message}</span>`;
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'Save Setting';
            
            setTimeout(() => {
                statusDiv.innerHTML = '';
            }, 3000);
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
        const submissionsData = await this.dataSync.getFileContent('data.json');
        if (submissionsData && submissionsData.agents) {
            this.submissions = submissionsData.agents;
            this.updateSubmissionsDisplay();
        }

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
     * View submission details
     */
    viewSubmission(submissionId) {
        const submission = this.submissions.find(s => s.id === submissionId);
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
                    <h3>Images</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        ${submission.idFrontUrl ? `
                            <div>
                                <p><strong>ID Front:</strong></p>
                                <img src="${submission.idFrontUrl}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd;" onerror="this.src='https://via.placeholder.com/200x150?text=Image+Not+Found'">
                            </div>
                        ` : ''}
                        ${submission.idBackUrl ? `
                            <div>
                                <p><strong>ID Back:</strong></p>
                                <img src="${submission.idBackUrl}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd;" onerror="this.src='https://via.placeholder.com/200x150?text=Image+Not+Found'">
                            </div>
                        ` : ''}
                        ${submission.agentPhotoUrl ? `
                            <div>
                                <p><strong>Agent Photo:</strong></p>
                                <img src="${submission.agentPhotoUrl}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd;" onerror="this.src='https://via.placeholder.com/200x150?text=Image+Not+Found'">
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
            alert('Failed to save agents to GitHub: ' + error.message);
        }
    }
}

// ==================== Field Agent Page Enhancements ====================

/**
 * Enhance photo upload areas with proper preview and gallery toggle
 */
function enhancePhotoUploads() {
    const uploadAreas = document.querySelectorAll('.photo-upload-area');
    
    uploadAreas.forEach(area => {
        const input = area.querySelector('input[type="file"]');
        if (!input) return;

        // Remove old event listeners
        const newArea = area.cloneNode(true);
        area.parentNode.replaceChild(newArea, area);
        
        const newInput = newArea.querySelector('input[type="file"]');
        
        newArea.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-photo')) return;
            newInput.click();
        });

        newInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const previewId = newArea.id.replace('Upload', 'Preview');
            const preview = document.getElementById(previewId);
            const img = preview?.querySelector('img');
            
            if (preview && img) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    img.src = e.target.result;
                    preview.classList.remove('hidden');
                    newArea.classList.add('has-image');
                    
                    // Store in window.formData
                    if (!window.formData) window.formData = {};
                    if (newArea.id === 'idFrontUpload') window.formData.idFront = file;
                    else if (newArea.id === 'idBackUpload') window.formData.idBack = file;
                    else if (newArea.id === 'agentPhotoUpload') window.formData.agentPhoto = file;
                };
                reader.readAsDataURL(file);
            }
        });
    });

    // Enhance remove buttons
    document.querySelectorAll('.remove-photo').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = e.currentTarget.dataset.target;
            
            if (target === 'idFront') {
                document.getElementById('idFrontPreview').classList.add('hidden');
                document.getElementById('idFrontUpload').classList.remove('has-image');
                document.getElementById('idFrontInput').value = '';
                if (window.formData) window.formData.idFront = null;
            } else if (target === 'idBack') {
                document.getElementById('idBackPreview').classList.add('hidden');
                document.getElementById('idBackUpload').classList.remove('has-image');
                document.getElementById('idBackInput').value = '';
                if (window.formData) window.formData.idBack = null;
            } else if (target === 'agentPhoto') {
                document.getElementById('agentPhotoPreview').classList.add('hidden');
                document.getElementById('agentPhotoUpload').classList.remove('has-image');
                document.getElementById('agentPhotoInput').value = '';
                if (window.formData) window.formData.agentPhoto = null;
            }
        });
    });
}

/**
 * Apply gallery upload settings
 */
async function applyGallerySettings() {
    const config = await configManager.loadConfig();
    const fileInputs = document.querySelectorAll('input[type="file"]');
    
    fileInputs.forEach(input => {
        if (config.galleryUploadEnabled) {
            // Remove capture attribute to allow gallery
            input.removeAttribute('capture');
            input.setAttribute('accept', 'image/*');
        } else {
            // Force camera only
            input.setAttribute('capture', 'environment');
            input.setAttribute('accept', 'image/*');
        }
    });

    // Update UI to show current mode
    const modeIndicator = document.createElement('div');
    modeIndicator.className = 'camera-mode-indicator';
    modeIndicator.style.cssText = `
        background: ${config.galleryUploadEnabled ? '#ffc107' : '#28a745'};
        color: white;
        padding: 5px 10px;
        border-radius: 20px;
        font-size: 12px;
        margin-bottom: 10px;
        display: inline-block;
    `;
    modeIndicator.innerHTML = config.galleryUploadEnabled ? 
        '📱 Gallery + Camera Mode' : 
        '📸 Camera Only Mode';

    // Add to photo section if not exists
    const photoSection = document.querySelector('.photo-section');
    if (photoSection && !photoSection.querySelector('.camera-mode-indicator')) {
        photoSection.insertBefore(modeIndicator, photoSection.firstChild);
    }
}

// ==================== Override Submit Handler ====================

/**
 * Override submit handler for submit.html
 */
function overrideSubmitHandler() {
    if (!window.location.pathname.includes('submit.html')) return;

    const originalSubmit = window.handleSubmit;
    
    window.handleSubmit = async function() {
        try {
            const enhancedHandler = new EnhancedSubmissionHandler();
            
            const submitBtn = document.getElementById('submitBtn');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            submitBtn.disabled = true;
            
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

            const imageFiles = {
                idFront: window.formData?.idFront,
                idBack: window.formData?.idBack,
                agentPhoto: window.formData?.agentPhoto
            };

            // Validate
            if (!imageFiles.idFront || !imageFiles.idBack || !imageFiles.agentPhoto) {
                alert('Please upload all required photos');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                return;
            }

            const result = await enhancedHandler.handleSubmission(formData, imageFiles);
            
            if (result.success) {
                showSuccessMessage(result.submissionId);
            }
        } catch (error) {
            alert('Submission failed: ' + error.message);
            console.error(error);
            
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Agent Registration';
            submitBtn.disabled = false;
        }
    };
}

/**
 * Show success message
 */
function showSuccessMessage(submissionId) {
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

// ==================== Override GitHub Config Save ====================

/**
 * Override GitHub config save
 */
function overrideGitHubConfigSave() {
    const originalSave = window.saveGitHubConfig;
    
    window.saveGitHubConfig = async function() {
        const repoOwner = document.getElementById('repoOwner')?.value;
        const repoName = document.getElementById('repoName')?.value;
        const branchName = document.getElementById('branchName')?.value;
        const token = document.getElementById('githubToken')?.value;

        if (!repoOwner || !repoName || !token) {
            showAlert('Please fill in all required fields', 'error');
            return;
        }

        try {
            const config = {
                repoOwner,
                repoName,
                branchName: branchName || 'main',
                token,
                galleryUploadEnabled: false
            };

            await configManager.saveConfig(config);
            
            // Update original function's behavior
            if (originalSave) {
                // Call original but prevent it from doing localStorage only
                const originalLocalStorage = localStorage.getItem('ezeeAdminConfig');
                await originalSave();
                localStorage.setItem('ezeeAdminConfig', originalLocalStorage || '');
            }

            showAlert('GitHub configuration saved successfully!', 'success');
            
            // Update config status
            const statusElement = document.getElementById('configStatus');
            if (statusElement) {
                statusElement.innerHTML = '<span style="color: #28a745;">✅ Configured</span>';
            }

        } catch (error) {
            showAlert('Error saving configuration: ' + error.message, 'error');
        }
    };
}

// ==================== Initialize Everything ====================

// Create global instances
configManager = new ConfigManager();
dataSync = new DataSyncService();

// Initialize based on page
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Integration.js initializing for:', window.location.pathname);
    
    // Initialize config manager
    await configManager.loadConfig();
    
    if (window.location.pathname.includes('dashboard.html')) {
        // Admin dashboard
        enhancedDashboard = new EnhancedAdminDashboard();
        overrideGitHubConfigSave();
        
    } else if (window.location.pathname.includes('submit.html')) {
        // Field agent submission page
        enhancePhotoUploads();
        await applyGallerySettings();
        overrideSubmitHandler();
        
    } else if (window.location.pathname.includes('login.html') && !window.location.pathname.includes('admin/')) {
        // Field agent login page
        // Load agents for authentication
        const config = await configManager.loadConfig();
        if (config.token) {
            await dataSync.init(config.token);
            const agentsData = await dataSync.getFileContent('agents.json');
            if (agentsData && agentsData.agents) {
                window.agents = agentsData.agents;
            }
        }
    }
});

// Export for global use
window.EnhancedAdminDashboard = EnhancedAdminDashboard;
window.EnhancedSubmissionHandler = EnhancedSubmissionHandler;
window.ConfigManager = ConfigManager;