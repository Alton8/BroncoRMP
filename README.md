# BroncoRMP - Rate My Professors Integration for Cal Poly Pomona

## Overview

BroncoRMP is a Chrome extension that integrates professor ratings from Rate My Professors directly into Cal Poly Pomona's CMS course registration interface. This allows students to quickly view professor ratings and reviews without leaving the course schedule page.

## Features

- **Automatic Professor Lookup**: Extracts professor names from the Cal Poly Pomona CMS course schedule
- **Rate My Professors Integration**: Fetches real-time ratings, difficulty scores, and review summaries
- **AI-Powered Review Analysis**: Uses Groq AI to generate concise summaries of professor reviews
- **Seamless UI Integration**: Displays professor information directly in the course registration interface
- **Smart Name Matching**: Intelligently handles duplicate names and formatting variations

## How It Works

1. **Content Script** (`content.js`, `scrapr.js`): Monitors the CMS course page and extracts instructor names from the course schedule
2. **Background Service** (`background.js`): Handles cross-origin requests to Rate My Professors
3. **Backend API**: A Node.js/Express server that:
   - Queries the Rate My Professors API for professor data
   - Analyzes reviews using Groq AI to generate keyword summaries
   - Caches results for better performance
4. **Storage** (`storage.js`): Manages local caching to minimize API calls

## Installation

1. Clone or download this repository
2. Go to `chrome://extensions/` in Chrome
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension will now appear in your Chrome extensions

## Project Structure

```
├── background.js          # Service worker for handling background tasks
├── content.js            # Content script for CMS page interaction
├── scrapr.js             # Professor name extraction logic
├── storage.js            # Local storage management
├── manifest.json         # Chrome extension configuration
└── backend/              # Node.js backend server
    ├── server.js         # Express app setup
    ├── controllers/
    │   └── professorController.js  # Professor data logic
    ├── routes/
    │   └── professorRoutes.js      # API endpoints
    └── services/
        ├── rmpService.js  # Rate My Professors API integration
        └── groqService.js # AI review analysis
```

## Requirements

- Google Chrome or Chromium-based browser
- Access to Cal Poly Pomona CMS (`cmsweb.cms.cpp.edu`)
- Backend server running (optional, defaults to cloud deployment)

## Configuration

The extension uses the following configuration (in `content.js`):

```javascript
const USE_LOCAL = false; // Set to true to use local backend
const REMOTE_API_BASE = "https://backend-u12d.onrender.com";
```

To run the backend locally:
```bash
cd backend
npm install
npm start
```

## Technologies Used

- **Chrome Extension API** (Manifest v3)
- **Node.js** - Backend server
- **Express.js** - REST API framework
- **Rate My Professors Client** - Professor data source
- **Groq SDK** - AI-powered review analysis
- **CORS** - Cross-origin requests handling

## License

This project is provided as-is for educational purposes.

## Disclaimer

This extension is an unofficial tool and is not affiliated with Cal Poly Pomona or Rate My Professors. Use responsibly and in compliance with Rate My Professors' terms of service.
