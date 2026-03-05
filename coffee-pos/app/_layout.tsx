import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  Storefront,
  ClipboardText,
  ForkKnife,
  Coins,
  Code,
} from 'phosphor-react-native';
import type { IconProps } from 'phosphor-react-native';
import { colors, fontSize, fontWeight } from '../constants/theme';

function TabIcon({
  Icon,
  focused,
}: {
  Icon: React.ComponentType<IconProps>;
  focused: boolean;
}) {
  return (
    <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
      <Icon
        size={18}
        color={focused ? colors.textInverse : colors.textMuted}
        weight={focused ? 'fill' : 'regular'}
      />
    </View>
  );
}

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.card,
            shadowColor: 'transparent',
            elevation: 0,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            fontWeight: fontWeight.bold,
            fontSize: fontSize.lg,
          },
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 52,
            paddingBottom: 4,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarActiveTintColor: colors.textPrimary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: fontWeight.semibold,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'POS',
            headerTitle: 'Point of Sale',
            tabBarIcon: ({ focused }) => (
              <TabIcon Icon={Storefront} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Orders',
            headerTitle: 'Orders',
            tabBarIcon: ({ focused }) => (
              <TabIcon Icon={ClipboardText} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="menu"
          options={{
            title: 'Menu',
            headerTitle: 'Menu Management',
            tabBarIcon: ({ focused }) => (
              <TabIcon Icon={ForkKnife} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="costing"
          options={{
            title: 'Costing',
            headerTitle: 'Costing',
            tabBarIcon: ({ focused }) => (
              <TabIcon Icon={Coins} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="developer"
          options={{
            title: 'Dev',
            headerTitle: 'Developer',
            tabBarIcon: ({ focused }) => (
              <TabIcon Icon={Code} focused={focused} />
            ),
          }}
        />
      </Tabs>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconContainerActive: {
    backgroundColor: colors.textPrimary,
  },
});
