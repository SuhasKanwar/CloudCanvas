"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, File, Folder, FolderPlus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useSession } from "next-auth/react";
import { createBucketFolder, deleteBucketObject, listBucketObjects, uploadBucketFile, type BucketListing } from "@/lib/sketches";
import { pushToast } from "@/lib/toast";
import ConfirmModal from "@/components/ui/ConfirmModal";

const button = "inline-flex h-9 items-center gap-2 border border-white/12 px-3 text-xs text-(--primary-text-color) transition hover:bg-white/8 disabled:opacity-50";
const empty: BucketListing = { folders: [], files: [], nextToken: null };

export default function BucketObjectsPanel({ sketchId, resourceId }: { sketchId: string; resourceId: string }) {
    const { data: session } = useSession();
    const token = session?.accessToken;
    const [prefix, setPrefix] = useState("");
    const [listing, setListing] = useState<BucketListing>(empty);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [uploaded, setUploaded] = useState(0);
    const [total, setTotal] = useState(0);
    const [folderName, setFolderName] = useState("");
    const [deleting, setDeleting] = useState<{ key: string; folder: boolean } | null>(null);
    const requestId = useRef(0);

    const load = useCallback(async (nextToken?: string) => {
        if (!token) return;
        const id = ++requestId.current;
        setLoading(true);
        if (!nextToken) setListing(empty);
        try {
            const page = await listBucketObjects(token, sketchId, resourceId, prefix, nextToken);
            if (id === requestId.current) setListing((current) => nextToken ? { folders: [...current.folders, ...page.folders], files: [...current.files, ...page.files], nextToken: page.nextToken } : page);
        } catch (error) { if (id === requestId.current) pushToast({ message: error instanceof Error ? error.message : "Could not load bucket.", variant: "error" }); }
        finally { if (id === requestId.current) setLoading(false); }
    }, [token, sketchId, resourceId, prefix]);

    useEffect(() => {
        const requests = requestId;
        let active = true;
        queueMicrotask(() => { if (active) void load(); });
        return () => { active = false; requests.current++; };
    }, [load]);

    const createFolder = async () => {
        if (!token || !folderName.trim() || folderName.includes("/")) return;
        setBusy(true);
        try { await createBucketFolder(token, sketchId, resourceId, `${prefix}${folderName.trim()}/`); setFolderName(""); await load(); }
        catch { /* API interceptor shows the error. */ }
        finally { setBusy(false); }
    };
    const upload = async (files: FileList | null, directory: boolean) => {
        if (!token || !files?.length) return;
        setBusy(true); setTotal(files.length); setUploaded(0);
        try {
            for (const file of Array.from(files)) {
                const key = `${prefix}${directory ? file.webkitRelativePath || file.name : file.name}`;
                await uploadBucketFile(token, sketchId, resourceId, key, file);
                setUploaded((count) => count + 1);
            }
            pushToast({ message: `${files.length} file${files.length === 1 ? "" : "s"} uploaded.`, variant: "success" });
            await load();
        } catch (error) { pushToast({ message: error instanceof Error ? error.message : "Upload failed.", variant: "error" }); await load(); }
        finally { setBusy(false); setTotal(0); }
    };
    const remove = async () => {
        if (!token || !deleting) return;
        setBusy(true);
        try { await deleteBucketObject(token, sketchId, resourceId, deleting.key, deleting.folder); setDeleting(null); await load(); }
        catch { /* API interceptor shows the error. */ }
        finally { setBusy(false); }
    };
    const crumbs = prefix.split("/").filter(Boolean);

    return <section className="space-y-3 border-t border-white/10 pt-5">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium text-(--primary-text-color)">Bucket files</h3><button aria-label="Refresh bucket files" className={button} disabled={loading || busy} onClick={() => void load()} title="Refresh bucket files" type="button"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div>
        <nav aria-label="Bucket path" className="flex flex-wrap items-center gap-1 text-xs"><button className="text-(--secondary-color) hover:underline" onClick={() => setPrefix("")} type="button">Root</button>{crumbs.map((crumb, index) => <span className="inline-flex items-center gap-1" key={`${crumb}-${index}`}><ChevronRight className="h-3 w-3 text-(--muted-text-color)" /><button className="text-(--secondary-color) hover:underline" onClick={() => setPrefix(`${crumbs.slice(0, index + 1).join("/")}/`)} type="button">{crumb}</button></span>)}</nav>
        <div className="flex flex-wrap gap-2"><label className={`${button} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}><Upload className="h-4 w-4" />Upload files<input className="sr-only" disabled={busy} multiple onChange={(event) => { void upload(event.target.files, false); event.target.value = ""; }} type="file" /></label><label className={`${button} cursor-pointer ${busy ? "pointer-events-none opacity-50" : ""}`}><Folder className="h-4 w-4" />Upload folder<input {...{ webkitdirectory: "" }} className="sr-only" disabled={busy} onChange={(event) => { void upload(event.target.files, true); event.target.value = ""; }} type="file" /></label></div>
        {total ? <p className="text-xs text-(--secondary-text-color)" role="status">Uploading {uploaded} of {total} files</p> : null}
        <div className="flex gap-2"><input aria-label="New folder name" className="min-w-0 flex-1 border border-white/12 bg-black/20 px-3 text-sm outline-none focus:border-(--primary-color)" onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createFolder(); }} placeholder="New folder" value={folderName} /><button className={button} disabled={busy || !folderName.trim() || folderName.includes("/")} onClick={() => void createFolder()} title="Create folder" type="button"><FolderPlus className="h-4 w-4" /></button></div>
        <div className="max-h-72 overflow-y-auto border border-white/10 bg-black/15 text-xs">{!loading && !listing.folders.length && !listing.files.length ? <p className="p-4 text-(--secondary-text-color)">This folder is empty.</p> : null}
            {listing.folders.map((key) => <div className="flex min-h-10 items-center gap-2 border-b border-white/8 px-3" key={key}><button className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-(--secondary-color)" onClick={() => setPrefix(key)} type="button"><Folder className="h-4 w-4 shrink-0" /><span className="truncate">{key.slice(prefix.length, -1)}</span></button><button aria-label={`Delete folder ${key}`} className="p-2 text-(--secondary-text-color) hover:text-(--danger-color)" onClick={() => setDeleting({ key, folder: true })} title="Delete folder" type="button"><Trash2 className="h-4 w-4" /></button></div>)}
            {listing.files.map((item) => <div className="flex min-h-10 items-center gap-2 border-b border-white/8 px-3" key={item.key}><File className="h-4 w-4 shrink-0 text-(--secondary-text-color)" /><span className="min-w-0 flex-1 truncate" title={item.key}>{item.key.slice(prefix.length)}</span><span className="text-(--secondary-text-color)">{Math.ceil(item.size / 1024)} KB</span><button aria-label={`Delete file ${item.key}`} className="p-2 text-(--secondary-text-color) hover:text-(--danger-color)" onClick={() => setDeleting({ key: item.key, folder: false })} title="Delete file" type="button"><Trash2 className="h-4 w-4" /></button></div>)}
        </div>
        {listing.nextToken ? <button className={button} disabled={loading} onClick={() => void load(listing.nextToken!)} type="button">Load more</button> : null}
        <ConfirmModal confirmLabel={deleting?.folder ? "Delete folder" : "Delete file"} confirming={busy} description={deleting?.folder ? "Delete this folder and all files inside it?" : "Permanently delete this file from the bucket?"} onClose={() => setDeleting(null)} onConfirm={() => void remove()} open={Boolean(deleting)} title={deleting?.folder ? "Delete folder?" : "Delete file?"} variant="danger" />
    </section>;
}
