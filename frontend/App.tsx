import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';

import LandingScreen from './src/screens/LandingScreen';
import ChatScreen from './src/screens/ChatScreen';
import TalkToDataScreen from './src/screens/TalkToDataScreen';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

export type RootStackParamList = {
  Landing: undefined;
  Chat: undefined;
  TalkToData: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  const { theme, toggle } = useTheme();

  return (
    <>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack.Navigator
        initialRouteName="Landing"
        screenOptions={{
          headerStyle: { backgroundColor: theme.headerBg },
          headerTitleStyle: { fontWeight: '700', color: theme.headerText },
          headerTintColor: theme.accent,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen
          name="Landing"
          component={LandingScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Chat"
          component={ChatScreen}
          options={{ title: '🤖 LLM Assistant' }}
        />
        <Stack.Screen
          name="TalkToData"
          component={TalkToDataScreen}
          options={{
            title: '🗄️ Query Your Database',
            headerRight: () => (
              <View style={styles.headerRight}>
                <TouchableOpacity
                  style={[styles.headerBtn, { backgroundColor: theme.accentBg, borderColor: theme.accentBorder }]}
                  onPress={toggle}
                  activeOpacity={0.75}
                >
                  <Text style={styles.headerBtnIcon}>{theme.dark ? '☀️' : '🌙'}</Text>
                  <Text style={[styles.headerBtnLabel, { color: theme.accent }]}>
                    {theme.dark ? 'Light' : 'Dark'}
                  </Text>
                </TouchableOpacity>
              </View>
            ),
          }}
        />
      </Stack.Navigator>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 4,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  headerBtnIcon: { fontSize: 14 },
  headerBtnLabel: { fontSize: 12, fontWeight: '700' },
});
