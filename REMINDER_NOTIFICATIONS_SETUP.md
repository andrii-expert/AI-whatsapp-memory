# Reminder Notifications Setup

## Overview
The reminder notification system sends WhatsApp messages to users 5 minutes before their reminders are due.

## How It Works

1. **API Endpoint**: `/api/cron/reminders`
2. **Frequency**: Should be called every 1 minute by a cron job
3. **Functionality**:
   - Checks all active reminders
   - Calculates when each reminder should occur
   - Sends WhatsApp notification 5 minutes before the reminder time
   - Prevents duplicate notifications using in-memory cache (10-minute TTL)

## Setup Instructions

### 1. Environment Variable
Add to your `.env` file:
```
CRON_SECRET=your-secret-key-here
```

### 2. Cron Job Setup

#### Option A: Using Vercel Cron (Recommended for Vercel deployments)
Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "* * * * *"
    }
  ]
}
```

#### Option B: Using cron-job.org (Recommended for self-hosted deployments)

**Step-by-step setup:**

1. **Generate a secure CRON_SECRET**:
   ```bash
   # Generate a random secret (use one of these methods)
   openssl rand -hex 32
   # OR
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Add CRON_SECRET to your environment variables**:
   - Add to your `.env` file:
     ```
     CRON_SECRET=your-generated-secret-here
     ```
   - Make sure this is also set in your production environment

3. **Get your application URL**:
   - Production: `https://your-domain.com` (e.g., `https://dashboard.crackon.ai`)
   - The full endpoint will be: `https://your-domain.com/api/cron/reminders`

4. **Create account on cron-job.org**:
   - Go to https://cron-job.org
   - Sign up for a free account (or login if you already have one)

5. **Create a new cron job**:
   - Click "Create cronjob" or "New cronjob"
   - Fill in the following details:
     - **Title**: `Reminder Notifications Check`
     - **Address (URL)**: `https://your-domain.com/api/cron/reminders`
     - **Schedule**: Select "Every minute" or use cron expression: `* * * * *`
     - **Request method**: Select `GET`
     - **Request headers**: Click "Add header" and add:
       - **Name**: `Authorization`
       - **Value**: `Bearer YOUR_CRON_SECRET` (replace `YOUR_CRON_SECRET` with your actual secret)
     - **Status**: Enable the cron job
     - **Notifications**: (Optional) Enable email notifications for failures

6. **Save and activate**:
   - Click "Create cronjob" to save
   - The cron job will start running automatically

**Important Notes:**
- ⚠️ **Security**: Never share your `CRON_SECRET` publicly. Keep it secure.
- ⚠️ **Rate Limits**: cron-job.org free tier allows up to 1 job per minute, which is perfect for this use case.
- ✅ **Monitoring**: cron-job.org provides execution logs so you can monitor if the job is running successfully.
- ✅ **Testing**: You can manually trigger the job from cron-job.org dashboard to test it.

**Alternative: Using curl command in cron-job.org**
If you prefer using a command instead of URL:
- **Address (URL)**: Leave empty or use a placeholder
- **Request method**: Select `GET`
- **Request headers**: Same as above
- Or use the "Execute script" option with:
  ```bash
  curl -X GET "https://your-domain.com/api/cron/reminders" \
    -H "Authorization: Bearer YOUR_CRON_SECRET"
  ```

#### Option C: Using External Cron Service (Generic)
Set up a cron job to call:
```bash
curl -X GET "https://your-domain.com/api/cron/reminders" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

#### Option D: Using GitHub Actions (for testing)
Create `.github/workflows/reminder-check.yml`:
```yaml
name: Check Reminders
on:
  schedule:
    - cron: '* * * * *'  # Every minute
  workflow_dispatch:  # Allow manual trigger

jobs:
  check-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Check Reminders
        run: |
          curl -X GET "${{ secrets.API_URL }}/api/cron/reminders" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

### 3. Testing
You can manually test the endpoint:
```bash
curl -X GET "http://localhost:3000/api/cron/reminders" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Features

- ✅ Checks all active reminders every minute
- ✅ Sends notifications 5 minutes before reminder time
- ✅ Prevents duplicate notifications (10-minute cache)
- ✅ Handles all reminder frequencies:
  - Once
  - Daily
  - Weekly (specific days)
  - Monthly
  - Yearly (birthdays)
  - Hourly
  - Minutely
- ✅ Only sends to users with verified WhatsApp numbers
- ✅ Logs all notifications for debugging

## Response Format

```json
{
  "success": true,
  "message": "Reminder check completed",
  "checkedAt": "2025-01-15T10:30:00.000Z",
  "remindersChecked": 25,
  "notificationsSent": 3,
  "notificationsSkipped": 1,
  "errors": []
}
```

## Troubleshooting

1. **No notifications being sent**:
   - Check that reminders are active
   - Verify users have verified WhatsApp numbers
   - Check logs for errors
   - Ensure cron job is running

2. **Duplicate notifications**:
   - The cache should prevent this, but if it happens, check the cache TTL
   - Verify cron job isn't running multiple times

3. **Reminders not calculating correctly**:
   - Check reminder frequency and date/time fields
   - Verify timezone handling
   - Check logs for calculation errors

