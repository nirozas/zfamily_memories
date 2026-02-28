import { useEffect } from 'react';

/**
 * Improvement #14: Set the document title for the current page.
 * Automatically prefixes with the brand name for consistent UX.
 *
 * @example useDocumentTitle('Home');  => tab shows "Home — Zoabi Family"
 */
export function useDocumentTitle(title: string) {
    useEffect(() => {
        const prev = document.title;
        document.title = title ? `${title} — Zoabi Family` : 'Zoabi Family Archive';
        return () => { document.title = prev; };
    }, [title]);
}
