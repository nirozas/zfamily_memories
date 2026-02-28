import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function AuthCallback() {
    const navigate = useNavigate();

    useEffect(() => {
        const handleAuthCallback = async () => {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) {
                console.error('Error in auth callback:', error);
                navigate('/login?error=auth_callback_failed');
            } else {
                // If we got a Google refresh token, save it for proxying
                if (session?.provider_refresh_token && session.user) {
                    await (supabase.from('user_google_credentials' as any) as any).upsert({
                        user_id: session.user.id,
                        refresh_token: session.provider_refresh_token,
                        updated_at: new Date().toISOString()
                    });
                }

                const target = localStorage.getItem('authRedirect');
                localStorage.removeItem('authRedirect');
                navigate(target || '/');
            }
        };

        handleAuthCallback();
    }, [navigate]);

    return (
        <div className="min-h-screen bg-catalog-bg flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-catalog-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-catalog-text/70 font-sans animate-pulse">Completing authentication...</p>
            </div>
        </div>
    );
}
