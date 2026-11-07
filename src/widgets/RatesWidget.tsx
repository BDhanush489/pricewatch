// Android home-screen widget (expo-widgets + Jetpack Compose / Glance).
// Rules of the widget runtime: no hooks, no async, no module-level constants or helpers —
// everything must be written inline or passed in as props (so colours come from the app's theme).
// Supported here: Box, Column, Row, Spacer, Text + background, cornerRadius, padding, size, fill* modifiers.
import { Box, Column, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  background, cornerRadius, fillMaxSize, fillMaxWidth, height, padding, paddingAll, size, width,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';

export type RatesWidgetProps = {
  dark: boolean;
  gold24: string;
  gold22: string;
  silver: string; // per kg
  goldChange: string; // e.g. "▲ 0.82%"
  goldUp: boolean | null; // null = no change data
  silverChange: string;
  silverUp: boolean | null;
  updated: string;
};

const RatesWidget = (props: RatesWidgetProps) => {
  'widget';
  return (
    <Column modifiers={[fillMaxSize(), cornerRadius(24), background(props.dark ? '#121216' : '#fbfaf7'), paddingAll(16)]}>
      {/* Header */}
      <Row modifiers={[fillMaxWidth()]} verticalAlignment="center" horizontalArrangement="spaceBetween">
        <Row verticalAlignment="center">
          <Box modifiers={[size(10, 10), cornerRadius(5), background(props.dark ? '#f5c542' : '#c9961a')]} />
          <Spacer modifiers={[width(8)]} />
          <Text color={props.dark ? '#ffffff' : '#1d1b16'} style={{ fontSize: 14, fontWeight: 'bold' }} maxLines={1}>
            Bangalore rates
          </Text>
        </Row>
        <Text color={props.dark ? '#9a9aa5' : '#8a8478'} style={{ fontSize: 11 }} maxLines={1}>excl. GST</Text>
      </Row>
      <Spacer modifiers={[height(12)]} />

      {/* Gold 24K */}
      <Row
        modifiers={[fillMaxWidth(), cornerRadius(16), background(props.dark ? '#241e0e' : '#fbf1d6'), padding(14, 10, 14, 10)]}
        verticalAlignment="center" horizontalArrangement="spaceBetween"
      >
        <Column>
          <Text color={props.dark ? '#f5c542' : '#8a6408'} style={{ fontSize: 14, fontWeight: 'bold' }} maxLines={1}>Gold 24K</Text>
          <Text color={props.dark ? '#9a9aa5' : '#8a8478'} style={{ fontSize: 11 }} maxLines={1}>per gram</Text>
        </Column>
        <Column horizontalAlignment="end">
          <Text color={props.dark ? '#ffffff' : '#1d1b16'} style={{ fontSize: 18, fontWeight: 'bold' }} maxLines={1}>{props.gold24}</Text>
          <Text
            color={props.goldUp == null ? '#8a8478' : props.goldUp ? (props.dark ? '#4ade80' : '#15803d') : (props.dark ? '#f87171' : '#dc2626')}
            style={{ fontSize: 11, fontWeight: 'bold' }} maxLines={1}
          >{props.goldChange}</Text>
        </Column>
      </Row>
      <Spacer modifiers={[height(8)]} />

      {/* Gold 22K */}
      <Row
        modifiers={[fillMaxWidth(), cornerRadius(16), background(props.dark ? '#1d1910' : '#fdf7e8'), padding(14, 10, 14, 10)]}
        verticalAlignment="center" horizontalArrangement="spaceBetween"
      >
        <Column>
          <Text color={props.dark ? '#e0b54a' : '#8a6408'} style={{ fontSize: 14, fontWeight: 'bold' }} maxLines={1}>Gold 22K</Text>
          <Text color={props.dark ? '#9a9aa5' : '#8a8478'} style={{ fontSize: 11 }} maxLines={1}>per gram · 916</Text>
        </Column>
        <Column horizontalAlignment="end">
          <Text color={props.dark ? '#ffffff' : '#1d1b16'} style={{ fontSize: 18, fontWeight: 'bold' }} maxLines={1}>{props.gold22}</Text>
          <Text
            color={props.goldUp == null ? '#8a8478' : props.goldUp ? (props.dark ? '#4ade80' : '#15803d') : (props.dark ? '#f87171' : '#dc2626')}
            style={{ fontSize: 11, fontWeight: 'bold' }} maxLines={1}
          >{props.goldChange}</Text>
        </Column>
      </Row>
      <Spacer modifiers={[height(8)]} />

      {/* Silver */}
      <Row
        modifiers={[fillMaxWidth(), cornerRadius(16), background(props.dark ? '#1b1d22' : '#eef1f5'), padding(14, 10, 14, 10)]}
        verticalAlignment="center" horizontalArrangement="spaceBetween"
      >
        <Column>
          <Text color={props.dark ? '#c0c7d1' : '#4b5563'} style={{ fontSize: 14, fontWeight: 'bold' }} maxLines={1}>Silver</Text>
          <Text color={props.dark ? '#9a9aa5' : '#8a8478'} style={{ fontSize: 11 }} maxLines={1}>per kg · 999</Text>
        </Column>
        <Column horizontalAlignment="end">
          <Text color={props.dark ? '#ffffff' : '#1d1b16'} style={{ fontSize: 18, fontWeight: 'bold' }} maxLines={1}>{props.silver}</Text>
          <Text
            color={props.silverUp == null ? '#8a8478' : props.silverUp ? (props.dark ? '#4ade80' : '#15803d') : (props.dark ? '#f87171' : '#dc2626')}
            style={{ fontSize: 11, fontWeight: 'bold' }} maxLines={1}
          >{props.silverChange}</Text>
        </Column>
      </Row>

      <Spacer modifiers={[height(10)]} />
      <Text color={props.dark ? '#62626c' : '#a09a8d'} style={{ fontSize: 11 }} maxLines={1}>{props.updated}</Text>
    </Column>
  );
};

export default createWidget<RatesWidgetProps>('RatesWidget', RatesWidget, {
  dark: false,
  gold24: '—', gold22: '—', silver: '—',
  goldChange: '', goldUp: null, silverChange: '', silverUp: null,
  updated: 'Open PriceWatch to load rates',
});
