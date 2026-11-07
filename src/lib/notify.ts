// Local notifications for price alerts. No push server or FCM needed — the app checks
// prices itself (see src/tasks/priceCheck.ts) and posts the notification on-device.
import type * as NotificationsModule from 'expo-notifications';
import { Platform } from 'react-native';
import { native } from './native';

// Loaded only when the installed build includes it (see native.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const N: typeof NotificationsModule | null = native.notifications ? require('expo-notifications') : null;

export const ALERT_CHANNEL = 'price-alerts';
export const notificationsAvailable = N != null;

// Show alerts as a banner even while the app is open.
N?.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let channel: Promise<unknown> | null = null;
const ensureChannel = () => {
  if (!N || Platform.OS !== 'android') return Promise.resolve();
  channel ??= N.setNotificationChannelAsync(ALERT_CHANNEL, {
    name: 'Price alerts',
    description: 'When a price crosses one of your targets',
    importance: N.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#f5c542',
  }).catch(() => { channel = null; });
  return channel;
};

/** `unavailable` = this app build has no notification support (needs a new build). */
export type PermissionState = 'granted' | 'undetermined' | 'denied' | 'unavailable';
const toState = (p: NotificationsModule.NotificationPermissionsStatus): PermissionState =>
  p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';

export async function getPermission(): Promise<PermissionState> {
  if (!N) return 'unavailable';
  try { return toState(await N.getPermissionsAsync()); } catch { return 'denied'; }
}

export async function requestPermission(): Promise<PermissionState> {
  if (!N) return 'unavailable';
  // Android 13+ only shows the permission prompt once a notification channel exists.
  await ensureChannel();
  try { return toState(await N.requestPermissionsAsync()); } catch { return 'denied'; }
}

/** Posts a notification right away. `url` is the in-app route opened when it is tapped. */
export async function notify(title: string, body: string, url?: string) {
  if (!N) return;
  await ensureChannel();
  await N.scheduleNotificationAsync({
    content: { title, body, data: url ? { url } : {} },
    trigger: Platform.OS === 'android' ? { channelId: ALERT_CHANNEL } : null,
  });
}

/** Hook: the notification the user last tapped (null/undefined if none). Only call when available. */
export const useLastNotificationResponse = () => N!.useLastNotificationResponse();
