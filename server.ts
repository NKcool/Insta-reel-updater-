import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { GoogleGenAI } from '@google/genai';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import cron from 'node-cron';
import { chromium } from 'playwright';
import yts from 'yt-search';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin correctly with Project ID and Database ID
let firebaseDb: admin.firestore.Firestore | null = null;
try {
  const firebaseConfigPath = path.join(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(firebaseConfigPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    admin.initializeApp({
      projectId: firebaseConfig.projectId
    });
    firebaseDb = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);
    console.log(`Firebase Admin initialized: Project ${firebaseConfig.projectId}, Database: ${firebaseConfig.firestoreDatabaseId}`);
  } else {
    console.warn('firebase-applet-config.json not found. Scheduling will not work.');
  }
} catch (e) {
  console.error('Could not auto-initialize Firebase Admin. Continuing without scheduling support.', e);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


import { igdl, youtube as btchYoutube } from 'btch-downloader';

// Helper to extract direct video URL from a standard Instagram link or YouTube link
async function extractVideoUrl(videoLink: string): Promise<string> {
  // If it's already a direct link, return it
  if (videoLink.includes('.mp4') || videoLink.includes('video_url')) return videoLink;

  console.log(`[Extraction] Attempting to extract video from: ${videoLink}`);

  try {
    if (videoLink.includes('youtube.com') || videoLink.includes('youtu.be')) {
      const data = await btchYoutube(videoLink);
      if (data && data.status && data.mp4) {
        console.log(`[Extraction] Success! Found YouTube video URL.`);
        return data.mp4;
      }
      console.log('[Extraction] btch-downloader returned unexpected YT format:', JSON.stringify(data).substring(0, 200));
    } else {
      const data = await igdl(videoLink);
      
      if (data && data.status && Array.isArray(data.result)) {
        // Find the first valid URL
        const validMedia = data.result.find((item: any) => item.url && typeof item.url === 'string');
        
        if (validMedia && validMedia.url) {
          console.log(`[Extraction] Success! Found IG video URL.`);
          return validMedia.url;
        }
      }
      console.log('[Extraction] btch-downloader returned unexpected IG format:', JSON.stringify(data).substring(0, 200));
    }
  } catch (e: any) {
    console.error('[Extraction] btch-downloader failed:', e.message);
  }

  throw new Error('Could not extract video from this link. The post may be private, deleted, or unsupported. Please try sharing a public IG Reel or YouTube Short again in a moment.');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: 'insta-re-share-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: true, 
      sameSite: 'none' 
    }
  }));

  // Temporary storage for downloaded videos
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  // Serve the temp directory so Instagram can download the video
  app.use('/temp', express.static(tempDir));

  // --- API Routes ---

  // Handle Share Target
  app.get('/share', (req, res) => {
    const { text, url, title } = req.query;
    const sharedUrl = (text || url || '').toString();
    // Redirect to frontend with the shared URL as a param
    res.redirect(`/?sharedUrl=${encodeURIComponent(sharedUrl)}`);
  });

  // Trending Videos (YouTube Shorts search)
  app.get('/api/trending', async (req, res) => {
    const topic = req.query.topic || 'viral';
    try {
      const searchResult = await yts(`${topic} #shorts`);
      const videos = searchResult.videos.slice(0, 10).map(v => ({
        title: v.title,
        url: v.url,
        thumbnail: v.thumbnail,
        views: v.views,
        author: v.author.name,
        duration: v.duration.timestamp
      }));
      res.json({ videos });
    } catch (e: any) {
      console.error('Trending fetch error:', e);
      res.status(500).json({ error: 'Failed to fetch trending videos' });
    }
  });

  // --- YouTube OAuth ---
  
  function getYoutubeOauth2Client(req: express.Request) {
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    
    // Derive base URL: Priority 1: APP_URL env, Priority 2: Request headers
    let baseUrl = process.env.APP_URL;
    if (!baseUrl) {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.headers['x-forwarded-host'] || req.get('host');
      baseUrl = `${protocol}://${host}`;
    }
    baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash

    const redirectUri = `${baseUrl}/api/auth/youtube/callback`;
    console.log(`[YouTube OAuth] Using Redirect URI: ${redirectUri}`);
    
    return {
      client: new google.auth.OAuth2(clientId, clientSecret, redirectUri),
      redirectUri
    };
  }

  app.get('/api/auth/youtube/url', (req, res) => {
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    if (!clientId) {
      return res.status(400).json({ error: 'YouTube Client ID not configured in Secrets' });
    }

    const { client: oauth2Client } = getYoutubeOauth2Client(req);
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl'
    ];
    
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
    
    res.json({ url });
  });

  app.get('/api/auth/youtube/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send('No code provided');
    }

    try {
      const { client: oauth2Client } = getYoutubeOauth2Client(req);
      const { tokens } = await oauth2Client.getToken(code as string);
      
      // Send token back to window opener
      res.send(`
        <script>
          window.opener.postMessage({ 
            type: 'YOUTUBE_AUTH_SUCCESS', 
            tokens: ${JSON.stringify(tokens)}
          }, '*');
          window.close();
        </script>
      `);
    } catch (error: any) {
      console.error('YouTube OAuth Error:', error);
      res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px;">
          <h2 style="margin-top: 0;">Authentication Error</h2>
          <p>${error.message}</p>
          <button onclick="window.close()" style="padding: 8px 16px; cursor: pointer;">Close Window</button>
        </div>
      `);
    }
  });

  // --- Instagram OAuth ---
  app.get('/api/auth/instagram/url', (req, res) => {
    const appId = process.env.VITE_INSTAGRAM_APP_ID;
    const appUrl = process.env.APP_URL;
    const redirectUri = `${appUrl}/api/auth/instagram/callback`;
    
    console.log('Auth URL Request:');
    console.log('- App ID (masked):', appId ? `${appId.substring(0, 3)}...${appId.substring(appId.length - 3)}` : 'MISSING');
    console.log('- App URL:', appUrl);
    console.log('- Redirect URI:', redirectUri);

    if (!appId) {
      return res.status(400).json({ error: 'Instagram App ID not configured in Secrets' });
    }

    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management,public_profile`;
    res.json({ url });
  });

  // Instagram OAuth Callback
  app.get('/api/auth/instagram/callback', async (req, res) => {
    const { code } = req.query;
    const appId = process.env.VITE_INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const redirectUri = `${process.env.APP_URL}/api/auth/instagram/callback`;

    try {
      // 1. Exchange code for access token
      const tokenResponse = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
        params: {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code
        }
      });

      const accessToken = tokenResponse.data.access_token;

      // Debug: Check token permissions
      const debugResponse = await axios.get(`https://graph.facebook.com/debug_token`, {
        params: {
          input_token: accessToken,
          access_token: `${appId}|${appSecret}`
        }
      });
      const scopes = debugResponse.data.data.scopes.join(', ');
      console.log('Token Scopes:', scopes);

      // 2. Get User's Pages
      const pagesResponse = await axios.get(`https://graph.facebook.com/v19.0/me/accounts`, {
        params: { access_token: accessToken }
      });

      console.log('Facebook Pages found:', pagesResponse.data.data.length);

      let igUserId = null;
      let foundPages = [];
      
      for (const page of pagesResponse.data.data) {
        foundPages.push(page.name);
        try {
          const igResponse = await axios.get(`https://graph.facebook.com/v19.0/${page.id}`, {
            params: {
              fields: 'instagram_business_account',
              access_token: accessToken
            }
          });
          if (igResponse.data.instagram_business_account) {
            igUserId = igResponse.data.instagram_business_account.id;
            console.log(`Found IG Business Account on page: ${page.name}`);
            break;
          }
        } catch (e) {
          console.error(`Error checking page ${page.name}:`, e);
        }
      }

      if (!igUserId) {
        return res.send(`
          <div style="font-family: sans-serif; padding: 20px; color: #856404; background: #fff3cd; border: 1px solid #ffeeba; border-radius: 8px;">
            <h2 style="margin-top: 0;">Instagram Account Not Found</h2>
            <p>We found ${pagesResponse.data.data.length} Facebook Pages (${foundPages.join(', ') || 'none'}), but none of them are linked to an <b>Instagram Business or Creator</b> account.</p>
            <hr>
            <p><b>How to fix:</b></p>
            <ol>
              <li>Ensure your IG account is set to <b>Business</b> or <b>Creator</b> mode.</li>
              <li>Link your IG account to one of your Facebook Pages in the Page Settings.</li>
              <li>When logging in, make sure to select <b>all permissions</b> in the Facebook popup.</li>
            </ol>
            <button onclick="window.close()" style="padding: 8px 16px; cursor: pointer;">Try Again</button>
          </div>
        `);
      }

      // Store in session or return to client
      // We'll return a script to postMessage back to the app
      res.send(`
        <script>
          window.opener.postMessage({ 
            type: 'INSTAGRAM_AUTH_SUCCESS', 
            accessToken: '${accessToken}',
            igUserId: '${igUserId}'
          }, '*');
          window.close();
        </script>
      `);
    } catch (error: any) {
      const errorData = error.response?.data || { message: error.message };
      console.error('OAuth Error:', errorData);
      
      let userFriendlyMessage = 'Authentication failed.';
      if (errorData.error?.message) {
        userFriendlyMessage += ` Details: ${errorData.error.message}`;
      } else if (errorData.message) {
        userFriendlyMessage += ` Details: ${errorData.message}`;
      }

      res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px;">
          <h2 style="margin-top: 0;">Authentication Error</h2>
          <p>${userFriendlyMessage}</p>
          <p style="font-size: 0.8em; opacity: 0.8;">Check your <b>INSTAGRAM_APP_SECRET</b> in AI Studio Secrets and ensure your Facebook App is configured correctly.</p>
          <button onclick="window.close()" style="padding: 8px 16px; cursor: pointer;">Close Window</button>
        </div>
      `);
    }
  });

  // Download helper
  async function downloadVideoLocally(rawUrl: string, tDir: string): Promise<{ videoPath: string; videoId: string; cleanup: () => void }> {
    const videoUrl = await extractVideoUrl(rawUrl);
    const videoId = Math.random().toString(36).substring(7);
    const videoPath = path.join(tDir, `${videoId}.mp4`);
    
    let response;
    try {
      response = await axios({
        method: 'get',
        url: videoUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://www.instagram.com/'
        },
        timeout: 30000
      });
    } catch (e: any) {
      throw new Error(`Failed to download: ${e.message}`);
    }

    const writer = fs.createWriteStream(videoPath);
    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(null));
      writer.on('error', reject);
    });

    return { 
      videoPath, 
      videoId,
      cleanup: () => { if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath); } 
    };
  }

  // Download helper for direct frontend consumption
  app.post('/api/prepare-video', async (req, res) => {
    const { videoUrl } = req.body;
    if (!videoUrl) return res.status(400).json({ error: 'No video URL provided' });

    try {
      const localVideo = await downloadVideoLocally(videoUrl, tempDir);
      // Wait for 1 second to ensure file stream is fully flushed and available
      await new Promise(r => setTimeout(r, 1000));
      res.json({ url: `/temp/${localVideo.videoId}.mp4` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Extremely simple metadata extraction for original caption (no AI generation)
  app.post('/api/extract-metadata', async (req, res) => {
    const { videoUrl } = req.body;
    try {
      let caption = "";
      
      // 1. Check if it's YouTube - Use yt-search (very reliable)
      if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        try {
          console.log('[Extraction] Using yt-search for YouTube metadata:', videoUrl);
          // Extract video ID
          const videoIdMatch = videoUrl.match(/(?:v=|\/shorts\/|\/embed\/|\/be\/)([a-zA-Z0-9_-]{11})/);
          if (videoIdMatch && videoIdMatch[1]) {
            const ytInfo = await yts({ videoId: videoIdMatch[1] });
            if (ytInfo && ytInfo.description) {
              caption = ytInfo.description;
              // If description is empty, use title
              if (!caption.trim()) caption = ytInfo.title;
              console.log('[Extraction] YouTube success via yt-search');
            }
          }
        } catch (ytErr: any) {
          console.error('[Extraction] yt-search failed:', ytErr.message);
        }
      }

      // 2. Fallback to Playwright if not handled or failed
      if (!caption) {
        try {
          console.log('[Playwright] Attempting to extract from', videoUrl);
          const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
          });
          const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          });
          const page = await context.newPage();
          
          await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          
          // Wait a bit for JS to render the caption
          await page.waitForTimeout(2000);
  
          // For Instagram
          if (videoUrl.includes('instagram.com')) {
             const ogContent = await page.evaluate(() => {
               const og = document.querySelector('meta[property="og:title"]');
               return og ? og.getAttribute('content') : null;
             });
             
             if (ogContent) {
               caption = ogContent.split(': "').pop()?.replace(/"$/, '').trim() || ogContent;
             } else {
               const h1Text = await page.evaluate(() => {
                 const h1 = document.querySelector('h1');
                 return h1 ? h1.innerText : null;
               });
               if (h1Text) caption = h1Text;
             }
          } 
          // For YouTube (Fallback)
          else if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
             const ytDesc = await page.evaluate(() => {
               const desc = document.querySelector('meta[name="description"]');
               return desc ? desc.getAttribute('content') : null;
             });
             if (ytDesc) caption = ytDesc;
          } 
          
          // Generic Fallback
          if (!caption) {
             const genericDesc = await page.evaluate(() => {
               const meta = document.querySelector('meta[property="og:description"]') || document.querySelector('meta[name="description"]');
               return meta ? meta.getAttribute('content') : null;
             });
             if (genericDesc) caption = genericDesc;
          }
  
          await browser.close();
          console.log('[Playwright] Extraction complete!');
        } catch (pwError: any) {
          console.error('[Playwright] Extraction failed, falling back to basic axios:', pwError.message);
          
          // Try to fetch the page to extract open graph tags
          try {
            const response = await axios.get(videoUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
              },
              timeout: 5000
            });
            
            // Simple regex to find title or description
            const titleMatch = response.data.match(/<title>(.*?)<\/title>/i);
            const ogDescMatch = response.data.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i);
            const fbDescMatch = response.data.match(/<meta\s+property="twitter:title"\s+content="([^"]*)"/i);
            
            if (ogDescMatch && ogDescMatch[1]) {
              caption = ogDescMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
            } else if (fbDescMatch && fbDescMatch[1]) {
              caption = fbDescMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
            } else if (titleMatch && titleMatch[1]) {
              // Clean up standard garbage on typical titles
              const title = titleMatch[1].replace(/instagram|tiktok/gi, '').trim();
              if (title.length > 5) caption = title;
            }
          } catch (e) {
            console.error('Extraction failed natively');
          }
        }
      }

      res.json({
        caption: caption || "",
        firstComment: "",
        recommendedDelayHours: 0,
        timingReasoning: "Manual posting"
      });
    } catch (err: any) {
      console.error('Metadata Route Error:', err);
      res.status(500).json({ error: 'Server failed to extract metadata' });
    }
  });

  // Process Video (Download and Upload)
  app.post('/api/process', async (req, res) => {
    const { videoUrl: rawVideoUrl, igAuth, ytAuth, caption, firstComment, platforms } = req.body;

    try {
      // 0. Extract direct URL if it's a standard IG link
      const videoUrl = await extractVideoUrl(rawVideoUrl);

      const videoId = Math.random().toString(36).substring(7);
      const videoPath = path.join(tempDir, `${videoId}.mp4`);
      
      console.log(`[Step 1] Downloading video from: ${videoUrl}`);

      // 1. Download Video
      let response;
      try {
        response = await axios({
          method: 'get',
          url: videoUrl,
          responseType: 'stream',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://www.instagram.com/'
          },
          timeout: 30000 // 30s timeout
        });
      } catch (downloadError: any) {
        console.error('[Step 1 Failed] Video download failed:', downloadError.message);
        throw new Error(`Failed to download video from the provided link. The link might be expired or blocked. (Error: ${downloadError.message})`);
      }

      const contentType = response.headers['content-type'];
      console.log(`Content-Type: ${contentType}`);

      if (!contentType?.includes('video') && !contentType?.includes('octet-stream')) {
        throw new Error(`The link provided returned ${contentType || 'unknown content'}, not a video file. Please ensure you are using a direct .mp4 link.`);
      }

      const writer = fs.createWriteStream(videoPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(null));
        writer.on('error', reject);
      });

      const stats = fs.statSync(videoPath);
      console.log(`Local Video File Size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

      // 2. Upload to Platforms
      
      // -- YouTube Upload --
      if (platforms.yt && ytAuth) {
        console.log('[Step 2] Uploading to YouTube Shorts...');
        try {
          const oauth2Client = getYoutubeOauth2Client();
          oauth2Client.setCredentials(ytAuth);
          
          const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
          
          const ytRes = await youtube.videos.insert({
            part: ['snippet', 'status'],
            requestBody: {
              snippet: {
                title: caption ? caption.substring(0, 100) : 'Viral Shorts',
                description: caption || '',
                // categoryId: '22' // People & Blogs
              },
              status: {
                privacyStatus: 'public',
                selfDeclaredMadeForKids: false
              }
            },
            media: {
              body: fs.createReadStream(videoPath)
            }
          });
          console.log('[YT Success] Video uploaded to YouTube!');

          // If there is a first comment, post it to the video
          if (firstComment && ytRes.data.id) {
            console.log('[Step 2.5] Pinning First Comment to YouTube Shorts...');
            try {
              await youtube.commentThreads.insert({
                part: ['snippet'],
                requestBody: {
                  snippet: {
                    videoId: ytRes.data.id,
                    topLevelComment: {
                      snippet: {
                        textOriginal: firstComment
                      }
                    }
                  }
                }
              });
              console.log('[YT Success] Pinned First Comment to YouTube!');
            } catch (commentError: any) {
              console.error('[YT Failed] Failed to post comment to YouTube:', commentError.message);
              // Do not fail the whole process if just the comment fails
            }
          }
        } catch (ytError: any) {
          console.error('[YT Failed] YouTube upload failed:', ytError.message);
          throw new Error(`YouTube Upload Error: ${ytError.response?.data?.error?.message || ytError.message}`);
        }
      }

      // -- Instagram Upload --
      if (platforms.ig && igAuth) {
        console.log('[Step 2] Uploading to temporary public host for IG...');
        let publicVideoUrl = '';

        try {
          const form = new FormData();
          form.append('files[]', fs.createReadStream(videoPath));
          const uploadRes = await axios.post('https://uguu.se/upload.php', form, {
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 60000
          });
          
          if (uploadRes.data?.success && uploadRes.data?.files?.[0]?.url) {
            publicVideoUrl = uploadRes.data.files[0].url;
            console.log(`Public Video URL for Instagram (uguu.se): ${publicVideoUrl}`);
          } else {
            throw new Error('Invalid response from uguu.se');
          }
        } catch (uploadErr: any) {
          console.error('[Uguu Failed] Could not upload to primary host:', uploadErr.message);
          
          try {
            console.log('Falling back to catbox.moe...');
            const form2 = new FormData();
            form2.append('reqtype', 'fileupload');
            form2.append('fileToUpload', fs.createReadStream(videoPath));
            
            const catboxRes = await axios.post('https://catbox.moe/user/api.php', form2, {
              headers: { 
                ...form2.getHeaders(), 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' 
              },
              timeout: 60000
            });
            publicVideoUrl = catboxRes.data;
            console.log(`Public Video URL for Instagram (catbox.moe): ${publicVideoUrl}`);
          } catch (catboxErr: any) {
             console.error('[Catbox Failed] Could not upload to secondary host:', catboxErr.message);
             // Final Fallback to local proxy
             const protocol = req.headers['x-forwarded-proto'] || req.protocol;
             const host = req.headers['x-forwarded-host'] || req.headers.host;
             const appUrl = process.env.APP_URL?.replace(/\/$/, '') || `${protocol}://${host}`;
             publicVideoUrl = `${appUrl}/temp/${videoId}.mp4`;
             console.log(`Final Fallback Public Video URL: ${publicVideoUrl}`);
          }
        }

        console.log('[Step 3] Uploading to Instagram...');
        // Step A: Create Media Container
        let containerResponse;
        try {
          containerResponse = await axios.post(`https://graph.facebook.com/v19.0/${igAuth.igUserId}/media`, {
            video_url: publicVideoUrl,
            caption: caption || '',
            media_type: 'REELS',
            access_token: igAuth.accessToken
          });
        } catch (igError: any) {
          const msg = igError.response?.data?.error?.message || igError.message;
          console.error('[Step 3A Failed] Instagram container creation failed:', msg);
          throw new Error(`Instagram rejected the video link: ${msg}`);
        }

        const creationId = containerResponse.data.id;
        console.log(`[Step 3] Media container created: ${creationId}. Polling for status...`);

        // Step B: Wait for processing (polling)
        let status = 'IN_PROGRESS';
        let attempts = 0;
        let errorMessage = '';
        while (status === 'IN_PROGRESS' && attempts < 30) {
          await new Promise(r => setTimeout(() => r(null), 5000));
          const statusResponse = await axios.get(`https://graph.facebook.com/v19.0/${creationId}`, {
            params: {
              fields: 'status_code,status',
              access_token: igAuth.accessToken
            }
          });
          status = statusResponse.data.status_code;
          errorMessage = statusResponse.data.status || 'Unknown error';
          console.log(`Polling status: ${status} (Message: ${errorMessage})`);
          
          if (status === 'ERROR') {
            throw new Error(`Instagram failed to process the video. Reason: ${errorMessage}. This usually happens if the link is not universally publicly accessible or the file format is weird.`);
          }
          attempts++;
        }

        if (status !== 'FINISHED' && status !== 'PUBLISHED') {
          throw new Error('Processing timed out. Instagram is taking too long.');
        }

        // Step C: Publish
        const publishResponse = await axios.post(`https://graph.facebook.com/v19.0/${igAuth.igUserId}/media_publish`, {
          creation_id: creationId,
          access_token: igAuth.accessToken
        });
        
        console.log('[IG Success] Reel published directly to Instagram feed!');
        
        const mediaId = publishResponse.data.id;
        if (firstComment && mediaId) {
          console.log('[Step 3.5] Pinning First Comment to Instagram Reel...');
          try {
            await axios.post(`https://graph.facebook.com/v19.0/${mediaId}/comments`, {
              message: firstComment,
              access_token: igAuth.accessToken
            });
            console.log('[IG Success] Pinned First Comment to Instagram!');
          } catch (commentError: any) {
            console.error('[IG Failed] Failed to post comment to Instagram:', commentError.response?.data || commentError.message);
          }
        }
      }

      res.json({ success: true });

      setTimeout(() => {
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      }, 5 * 60 * 1000);

    } catch (error: any) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      console.error('Process Error:', errorMsg);
      res.status(500).json({ error: errorMsg });
    }
  });

  // Serve temp videos
  app.get('/temp/:id', (req, res) => {
    const videoPath = path.join(tempDir, req.params.id);
    if (fs.existsSync(videoPath)) {
      res.sendFile(videoPath);
    } else {
      res.status(404).send('Not found');
    }
  });

  // --- Cron Scheduler ---
  if (firebaseDb) {
    cron.schedule('* * * * *', async () => {
      // Run every minute
      console.log('[Cron] Checking for scheduled posts...');
      try {
        const now = Date.now();
        const queuedQuery = await firebaseDb!.collection('scheduled_posts')
          .where('status', '==', 'pending')
          .where('scheduledTime', '<=', now)
          .get();

        if (queuedQuery.empty) {
          return;
        }

        console.log(`[Cron] Found ${queuedQuery.size} scheduled post(s) ready to process!`);

        for (const doc of queuedQuery.docs) {
          const postData = doc.data();
          const docRef = doc.ref;

          console.log(`[Cron] Executing POST for queue item: ${doc.id}`);
          // Mark as processing
          await docRef.update({ status: 'processing' });

          try {
            // Internally call our own processing endpoint
            await axios.post(`http://localhost:${PORT}/api/process`, {
              videoUrl: postData.videoUrl,
              igAuth: postData.igAuth,
              ytAuth: postData.ytAuth,
              caption: postData.caption,
              firstComment: postData.firstComment,
              platforms: postData.platforms
            });

            await docRef.update({ status: 'success' });
            console.log(`[Cron] Item ${doc.id} COMPLETED.`);
          } catch (error: any) {
             const errorMsg = error.response?.data?.error || error.message || 'Unknown processing error';
             console.error(`[Cron] Item ${doc.id} FAILED:`, errorMsg);
             await docRef.update({ 
               status: 'error', 
               errorLog: errorMsg 
             });
          }
        }
      } catch (err: any) {
        console.error('[Cron] Failed query to find scheduled posts:', err.message);
      }
    });
    console.log('Background cron scheduler initialized!');
  }

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
