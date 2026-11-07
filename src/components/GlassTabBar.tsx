// Floating "liquid glass" tab bar.
//   iOS 26+: Apple's native Liquid Glass (expo-glass-effect).
//   Android / older iOS / web: a real blur of the screen behind it (expo-blur), with a glossy
//   top highlight, a bright rim and a sliding glass "lens" behind the selected tab.
// On Android the blur samples a <BlurTargetView> that wraps the screens (see app/_layout.tsx).
// If the installed build lacks the blur/glass native modules, a frosted fill is used instead.
import type * as BlurModule from 'expo-blur';
import type * as GlassModule from 'expo-glass-effect';
import { useTabTrigger } from 'expo-router/ui';
import { ComponentRef, ReactNode, RefObject, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { native } from '../lib/native';
import { useTheme } from '../lib/theme';

/* eslint-disable @typescript-eslint/no-require-imports */
export const Blur: typeof BlurModule | null = native.blur ? require('expo-blur') : null;
const Glass: typeof GlassModule | null = native.glass ? require('expo-glass-effect') : null;
/* eslint-enable @typescript-eslint/no-require-imports */

export const TAB_BAR_HEIGHT = 64;
const EDGE = 12; // gap below the bar when the phone has no bottom inset

/** Bottom padding a screen needs so its last item can scroll clear of the floating bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + Math.max(insets.bottom, EDGE) + 24;
}

const liquidGlass = !!Glass && Glass.isLiquidGlassAvailable() && Glass.isGlassEffectAPIAvailable();

export type TabDef = { name: string; label: string; icon: (color: string) => ReactNode };
export type BlurTargetRef = RefObject<ComponentRef<typeof View> | null>;

export function GlassTabBar({ tabs, blurTarget }: { tabs: TabDef[]; blurTarget: BlurTargetRef }) {
  const { c, mode } = useTheme();
  const dark = mode === 'dark';
  const insets = useSafeAreaInsets();
  const { getTrigger, switchTab } = useTabTrigger({ name: tabs[0].name });
  const active = Math.max(0, tabs.findIndex((t) => getTrigger(t.name)?.isFocused));

  // Sliding lens: springs to the selected tab and briefly stretches, like a drop of liquid.
  const [rowW, setRowW] = useState(0);
  const itemW = rowW ? (rowW - PAD * 2) / tabs.length : 0;
  const [x] = useState(() => new Animated.Value(0));
  const [stretch] = useState(() => new Animated.Value(1));
  const placed = useRef(false);
  useEffect(() => {
    if (!itemW) return;
    if (!placed.current) { x.setValue(active * itemW); placed.current = true; return; }
    Animated.parallel([
      Animated.spring(x, { toValue: active * itemW, useNativeDriver: true, damping: 15, stiffness: 170, mass: 0.9 }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1.22, duration: 120, useNativeDriver: true }),
        Animated.spring(stretch, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 220 }),
      ]),
    ]).start();
  }, [active, itemW, x, stretch]);

  const row = (
    <View style={s.row} onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
      {itemW > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            s.lens,
            {
              width: itemW,
              backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.78)',
              borderColor: dark ? 'rgba(255,255,255,0.18)' : 'rgba(183,134,11,0.16)',
              transform: [{ translateX: x }, { scaleX: stretch }],
            },
          ]}
        />
      )}
      {tabs.map((t, i) => {
        const focused = i === active;
        const color = focused ? c.gold : c.sub;
        return (
          <Pressable
            key={t.name}
            onPress={() => switchTab(t.name, {})}
            style={({ pressed }) => [s.item, pressed && { opacity: 0.6 }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t.label}
          >
            {t.icon(color)}
            <Text style={[s.label, { color, fontWeight: focused ? '700' : '600' }]} numberOfLines={1}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(insets.bottom, EDGE) }]}>
      {liquidGlass && Glass ? (
        <Glass.GlassView glassEffectStyle="regular" isInteractive colorScheme={mode} style={s.shell}>
          {row}
        </Glass.GlassView>
      ) : (
        <View style={[s.shell, s.clip, { borderColor: dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)' }]}>
          {Blur && (
            <Blur.BlurView
              style={StyleSheet.absoluteFill}
              blurTarget={blurTarget}
              blurMethod="dimezisBlurViewSdk31Plus"
              intensity={dark ? 50 : 60}
              tint={dark ? 'dark' : 'light'}
            />
          )}
          {/* Milky fill keeps text readable over busy content; more opaque when there is no blur. */}
          <View
            style={[StyleSheet.absoluteFill, {
              backgroundColor: dark
                ? `rgba(20,20,26,${Blur ? 0.55 : 0.97})`
                : `rgba(255,255,255,${Blur ? 0.5 : 0.97})`,
            }]}
          />
          {/* Gloss: light falling on the top half of the glass. */}
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
            <Defs>
              <LinearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#ffffff" stopOpacity={dark ? 0.12 : 0.55} />
                <Stop offset="0.6" stopColor="#ffffff" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#gloss)" />
          </Svg>
          {/* Bright rim along the top edge, fading to the sides. */}
          <View
            pointerEvents="none"
            style={[s.rim, {
              borderTopColor: dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.95)',
              borderLeftColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)',
              borderRightColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)',
            }]}
          />
          {row}
        </View>
      )}
    </View>
  );
}

const PAD = 5;
const R = TAB_BAR_HEIGHT / 2;

const s = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 16, right: 16, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
  },
  shell: { width: '100%', maxWidth: 440, height: TAB_BAR_HEIGHT, borderRadius: R },
  clip: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  rim: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: R, borderWidth: 1, borderBottomColor: 'transparent',
  },
  row: { flex: 1, flexDirection: 'row', padding: PAD },
  lens: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: R - PAD, borderWidth: 1 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11, letterSpacing: 0.2 },
});

// ---- icons (stroke style, tinted by the tab colour) ----
const line = { fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const TabIcons = {
  rates: (color: string) => (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M3 17l5.5-5.5 4 4L21 7" stroke={color} {...line} />
      <Path d="M15 7h6v6" stroke={color} {...line} />
    </Svg>
  ),
  chip: (color: string) => (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Rect x={6} y={6} width={12} height={12} rx={2} stroke={color} {...line} />
      <Path d="M9.5 2.5v3M14.5 2.5v3M9.5 18.5v3M14.5 18.5v3M2.5 9.5h3M2.5 14.5h3M18.5 9.5h3M18.5 14.5h3" stroke={color} {...line} />
    </Svg>
  ),
  bell: (color: string) => (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M6 9.5a6 6 0 0 1 12 0c0 4.8 2 6.5 2 6.5H4s2-1.7 2-6.5z" stroke={color} {...line} />
      <Path d="M10 19.5a2 2 0 0 0 4 0" stroke={color} {...line} />
    </Svg>
  ),
};
