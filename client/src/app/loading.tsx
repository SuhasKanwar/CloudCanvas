import StatusScreen from "@/components/ui/StatusScreen";

export default function LoadingPage() {
    return (
        <StatusScreen
            description="CloudCanvas is loading the current view."
            eyebrow="Loading"
            title="Preparing the canvas."
        >
            <div className="flex items-center gap-3 text-sm text-(--secondary-text-color)">
                <span className="h-3 w-3 animate-pulse rounded-full bg-(--primary-color)" />
                Syncing session and layout state.
            </div>
        </StatusScreen>
    );
}
