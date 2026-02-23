/**
 * integration.js - Ezee Money System Integration Layer
 * This file enhances and fixes the existing functionality
 * Add this script to both dashboard.html and submit.html AFTER the existing scripts
 */

(function() {
    // ==================== CONFIGURATION ====================
    const CONFIG = {
        POLLING_INTERVAL: 5000, // 5 seconds
        GITHUB_API: 'https://api.github.com/repos',
        REPO_OWNER: 'BarasaGodwilTech',
        REPO_NAME: 'Ezee-money',
        BRANCH: 'main',
        FILES: {
            DATA: 'data.json',
            AGENTS: 'agents.json',
            GITCONFIG: 'gitconfig.json'
        },
        PATHS: {
            IMAGES: 'images/'
        }
    };

    // ==================== GLOBAL STATE ====================
    window.EzeeIntegration = window.EzeeIntegration || {
        initialized: false,
        pollingInterval: null,
        galleryUploadEnabled: true, // Default
        pendingSubmissions: [],
        currentAgent: null
    };

    // ==================== UTILITY FUNCTIONS ====================
    const Utils = {
        /**
         * Show/hide loading indicator
         */
        showLoading: (message = 'Loading...') => {
            let loader = document.getElementById('ezee-loader');
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'ezee-loader';
                loader.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                `;
                loader.innerHTML = `
                    <div style="background: white; padding: 20px; border-radius: 10px; text-align: center;">
                        <div class="loading" style="margin: 10px auto;"></div>
                        <div id="loader-message">${message}</div>
                    </div>
                `;
                document.body.appendChild(loader);
            } else {
                document.getElementById('loader-message').textContent = message;
                loader.style.display = 'flex';
            }
        },

        hideLoading: () => {
            const loader = document.getElementById('ezee-loader');
            if (loader) loader.style.display = 'none';
        },

        /**
         * Show toast notification
         */
        showToast: (message, type = 'info') => {
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#2196F3'};
                color: white;
                border-radius: 5px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                z-index: 10000;
                animation: slideIn 0.3s ease;
            `;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        },

        /**
         * Generate unique ID
         */
        generateId: () => `AGENT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,

        /**
         * Get file extension from filename or data URL
         */
        getFileExtension: (filename) => {
            if (filename.includes('.')) {
                return filename.split('.').pop().split('?')[0].toLowerCase();
            }
            return 'jpg'; // Default
        },

        /**
         * Convert data URL to blob
         */
        dataURLtoBlob: (dataURL) => {
            const arr = dataURL.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new Blob([u8arr], { type: mime });
        }
    };

    // ==================== GITHUB API SERVICE ====================
    const GitHubAPI = {
        token: null,

        /**
         * Initialize with token from gitconfig
         */
        init: async () => {
            try {
                const config = await GitHubAPI.getGitConfig();
                if (config && config.token) {
                    GitHubAPI.token = config.token;
                    window.EzeeIntegration.galleryUploadEnabled = config.galleryUploadEnabled !== false;
                    return true;
                }
                return false;
            } catch (error) {
                console.error('Failed to initialize GitHub API:', error);
                return false;
            }
        },

        /**
         * Get file content from GitHub
         */
        getFile: async (filePath) => {
            try {
                const response = await fetch(
                    `${CONFIG.GITHUB_API}/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents/${filePath}`,
                    {
                        headers: GitHubAPI.token ? {
                            'Authorization': `token ${GitHubAPI.token}`,
                            'Accept': 'application/vnd.github.v3+json'
                        } : {}
                    }
                );

                if (response.status === 404) return null;
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                if (data.content) {
                    const content = atob(data.content.replace(/\n/g, ''));
                    return {
                        content: JSON.parse(content),
                        sha: data.sha
                    };
                }
                return null;
            } catch (error) {
                console.error(`Error fetching ${filePath}:`, error);
                return null;
            }
        },

        /**
         * Save file to GitHub
         */
        saveFile: async (filePath, content, message = 'Update from Ezee Money') => {
            if (!GitHubAPI.token) throw new Error('GitHub token not configured');

            try {
                // Get existing file SHA if it exists
                let sha = null;
                const existing = await GitHubAPI.getFile(filePath);
                if (existing) sha = existing.sha;

                const jsonContent = JSON.stringify(content, null, 2);
                const base64Content = btoa(unescape(encodeURIComponent(jsonContent)));

                const response = await fetch(
                    `${CONFIG.GITHUB_API}/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents/${filePath}`,
                    {
                        method: 'PUT',
                        headers: {
                            'Authorization': `token ${GitHubAPI.token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            message: message,
                            content: base64Content,
                            sha: sha,
                            branch: CONFIG.BRANCH
                        })
                    }
                );

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || 'Failed to save file');
                }

                return await response.json();
            } catch (error) {
                console.error('Error saving file:', error);
                throw error;
            }
        },

        /**
         * Upload image to GitHub
         */
        uploadImage: async (imageData, filename) => {
            if (!GitHubAPI.token) throw new Error('GitHub token not configured');

            try {
                const filePath = `${CONFIG.PATHS.IMAGES}${filename}`;
                
                // Convert data URL to base64
                const base64Data = imageData.split(',')[1];

                // Check if file exists
                let sha = null;
                const existing = await fetch(
                    `${CONFIG.GITHUB_API}/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents/${filePath}`,
                    {
                        headers: {
                            'Authorization': `token ${GitHubAPI.token}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    }
                );

                if (existing.ok) {
                    const data = await existing.json();
                    sha = data.sha;
                }

                const response = await fetch(
                    `${CONFIG.GITHUB_API}/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}/contents/${filePath}`,
                    {
                        method: 'PUT',
                        headers: {
                            'Authorization': `token ${GitHubAPI.token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            message: `Upload image: ${filename}`,
                            content: base64Data,
                            sha: sha,
                            branch: CONFIG.BRANCH
                        })
                    }
                );

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.message || 'Failed to upload image');
                }

                const result = await response.json();
                return result.content.download_url;
            } catch (error) {
                console.error('Error uploading image:', error);
                throw error;
            }
        },

        /**
         * Get gitconfig.json
         */
        getGitConfig: async () => {
            const result = await GitHubAPI.getFile(CONFIG.FILES.GITCONFIG);
            return result ? result.content : null;
        },

        /**
         * Save gitconfig.json
         */
        saveGitConfig: async (config) => {
            return await GitHubAPI.saveFile(
                CONFIG.FILES.GITCONFIG,
                config,
                'Update GitHub configuration'
            );
        },

        /**
         * Get data.json (submissions)
         */
        getData: async () => {
            const result = await GitHubAPI.getFile(CONFIG.FILES.DATA);
            return result ? result.content : { agents: [], lastUpdated: new Date().toISOString() };
        },

        /**
         * Save data.json
         */
        saveData: async (data) => {
            return await GitHubAPI.saveFile(
                CONFIG.FILES.DATA,
                data,
                'Update agent submissions'
            );
        },

        /**
         * Get agents.json (field agent credentials)
         */
        getAgents: async () => {
            const result = await GitHubAPI.getFile(CONFIG.FILES.AGENTS);
            return result ? result.content : { agents: [], lastUpdated: new Date().toISOString() };
        },

        /**
         * Save agents.json
         */
        saveAgents: async (agents) => {
            return await GitHubAPI.saveFile(
                CONFIG.FILES.AGENTS,
                agents,
                'Update field agents'
            );
        }
    };

    // ==================== ADMIN DASHBOARD ENHANCEMENTS ====================
    const AdminEnhancements = {
        /**
         * Initialize admin dashboard enhancements
         */
        init: () => {
            if (!document.querySelector('.dashboard-container')) return false;

            console.log('Initializing admin dashboard enhancements...');
            
            // Add gallery toggle to settings
            AdminEnhancements.addGalleryToggle();
            
            // Override config form submission
            AdminEnhancements.overrideConfigForm();
            
            // Start real-time polling
            AdminEnhancements.startPolling();
            
            // Override loadAgents and loadSubmissions functions
            AdminEnhancements.overrideDataLoaders();
            
            return true;
        },

        /**
         * Add gallery upload toggle to settings section
         */
        addGalleryToggle: () => {
            const settingsSection = document.getElementById('settings');
            if (!settingsSection) return;

            // Check if toggle already exists
            if (document.getElementById('galleryUploadToggle')) return;

            const toggleCard = document.createElement('div');
            toggleCard.className = 'card';
            toggleCard.innerHTML = `
                <div class="card-header">
                    <h2 class="card-title">Gallery Upload Settings</h2>
                </div>
                <div class="form-group" style="padding: 20px;">
                    <label style="display: flex; align-items: center; gap: 10px;">
                        <input type="checkbox" id="galleryUploadToggle" ${window.EzeeIntegration.galleryUploadEnabled ? 'checked' : ''}>
                        <span>Enable Gallery Upload for Field Agents</span>
                    </label>
                    <small style="color: #666; display: block; margin-top: 5px;">
                        When enabled, agents can upload photos from their gallery. When disabled, only camera capture is allowed.
                    </small>
                    <button class="btn btn-primary" id="saveGalleryToggle" style="margin-top: 15px;">
                        Save Gallery Setting
                    </button>
                </div>
            `;

            // Insert after first card in settings
            const firstCard = settingsSection.querySelector('.card');
            if (firstCard) {
                firstCard.parentNode.insertBefore(toggleCard, firstCard.nextSibling);
            } else {
                settingsSection.appendChild(toggleCard);
            }

            // Add event listener
            document.getElementById('saveGalleryToggle').addEventListener('click', async () => {
                const enabled = document.getElementById('galleryUploadToggle').checked;
                await AdminEnhancements.saveGallerySetting(enabled);
            });
        },

        /**
         * Save gallery setting to gitconfig.json
         */
        saveGallerySetting: async (enabled) => {
            try {
                Utils.showLoading('Saving gallery setting...');
                
                const config = await GitHubAPI.getGitConfig() || {
                    repoOwner: CONFIG.REPO_OWNER,
                    repoName: CONFIG.REPO_NAME,
                    branchName: CONFIG.BRANCH,
                    token: GitHubAPI.token,
                    galleryUploadEnabled: true
                };
                
                config.galleryUploadEnabled = enabled;
                await GitHubAPI.saveGitConfig(config);
                
                window.EzeeIntegration.galleryUploadEnabled = enabled;
                Utils.showToast('Gallery setting saved successfully!', 'success');
            } catch (error) {
                console.error('Error saving gallery setting:', error);
                Utils.showToast('Failed to save gallery setting: ' + error.message, 'error');
            } finally {
                Utils.hideLoading();
            }
        },

        /**
         * Override GitHub config form submission
         */
        overrideConfigForm: () => {
            const form = document.getElementById('githubConfigForm');
            if (!form) return;

            const originalSubmit = form.onsubmit;
            form.onsubmit = async (e) => {
                e.preventDefault();

                const repoOwner = document.getElementById('repoOwner').value;
                const repoName = document.getElementById('repoName').value;
                const branchName = document.getElementById('branchName').value;
                const token = document.getElementById('githubToken').value;

                if (!repoOwner || !repoName || !token) {
                    Utils.showToast('Please fill in all required fields', 'error');
                    return;
                }

                try {
                    Utils.showLoading('Saving GitHub configuration...');

                    // Save to gitconfig.json
                    const config = {
                        repoOwner,
                        repoName,
                        branchName,
                        token,
                        galleryUploadEnabled: window.EzeeIntegration.galleryUploadEnabled,
                        lastUpdated: new Date().toISOString()
                    };

                    await GitHubAPI.saveGitConfig(config);
                    
                    // Update local storage as backup
                    const adminConfig = JSON.parse(localStorage.getItem('ezeeAdminConfig') || '{}');
                    adminConfig.github = config;
                    localStorage.setItem('ezeeAdminConfig', JSON.stringify(adminConfig));

                    // Update token in GitHubAPI
                    GitHubAPI.token = token;

                    Utils.showToast('GitHub configuration saved successfully!', 'success');
                    
                    // Update config status
                    document.getElementById('configStatus').innerHTML = '<span style="color: #28a745;">✅ Configured</span>';
                } catch (error) {
                    console.error('Error saving config:', error);
                    Utils.showToast('Failed to save configuration: ' + error.message, 'error');
                } finally {
                    Utils.hideLoading();
                }
            };
        },

        /**
         * Override data loading functions
         */
        overrideDataLoaders: () => {
            // Override loadAgents
            if (typeof window.loadAgents === 'function') {
                const originalLoadAgents = window.loadAgents;
                window.loadAgents = async function() {
                    try {
                        console.log('Loading agents from GitHub...');
                        const data = await GitHubAPI.getAgents();
                        
                        if (data && data.agents) {
                            config.agents = data.agents;
                            renderAgents();
                            updateStats();
                            Utils.showToast(`Loaded ${data.agents.length} agents from GitHub`, 'success');
                        } else {
                            // Fallback to original
                            await originalLoadAgents();
                        }
                    } catch (error) {
                        console.error('Error loading agents from GitHub:', error);
                        await originalLoadAgents();
                    }
                };
            }

            // Override loadSubmissions
            if (typeof window.loadSubmissions === 'function') {
                const originalLoadSubmissions = window.loadSubmissions;
                window.loadSubmissions = async function() {
                    try {
                        console.log('Loading submissions from GitHub...');
                        const data = await GitHubAPI.getData();
                        
                        if (data && data.agents) {
                            config.submissions = data.agents;
                            renderSubmissions();
                            updateStats();
                        } else {
                            // Fallback to original
                            await originalLoadSubmissions();
                        }
                    } catch (error) {
                        console.error('Error loading submissions from GitHub:', error);
                        await originalLoadSubmissions();
                    }
                };
            }

            // Override saveAgents
            if (typeof window.saveAgents === 'function') {
                const originalSaveAgents = window.saveAgents;
                window.saveAgents = async function() {
                    try {
                        if (GitHubAPI.token) {
                            const data = {
                                agents: config.agents,
                                lastUpdated: new Date().toISOString(),
                                totalAgents: config.agents.length
                            };
                            await GitHubAPI.saveAgents(data);
                            Utils.showToast('Agents saved to GitHub', 'success');
                        } else {
                            await originalSaveAgents();
                        }
                    } catch (error) {
                        console.error('Error saving agents to GitHub:', error);
                        await originalSaveAgents();
                    }
                };
            }
        },

        /**
         * Start real-time polling
         */
        startPolling: () => {
            if (window.EzeeIntegration.pollingInterval) {
                clearInterval(window.EzeeIntegration.pollingInterval);
            }

            window.EzeeIntegration.pollingInterval = setInterval(async () => {
                try {
                    if (!GitHubAPI.token) return;

                    // Check for new submissions
                    const data = await GitHubAPI.getData();
                    if (data && data.agents) {
                        // Update if there are new submissions
                        const currentCount = config.submissions?.length || 0;
                        const newCount = data.agents.length;
                        
                        if (newCount > currentCount) {
                            config.submissions = data.agents;
                            renderSubmissions();
                            updateStats();
                            
                            // Show notification
                            const newSubmissions = newCount - currentCount;
                            Utils.showToast(`${newSubmissions} new submission${newSubmissions > 1 ? 's' : ''} received!`, 'success');
                            
                            // Update real-time status
                            const statusEl = document.getElementById('realTimeStatus');
                            if (statusEl) {
                                statusEl.innerHTML = `<span style="color: #28a745;">● Live - Updated ${new Date().toLocaleTimeString()}</span>`;
                            }
                        }
                    }
                } catch (error) {
                    console.error('Polling error:', error);
                }
            }, CONFIG.POLLING_INTERVAL);
        }
    };

    // ==================== FIELD AGENT FORM ENHANCEMENTS ====================
    const AgentFormEnhancements = {
        /**
         * Initialize field agent form enhancements
         */
        init: () => {
            if (!document.querySelector('.photo-upload-area')) return false;

            console.log('Initializing field agent form enhancements...');
            
            // Enhance photo upload areas
            AgentFormEnhancements.enhancePhotoUploads();
            
            // Override form submission
            AgentFormEnhancements.overrideSubmission();
            
            return true;
        },

        /**
         * Enhance photo upload areas to show images inside the box
         */
        enhancePhotoUploads: () => {
            const uploadAreas = document.querySelectorAll('.photo-upload-area');
            
            uploadAreas.forEach(area => {
                const input = area.querySelector('input[type="file"]');
                if (!input) return;

                // Store original click handler
                const originalClick = area.onclick;
                
                // Enhance click handler
                area.onclick = (e) => {
                    if (e.target.classList.contains('remove-photo')) return;
                    
                    // Check gallery setting
                    if (!window.EzeeIntegration.galleryUploadEnabled) {
                        // Force camera only
                        input.setAttribute('capture', 'environment');
                        input.removeAttribute('accept');
                    } else {
                        input.removeAttribute('capture');
                        input.setAttribute('accept', 'image/*');
                    }
                    
                    input.click();
                };

                // Enhance change handler
                const originalChange = input.onchange;
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            // Set image as background of upload area
                            area.style.backgroundImage = `url('${e.target.result}')`;
                            area.style.backgroundSize = 'cover';
                            area.style.backgroundPosition = 'center';
                            
                            // Add checkmark overlay
                            let checkmark = area.querySelector('.upload-checkmark');
                            if (!checkmark) {
                                checkmark = document.createElement('div');
                                checkmark.className = 'upload-checkmark';
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
                                    font-size: 20px;
                                    font-weight: bold;
                                    z-index: 10;
                                `;
                                area.style.position = 'relative';
                                area.appendChild(checkmark);
                            }

                            // Add remove button
                            let removeBtn = area.querySelector('.remove-photo-btn');
                            if (!removeBtn) {
                                removeBtn = document.createElement('div');
                                removeBtn.className = 'remove-photo-btn';
                                removeBtn.innerHTML = '✕';
                                removeBtn.style.cssText = `
                                    position: absolute;
                                    bottom: 10px;
                                    right: 10px;
                                    width: 30px;
                                    height: 30px;
                                    background: #dc3545;
                                    color: white;
                                    border-radius: 50%;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    font-size: 16px;
                                    font-weight: bold;
                                    cursor: pointer;
                                    z-index: 11;
                                `;
                                removeBtn.onclick = (e) => {
                                    e.stopPropagation();
                                    area.style.backgroundImage = 'none';
                                    checkmark.remove();
                                    removeBtn.remove();
                                    input.value = '';
                                    formData[input.id.replace('Input', '')] = null;
                                };
                                area.appendChild(removeBtn);
                            }

                            // Update formData
                            const key = input.id.replace('Input', '');
                            formData[key] = file;
                        };
                        reader.readAsDataURL(file);
                    }
                    
                    if (originalChange) originalChange.call(this, e);
                };
            });
        },

        /**
         * Override form submission to use GitHub
         */
        overrideSubmission: () => {
            const submitBtn = document.getElementById('submitBtn');
            if (!submitBtn) return;

            const originalClick = submitBtn.onclick;
            submitBtn.onclick = async (e) => {
                e.preventDefault();

                try {
                    // Validate form
                    if (!AgentFormEnhancements.validateForm()) return;

                    Utils.showLoading('Submitting to GitHub...');
                    
                    // Get agent info
                    const agentInfo = JSON.parse(localStorage.getItem('agentInfo') || '{}');
                    
                    // Collect form data
                    const submissionData = {
                        fullName: document.getElementById('fullName')?.value || '',
                        personalNumber: document.getElementById('personalNumber')?.value || '',
                        email: document.getElementById('email')?.value || '',
                        nationalId: document.getElementById('nationalId')?.value || '',
                        dob: document.getElementById('dob')?.value || '',
                        gender: document.getElementById('gender')?.value || '',
                        businessAddress: document.getElementById('businessAddress')?.value || '',
                        residentialAddress: document.getElementById('residentialAddress')?.value || '',
                        nextOfKinName: document.getElementById('nextOfKinName')?.value || '',
                        nextOfKinRelationship: document.getElementById('nextOfKinRelationship')?.value || '',
                        nextOfKinPhone: document.getElementById('nextOfKinPhone')?.value || ''
                    };

                    // Generate submission ID
                    const submissionId = Utils.generateId();
                    
                    // Upload images and get URLs
                    const imageUrls = {};
                    const timestamp = Date.now();

                    if (formData.idFront) {
                        const filename = `${submissionId}_idFront_${timestamp}.jpg`;
                        const file = formData.idFront;
                        
                        // Convert file to data URL
                        const dataUrl = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result);
                            reader.readAsDataURL(file);
                        });
                        
                        imageUrls.idFront = await GitHubAPI.uploadImage(dataUrl, filename);
                    }

                    if (formData.idBack) {
                        const filename = `${submissionId}_idBack_${timestamp}.jpg`;
                        const file = formData.idBack;
                        
                        const dataUrl = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result);
                            reader.readAsDataURL(file);
                        });
                        
                        imageUrls.idBack = await GitHubAPI.uploadImage(dataUrl, filename);
                    }

                    if (formData.agentPhoto) {
                        const filename = `${submissionId}_agentPhoto_${timestamp}.jpg`;
                        const file = formData.agentPhoto;
                        
                        const dataUrl = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result);
                            reader.readAsDataURL(file);
                        });
                        
                        imageUrls.agentPhoto = await GitHubAPI.uploadImage(dataUrl, filename);
                    }

                    // Create submission object
                    const submission = {
                        id: submissionId,
                        ...submissionData,
                        agentInfo: {
                            scCode: agentInfo.scCode,
                            fullName: agentInfo.fullName
                        },
                        submissionDate: new Date().toISOString(),
                        status: 'pending',
                        emailVerified: false,
                        adminVerified: false,
                        idFrontUrl: imageUrls.idFront || '',
                        idBackUrl: imageUrls.idBack || '',
                        agentPhotoUrl: imageUrls.agentPhoto || ''
                    };

                    // Save to data.json
                    const data = await GitHubAPI.getData();
                    const agents = data.agents || [];
                    agents.push(submission);
                    
                    await GitHubAPI.saveData({
                        agents: agents,
                        lastUpdated: new Date().toISOString()
                    });

                    Utils.hideLoading();
                    
                    // Show success message
                    document.querySelector('.form-container').classList.add('hidden');
                    document.getElementById('successMessage').classList.remove('hidden');
                    document.getElementById('submissionId').textContent = submissionId;

                } catch (error) {
                    console.error('Submission error:', error);
                    Utils.hideLoading();
                    Utils.showToast('Submission failed: ' + error.message, 'error');
                }
            };
        },

        /**
         * Validate form
         */
        validateForm: () => {
            const required = [
                'fullName', 'personalNumber', 'email', 'nationalId',
                'dob', 'gender', 'businessAddress', 'residentialAddress',
                'nextOfKinName', 'nextOfKinRelationship', 'nextOfKinPhone'
            ];

            for (const field of required) {
                const element = document.getElementById(field);
                if (!element || !element.value.trim()) {
                    Utils.showToast(`Please fill in ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`, 'error');
                    element?.focus();
                    return false;
                }
            }

            // Check photos
            if (!formData.idFront || !formData.idBack || !formData.agentPhoto) {
                Utils.showToast('Please upload all required photos', 'error');
                return false;
            }

            // Validate email
            const email = document.getElementById('email')?.value.trim();
            if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                Utils.showToast('Please enter a valid email address', 'error');
                document.getElementById('email')?.focus();
                return false;
            }

            return true;
        }
    };

    // ==================== INITIALIZATION ====================
    /**
     * Main initialization function
     */
    const init = async () => {
        if (window.EzeeIntegration.initialized) return;
        
        console.log('Initializing Ezee Money Integration...');
        
        // Initialize GitHub API
        await GitHubAPI.init();
        
        // Initialize based on current page
        if (AdminEnhancements.init()) {
            console.log('Admin dashboard enhancements applied');
        }
        
        if (AgentFormEnhancements.init()) {
            console.log('Field agent form enhancements applied');
        }
        
        window.EzeeIntegration.initialized = true;
        console.log('Ezee Money Integration initialized successfully');
    };

    // Run initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ==================== EXPOSE PUBLIC API ====================
    window.EzeeIntegration.API = GitHubAPI;
    window.EzeeIntegration.Utils = Utils;

})();
