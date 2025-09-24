# Lynk Deployment Guide

This guide covers the deployment and configuration of the enhanced Lynk system with persistent sessions, server-side quotas, and observability.

## 🚀 Quick Setup

### 1. Database Migration

Run the database migration to create the necessary tables:

```bash
# Using the migration script (recommended)
node scripts/migrate-and-cleanup.js all

# Or run the SQL manually in your Supabase SQL editor
# Copy and paste the content from migrations/001_lynk_sessions_and_limits.sql
```

### 2. Environment Variables

Ensure these environment variables are set:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# API Keys for AI Providers
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
GEMINI_API_KEY=your_gemini_key
XAI_API_KEY=your_xai_key

# NextAuth Configuration
NEXTAUTH_URL=your_app_url
NEXTAUTH_SECRET=your_secret

# Production Settings (optional)
NODE_ENV=production
FRONTEND_URL=https://your-domain.com
```

### 3. Admin Setup

1. Deploy your app and sign up/sign in to create a user
2. Get your user ID from Supabase Dashboard → Authentication → Users
3. Edit `/app/api/admin/update-user-tier/route.js` and add your user ID to the `ADMIN_USER_IDS` array:

```javascript
const ADMIN_USER_IDS = [
  "your-supabase-user-id-here"
];
```

4. Redeploy and visit `/admin` to manage users

## 📋 Features Implemented

### ✅ Goals Completed

**A) Persistence**: Sessions, turns, snapshots, and command suggestions are now stored in Supabase and persist across reloads.

**B) Server-side Quotas**: Daily message limits, monthly vision/snapshot caps enforced before API calls.
- FREE_GUEST: 10 msgs/day, no vision/snapshots, 24h TTL
- FREE_VERIFIED: 25 msgs/day, 2 vision/month, 2 snapshots/month
- PRO: Unlimited messages/vision/snapshots

**C) Smart Suggestions**: Persist per session, trigger after 4 topical mentions, stored in database.

**D) Snapshots**: Generated every 5 user turns, never overwritten, always returned in API response.

**E) New Chat Flow**: `/api/new-chat` creates sessions with titles, prevents double-click duplicates.

**F) Identity Injection**: "Who are you?" triggers work across all providers, returns Lynk identity.

**G) Message Counting & Abuse**: Server-side quota tracking, rate limiting, input validation.

**H) Admin Interface**: `/admin` page to promote users and view sessions/snapshots/suggestions.

**I) Observability**: Request logging with provider, model, latency, tier, and limit hits.

### 🔧 Technical Implementation

- **Database**: New Supabase tables for sessions, quotas, snapshots, commands, logs
- **Migration**: SQL script with functions, indexes, and RLS policies
- **API Changes**: Session route completely rewritten for persistence and quotas
- **Rate Limiting**: In-memory sliding window (upgrade to Redis for scale)
- **Error Handling**: Friendly error messages with upgrade hints
- **CORS**: Tightened for production with credentials

## 🛠 Maintenance

### Daily Cleanup

Set up a cron job to clean expired guest sessions:

```bash
# Run daily at 2 AM
0 2 * * * cd /path/to/lynk && node scripts/migrate-and-cleanup.js cleanup
```

### Monitoring

Check database stats:

```bash
node scripts/migrate-and-cleanup.js stats
```

### User Management

- Visit `/admin` to promote users between tiers
- View user sessions, snapshots, and command suggestions
- Monitor quota usage and upgrade patterns

### Scaling Considerations

For high-traffic deployments:

1. **Rate Limiting**: Replace in-memory store with Redis
2. **Session Loading**: Add caching layer for frequently accessed sessions
3. **Observability**: Export logs to monitoring service (DataDog, New Relic)
4. **Database**: Monitor connection pool size and query performance

## 🧪 Testing Acceptance Criteria

Verify these scenarios work:

### Quota Testing
- [ ] Guest user hits 10 messages → gets 429 with email verification hint
- [ ] Verified user hits 25 messages → gets 429 with Pro upgrade hint
- [ ] Verified user attempts 3rd vision request → gets graceful upsell
- [ ] PRO users have no plan limits (but still hit abuse limiter)

### Identity Testing
- [ ] "Who are you?" returns "I'm Lynk. This chat is currently powered by [provider] [model] via Lynk."
- [ ] Works across OpenAI, Anthropic, Gemini, and XAI

### Persistence Testing
- [ ] Sessions persist after browser reload
- [ ] Snapshots accumulate (not replaced) and appear in right panel
- [ ] Command suggestions persist per session after topical triggers
- [ ] New Chat creates exactly one session with correct title

### Admin Testing
- [ ] Admin can view user list with tiers and session counts
- [ ] Admin can promote users between FREE_GUEST, FREE_VERIFIED, PRO
- [ ] Admin can view user sessions and snapshots

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Test Supabase connection
curl -H "apikey: YOUR_SERVICE_KEY" YOUR_SUPABASE_URL/rest/v1/lynk_sessions
```

### Migration Issues
```bash
# Run individual migration steps
node scripts/migrate-and-cleanup.js migrate
node scripts/migrate-and-cleanup.js init-tiers
```

### Admin Access Issues
1. Verify your user ID is in `ADMIN_USER_IDS`
2. Check browser console for auth errors
3. Confirm you're signed in with the admin account

### Quota Not Working
1. Check that user has `user_tiers` record
2. Verify quota functions exist in database
3. Monitor server logs for database errors

## 📝 Environment Notes

- **Development**: All CORS origins allowed (`*`)
- **Production**: CORS restricted to `FRONTEND_URL`
- **API Keys**: Store securely, rotate regularly
- **Service Role Key**: Never expose client-side

## 🔄 Future Enhancements

- Redis-based rate limiting for scale
- Real-time quota usage UI
- Advanced analytics dashboard
- Automated tier upgrades via payments
- Session export functionality