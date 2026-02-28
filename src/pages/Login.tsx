import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Loader2, ArrowRight, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

export function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Fix #5: Forgot password state
    const [showForgotPwd, setShowForgotPwd] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotStatus, setForgotStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
    const [forgotMsg, setForgotMsg] = useState('');

    const { signIn, signInWithGoogle } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = location.state?.from?.pathname || '/';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        const { error } = await signIn(email, password);
        if (error) {
            setError(error.message.includes('Invalid') ? 'Invalid email or password. Please try again.' : error.message);
            setIsLoading(false);
        } else {
            navigate(from, { replace: true });
        }
    };

    // Fix #5: Forgot password handler
    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!forgotEmail) return;
        setForgotStatus('loading');
        const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
            redirectTo: `${window.location.origin}/auth/callback`,
        });
        if (error) {
            setForgotStatus('error');
            setForgotMsg(error.message);
        } else {
            setForgotStatus('sent');
            setForgotMsg(`A password reset link has been sent to ${forgotEmail}.`);
        }
    };

    return (
        // Improvement #11: Premium split-screen layout
        <div className="min-h-screen bg-catalog-bg flex">
            {/* Left — Brand panel (hidden on mobile) */}
            <div className="hidden lg:flex flex-col justify-between w-1/2 bg-catalog-text relative overflow-hidden p-12">
                <div className="absolute inset-0">
                    <img
                        src="https://images.unsplash.com/photo-1511895426328-dc8714191300?q=80&w=2400&auto=format&fit=crop"
                        alt="Family"
                        className="w-full h-full object-cover opacity-30"
                    />
                    <div className="absolute inset-0 bg-gradient-to-br from-catalog-text via-catalog-text/80 to-catalog-accent/60" />
                </div>

                <div className="relative">
                    <h1 className="text-3xl font-outfit font-black text-white tracking-tight">
                        <span className="text-rainbow">Zoabi</span>
                        <span className="font-light text-white/70"> Family</span>
                    </h1>
                </div>

                <div className="relative space-y-6">
                    <blockquote className="text-3xl md:text-4xl font-serif italic text-white/90 leading-snug">
                        "Every family has a story worth preserving."
                    </blockquote>
                    <p className="text-white/50 text-sm font-medium tracking-wide">
                        Your private archive. Your legacy. Your chronicle.
                    </p>

                    <div className="flex gap-3 pt-4">
                        {[
                            { n: '100+', label: 'Memories' },
                            { n: '∞', label: 'Stories' },
                            { n: '1', label: 'Family' },
                        ].map(stat => (
                            <div key={stat.label} className="flex-1 bg-white/10 rounded-2xl p-4 text-center">
                                <div className="text-2xl font-outfit font-black text-white">{stat.n}</div>
                                <div className="text-xs font-bold uppercase tracking-widest text-white/40 mt-1">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right — Form panel */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">

                    {/* Header */}
                    <div>
                        <h2 className="text-3xl font-outfit font-black text-catalog-text">
                            {showForgotPwd ? 'Reset Password' : 'Welcome back'}
                        </h2>
                        <p className="text-catalog-text/50 mt-1 text-sm">
                            {showForgotPwd ? "We'll send a recovery link to your email." : 'Sign in to your family archive.'}
                        </p>
                    </div>

                    {/* Forgot Password Form — Fix #5 */}
                    {showForgotPwd ? (
                        <div className="space-y-5">
                            {forgotStatus === 'sent' ? (
                                <div className="p-4 bg-green-50 border border-green-200 rounded-2xl flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                                    <p className="text-sm text-green-700">{forgotMsg}</p>
                                </div>
                            ) : (
                                <form onSubmit={handleForgotPassword} className="space-y-5">
                                    {forgotStatus === 'error' && (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-red-600 text-sm">
                                            <AlertCircle className="w-4 h-4" /> {forgotMsg}
                                        </div>
                                    )}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold uppercase tracking-widest text-catalog-accent">Email Address</label>
                                        <div className="relative">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-catalog-text/30" />
                                            <input
                                                type="email"
                                                value={forgotEmail}
                                                onChange={e => setForgotEmail(e.target.value)}
                                                placeholder="your@email.com"
                                                required
                                                className="w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/30 focus:border-catalog-accent/50 bg-gray-50/50 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={forgotStatus === 'loading'}
                                        className="w-full py-3.5 bg-catalog-accent text-white font-bold rounded-2xl shadow-lg shadow-catalog-accent/20 hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                    >
                                        {forgotStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                        Send Reset Link
                                    </button>
                                </form>
                            )}
                            <button onClick={() => setShowForgotPwd(false)} className="text-sm text-catalog-text/50 hover:text-catalog-text transition-colors">
                                ← Back to Sign In
                            </button>
                        </div>
                    ) : (
                        /* Sign In Form */
                        <div className="space-y-6">
                            {error && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-red-600 text-sm">
                                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* Email */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-widest text-catalog-accent">Email</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-catalog-text/30" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            placeholder="your@email.com"
                                            required
                                            className="w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/30 focus:border-catalog-accent/50 bg-gray-50/50 transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold uppercase tracking-widest text-catalog-accent">Password</label>
                                        {/* Fix #5: Forgot password link */}
                                        <button
                                            type="button"
                                            onClick={() => setShowForgotPwd(true)}
                                            className="text-xs text-catalog-accent/70 hover:text-catalog-accent transition-colors font-medium"
                                        >
                                            Forgot password?
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-catalog-text/30" />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            className="w-full pl-11 pr-12 py-3.5 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/30 focus:border-catalog-accent/50 bg-gray-50/50 transition-all"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-catalog-text/30 hover:text-catalog-text/60 transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full py-3.5 bg-catalog-accent text-white font-bold rounded-2xl shadow-lg shadow-catalog-accent/20 hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                >
                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                    {isLoading ? 'Signing in…' : 'Sign In'}
                                </button>
                            </form>

                            {/* Divider */}
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-200" />
                                </div>
                                <div className="relative flex justify-center">
                                    <span className="px-3 bg-catalog-bg text-xs text-catalog-text/40 font-medium">or continue with</span>
                                </div>
                            </div>

                            {/* Google Sign In */}
                            <button
                                type="button"
                                onClick={async () => {
                                    setError(null);
                                    const { error } = await (signInWithGoogle as any)();
                                    if (error) setError(error.message);
                                }}
                                className="w-full py-3.5 bg-white border border-gray-200 rounded-2xl hover:border-gray-300 hover:shadow-md transition-all flex items-center justify-center gap-3 font-semibold text-catalog-text"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                Continue with Google
                            </button>

                            <p className="text-center text-sm text-catalog-text/50">
                                Don't have an account?{' '}
                                <Link to="/signup" className="text-catalog-accent hover:underline font-semibold">
                                    Sign up with invite
                                </Link>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
