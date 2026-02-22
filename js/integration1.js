/**
 * integration.js - Ezee Money System Integration Layer
 * FIXED VERSION - Proper photo handling, gallery option, and GitHub integration
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
        }
        
        // Return default config
        return {
            repoOwner: 'BarasaGodwilTech',
            repoName: 'Ezee-money',
            branchName: 'main',
            token: ''
        };
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
        this.pollingInterval = 3000; // 3 seconds for faster updates
        this.isPolling = false;
        this.lastKnownState = {
            dataHash: null,
            agentsHash: null
        };
        this.subscribers = [];
        this.token = null;
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

// ==================== Enhanced Photo Upload Handler ====================

class PhotoUploadHandler {
    constructor() {
        this.formData = {
            idFront: null,
            idBack: null,
            agentPhoto: null
        };
        this.setupPhotoUploads();
    }

    /**
     * Setup all photo upload areas with gallery and camera options
     */
    setupPhotoUploads() {
        // Setup ID Front
        this.setupPhotoArea('idFront', 'ID Front');
        
        // Setup ID Back
        this.setupPhotoArea('idBack', 'ID Back');
        
        // Setup Agent Photo
        this.setupPhotoArea('agentPhoto', 'Agent Photo');
    }

    /**
     * Setup individual photo area with both camera and gallery options
     */
    setupPhotoArea(photoType, label) {
        const uploadArea = document.getElementById(`${photoType}Upload`);
        const input = document.getElementById(`${photoType}Input`);
        const preview = document.getElementById(`${photoType}Preview`);
        const image = document.getElementById(`${photoType}Image`);
        
        if (!uploadArea || !input) return;

        // Clear existing content and create new structure
        uploadArea.innerHTML = '';
        uploadArea.style.padding = '15px';
        uploadArea.style.cursor = 'default';
        
        // Create icon
        const icon = document.createElement('div');
        icon.className = 'photo-icon';
        icon.innerHTML = photoType === 'agentPhoto' ? '<i class="fas fa-user-circle"></i>' : '<i class="fas fa-id-card"></i>';
        
        // Create label
        const labelEl = document.createElement('div');
        labelEl.className = 'photo-label';
        labelEl.textContent = label;
        
        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.marginTop = '10px';
        
        // Camera button
        const cameraBtn = document.createElement('button');
        cameraBtn.type = 'button';
        cameraBtn.innerHTML = '<i class="fas fa-camera"></i> Take Photo';
        cameraBtn.style.cssText = `
            padding: 8px 15px;
            background: #2a5298;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 5px;
        `;
        cameraBtn.onclick = (e) => {
            e.stopPropagation();
            input.setAttribute('capture', 'environment');
            input.click();
        };
        
        // Gallery button
        const galleryBtn = document.createElement('button');
        galleryBtn.type = 'button';
        galleryBtn.innerHTML = '<i class="fas fa-images"></i> Choose from Gallery';
        galleryBtn.style.cssText = `
            padding: 8px 15px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 5px;
        `;
        galleryBtn.onclick = (e) => {
            e.stopPropagation();
            input.removeAttribute('capture');
            input.click();
        };
        
        buttonContainer.appendChild(cameraBtn);
        buttonContainer.appendChild(galleryBtn);
        
        // Assemble
        uploadArea.appendChild(icon);
        uploadArea.appendChild(labelEl);
        uploadArea.appendChild(buttonContainer);
        
        // Add note
        const note = document.createElement('p');
        note.style.cssText = 'color: #666; font-size: 12px; margin-top: 10px;';
        note.textContent = photoType === 'agentPhoto' ? 'Clear face photo for identification' : 'Clear photo with good lighting';
        uploadArea.appendChild(note);
        
        // Handle file selection
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    image.src = e.target.result;
                    preview.classList.remove('hidden');
                    uploadArea.classList.add('has-image');
                    
                    // Hide upload area when preview is shown
                    uploadArea.style.display = 'none';
                    
                    // Store file in global formData
                    if (!window.formData) window.formData = {};
                    window.formData[photoType] = file;
                };
                reader.readAsDataURL(file);
            }
        });
        
        // Setup remove button
        const removeBtn = document.querySelector(`.remove-photo[data-target="${photoType}"]`);
        if (removeBtn) {
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                window.formData[photoType] = null;
                preview.classList.add('hidden');
                uploadArea.classList.remove('has-image');
                uploadArea.style.display = 'flex';
                input.value = '';
            };
        }
    }

    /**
     * Validate all photos are uploaded
     */
    validatePhotos() {
        return window.formData && 
               window.formData.idFront && 
               window.formData.idBack && 
               window.formData.agentPhoto;
    }
}

// ==================== Enhanced Submission Handler ====================

class EnhancedSubmissionHandler {
    constructor() {
        this.dataSync = new DataSyncService();
        this.photoHandler = new PhotoUploadHandler();
    }

    /**
     * Handle form submission
     */
    async handleSubmission(formData, imageFiles) {
        try {
            // Load GitHub token from config
            const config = await new ConfigManager().loadConfig();
            
            if (!config.token) {
                throw new Error('GitHub configuration not found. Please contact admin.');
            }

            await this.dataSync.init(config.token);

            // Validate required fields
            this.validateFormData(formData);

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

            // Upload images to GitHub and get URLs
            console.log('Uploading images to GitHub...');
            const imageUrls = await this.uploadImages(submission.id, imageFiles, config.token);

            // Add image URLs to submission
            submission.idFrontUrl = imageUrls.idFront || '';
            submission.idBackUrl = imageUrls.idBack || '';
            submission.agentPhotoUrl = imageUrls.agentPhoto || '';

            // Save to data.json
            console.log('Saving submission to data.json...');
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
     * Validate form data
     */
    validateFormData(formData) {
        const required = ['fullName', 'personalNumber', 'email', 'nationalId', 'dob', 'gender', 
                         'businessAddress', 'residentialAddress', 'nextOfKinName', 
                         'nextOfKinRelationship', 'nextOfKinPhone'];
        
        for (const field of required) {
            if (!formData[field]) {
                throw new Error(`Please fill in ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
            }
        }

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            throw new Error('Please enter a valid email address');
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
                    // Store the raw GitHub URL
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

            // Add new submission
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
            
            // Update config status
            this.updateConfigStatus(config);
        } else {
            console.warn('No GitHub token found');
            this.updateConfigStatus({ token: null });
        }
    }

    /**
     * Update config status in settings
     */
    updateConfigStatus(config) {
        const statusElement = document.getElementById('configStatus');
        if (statusElement) {
            if (config && config.token) {
                statusElement.innerHTML = '<span style="color: #28a745;">✅ Configured</span>';
                statusElement.title = `Repository: ${config.repoOwner}/${config.repoName}`;
            } else {
                statusElement.innerHTML = '<span style="color: #ffc107;">⚠️ Not Configured</span>';
            }
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
                <td>${sub.personalNumber || sub.scCode || 'N/A'}</td>
                <td>${sub.fullName || sub.agentName || 'N/A'}</td>
                <td>${new Date(sub.submissionDate).toLocaleDateString()}</td>
                <td><span class="status-badge status-${sub.status || 'pending'}">${sub.status || 'pending'}</span></td>
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
                    <div class="agent-details">SC Code: ${agent.scCode} | Status: ${agent.status || 'active'}</div>
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
            <div style="background: white; padding: 30px; border-radius: 15px; max-width: 800px; max-height: 90vh; overflow-y: auto; position: relative;">
                <button onclick="this.parentElement.parentElement.remove()" style="position: absolute; top: 15px; right: 15px; background: #dc3545; color: white; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; font-size: 16px;">×</button>
                <h2 style="color: #1e3c72; margin-bottom: 20px;">Submission Details</h2>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h3 style="color: #2a5298; margin-bottom: 10px;">Client Information</h3>
                        <p><strong>Name:</strong> ${submission.fullName || 'N/A'}</p>
                        <p><strong>Personal Number:</strong> ${submission.personalNumber || 'N/A'}</p>
                        <p><strong>Email:</strong> ${submission.email || 'N/A'}</p>
                        <p><strong>National ID:</strong> ${submission.nationalId || 'N/A'}</p>
                        <p><strong>DOB:</strong> ${submission.dob || 'N/A'}</p>
                        <p><strong>Gender:</strong> ${submission.gender || 'N/A'}</p>
                        <p><strong>Business Address:</strong> ${submission.businessAddress || 'N/A'}</p>
                        <p><strong>Residential Address:</strong> ${submission.residentialAddress || 'N/A'}</p>
                    </div>
                    <div>
                        <h3 style="color: #2a5298; margin-bottom: 10px;">Next of Kin</h3>
                        <p><strong>Name:</strong> ${submission.nextOfKinName || 'N/A'}</p>
                        <p><strong>Relationship:</strong> ${submission.nextOfKinRelationship || 'N/A'}</p>
                        <p><strong>Phone:</strong> ${submission.nextOfKinPhone || 'N/A'}</p>
                        <h3 style="color: #2a5298; margin: 20px 0 10px;">Status</h3>
                        <p><strong>Status:</strong> <span class="status-badge status-${submission.status || 'pending'}">${submission.status || 'pending'}</span></p>
                        <p><strong>Submitted:</strong> ${new Date(submission.submissionDate).toLocaleString()}</p>
                    </div>
                </div>
                <div style="margin-top: 20px;">
                    <h3 style="color: #2a5298; margin-bottom: 10px;">Images</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        ${submission.idFrontUrl ? `
                            <div>
                                <p><strong>ID Front:</strong></p>
                                <img src="${submission.idFrontUrl}" style="max-width: 100%; max-height: 200px; border: 1px solid #ddd; border-radius: 5px;" onerror="this.src='https://via.placeholder.com/200x150?text=Image+Not+Found'">
                            </div>
                        ` : ''}
                        ${submission.idBackUrl ? `
                            <div>
                                <p><strong>ID Back:</strong></p>
                                <img src="${submission.idBackUrl}" style="max-width: 100%; max-height: 200px; border: 1px solid #ddd; border-radius: 5px;" onerror="this.src='https://via.placeholder.com/200x150?text=Image+Not+Found'">
                            </div>
                        ` : ''}
                        ${submission.agentPhotoUrl ? `
                            <div>
                                <p><strong>Agent Photo:</strong></p>
                                <img src="${submission.agentPhotoUrl}" style="max-width: 100%; max-height: 200px; border: 1px solid #ddd; border-radius: 5px;" onerror="this.src='https://via.placeholder.com/200x150?text=Image+Not+Found'">
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

// ==================== Field Agent Login Handler ====================

class FieldAgentLoginHandler {
    constructor() {
        this.dataSync = new DataSyncService();
    }

    /**
     * Authenticate field agent
     */
    async authenticate(scCode, fullName, password) {
        try {
            const config = await new ConfigManager().loadConfig();
            
            if (!config.token) {
                throw new Error('System configuration error. Please contact admin.');
            }

            await this.dataSync.init(config.token);

            // Load agents from agents.json
            const agentsData = await this.dataSync.getFileContent('agents.json');
            
            if (!agentsData || !agentsData.agents) {
                throw new Error('No agents found in system');
            }

            // Find matching agent
            const agent = agentsData.agents.find(a => 
                a.scCode.toLowerCase() === scCode.toLowerCase() && 
                a.fullName.toLowerCase() === fullName.toLowerCase() &&
                a.password === password &&
                a.status === 'active'
            );

            return agent;
        } catch (error) {
            console.error('Authentication error:', error);
            throw error;
        }
    }
}

// ==================== Global Initialization ====================

// Global instances
let enhancedDashboard;
let photoHandler;
let fieldAgentLoginHandler;

// Override DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize based on current page
    const path = window.location.pathname;
    
    if (path.includes('dashboard.html')) {
        enhancedDashboard = new EnhancedAdminDashboard();
    }
    
    if (path.includes('submit.html')) {
        photoHandler = new PhotoUploadHandler();
        overrideSubmitHandler();
    }
    
    if (path.includes('login.html') && !path.includes('admin')) {
        overrideFieldAgentLogin();
    }
});

/**
 * Override submit handler for submit.html
 */
function overrideSubmitHandler() {
    // Store reference to original submit function if it exists
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

            // Validate all fields are filled
            for (const [key, value] of Object.entries(formData)) {
                if (!value) {
                    throw new Error(`Please fill in ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
                }
            }

            // Validate photos using the photo handler
            if (!window.formData || !window.formData.idFront || !window.formData.idBack || !window.formData.agentPhoto) {
                throw new Error('Please upload all required photos');
            }

            // Get image files
            const imageFiles = {
                idFront: window.formData.idFront,
                idBack: window.formData.idBack,
                agentPhoto: window.formData.agentPhoto
            };

            // Handle submission
            const result = await enhancedHandler.handleSubmission(formData, imageFiles);
            
            if (result.success) {
                showSuccess(result.submissionId);
            }
        } catch (error) {
            alert('Error: ' + error.message);
            console.error(error);
            
            // Reset button
            const submitBtn = document.getElementById('submitBtn');
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Agent Registration';
                submitBtn.disabled = false;
            }
        }
    };
}

/**
 * Override field agent login
 */
function overrideFieldAgentLogin() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    const originalHandler = loginForm.onsubmit;
    
    loginForm.onsubmit = async function(e) {
        e.preventDefault();

        const scCode = document.getElementById('scCode')?.value.trim();
        const fullName = document.getElementById('fullName')?.value.trim();
        const password = document.getElementById('password')?.value;

        const loginBtn = document.getElementById('loginBtn');
        const loginText = document.getElementById('loginText');
        const loginLoading = document.getElementById('loginLoading');

        if (!scCode || !fullName || !password) {
            showAlert('Please fill in all fields', 'error');
            return;
        }

        try {
            loginBtn.disabled = true;
            loginText.textContent = 'Authenticating...';
            if (loginLoading) loginLoading.classList.remove('hidden');

            const authHandler = new FieldAgentLoginHandler();
            const agent = await authHandler.authenticate(scCode, fullName, password);

            if (agent) {
                // Store session info
                localStorage.setItem('agentLoggedIn', 'true');
                localStorage.setItem('agentInfo', JSON.stringify({
                    scCode: agent.scCode,
                    fullName: agent.fullName,
                    loginTime: new Date().toISOString()
                }));

                showAlert('Authentication successful! Redirecting...', 'success');

                setTimeout(() => {
                    window.location.href = 'submit.html';
                }, 1500);
            } else {
                showAlert('Invalid credentials or account is inactive', 'error');
            }

        } catch (error) {
            showAlert('Login failed: ' + error.message, 'error');
        } finally {
            loginBtn.disabled = false;
            loginText.textContent = 'Access Database';
            if (loginLoading) loginLoading.classList.add('hidden');
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

/**
 * Show alert message
 */
function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';
    alertDiv.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    
    alertContainer.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ConfigManager,
        DataSyncService,
        EnhancedSubmissionHandler,
        EnhancedAdminDashboard,
        FieldAgentLoginHandler,
        PhotoUploadHandler
    };
}