import { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { VirtualJail } from './VirtualJail';

interface Props {
  onPlaced: () => void;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const DEFAULT_JAIL_SIZE = 220;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.8;

function distanceBetween(touches: { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/**
 * Full-screen camera view with a draggable, pinch-resizable pseudo-3D jail
 * overlay. This creates the illusion of placing a virtual containment box on
 * a physical surface without requiring true AR world tracking.
 */
export function CameraJailPlacement({ onPlaced }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [placed, setPlaced] = useState(false);

  const pan = useRef(
    new Animated.ValueXY({ x: SCREEN_W / 2 - DEFAULT_JAIL_SIZE / 2, y: SCREEN_H / 2 - DEFAULT_JAIL_SIZE / 2 - 40 })
  ).current;
  const scale = useRef(new Animated.Value(1)).current;

  const dragOffset = useRef({ x: 0, y: 0 });
  const currentScale = useRef(1);
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartScale = useRef(1);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pinchStartDistance.current = null;
      },
      onPanResponderMove: (evt, gesture) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          const dist = distanceBetween(touches as any);
          if (pinchStartDistance.current === null) {
            pinchStartDistance.current = dist;
            pinchStartScale.current = currentScale.current;
          } else {
            const ratio = dist / pinchStartDistance.current;
            const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStartScale.current * ratio));
            currentScale.current = next;
            scale.setValue(next);
          }
        } else {
          pinchStartDistance.current = null;
          pan.setValue({
            x: dragOffset.current.x + gesture.dx,
            y: dragOffset.current.y + gesture.dy,
          });
        }
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (pinchStartDistance.current === null) {
          dragOffset.current = {
            x: dragOffset.current.x + gesture.dx,
            y: dragOffset.current.y + gesture.dy,
          };
        }
        pinchStartDistance.current = null;
      },
    })
  ).current;

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          PhoneJail uses your camera to help you place your virtual jail on a real surface.
        </Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant Camera Access</Text>
        </Pressable>
        <Pressable style={styles.skipButton} onPress={onPlaced}>
          <Text style={styles.skipButtonText}>Continue without camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" />

      <View style={styles.scrim} pointerEvents="none" />

      <View style={styles.header} pointerEvents="none">
        <Text style={styles.title}>{placed ? 'Jail placed' : 'Place your jail'}</Text>
        <Text style={styles.helper}>
          {placed
            ? 'Place your phone face-down inside to begin.'
            : 'Drag to reposition. Pinch to resize.'}
        </Text>
      </View>

      {!placed && (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.jailWrap,
            {
              transform: [
                { translateX: pan.x },
                { translateY: pan.y },
                { scale },
              ],
            },
          ]}
        >
          <VirtualJail mode="placing" size={DEFAULT_JAIL_SIZE} />
        </Animated.View>
      )}

      {placed && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.jailWrap,
            {
              transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }],
            },
          ]}
        >
          <VirtualJail mode="calibrating" size={DEFAULT_JAIL_SIZE} />
        </Animated.View>
      )}

      <View style={styles.footer}>
        {!placed && <Text style={styles.reminder}>Turn your volume up — make sure your sound is on.</Text>}
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            if (!placed) {
              setPlaced(true);
              setTimeout(onPlaced, 700);
            }
          }}
        >
          <Text style={styles.primaryButtonText}>{placed ? 'Starting…' : 'Place Jail'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,6,12,0.25)',
  },
  header: {
    position: 'absolute',
    top: 70,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  helper: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },
  jailWrap: {
    position: 'absolute',
    width: DEFAULT_JAIL_SIZE,
    height: DEFAULT_JAIL_SIZE,
  },
  footer: {
    position: 'absolute',
    bottom: 56,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  reminder: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#3b82f6',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0a0a12',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: 15,
    color: '#9a9aaf',
    textAlign: 'center',
    marginBottom: 28,
  },
  skipButton: {
    marginTop: 16,
    padding: 10,
  },
  skipButtonText: {
    color: '#6a6a7a',
    fontSize: 14,
    fontWeight: '600',
  },
});
