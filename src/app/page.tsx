"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type ClipInfo = {
  index: number;
  filename: string;
  captionedFilename: string;
  startTime: number;
  endTime: number;
  duration: number;
};

type JobStatus = {
  id: string;
  youtubeUrl: string;
  videoTitle: string | null;
  captionStyle: string;
  status: string;
  progress: number;
  progressMessage: string | null;
  errorMessage: string | null;
  clips: ClipInfo[] | null;
  queuePosition?: number;
  expiresAt?: string;
  expiresIn?: number;
  createdAt: string;
};

type ApiError = {
  error: string;
  details?: string;
  platform?: string;
  suggestion?: string;
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [captionStyle, setCaptionStyle] = useState<"oneword" | "monoline">("oneword");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollJob = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/jobs/${id}`);
      if (res.status === 410) {
        // Job expired
        setError({ error: "Job expired", details: "Clips are deleted after 1 hour. Please process a new video." });
        setJob(null);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch");
      const data: JobStatus = await res.json();
      setJob(data);
      if (data.status === "done" || data.status === "error") {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    } catch { /* retry */ }
  }, []);

  useEffect(() => {
    if (jobId) {
      pollJob(jobId);
      pollRef.current = setInterval(() => pollJob(jobId), 2000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [jobId, pollJob]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true); setError(null); setJob(null); setJobId(null);
    
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), captionStyle }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data as ApiError);
        return;
      }
      
      setJobId(data.jobId);
    } catch {
      setError({ error: "Connection failed", details: "Could not connect to server. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleNewVideo = () => {
    setUrl(""); setJobId(null); setJob(null); setError(null);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  
  const formatExpiry = (seconds: number) => {
    if (seconds > 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    if (seconds > 60) return `${Math.floor(seconds / 60)}m`;
    return `${seconds}s`;
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-fuchsia-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1.5s" }} />
      </div>

      {/* Header */}
      <header className="border-b border-purple-500/10 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center glow-btn">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold gradient-text">ClipGenius</h1>
          </div>
          {jobId && (
            <button onClick={handleNewVideo} className="text-sm text-purple-400 hover:text-purple-300 cursor-pointer px-4 py-2 rounded-lg border border-purple-500/30 hover:border-purple-500/50 hover:bg-purple-500/10 transition-all">
              + New Video
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 relative z-10">

        {/* HERO */}
        {!jobId && !error && (
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm mb-6 glow-border">
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              AI-Powered Clip Generator
            </div>
            <h2 className="text-4xl sm:text-6xl font-bold mb-4 leading-tight">
              <span className="gradient-text text-glow">Long Videos to</span><br />
              <span className="gradient-text text-glow">Viral Shorts</span>
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-8">
              Paste a YouTube link and get 3 perfectly cropped vertical clips
              with real captions from the audio. Ready for TikTok, Reels &amp; Shorts.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto mb-12">
              {[
                { icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>, title: "9:16 Vertical", desc: "Perfect vertical format at 1080x1920" },
                { icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>, title: "Real Captions", desc: "Actual words from video audio" },
                { icon: <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>, title: "Bold Fonts", desc: "Premium bold captions with glow" },
              ].map((f, i) => (
                <div key={i} className="card-glow bg-black/40 border border-purple-500/20 rounded-2xl p-5 backdrop-blur-sm hover:border-purple-500/40 transition-all duration-300">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto mb-3 text-purple-400">{f.icon}</div>
                  <h3 className="font-semibold text-white mb-1">{f.title}</h3>
                  <p className="text-sm text-gray-500">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ERROR DISPLAY */}
        {error && !jobId && (
          <div className="max-w-2xl mx-auto mb-8">
            <div className="bg-black/60 border border-red-500/30 rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-400 mb-1">{error.error}</h3>
                  {error.details && <p className="text-gray-400 text-sm mb-2">{error.details}</p>}
                  {error.platform && (
                    <p className="text-xs text-gray-500 mb-2">Platform: {error.platform}</p>
                  )}
                  {error.suggestion && (
                    <p className="text-sm text-purple-400">{error.suggestion}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setError(null)}
                className="mt-4 w-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 py-2 rounded-xl transition-colors cursor-pointer"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* URL INPUT */}
        {!jobId && (
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/30 via-fuchsia-500/30 to-purple-500/30 rounded-2xl blur-xl animate-pulse" />
              <div className="relative bg-black/60 border border-purple-500/30 rounded-2xl p-2 glow-border backdrop-blur-sm">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <input
                      type="text" value={url} onChange={(e) => setUrl(e.target.value)}
                      placeholder="Paste YouTube URL here..."
                      className="w-full bg-transparent text-white placeholder-gray-500 px-12 py-4 rounded-xl outline-none text-lg"
                      disabled={loading}
                    />
                  </div>
                  <button
                    type="submit" disabled={loading || !url.trim()}
                    className="bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-8 py-4 rounded-xl transition-all duration-200 glow-btn whitespace-nowrap cursor-pointer"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Starting...
                      </span>
                    ) : "Generate Clips"}
                  </button>
                </div>
              </div>
            </div>

            {/* Caption Style */}
            <div className="mt-6">
              <p className="text-sm text-gray-400 mb-3 text-center">Choose Caption Style</p>
              <div className="flex justify-center gap-4">
                <button
                  type="button" onClick={() => setCaptionStyle("oneword")}
                  className={`caption-style-option flex-1 max-w-[220px] p-5 rounded-xl border cursor-pointer transition-all duration-300 ${
                    captionStyle === "oneword"
                      ? "border-green-500/70 bg-green-500/10 shadow-[0_0_25px_rgba(34,197,94,0.25)]"
                      : "border-purple-500/20 bg-black/40 hover:border-green-500/30"
                  }`}
                >
                  <div className="text-center">
                    <div className="text-3xl font-black mb-2" style={{ color: "#22C55E", textShadow: "0 0 12px #22C55E, 0 0 24px #22C55E80" }}>HELLO</div>
                    <div className="text-xs font-medium text-white">One Word Style</div>
                    <div className="text-[11px] text-green-400">Green bold captions</div>
                  </div>
                </button>
                <button
                  type="button" onClick={() => setCaptionStyle("monoline")}
                  className={`caption-style-option flex-1 max-w-[220px] p-5 rounded-xl border cursor-pointer transition-all duration-300 ${
                    captionStyle === "monoline"
                      ? "border-white/40 bg-white/5 shadow-[0_0_25px_rgba(255,255,255,0.15)]"
                      : "border-purple-500/20 bg-black/40 hover:border-white/20"
                  }`}
                >
                  <div className="text-center">
                    <div className="bg-black/60 rounded-lg px-3 py-1.5 mb-2 inline-block">
                      <span className="text-sm font-bold" style={{ color: "#fff", textShadow: "0 0 8px #fff" }}>This is what he said</span>
                    </div>
                    <div className="text-xs font-medium text-white">Mono Line Style</div>
                    <div className="text-[11px] text-gray-400">White bold subtitles</div>
                  </div>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* PROCESSING */}
        {job && job.status !== "done" && job.status !== "error" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-black/60 border border-purple-500/30 rounded-2xl p-8 backdrop-blur-sm glow-border">
              {job.videoTitle && (
                <div className="mb-6">
                  <p className="text-sm text-purple-400 mb-1">Processing</p>
                  <p className="text-lg font-semibold text-white truncate">{job.videoTitle}</p>
                </div>
              )}

              {job.status === "queued" && job.queuePosition && (
                <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <p className="text-yellow-400 text-sm font-medium">Queue Position: #{job.queuePosition}</p>
                  <p className="text-yellow-400/70 text-xs">Your video will start processing soon</p>
                </div>
              )}

              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-400">{job.progressMessage || "Processing..."}</span>
                  <span className="text-sm font-mono text-purple-400">{job.progress}%</span>
                </div>
                <div className="h-3 bg-purple-500/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 rounded-full transition-all duration-700 ease-out progress-stripe" style={{ width: `${job.progress}%` }} />
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { key: "downloading", label: "Downloading video" },
                  { key: "processing", label: "Creating vertical clips" },
                  { key: "captioning", label: "Transcribing & adding captions" },
                ].map((step) => {
                  const order = ["pending","queued","downloading","processing","captioning","done"];
                  const cur = order.indexOf(job.status);
                  const idx = order.indexOf(step.key);
                  const active = job.status === step.key;
                  const done = cur > idx;
                  return (
                    <div key={step.key} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${active ? "bg-purple-500/20 border border-purple-500/40" : done ? "bg-green-500/10 border border-green-500/20" : "bg-black/20 border border-transparent"}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${active ? "bg-purple-500/30" : done ? "bg-green-500/30" : "bg-white/5"}`}>
                        {done ? (
                          <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        ) : active ? (
                          <svg className="w-4 h-4 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : <div className="w-2 h-2 rounded-full bg-gray-600" />}
                      </div>
                      <span className={`text-sm ${active ? "text-purple-300 font-medium" : done ? "text-green-400" : "text-gray-500"}`}>{step.label}</span>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-gray-600 mt-6 text-center">Processing time: 2-4 minutes depending on video length</p>
            </div>
          </div>
        )}

        {/* ERROR */}
        {job && job.status === "error" && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-black/60 border border-red-500/30 rounded-2xl p-8 text-center backdrop-blur-sm">
              <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Processing Failed</h3>
              <p className="text-gray-400 mb-4">{job.errorMessage || "An unexpected error occurred"}</p>
              <button onClick={handleNewVideo} className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-6 py-3 rounded-xl transition-colors cursor-pointer border border-purple-500/30">
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* RESULTS */}
        {job && job.status === "done" && job.clips && (
          <div>
            {/* Warning Banner */}
            <div className="max-w-5xl mx-auto mb-6">
              <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-amber-300 font-semibold">Download Now!</p>
                  <p className="text-amber-400/70 text-sm">
                    Clips expire {job.expiresIn ? `in ${formatExpiry(job.expiresIn)}` : "in 1 hour"}. 
                    Refreshing or leaving this page will lose your clips. Download them immediately.
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-sm mb-4">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                {job.clips.length} clips ready
              </div>
              {job.videoTitle && <h2 className="text-2xl font-bold gradient-text mb-2">{job.videoTitle}</h2>}
              <p className="text-gray-400">
                9:16 vertical with {job.captionStyle === "monoline" ? "mono-line white" : "one-word green"} bold captions
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {job.clips.map((clip) => (
                <div key={clip.index} className="card-glow bg-black/60 border border-purple-500/20 rounded-2xl overflow-hidden backdrop-blur-sm hover:border-purple-500/40 transition-all duration-300">
                  <div className="relative bg-black aspect-[9/16]">
                    <video className="w-full h-full object-contain" controls preload="metadata" playsInline>
                      <source src={`/api/clips/${job.id}/${clip.captionedFilename}`} type="video/mp4" />
                    </video>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-white">Clip {clip.index}</h3>
                      <span className="text-xs text-gray-500 bg-purple-500/10 px-2 py-1 rounded-lg">
                        {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs mb-4">
                      <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">9:16</span>
                      <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">{clip.duration}s</span>
                    </div>
                    <a
                      href={`/api/clips/${job.id}/${clip.captionedFilename}`}
                      download={`clip_${clip.index}_captioned.mp4`}
                      className="block w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white text-sm font-bold py-3 rounded-xl text-center transition-all cursor-pointer shadow-[0_0_20px_rgba(34,197,94,0.3)]"
                    >
                      Download Now
                    </a>
                    <a
                      href={`/api/clips/${job.id}/${clip.filename}`}
                      download={`clip_${clip.index}.mp4`}
                      className="block mt-2 text-center text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                    >
                      Without captions
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HOW IT WORKS */}
        {!jobId && !error && (
          <div className="max-w-4xl mx-auto mt-20">
            <h3 className="text-2xl font-bold text-center gradient-text mb-8">How it works</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
              {[
                { step: "1", title: "Paste Link", desc: "Any YouTube video URL" },
                { step: "2", title: "Choose Style", desc: "Green or white captions" },
                { step: "3", title: "AI Process", desc: "We create 3 vertical clips" },
                { step: "4", title: "Download", desc: "Save before they expire" },
              ].map((item) => (
                <div key={item.step} className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto mb-3 glow-btn">
                    <span className="text-lg font-bold text-purple-400">{item.step}</span>
                  </div>
                  <h4 className="font-semibold text-white mb-1">{item.title}</h4>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-purple-500/10 py-6 mt-auto relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-sm text-gray-600">
          Transform your long-form content into viral shorts
        </div>
      </footer>
    </div>
  );
}
