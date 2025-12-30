# Calendar Events Cron Job Setup

## Overview
The calendar events notification system sends WhatsApp messages to users before their calendar events start. The system checks for upcoming events and sends notifications at the configured time before each event.

## How It Works

1. **API Endpoint**: `/api/cron/calendar-events`
2. **Frequency**: Should be called every 1 minute by a cron job
3. **Functionality**:
   - Checks all active calendar connections every minute
   - Fetches upcoming events from Google/Microsoft calendars
   - Sends WhatsApp notification when event time is within the notification window (e.g., 10 minutes before)
   - Sends "Alert received" message to all users with calendar connections
   - Prevents duplicate notifications using in-memory cache (10-minute TTL)
   - Handles timing variations with ±1 minute tolerance

## Setup Instructions

### 1. Environment Variable
The same `CRON_SECRET` used for reminders is used here. Make sure it's set in your `.env` file:
```
CRON_SECRET=your-secret-key-here
```

### 2. Cron Job Setup

#### Option A: Using Vercel Cron (Recommended for Vercel deployments)
Add to `vercel.json` (add this alongside your reminders cron):
```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/cron/calendar-events",
      "schedule": "* * * * *"
    }
  ]
}
```

#### Option B: Using cron-job.org (Recommended for self-hosted deployments)

**Step-by-step setup:**

1. **Use the same CRON_SECRET** (already set up for reminders)

2. **Get your application URL**:
   - Production: `https://your-domain.com` (e.g., `https://dashboard.crackon.ai`)
   - The full endpoint will be: `https://your-domain.com/api/cron/calendar-events`

3. **Create a new cron job on cron-job.org**:
   - Go to https://cron-job.org
   - Click "Create cronjob" or "New cronjob"
   - Fill in the following details:
     - **Title**: `Calendar Events Notifications Check`
     - **Address (URL)**: `https://your-domain.com/api/cron/calendar-events`
     - **Schedule**: Select "Every minute" or use cron expression: `* * * * *`
     - **Request method**: Select `GET`
     - **Request headers**: Click "Add header" and add:
       - **Name**: `Authorization`
       - **Value**: `Bearer YOUR_CRON_SECRET` (same secret as reminders)
     - **Status**: Enable the cron job
     - **Notifications**: (Optional) Enable email notifications for failures

4. **Save and activate**:
   - Click "Create cronjob" to save
   - The cron job will start running automatically

**Important Notes:**
- ⚠️ **Security**: Use the same `CRON_SECRET` as your reminders cron job
- ✅ **Frequency**: Both cron jobs run every minute - this is normal and expected
- ✅ **Monitoring**: cron-job.org provides execution logs so you can monitor if the job is running successfully
- ✅ **Testing**: You can manually trigger the job from cron-job.org dashboard to test it

#### Option C: Using External Cron Service (Generic)
Set up a cron job to call:
```bash
curl -X GET "https://your-domain.com/api/cron/calendar-events" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

#### Option D: Using System Cron (Linux/Unix)
Add to your crontab (`crontab -e`):
```bash
* * * * * curl -X GET "https://your-domain.com/api/cron/calendar-events" -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 3. Testing
You can manually test the endpoint:
```bash
curl -X GET "http://localhost:3000/api/cron/calendar-events" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Or test in production:
```bash
curl -X GET "https://your-domain.com/api/cron/calendar-events" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Features

- ✅ Checks all active calendar connections every minute
- ✅ Sends "Alert received" message to all users with calendar connections
- ✅ Sends event reminder notifications at configured time before events (e.g., 10 minutes)
- ✅ Prevents duplicate notifications (10-minute cache)
- ✅ Handles timing variations with ±1 minute tolerance
- ✅ Supports Google Calendar and Microsoft Calendar
- ✅ Only sends to users with verified WhatsApp numbers
- ✅ Respects user's timezone settings
- ✅ Logs all notifications for debugging

## Response Format

```json
{
  "success": true,
  "message": "Calendar events check completed",
  "checkedAt": "2025-01-15T10:30:00.000Z",
  "connectionsChecked": 5,
  "notificationsSent": 2,
  "notificationsSkipped": 0,
  "alertsSent": 3,
  "usersProcessed": 3,
  "errors": []
}
```

## User Preferences

Users can configure:
- **Calendar Notifications**: Enable/disable calendar event notifications
- **Notification Time**: How many minutes before the event to send notification (default: 10 minutes)

These settings are in the user's preferences page.

## Troubleshooting

1. **No notifications being sent**:
   - Check that users have calendar notifications enabled in preferences
   - Verify users have active calendar connections
   - Verify users have verified WhatsApp numbers
   - Check logs for errors
   - Ensure cron job is running

2. **Duplicate notifications**:
   - The cache should prevent this, but if it happens, check the cache TTL
   - Verify cron job isn't running multiple times

3. **Events not being detected**:
   - Check that calendar connections are active
   - Verify calendar access tokens are valid
   - Check logs for API errors
   - Verify events are within the 24-hour window

4. **"Alert received" not being sent**:
   - Check that users have active calendar connections
   - Verify users have verified WhatsApp numbers
   - Check logs for errors

## Summary

You need **TWO separate cron jobs**:
1. `/api/cron/reminders` - For reminder notifications (already set up)
2. `/api/cron/calendar-events` - For calendar event notifications (needs to be set up)

Both use the same `CRON_SECRET` and run every minute.

