import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import { JailARScene } from './JailARScene';
import { JailState } from '../types';

interface Props {
  /** Current jail session state ('idle' until Place Jail is tapped). */
  sessionState: JailState;
  /** User confirmed placement — begin awaiting physical phone placement. */
  onPlaceJail: () => void;
  /** Abort the AR flow entirely. */
  onCancel: () => void;
}

/**
 * Full-screen AR placement flow: plane detection status -> surface selection
 * -> gesture adjustment -> "Place Jail" -> physical phone placement prompt ->
 * "JAIL LOCKED" confirmation.
 */
export function ARJailPlacement({ sessionState, onPlaceJail, onCancel }: Props) {
  const [trackingReady, setTrackingReady] = useState(false);
  const [planeSelected, setPlaneSelected] = useState(false);
  const [placed, setPlaced] = useState(false);

  const locked = sessionState === 'locking';
  const awaitingPhone = placed && sessionState === 'awaiting-placement';

  const viroAppProps = useMemo(
    () => ({
      onTrackingReady: setTrackingReady,
      onPlaneSelected: () => setPlaneSelected(true),
      placed,
      locked,
    }),
    [placed, locked]
  );

  let title = 'Find a flat surface';
  let helper = 'Move your phone slowly to scan the area.';
  if (trackingReady && !planeSelected) {
    title = 'Select a surface';
    helper = 'Tap a highlighted surface to place your jail.';
  } else if (planeSelected && !placed) {
    title = 'Place your jail';
    helper = 'Drag to reposition. Pinch to resize. Rotate to align.';
  } else if (awaitingPhone) {
    title = 'Focus zone placed';
    helper = 'Place your phone face-down inside to begin.';
  }

  return (
    <View style={styles.container}>
      <ViroARSceneNavigator
        style={StyleSheet.absoluteFill}
        autofocus
        initialScene={{ scene: JailARScene as any }}
        viroAppProps={viroAppProps}
      />

      {/* Lock confirmation takes over the whole overlay briefly. */}
      {locked ? (
        <View style={styles.lockOverlay} pointerEvents="none">
          <Text style={styles.lockTitle}>JAIL LOCKED</Text>
        </View>
      ) : (
        <>
          <View style={styles.header} pointerEvents="none">
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.helper}>{helper}</Text>
          </View>

          <Pressable style={styles.cancel} onPress={onCancel} hitSlop={12}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>

          <View style={styles.footer}>
            {planeSelected && !placed && (
              <>
                <Text style={styles.reminder}>Turn your volume up.</Text>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => {
                    setPlaced(true);
                    onPlaceJail();
                  }}
                >
                  <Text style={styles.primaryButtonText}>Place Jail</Text>
                </Pressable>
              </>
            )}
            {awaitingPhone && (
              <View style={styles.waitingPill}>
                <View style={styles.waitingDot} />
                <Text style={styles.waitingText}>Waiting for phone…</Text>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    position: 'absolute',
    top: 76,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f5f6fa',
    textAlign: 'center',
    marginBottom: 8,
  },
  helper: {
    fontSize: 14,
    color: 'rgba(245,246,250,0.75)',
    textAlign: 'center',
  },
  cancel: {
    position: 'absolute',
    top: 76,
    left: 20,
  },
  cancelText: {
    color: 'rgba(245,246,250,0.6)',
    fontSize: 14,
    fontWeight: '600',
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
    color: 'rgba(245,246,250,0.55)',
    fontSize: 13,
    marginBottom: 14,
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
  waitingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,12,20,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 22,
  },
  waitingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    marginRight: 10,
  },
  waitingText: {
    color: '#f5f6fa',
    fontSize: 14,
    fontWeight: '600',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,9,15,0.55)',
  },
  lockTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: '#f5f6fa',
    letterSpacing: 3,
  },
});
