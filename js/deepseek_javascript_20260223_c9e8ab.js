/**
 * Ezee Money Integration Service
 * Handles GitHub synchronization and real-time updates for admin dashboard
 * Version: 1.0.0
 */

class IntegrationService {
    constructor() {
        this.baseURL = 'https://api.github.com';
        this.config = this.loadConfig();
        this.pollingInterval = 5000; // 5 seconds
        this.pollingTimer = null;
        this.isPolling = false;
        this.initialized = false;
    }

    /**
     * Load configuration from gitconfig.json
     */
    async loadConfig() {
        try {
            // First check localStorage for quick access
            const localConfig = localStorage.getItem('ezeeGitConfig');
            if (localConfig) {
                return JSON.parse(localConfig);
            }

            // If no local config, try to fetch from GitHub
            const response = await fetch('https://api.github.com/repos/BarasaGodwilTech/Ezee-money/contents/gitconfig.json');
            if (response.ok) {
                const data = await response.json();
                const content = JSON.parse(atob(data.content));
                localStorage.setItem('ezeeGitConfig', JSON.stringify(content));
                return content;
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }

        // Return default config
        const defaultConfig = {
            repoOwner: 'BarasaGodwilTech',
            repoName: 'Ezee-money',
            branchName: 'main',
            token: localStorage.getItem('github_token') || '',
            galleryUploadEnabled: true
        };
        localStorage.setItem('ezeeGitConfig', JSON.stringify(defaultConfig));
        return defaultConfig;
    }

    /**
     * Save configuration to gitconfig.json
     */
    async saveConfig(config) {
        try {
            // Update localStorage
            localStorage.setItem('ezeeGitConfig', JSON.stringify(config));
            this.config = config;

            // Save token separately for API calls
            if (config.token) {
                localStorage.setItem('github_token', config.token);
            }

            // Save to GitHub if token exists
            if (config.token) {
                const content = btoa(JSON.stringify(config, null, 2));
                
                // Check if file exists
                let sha = null;
                try {
                    const checkResponse = await fetch(`https://api.github.com/repos/${config.repoOwner}/${config.repoName}/contents/gitconfig.json`, {
                        headers: {
                            'Authorization': `token ${config.token}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    });
                    if (checkResponse.ok) {
                        const fileData = await checkResponse.json();
                        sha = fileData.sha;
                    }
                } catch (e) {
                    // File doesn't exist
                }

                // Create or update file
                const response = await fetch(`https://api.github.com/repos/${config.repoOwner}/${config.repoName}/contents/gitconfig.json`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${config.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: 'Update GitHub configuration',
                        content: content,
                        sha: sha,
                        branch: config.branchName
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to save config to GitHub');
                }

                console.log('Configuration saved to gitconfig.json');
            }

            return { success: true };
        } catch (error) {
            console.error('Error saving config:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Fetch data.json from GitHub
     */
    async fetchDataJson() {
        try {
            if (!this.config.token) {
                // Fallback to localStorage
                const localData = localStorage.getItem('ezeeDataJson');
                return localData ? JSON.parse(localData) : { agents: [], lastUpdated: new Date().toISOString() };
            }

            const response = await fetch(`https://api.github.com/repos/${this.config.repoOwner}/${this.config.repoName}/contents/data.json?ref=${this.config.branchName}`, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return { agents: [], lastUpdated: new Date().toISOString() };
                }
                throw new Error(`Failed to fetch data.json: ${response.status}`);
            }

            const data = await response.json();
            const content = JSON.parse(atob(data.content));
            
            // Cache to localStorage
            localStorage.setItem('ezeeDataJson', JSON.stringify(content));
            
            return content;
        } catch (error) {
            console.error('Error fetching data.json:', error);
            
            // Fallback to localStorage
            const localData = localStorage.getItem('ezeeDataJson');
            return localData ? JSON.parse(localData) : { agents: [], lastUpdated: new Date().toISOString() };
        }
    }

    /**
     * Fetch agents.json from GitHub
     */
    async fetchAgentsJson() {
        try {
            if (!this.config.token) {
                // Fallback to localStorage
                const localAgents = localStorage.getItem('ezeeAgentsJson');
                return localAgents ? JSON.parse(localAgents) : { agents: [], lastUpdated: new Date().toISOString() };
            }

            const response = await fetch(`https://api.github.com/repos/${this.config.repoOwner}/${this.config.repoName}/contents/agents.json?ref=${this.config.branchName}`, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return { agents: [], lastUpdated: new Date().toISOString() };
                }
                throw new Error(`Failed to fetch agents.json: ${response.status}`);
            }

            const data = await response.json();
            const content = JSON.parse(atob(data.content));
            
            // Cache to localStorage
            localStorage.setItem('ezeeAgentsJson', JSON.stringify(content));
            
            return content;
        } catch (error) {
            console.error('Error fetching agents.json:', error);
            
            // Fallback to localStorage
            const localAgents = localStorage.getItem('ezeeAgentsJson');
            return localAgents ? JSON.parse(localAgents) : { agents: [], lastUpdated: new Date().toISOString() };
        }
    }

    /**
     * Update admin dashboard with real-time data
     */
    async updateDashboard() {
        try {
            console.log('Updating dashboard with real-time data...');

            // Fetch latest data
            const dataJson = await this.fetchDataJson();
            const agentsJson = await this.fetchAgentsJson();

            // Update stats
            this.updateStats(dataJson, agentsJson);
            
            // Update submissions table
            this.updateSubmissionsTable(dataJson);
            
            // Update agents list
            this.updateAgentsList(agentsJson);

            // Show last updated time
            const lastUpdated = new Date().toLocaleTimeString();
            document.getElementById('realTimeStatus').innerHTML = `
                <span style="color: #10b981;">● Live</span> 
                <span style="color: #6b7280; font-size: 12px;">Updated: ${lastUpdated}</span>
            `;

            return { success: true };
        } catch (error) {
            console.error('Error updating dashboard:', error);
            document.getElementById('realTimeStatus').innerHTML = `
                <span style="color: #ef4444;">● Offline</span>
                <span style="color: #6b7280; font-size: 12px;">${error.message}</span>
            `;
            return { success: false, error: error.message };
        }
    }

    /**
     * Update statistics cards
     */
    updateStats(dataJson, agentsJson) {
        const submissions = dataJson.agents || [];
        const agents = agentsJson.agents || [];

        // Total agents (field agents from agents.json)
        document.getElementById('totalAgents').textContent = agents.length;

        // Total submissions (from data.json)
        document.getElementById('totalSubmissions').textContent = submissions.length;

        // Today's submissions
        const today = new Date().toDateString();
        const todaySubmissions = submissions.filter(s => 
            new Date(s.submissionDate).toDateString() === today
        ).length;
        document.getElementById('todaySubmissions').textContent = todaySubmissions;

        // Active agents (from agents.json)
        const activeAgents = agents.filter(a => a.status === 'active').length;
        document.getElementById('activeAgents').textContent = activeAgents;

        // Recent activity
        this.updateRecentActivity(submissions);
    }

    /**
     * Update recent activity
     */
    updateRecentActivity(submissions) {
        const recentActivity = document.getElementById('recentActivity');
        
        if (!submissions || submissions.length === 0) {
            recentActivity.innerHTML = '<p style="color: #6b7280; text-align: center;">No recent activity</p>';
            return;
        }

        // Get last 5 submissions
        const recent = submissions.slice(-5).reverse();
        
        recentActivity.innerHTML = recent.map(sub => `
            <div style="padding: 10px; border-bottom: 1px solid #e5e7eb;">
                <div style="display: flex; justify-content: space-between;">
                    <div>
                        <strong>${sub.fullName || 'Unknown'}</strong>
                        <span style="color: #6b7280; font-size: 12px; margin-left: 10px;">
                            SC: ${sub.agentInfo?.scCode || 'N/A'}
                        </span>
                    </div>
                    <span style="color: #6b7280; font-size: 12px;">
                        ${new Date(sub.submissionDate).toLocaleString()}
                    </span>
                </div>
                <div style="margin-top: 5px;">
                    <span class="status-badge status-${sub.status || 'pending'}">
                        ${sub.status || 'pending'}
                    </span>
                </div>
            </div>
        `).join('');
    }

    /**
     * Update submissions table
     */
    updateSubmissionsTable(dataJson) {
        const tbody = document.querySelector('#submissionsTable tbody');
        const submissions = dataJson.agents || [];

        if (submissions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6b7280;">No submissions found</td></tr>';
            return;
        }

        tbody.innerHTML = submissions.map(sub => `
            <tr>
                <td>${sub.agentInfo?.scCode || sub.scCode || 'N/A'}</td>
                <td>${sub.fullName || sub.agentName || 'N/A'}</td>
                <td>${new Date(sub.submissionDate).toLocaleDateString()}</td>
                <td>
                    <span class="status-badge status-${sub.status || 'pending'}">
                        ${sub.status || 'pending'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="viewSubmissionDetails('${sub.id}')">
                        View
                    </button>
                </td>
            </tr>
        `).join('');

        // Store submissions globally for view function
        window.submissions = submissions;
    }

    /**
     * Update agents list
     */
    updateAgentsList(agentsJson) {
        const agentList = document.getElementById('agentList');
        const agents = agentsJson.agents || [];

        if (agents.length === 0) {
            agentList.innerHTML = '<p style="color: #6b7280; text-align: center;">No field agents configured</p>';
            return;
        }

        agentList.innerHTML = agents.map(agent => `
            <div class="agent-item">
                <div class="agent-info">
                    <div class="agent-name">${agent.fullName}</div>
                    <div class="agent-details">
                        SC Code: ${agent.scCode} | Status: ${agent.status || 'active'}
                    </div>
                </div>
                <div class="agent-actions">
                    <button class="btn btn-sm btn-warning" onclick="editAgent('${agent.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteAgent('${agent.id}')">Delete</button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Start real-time polling
     */
    startPolling() {
        if (this.isPolling) {
            return;
        }

        this.isPolling = true;
        console.log('Starting real-time polling (every 5 seconds)...');

        // Initial update
        this.updateDashboard();

        // Start polling
        this.pollingTimer = setInterval(() => {
            this.updateDashboard();
        }, this.pollingInterval);
    }

    /**
     * Stop real-time polling
     */
    stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
        this.isPolling = false;
        console.log('Stopped real-time polling');
    }

    /**
     * Initialize the service
     */
    async init() {
        if (this.initialized) {
            return;
        }

        // Load config
        await this.loadConfig();

        // Start polling if on dashboard
        if (window.location.pathname.includes('dashboard.html')) {
            this.startPolling();
        }

        this.initialized = true;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    window.integrationService = new IntegrationService();
    await window.integrationService.init();

    // Override GitHub config form submission
    const githubForm = document.getElementById('githubConfigForm');
    if (githubForm) {
        githubForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const repoOwner = document.getElementById('repoOwner').value;
            const repoName = document.getElementById('repoName').value;
            const branchName = document.getElementById('branchName').value;
            const token = document.getElementById('githubToken').value;

            const config = {
                repoOwner,
                repoName,
                branchName,
                token,
                galleryUploadEnabled: document.getElementById('galleryUploadEnabled')?.checked || true
            };

            const result = await window.integrationService.saveConfig(config);
            
            if (result.success) {
                showAlert('GitHub configuration saved successfully!', 'success');
            } else {
                showAlert('Error saving configuration: ' + result.error, 'error');
            }
        });
    }

    // Add gallery toggle to settings
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        const galleryToggle = document.createElement('div');
        galleryToggle.className = 'form-group';
        galleryToggle.innerHTML = `
            <label for="galleryUploadEnabled">Field Agent Upload Options</label>
            <div style="display: flex; align-items: center; gap: 20px; margin-top: 10px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="radio" name="uploadMode" value="camera" id="uploadModeCamera">
                    <span>📸 Camera Only</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="radio" name="uploadMode" value="both" id="uploadModeBoth" checked>
                    <span>📱 Camera + Gallery</span>
                </label>
            </div>
            <small style="color: #6b7280; display: block; margin-top: 5px;">
                Choose whether field agents can upload from gallery or only take photos with camera
            </small>
        `;
        
        settingsForm.insertBefore(galleryToggle, settingsForm.querySelector('button'));
        
        // Load current setting
        const config = window.integrationService.config;
        document.getElementById('uploadModeCamera').checked = config.galleryUploadEnabled === false;
        document.getElementById('uploadModeBoth').checked = config.galleryUploadEnabled !== false;
    }
});

// Helper function to view submission details
window.viewSubmissionDetails = function(submissionId) {
    const submission = window.submissions?.find(s => s.id === submissionId);
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
            <button onclick="this.parentElement.parentElement.remove()" style="float: right; background: #ef4444; color: white; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer;">×</button>
            
            <h2 style="color: #1e3c72; margin-bottom: 20px;">Submission Details</h2>
            
            <div style="margin-bottom: 20px;">
                <h3 style="color: #2a5298; margin-bottom: 10px;">Images</h3>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                    ${submission.idFrontUrl ? `
                        <div>
                            <p><strong>ID Front:</strong></p>
                            <img src="${submission.idFrontUrl}" style="max-width: 100%; max-height: 150px; border-radius: 8px;">
                        </div>
                    ` : ''}
                    ${submission.idBackUrl ? `
                        <div>
                            <p><strong>ID Back:</strong></p>
                            <img src="${submission.idBackUrl}" style="max-width: 100%; max-height: 150px; border-radius: 8px;">
                        </div>
                    ` : ''}
                    ${submission.agentPhotoUrl ? `
                        <div>
                            <p><strong>Agent Photo:</strong></p>
                            <img src="${submission.agentPhotoUrl}" style="max-width: 100%; max-height: 150px; border-radius: 8px;">
                        </div>
                    ` : ''}
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div>
                    <h3 style="color: #2a5298; margin-bottom: 10px;">Client Information</h3>
                    <p><strong>Name:</strong> ${submission.fullName || 'N/A'}</p>
                    <p><strong>Personal Number:</strong> ${submission.personalNumber || 'N/A'}</p>
                    <p><strong>Email:</strong> ${submission.email || 'N/A'}</p>
                    <p><strong>National ID:</strong> ${submission.nationalId || 'N/A'}</p>
                    <p><strong>DOB:</strong> ${submission.dob || 'N/A'}</p>
                </div>
                <div>
                    <h3 style="color: #2a5298; margin-bottom: 10px;">Agent Information</h3>
                    <p><strong>Agent:</strong> ${submission.agentInfo?.fullName || 'N/A'}</p>
                    <p><strong>SC Code:</strong> ${submission.agentInfo?.scCode || 'N/A'}</p>
                    <p><strong>Submitted:</strong> ${new Date(submission.submissionDate).toLocaleString()}</p>
                    <p><strong>Status:</strong> ${submission.status || 'pending'}</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
};

// Override saveAgents function
window.saveAgents = async function() {
    try {
        const agents = window.config?.agents || [];
        
        // Save to GitHub
        if (window.integrationService?.config?.token) {
            const content = btoa(JSON.stringify({ agents, lastUpdated: new Date().toISOString() }, null, 2));
            
            // Get current file SHA
            let sha = null;
            try {
                const checkResponse = await fetch(`https://api.github.com/repos/${window.integrationService.config.repoOwner}/${window.integrationService.config.repoName}/contents/agents.json`, {
                    headers: {
                        'Authorization': `token ${window.integrationService.config.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                if (checkResponse.ok) {
                    const fileData = await checkResponse.json();
                    sha = fileData.sha;
                }
            } catch (e) {}

            // Save file
            await fetch(`https://api.github.com/repos/${window.integrationService.config.repoOwner}/${window.integrationService.config.repoName}/contents/agents.json`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${window.integrationService.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Update agents list',
                    content: content,
                    sha: sha,
                    branch: window.integrationService.config.branchName
                })
            });
            
            console.log('Agents saved to GitHub');
        }
        
        // Also save to localStorage
        localStorage.setItem('ezeeAgents', JSON.stringify(agents));
        localStorage.setItem('ezeeAgentsJson', JSON.stringify({ agents, lastUpdated: new Date().toISOString() }));
        
        showAlert('Agents saved successfully!', 'success');
    } catch (error) {
        console.error('Error saving agents:', error);
        showAlert('Error saving agents: ' + error.message, 'error');
    }
};