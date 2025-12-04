# CRON_SECRET Setup Instructions

## Quick Setup for CRON_SECRET

Since you want to use `ImagineCalendar2025` as your CRON_SECRET, here's what you need to do:

### Step 1: Add CRON_SECRET to your .env file

Add this line to your root `.env` file (in the project root directory):

```bash
CRON_SECRET=ImagineCalendar2025
```

**Location of .env file:**
- Root directory: `/home/hd/Downloads/crackon-whatsapp/.env`
- Or if you're using PM2: Check the path in `infrastructure/scripts/pm2-ecosystem.config.js` (looks like it might be at `~/imaginecalendar-env/env`)

### Step 2: Restart your application

After adding the environment variable, you need to restart your application:

**If using PM2:**
```bash
pm2 restart imaginecalendar-user
```

**If running manually:**
- Stop your application (Ctrl+C)
- Start it again with your normal start command

### Step 3: Verify it's working

Test the endpoint manually:

```bash
curl -X GET "https://your-domain.com/api/cron/reminders" \
  -H "Authorization: Bearer ImagineCalendar2025"
```

Replace `your-domain.com` with your actual domain (e.g., `dashboard.crackon.ai`).

You should get a JSON response like:
```json
{
  "success": true,
  "message": "Reminder check completed",
  "checkedAt": "...",
  "remindersChecked": 0,
  "notificationsSent": 0,
  "notificationsSkipped": 0
}
```

### Step 4: Configure cron-job.org

When setting up the cron job on cron-job.org:

1. **URL**: `https://your-domain.com/api/cron/reminders`
2. **Request Header**:
   - Name: `Authorization`
   - Value: `Bearer ImagineCalendar2025`

### Important Notes

⚠️ **Security Warning**: `ImagineCalendar2025` is a simple string and not very secure. For production, consider using a longer, random string. However, if this is acceptable for your use case, it will work.

✅ **For Development**: You can test without CRON_SECRET set (it will show a warning but allow the request).

🔒 **Production**: Always set CRON_SECRET in production to prevent unauthorized access to your cron endpoint.

