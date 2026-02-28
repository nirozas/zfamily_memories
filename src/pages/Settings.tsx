import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { User, Shield, Lock, Trash2, Edit2, Check, X, Copy, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function Settings() {
    const { user, userRole } = useAuth(); // Fix #2: use userRole from AuthContext (profiles.role)
    const isAdmin = userRole === 'admin';
    useDocumentTitle('Settings');
    const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'family' | 'admin'>('profile');

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

    useEffect(() => {
        const loadFamilyData = async () => {
            if (!user) return;
            const { data: profile } = await (supabase.from('profiles') as any).select('family_id').eq('id', user.id).maybeSingle();
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
        };
        loadFamilyData();
    }, [user]);

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
            const { error } = await (supabase.from('family_invites' as any) as any).insert({
                family_id: familyId,
                code,
                expires_at: expiresAt.toISOString(),
                created_by: user?.id,
            });
            if (error) throw error;
            setFamilyInvites(prev => [{ code, expires_at: expiresAt.toISOString() }, ...prev].slice(0, 5));
        } catch (e: any) {
            alert(e.message || 'Failed to generate invite.');
        } finally {
            setIsGeneratingInvite(false);
        }
    }

    const tabs = [
        { id: 'profile', label: 'My Profile', icon: User },
        { id: 'security', label: 'Security', icon: Lock },
        { id: 'family', label: 'Family & Invites', icon: Users },
        ...(isAdmin ? [{ id: 'admin', label: 'Admin Panel', icon: Shield }] : [])
    ] as const;

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
            <div>
                <h1 className="text-4xl font-outfit font-black text-catalog-text">Settings</h1>
                <p className="text-sm text-catalog-text/50 mt-1">Manage your account, security, and family.</p>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Sidebar Tabs */}
                <div className="md:w-64 space-y-1 shrink-0">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={cn(
                                'w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-all rounded-xl',
                                activeTab === tab.id
                                    ? 'bg-catalog-accent text-white shadow-md shadow-catalog-accent/20'
                                    : 'text-catalog-text/60 hover:bg-black/5 hover:text-catalog-text'
                            )}
                        >
                            <tab.icon className="w-5 h-5" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="flex-1">

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

                            {/* Family ID */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-catalog-accent uppercase tracking-widest">Family ID</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={familyId || 'Not in a family yet'}
                                        disabled
                                        className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-catalog-text/70 font-mono text-sm"
                                    />
                                    {familyId && (
                                        <button
                                            onClick={() => { navigator.clipboard.writeText(familyId); }}
                                            className="px-3 py-2.5 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all"
                                            title="Copy Family ID"
                                        >
                                            <Copy className="w-4 h-4 text-catalog-text/60" />
                                        </button>
                                    )}
                                </div>
                            </div>

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
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
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
                </div>
            </div>
        </div>
    );
}
