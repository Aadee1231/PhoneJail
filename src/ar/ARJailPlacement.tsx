import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import { JailARScene } from './JailARScene';
import { DebugSnapshot, JailState } from '../types';

interface Props {
  /** Current jail session state. */
  sessionState: JailState;
  /** Confirms the AR placement and starts the placement watch. */
  onConfirmJail: () => Promise<boolean>;
  /** Live motion debug snapshot from useJailSession. */
  debug: DebugSnapshot;
  /** Abort the AR flow entirely. */
  onCancel: () => void;
  placementError?: string | null;
}

const initialScene = { scene: JailARScene as any };

/**
 * Full-screen AR placement flow: the jail lands immediately from a fallback
 * world position, the user drags/pinches/rotates it, then tapping Place Jail
 * confirms the placement. The session only starts once the phone is placed
 * flat and still.
 */
export function ARJailPlacement({ sessionState, onConfirmJail, debug, onCancel, placementError }: Props) {
  const [trackingReady, setTrackingReady] = useState(false);
  const [planeCount, setPlaneCount] = useState(0);
  const [planeSelected, setPlaneSelected] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [placed, setPlaced] = useState(false);
  const confirming = useRef(false);
  const cancelled = useRef(false);

  const locked = sessionState === 'locking' || sessionState === 'active';
  const onPlaneSelected = useCallback((selected: boolean) => {
    setPlaneSelected(selected);
    // Procedural jail geometry is always ready once mounted; the model-ready
    // flag is owned by onModelReady from VirtualJail3D, not by plane selection.
    setModelError(null);
  }, []);
  const onModelReady = useCallback(() => setModelReady(true), []);
  const viroAppProps = useMemo(() => ({
    onTrackingReady: setTrackingReady,
    onPlaneCountChange: setPlaneCount,
    onPlaneSelected, onModelReady, onModelError: setModelError,
    placed, locked,
  }), [onPlaneSelected, onModelReady, placed, locked]);

  const confirm = async () => {
    if (confirming.current || !modelReady || !trackingReady || modelError || placed || locked) return;
    confirming.current = true;
    setPlaced(true);
    const started = await onConfirmJail();
    if (!cancelled.current && !started) setPlaced(false);
    confirming.current = false;
  };

  const cancel = () => {
    cancelled.current = true;
    onCancel();
  };

  let title = 'Find a flat surface';
  let helper = 'Move slowly over your desk to reveal a surface.';
  let status = 'SCANNING';
  if (trackingReady && planeCount > 0 && !planeSelected) {
    title = 'Select a surface';
    helper = 'Tap the blue grid where your phone will rest.';
    status = 'SURFACE FOUND';
  } else if (sessionState === 'placement-confirmed') {
    title = 'Place your phone';
    helper = debug.triggerHoldMs > 0 ? 'Locking...' : 'Place your phone flat inside the jail to begin.';
    status = 'READY TO CONTAIN';
  } else if (planeSelected && !locked) {
    title = modelReady ? 'Focus zone placed' : 'Building your focus zone';
    helper = modelReady ? 'Drag to reposition. Pinch to resize. Rotate to align.' : 'Loading the containment chamber…';
    status = 'ALIGN YOUR ZONE';
  }
  if (!trackingReady && planeSelected && !locked) {
    helper = 'Tracking paused. Move slowly back toward your desk.';
  }

  const error = modelError ?? placementError;
  // The button is tappable as soon as the 3D jail is loaded and AR tracking is up.
  const canConfirm = modelReady && trackingReady && !placed && !locked && !modelError;
  const awaitingPhone = placed && sessionState === 'placement-confirmed';

  return (
    <View style={styles.container} pointerEvents="box-none">
      <ViroARSceneNavigator
        style={StyleSheet.absoluteFill} autofocus
        initialScene={initialScene} viroAppProps={viroAppProps}
        hdrEnabled bloomEnabled multisamplingEnabled
        pbrEnabled={false} shadowsEnabled={false} occlusionMode="disabled"
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar} pointerEvents="box-none">
          {!locked && <Pressable style={styles.cancel} onPress={cancel} hitSlop={12} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>}
          <View style={styles.status} pointerEvents="none">
            <View style={styles.dot} />
            <Text style={styles.statusText}>{locked ? 'CONTAINED' : status}</Text>
          </View>
        </View>
        <View style={styles.footer} pointerEvents="box-none">
          {/* Lock confirmation takes over the whole overlay briefly. */}
          <View style={styles.copy} pointerEvents="none" accessibilityLiveRegion="polite">
            <Text style={styles.eyebrow}>{locked ? 'FOCUS STARTS NOW' : 'PHONEJAIL / SPATIAL FOCUS'}</Text>
            <Text style={[styles.title, locked && styles.lockTitle]}>{locked ? 'JAIL LOCKED' : title}</Text>
            <Text style={styles.helper}>{locked ? 'Your time is yours again.' : helper}</Text>
            {error && <Text style={styles.error}>{error}</Text>}
          </View>
          {!placed && !locked && <>
            <Text style={styles.reminder} pointerEvents="none">Turn your volume up before you begin.</Text>
            <Pressable
              onPress={confirm} disabled={!canConfirm} accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm }}
              style={({ pressed }) => [styles.primaryButton, !canConfirm && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={styles.primaryButtonText}>Place Jail</Text>
            </Pressable>
          </>}
          {awaitingPhone && <View style={styles.waitingPill} pointerEvents="none">
            <ActivityIndicator size="small" color="#78d4ff" />
            <Text style={styles.waitingText}>Waiting for stillness. Timer has not started.</Text>
          </View>}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 0 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 22, backgroundColor: 'rgba(6,12,22,0.62)' },
  cancelText: { color: '#e6eff9', fontSize: 14, fontWeight: '500' },
  status: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 24, backgroundColor: 'rgba(6,12,22,0.72)' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#72d8ff', marginRight: 8 },
  statusText: { color: '#e5f5ff', fontSize: 9, letterSpacing: 1.6, fontWeight: '600' },
  footer: { paddingHorizontal: 24, paddingBottom: 24, alignItems: 'center' },
  copy: { width: '100%', maxWidth: 390, paddingHorizontal: 20, paddingVertical: 20, borderRadius: 24, backgroundColor: 'rgba(6,12,22,0.80)', marginBottom: 14 },
  eyebrow: { color: '#79b4db', fontSize: 9, fontWeight: '600', letterSpacing: 2.1, textAlign: 'center', marginBottom: 10 },
  title: { color: '#f4f9ff', fontSize: 24, fontWeight: '600', letterSpacing: -0.6, textAlign: 'center', marginBottom: 8 },
  lockTitle: { fontSize: 32, letterSpacing: 1.4 },
  helper: { color: '#bdcede', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  reminder: { color: '#eef4fb', fontSize: 12, textAlign: 'center', marginBottom: 12, textShadowColor: '#000', textShadowRadius: 4 },
  primaryButton: { width: '100%', maxWidth: 340, minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: 26, backgroundColor: '#248aff' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  waitingPill: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 22, backgroundColor: 'rgba(6,12,22,0.8)' },
  waitingText: { color: '#c3d7e8', fontSize: 11, flexShrink: 1 },
  error: { color: '#ffb8ad', fontSize: 13, textAlign: 'center', marginTop: 10 },
});
