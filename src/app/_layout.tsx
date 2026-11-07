import { Href, router } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { StatusBar } from 'expo-status-bar';
import { ComponentRef, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Blur, GlassTabBar, TabDef, TabIcons } from '../components/GlassTabBar';
import { notificationsAvailable, useLastNotificationResponse } from '../lib/notify';
import { ThemeProvider, useTheme } from '../lib/theme';
import { syncPriceCheckTask } from '../tasks/priceCheck';

// The Android blur samples this view; a plain View when the build has no blur module.
const BlurTarget = Blur?.BlurTargetView ?? View;

const TABS: TabDef[] = [
  { name: 'index', label: 'Gold & Silver', icon: TabIcons.rates },
  { name: 'watchlist', label: 'RAM / SSD', icon: TabIcons.chip },
  { name: 'alerts', label: 'Alerts', icon: TabIcons.bell },
];

/** Tapping an alert notification opens the tab it is about. */
function OpenFromNotification() {
  const response = useLastNotificationResponse();
  useEffect(() => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string') router.navigate(url as Href);
  }, [response]);
  return null;
}

function ThemedTabs() {
  const { mode, c } = useTheme();
  const blurTarget = useRef<ComponentRef<typeof View>>(null);
useEffect(() => { syncPriceCheckTask(); }, []);

  return (
    <>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      <Tabs style={{ flex: 1, backgroundColor: c.bg }}>
        {/* Screens render inside the blur target so the floating bar can blur them on Android. */}
        <BlurTarget ref={blurTarget} style={{ flex: 1, backgroundColor: c.bg }}>
          <TabSlot />
        </BlurTarget>
        <TabList style={{ display: 'none' }}>
          <TabTrigger name="index" href="/" />
          <TabTrigger name="watchlist" href="/watchlist" />
          <TabTrigger name="alerts" href="/alerts" />
        </TabList>
        <GlassTabBar tabs={TABS} blurTarget={blurTarget} />
        {notificationsAvailable && <OpenFromNotification />}
      </Tabs>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedTabs />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
