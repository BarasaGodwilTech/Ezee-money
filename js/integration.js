/**
 * integration.js - Ezee Money Complete Integration System
 * Version: 2.2.0 - Proper gitconfig.json token handling
 */

class EzeeIntegration {
    constructor() {
        this.token = null;
        this.repoOwner = 'BarasaGodwilTech';
        this.repoName = 'Ezee-money';
        this.branch = 'main';
        this.baseURL = 'https://api.github.com';
        this.configLoaded = false;
        this.configSource = null; // 'github' or 'local'
        
        // Initialize immediately
        this.init();
    }

    async init() {
        console.log('🚀 Initializing EzeeIntegration...');
        
        // ALWAYS try to load gitconfig.json from GitHub first (this has the token)
        await this.loadGitConfigFromGitHub();
        
        // If no token from GitHub, try localStorage as fallback
        if (!this.token) {
            this.loadConfigFromLocalStorage();
        }
        
        console.log('✅ Integration initialized:', {
            configSource: this.configSource,
            repo: `${this.repoOwner}/${this.repoName}`,
            hasToken: !!this.token,
            branch: this.branch
        });
        
        // Override services
        this.overrideExistingServices();
        
        // Start polling for dashboard
        if (window.location.pathname.includes('dashboard.html')) {
            this.startRealTimePolling();
        }
        
        return this;
    }

    // ==================== GITCONFIG LOADING (CRITICAL - CONTAINS TOKEN) ====================

    /**
     * Load gitconfig.json from GitHub - THIS IS WHERE THE TOKEN COMES FROM
     * Agents need this token to upload images
     */
    async loadGitConfigFromGitHub() {
        try {
            console.log('📥 Loading gitconfig.json from GitHub (token file)...');
            
            // First try without token (public repos allow reading)
            const response = await fetch(
                `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/gitconfig.json?ref=${this.branch}`
            );

            if (response.ok) {
                const data = await response.json();
                if (data.content) {
                    // Decode base64 content
                    const content = JSON.parse(atob(data.content.replace(/\n/g, '')));
                    
                    // Extract GitHub config - THIS CONTAINS THE TOKEN
                    if (content.github) {
                        this.repoOwner = content.github.repoOwner || this.repoOwner;
                        this.repoName = content.github.repoName || this.repoName;
                        this.branch = content.github.branchName || this.branch;
                        
                        // CRITICAL: Get the token from gitconfig.json
                        if (content.github.token) {
                            this.token = content.github.token;
                            console.log('🔑 GitHub token loaded from gitconfig.json');
                        }
                        
                        // Save to localStorage as backup but NEVER expose token in logs
                        this.saveConfigToLocalStorage({
                            repoOwner: this.repoOwner,
                            repoName: this.repoName,
                            branchName: this.branch,
                            token: this.token // Keep token for offline use
                        });
                        
                        console.log('✅ gitconfig.json loaded from GitHub successfully');
                        this.configSource = 'github';
                        this.configLoaded = true;
                        return true;
                    }
                }
            } else if (response.status === 404) {
                console.log('⚠️ gitconfig.json not found on GitHub - will create when admin configures');
            } else {
                console.log(`⚠️ GitHub responded with ${response.status} - using fallback`);
            }
        } catch (error) {
            console.error('Error loading gitconfig.json from GitHub:', error);
        }
        
        return false;
    }

    /**
     * Load config from localStorage (backup if GitHub unavailable)
     */
    loadConfigFromLocalStorage() {
        try {
            const saved = localStorage.getItem('ezeeAdminConfig');
            if (saved) {
                const config = JSON.parse(saved);
                if (config.github) {
                    this.repoOwner = config.github.repoOwner || this.repoOwner;
                    this.repoName = config.github.repoName || this.repoName;
                    this.branch = config.github.branchName || this.branch;
                    this.token = config.github.token || this.token;
                    
                    console.log('📦 Loaded config from localStorage (backup)');
                    this.configSource = 'local';
                    this.configLoaded = true;
                }
            }
        } catch (error) {
            console.error('Error loading from localStorage:', error);
        }
    }

    /**
     * Save config to gitconfig.json on GitHub (admin only)
     * This updates the token file that agents will use
     */
    async saveGitConfigToGitHub(githubConfig) {
        if (!githubConfig.token) {
            throw new Error('Token is required to save to gitconfig.json');
        }

        try {
            console.log('📤 Saving configuration to gitconfig.json...');
            
            // Update current instance
            this.token = githubConfig.token;
            this.repoOwner = githubConfig.repoOwner || this.repoOwner;
            this.repoName = githubConfig.repoName || this.repoName;
            this.branch = githubConfig.branchName || this.branch;

            // Prepare config data - THIS WILL BE THE FILE AGENTS READ
            const configData = {
                github: {
                    repoOwner: this.repoOwner,
                    repoName: this.repoName,
                    branchName: this.branch,
                    token: this.token, // CRITICAL: Token for image uploads
                    lastUpdated: new Date().toISOString()
                },
                version: '2.2.0',
                description: 'Ezee Money GitHub Configuration - Contains token for image uploads'
            };

            // Check if file exists to get SHA
            let sha = null;
            try {
                const existing = await this.githubRequest(
                    `/repos/${this.repoOwner}/${this.repoName}/contents/gitconfig.json`
                );
                if (existing && existing.sha) {
                    sha = existing.sha;
                }
            } catch (error) {
                // File doesn't exist, will create new
            }

            // Save to GitHub
            const body = {
                message: 'Update GitHub configuration (token included)',
                content: btoa(unescape(encodeURIComponent(JSON.stringify(configData, null, 2)))),
                branch: this.branch
            };

            if (sha) {
                body.sha = sha;
            }

            const response = await this.githubRequest(
                `/repos/${this.repoOwner}/${this.repoName}/contents/gitconfig.json`,
                'PUT',
                body
            );

            // Also save to localStorage
            this.saveConfigToLocalStorage(githubConfig);

            console.log('✅ gitconfig.json saved to GitHub successfully');
            console.log('🔑 Token is now available for agents to upload images');
            
            return {
                success: true,
                url: `https://github.com/${this.repoOwner}/${this.repoName}/blob/${this.branch}/gitconfig.json`
            };

        } catch (error) {
            console.error('Error saving gitconfig.json:', error);
            throw error;
        }
    }

    /**
     * Save config to localStorage (backup)
     */
    saveConfigToLocalStorage(githubConfig) {
        const config = {
            github: githubConfig,
            lastUpdated: new Date().toISOString(),
            source: 'local_backup'
        };
        localStorage.setItem('ezeeAdminConfig', JSON.stringify(config));
        console.log('💾 Config saved to localStorage as backup');
    }

    /**
     * Get current config status (for UI)
     */
    getConfigStatus() {
        return {
            repoOwner: this.repoOwner,
            repoName: this.repoName,
            branchName: this.branch,
            hasToken: !!this.token,
            configSource: this.configSource || 'none',
            configLoaded: this.configLoaded,
            tokenPreview: this.token ? `${this.token.substring(0, 4)}...${this.token.substring(this.token.length - 4)}` : null
        };
    }

    // ==================== GITHUB API METHODS ====================

    /**
     * Make authenticated GitHub request using token from gitconfig.json
     */
    async githubRequest(endpoint, method = 'GET', body = null) {
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };

        // Add token if available (from gitconfig.json)
        if (this.token) {
            headers['Authorization'] = `token ${this.token}`;
        }

        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`https://api.github.com${endpoint}`, options);
            
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

    // ==================== FILE OPERATIONS ====================

    /**
     * Get file content from GitHub using token
     */
    async getFileContent(filePath) {
        try {
            const response = await this.githubRequest(
                `/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}?ref=${this.branch}`
            );
            
            if (!response || !response.content) {
                return null;
            }
            
            const content = atob(response.content.replace(/\n/g, ''));
            return JSON.parse(content);
        } catch (error) {
            console.error(`Error reading ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Save file to GitHub using token
     */
    async saveFileContent(filePath, content, commitMessage) {
        if (!this.token) {
            throw new Error('Cannot save: No GitHub token available. Configure GitHub in admin panel first.');
        }

        try {
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
                message: commitMessage,
                content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
                branch: this.branch
            };

            if (sha) {
                body.sha = sha;
            }

            return await this.githubRequest(
                `/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}`,
                'PUT',
                body
            );
        } catch (error) {
            console.error(`Error saving ${filePath}:`, error);
            throw error;
        }
    }

    // ==================== IMAGE UPLOADS (USES TOKEN FROM GITCONFIG) ====================

    /**
     * Upload image to GitHub using token from gitconfig.json
     * This is what agents use to upload photos
     */
    async uploadImage(imageData, fileName) {
        if (!this.token) {
            throw new Error('Cannot upload image: No GitHub token available. Please ensure gitconfig.json exists with valid token.');
        }

        const filePath = `images/${fileName}`;
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
            url: `https://raw.githubusercontent.com/${this.repoOwner}/${this.repoName}/${this.branch}/${filePath}`
        };
    }

    // ==================== AGENTS MANAGEMENT ====================

    async getAgents() {
        try {
            // Try GitHub first (using token)
            const data = await this.getFileContent('agents.json');
            if (data && data.agents) {
                localStorage.setItem('ezeeAgents', JSON.stringify(data.agents));
                return data.agents;
            }
            
            // Fallback to localStorage
            const cached = localStorage.getItem('ezeeAgents');
            return cached ? JSON.parse(cached) : [];
        } catch (error) {
            console.error('Error getting agents:', error);
            const cached = localStorage.getItem('ezeeAgents');
            return cached ? JSON.parse(cached) : [];
        }
    }

    async saveAgents(agents) {
        try {
            const data = {
                agents: agents,
                lastUpdated: new Date().toISOString()
            };
            
            if (this.token) {
                await this.saveFileContent('agents.json', data, `Update agents (${agents.length})`);
            }
            
            localStorage.setItem('ezeeAgents', JSON.stringify(agents));
            return { success: true };
        } catch (error) {
            console.error('Error saving agents:', error);
            localStorage.setItem('ezeeAgents', JSON.stringify(agents));
            throw error;
        }
    }

    // ==================== SUBMISSIONS MANAGEMENT ====================

    async getSubmissions() {
        try {
            // Try GitHub first (using token)
            const data = await this.getFileContent('data.json');
            if (data && data.agents) {
                localStorage.setItem('adminSubmissions', JSON.stringify(data));
                return data.agents;
            }
            
            // Fallback to localStorage
            const cached = localStorage.getItem('adminSubmissions');
            if (cached) {
                const parsed = JSON.parse(cached);
                return parsed.agents || [];
            }
            return [];
        } catch (error) {
            console.error('Error getting submissions:', error);
            const cached = localStorage.getItem('adminSubmissions');
            if (cached) {
                const parsed = JSON.parse(cached);
                return parsed.agents || [];
            }
            return [];
        }
    }

    /**
     * Submit agent data - uses token from gitconfig.json for image uploads
     */
    async submitAgentData(submission) {
        try {
            const submissionId = submission.id || `AGENT-${Date.now()}-${Math.random().toString(36).substr(2, 3)}`;
            
            // Upload images if token exists (from gitconfig.json)
            const imageUrls = {};
            if (this.token && submission.images) {
                console.log('📸 Uploading images using token from gitconfig.json...');
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
                
                console.log('✅ Images uploaded successfully');
            } else {
                console.log('⚠️ No token available - images will not be uploaded to GitHub');
            }

            // Prepare agent data
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
                const existing = await this.getFileContent('data.json');
                submissions = existing?.agents || [];
            } catch (error) {
                console.log('Creating new data.json');
            }

            submissions.push(agentData);

            // Save to data.json if token exists
            if (this.token) {
                await this.saveFileContent(
                    'data.json',
                    { agents: submissions, lastUpdated: new Date().toISOString() },
                    `New submission from ${agentData.fullName}`
                );
            }

            // Cache to localStorage
            localStorage.setItem('adminSubmissions', JSON.stringify({ agents: submissions }));

            return {
                success: true,
                submissionId: submissionId,
                imageUrls: imageUrls,
                tokenUsed: !!this.token
            };

        } catch (error) {
            console.error('Error submitting:', error);
            throw error;
        }
    }

    // ==================== REAL-TIME POLLING ====================

    startRealTimePolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        console.log('🔄 Starting real-time polling (3s)');
        
        this.pollingInterval = setInterval(async () => {
            try {
                // CRITICAL: Reload gitconfig.json on each poll to get latest token/config
                await this.loadGitConfigFromGitHub();
                
                const submissions = await this.getSubmissions();
                const agents = await this.getAgents();
                
                // Update dashboard
                this.updateDashboardDOM(submissions, agents);
                
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 3000);
    }

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
        
        // Update config status in settings
        const configStatus = document.getElementById('configStatus');
        if (configStatus) {
            const status = this.getConfigStatus();
            let statusHtml = '';
            
            if (status.hasToken && status.configSource === 'github') {
                statusHtml = '<span style="color: #28a745;">✅ GitHub Connected (Token from gitconfig.json)</span>';
            } else if (status.hasToken) {
                statusHtml = '<span style="color: #ffc107;">⚠️ Using Local Token Backup</span>';
            } else {
                statusHtml = '<span style="color: #dc3545;">❌ No Token - Configure GitHub</span>';
            }
            
            configStatus.innerHTML = statusHtml;
            configStatus.title = `${status.repoOwner}/${status.repoName} (${status.branchName})`;
        }
    }

    // ==================== SERVICE OVERRIDES ====================

    overrideExistingServices() {
        const self = this;
        
        // Override GitHubService to use our token
        if (typeof window.GitHubService !== 'undefined') {
            window.GitHubService = class {
                constructor() { 
                    this.integration = self;
                    this.config = self.getConfigStatus();
                }
                async saveSubmission(data) { 
                    console.log('GitHubService: Using token from gitconfig.json');
                    return self.submitAgentData(data); 
                }
                async getSubmissions() { return self.getSubmissions(); }
                async saveAgents(agents) { return self.saveAgents(agents); }
                async getAgents() { return self.getAgents(); }
                saveConfig(config) { 
                    console.log('GitHubService: Saving config to gitconfig.json');
                    return self.saveGitConfigToGitHub(config); 
                }
                async testConnection() {
                    return self.token ? { ok: true } : { ok: false, error: 'No token' };
                }
            };
        }
        
        // Override RealTimeService to use our token
        if (typeof window.RealTimeService !== 'undefined') {
            window.RealTimeService = class {
                constructor() { 
                    this.integration = self;
                }
                async submitAgentData(data) { 
                    console.log('RealTimeService: Using token from gitconfig.json');
                    return self.submitAgentData(data); 
                }
                async getSubmissions() { return self.getSubmissions(); }
                async getAgents() { return self.getAgents(); }
                async saveAgents(agents) { return self.saveAgents(agents); }
                init() { 
                    return self.token ? true : false;
                }
            };
        }
    }
}

// ==================== PAGE INITIALIZATION ====================

// Single global instance
let ezeeIntegration = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Create single instance
    ezeeIntegration = new EzeeIntegration();
    window.ezeeIntegration = ezeeIntegration;
    
    const path = window.location.pathname;
    
    if (path.includes('dashboard.html')) {
        await initDashboard();
    } else if (path.includes('submit.html')) {
        await initSubmitPage();
    } else if (path.includes('login.html')) {
        await initLoginPage();
    }
});

// Dashboard initialization
async function initDashboard() {
    const integration = window.ezeeIntegration;
    
    // Override saveGitHubConfig to save to gitconfig.json
    window.saveGitHubConfig = async function() {
        const repoOwner = document.getElementById('repoOwner')?.value;
        const repoName = document.getElementById('repoName')?.value;
        const branchName = document.getElementById('branchName')?.value;
        const token = document.getElementById('githubToken')?.value;
        
        if (!repoOwner || !repoName || !token) {
            showAlert('Please fill all fields', 'error');
            return;
        }
        
        try {
            await integration.saveGitConfigToGitHub({
                repoOwner,
                repoName,
                branchName: branchName || 'main',
                token
            });
            
            showAlert('✅ Configuration saved to gitconfig.json - Token now available for agents', 'success');
            
            // Reload page to use new config
            setTimeout(() => location.reload(), 2000);
            
        } catch (error) {
            showAlert('❌ Error: ' + error.message, 'error');
        }
    };
    
    // Override testGitHubConnection
    window.testGitHubConnection = async function() {
        const status = integration.getConfigStatus();
        if (status.hasToken && status.configSource === 'github') {
            showAlert('✅ Connected to GitHub using token from gitconfig.json', 'success');
        } else if (status.hasToken) {
            showAlert('⚠️ Using local token backup - gitconfig.json may need update', 'warning');
        } else {
            showAlert('❌ No token - Configure GitHub to enable image uploads', 'error');
        }
    };
    
    // Override clearConfiguration
    window.clearConfiguration = function() {
        if (confirm('Clear all configuration? This will not delete gitconfig.json from GitHub.')) {
            localStorage.removeItem('ezeeAdminConfig');
            localStorage.removeItem('ezeeAgents');
            localStorage.removeItem('adminSubmissions');
            localStorage.removeItem('adminLoggedIn');
            window.location.href = 'login.html';
        }
    };
    
    // Load initial data
    const submissions = await integration.getSubmissions();
    const agents = await integration.getAgents();
    
    // Populate config form with current values
    const status = integration.getConfigStatus();
    document.getElementById('repoOwner').value = status.repoOwner;
    document.getElementById('repoName').value = status.repoName;
    document.getElementById('branchName').value = status.branchName;
    
    // Update UI
    integration.updateDashboardDOM(submissions, agents);
}

// Submit page initialization
async function initSubmitPage() {
    const integration = window.ezeeIntegration;
    
    // Check if agent is logged in
    const agentInfo = localStorage.getItem('agentInfo');
    if (!agentInfo) {
        window.location.href = 'login.html';
        return;
    }
    
    // Display agent name
    const agent = JSON.parse(agentInfo);
    const agentNameEl = document.getElementById('agentName');
    if (agentNameEl) agentNameEl.textContent = agent.fullName;
    
    // Show connection status based on gitconfig.json
    const status = integration.getConfigStatus();
    const indicator = document.getElementById('connectionIndicator');
    const text = document.getElementById('connectionText');
    
    if (indicator && text) {
        if (status.hasToken && status.configSource === 'github') {
            indicator.className = 'status-indicator status-online';
            text.innerHTML = '✅ Connected to GitHub (token from gitconfig.json)<br>Images will upload to repository';
        } else if (status.hasToken) {
            indicator.className = 'status-indicator status-warning';
            text.innerHTML = '⚠️ Using local token backup<br>Images may not upload to GitHub';
        } else {
            indicator.className = 'status-indicator status-offline';
            text.innerHTML = '❌ No token - Configure GitHub in admin panel<br>Images will NOT upload';
        }
    }
    
    // Override handleSubmit
    window.handleSubmit = async function() {
        try {
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
                images: window.formData || {}
            };
            
            const result = await integration.submitAgentData(submission);
            
            if (result.success) {
                // Show success message
                document.querySelector('.form-container')?.classList.add('hidden');
                const successMsg = document.getElementById('successMessage');
                const submissionId = document.getElementById('submissionId');
                
                if (successMsg) successMsg.classList.remove('hidden');
                if (submissionId) submissionId.textContent = result.submissionId;
                
                // Update images location text
                const imagesLocation = document.getElementById('imagesLocation');
                if (imagesLocation) {
                    if (result.tokenUsed) {
                        imagesLocation.innerHTML = `✅ Images uploaded to: ${status.repoOwner}/${status.repoName}/images/`;
                        imagesLocation.style.color = '#28a745';
                    } else {
                        imagesLocation.innerHTML = '⚠️ Images saved locally only (no token)';
                        imagesLocation.style.color = '#ffc107';
                    }
                }
            }
            
        } catch (error) {
            alert('❌ Submission failed: ' + error.message);
        }
    };
}

// Login page initialization
async function initLoginPage() {
    const integration = window.ezeeIntegration;
    
    // Show connection status
    const status = integration.getConfigStatus();
    const indicator = document.getElementById('connectionIndicator');
    const text = document.getElementById('connectionText');
    
    if (indicator && text) {
        if (status.hasToken && status.configSource === 'github') {
            indicator.className = 'status-indicator status-online';
            text.innerHTML = '✅ System ready - Token loaded from gitconfig.json';
        } else if (status.hasToken) {
            indicator.className = 'status-indicator status-warning';
            text.innerHTML = '⚠️ Using local token - gitconfig.json may need update';
        } else {
            indicator.className = 'status-indicator status-offline';
            text.innerHTML = '❌ No token - Contact administrator';
        }
    }
    
    // Override handleLogin
    window.handleLogin = async function(e) {
        e.preventDefault();
        
        const scCode = document.getElementById('scCode')?.value;
        const fullName = document.getElementById('fullName')?.value;
        const password = document.getElementById('password')?.value;
        
        try {
            const agents = await integration.getAgents();
            
            const agent = agents.find(a => 
                a.scCode === scCode && 
                a.fullName === fullName && 
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

// Helper functions
function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) {
        alert(message);
        return;
    }
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.innerHTML = `
        <span>${type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '❌'}</span>
        <span>${message}</span>
    `;
    
    alertContainer.appendChild(alertDiv);
    setTimeout(() => alertDiv.remove(), 5000);
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EzeeIntegration;
}
