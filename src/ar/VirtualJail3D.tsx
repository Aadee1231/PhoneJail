import { useRef, useState } from 'react';
import {
  ViroAnimations,
  ViroBox,
  ViroMaterials,
  ViroNode,
  ViroPinchStateTypes,
  ViroRotateStateTypes,
} from '@reactvision/react-viro';

// --- Jail dimensions in meters: sized to hold a phone lying flat. ---
const W = 0.3; // width (x)
const H = 0.09; // height (y)
const D = 0.18; // depth (z)
const T = 0.004; // edge thickness

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.2;

ViroMaterials.createMaterials({
  jailGlass: {
    diffuseColor: 'rgba(80, 150, 255, 0.10)',
    blendMode: 'Alpha',
    writesToDepthBuffer: false,
  },
  jailEdge: {
    diffuseColor: 'rgba(160, 205, 255, 0.85)',
    blendMode: 'Alpha',
  },
  jailEdgeLocked: {
    diffuseColor: 'rgba(90, 160, 255, 1.0)',
    blendMode: 'Alpha',
  },
  jailGrid: {
    diffuseColor: 'rgba(120, 180, 255, 0.22)',
    blendMode: 'Alpha',
    writesToDepthBuffer: false,
  },
  jailLatch: {
    diffuseColor: 'rgba(200, 225, 255, 0.9)',
    blendMode: 'Alpha',
  },
});

ViroAnimations.registerAnimations({
  jailLockSqueeze: {
    properties: { scaleX: 1.05, scaleY: 1.05, scaleZ: 1.05 },
    duration: 160,
    easing: 'EaseInEaseOut',
  },
  jailLockSettle: {
    properties: { scaleX: 1.0, scaleY: 1.0, scaleZ: 1.0 },
    duration: 300,
    easing: 'EaseInEaseOut',
  },
  // Chained animation (squeeze then settle) — the chain syntax is supported
  // at runtime but not covered by the ViroAnimationDict typing.
  jailLock: [['jailLockSqueeze', 'jailLockSettle']],
} as any);

interface Props {
  /** When true, gestures are disabled and the placement is frozen. */
  frozen: boolean;
  /** When true, the jail plays its closing/locking animation. */
  locked: boolean;
}

/**
 * A translucent containment volume anchored in AR world space.
 * Thin bright edges, subtle transparent faces, and a light internal floor
 * grid. Draggable across the detected plane, pinch-resizable, and rotatable
 * around the vertical axis until frozen.
 */
export function VirtualJail3D({ frozen, locked }: Props) {
  const [scale, setScale] = useState(1);
  const [rotationY, setRotationY] = useState(0);
  const scaleBase = useRef(1);
  const rotationBase = useRef(0);

  const onPinch = (pinchState: any, scaleFactor: number) => {
    if (frozen) return;
    if (pinchState === ViroPinchStateTypes.PINCH_MOVE) {
      setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scaleBase.current * scaleFactor)));
    } else if (pinchState === ViroPinchStateTypes.PINCH_END) {
      scaleBase.current = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scaleBase.current * scaleFactor));
      setScale(scaleBase.current);
    }
  };

  const onRotate = (rotateState: any, rotationFactor: number) => {
    if (frozen) return;
    if (rotateState === ViroRotateStateTypes.ROTATE_MOVE) {
      setRotationY(rotationBase.current - rotationFactor);
    } else if (rotateState === ViroRotateStateTypes.ROTATE_END) {
      rotationBase.current = rotationBase.current - rotationFactor;
      setRotationY(rotationBase.current);
    }
  };

  // Providing onDrag makes the node draggable; FixedToWorld keeps it gliding
  // along real-world geometry (the detected plane).
  const onDrag = () => {};

  const edgeMaterial = locked ? 'jailEdgeLocked' : 'jailEdge';

  const edges: { position: [number, number, number]; dims: [number, number, number] }[] = [];
  // 4 vertical edges
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      edges.push({ position: [(sx * W) / 2, H / 2, (sz * D) / 2], dims: [T, H, T] });
    }
  }
  // 4 + 4 horizontal edges (bottom ring and top ring)
  for (const y of [0, H]) {
    for (const sz of [-1, 1]) {
      edges.push({ position: [0, y, (sz * D) / 2], dims: [W, T, T] });
    }
    for (const sx of [-1, 1]) {
      edges.push({ position: [(sx * W) / 2, y, 0], dims: [T, T, D] });
    }
  }

  // Subtle internal floor grid: 2 lines each direction.
  const grid: { position: [number, number, number]; dims: [number, number, number] }[] = [];
  for (const fx of [-1 / 6, 1 / 6]) {
    grid.push({ position: [fx * W * 2, 0.002, 0], dims: [0.0015, 0.0008, D * 0.94] });
  }
  for (const fz of [-1 / 6, 1 / 6]) {
    grid.push({ position: [0, 0.002, fz * D * 2], dims: [W * 0.94, 0.0008, 0.0015] });
  }

  return (
    <ViroNode
      position={[0, 0, 0]}
      scale={[scale, scale, scale]}
      rotation={[0, rotationY, 0]}
      dragType="FixedToWorld"
      onDrag={frozen ? undefined : onDrag}
      onPinch={frozen ? undefined : onPinch}
      onRotate={frozen ? undefined : onRotate}
      animation={{ name: 'jailLock', run: locked, loop: false }}
    >
      {/* Translucent body */}
      <ViroBox
        position={[0, H / 2, 0]}
        scale={[W, H, D]}
        materials={['jailGlass']}
        opacity={locked ? 0.85 : 0.6}
      />

      {/* Thin bright edge highlights */}
      {edges.map((e, i) => (
        <ViroBox
          key={`edge-${i}`}
          position={e.position}
          scale={e.dims}
          materials={[edgeMaterial]}
        />
      ))}

      {/* Internal floor grid */}
      {grid.map((g, i) => (
        <ViroBox key={`grid-${i}`} position={g.position} scale={g.dims} materials={['jailGrid']} />
      ))}

      {/* Small containment latch on the top face — the "lock" */}
      <ViroBox
        position={[0, H + 0.003, 0]}
        scale={[0.05, 0.005, 0.022]}
        materials={['jailLatch']}
        opacity={locked ? 1 : 0.55}
      />
    </ViroNode>
  );
}
