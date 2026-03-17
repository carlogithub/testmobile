import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './src/screens/HomeScreen';
import ClimateContextScreen from './src/screens/ClimateContextScreen';
import { DayForecast, LocationInfo } from './src/types';

export type RootStackParamList = {
  Home: undefined;
  ClimateContext: { location: LocationInfo; forecast: DayForecast[] };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home"           component={HomeScreen} />
          <Stack.Screen name="ClimateContext" component={ClimateContextScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
