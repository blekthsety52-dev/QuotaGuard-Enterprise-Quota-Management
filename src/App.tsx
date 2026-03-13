import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie
} from 'recharts';
import { 
  Shield, AlertTriangle, CheckCircle, Activity, 
  History, Zap, LogOut, User as UserIcon,
  ArrowUpRight, RefreshCw, Plus
} from 'lucide-react';
import { auth, db } from './firebase';
import { 
  signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User 
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { v4 as uuidv4 } from 'uuid';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("bg-white rounded-2xl border border-black/5 shadow-sm p-6", className)}>
    {children}
  </div>
);

const Button = ({ 
  children, onClick, variant = 'primary', className, disabled, icon: Icon 
}: { 
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'danger'; 
  className?: string; disabled?: boolean; icon?: any 
}) => {
  const variants = {
    primary: "bg-black text-white hover:bg-black/90",
    secondary: "bg-white text-black border border-black/10 hover:bg-black/5",
    danger: "bg-red-500 text-white hover:bg-red-600",
  };

  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        className
      )}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [quotaData, setQuotaData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isConsuming, setIsConsuming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Ensure user profile exists
        const userRef = doc(db, 'users', u.uid);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
          await setDoc(userRef, {
            uid: u.uid,
            email: u.email,
            planId: 'free',
            role: 'user',
            createdAt: new Date().toISOString()
          });
        }
        fetchDashboard(u.uid);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const fetchDashboard = async (uid: string) => {
    try {
      const res = await fetch(`/api/quota/dashboard/${uid}`);
      const data = await res.json();
      setQuotaData(data.quota);
      setHistory(data.history);
    } catch (err) {
      console.error("Dashboard fetch failed", err);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      console.error("Login failed", err);
    }
  };

  const handleLogout = () => signOut(auth);

  const consumeQuota = async (amount: number) => {
    if (!user) return;
    setIsConsuming(true);
    setError(null);
    const requestId = uuidv4();

    try {
      const res = await fetch('/api/quota/deduct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          operationType: 'API_CALL',
          amount,
          requestId
        })
      });

      const data = await res.json();
      if (res.ok) {
        fetchDashboard(user.uid);
      } else {
        setError(data.error || 'Failed to consume quota');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setIsConsuming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <RefreshCw className="text-black/20" size={40} />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f5] p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="w-20 h-20 bg-black rounded-3xl flex items-center justify-center mx-auto shadow-xl">
            <Shield className="text-white" size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">QuotaGuard</h1>
            <p className="text-black/50">Enterprise-grade quota management and usage tracking system.</p>
          </div>
          <Button onClick={handleLogin} className="w-full py-4 text-lg" icon={UserIcon}>
            Sign in with Google
          </Button>
        </motion.div>
      </div>
    );
  }

  const consumed = quotaData?.consumed || 0;
  const limit = quotaData?.limit || 1000;
  const percentage = Math.min((consumed / limit) * 100, 100);
  const isSoftLimit = percentage >= 90;
  const isHardLimit = percentage >= 100;

  const chartData = [
    { name: 'Used', value: consumed, color: isHardLimit ? '#ef4444' : isSoftLimit ? '#f59e0b' : '#10b981' },
    { name: 'Remaining', value: Math.max(limit - consumed, 0), color: '#f3f4f6' }
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-black font-sans">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <Shield className="text-white" size={18} />
            </div>
            <span className="font-bold text-xl tracking-tight">QuotaGuard</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{user.displayName}</p>
              <p className="text-xs text-black/40">{user.email}</p>
            </div>
            <Button variant="secondary" onClick={handleLogout} icon={LogOut}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Alerts */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3 text-red-600"
            >
              <AlertTriangle size={20} />
              <p className="font-medium">{error === 'QUOTA_EXHAUSTED' ? 'Usage limit reached. Please upgrade your plan.' : error}</p>
            </motion.div>
          )}
          {isSoftLimit && !isHardLimit && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3 text-amber-700"
            >
              <AlertTriangle size={20} />
              <p className="font-medium">You have reached 90% of your quota. Consider upgrading soon.</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Stats */}
          <div className="lg:col-span-2 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-black/40 uppercase tracking-wider">Current Usage</h3>
                  <Activity size={18} className="text-black/20" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">{consumed.toLocaleString()}</span>
                  <span className="text-black/30 font-medium">/ {limit.toLocaleString()} units</span>
                </div>
                <div className="mt-6 h-2 bg-black/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    className={cn(
                      "h-full transition-colors duration-500",
                      isHardLimit ? "bg-red-500" : isSoftLimit ? "bg-amber-500" : "bg-emerald-500"
                    )}
                  />
                </div>
              </Card>

              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-black/40 uppercase tracking-wider">Plan Status</h3>
                  <Zap size={18} className="text-black/20" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                    <CheckCircle size={24} />
                  </div>
                  <div>
                    <p className="font-bold text-lg">Free Tier</p>
                    <p className="text-sm text-black/40">Renews in 18 days</p>
                  </div>
                </div>
                <Button variant="secondary" className="w-full mt-6" icon={ArrowUpRight}>
                  Upgrade Plan
                </Button>
              </Card>
            </div>

            <Card className="h-[400px]">
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-bold text-lg">Usage Distribution</h3>
                <div className="flex gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-black/40">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" /> API Calls
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={history.slice(0, 7).reverse()}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(val) => new Date(val?._seconds * 1000 || val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#999' }}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#999' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="amount" fill="#000" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Right Column: Actions & History */}
          <div className="space-y-8">
            <Card>
              <h3 className="font-bold text-lg mb-6">Test Quota</h3>
              <div className="space-y-4">
                <p className="text-sm text-black/50">Simulate API operations to test limits and atomic counters.</p>
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    onClick={() => consumeQuota(50)} 
                    disabled={isConsuming || isHardLimit}
                    className="w-full"
                  >
                    +50 Units
                  </Button>
                  <Button 
                    onClick={() => consumeQuota(200)} 
                    disabled={isConsuming || isHardLimit}
                    className="w-full"
                  >
                    +200 Units
                  </Button>
                </div>
                <Button 
                  variant="secondary" 
                  onClick={() => consumeQuota(500)} 
                  disabled={isConsuming || isHardLimit}
                  className="w-full"
                  icon={Plus}
                >
                  Heavy Load (+500)
                </Button>
              </div>
            </Card>

            <Card className="flex-1">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-lg">Recent Activity</h3>
                <History size={18} className="text-black/20" />
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {history.length === 0 ? (
                  <p className="text-center py-8 text-black/30 text-sm">No recent activity</p>
                ) : (
                  history.map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-black/5 last:border-0">
                      <div>
                        <p className="text-sm font-semibold">{item.operationType}</p>
                        <p className="text-xs text-black/40">
                          {new Date(item.timestamp?._seconds * 1000 || item.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-bold text-emerald-600">-{item.amount}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
