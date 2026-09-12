"use client";

type Props = { config: Record<string, unknown>; deployed: boolean; update: (key: string, value: unknown) => void };
const control = "mt-2 w-full border border-white/15 bg-(--surface-color) px-3 py-2.5 text-sm text-(--primary-text-color) focus-visible:outline-2 focus-visible:outline-(--primary-color) disabled:opacity-50";

export default function CloudFrontForm({ config, deployed, update }: Props) {
    const bound = String(config.bucketName ?? "").startsWith("${");
    return <div className="space-y-5">
        <label className="block text-xs text-(--secondary-text-color)">S3 origin bucket
            <input className={control} disabled={deployed || bound} value={String(config.bucketName ?? "")} placeholder="frontend-assets" onChange={(event) => update("bucketName", event.target.value)} />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-xs text-(--secondary-text-color)">Origin path
                <input className={control} value={String(config.originPath ?? "")} placeholder="/dist" onChange={(event) => update("originPath", event.target.value)} />
            </label>
            <label className="block text-xs text-(--secondary-text-color)">Default document
                <input className={control} value={String(config.defaultRootObject ?? "index.html")} onChange={(event) => update("defaultRootObject", event.target.value)} />
            </label>
        </div>
        <label className="block text-xs text-(--secondary-text-color)">Description
            <input className={control} maxLength={128} value={String(config.comment ?? "")} onChange={(event) => update("comment", event.target.value)} />
        </label>
        <label className="block text-xs text-(--secondary-text-color)">Edge locations
            <select className={control} value={String(config.priceClass ?? "PriceClass_All")} onChange={(event) => update("priceClass", event.target.value)}>
                <option value="PriceClass_All">All locations</option><option value="PriceClass_200">Price class 200</option><option value="PriceClass_100">Price class 100</option>
            </select>
        </label>
        <label className="block text-xs text-(--secondary-text-color)">Caching
            <select className={control} value={String(config.cacheMode ?? "disabled")} onChange={(event) => update("cacheMode", event.target.value)}>
                <option value="disabled">Disabled</option><option value="optimized">Optimized (minimum cache duration: 1 second)</option>
            </select>
        </label>
        <label className="flex items-center justify-between gap-3 border border-white/10 p-3 text-sm text-(--secondary-text-color)">SPA fallback to default document (403 / 404)
            <input type="checkbox" checked={config.spaFallback === true} onChange={(event) => update("spaFallback", event.target.checked)} />
        </label>
        <label className="flex items-center justify-between gap-3 border border-white/10 p-3 text-sm text-(--secondary-text-color)">Distribution enabled
            <input type="checkbox" checked={config.enabled !== false} onChange={(event) => update("enabled", event.target.checked)} />
        </label>
    </div>;
}
