# Ezee Money Field Agent Data Collection System

A web-based field agent data collection system that uses GitHub as the backend data storage layer. Field agents submit data thinking it's going to a local database, while it's actually being stored in GitHub where administrators can access it from anywhere.

## Architecture

- **Frontend Only**: Deployable on GitHub Pages
- **Backend-less**: Uses GitHub API for data storage
- **Two Separate Interfaces**: Admin dashboard and Field agent portal
- **Hidden GitHub Integration**: Field agents never see GitHub-related information

## Features

### Admin Interface
- Secure admin login
- GitHub repository configuration
- Field agent credential management
- View all submitted data
- Access uploaded images
- Real-time statistics
- Mobile responsive design

### Field Agent Interface
- Simple login with SC Code and password
- Clean data submission form
- Image upload capability
- Mobile-optimized design
- No GitHub jargon visible
- "Ezee Money Database" branding

## File Structure

```
├── index.html              # Main routing page
├── admin/
│   ├── login.html         # Admin login page
│   └── dashboard.html     # Admin dashboard
├── agent/
│   ├── login.html         # Field agent login
│   └── submit.html       # Data submission form
├── js/
│   └── github-service.js  # GitHub API integration
└── README.md
```

## Setup Instructions

### 1. Create GitHub Repository
1. Create a new public or private repository on GitHub
2. Note the repository owner and name

### 2. Generate GitHub Personal Access Token
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with repository permissions:
   - `repo` (Full control of private repositories)
   - `public_repo` (Access public repositories)
3. Copy the token (save it securely)

### 3. Deploy to GitHub Pages
1. Push all files to your GitHub repository
2. Go to repository Settings → Pages
3. Select source as "Deploy from a branch" → "main"
4. Your site will be available at: `https://[username].github.io/[repository-name]`

### 4. Configure System
1. Access your deployed site
2. Click "Administrator"
3. Login with default password: `admin123`
4. Go to "GitHub Config" section
5. Enter:
   - Repository Owner (your GitHub username)
   - Repository Name
   - Branch Name (usually "main")
   - GitHub Personal Access Token
6. Click "Test Connection" to verify setup

### 5. Add Field Agents
1. Go to "Field Agents" section
2. Click "Add New Agent"
3. Enter agent details:
   - Full Name
   - SC Code
   - Password
4. Share credentials with your field agents

## Usage

### For Administrators
1. Access admin dashboard via GitHub Pages URL
2. Login with admin credentials
3. Configure GitHub settings (first time only)
4. Add/manage field agents
5. Monitor submissions in real-time
6. View and download submitted data

### For Field Agents
1. Access the same GitHub Pages URL
2. Click "Field Agent"
3. Login with provided SC Code and password
4. Fill in client information
5. Upload required documents
6. Submit to "Ezee Money Database"

## Data Storage

All data is stored in your GitHub repository:
- `submissions.json` - All field agent submissions
- `agents.json` - Field agent credentials
- `images/submissions/` - Uploaded documents organized by submission ID

## Security Features

- Admin credentials stored separately from field agents
- GitHub token never exposed to field agents
- Field agents only see "Ezee Money Database" branding
- Secure authentication for both interfaces
- Image validation and size limits

## Mobile Responsiveness

The system is fully responsive and works on:
- Desktop computers
- Tablets
- Mobile phones
- All modern browsers

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Troubleshooting

### Common Issues

**"GitHub connection failed"**
- Verify repository name and owner are correct
- Check GitHub token has proper permissions
- Ensure repository exists and is accessible

**"Field agent login failed"**
- Verify agent credentials are added in admin dashboard
- Check SC Code and password are entered correctly
- Ensure agent status is "active"

**"Image upload failed"**
- Check image file size (max 5MB)
- Ensure image format is supported (JPG, PNG, GIF)
- Verify GitHub repository has sufficient space

### Error Messages

- **Connection Errors**: Check internet connection and GitHub status
- **Authentication Errors**: Verify credentials and permissions
- **Upload Errors**: Check file sizes and formats

## Customization

### Branding
- Update logo and colors in CSS variables
- Modify "Ezee Money" text throughout
- Update meta titles and descriptions

### Fields
- Add/remove form fields in agent submission form
- Update validation rules
- Modify data structure in GitHub service

### Styling
- Update CSS variables for colors and fonts
- Modify responsive breakpoints
- Add custom animations and transitions

## Support

For issues and questions:
1. Check this README for troubleshooting
2. Verify GitHub configuration
3. Test with different browsers
4. Check GitHub API rate limits

## License

This project is open source and available under the MIT License.

---

**Important**: Never expose your GitHub Personal Access Token in client-side code or commit it to public repositories. Always keep tokens secure and rotate them regularly.
