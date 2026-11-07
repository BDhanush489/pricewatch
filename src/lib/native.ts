// Which optional native modules exist in the installed app build.
//
// A JS package whose native side is missing (e.g. new JS loaded into an older development
// build, or Expo Go) throws as soon as it is imported and crashes the app at startup. So these
// packages are only `require`d after checking here, and their features switch off gracefully.
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

const has = (...names: string[]) => names.every((n) => requireOptionalNativeModule(n) != null);
const web = Platform.OS === 'web';

export const native = {
  /** Local notifications for price alerts. */
  notifications: !web && has('ExpoNotificationsEmitter', 'ExpoNotificationScheduler', 'ExpoNotificationPermissionsModule'),
  /** Background price checks. */
  backgroundTask: !web && has('ExpoTaskManager', 'ExpoBackgroundTask'),
  /** Blur behind the tab bar (web uses CSS, no native module). */
  blur: web || has('ExpoBlur'),
  /** Apple Liquid Glass (iOS 26+). */
  glass: Platform.OS === 'ios' && has('ExpoGlassEffect'),
};
