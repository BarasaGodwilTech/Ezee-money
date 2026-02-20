/**
 * Submission Service for Field Agents
 * Handles submissions without requiring GitHub token from field agents
 */

class SubmissionService {
    constructor() {
        this.baseURL = window.location.origin;
        this.submissionEndpoint = `${this.baseURL}/api/submit`;
    }

    /**
     * Submit data to Ezee Money Database
     * This simulates the backend submission process
     */
    async submitData(data, images) {
        try {
            // Create submission package
            const submission = {
                id: Date.now().toString(),
                agentInfo: data.agentInfo,
                clientInfo: data.clientInfo,
                serviceInfo: data.serviceInfo,
                images: images,
                submissionDate: new Date().toISOString(),
                status: 'submitted',
                userAgent: navigator.userAgent,
                ipAddress: await this.getClientIP()
            };

            // Store in localStorage as temporary storage
            // In production, this would go to your backend server
            const submissions = JSON.parse(localStorage.getItem('ezeeSubmissions') || '[]');
            submissions.push(submission);
            localStorage.setItem('ezeeSubmissions', JSON.stringify(submissions));

            // Also store for admin to retrieve
            const adminSubmissions = JSON.parse(localStorage.getItem('adminSubmissions') || '[]');
            adminSubmissions.push(submission);
            localStorage.setItem('adminSubmissions', JSON.stringify(adminSubmissions));

            return {
                success: true,
                submissionId: submission.id,
                message: 'Data submitted to Ezee Money Database successfully'
            };

        } catch (error) {
            throw new Error(`Submission failed: ${error.message}`);
        }
    }

    /**
     * Get client IP (simulated)
     */
    async getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return 'Unknown';
        }
    }

    /**
     * Validate submission data
     */
    validateSubmission(data) {
        const errors = [];

        // Check required fields
        if (!data.clientInfo.fullName) errors.push('Client name is required');
        if (!data.clientInfo.phone) errors.push('Client phone is required');
        if (!data.clientInfo.nationalId) errors.push('National ID is required');
        if (!data.clientInfo.dob) errors.push('Date of birth is required');
        if (!data.clientInfo.gender) errors.push('Gender is required');
        if (!data.clientInfo.businessAddress) errors.push('Business address is required');
        if (!data.clientInfo.residentialAddress) errors.push('Residential address is required');
        if (!data.serviceInfo.type) errors.push('Service type is required');

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Compress image before upload
     */
    async compressImage(file, maxWidth = 800, maxHeight = 600, quality = 0.7) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                // Calculate new dimensions
                let { width, height } = img;
                
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                
                if (height > maxHeight) {
                    width = (maxHeight / height) * width;
                    height = maxHeight;
                }

                canvas.width = width;
                canvas.height = height;

                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(resolve, 'image/jpeg', quality);
            };

            img.src = URL.createObjectURL(file);
        });
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
     * Process multiple images
     */
    async processImages(imageFiles) {
        const processedImages = {};

        for (const [key, file] of Object.entries(imageFiles)) {
            if (file) {
                try {
                    // Compress image
                    const compressedFile = await this.compressImage(file);
                    
                    // Convert to base64
                    const base64 = await this.fileToBase64(compressedFile);
                    
                    processedImages[key] = {
                        base64: base64,
                        originalName: file.name,
                        size: file.size,
                        compressedSize: compressedFile.size,
                        type: file.type
                    };
                } catch (error) {
                    console.error(`Error processing ${key}:`, error);
                    processedImages[key] = { error: error.message };
                }
            }
        }

        return processedImages;
    }

    /**
     * Get submission status
     */
    async getSubmissionStatus(submissionId) {
        const submissions = JSON.parse(localStorage.getItem('ezeeSubmissions') || '[]');
        const submission = submissions.find(s => s.id === submissionId);
        
        return submission ? submission.status : 'not_found';
    }

    /**
     * Get all submissions for current agent
     */
    getAgentSubmissions(agentScCode) {
        const submissions = JSON.parse(localStorage.getItem('ezeeSubmissions') || '[]');
        return submissions.filter(s => s.agentInfo.scCode === agentScCode);
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubmissionService;
} else if (typeof window !== 'undefined') {
    window.SubmissionService = SubmissionService;
}
