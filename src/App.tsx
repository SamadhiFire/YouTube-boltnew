import { useState, useEffect, useCallback } from 'react';
import {
  Youtube,
  Play,
  RefreshCw,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  Calendar,
  Link as LinkIcon,
  Settings,
  Activity,
  FolderOpen,
  Loader2,
} from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const MEDIA_API_TOKEN = import.meta.env.VITE_MEDIA_API_TOKEN || 'my-secret-token';

interface Job {
  id: string;
  job_type: 'media-extract' | 'daily-collect';
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  created_at: string;
  started_at?: string;
  completed_at?: string;
  request_data: {
    url?: string;
    video_id?: string;
    date?: string;
    window_start?: string;
    window_end?: string;
  };
  result_data?: {
    video_id?: string;
    transcript_source?: string;
    text_chars?: number;
    coverage_ratio?: number;
    daily_items?: any[];
    manifest?: any;
  };
  error_type?: string;
  error_message?: string;
}

type TabType = 'single' | 'daily' | 'jobs' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('single');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Single video form
  const [singleUrl, setSingleUrl] = useState('');
  const [singleLanguage, setSingleLanguage] = useState('zh');

  // Daily collection form
  const [dailyDate, setDailyDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [windowStart, setWindowStart] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(6, 0, 0, 0);
    return yesterday.toISOString();
  });
  const [windowEnd, setWindowEnd] = useState(() => {
    const today = new Date();
    today.setHours(6, 0, 0, 0);
    return today.toISOString();
  });
  const [requireTranscripts, setRequireTranscripts] = useState(true);
  const [allowAsr, setAllowAsr] = useState(true);

  // Settings
  const [mediaToken, setMediaToken] = useState(MEDIA_API_TOKEN);

  const fetchJobs = useCallback(async () => {
    setRefreshing(true);
    try {
      const dbResponse = await fetch(`${SUPABASE_URL}/rest/v1/jobs?select=*&order=created_at.desc&limit=20`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      if (dbResponse.ok) {
        const data = await dbResponse.json();
        setJobs(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const createSingleJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleUrl.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/youtube-processor/media-extract`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mediaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: singleUrl,
          language: singleLanguage,
        }),
      });

      const data = await response.json();
      if (data.job_id) {
        setSingleUrl('');
        fetchJobs();
        setActiveTab('jobs');
      } else {
        alert(`Error: ${data.message || data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Failed to create job: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const createDailyJob = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/daily-collector/daily-collect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mediaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: dailyDate,
          window_start: windowStart,
          window_end: windowEnd,
          sources_profile: 'youtube-default',
          require_transcripts: requireTranscripts,
          allow_asr: allowAsr,
        }),
      });

      const data = await response.json();
      if (data.job_id) {
        fetchJobs();
        setActiveTab('jobs');
      } else {
        alert(`Error: ${data.message || data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Failed to create job: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: Job['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'queued':
        return <Clock className="w-5 h-5 text-amber-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: Job['status']) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'running':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'queued':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-red-600 rounded-lg p-2">
                <Youtube className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">YouTube Transcript Service</h1>
                <p className="text-xs text-slate-500">
                  {SUPABASE_URL ? 'Connected' : 'Not configured'}
                </p>
              </div>
            </div>
            <button
              onClick={fetchJobs}
              disabled={refreshing}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {[
              { id: 'single' as TabType, label: 'Single Video', icon: Play },
              { id: 'daily' as TabType, label: 'Daily Collection', icon: Calendar },
              { id: 'jobs' as TabType, label: 'Jobs', icon: Activity },
              { id: 'settings' as TabType, label: 'Settings', icon: Settings },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-red-600'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600" />
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Single Video Tab */}
        {activeTab === 'single' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Extract Single Video Transcript</h2>
              <p className="text-sm text-slate-500 mt-1">
                Enter a YouTube URL to extract the transcript with quality metrics.
              </p>
            </div>
            <form onSubmit={createSingleJob} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  YouTube URL
                </label>
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="url"
                    value={singleUrl}
                    onChange={(e) => setSingleUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Language
                </label>
                <select
                  value={singleLanguage}
                  onChange={(e) => setSingleLanguage(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-shadow"
                >
                  <option value="zh">Chinese (zh)</option>
                  <option value="en">English (en)</option>
                  <option value="ja">Japanese (ja)</option>
                  <option value="ko">Korean (ko)</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Extract Transcript
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Daily Collection Tab */}
        {activeTab === 'daily' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Daily Collection Job</h2>
              <p className="text-sm text-slate-500 mt-1">
                Collect transcripts from all new videos in configured sources within a time window.
              </p>
            </div>
            <form onSubmit={createDailyJob} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Date
                  </label>
                  <input
                    type="date"
                    value={dailyDate}
                    onChange={(e) => setDailyDate(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Time Window
                  </label>
                  <div className="space-y-2">
                    <input
                      type="datetime-local"
                      value={windowStart.slice(0, 16)}
                      onChange={(e) => setWindowStart(new Date(e.target.value).toISOString())}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-sm"
                    />
                    <input
                      type="datetime-local"
                      value={windowEnd.slice(0, 16)}
                      onChange={(e) => setWindowEnd(new Date(e.target.value).toISOString())}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireTranscripts}
                    onChange={(e) => setRequireTranscripts(e.target.checked)}
                    className="w-4 h-4 text-red-600 border-slate-300 rounded focus:ring-red-500"
                  />
                  <span className="text-sm text-slate-700">Require Transcripts</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowAsr}
                    onChange={(e) => setAllowAsr(e.target.checked)}
                    className="w-4 h-4 text-red-600 border-slate-300 rounded focus:ring-red-500"
                  />
                  <span className="text-sm text-slate-700">Allow ASR</span>
                </label>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Calendar className="w-5 h-5" />
                    Start Daily Collection
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Jobs Tab */}
        {activeTab === 'jobs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Recent Jobs</h2>
              <button
                onClick={fetchJobs}
                disabled={refreshing}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            {jobs.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No jobs yet. Create one to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {getStatusIcon(job.status)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-slate-600">{job.id}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(job.status)}`}>
                              {job.status}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 mt-1">
                            {job.job_type === 'media-extract'
                              ? job.request_data.url || `Video: ${job.request_data.video_id}`
                              : `Daily: ${job.request_data.date}`}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {formatDate(job.created_at)}
                          </p>
                        </div>
                      </div>
                      {job.status === 'success' && job.result_data && (
                        <div className="flex gap-2">
                          {job.job_type === 'media-extract' && (
                            <>
                              <a
                                href={`${SUPABASE_URL}/functions/v1/youtube-processor/media-extract/${job.id}/files/transcript.txt`}
                                className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                              >
                                <Download className="w-4 h-4" />
                                TXT
                              </a>
                              <a
                                href={`${SUPABASE_URL}/functions/v1/youtube-processor/media-extract/${job.id}/files/transcript.vtt`}
                                className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                              >
                                <FileText className="w-4 h-4" />
                                VTT
                              </a>
                            </>
                          )}
                          {job.job_type === 'daily-collect' && (
                            <>
                              <a
                                href={`${SUPABASE_URL}/functions/v1/daily-collector/daily-collect/${job.id}/files/daily_items.json`}
                                className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                              >
                                <Download className="w-4 h-4" />
                                Items
                              </a>
                              <a
                                href={`${SUPABASE_URL}/functions/v1/daily-collector/daily-collect/${job.id}/files/manifest.json`}
                                className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
                              >
                                <FileText className="w-4 h-4" />
                                Manifest
                              </a>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {job.error_message && (
                      <div className="mt-3 p-2 bg-red-50 text-red-700 text-sm rounded-lg">
                        {job.error_message}
                      </div>
                    )}
                    {job.status === 'success' && job.result_data && (
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                        {job.result_data.coverage_ratio !== undefined && (
                          <span>Coverage: {(job.result_data.coverage_ratio * 100).toFixed(1)}%</span>
                        )}
                        {job.result_data.text_chars !== undefined && (
                          <span>{job.result_data.text_chars.toLocaleString()} chars</span>
                        )}
                        {job.result_data.transcript_source && (
                          <span className="capitalize">{job.result_data.transcript_source.replace('_', ' ')}</span>
                        )}
                        {job.result_data.daily_items && (
                          <span>{job.result_data.daily_items.length} videos</span>
                        )}
                        {job.result_data.manifest?.coverage_ratio !== undefined && (
                          <span>Coverage: {(job.result_data.manifest.coverage_ratio * 100).toFixed(1)}%</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">API Configuration</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Configure your API tokens and keys.
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Media API Token
                  </label>
                  <input
                    type="password"
                    value={mediaToken}
                    onChange={(e) => setMediaToken(e.target.value)}
                    placeholder="Enter your API token"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  />
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <h3 className="text-sm font-medium text-slate-700 mb-2">Environment Status</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Supabase URL</span>
                      <span className={`text-sm ${SUPABASE_URL ? 'text-green-600' : 'text-red-600'}`}>
                        {SUPABASE_URL ? 'Configured' : 'Not set'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Supabase Anon Key</span>
                      <span className={`text-sm ${SUPABASE_ANON_KEY ? 'text-green-600' : 'text-red-600'}`}>
                        {SUPABASE_ANON_KEY ? 'Configured' : 'Not set'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">GitHub Action Integration</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Use these endpoints for automated workflows.
                </p>
              </div>
              <div className="p-6 space-y-4 text-sm">
                <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono overflow-x-auto">
                  <p className="text-slate-400 mb-2"># Daily collection via curl:</p>
                  <pre>{`curl -X POST \\
  "${SUPABASE_URL}/functions/v1/daily-collector/daily-collect" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"date":"2026-07-02","window_start":"2026-07-01T06:00:00Z","window_end":"2026-07-02T06:00:00Z"}'`}</pre>
                </div>
                <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono overflow-x-auto">
                  <p className="text-slate-400 mb-2"># Check job status:</p>
                  <pre>{`curl -H "Authorization: Bearer YOUR_TOKEN" \\
  "${SUPABASE_URL}/functions/v1/daily-collector/daily-collect/JOB_ID"`}</pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-sm text-slate-500 text-center">
            YouTube Transcript Service - Deployed on Bolt.new
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
