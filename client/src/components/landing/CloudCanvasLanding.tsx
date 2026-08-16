"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowUpRight, Box, Check, Copy, GitBranch, LockKeyhole, Server } from "lucide-react";
import { motion, useMotionValueEvent, useSpring, useTransform, type MotionValue } from "motion/react";
import { useScroll } from "motion/react";
import DeploymentCore from "./DeploymentCore";

type Progress = MotionValue<number>;

const chapters = [
  {
    range: [0.05, 0.12, 0.2],
    marker: "01 / INGEST",
    title: "Raw intent, given form.",
    copy: "Connect a repository. CloudCanvas reads the runtime, maps its dependencies, and turns deployment intent into one living object.",
  },
  {
    range: [0.22, 0.3, 0.38],
    marker: "02 / RESOLVE",
    title: "Every dependency stays visible.",
    copy: "Source, image, region, policy, and health checks move as one system. Scroll through the mechanism to inspect the release path.",
  },
  {
    range: [0.39, 0.46, 0.53],
    marker: "03 / VALIDATE",
    title: "Every gate proves itself.",
    copy: "Permissions, health checks, dependencies, and rollback paths resolve before release.",
  },
  {
    range: [0.55, 0.63, 0.71],
    marker: "04 / OPEN",
    title: "The generated plan opens up.",
    copy: "Inspect source, build, policy, runtime, and edge resources as one readable mechanism.",
    light: true,
  },
  {
    range: [0.72, 0.8, 0.87],
    marker: "05 / CONNECT",
    title: "Every resource keeps its context.",
    copy: "The live topology preserves the relationship between intent, policy, and running infrastructure.",
    light: true,
  },
  {
    range: [0.88, 0.95, 1],
    marker: "06 / RELEASE",
    title: "Ready when the graph is ready.",
    copy: "One validated deployment, with the plan and proof attached.",
    light: true,
  },
] as const;

const phaseLabels = ["Topology", "Build", "Validate", "Blueprint", "Graph", "Release"];


function Chapter({ chapter, progress }: { chapter: (typeof chapters)[number]; progress: Progress }) {
  const [start, peak, end] = chapter.range;
  const hold = peak + (end - peak) * 0.62;
  const opacity = useTransform(progress, [start, peak, hold, end], [0, 1, 1, 0]);
  const y = useTransform(progress, [start, peak, hold, end], [28, 0, 0, -24]);
  const light = "light" in chapter && chapter.light;

  return (
    <motion.section className={`pointer-events-none absolute left-5 z-20 max-w-136 sm:left-10 lg:left-[7vw] ${light ? "bottom-[9vh] md:bottom-auto md:top-[22vh] md:max-w-92" : "bottom-[10vh]"}`} style={{ opacity, y }}>
      <p className={`font-mono text-[11px] uppercase ${light ? "text-(--blueprint-line)" : "text-(--secondary-color)"}`}>{chapter.marker}</p>
      <h1 className={`mt-4 max-w-lg font-(family-name:--font-display) text-4xl leading-[0.96] sm:text-6xl lg:text-7xl ${light ? "text-(--blueprint-text)" : "text-(--primary-text-color)"}`}>
        {chapter.title}
      </h1>
      <p className={`mt-5 max-w-md text-sm leading-6 sm:text-base ${light ? "text-(--blueprint-line)" : "text-(--secondary-text-color)"}`}>{chapter.copy}</p>
    </motion.section>
  );
}

function OpeningFrame({ progress }: { progress: Progress }) {
  const opacity = useTransform(progress, [0, 0.025, 0.14], [1, 1, 0]);
  const y = useTransform(progress, [0, 0.14], [0, -24]);

  return (
    <motion.section className="pointer-events-none absolute inset-x-5 bottom-[8vh] z-20 sm:inset-x-10 lg:inset-x-[6vw]" style={{ opacity, y }}>
      <div className="flex items-end justify-between gap-8">
        <div className="max-w-176">
          <div className="mb-5 flex items-center gap-3 font-mono text-[10px] uppercase text-(--secondary-color)">
            <span className="h-px w-10 bg-current" /> Cloud deployment engine / 001
          </div>
          <h1 className="font-(family-name:--font-display) text-5xl leading-[0.88] text-(--primary-text-color) sm:text-7xl lg:text-[6.4rem]">
            Infrastructure,<br /><span className="italic text-(--secondary-text-color)">made visible.</span>
          </h1>
        </div>
        <div className="hidden w-52 border-t border-(--border-color) pt-4 font-mono text-[10px] leading-5 text-(--muted-text-color) lg:block">
          <p>CORE CC-01</p><p>STATE / LISTENING</p><p>SCROLL TO INITIALIZE</p>
        </div>
      </div>
    </motion.section>
  );
}

function SideTelemetry({ progress }: { progress: Progress }) {
  const opacity = useTransform(progress, [0.12, 0.22, 0.39, 0.48], [0, 1, 1, 0]);
  const rows = [[GitBranch, "SOURCE", "github/main"], [Box, "IMAGE", "cc-api:8fd23"], [LockKeyhole, "POLICY", "verified"], [Server, "REGION", "ap-south-1"]] as const;

  return (
    <motion.aside className="absolute bottom-14 right-5 z-20 hidden w-72 rounded-md border border-(--border-color) bg-[color-mix(in_srgb,var(--surface-color)_88%,transparent)] p-4 font-mono text-[10px] shadow-2xl backdrop-blur md:block lg:right-[6vw]" style={{ opacity }}>
      <div className="mb-4 flex items-center justify-between text-(--muted-text-color)"><span>RELEASE GRAPH</span><Copy className="h-3.5 w-3.5" /></div>
      <div className="space-y-3">
        {rows.map(([Icon, label, value]) => <div className="grid grid-cols-[16px_54px_1fr] items-center gap-2" key={label}><Icon className="h-3.5 w-3.5 text-(--primary-color)" /><span className="text-(--muted-text-color)">{label}</span><span>{value}</span></div>)}
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-(--border-color) pt-3 text-(--success-color)"><Check className="h-3.5 w-3.5" /> ALL GATES PASSED</div>
    </motion.aside>
  );
}

function PhaseRail({ progress }: { progress: Progress }) {
  const [active, setActive] = useState(0);

  useMotionValueEvent(progress, "change", (value) => {
    const next = Math.min(phaseLabels.length - 1, Math.round(value * (phaseLabels.length - 1)));
    setActive((current) => current === next ? current : next);
  });

  const jumpTo = (index: number) => {
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ behavior: "smooth", top: distance * (index / (phaseLabels.length - 1)) });
  };

  return (
    <nav aria-label="Landing page phases" className="absolute bottom-5 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-1 rounded-md border border-white/10 bg-[color-mix(in_srgb,var(--surface-color)_92%,transparent)] p-1 shadow-xl backdrop-blur md:flex">
      {phaseLabels.map((label, index) => (
        <button aria-current={active === index ? "step" : undefined} aria-label={`Jump to ${label} phase`} className={`h-8 px-3 font-mono text-[9px] uppercase transition-colors ${active === index ? "bg-(--primary-color) text-(--primary-bg-color)" : "text-(--secondary-text-color) hover:bg-white/5 hover:text-(--primary-text-color)"}`} key={label} onClick={() => jumpTo(index)} type="button">
          {label}
        </button>
      ))}
    </nav>
  );
}

export default function CloudCanvasLanding() {
  const { scrollYProgress } = useScroll();
  const { data: session } = useSession();
  const progress = useSpring(scrollYProgress, { stiffness: 75, damping: 25, restDelta: 0.001 });
  const darkOpacity = useTransform(progress, [0.46, 0.58], [1, 0]);
  const lightOpacity = useTransform(progress, [0.46, 0.58], [0, 1]);
  const headerColor = useTransform(progress, [0.48, 0.6], ["var(--primary-text-color)", "var(--blueprint-text)"]);
  const openCanvasHref = session ? "/dashboard" : "/auth/signup";

  return (
    <main className="relative h-[2400vh] overflow-clip bg-(--primary-bg-color)">
      <div className="sticky top-0 h-screen overflow-hidden">
        <motion.div className="absolute inset-0 bg-(--primary-bg-color)" style={{ opacity: darkOpacity }} />
        <motion.div className="absolute inset-0 bg-(--blueprint-bg) bg-[linear-gradient(var(--blueprint-grid)_1px,transparent_1px),linear-gradient(90deg,var(--blueprint-grid)_1px,transparent_1px)] bg-size-[32px_32px]" style={{ opacity: lightOpacity }} />

        <DeploymentCore progress={progress} />

        <OpeningFrame progress={progress} />
        {chapters.map((chapter) => <Chapter chapter={chapter} key={chapter.marker} progress={progress} />)}
        <SideTelemetry progress={progress} />
        <PhaseRail progress={progress} />

        <motion.header className="absolute inset-x-0 top-0 z-30 flex h-20 items-center justify-between px-5 sm:px-10 lg:px-[6vw]" style={{ color: headerColor }}>
          <Link className="flex items-center gap-3" href="/">
            <span className="relative h-11 w-11"><Image alt="CloudCanvas" className="object-contain" fill priority sizes="44px" src="/logo.png" /></span>
            <span className="font-(family-name:--font-display) text-xl">CloudCanvas</span>
          </Link>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] md:block">Infrastructure / In motion</span>
          <Link className="inline-flex h-10 items-center gap-2 border-b border-current text-sm" href={openCanvasHref}>Open canvas <ArrowUpRight className="h-4 w-4" /></Link>
        </motion.header>

        <div className="absolute bottom-0 left-0 top-0 z-30 w-px bg-(--primary-color) opacity-40" />
        <div className="absolute bottom-8 right-6 z-30 flex items-center gap-3 font-mono text-[9px] uppercase text-(--muted-text-color) [writing-mode:vertical-rl]">
          <span>Scroll to inspect</span><span className="h-12 w-px bg-current" />
        </div>
        <motion.div className="absolute bottom-0 left-0 z-30 h-1 origin-left bg-(--secondary-color)" style={{ scaleX: scrollYProgress, width: "100%" }} />
      </div>
    </main>
  );
}