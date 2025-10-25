'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';
import { logger } from '@imaginecalendar/logger';

export const updateClerkOnboardingMetadata = async () => {
  const { userId } = await auth();

  if (!userId) {
    return { error: 'No logged in user' };
  }

  const client = await clerkClient();

  try {
    const res = await client.users.updateUser(userId, {
      publicMetadata: {
        onboardingComplete: true,
      },
    });
    return { success: true, metadata: res.publicMetadata };
  } catch (err) {
    logger.error({ error: err }, 'Error updating Clerk metadata');
    return { error: 'There was an error updating the user metadata.' };
  }
};