import { supabase } from '../lib/supabase';
import type { SharedLink } from '../types/supabase';

/**
 * Generate a temporary share link for an album
 * Link expires after 48 hours (2 days)
 */
export async function generateShareLink(albumId?: string, eventId?: string): Promise<{ link: string | null; error?: string }> {
    if (!albumId && !eventId) return { link: null, error: 'Either albumId or eventId is required' };

    try {
        // Generate a unique token
        const token = crypto.randomUUID();

        // Calculate expiration date (48 hours from now)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);

        const { error } = await supabase
            .from('shared_links')
            .insert({
                album_id: albumId || null,
                event_id: eventId || null,
                token: token,
                expires_at: expiresAt.toISOString(),
                is_active: true
            } as any);

        if (error) {
            console.error('Error creating share link:', error);
            return { link: null, error: error.message };
        }

        // Construct the full URL
        const baseUrl = window.location.origin;
        const shareUrl = `${baseUrl}/shared/${token}`;

        return { link: shareUrl };
    } catch (error) {
        console.error('Error in generateShareLink:', error);
        return { link: null, error: 'Failed to generate share link' };
    }
}

/**
 * Validate a share link and check if it's still active
 */
export async function validateShareLink(token: string): Promise<{
    valid: boolean;
    albumId?: string;
    eventId?: string;
    error?: string
}> {
    try {
        const { data, error } = await supabase
            .from('shared_links')
            .select('*')
            .eq('token', token)
            .eq('is_active', true)
            .maybeSingle();

        if (error || !data) {
            return { valid: false, error: 'Invalid share link' };
        }

        const linkData = data as any;

        // Check if link has expired
        const expiresAt = new Date(linkData.expires_at);
        if (expiresAt < new Date()) {
            return { valid: false, error: 'This share link has expired (48 hours)' };
        }

        return {
            valid: true,
            albumId: linkData.album_id,
            eventId: linkData.event_id
        };
    } catch (error) {
        console.error('Error validating share link:', error);
        return { valid: false, error: 'Error validating share link' };
    }
}

/**
 * Delete a share link (revoke access)
 */
export async function deleteShareLink(token: string): Promise<{ success: boolean; error?: string }> {
    try {
        const { error } = await (supabase
            .from('shared_links') as any)
            .update({ is_active: false })
            .eq('token', token);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        console.error('Error deleting share link:', error);
        return { success: false, error: 'Failed to delete link' };
    }
}

/**
 * Get all share links for an album
 */
export async function getAlbumShareLinks(albumId: string): Promise<{
    links: SharedLink[];
    error?: string
}> {
    try {
        const { data, error } = await supabase
            .from('shared_links')
            .select('*')
            .eq('album_id', albumId)
            .eq('is_active', true)
            .order('expires_at', { ascending: false });

        if (error) {
            return { links: [], error: error.message };
        }

        return { links: (data as any[]) || [] };
    } catch (error) {
        console.error('Error fetching share links:', error);
        return { links: [], error: 'Failed to fetch links' };
    }
}

/**
 * Generate a share link for an album similarly to Stacks, bypassing the modal
 * and creating a fully valid R2-backed snapshot.
 */
export async function generateAndShareAlbum(album: any, _pages: any[]): Promise<void> {
    try {
        // 0. Fetch fully hydrated album data to ensure all assets/layouts are included
        const { AlbumDataService } = await import('./albumDataService');
        const { unifiedAlbumToContextAlbum } = await import('../lib/albumAdapters');
        
        const unifiedAlbum = await AlbumDataService.fetchAlbum(album.id);
        if (!unifiedAlbum) throw new Error("Failed to fetch full album data for sharing.");
        
        const fullAlbum = unifiedAlbumToContextAlbum(unifiedAlbum);

        const token = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);

        // 1. Create token in DB
        const { error: dbError } = await (supabase.from('shared_links' as any) as any).insert({
            token,
            album_id: album.id,
            expires_at: expiresAt.toISOString(),
            is_active: true
        });

        if (dbError) throw dbError;

        // 2. Upload fully hydrated album data to R2 to bypass RLS limitations
        const exportData = {
            album: fullAlbum,
            pages: fullAlbum.pages || []
        };
        const jsonString = JSON.stringify(exportData);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        const key = `shared-links/album-${token}.json`;
        const { CloudflareR2Service } = await import('./cloudflareR2');
        await CloudflareR2Service.uploadFile(blob, key, 'application/json');

        // 3. Share the link natively
        const shareUrl = `${window.location.origin}/shared/${token}`;
        const emailSubject = encodeURIComponent(`Shared Memory Album: ${album.title}`);
        const emailBody = encodeURIComponent(`Hi!\n\nI wanted to share this memory album with you: ${album.title}\n\nYou can view it here (valid for 48 hours):\n${shareUrl}\n\nEnjoy!`);
        const mailtoUrl = `mailto:?subject=${emailSubject}&body=${emailBody}`;

        if (navigator.share) {
            await navigator.share({
                title: `Memory Album: ${album.title}`,
                text: 'View this memory album for the next 48 hours!',
                url: shareUrl,
            });
        } else {
            const choice = confirm(`Share link created!\n\nClick OK to Copy Link to clipboard.\nClick CANCEL to Share by Email.`);
            if (choice) {
                await navigator.clipboard.writeText(shareUrl);
                alert('Link copied to clipboard!');
            } else {
                window.location.href = mailtoUrl;
            }
        }
    } catch (err) {
        console.error('Error sharing album:', err);
        alert('Failed to generate share link.');
    }
}
