/* =====================================================================
   SEARCH BOX
   The box at the top of the Card Finder where you type a card's name.
   Everything you type is handed straight to the screen, which searches
   from the very first letter and fills the area under the box with card
   pictures (see CardGrid.tsx). Pressing the keyboard's Search key (Enter
   on a computer) brings the pictures back for what's in the box. Tapping
   the box while a card is open just lets you carry on typing.
   The card area under the box is passed in as "children".
   Keyboard handling: the Card Finder screen shrinks itself above the
   keyboard (KeyboardAvoidingView), so the keyboard never covers the box.
   ===================================================================== */

import type { ComponentRef, ReactNode, RefObject } from 'react';
import {
  Pressable, StyleSheet, Text, View,
  type TextInput, type TextInputKeyPressEvent,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useShowKeyHints } from '@/hooks/useShortcutKeys';
import { useColors } from '@/hooks/useTheme';
import TextField from '@/components/TextField';

// The widest the search box and the card details get (in points, not
// counting the 16-point gaps at each side), so on a tablet or computer
// they stay a comfortable width in the middle of the screen
export const PAGE_WIDTH = 728;

type Props = {
  value: string;
  // The text was changed by the person typing (or by the "×" button)
  onChange: (text: string) => void;
  // The Search key was pressed: show the pictures for this text
  onSubmit: (text: string) => void;
  // Select all the text when the box is tapped?
  selectOnFocus: boolean;
  // Escape was pressed: the box was left (web)
  onLeave: () => void;
  hint: string;
  hintIsError: boolean;
  onShowShortcuts: () => void;
  // A handle on the text box, so the screen can put the cursor in it (the / key)
  inputRef: RefObject<ComponentRef<typeof TextInput> | null>;
  // The card area under the box
  children: ReactNode;
};

export default function SearchBox(props: Props) {
  const { value, onChange, onSubmit, selectOnFocus, onLeave, hint, hintIsError, onShowShortcuts, inputRef, children } = props;
  const colors = useColors();
  // Show the shortcuts tip? (Computers only: see useShortcutKeys)
  const showKeyHints = useShowKeyHints();

  // The keyboard's Search key (Enter on a computer)
  function handleSubmit() {
    if (value.trim()) onSubmit(value.trim());
  }

  // Computer keyboards only: Escape leaves the search box, so the
  // shortcut keys work.
  function handleKeyPress(event: TextInputKeyPressEvent) {
    if (event.nativeEvent.key === 'Escape') {
      inputRef.current?.blur();
      onLeave();
    }
  }

  // The "×" button: empty the search box and put the cursor back in it,
  // ready to type a new name.
  function clearSearch() {
    onChange('');
    inputRef.current?.focus();
  }

  return (
    <View style={styles.fill}>
      {/* The box and its "×" button, which sits inside the box's right end */}
      <View style={styles.searchField}>
        <TextField
          ref={inputRef}
          accessibilityLabel="Card name"
          placeholder="Search for a card name…"
          value={value}
          onChangeText={onChange}
          onKeyPress={handleKeyPress}
          onSubmitEditing={handleSubmit}
          // The keyboard's Enter key says "Search"; no spelling fixes or
          // capital letters added (card names are typed exactly)
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="off"
          // Tapping the box selects its text when it holds a card's name,
          // so typing replaces it; otherwise the cursor just goes in, so
          // you can carry on typing the search
          selectTextOnFocus={selectOnFocus}
          style={[styles.input, { backgroundColor: colors.surface }]}
        />
        {/* "×": only while there's something in the box to clear */}
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear the search"
            onPress={clearSearch}
            style={({ pressed }) => [styles.clearButton, pressed && { backgroundColor: colors.surfaceHover }]}
          >
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Everything under the box: the status line, then the card area */}
      <View style={styles.fill}>
        {/* The line under the box: a status message on the left (read out
            by screen readers when it changes), and on computers the
            shortcuts tip on the right (tapping it opens the Keyboard
            shortcuts window). With nothing to show, it's left out, so it
            doesn't leave a gap under the box. */}
        {(hint || showKeyHints) ? (
        <View style={styles.hintRow}>
          <Text
            style={[styles.hint, { color: hintIsError ? colors.error : colors.muted }]}
            accessibilityLiveRegion="polite"
          >
            {hint}
          </Text>
          {showKeyHints && (
            <Pressable accessibilityRole="button" accessibilityLabel="Keyboard shortcuts" onPress={onShowShortcuts}>
              <Text style={[styles.shortcutsTip, { color: colors.muted }]}>/ search · ? shortcuts</Text>
            </Pressable>
          )}
        </View>
        ) : null}

        {children}
      </View>
    </View>
  );
}

// The look: a tall search box with room on the right for the "×", and
// the status line under it
const styles = StyleSheet.create({
  fill: { flex: 1 },
  searchField: { width: '100%', maxWidth: PAGE_WIDTH + 32, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 10 },
  input: { minHeight: 50, paddingLeft: 16, paddingRight: 52, fontSize: 17 },
  clearButton: {
    position: 'absolute', right: 20, top: 13, width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  hintRow: {
    width: '100%', maxWidth: PAGE_WIDTH + 32, alignSelf: 'center', flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
    paddingHorizontal: 18, paddingTop: 6, paddingBottom: 2,
  },
  hint: { flex: 1, fontSize: 14, minHeight: 18 },
  shortcutsTip: { fontSize: 13 },
});
