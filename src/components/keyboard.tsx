import { useContext, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Keyboard, KeyboardAvoidingView, ScrollView, TextInput, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { HeaderHeightContext } from "expo-router/react-navigation";

// Keeps text fields clear of the on-screen keyboard.
//
// KeyboardAvoidingView works out how much of itself the keyboard covers from
// its position inside the screen, not on the display - so under a navigation
// header it lifts the content short by exactly the header's height, and the
// field being typed in sits behind the keyboard. KeyboardAvoider adds the
// header height back. KeyboardScrollView then scrolls the focused field into
// view once the keyboard is up (long forms, fields near the bottom).

const GAP = 16;

export function KeyboardAvoider({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  return (
    <KeyboardAvoidingView style={[{ flex: 1 }, style]} behavior="padding" keyboardVerticalOffset={headerHeight}>
      {children}
    </KeyboardAvoidingView>
  );
}

export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

export function KeyboardScrollView({ ref, onScroll, ...props }: ScrollViewProps & { ref?: Ref<ScrollView> }) {
  const inner = useRef<ScrollView | null>(null);
  const offsetY = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = Keyboard.addListener("keyboardDidShow", (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      // Give KeyboardAvoider a moment to shrink the screen, or the scroll is clamped to the old size.
      timer = setTimeout(() => {
        const input = TextInput.State.currentlyFocusedInput();
        input?.measureInWindow((_x, y, _w, h) => {
          const hidden = y + h + GAP - keyboardTop;
          if (hidden > 0) inner.current?.scrollTo({ y: offsetY.current + hidden, animated: true });
        });
      }, 120);
    });
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, []);

  function setRef(node: ScrollView | null) {
    inner.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: ScrollView | null }).current = node;
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    offsetY.current = e.nativeEvent.contentOffset.y;
    onScroll?.(e);
  }

  return <ScrollView ref={setRef} keyboardShouldPersistTaps="handled" scrollEventThrottle={16} {...props} onScroll={handleScroll} />;
}
