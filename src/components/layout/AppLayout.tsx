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
        if (p.startsWith('/stacks')) return 'theme-rose';
        if (p.startsWith('/profile') || p.startsWith('/settings')) return 'theme-rose';

        return 'theme-rose';
    }, [location.pathname]);

    return (
        <div className={`min-h-screen bg-catalog-bg ${themeClass} bg-pattern-diverse selection:bg-catalog-accent/30`}>
            <TopHeader />
            <main className="transition-all duration-500 ease-in-out pt-16">
                <div className="max-w-wide px-6 sm:px-12 py-10 animate-fade-in font-outfit">
                    {children}
                </div>
            </main>
        </div>
    );
}
