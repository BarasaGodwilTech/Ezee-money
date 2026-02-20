/**
 * Real-Time Service for Ezee Money System
 * Handles real-time data synchronization between field agents and admin
 * Uses GitHub as the backend database
 */

class RealTimeService {
    constructor() {
        this.baseURL = 'https://api.github.com';
        this.repoOwner = 'BarasaGodwilTech';
        this.repoName = 'Ezee-money';
        this.branch = 'main';
        this.pollingInterval = 5000; // 5 seconds
        this.lastKnownHash = null;
        this.isPolling = false;
        this.subscribers = [];
    }

    /**
     * Initialize the service with GitHub configuration
     */
    async init(githubConfig) {
        if (githubConfig) {
            this.repoOwner = githubConfig.repoOwner || this.repoOwner;
            this.repoName = githubConfig.repoName || this.repoName;
            this.branch = githubConfig.branchName || this.branch;
        }
        
        // Load GitHub token from admin config
        const adminConfig = JSON.parse(localStorage.getItem('ezeeAdminConfig') || '{}');
        this.token = adminConfig.github?.token;
        
        if (!this.token) {
            console.warn('No GitHub token found. Real-time features will be limited.');
            return false;
        }
        
        return true;
    }

    /**
     * Subscribe to real-time updates
     */
    subscribe(callback) {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter(sub => sub !== callback);
        };
    }

    /**
     * Notify all subscribers of changes
     */
    notifySubscribers(data, type) {
        this.subscribers.forEach(callback => {
            try {
                callback(data, type);
            } catch (error) {
                console.error('Subscriber callback error:', error);
            }
        });
    }

    /**
     * Get the current SHA of the main branch
     */
    async getBranchSHA() {
        try {
            const response = await fetch(`${this.baseURL}/repos/${this.repoOwner}/${this.repoName}/git/refs/heads/${this.branch}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get branch SHA: ${response.status}`);
            }

            const data = await response.json();
            return data.object.sha;
        } catch (error) {
            console.error('Error getting branch SHA:', error);
            return null;
        }
    }

    /**
     * Check if repository has changed
     */
    async hasRepositoryChanged() {
        try {
            const currentSHA = await this.getBranchSHA();
            
            if (!currentSHA) {
                return false;
            }

            if (this.lastKnownHash && currentSHA !== this.lastKnownHash) {
                this.lastKnownHash = currentSHA;
                return true;
            }

            this.lastKnownHash = currentSHA;
            return false;
        } catch (error) {
            console.error('Error checking repository changes:', error);
            return false;
        }
    }

    /**
     * Get file content from GitHub
     */
    async getFile(filePath) {
        try {
            const response = await fetch(`${this.baseURL}/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}?ref=${this.branch}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null; // File doesn't exist
                }
                throw new Error(`Failed to get file: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.type === 'file') {
                const content = atob(data.content);
                return JSON.parse(content);
            }

            return null;
        } catch (error) {
            console.error('Error getting file:', error);
            return null;
        }
    }

    /**
     * Save file to GitHub
     */
    async saveFile(filePath, content, message = 'Auto-save from Ezee Money System') {
        try {
            // Get current file info (if exists)
            let sha = null;
            try {
                const response = await fetch(`${this.baseURL}/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}?ref=${this.branch}`, {
                    headers: {
                        'Authorization': `token ${this.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    sha = data.sha;
                }
            } catch (error) {
                // File doesn't exist, that's okay
            }

            // Prepare file content
            const jsonContent = JSON.stringify(content, null, 2);
            const base64Content = btoa(unescape(encodeURIComponent(jsonContent)));

            // Create or update file
            const body = {
                message: message,
                content: base64Content,
                branch: this.branch
            };

            if (sha) {
                body.sha = sha;
            }

            const response = await fetch(`${this.baseURL}/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to save file: ${response.status} - ${errorData.message}`);
            }

            const data = await response.json();
            this.lastKnownHash = data.commit.sha;
            
            return {
                success: true,
                sha: data.commit.sha,
                url: data.content.html_url
            };
        } catch (error) {
            console.error('Error saving file:', error);
            throw error;
        }
    }

    /**
     * Upload image to GitHub
     */
    async uploadImage(imageData, fileName, folder = 'images') {
        try {
            const filePath = `${folder}/${fileName}`;
            
            // Convert data URL to base64
            const base64Data = imageData.split(',')[1];
            
            const body = {
                message: `Upload image: ${fileName}`,
                content: base64Data,
                branch: this.branch
            };

            const response = await fetch(`${this.baseURL}/repos/${this.repoOwner}/${this.repoName}/contents/${filePath}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Failed to upload image: ${response.status} - ${errorData.message}`);
            }

            const data = await response.json();
            
            return {
                success: true,
                url: data.content.download_url,
                html_url: data.content.html_url,
                sha: data.commit.sha
            };
        } catch (error) {
            console.error('Error uploading image:', error);
            throw error;
        }
    }

    /**
     * Submit agent data in real-time
     */
    async submitAgentData(submission) {
        try {
            console.log('Submitting agent data to GitHub:', submission);

            // Upload images first
            const imageUrls = {};
            if (submission.images) {
                const timestamp = Date.now();
                
                if (submission.images.idFront) {
                    const idFrontResult = await this.uploadImage(
                        submission.images.idFront, 
                        `id-front-${timestamp}.jpg`
                    );
                    imageUrls.idFront = idFrontResult.url;
                }

                if (submission.images.idBack) {
                    const idBackResult = await this.uploadImage(
                        submission.images.idBack, 
                        `id-back-${timestamp}.jpg`
                    );
                    imageUrls.idBack = idBackResult.url;
                }

                if (submission.images.agentPhoto) {
                    const agentPhotoResult = await this.uploadImage(
                        submission.images.agentPhoto, 
                        `agent-photo-${timestamp}.jpg`
                    );
                    imageUrls.agentPhoto = agentPhotoResult.url;
                }
            }

            // Create submission with image URLs
            const finalSubmission = {
                ...submission,
                images: imageUrls,
                submittedAt: new Date().toISOString(),
                id: submission.id || `SUB-${timestamp}`
            };

            // Save to submissions file
            const submissions = await this.getFile('submissions.json') || { submissions: [] };
            submissions.submissions.push(finalSubmission);
            
            await this.saveFile('submissions.json', submissions, `New submission from ${finalSubmission.agentInfo?.fullName || 'Unknown Agent'}`);

            // Notify subscribers
            this.notifySubscribers(finalSubmission, 'new_submission');

            return {
                success: true,
                submissionId: finalSubmission.id,
                imageUrls: imageUrls
            };
        } catch (error) {
            console.error('Error submitting agent data:', error);
            throw error;
        }
    }

    /**
     * Start real-time polling for admin
     */
    startRealTimePolling() {
        if (this.isPolling) {
            return;
        }

        this.isPolling = true;
        console.log('Starting real-time polling...');

        const poll = async () => {
            if (!this.isPolling) {
                return;
            }

            try {
                const hasChanged = await this.hasRepositoryChanged();
                
                if (hasChanged) {
                    console.log('Repository changed, fetching updates...');
                    
                    // Get latest submissions
                    const submissions = await this.getFile('submissions.json');
                    if (submissions) {
                        this.notifySubscribers(submissions, 'submissions_updated');
                    }

                    // Get latest agents
                    const agents = await this.getFile('agents.json');
                    if (agents) {
                        this.notifySubscribers(agents, 'agents_updated');
                    }
                }
            } catch (error) {
                console.error('Polling error:', error);
            }

            // Schedule next poll
            setTimeout(poll, this.pollingInterval);
        };

        // Start polling
        poll();
    }

    /**
     * Stop real-time polling
     */
    stopRealTimePolling() {
        this.isPolling = false;
        console.log('Stopped real-time polling');
    }

    /**
     * Get all submissions
     */
    async getSubmissions() {
        try {
            const data = await this.getFile('submissions.json');
            return data?.submissions || [];
        } catch (error) {
            console.error('Error getting submissions:', error);
            return [];
        }
    }

    /**
     * Get all agents
     */
    async getAgents() {
        try {
            const data = await this.getFile('agents.json');
            return data?.agents || [];
        } catch (error) {
            console.error('Error getting agents:', error);
            return [];
        }
    }

    /**
     * Save agents to GitHub
     */
    async saveAgents(agents) {
        try {
            const data = { agents: agents };
            await this.saveFile('agents.json', data, 'Update agents list');
            this.notifySubscribers(data, 'agents_updated');
            return { success: true };
        } catch (error) {
            console.error('Error saving agents:', error);
            throw error;
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RealTimeService;
} else if (typeof window !== 'undefined') {
    window.RealTimeService = RealTimeService;
}
