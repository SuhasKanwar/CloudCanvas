type Props = { className?: string };

export default function Skeleton({ className = "" }: Props) {
    return <div aria-hidden="true" className={`animate-pulse rounded-md bg-white/8 ${className}`} />;
}
