import { useRef } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_DISTANCE = 90;
const SWIPE_VELOCITY = 0.5;

interface Props {
  onBack: () => void;
  children: React.ReactNode;
}

/**
 * Wraps a screen so a rightward horizontal swipe slides it off-screen and
 * calls onBack. Vertical scrolling is left alone — the gesture only claims
 * touches that are clearly horizontal.
 */
export function SwipeBackView({ onBack, children }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        translateX.setValue(Math.max(0, g.dx));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_DISTANCE || g.vx > SWIPE_VELOCITY) {
          Animated.timing(translateX, {
            toValue: SCREEN_WIDTH,
            duration: 180,
            useNativeDriver: true,
          }).start(() => onBackRef.current());
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[styles.fill, { transform: [{ translateX }] }]}
      {...pan.panHandlers}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flexGrow: 1,
    width: '100%',
  },
});
