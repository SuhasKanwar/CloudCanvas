import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";
import StatusScreen from "@/components/ui/StatusScreen";

export default function NotFoundPage() {
    return (
        <StatusScreen
            action={(
                <Link className="inline-flex items-center gap-2 rounded-2xl bg-(--primary-color) px-4 py-3 text-sm font-medium text-(--primary-bg-color)" href="/">
                    Back to home
                    <ArrowRight className="h-4 w-4" />
                </Link>
            )}
            description="The page you requested does not exist."
            eyebrow="Not found"
            title="This route is off the map."
        >
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-(--secondary-text-color)">
                <SearchX className="h-4 w-4 text-(--warning-color)" />
                Double-check the URL or return to the landing page.
            </div>
        </StatusScreen>
    );
}
