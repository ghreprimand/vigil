import { sendWeeklyDigest, sendStalenessAlert, sendMonthlyDigest } from '../services/notifications.js';
import { logger } from '../utils/logger.js';

export async function processDigestMailer(): Promise<void> {
  logger.info('Digest mailer: starting');
  await sendWeeklyDigest();
  await sendStalenessAlert();

  // Monthly digest - runs every week but self-deduplicates (25-day guard)
  await sendMonthlyDigest();

  logger.info('Digest mailer: done');
}
