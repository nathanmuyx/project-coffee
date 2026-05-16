"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const EXISTING_IMAGES = [
  "/drinks/oat-latte.png",
  "/drinks/caramel-latte.png",
  "/drinks/spanish-oat-latte.png",
  "/drinks/americano.png",
  "/drinks/honey-citrus.png",
  "/drinks/honey-citrus-coffee.png",
  "/drinks/caramel-nc.png",
  "/drinks/matcha-latte.png",
  "/drinks/dirty-matcha.png",
  "/drinks/matcha-spanish.png",
];

const BUCKET = "menu-images";

interface ImagePickerModalProps {
  currentUrl: string | null;
  onPick: (url: string | null) => void;
  onClose: () => void;
}

export function ImagePickerModal({ currentUrl, onPick, onClose }: ImagePickerModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const filename = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filename, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
      onPick(data.publicUrl);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-700 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <h3 className="text-base font-extrabold text-white">Choose image</h3>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg text-xs font-bold text-slate-400 border border-slate-600 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {EXISTING_IMAGES.map((url) => {
              const selected = url === currentUrl;
              return (
                <button
                  key={url}
                  onClick={() => {
                    onPick(url);
                    onClose();
                  }}
                  className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-colors ${
                    selected ? "border-emerald-400" : "border-slate-700 hover:border-slate-500"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </button>
              );
            })}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full py-3 rounded-xl bg-blue-500/20 text-blue-400 font-bold text-sm hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
          >
            {uploading ? "Uploading…" : "Upload new image"}
          </button>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
              {error}
            </div>
          )}

          {currentUrl && (
            <button
              onClick={() => {
                onPick(null);
                onClose();
              }}
              className="w-full py-2 rounded-xl text-sm font-bold text-red-400 border border-red-400/30 hover:bg-red-500/15 transition-colors"
            >
              Remove image
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
