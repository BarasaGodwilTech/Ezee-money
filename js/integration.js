/**
 * integration.js - Ezee Money Complete Integration System
 * Version: 2.3.0 - FIXED: Submissions display, Agents display, GitHub config loading, Bad credentials
 */

class EzeeIntegration {
    constructor() {
        this.token = null;
        this.repoOwner = 'BarasaGodwilTech';
        this.repoName = 'Ezee-money';
        this.branch = 'main';
        this.baseURL = 'https://api.github.com';
        this.configLoaded = false;
        this.configSource = null;
        this.pollingInterval = null;
        
        // Initialize immediately
        this.init();
    }

    async init() {
        console.log('🚀 Initializing EzeeIntegration...');
        
        // FIRST: Try to load gitconfig.json from GitHub (this has the token)
        await this.loadGitConfigFromGitHub();
        
        // SECOND: If no token from GitHub, try localStorage
        if (!this.token) {
            this.loadConfigFromLocalStorage();
        }
        
        console.log('✅ Integration initialized:', {
            configSource: this.configSource,
            repo: `${this.repoOwner}/${this.repoName}`,
            hasToken: !!this.token,
            branch: this.branch
        });
        
        // Override existing services
        this.overrideExistingServices();
        
        // If on dashboard, load data immediately and start polling
        if (window.location.pathname.includes('dashboard.html')) {
            await this.loadDashboardData();
            this.startRealTimePolling();
        }
        
        return this;
    }

    // ==================== GITCONFIG LOADING ====================

    async loadGitConfigFromGitHub() {
        try {
            console.log('📥 Loading gitconfig.json from GitHub...');
            
            // Try without token first (public repos allow reading)
            const response = await fetch(
                `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/gitconfig.json?ref=${this.branch}`
            );

            if (response.ok) {
                const data = await response.json();
                if (data.content) {
                    // Decode base64 content
                    const content = JSON.parse(atob(data.content.replace(/\n/g, '')));
                    
                    // Extract GitHub config
                    if (content.github) {
                        this.repoOwner = content.github.repoOwner || this.repoOwner;
                        this.repoName = content.github.repoName || this.repoName;
                        this.branch = content.github.branchName || this.branch;
                        
                        // Get the token
                        if (content.github.token) {
                            this.token = content.github.token;
                            console.log('🔑 GitHub token loaded from gitconfig.json');
                        }
                        
                        // Save to localStorage as backup
                        this.saveConfigToLocalStorage({
                            repoOwner: this.repoOwner,
                            repoName: this.repoName,
                            branchName: this.branch,
                            token: this.token
                        });
                        
                        console.log('✅ gitconfig.json loaded from GitHub');
                        this.configSource = 'github';
                        this.configLoaded = true;
                        
                        // Update UI if on dashboard
                        this.updateConfigStatusInUI();
                        
                        return true;
                    }
                }
            } else if (response.status === 401) {
                console.log('⚠️ Bad credentials - token may be invalid');
                this.showAlert('GitHub token is invalid. Please update in settings.', 'error');
            } else if (response.status === 404) {
                console.log('⚠️ gitconfig.json not found on GitHub');
            }
        } catch (error) {
            console.error('Error loading gitconfig.json:', error);
        }
        return false;
    }

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
                    
                    console.log('📦 Loaded config from localStorage');
                    this.configSource = 'local';
                    this.configLoaded = true;
                    
                    // Update UI
                    this.updateConfigStatusInUI();
                }
            }
        } catch (error) {
            console.error('Error loading from localStorage:', error);
        }
    }

    saveConfigToLocalStorage(githubConfig) {
        const config = {
            github: githubConfig,
            lastUpdated: new Date().toISOString()
        };
        localStorage.setItem('ezeeAdminConfig', JSON.stringify(config));
    }

    async saveGitConfigToGitHub(githubConfig) {
        if (!githubConfig.token) {
            throw new Error('Token is required');
        }

        try {
            console.log('📤 Saving to gitconfig.json...');
            
            // Test token first
            const testResponse = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${githubConfig.token}`
                }
            });
            
            if (!testResponse.ok) {
                throw new Error('Bad credentials - token is invalid');
            }

            // Update current instance
            this.token = githubConfig.token;
            this.repoOwner = githubConfig.repoOwner || this.repoOwner;
            this.repoName = githubConfig.repoName || this.repoName;
            this.branch = githubConfig.branchName || this.branch;

            const configData = {
                github: {
                    repoOwner: this.repoOwner,
                    repoName: this.repoName,
                    branchName: this.branch,
                    token: this.token,
                    lastUpdated: new Date().toISOString()
                },
                version: '2.3.0'
            };

            // Check if file exists
            let sha = null;
            try {
                const existing = await fetch(
                    `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/gitconfig.json`,
                    {
                        headers: {
                            'Authorization': `token ${this.token}`
                        }
                    }
                );
                if (existing.ok) {
                    const data = await existing.json();
                    sha = data.sha;
                }
            } catch (error) {
                // File doesn't exist
            }

            // Save to GitHub
            const body = {
                message: 'Update GitHub configuration',
                content: btoa(unescape(encodeURIComponent(JSON.stringify(configData, null, 2)))),
                branch: this.branch
            };

            if (sha) {
                body.sha = sha;
            }

            const response = await fetch(
                `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/gitconfig.json`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                }
            );

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to save');
            }

            // Save to localStorage
            this.saveConfigToLocalStorage(githubConfig);

            console.log('✅ gitconfig.json saved successfully');
            return { success: true };

        } catch (error) {
            console.error('Error saving:', error);
            throw error;
        }
    }

    // ==================== DATA LOADING ====================

    async loadDashboardData() {
        try {
            console.log('📊 Loading dashboard data...');
            
            // Load submissions from data.json
            const submissions = await this.getSubmissions();
            console.log(`📝 Loaded ${submissions.length} submissions`);
            
            // Load agents from agents.json
            const agents = await this.getAgents();
            console.log(`👥 Loaded ${agents.length} agents`);
            
            // Update the UI
            this.updateDashboardUI(submissions, agents);
            
            return { submissions, agents };
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    async getSubmissions() {
        try {
            // Try GitHub first
            if (this.token) {
                const response = await fetch(
                    `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/data.json?ref=${this.branch}`,
                    {
                        headers: this.token ? { 'Authorization': `token ${this.token}` } : {}
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    if (data.content) {
                        const content = JSON.parse(atob(data.content.replace(/\n/g, '')));
                        const submissions = content.agents || [];
                        
                        // Cache to localStorage
                        localStorage.setItem('adminSubmissions', JSON.stringify({ agents: submissions }));
                        
                        return submissions;
                    }
                } else if (response.status === 404) {
                    console.log('data.json not found, creating empty file');
                    return [];
                }
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
            return cached ? JSON.parse(cached).agents || [] : [];
        }
    }

    async getAgents() {
        try {
            // Try GitHub first
            if (this.token) {
                const response = await fetch(
                    `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/agents.json?ref=${this.branch}`,
                    {
                        headers: this.token ? { 'Authorization': `token ${this.token}` } : {}
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    if (data.content) {
                        const content = JSON.parse(atob(data.content.replace(/\n/g, '')));
                        const agents = content.agents || [];
                        
                        // Cache to localStorage
                        localStorage.setItem('ezeeAgents', JSON.stringify(agents));
                        
                        return agents;
                    }
                } else if (response.status === 404) {
                    console.log('agents.json not found, creating empty file');
                    return [];
                }
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

    // ==================== UI UPDATES ====================

    updateDashboardUI(submissions, agents) {
        console.log('🖥️ Updating dashboard UI...');
        
        // Update stats cards
        this.updateStatsCards(submissions, agents);
        
        // Update submissions table
        this.updateSubmissionsTable(submissions);
        
        // Update agents list
        this.updateAgentsList(agents);
        
        // Update config status
        this.updateConfigStatusInUI();
    }

    updateStatsCards(submissions, agents) {
        // Total Agents
        const totalAgentsEl = document.getElementById('totalAgents');
        if (totalAgentsEl) totalAgentsEl.textContent = agents.length || '0';
        
        // Total Submissions
        const totalSubmissionsEl = document.getElementById('totalSubmissions');
        if (totalSubmissionsEl) totalSubmissionsEl.textContent = submissions.length || '0';
        
        // Today's Submissions
        const today = new Date().toDateString();
        const todayCount = submissions.filter(s => 
            new Date(s.submissionDate).toDateString() === today
        ).length;
        const todaySubmissionsEl = document.getElementById('todaySubmissions');
        if (todaySubmissionsEl) todaySubmissionsEl.textContent = todayCount || '0';
        
        // Active Agents
        const activeCount = agents.filter(a => a.status === 'active').length;
        const activeAgentsEl = document.getElementById('activeAgents');
        if (activeAgentsEl) activeAgentsEl.textContent = activeCount || '0';
    }

    updateSubmissionsTable(submissions) {
        const tbody = document.querySelector('#submissionsTable tbody');
        if (!tbody) {
            console.log('Submissions table not found');
            return;
        }

        if (!submissions || submissions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #6b7280;">No submissions found</td></tr>';
            return;
        }

        console.log(`📋 Rendering ${submissions.length} submissions`);
        
        tbody.innerHTML = submissions.map(sub => {
            // Handle different field names
            const scCode = sub.personalNumber || sub.scCode || 'N/A';
            const agentName = sub.fullName || sub.agentName || 'N/A';
            const submissionDate = sub.submissionDate || sub.date || new Date().toISOString();
            const status = sub.status || 'pending';
            
            return `
                <tr>
                    <td>${scCode}</td>
                    <td>${agentName}</td>
                    <td>${new Date(submissionDate).toLocaleDateString()}</td>
                    <td><span class="status-badge status-${status}">${status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="window.ezeeIntegration.viewSubmission('${sub.id}')">View</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    updateAgentsList(agents) {
        const agentList = document.getElementById('agentList');
        if (!agentList) {
            console.log('Agent list element not found');
            return;
        }

        if (!agents || agents.length === 0) {
            agentList.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 20px;">No field agents configured</p>';
            return;
        }

        console.log(`👥 Rendering ${agents.length} agents`);
        
        agentList.innerHTML = agents.map(agent => `
            <div class="agent-item">
                <div class="agent-info">
                    <div class="agent-name">${agent.fullName || 'Unknown'}</div>
                    <div class="agent-details">
                        SC Code: ${agent.scCode || 'N/A'} | 
                        Status: ${agent.status || 'inactive'}
                    </div>
                </div>
                <div class="agent-actions">
                    <button class="btn btn-sm btn-warning" onclick="window.ezeeIntegration.editAgent('${agent.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="window.ezeeIntegration.editAgent('${agent.id}')">Delete</button>
                </div>
            </div>
        `).join('');
    }

    updateConfigStatusInUI() {
        // Update config status in settings
        const configStatus = document.getElementById('configStatus');
        if (configStatus) {
            if (this.token && this.configSource === 'github') {
                configStatus.innerHTML = '<span style="color: #28a745;">✅ Connected to GitHub (Token from gitconfig.json)</span>';
            } else if (this.token) {
                configStatus.innerHTML = '<span style="color: #ffc107;">⚠️ Using local token backup</span>';
            } else {
                configStatus.innerHTML = '<span style="color: #dc3545;">❌ No token - Configure GitHub</span>';
            }
        }

        // Update form fields with current config
        const repoOwnerInput = document.getElementById('repoOwner');
        const repoNameInput = document.getElementById('repoName');
        const branchNameInput = document.getElementById('branchName');
        
        if (repoOwnerInput) repoOwnerInput.value = this.repoOwner;
        if (repoNameInput) repoNameInput.value = this.repoName;
        if (branchNameInput) branchNameInput.value = this.branch;
    }

    // ==================== REAL-TIME POLLING ====================

    startRealTimePolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        console.log('🔄 Starting real-time polling (every 3 seconds)');
        
        this.pollingInterval = setInterval(async () => {
            try {
                // Reload gitconfig.json to get latest token
                await this.loadGitConfigFromGitHub();
                
                // Reload data
                await this.loadDashboardData();
                
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 3000);
    }

    // ==================== SUBMISSION VIEW ====================

    viewSubmission(submissionId) {
        this.getSubmissions().then(submissions => {
            const submission = submissions.find(s => s.id === submissionId);
            if (!submission) {
                alert('Submission not found');
                return;
            }
            
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

    // ==================== AGENT MANAGEMENT ====================

    async editAgent(agentId) {
        const agents = await this.getAgents();
        const agent = agents.find(a => a.id === agentId);
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

        await this.saveAgents(agents);
        this.updateAgentsList(agents);
        this.showAlert('Agent updated successfully!', 'success');
    }

    async deleteAgent(agentId) {
        if (!confirm('Are you sure you want to delete this agent?')) return;

        const agents = await this.getAgents();
        const updatedAgents = agents.filter(agent => agent.id !== agentId);
        
        await this.saveAgents(updatedAgents);
        this.updateAgentsList(updatedAgents);
        this.showAlert('Agent deleted successfully!', 'success');
    }

    async saveAgents(agents) {
        try {
            if (this.token) {
                const data = {
                    agents: agents,
                    lastUpdated: new Date().toISOString()
                };
                
                await this.saveFileToGitHub('agents.json', data, 'Update agents list');
            }
            
            localStorage.setItem('ezeeAgents', JSON.stringify(agents));
            return { success: true };
        } catch (error) {
            console.error('Error saving agents:', error);
            localStorage.setItem('ezeeAgents', JSON.stringify(agents));
            throw error;
        }
    }

    async saveFileToGitHub(filePath, content, message) {
        if (!this.token) throw new Error('No token');

        // Get current file SHA if exists
        let sha = null;
        try {
            const response = await fetch(
                `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}`,
                {
                    headers: { 'Authorization': `token ${this.token}` }
                }
            );
            if (response.ok) {
                const data = await response.json();
                sha = data.sha;
            }
        } catch (error) {
            // File doesn't exist
        }

        const body = {
            message: message,
            content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
            branch: this.branch
        };

        if (sha) {
            body.sha = sha;
        }

        const response = await fetch(
            `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message);
        }

        return await response.json();
    }

    // ==================== UTILITY ====================

    showAlert(message, type) {
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

    overrideExistingServices() {
        const self = this;
        
        // Override window functions
        window.loadDashboardData = async () => {
            return self.loadDashboardData();
        };
        
        window.refreshSubmissions = async () => {
            await self.loadDashboardData();
            self.showAlert('Submissions refreshed!', 'success');
        };
        
        window.testGitHubConnection = async () => {
            const status = self.getConfigStatus();
            if (status.hasToken && status.configSource === 'github') {
                self.showAlert('✅ Connected to GitHub using token from gitconfig.json', 'success');
            } else if (status.hasToken) {
                self.showAlert('⚠️ Using local token backup', 'warning');
            } else {
                self.showAlert('❌ No token - Configure GitHub', 'error');
            }
        };
        
        window.saveGitHubConfig = async () => {
            const repoOwner = document.getElementById('repoOwner')?.value;
            const repoName = document.getElementById('repoName')?.value;
            const branchName = document.getElementById('branchName')?.value;
            const token = document.getElementById('githubToken')?.value;
            
            if (!repoOwner || !repoName || !token) {
                self.showAlert('Please fill all fields', 'error');
                return;
            }
            
            try {
                await self.saveGitConfigToGitHub({
                    repoOwner,
                    repoName,
                    branchName: branchName || 'main',
                    token
                });
                
                self.showAlert('✅ Configuration saved to gitconfig.json', 'success');
                
                // Reload page to use new config
                setTimeout(() => location.reload(), 2000);
                
            } catch (error) {
                self.showAlert('❌ Error: ' + error.message, 'error');
            }
        };
        
        window.viewSubmission = (id) => self.viewSubmission(id);
        window.editAgent = (id) => self.editAgent(id);
        window.deleteAgent = (id) => self.deleteAgent(id);
    }

    getConfigStatus() {
        return {
            repoOwner: this.repoOwner,
            repoName: this.repoName,
            branchName: this.branch,
            hasToken: !!this.token,
            configSource: this.configSource,
            configLoaded: this.configLoaded
        };
    }
}

// Initialize on page load
let ezeeIntegration = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Create single instance
    ezeeIntegration = new EzeeIntegration();
    window.ezeeIntegration = ezeeIntegration;
    
    // Additional dashboard initialization
    if (window.location.pathname.includes('dashboard.html')) {
        // Override showAddAgentModal
        window.showAddAgentModal = async function() {
            const fullName = prompt('Enter agent full name:');
            if (!fullName) return;

            const scCode = prompt('Enter agent SC code:');
            if (!scCode) return;

            const password = prompt('Enter agent password:');
            if (!password) return;

            const agents = await ezeeIntegration.getAgents();
            
            const newAgent = {
                id: Date.now().toString(),
                fullName,
                scCode,
                password,
                status: 'active',
                createdAt: new Date().toISOString()
            };

            agents.push(newAgent);
            await ezeeIntegration.saveAgents(agents);
            ezeeIntegration.updateAgentsList(agents);
            ezeeIntegration.showAlert('Agent added successfully!', 'success');
        };
    }
});

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EzeeIntegration;
}
// ==================== ADD THIS AT THE VERY END OF integration.js ====================
// FIXES: Agent saving to agents.json, Agent name on submissions, Filter by agent, SC Code display

// Extend the EzeeIntegration class with additional methods
EzeeIntegration.prototype.fixAgentSaving = async function() {
    console.log('🔧 Applying agent saving fix...');
    
    // Override the saveAgents method to ensure it saves to GitHub
    const originalSaveAgents = this.saveAgents;
    this.saveAgents = async function(agents) {
        try {
            console.log('📝 Saving agents to agents.json...');
            
            const data = {
                agents: agents,
                lastUpdated: new Date().toISOString(),
                totalAgents: agents.length
            };
            
            // Save to GitHub if token exists
            if (this.token) {
                // Get current file SHA if exists
                let sha = null;
                try {
                    const response = await fetch(
                        `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/agents.json`,
                        {
                            headers: { 'Authorization': `token ${this.token}` }
                        }
                    );
                    if (response.ok) {
                        const fileData = await response.json();
                        sha = fileData.sha;
                    }
                } catch (error) {
                    console.log('agents.json may not exist yet');
                }

                // Save to GitHub
                const body = {
                    message: `Update agents list (${agents.length} agents)`,
                    content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
                    branch: this.branch
                };

                if (sha) {
                    body.sha = sha;
                }

                const saveResponse = await fetch(
                    `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/agents.json`,
                    {
                        method: 'PUT',
                        headers: {
                            'Authorization': `token ${this.token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(body)
                    }
                );

                if (!saveResponse.ok) {
                    const error = await saveResponse.json();
                    throw new Error(error.message || 'Failed to save agents.json');
                }

                console.log('✅ Agents saved to GitHub successfully');
            }
            
            // Always save to localStorage
            localStorage.setItem('ezeeAgents', JSON.stringify(agents));
            
            // Update the UI
            if (typeof this.updateAgentsList === 'function') {
                this.updateAgentsList(agents);
            }
            
            return { success: true };
            
        } catch (error) {
            console.error('❌ Error saving agents:', error);
            // Fallback to localStorage
            localStorage.setItem('ezeeAgents', JSON.stringify(agents));
            throw error;
        }
    };
    
    console.log('✅ Agent saving fix applied');
};

// Fix submission to include agent info and save properly
EzeeIntegration.prototype.fixSubmissionSaving = async function() {
    console.log('🔧 Applying submission saving fix...');
    
    // Override submitAgentData to ensure agent info is included
    const originalSubmit = this.submitAgentData;
    this.submitAgentData = async function(submission) {
        try {
            console.log('📝 Processing submission with agent info...');
            
            // Get current agent info from localStorage
            let agentInfo = { fullName: 'Unknown', scCode: 'N/A' };
            try {
                const savedAgent = localStorage.getItem('agentInfo');
                if (savedAgent) {
                    agentInfo = JSON.parse(savedAgent);
                }
            } catch (error) {
                console.warn('Could not load agent info from localStorage');
            }

            // Generate submission ID
            const submissionId = submission.id || `SUB-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
            
            // Upload images if token exists
            const imageUrls = {};
            if (this.token && submission.images) {
                console.log('📸 Uploading images...');
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

            // Prepare submission data with agent info
            const submissionData = {
                id: submissionId,
                // Client info
                fullName: submission.fullName || '',
                personalNumber: submission.personalNumber || '', // This is the phone number
                email: submission.email || '',
                nationalId: submission.nationalId || '',
                dob: submission.dob || '',
                gender: submission.gender || '',
                businessAddress: submission.businessAddress || '',
                residentialAddress: submission.residentialAddress || '',
                
                // Next of kin
                nextOfKinName: submission.nextOfKinName || '',
                nextOfKinRelationship: submission.nextOfKinRelationship || '',
                nextOfKinPhone: submission.nextOfKinPhone || '',
                
                // Agent info - CRITICAL for identification
                agentName: agentInfo.fullName || submission.agentName || 'Unknown',
                agentScCode: agentInfo.scCode || submission.agentScCode || 'N/A',
                agentId: agentInfo.id || submission.agentId || '',
                
                // Submission metadata
                submissionDate: submission.submissionDate || new Date().toISOString(),
                status: 'pending',
                
                // Image URLs
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

            // Add new submission
            submissions.push(submissionData);

            // Save to data.json
            const dataToSave = {
                agents: submissions,
                lastUpdated: new Date().toISOString()
            };

            if (this.token) {
                // Get current file SHA
                let sha = null;
                try {
                    const response = await fetch(
                        `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/data.json`,
                        {
                            headers: { 'Authorization': `token ${this.token}` }
                        }
                    );
                    if (response.ok) {
                        const fileData = await response.json();
                        sha = fileData.sha;
                    }
                } catch (error) {
                    console.log('data.json may not exist yet');
                }

                // Save to GitHub
                const body = {
                    message: `New submission from ${submissionData.agentName} (SC: ${submissionData.agentScCode})`,
                    content: btoa(unescape(encodeURIComponent(JSON.stringify(dataToSave, null, 2)))),
                    branch: this.branch
                };

                if (sha) {
                    body.sha = sha;
                }

                const saveResponse = await fetch(
                    `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/data.json`,
                    {
                        method: 'PUT',
                        headers: {
                            'Authorization': `token ${this.token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(body)
                    }
                );

                if (!saveResponse.ok) {
                    const error = await saveResponse.json();
                    throw new Error(error.message || 'Failed to save data.json');
                }

                console.log('✅ Submission saved to GitHub');
            }

            // Cache to localStorage
            localStorage.setItem('adminSubmissions', JSON.stringify(dataToSave));

            return {
                success: true,
                submissionId: submissionId,
                imageUrls: imageUrls,
                agentInfo: {
                    name: submissionData.agentName,
                    scCode: submissionData.agentScCode
                }
            };

        } catch (error) {
            console.error('❌ Error in submission:', error);
            throw error;
        }
    };
    
    console.log('✅ Submission saving fix applied');
};

// Add agent filter functionality
EzeeIntegration.prototype.addAgentFilter = function() {
    console.log('🔧 Adding agent filter...');
    
    // Create filter section HTML
    const filterSection = `
        <div class="card" style="margin-bottom: 20px;">
            <div class="card-header">
                <h3 class="card-title">Filter Submissions by Agent</h3>
            </div>
            <div style="padding: 20px;">
                <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
                    <div style="flex: 1;">
                        <select id="agentFilterSelect" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                            <option value="all">All Agents</option>
                        </select>
                    </div>
                    <div>
                        <button class="btn btn-primary" onclick="window.ezeeIntegration.applyAgentFilter()">
                            <i class="fas fa-filter"></i> Apply Filter
                        </button>
                    </div>
                    <div>
                        <button class="btn btn-secondary" onclick="window.ezeeIntegration.clearAgentFilter()">
                            <i class="fas fa-times"></i> Clear
                        </button>
                    </div>
                </div>
                <div id="agentSubmissionStats" style="margin-top: 15px; font-size: 14px; color: #666;">
                    Loading stats...
                </div>
            </div>
        </div>
    `;

    // Insert filter before submissions table
    const submissionsCard = document.querySelector('#submissions .card');
    if (submissionsCard) {
        // Check if filter already exists
        if (!document.getElementById('agentFilterSelect')) {
            submissionsCard.insertAdjacentHTML('beforebegin', filterSection);
        }
    }

    // Populate filter dropdown
    this.populateAgentFilter();
};

// Populate agent filter dropdown
EzeeIntegration.prototype.populateAgentFilter = async function() {
    const filterSelect = document.getElementById('agentFilterSelect');
    if (!filterSelect) return;

    try {
        const agents = await this.getAgents();
        const submissions = await this.getSubmissions();

        // Get unique agents from submissions
        const agentStats = {};
        submissions.forEach(sub => {
            const agentName = sub.agentName || 'Unknown';
            const agentScCode = sub.agentScCode || 'N/A';
            const key = `${agentName} (${agentScCode})`;
            
            if (!agentStats[key]) {
                agentStats[key] = {
                    name: agentName,
                    scCode: agentScCode,
                    count: 0
                };
            }
            agentStats[key].count++;
        });

        // Update filter dropdown
        filterSelect.innerHTML = '<option value="all">All Agents</option>';
        
        Object.entries(agentStats).forEach(([key, stats]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${stats.name} (${stats.scCode}) - ${stats.count} submissions`;
            filterSelect.appendChild(option);
        });

        // Update stats display
        const statsEl = document.getElementById('agentSubmissionStats');
        if (statsEl) {
            const totalSubmissions = submissions.length;
            const uniqueAgents = Object.keys(agentStats).length;
            statsEl.innerHTML = `
                <strong>${totalSubmissions}</strong> total submissions from 
                <strong>${uniqueAgents}</strong> unique agents
            `;
        }

    } catch (error) {
        console.error('Error populating agent filter:', error);
    }
};

// Apply agent filter
EzeeIntegration.prototype.applyAgentFilter = async function() {
    const filterSelect = document.getElementById('agentFilterSelect');
    if (!filterSelect) return;

    const selectedValue = filterSelect.value;
    const submissions = await this.getSubmissions();

    let filteredSubmissions = submissions;
    if (selectedValue !== 'all') {
        // Extract agent name and SC code from selected value
        const match = selectedValue.match(/(.+) \((.+)\)/);
        if (match) {
            const agentName = match[1];
            const agentScCode = match[2];
            
            filteredSubmissions = submissions.filter(sub => 
                sub.agentName === agentName && sub.agentScCode === agentScCode
            );
        }
    }

    // Update submissions table with filtered data
    this.updateSubmissionsTableWithFix(filteredSubmissions);
    
    // Show filter indicator
    const statsEl = document.getElementById('agentSubmissionStats');
    if (statsEl) {
        if (selectedValue === 'all') {
            statsEl.innerHTML = `Showing all <strong>${filteredSubmissions.length}</strong> submissions`;
        } else {
            statsEl.innerHTML = `Showing <strong>${filteredSubmissions.length}</strong> submissions for <strong>${selectedValue}</strong>`;
        }
    }
};

// Clear agent filter
EzeeIntegration.prototype.clearAgentFilter = async function() {
    const filterSelect = document.getElementById('agentFilterSelect');
    if (filterSelect) {
        filterSelect.value = 'all';
    }
    
    const submissions = await this.getSubmissions();
    this.updateSubmissionsTableWithFix(submissions);
    
    const statsEl = document.getElementById('agentSubmissionStats');
    if (statsEl) {
        statsEl.innerHTML = `Showing all <strong>${submissions.length}</strong> submissions`;
    }
};

// Fixed submissions table update with proper SC Code display
EzeeIntegration.prototype.updateSubmissionsTableWithFix = function(submissions) {
    const tbody = document.querySelector('#submissionsTable tbody');
    if (!tbody) return;

    if (!submissions || submissions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #6b7280;">No submissions found</td></tr>';
        return;
    }

    tbody.innerHTML = submissions.map(sub => {
        // Use personalNumber for SC Code (this is the phone number)
        const scCode = sub.personalNumber || sub.phoneNumber || sub.scCode || 'N/A';
        // Show agent name with SC code in parentheses
        const agentDisplay = sub.agentName 
            ? `${sub.agentName} ${sub.agentScCode ? `(${sub.agentScCode})` : ''}`
            : 'N/A';
        
        const submissionDate = sub.submissionDate || sub.date || new Date().toISOString();
        const status = sub.status || 'pending';
        
        return `
            <tr>
                <td>${scCode}</td>
                <td>${agentDisplay}</td>
                <td>${new Date(submissionDate).toLocaleDateString()}</td>
                <td><span class="status-badge status-${status}">${status}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="window.ezeeIntegration.viewSubmission('${sub.id}')">View</button>
                </td>
            </tr>
        `;
    }).join('');
};

// Override the dashboard initialization to include all fixes
EzeeIntegration.prototype.applyAllFixes = async function() {
    console.log('🔧 Applying all fixes...');
    
    // Apply agent saving fix
    await this.fixAgentSaving();
    
    // Apply submission saving fix
    await this.fixSubmissionSaving();
    
    // Add agent filter to dashboard
    if (window.location.pathname.includes('dashboard.html')) {
        this.addAgentFilter();
        
        // Override the getSubmissions method to use our fixed version
        const originalGetSubmissions = this.getSubmissions;
        this.getSubmissions = async function() {
            try {
                if (this.token) {
                    const response = await fetch(
                        `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/contents/data.json?ref=${this.branch}`,
                        {
                            headers: { 'Authorization': `token ${this.token}` }
                        }
                    );

                    if (response.ok) {
                        const data = await response.json();
                        if (data.content) {
                            const content = JSON.parse(atob(data.content.replace(/\n/g, '')));
                            const submissions = content.agents || [];
                            localStorage.setItem('adminSubmissions', JSON.stringify({ agents: submissions }));
                            
                            // Update table with fixed display
                            this.updateSubmissionsTableWithFix(submissions);
                            
                            return submissions;
                        }
                    }
                }
                
                const cached = localStorage.getItem('adminSubmissions');
                if (cached) {
                    const parsed = JSON.parse(cached);
                    const submissions = parsed.agents || [];
                    this.updateSubmissionsTableWithFix(submissions);
                    return submissions;
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
        };
        
        // Refresh data to apply fixes
        setTimeout(async () => {
            await this.loadDashboardData();
            await this.populateAgentFilter();
        }, 1000);
    }
    
    console.log('✅ All fixes applied successfully');
};

// Override the showAddAgentModal function to ensure it uses our fixed save method
window.showAddAgentModal = async function() {
    const fullName = prompt('Enter agent full name:');
    if (!fullName) return;

    const scCode = prompt('Enter agent SC code:');
    if (!scCode) return;

    const password = prompt('Enter agent password:');
    if (!password) return;

    const integration = window.ezeeIntegration;
    if (!integration) {
        alert('Integration not initialized');
        return;
    }

    try {
        const agents = await integration.getAgents();
        
        const newAgent = {
            id: Date.now().toString(),
            fullName,
            scCode,
            password,
            status: 'active',
            createdAt: new Date().toISOString()
        };

        agents.push(newAgent);
        
        // Use our fixed save method
        await integration.saveAgents(agents);
        
        // Update UI
        integration.updateAgentsList(agents);
        
        // Show success message
        if (typeof integration.showAlert === 'function') {
            integration.showAlert('Agent added successfully!', 'success');
        } else {
            alert('Agent added successfully!');
        }
        
    } catch (error) {
        console.error('Error adding agent:', error);
        alert('Error adding agent: ' + error.message);
    }
};

// Override the handleSubmit function to ensure agent info is included
if (window.location.pathname.includes('submit.html')) {
    const originalHandleSubmit = window.handleSubmit;
    window.handleSubmit = async function() {
        const integration = window.ezeeIntegration;
        if (!integration) {
            alert('Integration not initialized');
            return;
        }

        try {
            // Get agent info from localStorage
            const agentInfo = JSON.parse(localStorage.getItem('agentInfo') || '{}');
            
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
                images: window.formData || {},
                // Add agent info
                agentName: agentInfo.fullName,
                agentScCode: agentInfo.scCode,
                agentId: agentInfo.id
            };
            
            const result = await integration.submitAgentData(submission);
            
            if (result.success) {
                // Show success message
                document.querySelector('.form-container')?.classList.add('hidden');
                const successMsg = document.getElementById('successMessage');
                const submissionId = document.getElementById('submissionId');
                
                if (successMsg) successMsg.classList.remove('hidden');
                if (submissionId) submissionId.textContent = result.submissionId;
                
                // Show agent info in success message
                const imagesLocation = document.getElementById('imagesLocation');
                if (imagesLocation) {
                    imagesLocation.innerHTML = `Submitted by: ${result.agentInfo.name} (${result.agentInfo.scCode})`;
                    imagesLocation.style.color = '#28a745';
                }
            }
            
        } catch (error) {
            alert('❌ Submission failed: ' + error.message);
        }
    };
}

// Apply all fixes after initialization
setTimeout(() => {
    if (window.ezeeIntegration) {
        window.ezeeIntegration.applyAllFixes();
    }
}, 500);
// ==================== END OF ADDITIONS ====================
