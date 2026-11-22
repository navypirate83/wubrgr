/* =====================================================================
   THE ADMIN PAGE: PEOPLE (/admin)
   Only for accounts with the Admin right (anyone else who gets here, by
   typing the address, is sent home; Settings only shows the way in to admins).
   It lists everyone with an account, when each was last used, and the rights each has.
   A person can have any mix of these rights (or none, which is the normal app):
     - PRISM: also the PRISM section
     - AIScan: also the scanner's AI art matching option (it downloads the AI files)
     - Admin: everything, PRISM and AIScan included, and this page
   Search by name or email, or narrow the list with the buttons (All, Admin,
   PRISM, AIScan, No extra rights). Tap a person to tick or untick their rights (Save) or to
   delete them and everything they own.
   Deleting asks twice: a window listing what goes, with a box where the person's
   name has to be typed before the red button turns on.
   The safety rules (the server checks them too): you can't change or delete your own
   account here, and the last Admin can't be taken down or deleted.
   A change of rights counts on the server at once; what the person's app shows catches up within
   about 15 minutes, or when they sign in again.
   The file sits in the (tabs) folder so the bottom tabs (phones) or the side menu
   (wide windows) stay up on this page; it has no tab button of its own (see (tabs)/_layout.tsx).
   ===================================================================== */

import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Button from '@/components/Button';
import PopupWindow from '@/components/PopupWindow';
import TextField from '@/components/TextField';
import { useAccount } from '@/hooks/useAccount';
import { useColors } from '@/hooks/useTheme';
import { showMessage } from '@/lib/dialogs';
import { hapticTap } from '@/lib/haptics';
import { RADIUS } from '@/theme/colors';
import { RIGHTS, RIGHTS_ABOUT, RIGHTS_LABEL, deletePerson, joinedText, lastAccessText, listPeople, setRights, type Person, type Right } from '@/lib/adminApi';

// The page is never wider than this (points)
const PAGE_MAX_WIDTH = 900;

// The color of each right's pill (Admin in the accent color, PRISM in purple, AIScan in blue)
function rightColor(colors: ReturnType<typeof useColors>, right: Right) {
  return right === 'admin' ? colors.accent : right === 'prism' ? colors.manaB : colors.manaU;
}

// Does the list hold this right?
const holds = (roles: Right[], right: Right) => roles.includes(right);

// Do two lists hold exactly the same rights?
const sameRights = (a: Right[], b: Right[]) => a.length === b.length && a.every((r) => b.includes(r));

// A person's rights in words (also read out by screen readers)
const rightsText = (roles: Right[]) => (roles.length ? roles.map((r) => RIGHTS_LABEL[r]).join(', ') : 'No extra rights');
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'admin', label: 'Admin' },
  { id: 'prism', label: 'PRISM' },
  { id: 'aiscan', label: 'AIScan' },
  { id: 'none', label: 'No extra rights' },
] as const;
type FilterId = (typeof FILTERS)[number]['id'];

// A person's initials, for the circle beside their name
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

export default function AdminScreen() {
  const colors = useColors();
  const { isAdmin, serverUser } = useAccount();

  // Everyone (undefined: still loading), or why it couldn't load
  const [people, setPeople] = useState<Person[] | undefined>(undefined);
  const [problem, setProblem] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  // The person being looked at, which window is open for them ("edit" or "delete"), and the rights ticked in it
  const [picked, setPicked] = useState<Person | null>(null);
  const [view, setView] = useState<'edit' | 'delete' | null>(null);
  const [choice, setChoice] = useState<Right[]>([]);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  // A line under the search box for a moment ("Sam now has PRISM")
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setProblem('');
    try {
      setPeople(await listPeople());
    } catch (err) {
      setPeople([]);
      setProblem((err as Error).message);
    }
  }, []);
  // Read the list every time the page is come to (a tab screen stays in memory after the first visit,
  // so without this, coming back later would show the list as it was then)
  useFocusEffect(useCallback(() => { if (isAdmin) load(); }, [isAdmin, load]));

  const myId = serverUser?.id;
  // Does this person fit the chosen button? ("No extra rights" = an empty list)
  const matches = (p: Person, level: FilterId) => level === 'all' || (level === 'none' ? p.roles.length === 0 : holds(p.roles, level));
  const count = (level: FilterId) => (people ?? []).filter((p) => matches(p, level)).length;

  // The people to show: the chosen button, and what's typed in the search box
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people ?? []).filter((p) => matches(p, filter)
      && (!q || `${p.name} ${p.email} ${p.username}`.toLowerCase().includes(q)));
  }, [people, filter, query]);

  function say(text: string) {
    setNote(text);
    setTimeout(() => setNote((now) => (now === text ? '' : now)), 3500);
  }

  function open(person: Person) {
    hapticTap();
    setPicked(person);
    setChoice(person.roles);
    setView('edit');
  }
  function close() { setView(null); setPicked(null); setTyped(''); }

  const isMe = !!picked && picked.id === myId;
  // The last Admin can't be taken down or deleted (the server refuses too)
  const lastAdmin = !!picked && holds(picked.roles, 'admin') && (people ?? []).filter((p) => holds(p.roles, 'admin')).length <= 1;

  async function save() {
    if (!picked || busy) return;
    setBusy(true);
    try {
      await setRights(picked.id, choice);
      setPeople((all) => (all ?? []).map((p) => (p.id === picked.id ? { ...p, roles: choice } : p)));
      say(`${picked.name} now has: ${rightsText(choice)}`);
      close();
    } catch (err) {
      showMessage('Couldn\'t save that', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!picked || busy) return;
    setBusy(true);
    try {
      await deletePerson(picked.id, typed);
      setPeople((all) => (all ?? []).filter((p) => p.id !== picked.id));
      say(`${picked.name} and all their data were deleted`);
      close();
    } catch (err) {
      showMessage('Couldn\'t delete that', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // The name has to be typed exactly (capitals and spaces at the ends don't matter)
  const nameTyped = !!picked && typed.trim().toLowerCase() === picked.name.trim().toLowerCase();

  // Someone who isn't an admin has no business here (this comes after every hook, which must always run in the same order)
  if (!isAdmin) return <Redirect href="/" />;

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        // At the top: the search box, the buttons, and a line for what just happened
        ListHeaderComponent={(
          <View style={styles.header}>
            <TextField
              accessibilityLabel="Search people"
              placeholder="Search by name or email"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            <View style={styles.chips}>
              {FILTERS.map((f) => {
                const on = filter === f.id;
                return (
                  <Pressable key={f.id} accessibilityRole="button" accessibilityState={{ selected: on }}
                             onPress={() => setFilter(f.id)}
                             style={[styles.chip, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : 'transparent' }]}>
                    <Text style={[styles.chipText, { color: on ? colors.accentText : colors.text }]}>{f.label} {count(f.id)}</Text>
                  </Pressable>
                );
              })}
            </View>
            {note ? <Text style={[styles.note, { color: colors.success }]} accessibilityLiveRegion="polite">{note}</Text> : null}
          </View>
        )}
        // Still loading, couldn't load, or nobody matches
        ListEmptyComponent={
          people === undefined ? <ActivityIndicator color={colors.accent} style={styles.loading} />
            : problem ? (
              <View style={styles.empty}>
                <Text style={[styles.emptyText, { color: colors.error }]}>{problem}</Text>
                <Button label="Try again" kind="secondary" onPress={load} />
              </View>
            ) : <Text style={[styles.emptyText, { color: colors.muted }]}>Nobody matches that.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.email}, ${rightsText(item.roles)}${item.id === myId ? ', you' : ''}. Opens their rights.`}
            onPress={() => open(item)}
            style={({ pressed }) => [styles.person, { backgroundColor: pressed ? colors.surfaceHover : colors.surface, borderColor: colors.border }]}
          >
            <View style={[styles.avatar, { backgroundColor: colors.surfaceHover }]}>
              <Text style={[styles.avatarText, { color: colors.muted }]}>{initials(item.name)}</Text>
            </View>
            <View style={styles.personText}>
              <Text style={[styles.personName, { color: colors.text }]} numberOfLines={1}>
                {item.name}{item.id === myId ? <Text style={[styles.you, { color: colors.muted }]}>  you</Text> : null}
              </Text>
              <Text style={[styles.personMail, { color: colors.muted }]} numberOfLines={1}>{item.email}</Text>
              {/* When this account was last used */}
              <Text style={[styles.lastSeen, { color: colors.muted }]} numberOfLines={1}>Last used: {lastAccessText(item.lastAccessAt)}</Text>
            </View>
            {/* The rights, one pill each (a quiet one for no extra rights) */}
            <View style={styles.pills}>
              {item.roles.length === 0 ? (
                <View style={[styles.pill, { backgroundColor: colors.surfaceHover }]}>
                  <Text style={[styles.pillText, { color: colors.muted }]}>No extra rights</Text>
                </View>
              ) : item.roles.map((r) => (
                <View key={r} style={[styles.pill, { backgroundColor: `${rightColor(colors, r)}33` }]}>
                  <Text style={[styles.pillText, { color: rightColor(colors, r) }]}>{RIGHTS_LABEL[r]}</Text>
                </View>
              ))}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      {/* One person's rights (and the way to delete them) */}
      {picked && view === 'edit' && (
        <PopupWindow
          title={picked.name}
          onClose={close}
          buttons={[
            { label: 'Cancel', onPress: close, kind: 'secondary', disabled: busy },
            { label: busy ? 'Saving…' : 'Save', onPress: save, disabled: busy || isMe || sameRights(choice, picked.roles) },
          ]}
        >
          <View style={styles.window}>
            <Text style={[styles.personMail, { color: colors.muted }]}>
              {picked.email}{joinedText(picked.createdAt) ? ` · joined ${joinedText(picked.createdAt)}` : ''}
            </Text>
            <Text style={[styles.personMail, { color: colors.muted }]}>Last used: {lastAccessText(picked.lastAccessAt)}</Text>
            <Text style={[styles.sectionLabel, { color: colors.muted }]} accessibilityRole="header">Rights</Text>
            {/* One tick box per right. An Admin has every right, so with Admin ticked the others show as on and can't be changed. */}
            {RIGHTS.map((right) => {
              const adminOn = choice.includes('admin');
              const locked = isMe || (right !== 'admin' && adminOn) || (right === 'admin' && lastAdmin);
              const on = choice.includes(right) || (right !== 'admin' && adminOn);
              return (
                <Pressable key={right} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: locked }}
                           accessibilityLabel={RIGHTS_LABEL[right]}
                           disabled={locked}
                           onPress={() => setChoice((now) => (now.includes(right) ? now.filter((r) => r !== right) : [...now, right]))}
                           style={[styles.option, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.surfaceHover : 'transparent', opacity: locked ? 0.6 : 1 }]}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? colors.accent : colors.muted} />
                  <View style={styles.optionText}>
                    <Text style={[styles.optionName, { color: colors.text }]}>{RIGHTS_LABEL[right]}</Text>
                    <Text style={[styles.personMail, { color: colors.muted }]}>
                      {right !== 'admin' && adminOn ? 'An Admin has this right already.' : RIGHTS_ABOUT[right]}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            {choice.length === 0 && (
              <Text style={[styles.personMail, { color: colors.muted }]}>With nothing ticked, this person has the normal app: shelf, binders, lists, decks, scanner and Card Finder.</Text>
            )}
            {lastAdmin && !isMe && (
              <Text style={[styles.personMail, { color: colors.muted }]}>The last Admin can't be taken down, so Admin stays ticked.</Text>
            )}
            {/* Admin can change everyone's rights, so giving it gets a warning first */}
            {choice.includes('admin') && !holds(picked.roles, 'admin') && (
              <Text style={[styles.warn, { borderColor: colors.error, color: colors.text }]}>
                <Text style={{ color: colors.error, fontWeight: '700' }}>Admin can change everyone's rights.</Text> Only give it to someone you trust. An Admin also has PRISM and AIScan.
              </Text>
            )}
            {isMe && (
              <Text style={[styles.warn, { borderColor: colors.error, color: colors.text }]}>
                <Text style={{ color: colors.error, fontWeight: '700' }}>This is you.</Text> You can't change your own rights, so you can't lock yourself out. Another Admin can.
              </Text>
            )}
            {/* Deleting: set apart at the bottom; not for yourself or the last Admin */}
            <View style={[styles.danger, { borderTopColor: colors.border }]}>
              <Button label="Delete this person and all their data…" kind="danger" disabled={busy || isMe || lastAdmin}
                      onPress={() => { setTyped(''); setView('delete'); }} />
              {(isMe || lastAdmin) && (
                <Text style={[styles.personMail, { color: colors.muted }]}>
                  {isMe ? 'You can\'t delete your own account here.' : 'The last Admin can\'t be deleted.'}
                </Text>
              )}
            </View>
          </View>
        </PopupWindow>
      )}

      {/* "Are you sure?": what goes, and the person's name typed to turn the red button on */}
      {picked && view === 'delete' && (
        <PopupWindow
          title={`Delete ${picked.name} and all their data?`}
          onClose={() => setView('edit')}
          buttons={[
            { label: 'No, keep them', onPress: () => setView('edit'), kind: 'secondary', disabled: busy },
            { label: busy ? 'Deleting…' : 'Yes, delete everything', onPress: remove, kind: 'danger', disabled: busy || !nameTyped },
          ]}
        >
          <View style={styles.window}>
            <Text style={[styles.optionName, { color: colors.text }]}>This permanently deletes:</Text>
            <Text style={[styles.list, { color: colors.text }]}>
              {'•  their account and every sign-in\n•  all their binders, lists and decks, and the cards in them\n•  their PRISM sets and settings'}
            </Text>
            <Text style={[styles.warn, { borderColor: colors.error, color: colors.text }]}>
              <Text style={{ color: colors.error, fontWeight: '700' }}>This can't be undone.</Text> Files in their own Google Drive are not touched.
            </Text>
            <TextField
              label={`To be sure, type their name: ${picked.name}`}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />
          </View>
        </PopupWindow>
      )}
    </View>
  );
}

// The look: a centered column; rows with a circle, a name, pills and an arrow; the rights window
const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 16, maxWidth: PAGE_MAX_WIDTH, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  header: { gap: 10, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  chipText: { fontSize: 13, fontWeight: '600' },
  note: { fontSize: 14, fontWeight: '600' },
  loading: { marginTop: 40 },
  empty: { alignItems: 'center', gap: 12, marginTop: 30 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 20 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: RADIUS, padding: 12 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  personText: { flex: 1, minWidth: 0 },
  personName: { fontSize: 15, fontWeight: '700' },
  personMail: { fontSize: 13 },
  lastSeen: { fontSize: 12 },
  you: { fontSize: 11, fontWeight: '600' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: 140 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: '700' },
  window: { gap: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  option: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1.5, borderRadius: RADIUS, padding: 10 },
  optionText: { flex: 1, gap: 2 },
  optionName: { fontSize: 15, fontWeight: '700' },
  warn: { borderWidth: 1.5, borderRadius: RADIUS, padding: 10, fontSize: 13 },
  list: { fontSize: 14, lineHeight: 22 },
  danger: { borderTopWidth: 1, paddingTop: 12, gap: 6, marginTop: 4 },
});
