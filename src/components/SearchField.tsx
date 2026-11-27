/* =====================================================================
   A SEARCH BOX (the app's standard)
   Every box that searches or filters something uses this, so they all
   behave the same: as soon as something is typed, a round X shows at
   the right end of the box, and tapping it empties the box.
   It's the app's usual text box (TextField.tsx) with that X on top.

   RULE: a new search or filter box uses SearchField, not TextField.
   (Boxes for names, passwords and the like are not searches.)
   ===================================================================== */

import { forwardRef, useImperativeHandle, useRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type TextInput, type TextInputProps, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import TextField from '@/components/TextField';
import { useColors } from '@/hooks/useTheme';

type Props = TextInputProps & {
  value: string;                       // what's in the box (the screen keeps it)
  onClear?: () => void;                // what the X does, if more than emptying the box is needed
  magnifier?: boolean;                 // show a magnifying glass at the right end while the box is empty
  keepCursor?: boolean;                // after the X, put the cursor back in the box (not in pop-ups: that would open the keyboard)
  wrapStyle?: StyleProp<ViewStyle>;    // room around the box, or how wide it is
};

// "forwardRef" lets a screen hold on to the box (to put the cursor in it)
const SearchField = forwardRef<ComponentRef<typeof TextInput>, Props>(function SearchField(
  { value, onClear, magnifier = false, keepCursor = true, wrapStyle, style, ...rest }, ref,
) {
  const colors = useColors();
  // Our own hold on the box, shared with the screen's if it asked for one
  const box = useRef<ComponentRef<typeof TextInput>>(null);
  useImperativeHandle(ref, () => box.current!, []);

  // The X: empty the box, ready to type something new
  function clear() {
    if (onClear) onClear();
    else rest.onChangeText?.('');
    if (keepCursor) box.current?.focus();
  }

  return (
    <View style={[styles.wrap, wrapStyle]}>
      {/* The box, with room at its right end so typing never runs under the X */}
      <TextField
        ref={box}
        value={value}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        autoComplete="off"
        {...rest}
        style={[style, styles.room]}
      />
      {/* At the right end: the X once something is typed, otherwise the magnifying glass (if this box has one) */}
      {value.length > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear the search" onPress={clear}
                   style={({ pressed }) => [styles.end, pressed && styles.pressed]}>
          <Ionicons name="close-circle" size={22} color={colors.muted} />
        </Pressable>
      ) : magnifier ? (
        // "pointerEvents: none" lets a tap on the picture go through to the box
        <View style={[styles.end, styles.passThrough]}>
          <Ionicons name="search" size={20} color={colors.muted} />
        </View>
      ) : null}
    </View>
  );
});

export default SearchField;

// The X sits inside the box's right end, as tall as the box, 44 points wide (big enough for a thumb)
const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  room: { paddingRight: 44 },
  end: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
  passThrough: { pointerEvents: 'none' },
  pressed: { opacity: 0.5 },
});
