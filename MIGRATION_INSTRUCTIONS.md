# Database Migration Instructions
## Authentication and Subscription Removal

This document outlines the recommended database changes for removing authentication and subscription functionality from the Multi-LLM Platform.

## Overview

Authentication and subscription features have been removed from the application, but database tables are preserved to maintain existing data. The application now works in a public access mode.

## Recommended Changes (Optional)

### Option 1: Keep Existing Schema (Recommended)
- **Pros**: No data loss, minimal changes, easy rollback
- **Cons**: Unused tables/columns remain

Keep the current schema as-is. The application will ignore auth/subscription data and operate in public mode.

### Option 2: Minimal Cleanup (If you want to clean up unused data)

```sql
-- Create a system user for public chats (optional)
INSERT INTO users (id, email, subscription_tier, created_at, updated_at)
VALUES ('system-public-user', 'system@public.local', 'PRO', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Update existing chats to use system user (optional - this will make existing chats accessible)
UPDATE chats
SET user_id = 'system-public-user'
WHERE user_id NOT IN (SELECT id FROM users WHERE id = 'system-public-user');

-- Note: This makes all existing chats publicly accessible
-- Consider privacy implications before running this update
```

### Option 3: Full Schema Cleanup (Advanced)

If you want to completely remove authentication and subscription tables:

```sql
-- WARNING: This will permanently delete all user and subscription data
-- Make sure you have backups before proceeding!

-- 1. Delete subscription-related data
DELETE FROM subscriptions;

-- 2. Delete users (this will cascade delete chats and messages)
-- WARNING: This will delete all chat history!
-- DELETE FROM users;

-- 3. Drop tables (only if step 2 was completed)
-- DROP TABLE IF EXISTS subscriptions;
-- DROP TABLE IF EXISTS users;
```

## Current Application Behavior

### Without Database Changes
- Existing chats remain associated with their original users
- New chats are created with `system-public-user` ID
- All users have full access to all models (PRO tier equivalent)
- No usage limits or subscription restrictions

### With Minimal Cleanup (Option 2)
- All existing chats become publicly accessible
- Consistent user ownership across all chats
- No personal data remains

## Environment Variables

The following environment variables are no longer needed but can remain for future flexibility:

```bash
# Optional: Keep for potential future auth re-implementation
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Optional: Keep for potential future subscription re-implementation
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=
```

## Data Privacy Considerations

1. **Existing User Data**: User emails and subscription data remain in database but are not used
2. **Chat History**: Chat history remains associated with original users unless updated
3. **Public Access**: Consider if existing chat content should be made public

## Rollback Plan

If you need to restore authentication later:

1. Restore the original authStore, subscriptionStore implementations
2. Re-enable auth API routes by removing stub implementations
3. Restore auth guards in UI components
4. Update chat APIs to check user ownership
5. Revert database changes if Option 2 or 3 was applied

## Testing

After applying changes, verify:

1. ✅ Chat creation works without authentication
2. ✅ Message sending works without authentication
3. ✅ All AI models are accessible
4. ✅ No usage limits are applied
5. ✅ Public API routes return appropriate responses

## Support

For questions about these migration instructions, refer to the TODO comments in the codebase which mark all authentication and subscription removal points.