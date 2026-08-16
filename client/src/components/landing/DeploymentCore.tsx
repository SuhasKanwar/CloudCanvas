"use client";

import Image from "next/image";
import { motion, useTransform, type MotionValue } from "motion/react";

type Progress = MotionValue<number>;

const nodes = Array.from({ length: 18 }, (_, index) => {
  const angle = (index / 18) * Math.PI * 2;
  return { cx: (300 + Math.cos(angle) * (92 + (index % 3) * 18)).toFixed(3), cy: (300 + Math.sin(angle) * (72 + (index % 4) * 12)).toFixed(3), r: index % 4 === 0 ? 7 : 4 };
});
const blueprintParts = [
  { label: "SOURCE", x: 120, kind: "source", color: "var(--primary-color)" },
  { label: "BUILD", x: 335, kind: "build", color: "var(--secondary-color)" },
  { label: "POLICY", x: 550, kind: "policy", color: "var(--accent-color)" },
  { label: "RUNTIME", x: 765, kind: "runtime", color: "var(--success-color)" },
  { label: "EDGE", x: 980, kind: "edge", color: "var(--danger-color)" },
] as const;

function DarkDial({ progress }: { progress: Progress }) {
  const opacity = useTransform(progress, [0, 0.46, 0.53], [1, 1, 0]);
  const scale = useTransform(progress, [0, 0.2, 0.47], [0.78, 1, 1.08]);
  const x = useTransform(progress, [0, 0.3, 0.48], ["12vw", "7vw", "1vw"]);
  const rotate = useTransform(progress, [0, 0.48], [-8, 22]);
  const topologyOpacity = useTransform(progress, [0, 0.2, 0.27], [1, 1, 0]);
  const gridOpacity = useTransform(progress, [0.2, 0.28, 0.35, 0.41], [0, 1, 1, 0]);
  const validationOpacity = useTransform(progress, [0.36, 0.43, 0.51], [0, 1, 0]);

  return (
    <motion.div className="absolute left-1/2 top-1/2 z-10 aspect-square w-[min(78vw,710px)] -translate-x-1/2 -translate-y-1/2" style={{ opacity, scale, x }}>
      <motion.div className="absolute inset-0" style={{ rotate }}>
        <Image alt="" className="object-contain" fill priority sizes="(max-width: 768px) 78vw, 710px" src="/deployment-core-simple.png" />
      </motion.div>
      <svg aria-hidden="true" className="relative z-10 h-full w-full overflow-visible" viewBox="0 0 600 600">
        <defs>
          <filter id="core-glow"><feGaussianBlur stdDeviation="7" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          <pattern id="dot-grid" width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" fill="var(--primary-text-color)" opacity=".18" r="1.2" /></pattern>
        </defs>

        <motion.g style={{ opacity: topologyOpacity }}>
          {[0, 30, 60, 90, 120, 150].map((angle) => <ellipse key={angle} cx="300" cy="300" fill="none" rx="122" ry="62" stroke="var(--primary-color)" strokeWidth="2" transform={`rotate(${angle} 300 300)`} />)}
          {nodes.map((node, index) => <circle key={index} {...node} fill={index % 3 === 0 ? "var(--secondary-color)" : "var(--primary-color)"} />)}
          <circle cx="300" cy="300" fill="var(--primary-text-color)" r="8" />
        </motion.g>

        <motion.g style={{ opacity: gridOpacity }}>
          <rect fill="url(#dot-grid)" height="250" rx="56" stroke="var(--success-color)" strokeDasharray="4 7" width="250" x="175" y="175" />
          {[0, 1, 2, 3, 4].map((row) => <circle key={row} cx={250 + row * 25} cy={238 + row * 30} fill="var(--success-color)" filter="url(#core-glow)" r={18 - row * 1.5} />)}
        </motion.g>

        <motion.g style={{ opacity: validationOpacity }}>
          <circle cx="300" cy="300" fill="none" r="118" stroke="var(--danger-color)" strokeDasharray="3 8" />
          {Array.from({ length: 64 }, (_, index) => <circle key={index} cx={244 + (index % 8) * 16} cy={244 + Math.floor(index / 8) * 16} fill={index % 5 === 0 ? "var(--secondary-color)" : "var(--danger-color)"} opacity={0.55 + (index % 3) * 0.2} r={index % 4 === 0 ? 6 : 4} />)}
          <path d="m265 304 23 23 51-57" fill="none" stroke="var(--primary-text-color)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10" />
        </motion.g>
      </svg>
    </motion.div>
  );
}

function BlueprintPart({ index, part, progress }: { index: number; part: (typeof blueprintParts)[number]; progress: Progress }) {
  const spread = (index - 2) * 22;
  const x = useTransform(progress, [0.5, 0.72], [spread * 0.15, spread]);
  const opacity = useTransform(progress, [0.5 + index * 0.02, 0.62 + index * 0.02], [0, 1]);

  return (
    <motion.g style={{ opacity, x }}>
      <circle cx={part.x} cy="250" fill="var(--blueprint-bg)" r="76" stroke="var(--blueprint-line)" strokeWidth="2" />
      <circle cx={part.x} cy="250" fill="none" r="64" stroke={part.color} strokeDasharray="3 8" strokeWidth="2" />
      <BlueprintGlyph kind={part.kind} x={part.x} />
      <circle cx={part.x} cy="154" fill={part.color} r="5" />
      <text fill="var(--blueprint-line)" fontFamily="monospace" fontSize="11" textAnchor="middle" x={part.x} y="360">0{index + 1} / {part.label}</text>
    </motion.g>
  );
}

function BlueprintGlyph({ kind, x }: { kind: (typeof blueprintParts)[number]["kind"]; x: number }) {
  if (kind === "source") return <g fill="none" stroke="var(--blueprint-text)" strokeWidth="4"><path d={`M${x - 30} 220v52c0 18 14 30 30 30M${x - 30} 248h42c14 0 24-10 24-24v-8`} /><circle cx={x - 30} cy="214" r="8" /><circle cx={x + 36} cy="208" r="8" /><circle cx={x} cy="304" r="8" /></g>;
  if (kind === "build") return <g fill="none" stroke="var(--blueprint-text)" strokeLinejoin="round" strokeWidth="4"><path d={`m${x} 202 42 24v48l-42 24-42-24v-48Z`} /><path d={`m${x - 42} 226 42 24 42-24M${x} 250v48`} /></g>;
  if (kind === "policy") return <g fill="none" stroke="var(--blueprint-text)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4"><path d={`M${x} 198c22 17 43 19 43 19v37c0 31-20 48-43 57-23-9-43-26-43-57v-37s21-2 43-19Z`} /><path d={`m${x - 18} 253 13 13 27-31`} /></g>;
  if (kind === "runtime") return <g fill="none" stroke="var(--blueprint-text)" strokeWidth="4"><rect height="24" rx="4" width="76" x={x - 38} y="211" /><rect height="24" rx="4" width="76" x={x - 38} y="244" /><rect height="24" rx="4" width="76" x={x - 38} y="277" />{[223, 256, 289].map((y) => <circle cx={x - 24} cy={y} fill="var(--success-color)" key={y} r="3.5" stroke="none" />)}</g>;
  return <g fill="none" stroke="var(--blueprint-text)" strokeWidth="4"><circle cx={x} cy="250" r="48" /><ellipse cx={x} cy="250" rx="22" ry="48" /><path d={`M${x - 45} 234h90M${x - 45} 266h90`} /></g>;
}

function BrightBlueprint({ progress }: { progress: Progress }) {
  const opacity = useTransform(progress, [0.48, 0.58, 0.68, 0.76], [0, 1, 1, 0]);
  const y = useTransform(progress, [0.48, 0.68], [40, 0]);

  return (
    <motion.div className="absolute inset-x-[4vw] top-[18vh] z-10 md:left-[31vw] md:right-[3vw] md:top-[22vh]" style={{ opacity, y }}>
      <svg aria-hidden="true" className="h-auto w-full" viewBox="0 0 1100 500">
        <line opacity=".25" stroke="var(--blueprint-line)" x1="40" x2="1060" y1="245" y2="245" />
        {blueprintParts.map((part, index) => <BlueprintPart index={index} key={part.label} part={part} progress={progress} />)}
      </svg>
    </motion.div>
  );
}

function BrightNetwork({ progress }: { progress: Progress }) {
  const opacity = useTransform(progress, [0.7, 0.78, 0.86, 0.9], [0, 1, 1, 0]);
  const scale = useTransform(progress, [0.7, 0.82], [0.82, 1]);
  const satellites = [
    [300, 62, "SOURCE", "var(--primary-color)"], [520, 180, "BUILD", "var(--secondary-color)"],
    [470, 430, "POLICY", "var(--accent-color)"], [135, 435, "RUNTIME", "var(--success-color)"],
    [72, 190, "EDGE", "var(--danger-color)"],
  ] as const;

  return (
    <motion.div className="absolute right-[4vw] top-1/2 z-10 aspect-square w-[min(64vw,650px)] -translate-y-1/2" style={{ opacity, scale }}>
      <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 600 600">
        <circle cx="300" cy="300" fill="none" opacity=".22" r="215" stroke="var(--blueprint-line)" strokeDasharray="4 9" />
        {satellites.map(([x, y, label, color]) => <g key={label}><line opacity=".55" stroke="var(--blueprint-line)" x1="300" x2={x} y1="300" y2={y} /><circle cx={x} cy={y} fill="var(--blueprint-bg)" r="45" stroke={color} strokeWidth="3" /><circle cx={x} cy={y} fill={color} r="6" /><text fill="var(--blueprint-text)" fontFamily="monospace" fontSize="10" textAnchor="middle" x={x} y={y + 68}>{label}</text></g>)}
        <circle cx="300" cy="300" fill="var(--blueprint-bg)" r="112" stroke="var(--blueprint-text)" strokeWidth="2" />
        <circle cx="300" cy="300" fill="none" r="86" stroke="var(--primary-color)" strokeDasharray="10 8" strokeWidth="4" />
        <text fill="var(--blueprint-text)" fontFamily="Georgia,serif" fontSize="28" textAnchor="middle" x="300" y="292">CloudCanvas</text>
        <text fill="var(--blueprint-line)" fontFamily="monospace" fontSize="9" textAnchor="middle" x="300" y="318">CONNECTED RELEASE GRAPH</text>
      </svg>
    </motion.div>
  );
}

function BrightLaunch({ progress }: { progress: Progress }) {
  const opacity = useTransform(progress, [0.87, 0.94], [0, 1]);
  const scale = useTransform(progress, [0.87, 0.96], [0.7, 1]);
  const rotate = useTransform(progress, [0.87, 1], [-30, 0]);

  return (
    <motion.div className="absolute right-[7vw] top-1/2 z-10 aspect-square w-[min(60vw,560px)] -translate-y-1/2" style={{ opacity, scale }}>
      <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 500 500">
        <motion.g style={{ rotate, transformOrigin: "250px 250px" }}>
          {[224, 192, 160].map((radius, index) => <circle key={radius} cx="250" cy="250" fill="none" r={radius} stroke={index === 1 ? "var(--primary-color)" : "var(--blueprint-line)"} strokeDasharray={index === 1 ? "28 12" : "3 10"} strokeWidth={index === 1 ? 4 : 2} />)}
        </motion.g>
        <circle cx="250" cy="250" fill="var(--blueprint-text)" r="116" />
        <path d="m198 250 34 34 73-82" fill="none" stroke="var(--success-color)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="14" />
        <text fill="var(--primary-text-color)" fontFamily="monospace" fontSize="10" textAnchor="middle" x="250" y="330">DEPLOYMENT READY</text>
      </svg>
    </motion.div>
  );
}

export default function DeploymentCore({ progress }: { progress: Progress }) {
  return <div className="pointer-events-none absolute inset-0"><DarkDial progress={progress} /><BrightBlueprint progress={progress} /><BrightNetwork progress={progress} /><BrightLaunch progress={progress} /></div>;
}