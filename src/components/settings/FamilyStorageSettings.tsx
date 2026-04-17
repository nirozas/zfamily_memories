import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { Loader2, Save, Info, ExternalLink, Key, Database, Globe, HelpCircle } from 'lucide-react';

interface FamilyStorageSettingsProps {
    familyId: string;
}

export function FamilyStorageSettings({ familyId }: FamilyStorageSettingsProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    
    const [settings, setSettings] = useState({
        r2_access_key_id: '',
        r2_secret_access_key: '',
        r2_endpoint: '',
        r2_bucket_name: '',
        r2_public_url: ''
    });

    useEffect(() => {
        fetchSettings();
    }, [familyId]);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('family_settings')
                .select('*')
                .eq('family_id', familyId)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                setSettings({
                    r2_access_key_id: (data as any).r2_access_key_id || '',
                    r2_secret_access_key: (data as any).r2_secret_access_key || '',
                    r2_endpoint: (data as any).r2_endpoint || '',
                    r2_bucket_name: (data as any).r2_bucket_name || '',
                    r2_public_url: (data as any).r2_public_url || ''
                });
            }
        } catch (err: any) {
            console.error('Error fetching R2 settings:', err);
            setError('Failed to load storage settings');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);
            setSuccess(false);

            const { error } = await (supabase
                .from('family_settings') as any)
                .upsert({
                    family_id: familyId,
                    ...settings,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            console.error('Error saving R2 settings:', err);
            setError(err.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-catalog-accent" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex items-center justify-between border-b border-black/5 pb-6">
                <div>
                    <h2 className="text-2xl font-outfit font-black text-catalog-text">Family Storage (R2)</h2>
                    <p className="text-sm text-catalog-text/50 mt-1">Configure your own private Cloudflare R2 storage for this family archive.</p>
                </div>
                <div className="p-3 bg-blue-50 text-blue-500 rounded-2xl">
                    <Database className="w-6 h-6" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                {/* Form Section */}
                <div className="space-y-6">
                    {error && (
                        <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-sm font-medium">
                            {error}
                        </div>
                    )}
                    
                    {success && (
                        <div className="p-4 bg-green-50 text-green-600 rounded-2xl border border-green-100 text-sm font-medium">
                            Settings saved successfully!
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-catalog-accent uppercase tracking-widest flex items-center gap-2">
                                <Key className="w-3 h-3" /> Access Key ID
                            </label>
                            <input
                                type="text"
                                value={settings.r2_access_key_id}
                                onChange={e => setSettings({...settings, r2_access_key_id: e.target.value})}
                                placeholder="e.g., d169234f1140259ee..."
                                className="w-full px-4 py-3 bg-white border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all font-mono text-sm"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-catalog-accent uppercase tracking-widest flex items-center gap-2">
                                <Shield className="w-3 h-3" /> Secret Access Key
                            </label>
                            <input
                                type="password"
                                value={settings.r2_secret_access_key}
                                onChange={e => setSettings({...settings, r2_secret_access_key: e.target.value})}
                                placeholder="••••••••••••••••••••••••"
                                className="w-full px-4 py-3 bg-white border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all font-mono text-sm"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-catalog-accent uppercase tracking-widest flex items-center gap-2">
                                <Globe className="w-3 h-3" /> S3 API Endpoint
                            </label>
                            <input
                                type="text"
                                value={settings.r2_endpoint}
                                onChange={e => setSettings({...settings, r2_endpoint: e.target.value})}
                                placeholder="https://<account_id>.r2.cloudflarestorage.com"
                                className="w-full px-4 py-3 bg-white border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all text-sm"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-catalog-accent uppercase tracking-widest flex items-center gap-2">
                                <Database className="w-3 h-3" /> Bucket Name
                            </label>
                            <input
                                type="text"
                                value={settings.r2_bucket_name}
                                onChange={e => setSettings({...settings, r2_bucket_name: e.target.value})}
                                placeholder="my-family-bucket"
                                className="w-full px-4 py-3 bg-white border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all text-sm"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-catalog-accent uppercase tracking-widest flex items-center gap-2">
                                <ExternalLink className="w-3 h-3" /> Public CDN URL
                            </label>
                            <input
                                type="text"
                                value={settings.r2_public_url}
                                onChange={e => setSettings({...settings, r2_public_url: e.target.value})}
                                placeholder="https://pub-xxxx.r2.dev or custom domain"
                                className="w-full px-4 py-3 bg-white border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all text-sm"
                            />
                            <p className="text-[10px] text-gray-400 px-1 italic">Images and videos will be served via this URL.</p>
                        </div>
                    </div>

                    <Button 
                        onClick={handleSave} 
                        isLoading={saving} 
                        variant="primary" 
                        className="w-full h-14 rounded-2xl gap-2 font-black uppercase tracking-widest shadow-lg shadow-catalog-accent/20"
                    >
                        <Save className="w-5 h-5" />
                        Save Storage Configuration
                    </Button>
                </div>

                {/* Help Section */}
                <div className="glass-card p-8 rounded-[2.5rem] border border-catalog-accent/10 space-y-6 bg-catalog-accent/[0.02]">
                    <div className="flex items-center gap-3 text-catalog-accent">
                        <HelpCircle className="w-6 h-6" />
                        <h3 className="text-lg font-outfit font-black uppercase tracking-widest">Setup Instructions</h3>
                    </div>

                    <div className="space-y-6">
                        <section className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-black text-catalog-text">
                                <span className="w-6 h-6 rounded-lg bg-catalog-accent text-white flex items-center justify-center text-[10px]">1</span>
                                <span>Create Cloudflare Account</span>
                            </div>
                            <p className="text-xs text-catalog-text/60 leading-relaxed ml-8">
                                Sign up at <a href="https://dash.cloudflare.com" target="_blank" className="text-catalog-accent font-bold underline">Cloudflare</a>. Go to <b>R2</b> in the sidebar and enable it (it has a generous free tier of 10GB).
                            </p>
                        </section>

                        <section className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-black text-catalog-text">
                                <span className="w-6 h-6 rounded-lg bg-catalog-accent text-white flex items-center justify-center text-[10px]">2</span>
                                <span>Create a Bucket</span>
                            </div>
                            <p className="text-xs text-catalog-text/60 leading-relaxed ml-8">
                                Create a new bucket (e.g., <code className="bg-catalog-accent/10 px-1 rounded text-catalog-accent">family-memories</code>). Note this name for the "Bucket Name" field.
                            </p>
                        </section>

                        <section className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-black text-catalog-text">
                                <span className="w-6 h-6 rounded-lg bg-catalog-accent text-white flex items-center justify-center text-[10px]">3</span>
                                <span>Generate API Tokens</span>
                            </div>
                            <p className="text-xs text-catalog-text/60 leading-relaxed ml-8">
                                Click <b>"Manage R2 API Tokens"</b>. Create a new token with <b>"Admin Read & Write"</b> permissions. 
                                Copy the <b>Access Key ID</b> and <b>Secret Access Key</b>. 
                                Also copy your <b>"Jurisdictional-specific endpoint"</b> (the S3 API URL).
                            </p>
                        </section>

                        <section className="space-y-3">
                            <div className="flex items-center gap-2 text-sm font-black text-catalog-text">
                                <span className="w-6 h-6 rounded-lg bg-catalog-accent text-white flex items-center justify-center text-[10px]">4</span>
                                <span>Configure Public Access</span>
                            </div>
                            <p className="text-xs text-catalog-text/60 leading-relaxed ml-8">
                                In your Bucket settings, enable <b>"Public Access"</b> via the <code>r2.dev</code> subdomain or connect a custom domain. Use this URL for the <b>"Public CDN URL"</b> field.
                            </p>
                        </section>
                    </div>

                    <div className="pt-4 border-t border-catalog-accent/10">
                        <div className="p-4 bg-catalog-accent/5 rounded-2xl flex gap-3 items-start">
                            <Info className="w-4 h-4 text-catalog-accent shrink-0 mt-0.5" />
                            <p className="text-[10px] text-catalog-text/60 leading-relaxed italic">
                                Your API keys are encrypted and stored securely in our database. They are only used by our secure server-side logic to generate temporary upload links.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

const Shield = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
);
