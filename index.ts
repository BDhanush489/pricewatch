// App entry. Expo Router starts the app; the price-check task is defined here, at load time,
// so it also exists when Android wakes the app in the background with no screens mounted.
import 'expo-router/entry';
import './src/tasks/priceCheck';
