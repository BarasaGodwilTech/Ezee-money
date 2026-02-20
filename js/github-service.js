/**
 * GitHub Service for Ezee Money Data Collection System
 * Handles all GitHub API interactions for data storage
 */

class GitHubService {
    constructor() {
        this.config = this.loadConfig();
        this.baseURL = 'https://api.github.com';
    }

    /**
     * Load GitHub configuration from localStorage
     */
    loadConfig() {
        const saved = localStorage.getItem('ezeeAdminConfig');
        if (saved) {
            const config = JSON.parse(saved);
            return config.github || {};
        }
        return {};
    }

    /**
     * Save GitHub configuration to localStorage
     */
    saveConfig(config) {
        const current = JSON.parse(localStorage.getItem('ezeeAdminConfig') || '{}');
        current.github = config;
        localStorage.setItem('ezeeAdminConfig', JSON.stringify(current));
        this.config = config;
    }

    /**
     * Test GitHub connection
     */
    async testConnection() {
        if (!this.config.token || !this.config.repoOwner || !this.config.repoName) {
            throw new Error('GitHub configuration is incomplete');
        }

        try {
            const response = await fetch(`${this.baseURL}/repos/${this.config.repoOwner}/${this.config.repoName}`, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error(`GitHub API Error: ${response.status} ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            throw new Error(`Connection failed: ${error.message}`);
        }
    }

    /**
     * Upload file to GitHub repository
     */
    async uploadFile(filename, content, message = 'Upload file') {
        if (!this.config.token || !this.config.repoOwner || !this.config.repoName) {
            throw new Error('GitHub configuration is incomplete');
        }

        try {
            // Check if file exists
            let sha = null;
            try {
                const existingFile = await fetch(`${this.baseURL}/repos/${this.config.repoOwner}/${this.config.repoName}/contents/${filename}`, {
                    headers: {
                        'Authorization': `token ${this.config.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (existingFile.ok) {
                    const fileData = await existingFile.json();
                    sha = fileData.sha;
                }
            } catch (error) {
                // File doesn't exist, that's okay
            }

            // Upload file
            const response = await fetch(`${this.baseURL}/repos/${this.config.repoOwner}/${this.config.repoName}/contents/${filename}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    content: content,
                    sha: sha
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Upload failed: ${errorData.message}`);
            }

            return await response.json();
        } catch (error) {
            throw new Error(`File upload error: ${error.message}`);
        }
    }

    /**
     * Upload image as base64
     */
    async uploadImage(filename, base64Data, message = 'Upload image') {
        // Remove data URL prefix if present
        const base64Content = base64Data.includes(',') 
            ? base64Data.split(',')[1] 
            : base64Data;

        return await this.uploadFile(filename, base64Content, message);
    }

    /**
     * Read file from GitHub repository
     */
    async readFile(filename) {
        if (!this.config.token || !this.config.repoOwner || !this.config.repoName) {
            throw new Error('GitHub configuration is incomplete');
        }

        try {
            const response = await fetch(`${this.baseURL}/repos/${this.config.repoOwner}/${this.config.repoName}/contents/${filename}`, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null; // File doesn't exist
                }
                throw new Error(`Read failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            // Decode base64 content
            if (data.content) {
                try {
                    return JSON.parse(atob(data.content));
                } catch (error) {
                    // Return raw content if it's not JSON
                    return atob(data.content);
                }
            }

            return null;
        } catch (error) {
            throw new Error(`File read error: ${error.message}`);
        }
    }

    /**
     * Delete file from GitHub repository
     */
    async deleteFile(filename, message = 'Delete file') {
        if (!this.config.token || !this.config.repoOwner || !this.config.repoName) {
            throw new Error('GitHub configuration is incomplete');
        }

        try {
            // Get file info to get SHA
            const response = await fetch(`${this.baseURL}/repos/${this.config.repoOwner}/${this.config.repoName}/contents/${filename}`, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error(`File not found: ${response.status}`);
            }

            const fileData = await response.json();

            // Delete file
            const deleteResponse = await fetch(`${this.baseURL}/repos/${this.config.repoOwner}/${this.config.repoName}/contents/${filename}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    sha: fileData.sha
                })
            });

            if (!deleteResponse.ok) {
                throw new Error(`Delete failed: ${deleteResponse.status}`);
            }

            return await deleteResponse.json();
        } catch (error) {
            throw new Error(`File delete error: ${error.message}`);
        }
    }

    /**
     * Save field agent submission data
     */
    async saveSubmission(submissionData) {
        try {
            // Read existing submissions
            let submissions = [];
            try {
                const existingData = await this.readFile('submissions.json');
                if (existingData && existingData.submissions) {
                    submissions = existingData.submissions;
                }
            } catch (error) {
                console.log('No existing submissions file, creating new one');
            }

            // Add new submission
            const newSubmission = {
                id: Date.now().toString(),
                ...submissionData,
                createdAt: new Date().toISOString()
            };

            submissions.push(newSubmission);

            // Save updated submissions
            const dataToSave = {
                submissions: submissions,
                lastUpdated: new Date().toISOString(),
                totalSubmissions: submissions.length
            };

            const result = await this.uploadFile(
                'submissions.json', 
                btoa(JSON.stringify(dataToSave, null, 2)),
                `New submission from ${submissionData.agentInfo.fullName}`
            );

            return {
                success: true,
                submissionId: newSubmission.id,
                downloadUrl: result.content.download_url
            };
        } catch (error) {
            throw new Error(`Failed to save submission: ${error.message}`);
        }
    }

    /**
     * Get all submissions
     */
    async getSubmissions() {
        try {
            const data = await this.readFile('submissions.json');
            return data ? data.submissions || [] : [];
        } catch (error) {
            throw new Error(`Failed to get submissions: ${error.message}`);
        }
    }

    /**
     * Save field agents configuration
     */
    async saveAgents(agents) {
        try {
            const dataToSave = {
                agents: agents,
                lastUpdated: new Date().toISOString(),
                totalAgents: agents.length
            };

            const result = await this.uploadFile(
                'agents.json',
                btoa(JSON.stringify(dataToSave, null, 2)),
                'Update field agents configuration'
            );

            return {
                success: true,
                downloadUrl: result.content.download_url
            };
        } catch (error) {
            throw new Error(`Failed to save agents: ${error.message}`);
        }
    }

    /**
     * Get field agents configuration
     */
    async getAgents() {
        try {
            const data = await this.readFile('agents.json');
            return data ? data.agents || [] : [];
        } catch (error) {
            throw new Error(`Failed to get agents: ${error.message}`);
        }
    }

    /**
     * Upload multiple images for a submission
     */
    async uploadSubmissionImages(submissionId, images) {
        const results = {};
        const imageFolder = `images/submissions/${submissionId}`;

        for (const [key, imageData] of Object.entries(images)) {
            try {
                const filename = `${imageFolder}/${key}_${Date.now()}.jpg`;
                const result = await this.uploadImage(
                    filename,
                    imageData,
                    `Upload ${key} for submission ${submissionId}`
                );
                
                results[key] = {
                    success: true,
                    filename: filename,
                    downloadUrl: result.content.download_url
                };
            } catch (error) {
                results[key] = {
                    success: false,
                    error: error.message
                };
            }
        }

        return results;
    }

    /**
     * Get repository information
     */
    async getRepoInfo() {
        try {
            const response = await fetch(`${this.baseURL}/repos/${this.config.repoOwner}/${this.config.repoName}`, {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get repo info: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            throw new Error(`Repository info error: ${error.message}`);
        }
    }

    /**
     * Create directory structure (by creating a .gitkeep file)
     */
    async ensureDirectory(directoryPath) {
        try {
            await this.uploadFile(
                `${directoryPath}/.gitkeep`,
                '',
                `Ensure directory exists: ${directoryPath}`
            );
            return true;
        } catch (error) {
            throw new Error(`Failed to create directory: ${error.message}`);
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GitHubService;
} else if (typeof window !== 'undefined') {
    window.GitHubService = GitHubService;
}
