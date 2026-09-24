import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ViroAmbientLight,
  ViroAnchor,
  ViroARPlane,
  ViroARScene,
  ViroCameraARHitTest,
  ViroMaterials,
  ViroNode,
  ViroQuad,
  ViroTrackingStateConstants,
} from '@reactvision/react-viro';
import { VirtualJail3D } from './VirtualJail3D';

export interface JailARSceneProps {
  /** Notifies the RN overlay that AR tracking is ready. */
  onTrackingReady: (ready: boolean) => void;
  /** Notifies the RN overlay that the user selected a surface. */
  onPlaneSelected: (selected: boolean) => void;
  onPlaneCountChange: (count: number) => void;
  onModelReady: () => void;
  onModelError: (message: string) => void;
  /** Placement has been confirmed — freeze gestures. */
  placed: boolean;
  /** The phone has been detected inside — play the lock animation. */
  locked: boolean;
}

// Debug-obvious plane material: bright cyan-blue fill so a detected surface
// is unmistakable on a real desk. Tone this down once placement is verified
// working end-to-end on device.
ViroMaterials.createMaterials({
  debugPlaneFill: {
    diffuseColor: 'rgba(40, 155, 255, 0.12)',
    lightingModel: 'Constant',
    blendMode: 'Alpha',
    cullMode: 'None',
    writesToDepthBuffer: false,
  },
  placementGrid: {
    diffuseTexture: require('../../assets/models/grid.png'),
    diffuseColor: 'rgba(115, 215, 255, 0.55)',
    lightingModel: 'Constant', blendMode: 'Alpha', cullMode: 'None',
    writesToDepthBuffer: false, wrapS: 'Repeat', wrapT: 'Repeat',
  },
});

type Vec3 = [number, number, number];

/**
 * Fallback world position used before ARKit reports any usable surface.
 * ARKit's world origin is the camera pose at session start (gravity aligned,
 * camera looking down -Z), so [0, -0.38, -0.8] is ~0.8 m in front of the
 * camera and ~0.38 m below eye level — centered horizontally and slightly
 * below the visual center of the frame.
 */
const FALLBACK_POS: Vec3 = [0, -0.38, -0.8];
const SETTLE_DURATION_MS = 280;

const PLANE_HIT_TYPES = new Set([
  'ExistingPlaneUsingExtent',
  'ExistingPlane',
  'EstimatedHorizontalPlane',
]);

/**
 * Converts a plane anchor's local-space point into world space.
 * Inverse of the worldToPlaneLocal math used for taps (R = Rx*Ry*Rz, X-Y-Z
 * Euler order), so anchor.center maps to the plane's real world position.
 */
function planeLocalToWorld(local: Vec3, anchorPosition: Vec3, rotationDeg: Vec3): Vec3 {
  const toRad = Math.PI / 180;
  const c1 = Math.cos(rotationDeg[0] * toRad), s1 = Math.sin(rotationDeg[0] * toRad);
  const c2 = Math.cos(rotationDeg[1] * toRad), s2 = Math.sin(rotationDeg[1] * toRad);
  const c3 = Math.cos(rotationDeg[2] * toRad), s3 = Math.sin(rotationDeg[2] * toRad);

  const x = local[0], y = local[1], z = local[2];
  return [
    anchorPosition[0] + c2 * c3 * x + (-s1 * s2 * c3 + c1 * s3) * y + (c1 * s2 * c3 + s1 * s3) * z,
    anchorPosition[1] + c2 * s3 * x + (s1 * s2 * s3 + c1 * c3) * y + (-c1 * s2 * s3 + s1 * c3) * z,
    anchorPosition[2] + -s2 * x + s1 * c2 * y + c1 * c2 * z,
  ];
}

/**
 * The AR scene: mounts the jail immediately at a camera-forward fallback
 * world position, then continuously runs the center-camera AR hit test
 * (onCameraARHitTest). The first valid horizontal-plane hit (or the first
 * detected horizontal anchor, whichever comes first) triggers a smooth
 * ~280ms ease-out transition that carries the single jail node onto the
 * real surface. Drag/rotate/pinch then work exactly as before.
 */
export function JailARScene(props: any) {
  const appProps: JailARSceneProps =
    props.sceneNavigator?.viroAppProps ?? props.arSceneNavigator?.viroAppProps ?? {};

  const [planes, setPlanes] = useState<Map<string, ViroAnchor>>(new Map());
  const [jailPos, setJailPos] = useState<Vec3>(FALLBACK_POS);
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);
  const animFrameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  // Post-commit notification: the jail is placeable from its fallback world
  // position as soon as the scene mounts — no tap or plane required.
  useEffect(() => {
    if (__DEV__) console.log('[AR][jail-fallback] mounted at world position', FALLBACK_POS);
    appProps.onPlaneSelected?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    appProps.onPlaneCountChange?.(planes.size);
  }, [planes.size, appProps.onPlaneCountChange]);

  useEffect(() => {
    if (__DEV__) console.log('[AR][selector-ref] custom plane overlay/selection mounted');
  }, []);

  const cancelSettleAnimation = useCallback(() => {
    if (animFrameRef.current != null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  /**
   * Smoothly carries the single jail node from its current world position to
   * a point on the detected horizontal surface. easeOutQuad over ~280ms so it
   * "lands" rather than popping. Scale and rotation are untouched (they live
   * on the inner node) so the user's pinch/rotate state is preserved.
   */
  const settleOntoSurface = useCallback((target: Vec3, source: string) => {
    if (settledRef.current || appProps.placed || appProps.locked) return;
    if (!target.every(Number.isFinite)) return;
    settledRef.current = true;
    if (__DEV__) console.log('[AR][jail-settling]', { from: jailPos, to: target, source });
    cancelSettleAnimation();
    const start = Date.now();
    const from: Vec3 = [...jailPos];
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / SETTLE_DURATION_MS);
      const e = 1 - (1 - t) * (1 - t); // easeOutQuad
      setJailPos([
        from[0] + (target[0] - from[0]) * e,
        from[1] + (target[1] - from[1]) * e,
        from[2] + (target[2] - from[2]) * e,
      ]);
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        animFrameRef.current = null;
        setSettled(true);
        if (__DEV__) console.log('[AR][jail-settled]', target);
      }
    };
    animFrameRef.current = requestAnimationFrame(step);
  }, [appProps.placed, appProps.locked, jailPos, cancelSettleAnimation]);

  // Stop all motion/gesture state the moment placement is confirmed.
  useEffect(() => {
    if (appProps.placed || appProps.locked) cancelSettleAnimation();
  }, [appProps.placed, appProps.locked, cancelSettleAnimation]);

  useEffect(() => () => cancelSettleAnimation(), [cancelSettleAnimation]);

  const onTrackingUpdated = useCallback(
    (state: any, reason: any) => {
      const ready = state === ViroTrackingStateConstants.TRACKING_NORMAL;
      if (__DEV__) console.log('[AR][tracking] state:', state, 'reason:', reason, 'ready:', ready);
      appProps.onTrackingReady?.(ready);
    },
    [appProps.onTrackingReady]
  );

  /**
   * Continuous center-screen AR hit test. The first horizontal surface hit
   * becomes the jail's landing point. transform.position is the exact world
   * point where the camera ray pierces the surface, so placing the jail's
   * origin there puts its bottom flush on the surface (no burial).
   */
  const onCameraARHitTest = useCallback((event: ViroCameraARHitTest) => {
    if (settledRef.current || appProps.placed || appProps.locked) return;
    const results = event?.hitTestResults ?? [];
    const hit = results.find((r) => PLANE_HIT_TYPES.has(r.type));
    if (!hit) return;
    const p = hit.transform?.position;
    if (!p || !p.every?.(Number.isFinite)) return;
    if (__DEV__) console.log('[AR][hit-test]', hit.type, 'at', p);
    settleOntoSurface([p[0], p[1], p[2]], `hitTest:${hit.type}`);
  }, [appProps.placed, appProps.locked, settleOntoSurface]);

  const onAnchorFound = useCallback((anchor: ViroAnchor) => {
    if (__DEV__) console.log(
      '[AR][anchor] found:',
      anchor.type,
      anchor.anchorId,
      'alignment:',
      anchor.alignment,
      'pos:',
      anchor.position,
      'size:',
      anchor.width,
      'x',
      anchor.height
    );
    if (anchor.type !== 'plane') return;

    const alignment = anchor.alignment ?? '';
    const isHorizontal = alignment === '' || alignment.includes('Horizontal');
    if (!isHorizontal) {
      if (__DEV__) console.log('[AR][anchor] rejected (not horizontal):', anchor.anchorId, alignment);
      return;
    }

    setPlanes((prev) => {
      const next = new Map(prev);
      next.set(anchor.anchorId, anchor);
      return next;
    });

    // Fallback landing path: if the center-camera hit test hasn't produced a
    // plane yet, settle on the first detected horizontal anchor's center.
    if (!settledRef.current && !appProps.placed && !appProps.locked) {
      const center = anchor.center ?? [0, 0, 0];
      const world = planeLocalToWorld([center[0], 0, center[2]], anchor.position, anchor.rotation ?? [0, 0, 0]);
      if (__DEV__) console.log('[AR][anchor-settle] using detected plane center', { anchorId: anchor.anchorId, world });
      settleOntoSurface(world, `anchor:${anchor.anchorId}`);
    }
  }, [appProps.placed, appProps.locked, settleOntoSurface]);

  const onAnchorUpdated = useCallback((anchor: ViroAnchor) => {
    if (anchor.type !== 'plane') return;
    setPlanes((prev) => {
      if (!prev.has(anchor.anchorId)) return prev;
      const next = new Map(prev);
      next.set(anchor.anchorId, anchor);
      return next;
    });
  }, []);

  const onAnchorRemoved = useCallback((anchor?: ViroAnchor) => {
    if (!anchor?.anchorId) return;
    if (__DEV__) console.log('[AR][anchor] removed:', anchor.anchorId);
    setPlanes((prev) => {
      if (!prev.has(anchor.anchorId)) return prev;
      const next = new Map(prev);
      next.delete(anchor.anchorId);
      return next;
    });
  }, []);

  /**
   * World-space drag: once the jail has landed on a real surface, dragging is
   * constrained to that horizontal plane (FixedToPlane + dragPlane). The
   * outer node's parent is the scene root, so dragToPos is already world
   * space — store it directly.
   */
  const onWorldDrag = useCallback((dragToPos: Vec3) => {
    if (appProps.placed || appProps.locked || !dragToPos.every(Number.isFinite)) return;
    setJailPos(dragToPos);
    if (__DEV__) console.log('[AR][jail-position]', dragToPos);
  }, [appProps.placed, appProps.locked]);

  const draggingEnabled = settled && !appProps.placed && !appProps.locked;

  return (
    <ViroARScene
      onTrackingUpdated={onTrackingUpdated}
      onCameraARHitTest={onCameraARHitTest}
      onAnchorFound={onAnchorFound}
      onAnchorUpdated={onAnchorUpdated}
      onAnchorRemoved={onAnchorRemoved}
      anchorDetectionTypes={['planesHorizontal']}
    >
      <ViroAmbientLight color="#ffffff" intensity={600} />

      {/* Detected horizontal surfaces: visual grid overlays only, no tap
          required. Hidden once placement is confirmed. */}
      {!appProps.placed && !appProps.locked && Array.from(planes.values()).map((anchor) => {
        const width = anchor.width && anchor.width > 0 ? anchor.width : 0.4;
        const height = anchor.height && anchor.height > 0 ? anchor.height : 0.4;
        const center = anchor.center ?? [0, 0, 0];

        return (
          <ViroARPlane key={anchor.anchorId} anchorId={anchor.anchorId} minWidth={0} minHeight={0}>
            <ViroNode position={[center[0], 0, center[2]]}>
              <ViroQuad
                width={width}
                height={height}
                position={[0, 0.003, 0]}
                rotation={[-90, 0, 0]}
                materials={['debugPlaneFill']}
                ignoreEventHandling
              />
              <ViroQuad
                width={width} height={height} position={[0, 0.0035, 0]} rotation={[-90, 0, 0]}
                materials={['placementGrid']} ignoreEventHandling
                uvCoordinates={[0, 0, width / 0.04, height / 0.04] as unknown as React.ComponentProps<typeof ViroQuad>['uvCoordinates']}
              />
            </ViroNode>
          </ViroARPlane>
        );
      })}

      {/* The single jail node. Always mounted: fallback world position until
          the hit test settles it onto a real horizontal surface. */}
      <ViroNode
        position={jailPos}
        dragType={draggingEnabled ? 'FixedToPlane' : undefined}
        dragPlane={draggingEnabled ? { planePoint: jailPos, planeNormal: [0, 1, 0], maxDistance: 2 } : undefined}
        onDrag={draggingEnabled ? onWorldDrag : undefined}
      >
        <VirtualJail3D
          frozen={!!appProps.placed || !!appProps.locked}
          locked={!!appProps.locked}
          onReady={appProps.onModelReady}
          onError={appProps.onModelError}
        />
      </ViroNode>
    </ViroARScene>
  );
}
