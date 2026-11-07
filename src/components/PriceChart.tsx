import { useMemo, useState } from 'react';
import { GestureResponderEvent, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { inr } from '../lib/rates';
import { useTheme } from '../lib/theme';

type Props = { data: { t: number; v: number }[]; color: string; height?: number; unitLabel: string };

export function PriceChart({ data, color, height = 180, unitLabel }: Props) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (data.length < 2 || !w) return null;
    const vs = data.map((d) => d.v);
    const min = Math.min(...vs), max = Math.max(...vs);
    const pad = (max - min) * 0.1 || 1;
    const lo = min - pad, hi = max + pad;
    const x = (i: number) => (i / (data.length - 1)) * w;
    const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
    const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.v).toFixed(1)}`).join('');
    return { line, area: `${line}L${w},${height}L0,${height}Z`, x, y, min, max };
  }, [data, w, height]);

  const onTouch = (e: GestureResponderEvent) => {
    if (!w || data.length < 2) return;
    const i = Math.round((e.nativeEvent.locationX / w) * (data.length - 1));
    setSel(Math.max(0, Math.min(data.length - 1, i)));
  };

  const shown = sel != null ? data[sel] : data[data.length - 1];
  const first = data[0]?.v, last = data[data.length - 1]?.v;
  const change = first ? ((last - first) / first) * 100 : 0;
  const small = { color: c.sub, fontSize: 12, marginTop: 2 } as const;

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
        <View>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>
            {shown ? inr(shown.v) : '—'} <Text style={{ color: c.sub, fontSize: 12, fontWeight: '400' }}>{unitLabel}</Text>
          </Text>
          <Text style={small}>
            {shown ? new Date(shown.t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
            {sel == null ? '  · tap & drag the chart' : ''}
          </Text>
        </View>
        {data.length > 1 && (
          <Text style={{ fontSize: 14, fontWeight: '700', color: change >= 0 ? c.up : c.down }}>
            {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
          </Text>
        )}
      </View>
      <View
        style={{ height }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onTouch}
        onResponderMove={onTouch}
        onResponderRelease={() => setSel(null)}
        onResponderTerminate={() => setSel(null)}
      >
        {geo ? (
          <Svg width={w} height={height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.28} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={geo.area} fill="url(#fill)" />
            <Path d={geo.line} stroke={color} strokeWidth={2.2} fill="none" />
            {sel != null && (
              <>
                <Line x1={geo.x(sel)} x2={geo.x(sel)} y1={0} y2={height} stroke={c.faint} strokeDasharray="4 4" />
                <Circle cx={geo.x(sel)} cy={geo.y(data[sel].v)} r={5} fill={color} stroke={c.card} strokeWidth={2} />
              </>
            )}
          </Svg>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={small}>Loading chart…</Text></View>
        )}
      </View>
      {geo && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Text style={small}>Low {inr(geo.min)}</Text>
          <Text style={small}>High {inr(geo.max)}</Text>
        </View>
      )}
    </View>
  );
}
