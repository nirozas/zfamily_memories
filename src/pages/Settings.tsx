import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { User, Shield, Lock, Trash2, Edit2, Check, X, Copy, Users, Mail, Bell, Search, BookOpen, Calendar as CalendarIcon } from 'lucide-react';
import emailService from '../services/emailService';
import { cn } from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import AdminBugReports from '../components/settings/AdminBugReports';
import { Bug, Cloud } from 'lucide-react';
import { FamilyStorageSettings } from '../components/settings/FamilyStorageSettings';

export function Settings() {
    const { user, userRole, createFamily, useInviteCode } = useAuth();
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';
    const isSuperAdmin = userRole === 'super_admin';
    useDocumentTitle('Settings');
    const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'family' | 'admin' | 'notifications' | 'bugs' | 'storage' | 'maintenance'>('profile');

    // Fix #3: profile editing
    const [displayName, setDisplayName] = useState(user?.user_metadata?.name || '');
    const [isEditingName, setIsEditingName] = useState(false);
    const [isSavingName, setIsSavingName] = useState(false);

    // Password change state
    const [passwordData, setPasswordData] = useState({ newPassword: '', confirmPassword: '' });
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Admin state
    const [users, setUsers] = useState<any[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // Fix #13: Family code state
    const [familyId, setFamilyId] = useState<string | null>(null);
    const [familyInvites, setFamilyInvites] = useState<any[]>([]);
    const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);

    // Email invitations
    const [inviteEmail, setInviteEmail] = useState('');
    const [isInvitingByEmail, setIsInvitingByEmail] = useState(false);
    const [incomingInvitations, setIncomingInvitations] = useState<any[]>([]);

    // Notifications
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loadingNotifications, setLoadingNotifications] = useState(false);

    // User Search & Family Members
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [familyMembers, setFamilyMembers] = useState<any[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [viewMode, setViewMode] = useState<'family' | 'global'>('family');
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        // Check for tab or invite in URL
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        const invite = params.get('invite');
        if (tab === 'family' || invite) {
            setActiveTab('family');
        } else if (tab === 'notifications') {
            setActiveTab('notifications');
        }

        const loadFamilyData = async () => {
            if (!user) return;
            const { data: profile } = await supabase.from('profiles').select('family_id, full_name').eq('id', user.id).maybeSingle() as { data: { family_id: string; full_name: string } | null; error: any };
            if (profile?.family_id) {
                setFamilyId(profile.family_id);
                const { data: invites } = await (supabase.from('family_invites' as any) as any)
                    .select('*')
                    .eq('family_id', profile.family_id)
                    .gte('expires_at', new Date().toISOString())
                    .order('created_at', { ascending: false })
                    .limit(5);
                if (invites) setFamilyInvites(invites);
            }
            fetchIncomingInvitations();
            fetchNotifications();
            if (profile?.family_id) {
                fetchFamilyMembers(profile.family_id, viewMode);
            } else if (isSuperAdmin && viewMode === 'global') {
                fetchFamilyMembers(null, 'global');
            }
        };
        loadFamilyData();
    }, [user, viewMode]);

    // Handle debounced search for autocomplete
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.trim().length >= 2) {
                handleSearchUsers(true);
                setShowSuggestions(true);
            } else {
                setSearchResults([]);
                setShowSuggestions(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    async function fetchFamilyMembers(fid: string | null, mode: 'family' | 'global' = 'family') {
        setLoadingMembers(true);
        try {
            let query = supabase.from('profiles').select('*');

            if (mode === 'family' && fid) {
                query = query.eq('family_id', fid);
            }
            // If global mode, we don't filter by family_id

            const { data, error } = await query;
            if (error) throw error;

            if (data) {
                // Fetch stats for each user (albums, events)
                const membersWithStats = await Promise.all((data as any[]).map(async (member) => {
                    const [albumsRes, eventsRes] = await Promise.all([
                        supabase.from('albums').select('id', { count: 'exact', head: true }).eq('creator_id', member.id),
                        supabase.from('events').select('id', { count: 'exact', head: true }).eq('created_by', member.id)
                    ]);

                    return {
                        ...member,
                        stats: {
                            albums: albumsRes.count || 0,
                            events: eventsRes.count || 0
                        }
                    };
                }));
                setFamilyMembers(membersWithStats);
            }
        } catch (err) {
            console.error('Error fetching members:', err);
        } finally {
            setLoadingMembers(false);
        }
    }

    async function handleSearchUsers(arg: any = false) {
        const isAutocomplete = typeof arg === 'boolean' ? arg : false;
        if (!searchQuery.trim()) return;
        if (!isAutocomplete) setIsSearching(true);

        try {
            const { data, error } = await (supabase
                .from('profiles' as any) as any)
                .select('*')
                .or(`full_name.ilike.%${searchQuery}%, email.ilike.%${searchQuery}%`)
                .limit(isAutocomplete ? 10 : 50);

            if (error) throw error;

            if (data) {
                // Filter out current user
                const filtered = (data as any[]).filter((u: any) => u.id !== user?.id);
                setSearchResults(filtered);
            }
        } catch (err) {
            console.error('Search error:', err);
        } finally {
            if (!isAutocomplete) setIsSearching(false);
        }
    }

    async function handleAddUserToFamily(targetUser: any, role: 'member' | 'creator') {
        if (!familyId) return;
        try {
            const { error } = await (supabase
                .from('profiles' as any) as any)
                .update({ family_id: familyId, role: role })
                .eq('id', targetUser.id);

            if (error) throw error;

            // Send notification
            await (supabase.from('notifications' as any) as any).insert({
                user_id: targetUser.id,
                title: 'Added to Family',
                message: `You have been added to the family archive as a ${role}.`,
                type: 'family_invite'
            });

            alert(`${targetUser.full_name || 'User'} added as ${role}`);
            fetchFamilyMembers(familyId);
            setSearchResults(prev => prev.filter(u => u.id !== targetUser.id));
        } catch (e: any) {
            alert(e.message);
        }
    }

    async function handleUpdateMemberRole(memberId: string, newRole: string) {
        try {
            const { error } = await (supabase
                .from('profiles' as any) as any)
                .update({ role: newRole })
                .eq('id', memberId);

            if (error) throw error;
            // Refetch data keeping the current view mode
            fetchFamilyMembers(viewMode === 'global' ? null : familyId, viewMode);
        } catch (e: any) {
            alert(e.message);
        }
    }

    async function fetchIncomingInvitations() {
        if (!user?.email) return;
        const { data, error } = await supabase
            .from('family_invitations' as any)
            .select('*, family_groups(name), profiles:inviter_id(full_name)')
            .eq('invitee_email', user.email)
            .eq('status', 'pending')
            .gte('expires_at', new Date().toISOString());
        if (error) console.error('Error fetching invitations:', error);
        if (data) setIncomingInvitations(data);
    }

    async function fetchNotifications() {
        if (!user) return;
        setLoadingNotifications(true);
        const { data, error } = await supabase
            .from('notifications' as any)
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10);
        if (error) console.error('Error fetching notifications:', error);
        if (data) setNotifications(data);
        setLoadingNotifications(false);
    }

    async function handleInviteByEmail() {
        if (!inviteEmail.trim() || !familyId || !user) return;
        setIsInvitingByEmail(true);
        try {
            // 1. Get family name
            const { data: family } = await (supabase.from('family_groups' as any) as any).select('name').eq('id', familyId).single();
            const familyName = family?.name || 'Our Family';

            // 2. Insert invitation record
            const { data: invite, error: inviteError } = await (supabase.from('family_invitations' as any) as any).insert({
                family_id: familyId,
                inviter_id: user.id,
                invitee_email: inviteEmail,
                role: 'member'
            }).select().single();

            if (inviteError) throw inviteError;

            // 3. Send email via Resend Service
            const joinUrl = `${window.location.origin}/settings?tab=family&invite=${invite.id}`;
            const { success, error: emailError } = await emailService.sendFamilyInvite(
                inviteEmail,
                user.user_metadata?.full_name || user.email || 'A family member',
                familyName,
                joinUrl
            );

            if (!success) {
                console.warn('Email sending failed, but invitation record was created:', emailError);
                alert('Invitation created, but could not send email automatically. Please ensure you have deployed the Edge Function.');
            } else {
                alert('Invitation sent successfully!');
            }

            setInviteEmail('');
        } catch (e: any) {
            alert(e.message || 'Failed to send invitation');
        } finally {
            setIsInvitingByEmail(false);
        }
    }

    async function handleAcceptInvitation(invitationId: string) {
        try {
            const { data, error } = await supabase.rpc('accept_family_invitation', { invitation_id: invitationId } as any);
            if (error) throw error;
            if ((data as any).success) {
                alert('Welcome to the family!');
                window.location.reload();
            } else {
                alert((data as any).error || 'Failed to accept invitation');
            }
        } catch (e: any) {
            alert(e.message);
        }
    }

    async function handleDeclineInvitation(invitationId: string) {
        try {
            const { error } = await (supabase.from('family_invitations' as any) as any)
                .update({ status: 'declined' })
                .eq('id', invitationId);
            if (error) throw error;
            fetchIncomingInvitations();
        } catch (e: any) {
            alert(e.message);
        }
    }

    async function markNotificationRead(notifId: string) {
        await (supabase.from('notifications' as any) as any).update({ is_read: true }).eq('id', notifId);
        setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
    }

    useEffect(() => {
        if (isAdmin) fetchUsers();
    }, [isAdmin]);

    async function fetchUsers() {
        setLoadingUsers(true);
        try {
            const { data } = await supabase.from('profiles').select('*');
            if (data) setUsers(data);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoadingUsers(false);
        }
    }

    // Fix #3: Save display name
    async function handleSaveName() {
        if (!user) return;
        setIsSavingName(true);
        try {
            const { error } = await (supabase.from('profiles') as any).update({ full_name: displayName }).eq('id', user.id);
            if (error) throw error;
            setIsEditingName(false);
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsSavingName(false);
        }
    }

    async function handleUpdatePassword(e: React.FormEvent) {
        e.preventDefault();
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordMsg({ type: 'error', text: "Passwords don't match." });
            return;
        }
        if (passwordData.newPassword.length < 8) {
            setPasswordMsg({ type: 'error', text: 'Password must be at least 8 characters.' });
            return;
        }
        setIsUpdatingPassword(true);
        const { error } = await supabase.auth.updateUser({ password: passwordData.newPassword });
        setIsUpdatingPassword(false);
        if (error) {
            setPasswordMsg({ type: 'error', text: error.message });
        } else {
            setPasswordMsg({ type: 'success', text: 'Password updated successfully!' });
            setPasswordData({ newPassword: '', confirmPassword: '' });
        }
    }

    async function handleDeleteUser(userId: string) {
        if (!window.confirm('Are you sure you want to remove this user profile?')) return;
        const { error } = await supabase.from('profiles').delete().eq('id', userId);
        if (error) alert(error.message);
        else fetchUsers();
    }

    async function handleChangeRole(userId: string, newRole: string) {
        const { error } = await (supabase.from('profiles') as any).update({ role: newRole }).eq('id', userId);
        if (error) alert(error.message);
        else fetchUsers();
    }

    // Fix #13: Generate invite code
    async function handleGenerateInvite() {
        if (!familyId) return;
        setIsGeneratingInvite(true);
        try {
            const code = `${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);
            const { data: newInvite, error } = await (supabase.from('family_invites' as any) as any).insert({
                family_id: familyId,
                code,
                expires_at: expiresAt.toISOString(),
                created_by: user?.id,
            }).select().single();
            if (error) throw error;
            if (newInvite) {
                setFamilyInvites(prev => [newInvite, ...prev].slice(0, 5));
            }
        } catch (e: any) {
            alert(e.message || 'Failed to generate invite.');
        } finally {
            setIsGeneratingInvite(false);
        }
    }

    async function handleDeleteInvite(inviteId: string) {
        if (!confirm('Are you sure you want to cancel this invite code?')) return;
        try {
            const { error } = await (supabase.from('family_invites' as any) as any).delete().eq('id', inviteId);
            if (error) throw error;
            setFamilyInvites(prev => prev.filter(inv => inv.id !== inviteId));
        } catch (e: any) {
            alert(e.message);
        }
    }

    const [newFamilyName, setNewFamilyName] = useState('');
    const [isCreatingFamily, setIsCreatingFamily] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [isJoiningFamily, setIsJoiningFamily] = useState(false);

    async function handleCreateFamily() {
        if (!newFamilyName.trim()) return;
        setIsCreatingFamily(true);
        try {
            const { success, error } = await createFamily(newFamilyName);
            if (success) {
                alert('Family created successfully!');
                window.location.reload();
            } else {
                alert(error || 'Failed to create family');
            }
        } finally {
            setIsCreatingFamily(false);
        }
    }

    async function handleJoinFamily() {
        if (!joinCode.trim()) return;
        setIsJoiningFamily(true);
        try {
            const { success, error } = await useInviteCode(joinCode);
            if (success) {
                alert('Welcome to the family!');
                window.location.reload();
            } else {
                alert(error || 'Invalid code or failed to join');
            }
        } finally {
            setIsJoiningFamily(false);
        }
    }

    const tabs = [
        { id: 'profile', label: 'My Profile', icon: User },
        { id: 'security', label: 'Security', icon: Lock },
        { id: 'family', label: 'Family & Invites', icon: Users },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        ...(isAdmin ? [
            { id: 'storage', label: 'R2 Storage', icon: Cloud },
            { id: 'maintenance', label: 'Maintenance', icon: Trash2 },
            { id: 'admin', label: 'Admin Panel', icon: Shield },
            { id: 'bugs', label: 'Bug Reports', icon: Bug }
        ] : [])
    ] as const;

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
            <div>
                <h1 className="text-4xl font-outfit font-black text-catalog-text">Settings</h1>
                <p className="text-sm text-catalog-text/50 mt-1">Manage your account, security, and family.</p>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Sidebar Tabs */}
                <div className="md:w-64 flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible no-scrollbar shrink-0 pb-2 md:pb-0 border-b md:border-b-0 border-gray-100 md:space-y-1">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={cn(
                                'flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-all rounded-xl whitespace-nowrap md:w-full',
                                activeTab === tab.id
                                    ? 'bg-catalog-accent text-white shadow-md shadow-catalog-accent/20'
                                    : 'text-catalog-text/60 hover:bg-black/5 hover:text-catalog-text'
                            )}
                        >
                            <tab.icon className="w-5 h-5 shrink-0" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1">

                    {/* ─── R2 Storage ─── */}
                    {activeTab === 'storage' && familyId && (
                        <Card className="p-8 animate-fade-in divide-y-0">
                            <FamilyStorageSettings familyId={familyId} />
                        </Card>
                    )}

                    {/* ─── My Profile ─── */}
                    {activeTab === 'profile' && (
                        <Card className="p-8 space-y-6 animate-fade-in">
                            <h2 className="text-2xl font-outfit font-black text-catalog-text">Profile Settings</h2>

                            {/* Display Name — Fix #3 */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-catalog-accent uppercase tracking-widest">Display Name</label>
                                {isEditingName ? (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={displayName}
                                            onChange={e => setDisplayName(e.target.value)}
                                            className="flex-1 px-4 py-2.5 border border-catalog-accent/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/30 font-medium"
                                            autoFocus
                                        />
                                        <button
                                            onClick={handleSaveName}
                                            disabled={isSavingName}
                                            className="px-3 py-2.5 bg-catalog-accent text-white rounded-xl hover:brightness-105 transition-all disabled:opacity-50"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => { setIsEditingName(false); setDisplayName(user?.user_metadata?.name || ''); }}
                                            className="px-3 py-2.5 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={displayName}
                                            disabled
                                            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-catalog-text font-medium"
                                        />
                                        <button
                                            onClick={() => setIsEditingName(true)}
                                            className="px-3 py-2.5 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all text-catalog-text/60 hover:text-catalog-text"
                                            title="Edit name"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Email (read-only) */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-catalog-accent uppercase tracking-widest">Email Address</label>
                                <input
                                    type="email"
                                    value={user?.email || ''}
                                    disabled
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-catalog-text/70"
                                />
                                <p className="text-xs text-catalog-text/40">Email cannot be changed from this panel.</p>
                            </div>

                            {/* Role Badge */}
                            <div className="pt-2">
                                <label className="text-xs font-bold text-catalog-accent uppercase tracking-widest block mb-2">Your Role</label>
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-catalog-accent/10 text-catalog-accent">
                                    {userRole || 'Member'}
                                </span>
                            </div>
                        </Card>
                    )}

                    {/* ─── Security ─── */}
                    {activeTab === 'security' && (
                        <Card className="p-8 space-y-8 animate-fade-in">
                            <h2 className="text-2xl font-outfit font-black text-catalog-text">Security & Access</h2>
                            <form onSubmit={handleUpdatePassword} className="space-y-5 max-w-md">
                                {passwordMsg && (
                                    <div className={cn(
                                        'p-3 rounded-xl text-sm font-medium',
                                        passwordMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                                    )}>
                                        {passwordMsg.text}
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-catalog-accent uppercase tracking-widest">New Password</label>
                                    <input
                                        type="password"
                                        value={passwordData.newPassword}
                                        onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/30"
                                        required
                                        minLength={8}
                                        placeholder="Min 8 characters"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-catalog-accent uppercase tracking-widest">Confirm Password</label>
                                    <input
                                        type="password"
                                        value={passwordData.confirmPassword}
                                        onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/30"
                                        required
                                        placeholder="Repeat password"
                                    />
                                </div>
                                <Button type="submit" isLoading={isUpdatingPassword} variant="primary">
                                    Update Password
                                </Button>
                            </form>
                        </Card>
                    )}

                    {/* ─── Family & Invites — Fix #13 ─── */}
                    {activeTab === 'family' && (
                        <Card className="p-8 space-y-8 animate-fade-in">
                            <h2 className="text-2xl font-outfit font-black text-catalog-text">Family & Invites</h2>

                            {/* Incoming Invitations */}
                            {incomingInvitations.length > 0 && (
                                <div className="p-6 bg-catalog-accent/5 rounded-[2rem] border border-catalog-accent/15 space-y-4">
                                    <div className="flex items-center gap-3 text-catalog-accent">
                                        <Bell className="w-6 h-6" />
                                        <h3 className="text-lg font-outfit font-black uppercase tracking-widest">Pending Invitations</h3>
                                    </div>
                                    <div className="space-y-3">
                                        {incomingInvitations.map((inv) => (
                                            <div key={inv.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-catalog-accent/10 shadow-sm">
                                                <div>
                                                    <p className="text-sm font-bold text-catalog-text">Join the {inv.family_groups?.name} family</p>
                                                    <p className="text-xs text-catalog-text/50">Invited by {inv.profiles?.full_name || 'Family Admin'}</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button size="sm" variant="primary" onClick={() => handleAcceptInvitation(inv.id)}>Accept</Button>
                                                    <Button size="sm" variant="ghost" className="text-catalog-text/40 hover:text-red-500" onClick={() => handleDeclineInvitation(inv.id)}>Decline</Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Family ID / Join UI */}
                            {!familyId ? (
                                <div className="space-y-8">
                                    <div className="p-6 bg-catalog-accent/5 rounded-[2rem] border border-catalog-accent/15 space-y-4">
                                        <div className="flex items-center gap-3 text-catalog-accent">
                                            <Users className="w-6 h-6" />
                                            <h3 className="text-lg font-outfit font-black uppercase tracking-widest">Join a Family</h3>
                                        </div>
                                        <p className="text-sm text-catalog-text/60">Enter an invite code provided by a family administrator.</p>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={joinCode}
                                                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                                placeholder="XXXX-XXXX"
                                                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/30 font-mono text-center tracking-widest"
                                            />
                                            <Button onClick={handleJoinFamily} isLoading={isJoiningFamily} variant="primary">Join</Button>
                                        </div>
                                    </div>

                                    <div className="p-6 bg-catalog-stone/5 rounded-[2rem] border border-black/10 space-y-4">
                                        <div className="flex items-center gap-3 text-catalog-text">
                                            <Shield className="w-6 h-6" />
                                            <h3 className="text-lg font-outfit font-black uppercase tracking-widest">Start a New Family</h3>
                                        </div>
                                        <p className="text-sm text-catalog-text/60">Initialize your own family heritage archive. You will become the administrator.</p>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={newFamilyName}
                                                onChange={e => setNewFamilyName(e.target.value)}
                                                placeholder="e.g. The Zoabi Clan"
                                                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/30"
                                            />
                                            <Button onClick={handleCreateFamily} isLoading={isCreatingFamily} variant="secondary">Create</Button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-catalog-accent uppercase tracking-widest">Family ID</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={familyId}
                                                disabled
                                                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-catalog-text/70 font-mono text-sm"
                                            />
                                            <button
                                                onClick={() => { navigator.clipboard.writeText(familyId); }}
                                                className="px-3 py-2.5 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all"
                                                title="Copy Family ID"
                                            >
                                                <Copy className="w-4 h-4 text-catalog-text/60" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Family Members List */}
                                    <div className="p-6 bg-white rounded-[2rem] border border-catalog-accent/10 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3 text-catalog-accent">
                                                <Users className="w-6 h-6" />
                                                <h3 className="text-lg font-outfit font-black uppercase tracking-widest">
                                                    {viewMode === 'global' ? 'Global Users' : 'Family Members'}
                                                </h3>
                                            </div>
                                            {isSuperAdmin && (
                                                <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                                                    <button
                                                        onClick={() => setViewMode('family')}
                                                        className={cn(
                                                            "px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                                                            viewMode === 'family' ? "bg-white text-catalog-accent shadow-sm" : "text-gray-400"
                                                        )}
                                                    >
                                                        My Family
                                                    </button>
                                                    <button
                                                        onClick={() => setViewMode('global')}
                                                        className={cn(
                                                            "px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                                                            viewMode === 'global' ? "bg-white text-catalog-accent shadow-sm" : "text-gray-400"
                                                        )}
                                                    >
                                                        All Users
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="divide-y divide-gray-100">
                                            {loadingMembers ? (
                                                <div className="py-4 text-center text-sm text-catalog-text/40">Loading members...</div>
                                            ) : familyMembers.length === 0 ? (
                                                <div className="py-12 text-center">
                                                    <Users className="w-12 h-12 mx-auto mb-3 opacity-10 text-catalog-accent" />
                                                    <p className="text-sm text-catalog-text/40 italic">No members found in this view.</p>
                                                </div>
                                            ) : (
                                                familyMembers.map((m) => (
                                                    <div key={m.id} className="py-4 flex items-center justify-between">
                                                        <div>
                                                            <p className="font-bold text-catalog-text flex items-center gap-2">
                                                                {m.full_name || 'Anonymous'}
                                                                {m.is_superadmin && (
                                                                    <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 text-[8px] font-black uppercase rounded-md tracking-tighter">Super Admin</span>
                                                                )}
                                                            </p>
                                                            <p className="text-xs text-catalog-text/50">{m.email}</p>
                                                            {m.stats && (
                                                                <div className="flex gap-3 mt-1.5">
                                                                    <span className="text-[9px] font-bold text-catalog-text/40 uppercase tracking-widest flex items-center gap-1">
                                                                        <BookOpen className="w-3 h-3" /> {m.stats.albums} Albums
                                                                    </span>
                                                                    <span className="text-[9px] font-bold text-catalog-text/40 uppercase tracking-widest flex items-center gap-1">
                                                                        <CalendarIcon className="w-3 h-3" /> {m.stats.events} Events
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <select
                                                                value={m.role || 'member'}
                                                                onChange={(e) => handleUpdateMemberRole(m.id, e.target.value)}
                                                                disabled={!isAdmin || m.id === user?.id}
                                                                className="text-xs font-bold uppercase border border-gray-100 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-catalog-accent/30 disabled:opacity-50"
                                                            >
                                                                <option value="member">Member</option>
                                                                <option value="creator">Creator</option>
                                                                <option value="admin">Admin</option>
                                                                {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                                                            </select>
                                                            {m.role === 'admin' && <Shield className="w-4 h-4 text-catalog-accent" />}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    {/* Search & Add Users */}
                                    {isAdmin && (
                                        <div className="p-6 bg-catalog-accent/5 rounded-[2rem] border border-catalog-accent/15 space-y-4">
                                            <div className="flex items-center gap-3 text-catalog-accent">
                                                <Search className="w-6 h-6" />
                                                <h3 className="text-lg font-outfit font-black uppercase tracking-widest">Search & Add Users</h3>
                                            </div>
                                            <div className="relative">
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={searchQuery}
                                                        onChange={e => {
                                                            setSearchQuery(e.target.value);
                                                            if (!showSuggestions) setShowSuggestions(true);
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') handleSearchUsers();
                                                            if (e.key === 'Escape') setShowSuggestions(false);
                                                        }}
                                                        onFocus={() => {
                                                            if (searchQuery.length >= 2) setShowSuggestions(true);
                                                        }}
                                                        placeholder="Search by name or email..."
                                                        className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/30"
                                                    />
                                                    <Button onClick={() => handleSearchUsers()} isLoading={isSearching} variant="primary">Search</Button>
                                                </div>

                                                {/* Autocomplete Suggestions */}
                                                {showSuggestions && searchQuery.length >= 2 && searchResults.length > 0 && (
                                                    <div className="absolute z-50 left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-catalog-accent/10 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <div className="p-2 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                                                            <span className="text-[9px] font-black text-catalog-text/40 uppercase tracking-widest px-2">Suggestions</span>
                                                            <button onClick={() => setShowSuggestions(false)} className="p-1 hover:bg-gray-100 rounded-full">
                                                                <X className="w-3.5 h-3.5 text-gray-400" />
                                                            </button>
                                                        </div>
                                                        <div className="divide-y divide-gray-50 max-h-60 overflow-y-auto">
                                                            {searchResults.map((u) => (
                                                                <div
                                                                    key={u.id}
                                                                    className="p-3 hover:bg-catalog-accent/5 transition-colors cursor-pointer flex items-center justify-between group"
                                                                    onClick={() => {
                                                                        setSearchQuery(u.email);
                                                                        setShowSuggestions(false);
                                                                        handleSearchUsers();
                                                                    }}
                                                                >
                                                                    <div>
                                                                        <p className="text-sm font-bold group-hover:text-catalog-accent transition-colors">{u.full_name || 'User'}</p>
                                                                        <p className="text-xs text-gray-500">{u.email}</p>
                                                                    </div>
                                                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handleAddUserToFamily(u, 'member'); }}
                                                                            className="px-2 py-1 bg-catalog-accent/10 text-catalog-accent text-[9px] font-black uppercase rounded-lg hover:bg-catalog-accent hover:text-white transition-all"
                                                                        >
                                                                            + Member
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handleAddUserToFamily(u, 'creator'); }}
                                                                            className="px-2 py-1 bg-catalog-story/10 text-catalog-story text-[9px] font-black uppercase rounded-lg hover:bg-catalog-story hover:text-white transition-all"
                                                                        >
                                                                            + Creator
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {searchResults.length > 0 && (
                                                <div className="mt-4 space-y-2 border-t border-catalog-accent/10 pt-4">
                                                    {searchResults.map((u) => (
                                                        <div key={u.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-catalog-accent/5">
                                                            <div>
                                                                <p className="text-sm font-bold">{u.full_name || 'User'}</p>
                                                                <p className="text-xs text-gray-500">{u.email}</p>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <Button size="sm" variant="ghost" className="text-xs" onClick={() => handleAddUserToFamily(u, 'member')}>+ Member</Button>
                                                                <Button size="sm" variant="outline" className="text-xs" onClick={() => handleAddUserToFamily(u, 'creator')}>+ Creator</Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
                                                <div className="mt-4 p-8 text-center bg-white rounded-2xl border border-dashed border-catalog-accent/20">
                                                    <Search className="w-8 h-8 mx-auto mb-2 opacity-10 text-catalog-accent" />
                                                    <p className="text-sm text-catalog-text/50">No users found matching "{searchQuery}"</p>
                                                    <p className="text-[10px] text-catalog-text/30 mt-1">Make sure the user has signed up for an account first.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Invite Code Generator */}
                            {isAdmin && familyId && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-bold text-catalog-text">Invite Codes</p>
                                            <p className="text-xs text-catalog-text/50">Generate a code to share with new family members (valid 7 days)</p>
                                        </div>
                                        <Button variant="primary" size="sm" onClick={handleGenerateInvite} isLoading={isGeneratingInvite}>
                                            Generate
                                        </Button>
                                    </div>

                                    {familyInvites.length > 0 && (
                                        <div className="space-y-2">
                                            {familyInvites.map((invite: any, i) => (
                                                <div key={i} className="flex items-center justify-between p-3 bg-catalog-accent/5 border border-catalog-accent/15 rounded-xl">
                                                    <span className="font-mono font-bold text-catalog-accent tracking-widest text-sm">{invite.code}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-catalog-text/40">
                                                            Expires {new Date(invite.expires_at).toLocaleDateString()}
                                                        </span>
                                                        <button
                                                            onClick={() => { navigator.clipboard.writeText(invite.code); }}
                                                            className="p-1.5 hover:bg-white rounded-lg transition-all"
                                                            title="Copy"
                                                        >
                                                            <Copy className="w-3.5 h-3.5 text-catalog-accent/60" />
                                                        </button>
                                                        {isAdmin && invite.id && (
                                                            <button
                                                                onClick={() => handleDeleteInvite(invite.id)}
                                                                className="p-1.5 hover:bg-red-50 rounded-lg transition-all text-red-300 hover:text-red-500"
                                                                title="Cancel/Delete Invite"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Invite by Email */}
                            {isAdmin && familyId && (
                                <div className="p-6 bg-catalog-accent/5 rounded-[2rem] border border-catalog-accent/15 space-y-4">
                                    <div className="flex items-center gap-3 text-catalog-accent">
                                        <Mail className="w-6 h-6" />
                                        <h3 className="text-lg font-outfit font-black uppercase tracking-widest">Invite by Email</h3>
                                    </div>
                                    <p className="text-sm text-catalog-text/60">Invite a family member directly by their email address.</p>
                                    <div className="flex gap-2">
                                        <input
                                            type="email"
                                            value={inviteEmail}
                                            onChange={e => setInviteEmail(e.target.value)}
                                            placeholder="email@example.com"
                                            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/30"
                                        />
                                        <Button onClick={handleInviteByEmail} isLoading={isInvitingByEmail} variant="primary">Send Invite</Button>
                                    </div>
                                </div>
                            )}
                        </Card>
                    )}

                    {/* ─── Notifications ─── */}
                    {activeTab === 'notifications' && (
                        <Card className="p-8 space-y-8 animate-fade-in">
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-outfit font-black text-catalog-text">Notifications</h2>
                                <Button variant="ghost" size="sm" onClick={fetchNotifications} isLoading={loadingNotifications}>
                                    Refresh
                                </Button>
                            </div>

                            <div className="space-y-4">
                                {notifications.length === 0 ? (
                                    <div className="text-center py-12 text-catalog-text/30">
                                        <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p className="font-medium">No notifications yet</p>
                                    </div>
                                ) : (
                                    notifications.map((notif) => (
                                        <div
                                            key={notif.id}
                                            className={cn(
                                                "p-4 rounded-2xl border transition-all cursor-pointer",
                                                notif.is_read
                                                    ? "bg-gray-50 border-gray-100 opacity-60"
                                                    : "bg-catalog-accent/5 border-catalog-accent/20 shadow-sm"
                                            )}
                                            onClick={() => !notif.is_read && markNotificationRead(notif.id)}
                                        >
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="text-sm font-bold text-catalog-text">{notif.title}</h3>
                                                    <p className="text-xs text-catalog-text/60 mt-1">{notif.message}</p>
                                                    <p className="text-[10px] text-catalog-text/30 mt-2">
                                                        {new Date(notif.created_at).toLocaleString()}
                                                    </p>
                                                </div>
                                                {!notif.is_read && (
                                                    <div className="w-2 h-2 rounded-full bg-catalog-accent shrink-0" />
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </Card>
                    )}

                    {/* ─── Admin Panel — Fix #2/#10 ─── */}
                    {activeTab === 'admin' && isAdmin && (
                        <Card className="p-8 space-y-8 animate-fade-in">
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-outfit font-black text-catalog-text">User Management</h2>
                                <Button variant="secondary" size="sm" onClick={fetchUsers} isLoading={loadingUsers}>
                                    Refresh
                                </Button>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-catalog-accent/10">
                                            <th className="py-4 px-2 text-xs font-bold text-catalog-accent uppercase tracking-widest">Member</th>
                                            <th className="py-4 px-2 text-xs font-bold text-catalog-accent uppercase tracking-widest">Role</th>
                                            <th className="py-4 px-2 text-xs font-bold text-catalog-accent uppercase tracking-widest text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-catalog-accent/5">
                                        {users.map(u => (
                                            <tr key={u.id} className="hover:bg-black/5 transition-colors">
                                                <td className="py-4 px-2">
                                                    <div className="font-medium text-catalog-text">{u.full_name || 'Unknown'}</div>
                                                    <div className="text-xs text-catalog-text/40 font-mono">{u.id.substring(0, 8)}…</div>
                                                </td>
                                                <td className="py-4 px-2">
                                                    {/* Fix #3 admin: role change dropdown */}
                                                    <select
                                                        value={u.role || 'viewer'}
                                                        onChange={e => handleChangeRole(u.id, e.target.value)}
                                                        disabled={u.id === user?.id}
                                                        className="text-xs font-bold uppercase border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-catalog-accent/30 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <option value="viewer">Viewer</option>
                                                        <option value="editor">Editor</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                </td>
                                                <td className="py-4 px-2 text-right">
                                                    {u.id !== user?.id && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="p-2 h-auto text-red-500 hover:text-red-600 hover:bg-red-50"
                                                            onClick={() => handleDeleteUser(u.id)}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    )}

                    {activeTab === 'bugs' && isAdmin && (
                        <Card className="p-8 space-y-8 animate-fade-in overflow-hidden">
                            <h2 className="text-2xl font-outfit font-black text-catalog-text">System Bug Reports</h2>
                            <AdminBugReports />
                        </Card>
                    )}

                    {activeTab === 'maintenance' && isAdmin && (
                        <Card className="p-8 space-y-8 animate-fade-in">
                            <h2 className="text-2xl font-outfit font-black text-catalog-text">System Maintenance</h2>
                            
                            <div className="space-y-6">
                                <div className="p-6 bg-red-50 border border-red-100 rounded-3xl space-y-4">
                                    <div className="flex items-center gap-3 text-red-600">
                                        <Trash2 className="w-5 h-5" />
                                        <h3 className="font-bold uppercase tracking-wider text-sm">Database Cleanup</h3>
                                    </div>
                                    <p className="text-xs text-red-600/70 font-medium">
                                        Remove all legacy Cloudinary assets from the library. This will resolve unauthorized 401 errors.
                                    </p>
                                    <Button 
                                        variant="primary" 
                                        className="bg-red-600 hover:bg-red-700"
                                        onClick={async () => {
                                            if (!confirm("Are you sure you want to delete ALL Cloudinary assets?")) return;
                                            try {
                                                const { count, error } = await supabase.from('library_assets' as any).delete({ count: 'exact' }).ilike('url', '%res.cloudinary.com%');
                                                if (error) throw error;
                                                alert(`Successfully deleted ${count || 0} Cloudinary records from library_assets.`);
                                            } catch (e: any) {
                                                alert("Error: " + e.message);
                                            }
                                        }}
                                    >
                                        Clean Cloudinary Assets
                                    </Button>
                                </div>

                                <div className="p-6 bg-catalog-accent/5 border border-catalog-accent/10 rounded-3xl space-y-4">
                                    <div className="flex items-center gap-3 text-catalog-accent">
                                        <Shield className="w-5 h-5" />
                                        <h3 className="font-bold uppercase tracking-wider text-sm">System Health</h3>
                                    </div>
                                    <p className="text-xs text-catalog-text/60 font-medium">
                                        If you see errors about "Table not found in schema cache", use the button below to force a schema reload.
                                    </p>
                                    <Button 
                                        variant="secondary"
                                        onClick={async () => {
                                            try {
                                                const { error } = await supabase.rpc('reload_schema_cache' as any);
                                                if (error) {
                                                    // Many Supabase setups don't have this RPC by default, so we might need a fallback explanation
                                                    alert("Automatic reload not available. Best way to reload the cache is to rename a column and rename it back in the Supabase Dashboard, or wait 10 minutes.");
                                                } else {
                                                    alert("Schema cache reload triggered.");
                                                }
                                            } catch (e) {
                                                alert("Could not trigger cache reload. Please wait a few minutes for Supabase to auto-refresh.");
                                            }
                                        }}
                                    >
                                        Trigger Schema Reload
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
