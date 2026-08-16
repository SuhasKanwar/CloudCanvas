"use client";

import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  BrainCircuit,
  Cloud,
  Container,
  Gauge,
  GitBranch,
  LockKeyhole,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Terminal,
  Workflow,
} from "lucide-react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";

const navItems = ["Canvas", "Automation", "Security", "Launch"];

const stats = [
  { value: "04", label: "deployment inputs" },
  { value: "12x", label: "faster planning" },
  { value: "99%", label: "repeatable topology" },
];

const cloudNodes = [
  { label: "GitHub", icon: GitBranch, x: "12%", y: "24%", tone: "primary" },
  { label: "Docker", icon: Container, x: "64%", y: "18%", tone: "secondary" },
  { label: "AWS", icon: Cloud, x: "38%", y: "42%", tone: "accent" },
  { label: "AI Ops", icon: BrainCircuit, x: "16%", y: "68%", tone: "success" },
  { label: "Deploy", icon: PlayCircle, x: "72%", y: "66%", tone: "primary" },
];

const capabilities = [
  {
    title: "Visual infrastructure graph",
    description:
      "Compose services, repositories, images, regions, secrets, and dependencies on one inspectable deployment surface.",
    icon: Workflow,
  },
  {
    title: "AI-assisted architecture",
    description:
      "Turn rough product intent into deployment plans with guardrails for scale, cost, security, and failure recovery.",
    icon: Sparkles,
  },
  {
    title: "Production command center",
    description:
      "Move from design to execution with environment checks, generated configuration, and traceable deployment steps.",
    icon: Terminal,
  },
];

const workflow = [
  {
    step: "01",
    title: "Drop",
    body: "Place AWS services, Docker images, and repos directly onto the canvas.",
  },
  {
    step: "02",
    title: "Connect",
    body: "Map traffic, dependencies, secrets, scaling policies, and deployment order.",
  },
  {
    step: "03",
    title: "Harden",
    body: "Review AI-suggested changes for IAM, networking, observability, and rollback.",
  },
  {
    step: "04",
    title: "Ship",
    body: "Deploy through generated SDK operations with a clear run history.",
  },
];

const principles = [
  { label: "Least-privilege paths", icon: LockKeyhole },
  { label: "Preflighted releases", icon: ShieldCheck },
  { label: "Observable runtime", icon: Gauge },
  { label: "Composable modules", icon: Boxes },
];

const toneMap: Record<string, string> = {
  primary: "var(--primary-color)",
  secondary: "var(--secondary-color)",
  accent: "var(--accent-color)",
  success: "var(--success-color)",
};

function CloudObject() {
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, { stiffness: 80, damping: 24 });
  const rotateY = useTransform(smoothProgress, [0, 1], [-18, 28]);
  const rotateX = useTransform(smoothProgress, [0, 1], [12, -10]);
  const y = useTransform(smoothProgress, [0, 1], [0, -80]);
  const scale = useTransform(smoothProgress, [0, 0.55, 1], [0.96, 1.08, 0.92]);
  const orbY = useTransform(smoothProgress, [0, 1], ["0%", "34%"]);

  return (
    <div className="cloud-object-shell sticky top-22 mx-auto flex h-[520px] max-h-[76vh] w-full max-w-[620px] items-center justify-center">
      <motion.div
        className="cloud-object-core relative aspect-square w-[min(86vw,520px)]"
        style={{ rotateX, rotateY, y, scale }}
      >
        <motion.div
          className="absolute left-1/2 top-0 h-16 w-16 -translate-x-1/2 rounded-full border border-[color:var(--border-color)] bg-[color:var(--surface-strong-color)]"
          style={{
            y: orbY,
            boxShadow: "0 0 54px var(--glow-color), inset 0 1px 0 rgba(255,255,255,.12)",
          }}
        />
        <div className="canvas-plane absolute inset-[8%] rounded-[28px] p-8">
          <div className="absolute inset-6 rounded-[22px] border border-dashed border-[color:var(--border-color)]" />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
            {[
              "M22 30 C35 18 48 30 49 43",
              "M68 24 C62 35 55 39 49 43",
              "M49 43 C38 49 26 58 22 72",
              "M49 43 C59 52 66 58 77 70",
            ].map((path) => (
              <path
                className="object-connection"
                d={path}
                fill="none"
                key={path}
                stroke="var(--primary-color)"
                strokeLinecap="round"
                strokeWidth="0.55"
              />
            ))}
          </svg>
          {cloudNodes.map(({ label, icon: IconComponent, x, y: nodeY, tone }) => (
            <motion.div
              className="object-node absolute flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-2xl border border-[color:var(--border-color)] bg-[color:color-mix(in_srgb,var(--surface-strong-color)_88%,transparent)] text-xs font-medium text-[color:var(--primary-text-color)]"
              key={label}
              style={{ left: x, top: nodeY, color: toneMap[tone] }}
              whileHover={{ y: -6, scale: 1.04 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <IconComponent className="h-6 w-6" />
              <span className="text-[color:var(--primary-text-color)]">{label}</span>
            </motion.div>
          ))}
          <div className="absolute bottom-8 left-8 right-8 grid grid-cols-3 gap-2">
            {["Plan", "Validate", "Deploy"].map((label) => (
              <div
                className="rounded-full border border-[color:var(--border-color)] bg-[color:var(--surface-color)] px-3 py-2 text-center text-[11px] uppercase tracking-[0.18em] text-[color:var(--secondary-text-color)]"
                key={label}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SectionHeading({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--primary-color)]">
        {kicker}
      </p>
      <h2 className="text-3xl font-semibold text-[color:var(--primary-text-color)] sm:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-base leading-8 text-[color:var(--secondary-text-color)] sm:text-lg">
        {body}
      </p>
    </div>
  );
}

export default function CloudCanvasLanding() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[color:var(--primary-bg-color)] text-[color:var(--primary-text-color)]">
      <div className="landing-grid pointer-events-none absolute inset-0" />
      <header className="fixed left-0 right-0 top-0 z-30 border-b border-[color:color-mix(in_srgb,var(--border-color)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--primary-bg-color)_82%,transparent)] backdrop-blur-xl">
        <nav className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link className="flex items-center gap-3" href="/">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--primary-color)] text-[color:var(--primary-bg-color)]">
              <Cloud className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold">CloudCanvas</span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-[color:var(--secondary-text-color)] md:flex">
            {navItems.map((item) => (
              <a className="transition hover:text-[color:var(--primary-text-color)]" href={`#${item.toLowerCase()}`} key={item}>
                {item}
              </a>
            ))}
          </div>
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[color:var(--border-color)] px-4 text-sm font-medium transition hover:border-[color:var(--primary-color)]"
            href="/auth/signin"
          >
            Sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid min-h-screen max-w-7xl grid-cols-1 gap-10 px-5 pb-24 pt-32 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:pt-40">
        <div className="flex flex-col justify-center">
          <p className="mb-6 w-fit rounded-full border border-[color:var(--border-color)] bg-[color:var(--surface-color)] px-4 py-2 text-sm text-[color:var(--secondary-text-color)]">
            Visual AWS deployment workspace
          </p>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] text-[color:var(--primary-text-color)] sm:text-7xl">
            CloudCanvas
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-[color:var(--secondary-text-color)]">
            Design cloud systems like a living map: connect repositories, Docker images,
            AWS services, and AI guidance into one scrollable deployment canvas.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[color:var(--primary-color)] px-6 text-sm font-semibold text-[color:var(--primary-bg-color)] transition hover:brightness-110"
              href="/auth/signup"
            >
              Start building
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[color:var(--border-color)] px-6 text-sm font-semibold transition hover:border-[color:var(--secondary-color)]"
              href="#canvas"
            >
              Watch the flow
              <PlayCircle className="h-4 w-4" />
            </a>
          </div>
          <div className="mt-12 grid max-w-xl grid-cols-3 gap-3">
            {stats.map(({ value, label }) => (
              <div className="border-l border-[color:var(--border-color)] pl-4" key={label}>
                <p className="text-2xl font-semibold text-[color:var(--primary-text-color)]">{value}</p>
                <p className="mt-1 text-sm text-[color:var(--secondary-text-color)]">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <CloudObject />
      </section>

      <section className="relative border-y border-[color:var(--border-color)] bg-[color:color-mix(in_srgb,var(--surface-color)_62%,transparent)]" id="canvas">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-28 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading
            body="The interface treats infrastructure as a visual model first and an executable plan second, so non-linear systems stay readable while deployment details remain close."
            kicker="Canvas"
            title="A long-form build surface for complex infrastructure."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {capabilities.map(({ title, description, icon: IconComponent }) => (
              <article
                className="rounded-lg border border-[color:var(--border-color)] bg-[color:var(--surface-muted-color)] p-6"
                key={title}
              >
                <IconComponent className="mb-8 h-7 w-7 text-[color:var(--primary-color)]" />
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="mt-4 text-sm leading-6 text-[color:var(--secondary-text-color)]">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 py-28 sm:px-8" id="automation">
        <SectionHeading
          body="Every stage is represented as explicit data: source, runtime, cloud resource, policy, validation, and deployment event."
          kicker="Automation"
          title="From rough architecture to repeatable release."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-4">
          {workflow.map(({ step, title, body }) => (
            <article className="border-t border-[color:var(--border-color)] pt-6" key={step}>
              <p className="text-sm font-semibold text-[color:var(--secondary-color)]">{step}</p>
              <h3 className="mt-5 text-2xl font-semibold">{title}</h3>
              <p className="mt-4 text-sm leading-6 text-[color:var(--secondary-text-color)]">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="relative bg-[color:var(--surface-color)]" id="security">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-28 sm:px-8 lg:grid-cols-2">
          <SectionHeading
            body="CloudCanvas keeps guardrails visible at the same level as architecture decisions, making every deployment easier to inspect before it runs."
            kicker="Security"
            title="Guardrails live on the canvas, not in a forgotten checklist."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {principles.map(({ label, icon: IconComponent }) => (
              <div
                className="flex min-h-28 items-center gap-4 rounded-lg border border-[color:var(--border-color)] bg-[color:var(--primary-bg-color)] p-5"
                key={label}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-strong-color)] text-[color:var(--primary-color)]">
                  <IconComponent className="h-5 w-5" />
                </span>
                <span className="font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 py-28 sm:px-8" id="launch">
        <div className="grid items-end gap-10 border-t border-[color:var(--border-color)] pt-14 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[color:var(--primary-color)]">
              Launch
            </p>
            <h2 className="max-w-3xl text-4xl font-semibold sm:text-6xl">
              Build the cloud system before the cloud system builds you.
            </h2>
          </div>
          <Link
            className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[color:var(--secondary-color)] px-7 text-sm font-semibold text-[color:var(--primary-bg-color)] transition hover:brightness-110"
            href="/auth/signup"
          >
            Create account
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
