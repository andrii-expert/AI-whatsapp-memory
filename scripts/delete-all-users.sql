-- ============================================
-- Delete All Users Script for ImagineCalendar
-- Run this in pgAdmin to delete all user data
-- ============================================

-- Start transaction
BEGIN;

-- Show current counts before deletion
SELECT 
    'Before deletion:' as status,
    (SELECT COUNT(*) FROM users) as users,
    (SELECT COUNT(*) FROM user_preferences) as preferences,
    (SELECT COUNT(*) FROM subscriptions) as subscriptions,
    (SELECT COUNT(*) FROM payments) as payments,
    (SELECT COUNT(*) FROM calendar_connections) as calendars,
    (SELECT COUNT(*) FROM whatsapp_numbers) as whatsapp,
    (SELECT COUNT(*) FROM activity_logs) as logs;

-- Delete all users (cascades to all related tables due to foreign key constraints)
DELETE FROM users;

-- Show counts after deletion (should all be 0)
SELECT 
    'After deletion:' as status,
    (SELECT COUNT(*) FROM users) as users,
    (SELECT COUNT(*) FROM user_preferences) as preferences,
    (SELECT COUNT(*) FROM subscriptions) as subscriptions,
    (SELECT COUNT(*) FROM payments) as payments,
    (SELECT COUNT(*) FROM calendar_connections) as calendars,
    (SELECT COUNT(*) FROM whatsapp_numbers) as whatsapp,
    (SELECT COUNT(*) FROM activity_logs) as logs;

-- Commit the transaction
COMMIT;

-- Run VACUUM separately after the transaction (optional)
-- VACUUM ANALYZE users, user_preferences, subscriptions, payments, calendar_connections, whatsapp_numbers, activity_logs;