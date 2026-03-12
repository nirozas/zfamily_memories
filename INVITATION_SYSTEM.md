# Family Invitation System

This system allows family administrators (Admins) to invite new members via email using the Resend API.

## Components

1.  **Database Tables**:
    *   `family_invitations`: Stores pending, accepted, and declined invitations.
    *   `notifications`: Real-time alerts for users (e.g., when an invitation is accepted).
2.  **Supabase Edge Function**: `resend` function located in `supabase/functions/resend/`. This function handles the actual communication with Resend using the `RESEND_API_KEY`.
3.  **Email Service**: `src/services/emailService.ts` handles the invocation of the Edge Function.
4.  **UI (Settings Page)**:
    *   **Admins**: Can see an "Invite by Email" section in the Family tab.
    *   **Users**: Can see "Pending Invitations" at the top of their Family tab.
    *   **Notifications**: A new "Notifications" tab in Settings to track all activity.

## Deployment Instructions

Since I cannot deploy Supabase Edge Functions directly from this environment, you must run the following command to make the invitation system fully functional:

```bash
# Set the RESEND_API_KEY in Supabase secrets
supabase secrets set RESEND_API_KEY=re_essHHjey_Bevh1bNV8katNXnWT5BZT3ba

# Deploy the resend function
supabase functions deploy resend
```

## How it works

1.  **Admin** enters an email in the "Invite by Email" section.
2.  An invitation record is created in the database.
3.  The `resend` Edge Function sends a beautiful HTML email to the invitee.
4.  The **Invitee** receives the email and clicks the "View & Accept" link.
5.  On the Family tab in Settings, the invitee sees the pending invitation and clicks **Accept**.
6.  The invitee's profile is updated with the `family_id` and they gain access to the family's albums.
7.  The **Admin** receives a notification that the user has joined.
