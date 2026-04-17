import { useState, useRef, useEffect, useContext } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Flame, BookOpen, Settings, User, Calendar as CalendarIcon, ChevronDown, LogOut, MapPin, Image as ImageIcon, Clock, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { AlbumContext } from '../../contexts/AlbumContext';
import { CloudUpload, CheckCircle2, AlertCircle, Bug } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import BugReportModal from '../modals/BugReportModal';

export function TopHeader() {
    const { user, signOut, profile } = useAuth();
    const albumContext = useContext(AlbumContext);
    const saveStatus = albumContext?.saveStatus || 'idle';
    const [isOpen, setIsOpen] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const userDropdownRef = useRef<HTMLDivElement>(null);
    const [isBugModalOpen, setIsBugModalOpen] = useState(false);

    interface NavItem {
        icon: React.ElementType;
        label: string;
        href: string;
    }

    const navItems: (NavItem & { color: string })[] = [
        { icon: Flame, label: 'Home', href: '/', color: 'bg-pastel-red/30' },
        { icon: CalendarIcon, label: 'Calendar', href: '/calendar', color: 'bg-pastel-blue/30' },
        { icon: Clock, label: 'Timeline', href: '/events', color: 'bg-pastel-indigo/30' },
        { icon: Sparkles, label: 'Memories', href: '/stacks', color: 'bg-pastel-red/30' },
        { icon: BookOpen, label: 'Albums', href: '/library', color: 'bg-pastel-orange/30' },
        { icon: MapPin, label: 'Traveling Map', href: '/map', color: 'bg-pastel-green/30' },
        { icon: ImageIcon, label: 'Media', href: '/media', color: 'bg-pastel-yellow/30' },
    ];

    const userName = profile?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
    const userInitial = userName.charAt(0).toUpperCase();
    const avatarUrl = profile?.avatar_url || null;

    // Close dropdowns on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
            if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
                setIsUserMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/20 h-16 shadow-lg shadow-black/5">
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-rainbow opacity-80" />
                <div className="max-w-wide h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between">
                    {/* Logo & Dropdown Trigger */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="flex items-center gap-2 group focus:outline-none"
                        >
                            <h1 className="text-xl sm:text-2xl font-outfit font-black tracking-premium text-catalog-text transition-all duration-300 group-hover:scale-105 shrink-0">
                                <span className="text-rainbow not-italic tracking-tighter mr-0.5">Zoabi</span>
                                <span className="hidden xs:inline text-catalog-text/60 font-light">Family</span>
                            </h1>
                            <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 bg-catalog-accent/5 rounded-full border border-catalog-accent/10 hover:bg-catalog-accent/10 transition-colors">
                                <span className="text-[10px] font-black text-catalog-accent uppercase tracking-widest hidden sm:inline">Explore</span>
                                <ChevronDown className={cn(
                                    "w-3 h-3 sm:w-4 sm:h-4 text-catalog-accent/60 transition-transform duration-300",
                                    isOpen && "rotate-180"
                                )} />
                            </div>
                        </button>

                        {/* Pull-down Menu */}
                        <AnimatePresence>
                            {isOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                    className="absolute top-full left-0 mt-2 w-72 glass rounded-2xl shadow-2xl border border-white/40 overflow-hidden z-[60] origin-top-left"
                                >
                                    <div className="p-2 space-y-1">
                                        {navItems.map((item) => (
                                            <NavLink
                                                key={item.href}
                                                to={item.href}
                                                onClick={() => setIsOpen(false)}
                                                className={({ isActive }) =>
                                                    cn(
                                                        "flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-xl transition-all",
                                                        isActive
                                                            ? `${item.color.replace('/30', '/10')} text-catalog-text shadow-sm border border-black/5`
                                                            : "text-catalog-text/60 hover:bg-black/5 hover:text-catalog-text"
                                                    )
                                                }
                                            >
                                                <div className={cn("p-2 rounded-lg", item.color)}>
                                                    <item.icon className="h-4 w-4" />
                                                </div>
                                                <span className="font-outfit tracking-wide">{item.label}</span>
                                            </NavLink>
                                        ))}
                                        <div className="border-t border-black/5 my-1 mx-2" />
                                        <button
                                            onClick={() => {
                                                setIsOpen(false);
                                                signOut();
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-500 hover:bg-red-50/50 rounded-xl transition-all"
                                        >
                                            <div className="p-2 rounded-lg bg-red-50">
                                                <LogOut className="h-4 w-4" />
                                            </div>
                                            <span className="font-outfit tracking-wide">Sign Out</span>
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Right Side Actions */}
                    <div className="flex items-center gap-1.5 sm:gap-4">
                        {/* Save Status Indicator */}
                        <div className="hidden xs:flex items-center gap-2 px-3 py-1.5 rounded-full glass-card border border-white/60">
                            {saveStatus === 'saving' && (
                                <div className="flex items-center gap-2 text-catalog-accent animate-pulse">
                                    <CloudUpload className="w-3 h-3" />
                                    <span className="text-[8px] font-bold uppercase tracking-widest font-outfit hidden sm:inline">Saving</span>
                                </div>
                            )}
                            {saveStatus === 'saved' && (
                                <div className="flex items-center gap-2 text-green-600 animate-in fade-in duration-500">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span className="text-[8px] font-bold uppercase tracking-widest font-outfit hidden sm:inline">Synced</span>
                                </div>
                            )}
                            {saveStatus === 'error' && (
                                <div className="flex items-center gap-2 text-red-500">
                                    <AlertCircle className="w-3 h-3" />
                                    <span className="text-[8px] font-bold uppercase tracking-widest font-outfit hidden sm:inline">Error</span>
                                </div>
                            )}
                            {saveStatus === 'idle' && (
                                <div className="flex items-center gap-2 text-catalog-text/30">
                                    <CloudUpload className="w-3 h-3" />
                                    <span className="text-[8px] font-bold uppercase tracking-widest italic opacity-50 font-outfit hidden sm:inline">Ready</span>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setIsBugModalOpen(true)}
                            className="p-2 text-catalog-text/40 hover:text-catalog-accent transition-all hover:bg-catalog-accent/5 rounded-full"
                            title="Report Bug"
                        >
                            <Bug className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>

                        <div className="relative" ref={userDropdownRef}>
                            <button
                                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                                className="flex items-center gap-3 p-1 rounded-full glass hover:bg-white transition-all border border-white/40 shadow-sm group"
                            >
                                <div className="hidden sm:flex flex-col items-end ml-3 mr-1">
                                    <span className="text-xs font-outfit font-black text-catalog-text leading-tight group-hover:text-catalog-accent transition-colors truncate max-w-[100px] lg:max-w-[150px]">{userName}</span>
                                    <span className="text-[9px] text-catalog-text/40 uppercase tracking-widest font-bold">
                                        {user?.app_metadata?.role || 'Member'}
                                    </span>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-catalog-accent/10 border border-catalog-accent/20 flex items-center justify-center overflow-hidden transform transition-transform group-hover:rotate-12">
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="font-outfit text-xs font-black text-catalog-accent">{userInitial}</span>
                                    )}
                                </div>
                            </button>

                            {/* User Dropdown Menu */}
                            <AnimatePresence>
                                {isUserMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                        className="absolute top-full right-0 mt-2 w-56 glass rounded-2xl shadow-2xl border border-white/40 overflow-hidden z-[60] origin-top-right p-2"
                                    >
                                        <div className="space-y-1">
                                            <Link
                                                to="/profile"
                                                onClick={() => setIsUserMenuOpen(false)}
                                                className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-catalog-text/70 hover:bg-black/5 hover:text-catalog-text rounded-xl transition-all"
                                            >
                                                <div className="p-1.5 rounded-lg bg-catalog-stone/10">
                                                    <User className="h-4 w-4" />
                                                </div>
                                                <span className="font-outfit tracking-wide">My Profile</span>
                                            </Link>
                                            <Link
                                                to="/settings"
                                                onClick={() => setIsUserMenuOpen(false)}
                                                className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-catalog-text/70 hover:bg-black/5 hover:text-catalog-text rounded-xl transition-all"
                                            >
                                                <div className="p-1.5 rounded-lg bg-catalog-stone/10">
                                                    <Settings className="h-4 w-4" />
                                                </div>
                                                <span className="font-outfit tracking-wide">Settings</span>
                                            </Link>
                                            <div className="border-t border-black/5 my-1 mx-2" />
                                            <button
                                                onClick={() => {
                                                    setIsUserMenuOpen(false);
                                                    signOut();
                                                }}
                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50/50 rounded-xl transition-all"
                                            >
                                                <div className="p-1.5 rounded-lg bg-red-50">
                                                    <LogOut className="h-4 w-4" />
                                                </div>
                                                <span className="font-outfit tracking-wide">Sign Out</span>
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </header>

            <BugReportModal 
                isOpen={isBugModalOpen} 
                onClose={() => setIsBugModalOpen(false)} 
            />
        </>
    );
}
