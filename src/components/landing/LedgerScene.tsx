'use client';

import * as React from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Float, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

/**
 * The hero.
 *
 * Three glass plates, one per line item on the brief's sample document, each
 * ruled with rows. They drift apart while the page is at rest and converge as
 * you scroll, resolving into a single brass-edged plate: the settled total.
 *
 * The metaphor is the product's actual claim — many lines, each with its own
 * discount and tax rate, resolving into one number that ties out — rather than
 * decoration bolted onto a headline.
 *
 * Constraints it respects, because a landing page that stutters is worse than
 * one that is still:
 *   - `prefers-reduced-motion` freezes the composition; nothing animates.
 *   - Below `md`, and on machines without WebGL, it renders nothing and the
 *     page falls back to a CSS composition.
 *   - Device pixel ratio is capped at 2 and the frame loop pauses when the
 *     canvas scrolls out of view.
 */

const BRASS = '#cda349';
const VERDIGRIS = '#4a9a8f';
const PARCHMENT = '#ede8dd';

/** Plate geometry, shared so the rows can be laid out from its real edges. */
const PLATE_WIDTH = 2.6;
const PLATE_HEIGHT = 1.5;
const PLATE_DEPTH = 0.04;
const TEXT_MARGIN = 0.22;
const TEXT_LEFT = -PLATE_WIDTH / 2 + TEXT_MARGIN;
const TEXT_RIGHT = PLATE_WIDTH / 2 - TEXT_MARGIN;

interface PlateProps {
  index: number;
  rows: number;
  accent?: boolean;
  progress: React.MutableRefObject<number>;
  pointer: React.MutableRefObject<{ x: number; y: number }>;
}

/** One line item, as a plate of ruled glass. */
function Plate({ index, rows, accent = false, progress, pointer }: PlateProps) {
  const group = React.useRef<THREE.Group>(null);

  // Resting position: a staggered stack, fanned out in depth.
  const restY = 1.12 - index * 1.12;
  const restZ = -index * 0.5;
  const restRotation = -0.28 + index * 0.04;

  useFrame((state) => {
    if (!group.current) return;

    // As the reader scrolls, the plates close the gap between them: the
    // document is resolving into a single figure.
    const converge = progress.current;
    const y = THREE.MathUtils.lerp(restY, 0.16 - index * 0.18, converge);
    const z = THREE.MathUtils.lerp(restZ, -index * 0.07, converge);

    // Ambient drift, plus a light parallax lean toward the cursor. Small
    // enough to read as physicality rather than as an effect.
    const t = state.clock.elapsedTime;
    const breathe = Math.sin(t * 0.42 + index * 1.4) * 0.045;

    group.current.position.set(
      Math.sin(t * 0.3 + index) * 0.04 + pointer.current.x * 0.22,
      y + breathe,
      z,
    );
    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      restRotation - pointer.current.y * 0.12,
      0.06,
    );
    group.current.rotation.y = THREE.MathUtils.lerp(
      group.current.rotation.y,
      0.42 + pointer.current.x * 0.18,
      0.06,
    );
  });

  return (
    <Float speed={1.1} rotationIntensity={0.12} floatIntensity={0.28}>
      <group ref={group} position={[0, restY, restZ]} rotation={[restRotation, 0.42, 0]}>
        {/* The sheet itself — frosted glass over a faint ink tint. */}
        <RoundedBox
          args={[PLATE_WIDTH, PLATE_HEIGHT, PLATE_DEPTH]}
          radius={0.045}
          smoothness={4}
        >
          <meshPhysicalMaterial
            color={accent ? '#2b3550' : '#212b40'}
            roughness={0.2}
            metalness={0.05}
            transmission={0.6}
            thickness={0.35}
            ior={1.4}
            clearcoat={0.55}
            clearcoatRoughness={0.35}
            transparent
            opacity={0.96}
          />
        </RoundedBox>

        {/* A brass edge on the total plate, verdigris on the others. */}
        <lineSegments position={[0, 0, 0]}>
          <edgesGeometry
            args={[new THREE.BoxGeometry(PLATE_WIDTH, PLATE_HEIGHT, PLATE_DEPTH)]}
          />
          <lineBasicMaterial
            color={accent ? BRASS : VERDIGRIS}
            transparent
            opacity={accent ? 0.95 : 0.5}
          />
        </lineSegments>

        {/*
          Ruled rows — a document read from across the room.

          Rows are laid out from the plate's own edges: `PLATE_HALF` minus a
          margin gives the text block's left and right bounds, and each row is
          centred inside that. Positioning them from an arbitrary offset is how
          they ended up hanging off the side of the sheet.
        */}
        {Array.from({ length: rows }).map((_, row) => {
          const isTotal = row === rows - 1 && accent;
          const width = isTotal ? 0.85 : 1.5 - (row % 3) * 0.32;
          const x = isTotal
            ? TEXT_RIGHT - width / 2 // the total sits right-aligned
            : TEXT_LEFT + width / 2;
          return (
            <mesh key={row} position={[x, 0.42 - row * 0.26, 0.024]}>
              <planeGeometry args={[width, 0.045]} />
              <meshBasicMaterial
                color={isTotal ? BRASS : PARCHMENT}
                transparent
                opacity={isTotal ? 1 : 0.4}
              />
            </mesh>
          );
        })}

        {/* The double rule under the total — the product's own mark, in 3D. */}
        {accent
          ? [0.055, 0.085].map((offset) => (
              <mesh
                key={offset}
                position={[
                  TEXT_RIGHT - 0.425,
                  0.42 - (rows - 1) * 0.26 - offset,
                  0.024,
                ]}
              >
                <planeGeometry args={[0.85, 0.01]} />
                <meshBasicMaterial color={BRASS} transparent opacity={0.95} />
              </mesh>
            ))
          : null}
      </group>
    </Float>
  );
}

function Scene({
  progress,
  pointer,
}: {
  progress: React.MutableRefObject<number>;
  pointer: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const { camera } = useThree();

  React.useEffect(() => {
    camera.position.set(0, 0, 7.2);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return (
    <>
      <ambientLight intensity={0.9} />
      {/* A warm brass key from upper right, a cool verdigris fill from the left. */}
      <directionalLight position={[4, 5, 4]} intensity={1.05} color={BRASS} />
      <directionalLight position={[-5, -1, 3]} intensity={0.9} color={VERDIGRIS} />
      {/*
        A broad, distant fill rather than a close point light. Up close the
        point light burned a specular hotspot into the middle of each sheet,
        which read as a lens flare rather than as glass.
      */}
      <directionalLight position={[0, 0, 6]} intensity={0.6} color="#ffffff" />

      <Plate index={0} rows={4} progress={progress} pointer={pointer} />
      <Plate index={1} rows={3} progress={progress} pointer={pointer} />
      <Plate index={2} rows={4} accent progress={progress} pointer={pointer} />

      <Environment preset="night" />
    </>
  );
}

export default function LedgerScene() {
  const progress = React.useRef(0);
  const pointer = React.useRef({ x: 0, y: 0 });
  const container = React.useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = React.useState(false);
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wideEnough = window.matchMedia('(min-width: 768px)').matches;

    // Probe for WebGL rather than assuming it. A thrown context here would take
    // the whole hero down with it.
    let hasWebGL = false;
    try {
      const probe = document.createElement('canvas');
      hasWebGL = Boolean(
        probe.getContext('webgl2') ?? probe.getContext('webgl'),
      );
    } catch {
      hasWebGL = false;
    }

    setEnabled(!reduced && wideEnough && hasWebGL);
  }, []);

  React.useEffect(() => {
    if (!enabled) return;

    const onScroll = () => {
      const top = container.current?.getBoundingClientRect().top ?? 0;
      // 0 at rest, 1 once the hero has scrolled a viewport height away.
      progress.current = Math.min(1, Math.max(0, -top / window.innerHeight));
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.current = {
        x: (event.clientX / window.innerWidth - 0.5) * 2,
        y: (event.clientY / window.innerHeight - 0.5) * 2,
      };
    };

    // Pausing the render loop off-screen keeps the GPU idle while someone reads
    // the rest of the page.
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '120px' },
    );
    if (container.current) observer.observe(container.current);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointerMove);
      observer.disconnect();
    };
  }, [enabled]);

  return (
    <div ref={container} className="absolute inset-0" aria-hidden>
      {/* The glow the scene sits in, painted in CSS so it costs no GPU time. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_65%_38%,rgba(205,163,73,0.16),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_45%_at_20%_75%,rgba(74,154,143,0.12),transparent_70%)]" />

      {enabled ? (
        <Canvas
          dpr={[1, 2]}
          frameloop={visible ? 'always' : 'demand'}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          camera={{ fov: 40, position: [0, 0, 7.2] }}
        >
          <React.Suspense fallback={null}>
            <Scene progress={progress} pointer={pointer} />
          </React.Suspense>
        </Canvas>
      ) : (
        <StaticPlates />
      )}
    </div>
  );
}

/**
 * The fallback composition.
 *
 * Same idea in CSS — three stacked ruled plates with the total in brass — so
 * a phone, a reduced-motion preference or a machine without WebGL still gets
 * the point of the hero rather than an empty rectangle.
 */
function StaticPlates() {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div className="relative h-[22rem] w-[20rem] [perspective:1000px] sm:w-[26rem]">
        {[0, 1, 2].map((index) => {
          const accent = index === 2;
          return (
            <div
              key={index}
              className="absolute inset-x-0 rounded-sheet border p-5 backdrop-blur-sm"
              style={{
                top: `${index * 5.5}rem`,
                transform: `rotateX(48deg) rotateZ(-24deg) translateZ(${index * 14}px)`,
                borderColor: accent ? 'rgba(205,163,73,0.55)' : 'rgba(74,154,143,0.22)',
                background: accent ? 'rgba(28,36,54,0.9)' : 'rgba(20,27,42,0.85)',
              }}
            >
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="mb-2 h-1 rounded-full"
                  style={{
                    width: `${68 - row * 16}%`,
                    background:
                      accent && row === 2
                        ? 'rgba(205,163,73,0.9)'
                        : 'rgba(237,232,221,0.2)',
                    marginLeft: accent && row === 2 ? 'auto' : undefined,
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
