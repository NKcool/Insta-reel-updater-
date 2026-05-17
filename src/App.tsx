import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp, orderBy, limit, deleteDoc } from 'firebase/firestore';
import { db, loginWithFirebase } from './lib/firebase';
import { 
  Instagram, Download, Upload, Share2, CheckCircle2, 
  AlertCircle, Loader2, Settings, Smartphone, Info,
  Sparkles, CalendarClock, History, PlaySquare, Clock, Trash2, LogOut
} from 'lucide-react';

interface AuthData { accessToken: string; igUserId: string; }
interface YouTubeAuthData { access_token: string; refresh_token?: string; }
interface QueueItem { id: string; scheduledTime: number; createdAt: number; status: string; videoUrl: string; platforms: {ig: boolean, yt: boolean}; caption: string; firstComment?: string; errorLog?: string; igAuth?: AuthData; ytAuth?: YouTubeAuthData; }

export default function App() {
  const [userId, setUserId] = useState<string>('');
  const [sharedUrl, setSharedUrl] = useState<string>('');
  const [auth, setAuth] = useState<AuthData | null>(null);
  const [ytAuth, setYtAuth] = useState<YouTubeAuthData | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [aiStatus, setAiStatus] = useState<'idle' | 'loading'>('idle');
  const [caption, setCaption] = useState<string>('');
  const [firstComment, setFirstComment] = useState<string>('');
  const [timingSuggestion, setTimingSuggestion] = useState<string>('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<{ig: boolean; yt: boolean}>({ig: true, yt: true});
  const [activeTab, setActiveTab] = useState<'create' | 'queue' | 'discover'>('discover');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  
  // Discover State
  const [discoverTopic, setDiscoverTopic] = useState<string>('');
  const [trendingVideos, setTrendingVideos] = useState<any[]>([]);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  
  const getMinDate = () => {
    const now = new Date();
    // Round up to nearest 5 minutes
    const ms = 1000 * 60 * 5;
    const rounded = new Date(Math.ceil(now.getTime() / ms) * ms);
    return new Date(rounded.getTime() - (rounded.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
  };
  
  const [scheduleDateTime, setScheduleDateTime] = useState<string>(getMinDate());
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);

  const processAndExtractUrl = async (url: string) => {
    setSharedUrl(url);
    if (!url || !url.includes('http')) return;
    
    // Check if it's a mobile native share which is text + url
    const hasSpaces = url.includes(' ');
    const hasHashtags = url.includes('#');
    
    if (hasSpaces || hasHashtags) {
        const cleanText = url.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim();
        const extractedUrls = url.match(/(?:https?|ftp):\/\/[\n\S]+/g);
        if (cleanText.length > 5) {
            setCaption(cleanText);
            if (extractedUrls && extractedUrls[0]) {
              setSharedUrl(extractedUrls[0]);
            }
            addLog('Original caption successfully restored from Shared Text!');
            return;
        }
    }

    // Auto fetch web URL title metadata
    setAiStatus('loading');
    addLog('Extracting original caption from URL...');
    try {
      const gRes = await fetch('/api/extract-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: url })
      });
      const result = await gRes.json();
      if (result.caption && result.caption.trim().length > 0) {
         setCaption(result.caption);
         addLog('Caption successfully extracted!');
      } else {
         setCaption("Write your caption manually... (Platform blocked extraction)");
         addLog('Platform blocked text extraction. Please write manually.');
      }
    } catch(e) {
      setCaption("Write your caption manually...");
      addLog('Validation failed, please write manually.');
    } finally {
      setAiStatus('idle');
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('sharedUrl');
    if (url) processAndExtractUrl(url);

    const savedAuth = localStorage.getItem('insta_auth');
    if (savedAuth) setAuth(JSON.parse(savedAuth));
    
    const savedYtAuth = localStorage.getItem('yt_auth');
    if (savedYtAuth) {
      try {
        const parsed = JSON.parse(savedYtAuth);
        // Invalidate if token exists but lacks the new force-ssl scope needed for comments
        if (parsed.scope && !parsed.scope.includes('force-ssl')) {
          localStorage.removeItem('yt_auth');
          addLog('YouTube auth missing comment scopes. Please Connect YT again.');
        } else {
          setYtAuth(parsed);
        }
      } catch (e) {}
    }
    
    // Optional: Keep persistence of last logged in Firebase User ID
    const fbUid = localStorage.getItem('fb_uid');
    if(fbUid) setUserId(fbUid);

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'INSTAGRAM_AUTH_SUCCESS') {
        const newAuth = { accessToken: event.data.accessToken, igUserId: event.data.igUserId };
        setAuth(newAuth); localStorage.setItem('insta_auth', JSON.stringify(newAuth));
        addLog('Successfully logged in to Instagram!');
      } else if (event.data?.type === 'YOUTUBE_AUTH_SUCCESS') {
        setYtAuth(event.data.tokens); localStorage.setItem('yt_auth', JSON.stringify(event.data.tokens));
        addLog('Successfully logged in to YouTube!');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (userId) {
      fetchQueue();
      const interval = setInterval(fetchQueue, 15000); // Poll every 15s when on queue tab
      return () => { clearInterval(interval); };
    }
  }, [userId]);

  const fetchQueue = async () => {
    if (!userId || !localStorage.getItem('fb_uid')) return;
    try {
      const q = query(collection(db, "scheduled_posts"), where("userId", "==", userId));
      const querySnapshot = await getDocs(q);
      const postsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QueueItem));
      postsData.sort((a,b) => b.scheduledTime - a.scheduledTime);
      setQueue(postsData);
    } catch (e) {
      console.error('Failed to fetch queue', e);
      addLog('Failed to fetch queue: ' + (e as Error).message);
    }
  };

  const handleDeleteQueueItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, "scheduled_posts", id));
      addLog(`Queue item deleted from database.`);
      fetchQueue();
    } catch (error: any) {
      alert('Failed to delete item: ' + error.message);
      addLog('Failed to delete item from DB: ' + error.message);
    }
  };

  const QueueItemCard: React.FC<{ post: QueueItem }> = ({ post }) => (
    <div key={post.id} className="bg-zinc-900/60 backdrop-blur-xl hover:bg-zinc-900/80 transition-colors border border-white/5 rounded-[24px] p-5 flex flex-col gap-4 shadow-xl">
      <div className="flex justify-between items-start">
        <div className="flex gap-2 bg-zinc-950/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/5 shadow-inner">
          {post.platforms?.ig && <Instagram className="w-4 h-4 text-pink-400" />}
          {post.platforms?.yt && <PlaySquare className="w-4 h-4 text-red-400" />}
        </div>
        <div className="flex gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg font-mono ${
            post.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner shadow-emerald-900/20' :
            post.status === 'processing' ? 'bg-violet-500/10 text-violet-400 animate-pulse border border-violet-500/20 shadow-inner' :
            post.status === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20 shadow-inner' :
            'bg-zinc-800 text-zinc-400 border border-white/5 shadow-inner'
          }`}>
            {post.status}
          </span>
          <button 
            onClick={(e) => handleDeleteQueueItem(post.id, e)}
            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-2 py-1.5 rounded-lg transition-colors flex items-center justify-center"
            title="Delete Item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      <div className="bg-zinc-950/50 rounded-2xl p-4 border border-white/5">
        <p className="text-sm text-zinc-300 line-clamp-3 leading-relaxed">{post.caption}</p>
      </div>

      <div className="flex flex-col gap-2 pt-1 border-t border-white/5 mt-1 pt-3">
        <span className="text-[11px] text-zinc-500 font-medium font-mono uppercase tracking-widest flex items-center justify-between">
          <span>{post.status === 'success' ? 'Finished At' : post.status === 'error' ? 'Attempted At' : 'Scheduled'}</span>
          <span className="text-zinc-300 font-semibold">{new Date(post.scheduledTime || post.createdAt).toLocaleString()}</span>
        </span>
        {post.errorLog && (
          <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-[11px] font-mono text-red-300">
            <strong>ERR:</strong> {post.errorLog}
          </div>
        )}
      </div>
    </div>
  );

  const handleLogin = async () => {
    try {
      const res = await fetch('/api/auth/instagram/url');
      const { url } = await res.json();
      window.open(url, 'instagram_auth', 'width=600,height=700');
    } catch (err) { addLog('Failed to get IG login URL'); }
  };

  const handleYtLogin = async () => {
    try {
      const res = await fetch('/api/auth/youtube/url');
      const { url } = await res.json();
      window.open(url, 'youtube_auth', 'width=600,height=700');
    } catch (err) { addLog('Failed to get YT login URL'); }
  };

  const handleAction = async () => {
    if (!auth && selectedPlatforms.ig) return alert('Please login to Instagram first');
    if (!ytAuth && selectedPlatforms.yt) return alert('Please login to YouTube first');
    if (!selectedPlatforms.ig && !selectedPlatforms.yt) return alert('Select a platform');
    if (!sharedUrl) return alert('No URL to process');

    if (isScheduled) {
      if (!localStorage.getItem('fb_uid')) return alert('Please Connect Database before scheduling posts.');
      
      const targetTime = new Date(scheduleDateTime).getTime();
      if (isNaN(targetTime) || targetTime <= Date.now()) {
        return alert('Please select a valid future date and time for scheduling.');
      }

      setStatus('processing');
      try {
        await addDoc(collection(db, "scheduled_posts"), {
          userId,
          videoUrl: sharedUrl,
          caption,
          firstComment: firstComment || null,
          platforms: selectedPlatforms,
          status: 'pending',
          igAuth: auth || null,
          ytAuth: ytAuth || null,
          scheduledTime: targetTime,
          createdAt: Date.now()
        });
        
        setStatus('success');
        setIsScheduled(false);
        setSharedUrl('');
        fetchQueue();
        addLog(`Post scheduled successfully for ${new Date(targetTime).toLocaleString()}`);
        setTimeout(() => setStatus('idle'), 3000);
        setActiveTab('queue');
      } catch (err: any) {
        setStatus('error'); alert(err.message);
        addLog(`Schedule Post Error: ${err.message}`);
      }
    } else {
      // Post Now
      setStatus('processing');
      addLog('Starting direct process... Extracting & Uploading');
      try {
        const response = await fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl: sharedUrl, caption,
            firstComment: firstComment || null,
            platforms: selectedPlatforms,
            igAuth: auth, ytAuth
          })
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Processing failed');
        }
        
        // Save to history automatically
        if (userId && localStorage.getItem('fb_uid')) {
          await addDoc(collection(db, "scheduled_posts"), {
             userId,
             videoUrl: sharedUrl,
             caption,
             firstComment: firstComment || null,
             platforms: selectedPlatforms,
             status: 'success',
             igAuth: auth || null,
             ytAuth: ytAuth || null,
             scheduledTime: Date.now(),
             createdAt: Date.now()
          });
          fetchQueue();
        }

        setStatus('success');
        addLog(`Successfully uploaded to destinations!`);
        setSharedUrl('');
        setCaption('');
        setActiveTab('queue');
        setTimeout(() => setStatus('idle'), 5000);
      } catch (err: any) {
        if (userId && localStorage.getItem('fb_uid')) {
          await addDoc(collection(db, "scheduled_posts"), {
             userId,
             videoUrl: sharedUrl,
             caption,
             firstComment: firstComment || null,
             platforms: selectedPlatforms,
             status: 'error',
             errorLog: err.message,
             igAuth: auth || null,
             ytAuth: ytAuth || null,
             scheduledTime: Date.now(),
             createdAt: Date.now()
          });
          fetchQueue();
        }
        setStatus('error'); 
        alert(`Error: ${err.message}`);
        addLog(`Upload Error: ${err.message}`);
      }
    }
  };

  const handleFirebaseLogin = async () => {
    try {
      const user = await loginWithFirebase();
      setUserId(user.uid);
      localStorage.setItem('fb_uid', user.uid);
      addLog('Successfully connected App Database.');
    } catch (e: any) {
      addLog('Database Login Error: ' + e.message);
    }
  };

  const handleResetConnections = () => {
    // Clear React states
    setUserId('');
    setAuth(null);
    setYtAuth(null);
    setQueue([]);
    
    // Clear local storage
    localStorage.removeItem('fb_uid');
    localStorage.removeItem('insta_auth');
    localStorage.removeItem('yt_auth');
    
    addLog('Successfully disconnected all accounts and databases.');
  };

  const handleDiscoverAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discoverTopic.trim()) return;
    setIsDiscovering(true);
    setHasSearched(true);
    addLog(`Searching trending shorts for topic: ${discoverTopic}...`);
    try {
      const res = await fetch(`/api/trending?topic=${encodeURIComponent(discoverTopic)}`);
      if (!res.ok) throw new Error('API failed');
      const data = await res.json();
      setTrendingVideos(data.videos || []);
      addLog(`Found ${data.videos?.length || 0} trending videos!`);
    } catch (err) {
      addLog('Failed to fetch trending videos.');
    } finally {
      setIsDiscovering(false);
    }
  };

  const useTrendingVideo = (video: any) => {
    setSharedUrl(video.url);
    setCaption(`${video.title}\n\nVia ${video.author}`);
    setActiveTab('create');
    addLog(`Imported trending video: ${video.title}`);
  };

  return (
    <div className="min-h-screen relative font-sans text-white selection:bg-violet-500/30">
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10 bg-zinc-950">
        <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-violet-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-indigo-600/10 blur-[120px] rounded-full" />
      </div>

      <header className="px-6 py-4 border-b border-white/5 flex flex-col md:flex-row gap-4 sticky top-0 bg-zinc-950/70 backdrop-blur-2xl z-20">
        <div className="flex justify-between items-center w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Share2 className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">InstaRe<span className="text-violet-500">.</span></h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!userId ? (
              <button onClick={handleFirebaseLogin} className="bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-white/5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2">
                Connect DB
              </button>
            ) : <div className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium border border-violet-500/30 text-violet-300 bg-violet-500/10 flex items-center gap-2 tracking-wide" title="Firebase Datastore Linked" ><CheckCircle2 className="w-3 h-3"/> DB</div>}
            
            {!auth ? (
              <button onClick={handleLogin} className="bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-white/5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2">
                <Instagram className="w-3 h-3 opacity-70" /> Connect IG
              </button>
            ) : <div className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium border border-pink-500/30 text-pink-300 bg-pink-500/10 flex items-center gap-2 tracking-wide"><CheckCircle2 className="w-3 h-3"/> IG</div>}
            
            {!ytAuth ? (
              <button onClick={handleYtLogin} className="bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-white/5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2">
                <PlaySquare className="w-3 h-3 opacity-70" /> Connect YT
              </button>
            ) : <div className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium border border-red-500/30 text-red-300 bg-red-500/10 flex items-center gap-2 tracking-wide"><CheckCircle2 className="w-3 h-3"/> YT</div>}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 md:p-6 space-y-8 pb-24">
        {/* Navigation */}
        <div className="flex p-1 bg-zinc-900/50 backdrop-blur-md border border-white/5 rounded-2xl w-full max-w-lg mx-auto shadow-inner">
          <button 
            onClick={() => setActiveTab('discover')}
            className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all ${activeTab==='discover' ? 'bg-zinc-800 text-white shadow-sm border border-white/10' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Discover
          </button>
          <button 
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all ${activeTab==='create' ? 'bg-zinc-800 text-white shadow-sm border border-white/10' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Create Post
          </button>
          <button 
            onClick={() => setActiveTab('queue')}
            className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all ${activeTab==='queue' ? 'bg-zinc-800 text-white shadow-sm border border-white/10' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Queue & History
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'discover' ? (
             <motion.div key="discover" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}} className="space-y-6">
                <div className="bg-zinc-900/40 backdrop-blur-3xl border border-white/10 rounded-[32px] p-6 space-y-6 shadow-2xl">
                  <div className="flex flex-col gap-2">
                    <h2 className="text-xl font-bold">Discover Trending Shorts</h2>
                    <p className="text-sm text-zinc-400">Search for viral topics on YouTube Shorts to download and repurpose.</p>
                  </div>
                  
                  <form onSubmit={handleDiscoverAction} className="flex gap-2">
                    <input 
                      type="text" 
                      value={discoverTopic}
                      onChange={(e) => setDiscoverTopic(e.target.value)}
                      placeholder="e.g. funny cats, motivation, coding"
                      className="flex-1 bg-zinc-950/80 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 transition-all text-sm font-medium"
                    />
                    <button 
                      type="submit"
                      disabled={isDiscovering || !discoverTopic.trim()}
                      className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold px-6 rounded-2xl disabled:opacity-50 disabled:grayscale transition-all flex items-center justify-center min-w-[120px]"
                    >
                      {isDiscovering ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
                    </button>
                  </form>
                </div>
                
                {hasSearched && (
                  <div className="space-y-4">
                    {trendingVideos.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {trendingVideos.map((vid, idx) => (
                           <div key={idx} className="bg-zinc-900/60 backdrop-blur-xl hover:bg-zinc-900/80 transition-colors border border-white/5 rounded-[24px] overflow-hidden flex flex-col shadow-xl">
                             <div className="relative aspect-[9/16] w-full bg-zinc-950/50">
                               <img src={vid.thumbnail} alt={vid.title} className="absolute w-full h-full object-cover opacity-80" />
                               <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
                               
                               <div className="absolute top-3 left-3 bg-red-500 text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md shadow-lg flex items-center gap-1">
                                 <PlaySquare className="w-3 h-3" /> Shorts
                               </div>
                               
                               <div className="absolute bottom-4 left-4 right-4">
                                  <h3 className="font-semibold text-sm line-clamp-2 leading-tight drop-shadow-md mb-2 object-bottom">{vid.title}</h3>
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs text-zinc-300 font-mono flex items-center gap-1">
                                      {vid.views} views
                                    </div>
                                    <div className="text-xs text-zinc-400 truncate max-w-[100px] text-right font-medium">
                                      {vid.author}
                                    </div>
                                  </div>
                               </div>
                             </div>
                             <div className="p-3">
                               <button 
                                 onClick={() => useTrendingVideo(vid)}
                                 className="w-full bg-white/10 hover:bg-white/20 border border-white/5 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 text-white"
                               >
                                 <Download className="w-4 h-4" /> Use this Video
                               </button>
                             </div>
                           </div>
                        ))}
                      </div>
                    ) : (
                      !isDiscovering && (
                         <div className="bg-zinc-900/40 backdrop-blur-md border border-white/5 rounded-3xl p-8 text-center text-zinc-500 shadow-inner font-mono text-sm mt-4">
                           No trending shorts found for this topic.
                         </div>
                      )
                    )}
                  </div>
                )}
             </motion.div>
          ) : activeTab === 'create' ? (
            <motion.div key="create" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}} className="space-y-6">
              
              <div className="bg-zinc-900/40 backdrop-blur-3xl border border-white/10 rounded-[32px] p-6 space-y-6 shadow-2xl">
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest pl-1">Video Source</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={sharedUrl}
                      onChange={(e) => setSharedUrl(e.target.value)}
                      placeholder="Paste Instagram Reel URL..."
                      className="w-full bg-zinc-950/80 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 transition-all text-sm font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-end pl-1 flex-wrap gap-2">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Caption & Tags</label>
                    <button 
                      onClick={() => processAndExtractUrl(sharedUrl)}
                      disabled={aiStatus === 'loading' || !sharedUrl}
                      className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/20 px-4 py-2 rounded-xl transition-all disabled:opacity-50 disabled:grayscale"
                    >
                      {aiStatus === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Extract Original Caption
                    </button>
                  </div>
                  <textarea 
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Engaging caption..."
                    className="w-full bg-zinc-950/80 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 transition-all text-sm min-h-[160px] resize-none leading-relaxed"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest pl-1">Pinned First Comment</label>
                  <textarea 
                    value={firstComment}
                    onChange={(e) => setFirstComment(e.target.value)}
                    placeholder="Leave a thought-provoking comment to pin..."
                    className="w-full bg-zinc-950/80 border border-indigo-500/20 rounded-2xl px-5 py-3 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm min-h-[60px] resize-none"
                  />
                  <p className="text-[11px] font-mono text-zinc-500 px-1">Pinning a comment drives early engagement.</p>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest pl-1">Target Platforms</label>
                  <div className="grid grid-cols-2 gap-4">
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedPlatforms(p => ({...p, ig: !p.ig}))}
                      className={`relative py-6 rounded-[20px] border overflow-hidden flex flex-col items-center justify-center gap-3 transition-colors duration-300 font-semibold ${
                        selectedPlatforms.ig 
                          ? 'bg-zinc-900/50 border-pink-500/50 text-pink-100 shadow-[0_0_25px_rgba(236,72,153,0.15)] shadow-inner' 
                          : 'bg-zinc-950/50 border-white/5 text-zinc-500 hover:border-white/10 hover:text-zinc-300'
                      }`}
                    >
                      <AnimatePresence>
                        {selectedPlatforms.ig && (
                          <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }} 
                            className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-purple-500/10 pointer-events-none"
                          />
                        )}
                      </AnimatePresence>
                      <div className="relative z-10 flex flex-col items-center gap-2">
                        <div className={`p-3 rounded-full transition-colors duration-300 ${selectedPlatforms.ig ? 'bg-pink-500/20 text-pink-400' : 'bg-zinc-800 text-zinc-400'}`}>
                          <Instagram className="w-6 h-6" />
                        </div>
                        <span className="tracking-wide text-sm">Instagram</span>
                      </div>
                      <AnimatePresence>
                        {selectedPlatforms.ig && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute top-3 right-3 text-pink-400 drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]">
                            <CheckCircle2 className="w-5 h-5" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>

                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedPlatforms(p => ({...p, yt: !p.yt}))}
                      className={`relative py-6 rounded-[20px] border overflow-hidden flex flex-col items-center justify-center gap-3 transition-colors duration-300 font-semibold ${
                        selectedPlatforms.yt 
                          ? 'bg-zinc-900/50 border-red-500/50 text-red-100 shadow-[0_0_25px_rgba(239,68,68,0.15)] shadow-inner' 
                          : 'bg-zinc-950/50 border-white/5 text-zinc-500 hover:border-white/10 hover:text-zinc-300'
                      }`}
                    >
                      <AnimatePresence>
                        {selectedPlatforms.yt && (
                          <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }} 
                            className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-orange-500/10 pointer-events-none"
                          />
                        )}
                      </AnimatePresence>
                      <div className="relative z-10 flex flex-col items-center gap-2">
                        <div className={`p-3 rounded-full transition-colors duration-300 ${selectedPlatforms.yt ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-400'}`}>
                          <PlaySquare className="w-6 h-6" />
                        </div>
                        <span className="tracking-wide text-sm">YT Shorts</span>
                      </div>
                      <AnimatePresence>
                        {selectedPlatforms.yt && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute top-3 right-3 text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
                            <CheckCircle2 className="w-5 h-5" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5 space-y-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-2 bg-zinc-950/80 border border-white/5 rounded-2xl p-4 shadow-inner">
                      <div className="flex items-center justify-between">
                         <span className="text-sm font-medium text-zinc-300 flex items-center gap-2 font-mono"><Clock className="w-4 h-4 text-violet-400"/> Timing</span>
                         <select 
                           value={isScheduled ? 'later' : 'now'}
                           onChange={(e) => setIsScheduled(e.target.value === 'later')}
                           className="bg-zinc-800 border-none text-white font-medium text-sm rounded-xl px-4 py-2 focus:ring-0 cursor-pointer outline-none hover:bg-zinc-700 transition-colors"
                         >
                           <option value="now">Post Immediately</option>
                           <option value="later">Schedule for Later...</option>
                         </select>
                      </div>

                      <AnimatePresence>
                         {isScheduled && (
                           <motion.div 
                             initial={{ opacity: 0, height: 0 }}
                             animate={{ opacity: 1, height: 'auto' }}
                             exit={{ opacity: 0, height: 0 }}
                             className="overflow-hidden mt-2 pt-2 border-t border-white/5"
                           >
                             <div className="flex flex-col gap-1.5">
                               <label className="text-xs text-zinc-500 font-mono tracking-wide">Select Date & Time</label>
                               <input 
                                 type="datetime-local" 
                                 value={scheduleDateTime}
                                 min={getMinDate()}
                                 onChange={(e) => setScheduleDateTime(e.target.value)}
                                 className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50 w-full font-sans cursor-text dark:[color-scheme:dark]"
                               />
                             </div>
                           </motion.div>
                         )}
                      </AnimatePresence>
                    </div>
                    <AnimatePresence>
                      {timingSuggestion && isScheduled && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10, height: 0 }} 
                          animate={{ opacity: 1, y: 0, height: 'auto' }} 
                          exit={{ opacity: 0, y: -10, height: 0 }}
                          className="bg-gradient-to-r from-violet-500/10 to-indigo-500/5 border border-violet-500/20 rounded-xl p-3 flex gap-3 items-start mt-1 overflow-hidden"
                        >
                          <Info className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-violet-200/80 leading-relaxed font-mono">{timingSuggestion}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <motion.button 
                    whileHover={status !== 'processing' && sharedUrl && (selectedPlatforms.ig || selectedPlatforms.yt) ? { scale: 1.02 } : {}}
                    whileTap={status !== 'processing' && sharedUrl && (selectedPlatforms.ig || selectedPlatforms.yt) ? { scale: 0.98 } : {}}
                    onClick={handleAction}
                    disabled={status === 'processing' || !sharedUrl || (!selectedPlatforms.ig && !selectedPlatforms.yt)}
                    className={`relative w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all group overflow-hidden mt-2 ${
                      status === 'processing' 
                        ? 'bg-zinc-900 text-zinc-500 cursor-not-allowed border border-white/5' 
                        : isScheduled 
                          ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_0_30px_rgba(139,92,246,0.3)] border border-violet-500/50'
                          : 'bg-zinc-100 text-black shadow-xl shadow-white/10 hover:bg-white'
                    }`}
                  >
                    {/* Glossy Overlay inside the button for schedule mode */}
                    {isScheduled && status !== 'processing' && (
                       <div className="absolute inset-0 bg-white/20 translate-y-[-100%] group-hover:translate-y-[100%] transition-transform duration-700 ease-in-out" />
                    )}
                    
                    {status === 'processing' ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</> : 
                     status === 'success' ? <><CheckCircle2 className="w-5 h-5" /> Done!</> :
                     isScheduled ? <><CalendarClock className="w-5 h-5" /> Queue Post</> : 
                     <><Upload className="w-5 h-5" /> Post Now</>}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="queue" initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} exit={{opacity:0, y:-10}} className="space-y-8 pb-10">
              
              {/* --- Pending Queue Section --- */}
              <div className="space-y-4">
                <div className="flex justify-between items-center px-4 pt-2">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Clock className="w-5 h-5 text-violet-400"/> Pending Queue
                  </h2>
                  <button onClick={fetchQueue} className="text-xs font-semibold text-violet-300 bg-violet-400/10 hover:bg-violet-400/20 px-4 py-1.5 rounded-full transition-colors font-mono tracking-wide">
                    Refresh
                  </button>
                </div>

                {queue.filter(q => q.status === 'pending' || q.status === 'processing').length === 0 ? (
                  <div className="bg-zinc-900/40 backdrop-blur-md border border-white/5 rounded-3xl p-8 text-center text-zinc-500 shadow-inner font-mono text-sm">
                    No scheduled posts.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {queue.filter(q => q.status === 'pending' || q.status === 'processing').map(post => (
                      <QueueItemCard key={post.id} post={post} />
                    ))}
                  </div>
                )}
              </div>

              {/* --- History Section --- */}
              <div className="space-y-4 pt-6 border-t border-white/5">
                <div className="flex justify-between items-center px-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <History className="w-5 h-5 text-zinc-400"/> Upload History
                  </h2>
                </div>

                {queue.filter(q => q.status === 'success' || q.status === 'error').length === 0 ? (
                  <div className="bg-zinc-900/40 backdrop-blur-md border border-white/5 rounded-3xl p-8 text-center text-zinc-500 shadow-inner font-mono text-sm">
                    No past uploads.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[540px] overflow-y-auto pr-2">
                    {queue.filter(q => q.status === 'success' || q.status === 'error').map(post => (
                      <QueueItemCard key={post.id} post={post} />
                    ))}
                  </div>
                )}
              </div>

            </motion.div>
          )}
        </AnimatePresence>

        {/* Log Section */}
        <section className="space-y-4 pt-12">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">System Event Hub</h3>
            <button onClick={() => setLog([])} className="text-[10px] uppercase tracking-widest font-mono text-zinc-600 hover:text-zinc-300 transition-colors">Clear Stream</button>
          </div>
          <div className="bg-zinc-950/80 backdrop-blur-md border border-white/5 rounded-3xl p-5 h-48 overflow-y-auto font-mono text-[11px] space-y-2 scrollbar-hide shadow-inner mx-auto">
            {log.length === 0 ? (
              <p className="text-zinc-600 text-center mt-12 animate-pulse">Awaiting standard input...</p>
            ) : (
              log.map((entry, i) => (
                <div key={i} className="text-zinc-400 border-l-2 border-violet-500/50 pl-3 py-0.5 leading-relaxed">
                  {entry}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Footer Controls */}
        {(userId || auth || ytAuth) && (
          <div className="pt-12 pb-6 flex justify-center">
            <button 
              onClick={handleResetConnections}
              className="bg-zinc-900/80 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 border border-white/5 hover:border-red-500/20 px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2.5 shadow-sm active:scale-95"
            >
              <LogOut className="w-4 h-4" /> Disconnect All Accounts
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
