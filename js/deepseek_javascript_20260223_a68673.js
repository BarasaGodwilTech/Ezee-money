/**
 * integration.js - Ezee Money Complete Integration System
 * Handles all GitHub operations, real-time sync, and data management
 * Version: 2.0.0
 */

// ==================== GLOBAL CONFIGURATION ====================
const EZEE_CONFIG = {
    repoOwner: 'BarasaGodwilTech',
    repoName: 'Ezee-money',
    branch: 'main',
    files: {
        agents: 'agents.json',
        submissions: 'data.json',
        gitconfig: 'gitconfig.json',
        images: 'images/'
    },
    pollingInterval: 3000, // 3 seconds for real-time updates
    maxRetries: 3,
    retryDelay: 1000
};

// ==================== MAIN INTEGRATION CLASS ====================
class EzeeIntegration {
    constructor() {
        this.token = null;
        this.baseURL = 'https://api.github.com';
        this.pollingInterval = null;
        this.lastUpdate = null;
        this.subscribers = [];
        this.initialized = false;
        
        // Initialize immediately
        this.init();
    }

    // Initialize the integration
    init() {
        try {
            // Load GitHub token from localStorage
            const adminConfig = JSON.parse(localStorage.getItem('ezeeAdminConfig') || '{}');
            if (adminConfig.github?.token) {
                this.token = adminConfig.github.token;
                this.repoOwner = adminConfig.github.repoOwner || EZEE_CONFIG.repoOwner;
                this.repoName = adminConfig.github.repoName || EZEE_CONFIG.repoName;
                this.branch = adminConfig.github.branchName || EZEE_CONFIG.branch;
                
                // Save to gitconfig.json
                this.saveGitConfigToRepo({
                    repoOwner: this.repoOwner,
                    repoName: this.repoName,
                    branchName: this.branch,
                    lastUpdated: new Date().toISOString()
                });
                
                console.log('✅ EzeeIntegration initialized with GitHub token');
                this.initialized = true;
                
                // Start polling for admin dashboard
                if (window.location.pathname.includes('dashboard.html')) {
                    this.startRealTimePolling();
                }
            } else {
                console.log('⚠️ No GitHub token found, using fallback mode');
                // Try to load gitconfig.json for agent access
                this.loadGitConfigFromRepo();
            }
            
            // Override existing services
            this.overrideExistingServices();
        } catch (error) {
            console.error('❌ Integration initialization error:', error);
        }
    }

    // Override existing GitHubService and RealTimeService
    overrideExistingServices() {
        if (typeof GitHubService !== 'undefined') {
            const originalGitHub = GitHubService;
            GitHubService = class extends originalGitHub {
                constructor() {
                    super();
                    this.integration = window.ezeeIntegration;
                }
                
                async saveSubmission(submissionData) {
                    return this.integration.saveSubmission(submissionData);
                }
                
                async getSubmissions() {
                    return this.integration.getSubmissions();
                }
                
                async saveAgents(agents) {
                    return this.integration.saveAgents(agents);
                }
                
                async getAgents() {
                    return this.integration.getAgents();
                }
            };
        }
        
        if (typeof RealTimeService !== 'undefined') {
            const originalRealTime = RealTimeService;
            RealTimeService = class extends originalRealTime {
                constructor() {
                    super();
                    this.integration = window.ezeeIntegration;
                }
                
                async submitAgentData(submission) {
                    return this.integration.submitAgentData(submission);
                }
                
                async getSubmissions() {
                    return this.integration.getSubmissions();
                }
                
                async getAgents() {
                    return this.integration.getAgents();
                }
            };
        }
    }

    // ==================== GITHUB API METHODS ====================

    // Make authenticated GitHub request
    async githubRequest(endpoint, method = 'GET', body = null) {
        if (!this.token && method !== 'GET') {
            throw new Error('GitHub token required for write operations');
        }

        const url = `${this.baseURL}${endpoint}`;
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };

        if (this.token) {
            headers['Authorization'] = `token ${this.token}`;
        }

        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            
            if (response.status === 404) {
                return null;
            }
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || `GitHub API error: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('GitHub request error:', error);
            throw error;
        }
    }

    // Get file content from GitHub
    async getFileContent(filePath) {
        try {
            const response = await this.githubRequest(
                `/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}?ref=${this.branch}`
            );
            
            if (!response || !response.content) {
                return null;
            }
            
            // Decode base64 content
            const content = atob(response.content.replace(/\n/g, ''));
            return JSON.parse(content);
        } catch (error) {
            console.error(`Error reading ${filePath}:`, error);
            return null;
        }
    }

    // Save file to GitHub
    async saveFileContent(filePath, content, commitMessage) {
        if (!this.token) {
            throw new Error('GitHub token required to save files');
        }

        try {
            // Check if file exists to get SHA
            let sha = null;
            try {
                const existing = await this.githubRequest(
                    `/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}?ref=${this.branch}`
                );
                if (existing && existing.sha) {
                    sha = existing.sha;
                }
            } catch (error) {
                // File doesn't exist, that's fine
            }

            // Prepare content
            const jsonContent = JSON.stringify(content, null, 2);
            const base64Content = btoa(unescape(encodeURIComponent(jsonContent)));

            const body = {
                message: commitMessage,
                content: base64Content,
                branch: this.branch
            };

            if (sha) {
                body.sha = sha;
            }

            const response = await this.githubRequest(
                `/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}`,
                'PUT',
                body
            );

            return {
                success: true,
                sha: response?.commit?.sha,
                url: `https://github.com/${this.repoOwner}/${this.repoName}/blob/${this.branch}/${filePath}`
            };
        } catch (error) {
            console.error(`Error saving ${filePath}:`, error);
            throw error;
        }
    }

    // Upload image to GitHub
    async uploadImage(imageData, fileName) {
        if (!this.token) {
            throw new Error('GitHub token required to upload images');
        }

        try {
            const filePath = `${EZEE_CONFIG.files.images}${fileName}`;
            
            // Extract base64 data
            const base64Data = imageData.split(',')[1];
            
            // Check if file exists
            let sha = null;
            try {
                const existing = await this.githubRequest(
                    `/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}?ref=${this.branch}`
                );
                if (existing && existing.sha) {
                    sha = existing.sha;
                }
            } catch (error) {
                // File doesn't exist
            }

            const body = {
                message: `Upload image: ${fileName}`,
                content: base64Data,
                branch: this.branch
            };

            if (sha) {
                body.sha = sha;
            }

            const response = await this.githubRequest(
                `/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}`,
                'PUT',
                body
            );

            return {
                success: true,
                url: `https://raw.githubusercontent.com/${this.repoOwner}/${this.repoName}/${this.branch}/${filePath}`,
                download_url: response?.content?.download_url
            };
        } catch (error) {
            console.error('Error uploading image:', error);
            throw error;
        }
    }

    // ==================== GITCONFIG MANAGEMENT ====================

    // Save gitconfig to repository
    async saveGitConfigToRepo(config) {
        try {
            const result = await this.saveFileContent(
                EZEE_CONFIG.files.gitconfig,
                {
                    github: config,
                    lastUpdated: new Date().toISOString(),
                    version: '2.0.0'
                },
                'Update GitHub configuration'
            );
            
            console.log('✅ gitconfig.json saved to repository');
            return result;
        } catch (error) {
            console.error('Error saving gitconfig.json:', error);
            throw error;
        }
    }

    // Load gitconfig from repository
    async loadGitConfigFromRepo() {
        try {
            const config = await this.getFileContent(EZEE_CONFIG.files.gitconfig);
            if (config && config.github) {
                this.repoOwner = config.github.repoOwner || this.repoOwner;
                this.repoName = config.github.repoName || this.repoName;
                this.branch = config.github.branchName || this.branch;
                
                console.log('✅ Loaded gitconfig.json from repository');
                return config.github;
            }
        } catch (error) {
            console.error('Error loading gitconfig.json:', error);
        }
        return null;
    }

    // ==================== AGENTS MANAGEMENT ====================

    // Get all agents from agents.json
    async getAgents() {
        try {
            // Try to get from GitHub first
            if (this.token) {
                const data = await this.getFileContent(EZEE_CONFIG.files.agents);
                if (data && data.agents) {
                    // Cache to localStorage
                    localStorage.setItem('ezeeAgents', JSON.stringify(data.agents));
                    return data.agents;
                }
            }
            
            // Fallback to localStorage
            const cached = localStorage.getItem('ezeeAgents');
            return cached ? JSON.parse(cached) : [];
        } catch (error) {
            console.error('Error getting agents:', error);
            // Final fallback
            const cached = localStorage.getItem('ezeeAgents');
            return cached ? JSON.parse(cached) : [];
        }
    }

    // Save agents to agents.json
    async saveAgents(agents) {
        try {
            const data = {
                agents: agents,
                lastUpdated: new Date().toISOString(),
                totalAgents: agents.length
            };
            
            // Save to GitHub if token available
            if (this.token) {
                await this.saveFileContent(
                    EZEE_CONFIG.files.agents,
                    data,
                    `Update agents list (${agents.length} agents)`
                );
            }
            
            // Always cache to localStorage
            localStorage.setItem('ezeeAgents', JSON.stringify(agents));
            
            return { success: true };
        } catch (error) {
            console.error('Error saving agents:', error);
            // Still cache to localStorage
            localStorage.setItem('ezeeAgents', JSON.stringify(agents));
            throw error;
        }
    }

    // ==================== SUBMISSIONS MANAGEMENT ====================

    // Get all submissions from data.json
    async getSubmissions() {
        try {
            // Try to get from GitHub first
            if (this.token) {
                const data = await this.getFileContent(EZEE_CONFIG.files.submissions);
                if (data && data.agents) {
                    // Cache to localStorage
                    localStorage.setItem('adminSubmissions', JSON.stringify({ submissions: data.agents }));
                    return data.agents || [];
                }
            }
            
            // Fallback to localStorage
            const cached = localStorage.getItem('adminSubmissions');
            if (cached) {
                const parsed = JSON.parse(cached);
                return parsed.submissions || parsed || [];
            }
            return [];
        } catch (error) {
            console.error('Error getting submissions:', error);
            // Final fallback
            const cached = localStorage.getItem('adminSubmissions');
            if (cached) {
                const parsed = JSON.parse(cached);
                return parsed.submissions || parsed || [];
            }
            return [];
        }
    }

    // Submit agent data to data.json
    async submitAgentData(submission) {
        try {
            console.log('📤 Submitting agent data:', submission);
            
            // Generate submission ID if not present
            const submissionId = submission.id || `AGENT-${Date.now()}-${Math.random().toString(36).substr(2, 3)}`;
            
            // Upload images first
            const imageUrls = {};
            
            if (submission.images) {
                const timestamp = Date.now();
                
                if (submission.images.idFront) {
                    const result = await this.uploadImage(
                        submission.images.idFront,
                        `${submissionId}_idFront_${timestamp}.jpg`
                    );
                    imageUrls.idFrontUrl = result.url;
                }
                
                if (submission.images.idBack) {
                    const result = await this.uploadImage(
                        submission.images.idBack,
                        `${submissionId}_idBack_${timestamp}.jpg`
                    );
                    imageUrls.idBackUrl = result.url;
                }
                
                if (submission.images.agentPhoto) {
                    const result = await this.uploadImage(
                        submission.images.agentPhoto,
                        `${submissionId}_agentPhoto_${timestamp}.jpg`
                    );
                    imageUrls.agentPhotoUrl = result.url;
                }
            }

            // Prepare submission data
            const agentData = {
                id: submissionId,
                fullName: submission.fullName,
                personalNumber: submission.personalNumber,
                email: submission.email,
                nationalId: submission.nationalId,
                dob: submission.dob,
                gender: submission.gender,
                businessAddress: submission.businessAddress,
                residentialAddress: submission.residentialAddress,
                nextOfKinName: submission.nextOfKinName,
                nextOfKinRelationship: submission.nextOfKinRelationship,
                nextOfKinPhone: submission.nextOfKinPhone,
                tradingName: submission.tradingName || submission.fullName,
                submissionDate: submission.submissionDate || new Date().toISOString(),
                status: 'pending',
                emailVerified: false,
                adminVerified: false,
                ...imageUrls
            };

            // Load existing submissions
            let submissions = [];
            try {
                const existing = await this.getFileContent(EZEE_CONFIG.files.submissions);
                submissions = existing?.agents || [];
            } catch (error) {
                console.log('Creating new submissions file');
            }

            // Add new submission
            submissions.push(agentData);

            // Save to data.json
            const dataToSave = {
                agents: submissions,
                lastUpdated: new Date().toISOString()
            };

            await this.saveFileContent(
                EZEE_CONFIG.files.submissions,
                dataToSave,
                `New submission from ${agentData.fullName}`
            );

            // Also cache to localStorage
            localStorage.setItem('adminSubmissions', JSON.stringify(dataToSave));

            // Notify subscribers
            this.notifySubscribers('new_submission', agentData);

            console.log('✅ Submission saved successfully:', submissionId);

            return {
                success: true,
                submissionId: submissionId,
                imageUrls: imageUrls
            };

        } catch (error) {
            console.error('❌ Error submitting agent data:', error);
            throw error;
        }
    }

    // Save submission (alias for submitAgentData for compatibility)
    async saveSubmission(submissionData) {
        return this.submitAgentData(submissionData);
    }

    // ==================== REAL-TIME SYNC ====================

    // Start real-time polling for admin dashboard
    startRealTimePolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        console.log('🔄 Starting real-time polling (every 3 seconds)');
        
        this.pollingInterval = setInterval(async () => {
            try {
                if (!this.token) return;

                const submissions = await this.getSubmissions();
                const agents = await this.getAgents();
                
                // Update dashboard if functions exist
                if (typeof updateDashboardData === 'function') {
                    updateDashboardData(submissions, agents);
                } else {
                    // Trigger DOM updates
                    this.updateDashboardDOM(submissions, agents);
                }
                
                // Notify subscribers
                this.notifySubscribers('poll', { submissions, agents });
                
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, EZEE_CONFIG.pollingInterval);
    }

    // Stop real-time polling
    stopRealTimePolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('🛑 Stopped real-time polling');
        }
    }

    // Update dashboard DOM directly
    updateDashboardDOM(submissions, agents) {
        // Update stats
        const totalAgentsEl = document.getElementById('totalAgents');
        const totalSubmissionsEl = document.getElementById('totalSubmissions');
        const todaySubmissionsEl = document.getElementById('todaySubmissions');
        const activeAgentsEl = document.getElementById('activeAgents');
        
        if (totalAgentsEl) totalAgentsEl.textContent = agents.length;
        if (totalSubmissionsEl) totalSubmissionsEl.textContent = submissions.length;
        
        const today = new Date().toDateString();
        const todayCount = submissions.filter(s => 
            new Date(s.submissionDate).toDateString() === today
        ).length;
        if (todaySubmissionsEl) todaySubmissionsEl.textContent = todayCount;
        
        const activeCount = agents.filter(a => a.status === 'active').length;
        if (activeAgentsEl) activeAgentsEl.textContent = activeCount;
        
        // Update submissions table
        const tbody = document.querySelector('#submissionsTable tbody');
        if (tbody && submissions.length > 0) {
            tbody.innerHTML = submissions.map(sub => `
                <tr>
                    <td>${sub.personalNumber || sub.scCode || 'N/A'}</td>
                    <td>${sub.fullName || 'N/A'}</td>
                    <td>${new Date(sub.submissionDate).toLocaleDateString()}</td>
                    <td><span class="status-badge status-${sub.status || 'pending'}">${sub.status || 'pending'}</span></td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="window.ezeeIntegration.viewSubmission('${sub.id}')">View</button>
                    </td>
                </tr>
            `).join('');
        }
        
        // Update agent list
        const agentList = document.getElementById('agentList');
        if (agentList && agents.length > 0) {
            agentList.innerHTML = agents.map(agent => `
                <div class="agent-item">
                    <div class="agent-info">
                        <div class="agent-name">${agent.fullName}</div>
                        <div class="agent-details">SC Code: ${agent.scCode} | Status: ${agent.status}</div>
                    </div>
                    <div class="agent-actions">
                        <button class="btn btn-sm btn-warning" onclick="window.ezeeIntegration.editAgent('${agent.id}')">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="window.ezeeIntegration.deleteAgent('${agent.id}')">Delete</button>
                    </div>
                </div>
            `).join('');
        }
    }

    // View submission details
    viewSubmission(submissionId) {
        this.getSubmissions().then(submissions => {
            const submission = submissions.find(s => s.id === submissionId);
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
                    <button onclick="this.parentElement.parentElement.remove()" style="
                        position: absolute;
                        top: 15px;
                        right: 15px;
                        background: #dc3545;
                        color: white;
                        border: none;
                        border-radius: 50%;
                        width: 30px;
                        height: 30px;
                        cursor: pointer;
                        font-size: 16px;
                    ">×</button>
                    
                    <h2 style="color: #1e3c72; margin-bottom: 20px;">Submission Details</h2>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                        <div>
                            <h3 style="color: #2a5298;">Client Information</h3>
                            <p><strong>Name:</strong> ${submission.fullName || 'N/A'}</p>
                            <p><strong>Personal Number:</strong> ${submission.personalNumber || 'N/A'}</p>
                            <p><strong>Email:</strong> ${submission.email || 'N/A'}</p>
                            <p><strong>National ID:</strong> ${submission.nationalId || 'N/A'}</p>
                            <p><strong>Business Address:</strong> ${submission.businessAddress || 'N/A'}</p>
                        </div>
                        <div>
                            <h3 style="color: #2a5298;">Next of Kin</h3>
                            <p><strong>Name:</strong> ${submission.nextOfKinName || 'N/A'}</p>
                            <p><strong>Relationship:</strong> ${submission.nextOfKinRelationship || 'N/A'}</p>
                            <p><strong>Phone:</strong> ${submission.nextOfKinPhone || 'N/A'}</p>
                            <p><strong>Status:</strong> <span class="status-badge status-${submission.status}">${submission.status}</span></p>
                        </div>
                    </div>
                    
                    <div style="margin-top: 20px;">
                        <h3 style="color: #2a5298;">Images</h3>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                            ${submission.idFrontUrl ? `<div><img src="${submission.idFrontUrl}" style="max-width:100%; border-radius:8px;"></div>` : ''}
                            ${submission.idBackUrl ? `<div><img src="${submission.idBackUrl}" style="max-width:100%; border-radius:8px;"></div>` : ''}
                            ${submission.agentPhotoUrl ? `<div><img src="${submission.agentPhotoUrl}" style="max-width:100%; border-radius:8px;"></div>` : ''}
                        </div>
                    </div>
                    
                    <div style="margin-top: 20px; text-align: center;">
                        <button onclick="this.parentElement.parentElement.parentElement.remove()" class="btn btn-primary">Close</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
        });
    }

    // ==================== SUBSCRIBER SYSTEM ====================

    // Subscribe to events
    subscribe(callback) {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter(sub => sub !== callback);
        };
    }

    // Notify subscribers
    notifySubscribers(event, data) {
        this.subscribers.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Subscriber error:', error);
            }
        });
    }

    // ==================== UTILITY METHODS ====================

    // Check GitHub connection
    async checkConnection() {
        try {
            await this.githubRequest(`/repos/${this.repoOwner}/${this.repoName}`);
            return { connected: true, message: 'Connected to GitHub' };
        } catch (error) {
            return { connected: false, message: error.message };
        }
    }

    // Generate unique ID
    generateId() {
        return `AGENT-${Date.now()}-${Math.random().toString(36).substr(2, 3)}`;
    }
}

// ==================== DOM INITIALIZATION ====================

// Initialize integration when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Create global instance
    window.ezeeIntegration = new EzeeIntegration();
    
    // Override existing functions
    overrideDashboardFunctions();
    overrideSubmitFunctions();
    overrideLoginFunctions();
});

// Override dashboard functions
function overrideDashboardFunctions() {
    if (window.location.pathname.includes('dashboard.html')) {
        // Override loadAgents
        window.loadAgents = async function() {
            return window.ezeeIntegration.getAgents();
        };
        
        // Override loadSubmissions
        window.loadSubmissions = async function() {
            return window.ezeeIntegration.getSubmissions();
        };
        
        // Override saveGitHubConfig
        window.saveGitHubConfig = async function() {
            const repoOwner = document.getElementById('repoOwner')?.value;
            const repoName = document.getElementById('repoName')?.value;
            const branchName = document.getElementById('branchName')?.value;
            const token = document.getElementById('githubToken')?.value;
            
            if (repoOwner && repoName && token) {
                window.ezeeIntegration.token = token;
                window.ezeeIntegration.repoOwner = repoOwner;
                window.ezeeIntegration.repoName = repoName;
                window.ezeeIntegration.branch = branchName || 'main';
                
                await window.ezeeIntegration.saveGitConfigToRepo({
                    repoOwner,
                    repoName,
                    branchName: window.ezeeIntegration.branch,
                    token
                });
                
                showAlert('GitHub configuration saved to repository!', 'success');
            }
        };
        
        // Override testGitHubConnection
        window.testGitHubConnection = async function() {
            const result = await window.ezeeIntegration.checkConnection();
            if (result.connected) {
                showAlert('✅ GitHub connection successful!', 'success');
            } else {
                showAlert(`❌ GitHub connection failed: ${result.message}`, 'error');
            }
        };
    }
}

// Override submit functions
function overrideSubmitFunctions() {
    if (window.location.pathname.includes('submit.html')) {
        // Override handleSubmit
        const originalSubmit = window.handleSubmit;
        window.handleSubmit = async function() {
            try {
                const integration = window.ezeeIntegration;
                
                // Collect form data
                const submission = {
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
                    nextOfKinPhone: document.getElementById('nextOfKinPhone')?.value,
                    images: {
                        idFront: window.formData?.idFront,
                        idBack: window.formData?.idBack,
                        agentPhoto: window.formData?.agentPhoto
                    }
                };
                
                const result = await integration.submitAgentData(submission);
                
                if (result.success) {
                    showSuccessMessage(result.submissionId);
                }
            } catch (error) {
                alert('Submission failed: ' + error.message);
            }
        };
    }
}

// Override login functions
function overrideLoginFunctions() {
    if (window.location.pathname.includes('login.html')) {
        // Override handleLogin for field agents
        window.handleLogin = async function(e) {
            e.preventDefault();
            
            const scCode = document.getElementById('scCode')?.value;
            const fullName = document.getElementById('fullName')?.value;
            const password = document.getElementById('password')?.value;
            
            try {
                const integration = window.ezeeIntegration;
                const agents = await integration.getAgents();
                
                const agent = agents.find(a => 
                    a.scCode === scCode && 
                    a.password === password && 
                    a.status === 'active'
                );
                
                if (agent) {
                    localStorage.setItem('agentLoggedIn', 'true');
                    localStorage.setItem('agentInfo', JSON.stringify(agent));
                    window.location.href = 'submit.html';
                } else {
                    showAlert('Invalid credentials', 'error');
                }
            } catch (error) {
                showAlert('Login failed: ' + error.message, 'error');
            }
        };
    }
}

// Show alert helper
function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) {
        alert(message);
        return;
    }
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.innerHTML = `
        <span>${type === 'success' ? '✅' : '❌'}</span>
        <span>${message}</span>
    `;
    
    alertContainer.appendChild(alertDiv);
    
    setTimeout(() => alertDiv.remove(), 5000);
}

// Show success message helper
function showSuccessMessage(submissionId) {
    const formContainer = document.querySelector('.form-container');
    const successMessage = document.getElementById('successMessage');
    const submissionIdEl = document.getElementById('submissionId');
    
    if (formContainer) formContainer.classList.add('hidden');
    if (successMessage) successMessage.classList.remove('hidden');
    if (submissionIdEl) submissionIdEl.textContent = submissionId;
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EzeeIntegration;
}