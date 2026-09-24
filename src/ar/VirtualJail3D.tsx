import { useEffect, useRef, useState } from 'react';
import {
  ViroAnimations,
  ViroBox,
  ViroMaterials,
  ViroNode,
  ViroPinchStateTypes,
  ViroRotateStateTypes,
} from '@reactvision/react-viro';

// --- Jail dimensions in meters: compact containment zone sized to hold a
// phone lying flat (a phone is ~0.15 x 0.075 m) with visible margin. ---
const W = 0.24; // width (x)
const H = 0.08; // height (y)
const D = 0.15; // depth (z)

const EDGE_T = 0.004; // bright perimeter edge thickness
const GLOW_T = 0.016; // soft additive glow shell around each edge
const CORNER_T = 0.007; // bright corner accent node size
const CORNER_GLOW_T = 0.02; // additive glow around each corner node
const PANEL_T = 0.0016; // translucent glass slab thickness
const LINE_T = 0.0012; // interior panel divider line thickness
const INSET = 0.002; // divider lines sit just inside the glass surface

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.2;

ViroMaterials.createMaterials({
  // Translucent cyan glass for all six faces — the real environment stays
  // visible through them (force-field / containment-chamber look).
  jailPanel: {
    diffuseColor: 'rgba(96, 190, 255, 0.26)',
    lightingModel: 'Constant',
    blendMode: 'Alpha',
    cullMode: 'None',
    writesToDepthBuffer: false,
  },
  jailPanelLocked: {
    diffuseColor: 'rgba(125, 205, 255, 0.34)',
    lightingModel: 'Constant',
    blendMode: 'Alpha',
    cullMode: 'None',
    writesToDepthBuffer: false,
  },
  // The floor panel is the most defined face — a slightly stronger holographic
  // sheet so the jail reads as "sitting on" a lit base.
  jailFloor: {
    diffuseColor: 'rgba(105, 200, 255, 0.38)',
    lightingModel: 'Constant',
    blendMode: 'Alpha',
    cullMode: 'None',
    writesToDepthBuffer: false,
  },
  jailFloorLocked: {
    diffuseColor: 'rgba(140, 220, 255, 0.46)',
    lightingModel: 'Constant',
    blendMode: 'Alpha',
    cullMode: 'None',
    writesToDepthBuffer: false,
  },
  // Thin, bright icy-cyan perimeter lines.
  jailEdge: {
    diffuseColor: 'rgba(184, 234, 255, 0.98)',
    lightingModel: 'Constant',
    blendMode: 'Alpha',
    writesToDepthBuffer: false,
  },
  jailEdgeLocked: {
    diffuseColor: 'rgba(215, 246, 255, 1.0)',
    lightingModel: 'Constant',
    blendMode: 'Alpha',
    writesToDepthBuffer: false,
  },
  // Restrained additive glow shell around the perimeter edges. Where the
  // shells intersect at corners the additive blend brightens naturally.
  jailEdgeGlow: {
    diffuseColor: 'rgba(64, 170, 255, 0.28)',
    lightingModel: 'Constant',
    blendMode: 'Add',
    cullMode: 'None',
    writesToDepthBuffer: false,
  },
  // Small bright accent nodes at the eight corners — deliberate sci-fi
  // "anchor points", not floating balls.
  jailCorner: {
    diffuseColor: 'rgba(225, 250, 255, 0.98)',
    lightingModel: 'Constant',
    blendMode: 'Alpha',
    writesToDepthBuffer: false,
  },
  jailCornerGlow: {
    diffuseColor: 'rgba(80, 180, 255, 0.30)',
    lightingModel: 'Constant',
    blendMode: 'Add',
    cullMode: 'None',
    writesToDepthBuffer: false,
  },
  // Much dimmer interior divider lines across the panels.
  jailGrid: {
    diffuseColor: 'rgba(90, 165, 240, 0.34)',
    lightingModel: 'Constant',
    blendMode: 'Alpha',
    writesToDepthBuffer: false,
  },
  // Slightly brighter grid lines for the floor panel.
  jailFloorGrid: {
    diffuseColor: 'rgba(150, 220, 255, 0.5)',
    lightingModel: 'Constant',
    blendMode: 'Alpha',
    writesToDepthBuffer: false,
  },
  // Soft radial contact halo under the jail — a white-alpha feathered ring
  // texture, tinted blue-cyan by the material color.
  jailHalo: {
    diffuseTexture: require('../../assets/models/halo.png'),
    diffuseColor: 'rgba(96, 190, 255, 1.0)',
    lightingModel: 'Constant',
    blendMode: 'Add',
    cullMode: 'None',
    writesToDepthBuffer: false,
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
  /** Called once the jail mesh has mounted and is ready for placement. */
  onReady?: () => void;
  /** Called if the jail mesh fails to initialize. */
  onError?: (message: string) => void;
}

/**
 * A holographic containment volume anchored in AR world space: six translucent
 * glass panels, thin bright cyan perimeter edges with a restrained additive
 * glow, dim interior divider lines on each face, and a soft feathered halo on
 * the ground. Pinch-resizable and rotatable around the vertical axis until
 * frozen. Drag is handled by the parent AR scene node in world space.
 */
export function VirtualJail3D({ frozen, locked, onReady, onError }: Props) {
  const [scale, setScale] = useState(1);
  const [rotationY, setRotationY] = useState(0);
  const scaleBase = useRef(1);
  const rotationBase = useRef(0);
  const readyReported = useRef(false);

  useEffect(() => {
    if (!readyReported.current) {
      readyReported.current = true;
      onReady?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { readyReported.current = false; }, []);

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

  const edgeMaterial = locked ? 'jailEdgeLocked' : 'jailEdge';
  const panelMaterial = locked ? 'jailPanelLocked' : 'jailPanel';
  const floorMaterial = locked ? 'jailFloorLocked' : 'jailFloor';

  // Six translucent glass panels — one per face of the enclosure. The floor
  // uses the stronger holographic material.
  const panels: { position: [number, number, number]; dims: [number, number, number]; floor?: boolean }[] = [
    { position: [0, PANEL_T / 2, 0], dims: [W, PANEL_T, D], floor: true }, // floor
    { position: [0, H - PANEL_T / 2, 0], dims: [W, PANEL_T, D] }, // ceiling
    { position: [0, H / 2, D / 2], dims: [W, H, PANEL_T] }, // front
    { position: [0, H / 2, -D / 2], dims: [W, H, PANEL_T] }, // back
    { position: [-W / 2, H / 2, 0], dims: [PANEL_T, H, D] }, // left
    { position: [W / 2, H / 2, 0], dims: [PANEL_T, H, D] }, // right
  ];

  // 12 bright perimeter edges plus a wider, dimmer additive glow shell on
  // each — the glow reads as a soft halo around the frame and brightens at
  // the corners where shells intersect.
  const edges: { position: [number, number, number]; dims: [number, number, number] }[] = [];
  const glowEdges: { position: [number, number, number]; dims: [number, number, number] }[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const position: [number, number, number] = [(sx * W) / 2, H / 2, (sz * D) / 2];
      edges.push({ position, dims: [EDGE_T, H, EDGE_T] });
      glowEdges.push({ position, dims: [GLOW_T, H, GLOW_T] });
    }
  }
  for (const y of [0, H]) {
    for (const sz of [-1, 1]) {
      const position: [number, number, number] = [0, y, (sz * D) / 2];
      edges.push({ position, dims: [W, EDGE_T, EDGE_T] });
      glowEdges.push({ position, dims: [W, GLOW_T, GLOW_T] });
    }
    for (const sx of [-1, 1]) {
      const position: [number, number, number] = [(sx * W) / 2, y, 0];
      edges.push({ position, dims: [EDGE_T, EDGE_T, D] });
      glowEdges.push({ position, dims: [GLOW_T, GLOW_T, D] });
    }
  }

  // Small bright accent node + a soft additive glow at each of the eight
  // corners — matches the glowing corner points in the 2D preview.
  const corners: [number, number, number][] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [0, H]) {
      for (const sz of [-1, 1]) {
        corners.push([(sx * W) / 2, sy, (sz * D) / 2]);
      }
    }
  }

  // Subtle interior divider lines across each panel — deliberately dimmer
  // than the frame and inset slightly inside the glass so they read as
  // etched holographic circuitry rather than extra bars. The floor gets the
  // densest grid, mirroring the 2D preview's floor treatment.
  const lines: { position: [number, number, number]; dims: [number, number, number]; floor?: boolean }[] = [];
  // Front and back faces: 3 verticals + 1 horizontal.
  for (const z of [D / 2 - INSET, -(D / 2 - INSET)]) {
    for (const x of [-W / 4, 0, W / 4]) {
      lines.push({ position: [x, H / 2, z], dims: [LINE_T, H - EDGE_T * 2, LINE_T] });
    }
    lines.push({ position: [0, H / 2, z], dims: [W - EDGE_T * 2, LINE_T, LINE_T] });
  }
  // Left and right faces: 2 verticals + 1 horizontal.
  for (const x of [W / 2 - INSET, -(W / 2 - INSET)]) {
    for (const z of [-D / 4, D / 4]) {
      lines.push({ position: [x, H / 2, z], dims: [LINE_T, H - EDGE_T * 2, LINE_T] });
    }
    lines.push({ position: [x, H / 2, 0], dims: [LINE_T, LINE_T, D - EDGE_T * 2] });
  }
  // Floor: 3 depth-running + 2 width-running lines (strongest treatment).
  for (const x of [-W / 4, 0, W / 4]) {
    lines.push({ position: [x, PANEL_T + 0.0008, 0], dims: [LINE_T, LINE_T, D - EDGE_T * 2], floor: true });
  }
  for (const z of [-D / 4, D / 4]) {
    lines.push({ position: [0, PANEL_T + 0.0008, z], dims: [W - EDGE_T * 2, LINE_T, LINE_T], floor: true });
  }
  // Ceiling: a light 2 + 1 grid.
  for (const x of [-W / 4, W / 4]) {
    lines.push({ position: [x, H - PANEL_T - 0.0008, 0], dims: [LINE_T, LINE_T, D - EDGE_T * 2] });
  }
  lines.push({ position: [0, H - PANEL_T - 0.0008, 0], dims: [W - EDGE_T * 2, LINE_T, LINE_T] });

  return (
    <ViroNode
      position={[0, 0, 0]}
      scale={[scale, scale, scale]}
      rotation={[0, rotationY, 0]}
      onPinch={frozen ? undefined : onPinch}
      onRotate={frozen ? undefined : onRotate}
      animation={{ name: 'jailLock', run: locked, loop: false }}
    >
      {/* Soft feathered contact halo under the jail. The texture's bright
          ring lands on the footprint perimeter and fades outward. */}
      <ViroBox
        position={[0, -0.0015, 0]}
        scale={[W * 1.5, 0.001, D * 1.7]}
        materials={['jailHalo']}
        opacity={locked ? 1 : 0.85}
      />

      {/* Six translucent glass panels */}
      {panels.map((p, i) => (
        <ViroBox
          key={`panel-${i}`}
          position={p.position}
          scale={p.dims}
          materials={[p.floor ? floorMaterial : panelMaterial]}
        />
      ))}

      {/* Restrained additive glow around the perimeter */}
      {glowEdges.map((e, i) => (
        <ViroBox
          key={`glow-${i}`}
          position={e.position}
          scale={e.dims}
          materials={['jailEdgeGlow']}
        />
      ))}

      {/* Thin bright perimeter edges */}
      {edges.map((e, i) => (
        <ViroBox
          key={`edge-${i}`}
          position={e.position}
          scale={e.dims}
          materials={[edgeMaterial]}
        />
      ))}

      {/* Glowing corner accent nodes */}
      {corners.map((p, i) => (
        <ViroBox
          key={`corner-glow-${i}`}
          position={p}
          scale={[CORNER_GLOW_T, CORNER_GLOW_T, CORNER_GLOW_T]}
          materials={['jailCornerGlow']}
        />
      ))}
      {corners.map((p, i) => (
        <ViroBox
          key={`corner-${i}`}
          position={p}
          scale={[CORNER_T, CORNER_T, CORNER_T]}
          materials={['jailCorner']}
        />
      ))}

      {/* Dim interior divider lines on the panels */}
      {lines.map((g, i) => (
        <ViroBox
          key={`line-${i}`}
          position={g.position}
          scale={g.dims}
          materials={[g.floor ? 'jailFloorGrid' : 'jailGrid']}
        />
      ))}
    </ViroNode>
  );
}
