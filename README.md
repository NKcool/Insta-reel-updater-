# Local Setup Guide

Follow these steps to run the application on your computer:

## 1. Prerequisites
- **Node.js**: Ensure you have Node.js 18+ installed.
- **Python**: Required by some dependencies (like `youtube-dl-exec`). If you don't have it, you can skip the check by setting `YOUTUBE_DL_SKIP_PYTHON_CHECK=1` in your `.env`.

## 2. Install Dependencies
Run these commands in your project folder:
```bash
npm install
npx playwright install chromium
```

## 3. Environment Variables
Create a `.env` file in the root directory and add the following:
```env
# AI Studio Secrets
GEMINI_API_KEY=your_gemini_key

# YouTube API (from Google Cloud Console)
YOUTUBE_CLIENT_ID=your_id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your_secret

# For Local Dev (Fixes YouTube Redirect)
APP_URL=http://localhost:3000

# Firebase (Optional but recommended for Queue)
# GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"
```

## 4. YouTube OAuth Configuration
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **APIs & Services > Credentials**.
3. Under **Authorized redirect URIs**, add:
   `http://localhost:3000/api/auth/youtube/callback`

## 5. Firebase Auth Configuration
To allow logging in locally:
1. Go to [Firebase Console](https://console.firebase.google.com/).
2. **Authentication > Settings > Authorized domains**.
3. Add `localhost`.

## 6. How to Run
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

---
### Troubleshooting
- **Metadata Extraction Failing?** Make sure you ran `npx playwright install chromium`.
- **Firebase Login Error?** Double check the Authorized Domains in Firebase.
- **Redirect URI Mismatch?** Ensure the URL in Google Cloud Console exactly matches `http://localhost:3000/api/auth/youtube/callback`.
