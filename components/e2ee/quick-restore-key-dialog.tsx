"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FileUp, ShieldAlert } from "lucide-react";
import { importRecoveryKit as restoreKey } from "@/lib/client/crypto-e2ee";
import { useToast } from "@/hooks/use-toast";

export function QuickRestoreKeyDialog() {
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = () => setOpen(true);
    window.addEventListener("orbit:restore-key", onOpen);
    return () => window.removeEventListener("orbit:restore-key", onOpen);
  }, []);

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    try {
      await restoreKey(file);
      toast({ title: "Privacy Key Restored", variant: "success" });
      setOpen(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("orbit:restore-key-success"));
      }
    } catch {
      toast({
        title: "Restore Failed",
        description: "Invalid Recovery Kit file.",
        variant: "destructive",
      });
    } finally {
      setRestoring(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="bg-neutral-950 border-white/10 rounded-3xl p-8 max-w-[400px]">
        <AlertDialogHeader className="items-center text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mb-2">
            <ShieldAlert className="h-8 w-8 text-rose-500" />
          </div>
          <AlertDialogTitle className="text-2xl font-serif text-white">
            Restore Privacy Key
          </AlertDialogTitle>
          <AlertDialogDescription className="text-white/60 text-sm leading-relaxed">
            Upload your Recovery Kit to unlock encrypted memories, letters, and media.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 mt-6">
          <input
            type="file"
            ref={inputRef}
            onChange={handleRestore}
            className="hidden"
            accept=".json"
          />
          <Button
            variant="rosy"
            className="w-full h-12 rounded-2xl gap-2 font-bold"
            onClick={() => inputRef.current?.click()}
            disabled={restoring}
          >
            <FileUp className="h-4 w-4" />
            {restoring ? "Restoring..." : "Upload Recovery Kit"}
          </Button>
          <Button
            variant="ghost"
            className="w-full h-11 rounded-2xl text-white/35 hover:text-white/60"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

