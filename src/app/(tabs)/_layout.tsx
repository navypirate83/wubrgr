/* =====================================================================
   THE TABS ALONG THE BOTTOM
   The app's five main screens, one tab each: Home, The Shelf (your
   binders), Card Finder (searching Scryfall), Scan (the card scanner) and
   Settings. (One more screen lives here without a tab of its own: the
   Admin's People page, so the tabs or side menu stay up on it.) Tapping a
   tab switches screens; each screen stays as you left it (scrolled
   down, a search typed in) when you switch back. The Card Finder tab takes you back to
   the last place there (the Cards tab, the list of sets, or the set you were in). The Shelf tab takes you
   back to the last place you were in the shelf, or, if you're already inside
   a binder, list or deck, up to that part's main page (see lib/shelfMemory.ts).
   This is Expo Router's "Tabs": every file in this (tabs) folder is one
   tab, and the list below says each one's title and icon. (The brackets
   in "(tabs)" mean the folder's name isn't part of the address: Card
   Finder is just /search.)
   On a wide window (a tablet, an opened foldable, the website) the tabs
   move from the bottom to a menu down the left side, full or slim: see
   components/SideMenu.tsx and lib/layoutSize.ts for the rule. Narrow
   windows (phones) keep the bottom tabs exactly as before.
   ===================================================================== */

import { Tabs, router, usePathname } from 'expo-router';
import type { ColorValue } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import HelpButton from '@/components/HelpButton';
import AppTitle from '@/components/AppTitle';
import AppHeader from '@/components/AppHeader';
import SideMenu from '@/components/SideMenu';
import { useMenuStyle } from '@/hooks/useMenuStyle';
import { useColors } from '@/hooks/useTheme';
import { shelfHref, shelfRootHref } from '@/lib/shelfMemory';
import { finderHref } from '@/lib/finderMemory';
import { mark } from '@/lib/scanner/crashTrail';

// One tab's icon: an outline normally, filled in when it's the tab you're on
function tabIcon(name: keyof typeof Ionicons.glyphMap, filled: keyof typeof Ionicons.glyphMap) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) =>
    <Ionicons name={focused ? filled : name} size={size} color={color as string} />;
}

export default function TabsLayout() {
  const colors = useColors();
  // Which menu fits this window: "none" (the bottom tabs), "slim" or "full"
  const menu = useMenuStyle();
  // The address now, so the Shelf tab knows whether you're already in the shelf
  const pathname = usePathname();
  // Are we on the Admin's People page? (It has no tab of its own, so the Settings tab is lit up for it.)
  const onPeople = pathname === '/admin';
  return (
    <Tabs
      // On a wide window, draw our own side menu instead of the bottom
      // tabs (undefined = the usual bottom tabs)
      tabBar={menu === 'none' ? undefined : () => <SideMenu style={menu} />}
      screenOptions={{
        // The tab bar goes down the left side when there's a side menu
        tabBarPosition: menu === 'none' ? 'bottom' : 'left',
        // Every screen's bar at the top is the app's own, so they're all
        // the same slim size (see AppHeader.tsx)
        header: (props) => <AppHeader {...props} />,
        // The tab you're on is orange; the others are the quieter gray
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        // Just the icons, no words under them (each tab's name is still
        // read out by screen readers)
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* Home: the welcome screen */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          // The app's name, in the five Magic colors (see AppTitle.tsx)
          headerTitle: () => <AppTitle />,
          tabBarIcon: tabIcon('home-outline', 'home'),
          headerRight: () => <HelpButton />,
        }}
      />
      {/* The Shelf: its own stack of screens (the shelf, then a binder
          slides in on top), which draws its own headers */}
      <Tabs.Screen
        name="binders"
        options={{ title: 'The Shelf', headerShown: false, tabBarIcon: tabIcon('library-outline', 'library') }}
        // Tapping it from another tab (Settings, the Card Finder) goes back to
        // where you were in the shelf (the binder or list you had open). Tapping
        // it while you're already inside a binder, list or deck goes to that
        // part's main page: the shelf of binders, the lists page or the decks page.
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.navigate((shelfRootHref(pathname) ?? shelfHref()) as never);
          },
        }}
      />
      {/* Card Finder: searching for any Magic card */}
      <Tabs.Screen
        name="search"
        options={{
          title: 'Card Finder',
          tabBarIcon: tabIcon('search-outline', 'search'),
          headerRight: () => <HelpButton topic="finder" />,
        }}
        // Tapping it from another tab goes back to the last place in the Card Finder: the Cards
        // tab, the list of sets, or the set you were looking in (see lib/finderMemory.ts). Tapping
        // it while you're already there changes nothing.
        listeners={{
          tabPress: (event) => {
            if (pathname === '/search') return;
            event.preventDefault();
            router.navigate(finderHref() as never);
          },
        }}
      />
      {/* Scan: the card scanner (a camera drawn as an outline, like the other icons) */}
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: tabIcon('camera-outline', 'camera'),
        }}
        // Write "scan tab pressed" in the crash diary the moment the tab is tapped, before the Scan screen
        // starts loading (so a crash while it loads leaves a trace)
        listeners={{ tabPress: () => mark('scan tab pressed') }}
      />
      {/* Settings. Its icon is also lit up (filled in, orange) while you're on
          the People page, since that page is reached from Settings. */}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused || onPeople ? 'settings' : 'settings-outline'} size={size} color={onPeople ? colors.accent : (color as string)} />
          ),
          headerRight: () => <HelpButton topic="settings" />,
        }}
      />
      {/* People (/admin): the Admin page, only for admins (the page sends
          everyone else home). It is one of the tab screens so the bottom tabs
          or the side menu stay up on it, but its own tab button is hidden
          (display: 'none'): the way in is still the button in Settings.
          (Not "href: null": in this version of Expo Router that makes the
          page itself unreachable, sending you Home instead.) */}
      <Tabs.Screen
        name="admin"
        options={{
          title: 'People',
          tabBarItemStyle: { display: 'none' },
          headerRight: () => <HelpButton topic="admin" />,
        }}
      />
    </Tabs>
  );
}
