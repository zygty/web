---
title: "Assignment 2"
slug: assignment2
date: 2025-04-01
math: true
---

# Assignment 2: Static Personal Blog Website

**Student Name**: LiHaoxuan
**Student ID**: ZY2557204
**Deployment URL**: https://zygty.github.io/web/

## 1. Introduction

This assignment documents the process of setting up and deploying a static personal blog website using Hugo framework with Git version control. The website integrates previous coursework assignments and provides a centralized platform for academic documentation.

## 2. Technology Choice and Rationale

### Framework Selection: Hugo

After evaluating several static site generator options, I chose **Hugo** for the following reasons:

| Factor | Hugo | Alternative (Sphinx) | Rationale |
|--------|------|---------------------|-----------|
| **Build Speed** | Extremely fast (<1ms) | Slower | Hugo compiles sites instantly |
| **Learning Curve** | Moderate | Steep | Simple template structure |
| **Theme System** | Flexible | Limited | Easy customization |
| **Integration** | GitHub Pages native | Requires extra setup | Direct deployment support |
| **Documentation** | Excellent | Good | Comprehensive guides available |

**Decision**: Hugo's speed and native GitHub Pages support made it the ideal choice for this project.

## 3. Git Version Control and Commit History

### Repository Structure

```
web/
├── content/              # Markdown content files
│   ├── _index.md        # Homepage
│   ├── map.md           # Aviation map page
│   ├── Assignment1.md  # Assignment 1 report
│   ├── Assignment2.md  # This assignment
│   ├── Assignment3.md  # Assignment 3 placeholder
│   └── Assignment4.md  # Assignment 4 placeholder
├── layouts/             # HTML templates
│   ├── _default/       # Default layouts
│   └── partials/       # Reusable components
├── static/             # Static assets (CSS, JS, images)
├── data/               # Data files (sidebar configuration)
├── hugo.toml          # Hugo configuration
└── .github/           # GitHub Actions workflows
    └── workflows/
        └── hugo.yml  # Deployment automation
```

### Commit History Analysis

| Commit | Hash | Purpose | Key Changes |
|--------|------|---------|-------------|
| 1 | `95a9284` | **Initialize Hugo site** | Set up basic Hugo project structure |
| 2 | `41515c9` | **Add .gitignore** | Exclude generated files and dependencies |
| 3 | `7753322` | **Add map functionality** | Implement aviation tracking system |
| 4 | `ed72531` | **Initial documentation** | Add project structure and documentation |
| 5 | `2053c45` | **Data processing** | Add ADSB data processing scripts |
| 6 | `1ce8179` | **Website structure** | Create blog layout with sidebar navigation |
| 7 | `c59a763` | **GitHub Actions deployment** | Automate deployment to GitHub Pages |
| 8 | `a570ea7` | **Content completion** | Finalize Assignment 1 and styling |

### Commit Rationale

**Commit 1-2 (Setup Phase)**:
- Established project foundation
- Configured version control to exclude build artifacts
- Ensured clean repository state

**Commit 3-5 (Development Phase)**:
- Implemented core aviation map functionality
- Added data processing capabilities
- Created comprehensive documentation

**Commit 6-7 (Integration Phase)**:
- Transformed from single-page application to blog structure
- Added navigation and sidebar components
- Automated deployment pipeline

**Commit 8 (Content Phase)**:
- Integrated Assignment 1 report
- Finalized styling and layout
- Completed core functionality

## 4. Website Setup Process

### Phase 1: Local Development Setup

```bash
# Install Hugo (macOS)
brew install hugo

# Create new site
hugo new site web
cd web

# Initialize Git repository
git init
```

### Phase 2: Theme and Layout Development

Created custom templates for the website:

1. **Base Template** ([baseof.html](layouts/_default/baseof.html))
   - Defines overall page structure
   - Includes header, sidebar, and footer
   - Implements responsive design

2. **Content Templates**
   - [home.html](layouts/_default/home.html) - Homepage layout
   - [single.html](layouts/_default/single.html) - Individual page layout
   - [map.html](layouts/_default/map.html) - Dedicated map layout

3. **Component Templates**
   - [sidebar.html](layouts/partials/sidebar.html) - Navigation sidebar
   - [map.html](layouts/partials/map.html) - Interactive map component

### Phase 3: Content Creation

Created markdown content files:
- Homepage with navigation links
- Assignment pages for coursework
- Aviation map page with interactive features

### Phase 4: Styling Implementation

Created [style.css](static/css/style.css) with:
- Responsive layout using Flexbox
- Sidebar navigation styling
- Typography and spacing
- Mobile-responsive breakpoints

### Phase 5: GitHub Actions Deployment

Created [`.github/workflows/hugo.yml`](.github/workflows/hugo.yml):

```yaml
name: Deploy Hugo site
on:
  push:
    branches: [main]
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Hugo
        uses: peaceiris/actions-hugo@v2
      - name: Build
        run: hugo --minify
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./public
```

## 5. Integration with Previous Work

### Assignment 1 Integration

The website seamlessly integrates Assignment 1 (Matrix Multiplication Project) through:

1. **Dedicated Page**: Created [Assignment1.md](content/Assignment1.md) with full report
2. **Navigation Links**: Added to both header navigation and sidebar
3. **Code Display**: Formatted Python code with syntax highlighting
4. **Math Support**: Enabled mathematical formula rendering using LaTeX

### Aviation Map Integration

The existing aviation tracking system was integrated as:
- Standalone page at `/web/map/`
- Interactive JavaScript components
- Real-time data visualization capabilities

## 6. Deployment and Accessibility

### GitHub Pages Configuration

**Repository Settings**:
- Source: `gh-pages` branch
- Base URL: `/web/`
- Custom domain: None (using default GitHub Pages URL)

**Access URLs**:
- **Production**: https://zygty.github.io/web/
- **Local Development**: http://localhost:8000/web/

### Deployment Process

1. **Automatic Deployment**: Every push to `main` branch triggers GitHub Actions
2. **Build Steps**:
   - Checkout code
   - Install Hugo
   - Build static files
   - Deploy to `gh-pages` branch

3. **Verification**: Automated tests ensure successful deployment

### Accessibility Features

- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Semantic HTML**: Proper use of HTML5 elements
- **Navigation**: Multiple ways to navigate (header, sidebar, homepage links)
- **Fast Loading**: Minimal JavaScript, optimized CSS
- **Cross-browser**: Compatible with modern browsers

## 7. Website Functionality

### HTML Functionality Checklist

| Feature | Status | Location |
|---------|--------|----------|
| Navigation Menu | ✓ Working | Header bar |
| Sidebar Navigation | ✓ Working | Left sidebar |
| Homepage Links | ✓ Working | _index.md |
| Assignment Pages | ✓ Working | content/Assignment*.md |
| Interactive Map | ✓ Working | content/map.md |
| Responsive Design | ✓ Working | CSS media queries |
| Code Highlighting | ✓ Working | Markdown rendering |
| Math Formulas | ✓ Enabled | Hugo math setting |

### User Experience Features

1. **Consistent Navigation**: Same navigation across all pages
2. **Active Page Highlighting**: Current page highlighted in sidebar
3. **Fast Page Loads**: Static files for instant loading
4. **Clean Layout**: Organized content with clear hierarchy

## 8. Challenges and Solutions

### Challenge 1: BaseURL Configuration

**Problem**: Links not working correctly due to GitHub Pages subdirectory (`/web/`)

**Solution**: Set `baseURL = "https://zygty.github.io/web/"` in `hugo.toml` and used `relURL` template function

### Challenge 2: Sidebar Implementation

**Problem**: Needed dynamic sidebar that works across all pages

**Solution**: Created Hugo partial template that reads from `data/sidebar.yml` configuration

### Challenge 3: Deployment Automation

**Problem**: Manual deployment was error-prone

**Solution**: Implemented GitHub Actions workflow for automatic deployment on push

## 9. Lessons Learned

1. **Hugo Framework**: Learned static site generation and template system
2. **Git Workflow**: Improved commit practices and repository organization
3. **CI/CD**: Understood automated deployment pipelines
4. **Web Development**: Enhanced HTML/CSS/JavaScript skills
5. **Documentation**: Importance of clear, comprehensive documentation

## 10. Future Improvements

1. **Search Functionality**: Add site-wide search capability
2. **Dark Mode**: Implement theme switching
3. **Comments**: Add comment system for feedback
4. **Analytics**: Integrate visitor analytics
5. **More Content**: Expand with additional assignments and projects

## 11. Conclusion

This project successfully created a static personal blog website using Hugo with proper Git version control and automated deployment. The website meets all assignment requirements:

- ✓ Deployed to accessible URL (https://zygty.github.io/web/)
- ✓ Git version control with 8 meaningful commits
- ✓ Comprehensive documentation of the process
- ✓ Integration of Assignment 1 work
- ✓ Functional HTML with responsive design
- ✓ Accessible from any internet connection

The experience gained from this project will be valuable for future web development and documentation efforts.

## 12. References

1. [Hugo Documentation](https://gohugo.io/documentation/)
2. [GitHub Pages Guide](https://docs.github.com/en/pages)
3. [Git Cheat Sheet](https://education.github.com/git-cheat-sheet-education.pdf)
4. [Markdown Guide](https://www.markdownguide.org/)
5. [GitHub Actions Documentation](https://docs.github.com/en/actions)

## Appendix: Commands Reference

### Local Development Commands

```bash
# Build the site
hugo

# Run development server
hugo server -p 8000

# Create new content
hugo new content/assignment5.md

# Build with minification
hugo --minify
```

### Git Commands Used

```bash
# Initialize repository
git init

# Add files
git add .

# Commit with message
git commit -m "descriptive message"

# Push to remote
git push origin main

# Check commit history
git log --oneline

# View commit details
git log --stat
```
