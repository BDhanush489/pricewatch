// Background price check for alerts. Android runs it through WorkManager roughly every
// 15 minutes (the OS minimum; it may run later on battery saver), iOS when the system allows.
//
// Imported from the app entry (index.ts) so the task is defined even when Android starts the
// app in the background with no screen mounted.
import type * as BackgroundTaskModule from 'expo-background-task';
import type * as TaskManagerModule from 'expo-task-manager';
import { loadAlerts, runPriceCheck } from '../lib/alerts';
import { native } from '../lib/native';

// Loaded only when the installed build includes them (see lib/native.ts).
/* eslint-disable @typescript-eslint/no-require-imports */
const BT: typeof BackgroundTaskModule | null = native.backgroundTask ? require('expo-background-task') : null;
const TM: typeof TaskManagerModule | null = native.backgroundTask ? require('expo-task-manager') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

export const PRICE_CHECK_TASK = 'pricewatch-price-check';
export const backgroundChecksAvailable = BT != null && TM != null;

if (BT && TM) {
  TM.defineTask(PRICE_CHECK_TASK, async () => {
    try {
      await runPriceCheck();
      return BT.BackgroundTaskResult.Success;
    } catch {
      return BT.BackgroundTaskResult.Failed;
    }
  });
}

/** Keeps the background check registered only while there are alerts to watch. */
export async function syncPriceCheckTask() {
  if (!BT || !TM) return;
  try {
    const [alerts, registered] = await Promise.all([loadAlerts(), TM.isTaskRegisteredAsync(PRICE_CHECK_TASK)]);
    if (alerts.length && !registered) await BT.registerTaskAsync(PRICE_CHECK_TASK, { minimumInterval: 15 });
    else if (!alerts.length && registered) await BT.unregisterTaskAsync(PRICE_CHECK_TASK);
  } catch {
    // Not fatal: foreground checks continue.
  }
}
