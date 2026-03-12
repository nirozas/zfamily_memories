import { supabase } from '../lib/supabase';

/**
 * Sends an email via the Supabase Edge Function using Resend.
 */
export async function sendEmail(to: string, subject: string, html: string) {
    try {
        const { data, error } = await supabase.functions.invoke('resend', {
            body: { to, subject, html }
        });
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error };
    }
}

/**
 * Generates and opens a pre-filled invitation email using the system's mail client (Legacy).
 */
export function sendInviteEmail(email: string, inviteCode: string, familyName: string = 'Our Family') {
    const subject = encodeURIComponent(`Join our family on FamilyZoabi Archive`);
    const body = encodeURIComponent(
        `Hello!\n\nYou've been invited to join the ${familyName} heritage archive on FamilyZoabi.\n\n` +
        `Your invite code is: ${inviteCode}\n\n` +
        `Please sign up at ${window.location.origin}/signup and enter this code during registration.\n\n` +
        `Welcome to the family!`
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

/**
 * Send invitation email for a family.
 */
export async function sendFamilyInvite(email: string, inviterName: string, familyName: string, joinUrl: string) {
    const subject = `Welcome to the ${familyName} Heritage Archive!`;
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
            <h1 style="color: #6366f1;">Hi there!</h1>
            <p><strong>${inviterName}</strong> has invited you to join the <strong>${familyName}</strong> heritage catalog on Zoabi Family Records.</p>
            <div style="margin: 30px 0;">
                <a href="${joinUrl}" 
                   style="background-color: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                   View & Accept Invitation
                </a>
            </div>
            <p>By joining, you'll be able to see all the shared albums and contribute to our family history.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #666;">If you didn't expect this invitation, you can safely ignore this email.</p>
        </div>
    `;
    return sendEmail(email, subject, html);
}

// Keep the object for backward compatibility with the current import style
export const emailService = {
    sendEmail,
    sendInviteEmail,
    sendFamilyInvite
};

export default emailService;
