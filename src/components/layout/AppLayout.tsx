import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { TopHeader } from './TopHeader';

interface AppLayoutProps {
    children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
    const location = useLocation();

    const themeClass = useMemo(() => {
        const p = location.pathname;
        if (p === '/' || p.startsWith('/home')) return 'theme-rose';
        if (p.startsWith('/calendar')) return 'theme-sky';
        if (p.startsWith('/library') || p.startsWith('/album')) return 'theme-mint';
        if (p.startsWith('/media')) return 'theme-lavender';
        if (p.startsWith('/events') || p.startsWith('/event')) return 'theme-peach';
        if (p.startsWith('/map')) return 'theme-lemon';
        if (p.startsWith('/profile') || p.startsWith('/settings')) return 'theme-rose';

        return 'theme-rose';
    }, [location.pathname]);

    return (
        <div className={`min-h-screen bg-catalog-bg pt-16 ${themeClass} theme-rainbow bg-pattern-diverse`}>
            <TopHeader />
            <main className="transition-all duration-300">
                <div className="max-w-wide px-4 sm:px-8 py-8 animate-fade-in">
                    {children}
                </div>
            </main>
        </div>
    );
}
