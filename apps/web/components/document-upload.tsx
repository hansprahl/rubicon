"use client";

import { useCallback, useState } from "react";
import { Upload, FileText, CheckCircle, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentUploadProps {
  label: string;
  description: string;
  accept: string;
  onFileSelect: (file: File) => void;
  uploading?: boolean;
  progress?: number;
  uploaded?: boolean;
  fileName?: string;
  onClear?: () => void;
}

export function DocumentUpload({
  label,
  description,
  accept,
  onFileSelect,
  uploading = false,
  progress = 0,
  uploaded = false,
  fileName,
  onClear,
}: DocumentUploadProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  if (uploaded && fileName) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-900 dark:bg-green-950">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{fileName}</p>
            </div>
          </div>
          {onClear && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (uploading) {
    return (
      <div className="rounded-lg border p-6">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 animate-pulse text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">{label}</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Uploading... {progress}%
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        dragOver
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-muted-foreground/50"
      }`}
    >
      <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <label className="mt-4 inline-block">
        <input
          type="file"
          accept={accept}
          onChange={handleFileInput}
          className="hidden"
        />
        <span className="inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Choose File
        </span>
      </label>
    </div>
  );
}
