'use client';

import * as React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';

/**
 * The hero: a tessellated screen, cut from metal.
 *
 * ## Why this and not floating cards
 *
 * The product's claim is that many exactly-priced pieces compose one exact
 * total, with nothing lost between them. The octagon-and-square tiling below is
 * that claim as geometry: it is a *provably gap-free* tessellation — the
 * octagon's apothem is exactly half the grid pitch, and the interstitial square
 * rotated 45° meets four octagon vertices exactly — so the pattern closes with
 * no drift, at any size. It is also the vernacular of Gulf architectural
 * screens, which is the right register for a product built for MENA finance
 * teams.
 *
 * ## Why it looks like metal
 *
 * Reflections, not colour. The environment is built at runtime from
 * `Lightformer` rectangles — a warm key, a cool rim, an overhead strip — baked
 * into a 256px cubemap once (`frames={1}`). That gives the tiles something real
 * to reflect without fetching an HDR from a CDN, which would be an external
 * dependency on the critical path of the first paint.
 *
 * The warm/cool pair is the point: a single gold light on dark makes metal read
 * as flat paint. The steel-blue rim is what gives the bevels an edge.
 *
 * ## Constraints it respects
 *
 * A landing page that stutters is worse than one that is still.
 *   - `prefers-reduced-motion` renders the tiling settled and static.
 *   - Below `lg`, and without WebGL, it renders nothing and the page falls back
 *     to a CSS tessellation.
 *   - Device pixel ratio is capped, and the frame loop pauses off-screen.
 *   - Two `InstancedMesh`es, so ~400 tiles cost two draw calls.
 */

/* --------------------------------------------------------------------------
 * The tiling, derived rather than eyeballed.
 * ------------------------------------------------------------------------ */

/** Grid pitch. Octagon centres sit on a square lattice of this spacing. */
const PITCH = 1;
/** Octagon side, the value that makes the tiling close exactly. */
const SIDE = PITCH / (1 + Math.SQRT2); // 0.414214
/** Octagon circumradius. Its apothem is exactly PITCH / 2, so neighbours touch. */
const OCT_RADIUS = SIDE / (2 * Math.sin(Math.PI / 8)); // 0.541196

/*
 * Sized to overrun the viewport on every side. A grid that merely fits leaves a
 * visible boundary where the tiling stops, which reads as a texture pasted onto
 * the page rather than a screen the page is looking through.
 */
const COLS = 21;
const ROWS = 15;
const OCT_COUNT = COLS * ROWS;
const SQ_COUNT = (COLS - 1) * (ROWS - 1);

const DEPTH = 0.16;

/** Deterministic hash → [0,1). Keeps the relief identical on every load. */
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function octagonShape(): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i += 1) {
    // Vertices at 22.5° + k·45° put flat edges on all eight axes, which is the
    // orientation the interstitial squares need.
    const angle = Math.PI / 8 + (i * Math.PI) / 4;
    const x = Math.cos(angle) * OCT_RADIUS;
    const y = Math.sin(angle) * OCT_RADIUS;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function squareShape(): THREE.Shape {
  const h = SIDE / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-h, -h);
  shape.lineTo(h, -h);
  shape.lineTo(h, h);
  shape.lineTo(-h, h);
  shape.closePath();
  return shape;
}

interface Tile {
  x: number;
  y: number;
  /** Resting depth, giving the screen a carved relief rather than a flat face. */
  z: number;
  /** Seconds to wait before this tile flies in. */
  delay: number;
  /** Where it starts, before it settles. */
  fromZ: number;
  spin: number;
}

function buildTiles(count: number, cols: number, offset: number): Tile[] {
  const tiles: Tile[] = [];
  const cx = (cols - 1) / 2;
  const cy = (count / cols - 1) / 2;

  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col - cx) * PITCH + offset;
    const y = (row - cy) * PITCH + offset;
    const r = hash(col + offset * 7, row + offset * 13);

    tiles.push({
      x,
      y,
      z: r * DEPTH * 1.6,
      // Reveal radiates outward from the centre, so the pattern assembles
      // rather than fading in all at once.
      delay: Math.hypot(x, y) * 0.075 + r * 0.12,
      fromZ: -2.2 - r * 2.4,
      spin: (r - 0.5) * 1.4,
    });
  }
  return tiles;
}

/* -------------------------------------------------------------------------- */

const dummy = new THREE.Object3D();

function Tiling({
  reduced,
  pointer,
  scroll,
}: {
  reduced: boolean;
  pointer: React.MutableRefObject<{ x: number; y: number }>;
  scroll: React.MutableRefObject<number>;
}) {
  const octRef = React.useRef<THREE.InstancedMesh>(null);
  const sqRef = React.useRef<THREE.InstancedMesh>(null);
  const group = React.useRef<THREE.Group>(null);
  const start = React.useRef<number | null>(null);

  const geometry = React.useMemo(() => {
    const settings = {
      depth: DEPTH,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.018,
      bevelSegments: 2,
      curveSegments: 1,
    };
    return {
      oct: new THREE.ExtrudeGeometry(octagonShape(), settings),
      sq: new THREE.ExtrudeGeometry(squareShape(), settings),
    };
  }, []);

  React.useEffect(
    () => () => {
      geometry.oct.dispose();
      geometry.sq.dispose();
    },
    [geometry],
  );

  const octTiles = React.useMemo(() => buildTiles(OCT_COUNT, COLS, 0), []);
  const sqTiles = React.useMemo(
    () => buildTiles(SQ_COUNT, COLS - 1, PITCH / 2),
    [],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (start.current === null) start.current = t;
    const since = t - start.current;

    const write = (
      mesh: THREE.InstancedMesh | null,
      tiles: Tile[],
      rotate: number,
    ) => {
      if (!mesh) return;

      for (let i = 0; i < tiles.length; i += 1) {
        const tile = tiles[i];

        // Reveal: 0 → 1 with an ease-out cubic, so tiles arrive and settle
        // rather than sliding at a constant speed.
        const raw = reduced ? 1 : Math.min(1, Math.max(0, (since - tile.delay) / 1.1));
        const eased = 1 - (1 - raw) ** 3;

        // A slow breath across the surface, so a settled screen is not frozen.
        const breath = reduced
          ? 0
          : Math.sin(t * 0.5 + tile.x * 0.42 + tile.y * 0.3) * 0.035;

        // The pointer lifts the tiles nearest it, like a hand under fabric.
        const dx = tile.x - pointer.current.x;
        const dy = tile.y - pointer.current.y;
        const lift = reduced ? 0 : Math.exp(-(dx * dx + dy * dy) / 5.5) * 0.42;

        dummy.position.set(
          tile.x,
          tile.y,
          THREE.MathUtils.lerp(tile.fromZ, tile.z + breath + lift, eased),
        );
        dummy.rotation.set(0, 0, rotate + tile.spin * (1 - eased));
        const scale = 0.35 + 0.65 * eased;
        dummy.scale.set(scale, scale, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };

    write(octRef.current, octTiles, 0);
    write(sqRef.current, sqTiles, Math.PI / 4);

    if (group.current && !reduced) {
      // A slight lean toward the cursor, and a tilt as the page scrolls away.
      group.current.rotation.x = THREE.MathUtils.lerp(
        group.current.rotation.x,
        -0.18 - pointer.current.y * 0.02 + scroll.current * 0.28,
        0.05,
      );
      group.current.rotation.y = THREE.MathUtils.lerp(
        group.current.rotation.y,
        0.42 + pointer.current.x * 0.012,
        0.05,
      );
    }
  });

  return (
    <group ref={group} rotation={[-0.18, 0.42, 0.06]} position={[0.4, 0, 0]}>
      <instancedMesh
        ref={octRef}
        args={[geometry.oct, undefined, OCT_COUNT]}
        frustumCulled={false}
      >
        {/* Dark tempered steel — the body of the screen. */}
        <meshStandardMaterial color="#2b3648" metalness={1} roughness={0.34} />
      </instancedMesh>

      <instancedMesh
        ref={sqRef}
        args={[geometry.sq, undefined, SQ_COUNT]}
        frustumCulled={false}
      >
        {/* Bronze — the small connecting pieces, and the accent. */}
        <meshStandardMaterial color="#a06f28" metalness={1} roughness={0.24} />
      </instancedMesh>
    </group>
  );
}

/**
 * The light behind the screen.
 *
 * Drawn to a canvas at runtime rather than loaded as an image, so the page
 * carries no binary asset for something that is two radial gradients.
 */
function Backlight() {
  const texture = React.useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const warm = ctx.createRadialGradient(
      size * 0.62, size * 0.4, 0,
      size * 0.62, size * 0.4, size * 0.55,
    );
    warm.addColorStop(0, 'rgba(217,155,50,0.85)');
    warm.addColorStop(0.5, 'rgba(176,119,36,0.28)');
    warm.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, size, size);

    const cool = ctx.createRadialGradient(
      size * 0.24, size * 0.74, 0,
      size * 0.24, size * 0.74, size * 0.5,
    );
    cool.addColorStop(0, 'rgba(123,167,206,0.5)');
    cool.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cool;
    ctx.fillRect(0, 0, size, size);

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, []);

  React.useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;

  return (
    <mesh position={[0.4, 0, -2.6]} rotation={[-0.18, 0.42, 0.06]}>
      <planeGeometry args={[26, 20]} />
      <meshBasicMaterial map={texture} transparent opacity={0.95} depthWrite={false} />
    </mesh>
  );
}

function Scene({
  reduced,
  pointer,
  scroll,
}: {
  reduced: boolean;
  pointer: React.MutableRefObject<{ x: number; y: number }>;
  scroll: React.MutableRefObject<number>;
}) {
  const { camera } = useThree();

  React.useEffect(() => {
    camera.position.set(0, 0, 9.4);
    camera.lookAt(0.4, 0, 0);
  }, [camera]);

  return (
    <>
      <Backlight />

      <ambientLight intensity={0.35} />
      {/* Warm key from upper right. */}
      <directionalLight position={[5, 6, 6]} intensity={2.2} color="#f0c87f" />
      {/* Cool rim from lower left — what makes the bevels read as edges. */}
      <directionalLight position={[-6, -3, 4]} intensity={1.5} color="#7ba7ce" />

      <Tiling reduced={reduced} pointer={pointer} scroll={scroll} />

      {/*
        The environment is generated here, not fetched. `frames={1}` renders the
        cubemap once and then stops, so the reflections cost nothing per frame.
      */}
      <Environment resolution={256} frames={1}>
        <Lightformer
          form="rect"
          intensity={5}
          color="#ffd9a0"
          position={[-4, 3, 5]}
          scale={[9, 9, 1]}
        />
        <Lightformer
          form="rect"
          intensity={3}
          color="#9cc4ec"
          position={[5, -2, 4]}
          scale={[7, 7, 1]}
        />
        <Lightformer
          form="ring"
          intensity={4}
          color="#ffffff"
          position={[0, 5, -3]}
          scale={5}
        />
        <Lightformer
          form="rect"
          intensity={1.4}
          color="#2b3648"
          position={[0, -6, 2]}
          scale={[12, 4, 1]}
        />
      </Environment>
    </>
  );
}

/* -------------------------------------------------------------------------- */

export default function TessellationScreen() {
  const pointer = React.useRef({ x: 0, y: 0 });
  const scroll = React.useRef(0);
  const container = React.useRef<HTMLDivElement>(null);

  const [enabled, setEnabled] = React.useState(false);
  const [reduced, setReduced] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  /** Set when the browser takes the WebGL context back. See `onCreated` below. */
  const [lost, setLost] = React.useState(false);

  React.useEffect(() => {
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const wideEnough = window.matchMedia('(min-width: 1024px)').matches;

    // Probe for WebGL rather than assuming it — a thrown context here would
    // take the whole hero down with it.
    let hasWebGL = false;
    try {
      const probe = document.createElement('canvas');
      hasWebGL = Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
    } catch {
      hasWebGL = false;
    }

    setReduced(prefersReduced);
    setEnabled(wideEnough && hasWebGL);
  }, []);

  React.useEffect(() => {
    if (!enabled) return;

    const onPointerMove = (event: PointerEvent) => {
      // Approximate screen → grid mapping. The effect is atmospheric, so a
      // linear fit reads identically to a real raycast and costs nothing.
      pointer.current = {
        x: (event.clientX / window.innerWidth - 0.5) * 14,
        y: -(event.clientY / window.innerHeight - 0.5) * 10,
      };
    };

    const onScroll = () => {
      const top = container.current?.getBoundingClientRect().top ?? 0;
      scroll.current = Math.min(1, Math.max(0, -top / window.innerHeight));
    };

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '160px' },
    );
    if (container.current) observer.observe(container.current);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [enabled]);

  return (
    <div ref={container} className="absolute inset-0" aria-hidden>
      {enabled && !lost ? (
        <Canvas
          dpr={[1, 1.75]}
          frameloop={visible ? 'always' : 'demand'}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
          }}
          camera={{ fov: 38, position: [0, 0, 9.4] }}
          /*
           * A WebGL context is not guaranteed for the life of the page. The
           * browser takes it back when the GPU driver resets, when too many
           * contexts are open across tabs, or when a laptop switches graphics
           * card — and once lost, the canvas paints nothing ever again unless
           * the scene is rebuilt.
           *
           * The default behaviour is therefore a permanently black hero on
           * somebody's machine, with a console warning as the only clue.
           * Preventing the default event keeps the browser willing to restore
           * the context, and dropping to the static screen in the meantime
           * means the page still looks like itself rather than like a bug.
           */
          onCreated={({ gl }) => {
            const canvas = gl.domElement;

            canvas.addEventListener('webglcontextlost', (event) => {
              event.preventDefault();
              setLost(true);
            });

            // Remounting the Canvas is what actually rebuilds the scene; the
            // restored context alone has none of the geometry in it.
            canvas.addEventListener('webglcontextrestored', () => setLost(false));
          }}
        >
          <React.Suspense fallback={null}>
            <Scene reduced={reduced} pointer={pointer} scroll={scroll} />
          </React.Suspense>
        </Canvas>
      ) : (
        <StaticScreen />
      )}
    </div>
  );
}

/**
 * The fallback.
 *
 * The same tessellation flattened into CSS, so a phone or a machine without
 * WebGL still gets the pattern that gives the product its name — rather than
 * an empty rectangle where the hero should be.
 */
function StaticScreen() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="tessellate absolute inset-0 opacity-70" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_65%_38%,rgba(217,155,50,0.22),transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(45%_45%_at_22%_78%,rgba(123,167,206,0.16),transparent_70%)]" />
    </div>
  );
}
