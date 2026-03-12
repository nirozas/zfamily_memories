import React, { useState, useEffect } from 'react';
import { Bug, Clock, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface BugReport {
    id: string;
    user_id: string;
    description: string;
    status: 'pending' | 'in_progress' | 'fixed';
    admin_notes?: string | null;
    created_at: string;
    updated_at: string;
    profiles?: {
        full_name: string;
        username?: string;
        avatar_url: string;
    } | null;
}

const AdminBugReports: React.FC = () => {
    const [reports, setReports] = useState<BugReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    const fetchReports = async () => {
        setLoading(true);
        setError(null);
        try {
            // Attempt join first
            const { data, error: joinError } = await supabase
                .from('bug_reports' as any)
                .select('*, profiles(full_name, avatar_url)')
                .order('created_at', { ascending: false });

            if (joinError) {
                console.warn('Profile join failed, falling back to simple fetch:', joinError);
                // Fallback: fetch without join if the relationship isn't set up correctly yet
                const { data: simpleData, error: simpleError } = await supabase
                    .from('bug_reports' as any)
                    .select('*')
                    .order('created_at', { ascending: false });

                if (simpleError) throw simpleError;
                setReports(simpleData || []);
            } else {
                setReports(data || []);
            }
        } catch (err: any) {
            console.error('Error fetching bug reports:', err);
            setError(err.message || 'Failed to fetch bug reports');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    const updateStatus = async (id: string, status: BugReport['status']) => {
        setUpdatingId(id);
        try {
            const { error: updateErr } = await (supabase
                .from('bug_reports' as any) as any)
                .update({
                    status,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (updateErr) throw updateErr;
            setReports(reports.map(r => r.id === id ? { ...r, status, updated_at: new Date().toISOString() } : r));
        } catch (err) {
            console.error('Error updating bug report:', err);
            alert('Failed to update status. Make sure the table has been updated with new columns.');
        } finally {
            setUpdatingId(null);
        }
    };

    const updateNotes = async (id: string, notes: string) => {
        setUpdatingId(id);
        try {
            const { error: noteErr } = await (supabase
                .from('bug_reports' as any) as any)
                .update({
                    admin_notes: notes,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (noteErr) throw noteErr;
            setReports(reports.map(r => r.id === id ? { ...r, admin_notes: notes, updated_at: new Date().toISOString() } : r));
        } catch (err) {
            console.error('Error updating bug notes:', err);
            alert('Failed to update notes. You may need to add the "admin_notes" column to the bug_reports table.');
        } finally {
            setUpdatingId(null);
        }
    };

    const deleteReport = async (id: string) => {
        if (!confirm('Are you sure you want to delete this report?')) return;

        try {
            const { error: deleteErr } = await supabase
                .from('bug_reports' as any)
                .delete()
                .eq('id', id);

            if (deleteErr) throw deleteErr;
            setReports(reports.filter(r => r.id !== id));
        } catch (err) {
            console.error('Error deleting bug report:', err);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 size={32} className="animate-spin text-catalog-accent" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600">
                <AlertCircle size={20} />
                <div className="flex-1">
                    <p className="text-xs font-bold uppercase tracking-wider">Failed to Load Reports</p>
                    <p className="text-xs opacity-80">{error}</p>
                </div>
                <button onClick={fetchReports} className="px-3 py-1 bg-rose-600 text-white text-[10px] font-black uppercase rounded-lg hover:bg-rose-700 transition-all cursor-pointer">Retry</button>
            </div>
        );
    }

    if (reports.length === 0) {
        return (
            <div className="text-center py-12 bg-slate-50/50 rounded-3xl border border-slate-100 border-dashed">
                <Bug size={48} className="mx-auto text-slate-200 mb-4" />
                <h4 className="text-slate-400 font-bold uppercase tracking-widest text-sm">No bug reports yet</h4>
                <p className="text-slate-400 text-xs mt-1">Everything seems to be running smoothly!</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <Bug size={18} className="text-rose-500" />
                    Submitted Reports ({reports.length})
                </h4>
                <button
                    onClick={fetchReports}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="Refresh"
                >
                    <Clock size={16} className="text-slate-400" />
                </button>
            </div>

            <div className="grid gap-4">
                {reports.map((report) => (
                    <div
                        key={report.id}
                        className={`bg-white rounded-2xl border p-5 shadow-sm transition-all border-slate-100 ${report.status === 'fixed' ? 'bg-slate-50/30' : ''}`}
                    >
                        <div className="flex flex-col gap-4 text-slate-900">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex flex-wrap items-center gap-3 mb-3">
                                        <div className="relative">
                                            <select
                                                value={report.status}
                                                onChange={(e) => updateStatus(report.id, e.target.value as BugReport['status'])}
                                                disabled={updatingId === report.id}
                                                className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl appearance-none pr-8 cursor-pointer transition-all border-none outline-none ${report.status === 'fixed' ? 'bg-emerald-100 text-emerald-600' :
                                                    report.status === 'in_progress' ? 'bg-amber-100 text-amber-600' :
                                                        'bg-blue-100 text-blue-600'
                                                    }`}
                                            >
                                                <option value="pending">Pending</option>
                                                <option value="in_progress">Working On</option>
                                                <option value="fixed">Fixed</option>
                                            </select>
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-50 text-slate-400">
                                                {updatingId === report.id ? <Loader2 size={10} className="animate-spin" /> : <Clock size={10} />}
                                            </div>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Submitted</span>
                                            <span className="text-[10px] font-medium text-slate-600">
                                                {new Date(report.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                        {report.updated_at && report.updated_at !== report.created_at && (
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                                    {report.status === 'fixed' ? 'Fixed At' : 'Last Activity'}
                                                </span>
                                                <span className="text-[10px] font-medium text-slate-600">
                                                    {new Date(report.updated_at).toLocaleString()}
                                                </span>
                                            </div>
                                        )}
                                        <span className="text-[10px] font-bold text-slate-900 ml-auto flex items-center gap-1.5">
                                            By: {report.profiles?.full_name || report.profiles?.username || `User ${report.user_id.slice(0, 5)}`}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-700 font-medium whitespace-pre-wrap leading-relaxed bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                                        {report.description}
                                    </p>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => deleteReport(report.id)}
                                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                                        title="Delete Report"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Admin Notes Section */}
                            <div className="pt-4 border-t border-slate-100 mt-2">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Clock size={12} className="text-catalog-accent" />
                                        Resolution Notes
                                    </label>
                                    <div className="flex gap-2">
                                        <textarea
                                            placeholder="Add notes about the fix or progress..."
                                            defaultValue={report.admin_notes || ''}
                                            id={`notes-${report.id}`}
                                            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-catalog-accent/50 outline-none transition-all resize-none min-h-[60px]"
                                        />
                                        <button
                                            onClick={() => {
                                                const val = (document.getElementById(`notes-${report.id}`) as HTMLTextAreaElement).value;
                                                updateNotes(report.id, val);
                                            }}
                                            disabled={updatingId === report.id}
                                            className="px-3 py-2 bg-catalog-accent hover:brightness-105 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center min-w-[80px] cursor-pointer"
                                        >
                                            {updatingId === report.id ? <Loader2 size={12} className="animate-spin" /> : 'Save Note'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminBugReports;
