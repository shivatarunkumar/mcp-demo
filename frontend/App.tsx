import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <View style={eb.container}>
          <Text style={eb.title}>Something went wrong</Text>
          <Text style={eb.msg}>{(this.state.error as Error).message}</Text>
          <TouchableOpacity style={eb.btn} onPress={() => this.setState({ error: null })}>
            <Text style={eb.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const eb = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '700', color: '#ef4444', marginBottom: 12 },
  msg: { fontSize: 13, color: '#475569', textAlign: 'center', marginBottom: 24 },
  btn: { backgroundColor: '#6366f1', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

import LandingScreen from './src/screens/LandingScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ChatScreen from './src/screens/ChatScreen';
import TalkToDataScreen from './src/screens/TalkToDataScreen';
import AdminScreen from './src/screens/AdminScreen';
import AccessScreen from './src/screens/AccessScreen';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Landing: undefined;
  Chat: undefined;
  TalkToData: undefined;
  Admin: undefined;
  Access: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  const { theme, toggle } = useTheme();
  const { token, user } = useAuth();

  if (!token) {
    return (
      <>
        <StatusBar style="dark" />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </Stack.Navigator>
      </>
    );
  }

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
        <Stack.Screen
          name="Access"
          component={AccessScreen}
          options={{ title: 'Data Access' }}
        />
        {user?.role === 'admin' && (
          <Stack.Screen
            name="Admin"
            component={AdminScreen}
            options={{ title: 'Admin Panel' }}
          />
        )}
      </Stack.Navigator>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
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
