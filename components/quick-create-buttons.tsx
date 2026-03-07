"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PenLine, ImagePlus, FileLock2, Sparkles, Camera } from "lucide-react";
import { WriteLetterDialog } from "@/components/dialogs/write-letter-dialog";
import { AddMemoryDialog } from "@/components/dialogs/add-memory-dialog";
import { UploadPolaroidDialog } from "@/components/dialogs/upload-polaroid-dialog";
import { sendSpark } from "@/lib/client/notifications";
import { useToast } from "@/hooks/use-toast";
import { useOrbitStore } from "@/lib/store/global-store";

export function QuickCreateButtons() {
    const [isWritingLetter, setIsWritingLetter] = useState(false);
    const [isAddingMemory, setIsAddingMemory] = useState(false);
    const [isSnappingPolaroid, setIsSnappingPolaroid] = useState(false);
    const [isSendingSpark, setIsSendingSpark] = useState(false);
    const { toast } = useToast();
    const { profile, partnerProfile } = useOrbitStore();

    const handleSendSpark = async () => {
        setIsSendingSpark(true);
        const res = await sendSpark({
            actorId: profile?.id,
            partnerId: partnerProfile?.id,
            displayName: profile?.display_name
        });
        if (res.success) {
            toast({
                title: "Spark Sent! ✨",
                variant: "purple",
                context: "spark"
            });
        } else {
            toast({
                title: "Failed to send spark",
                variant: "destructive",
                context: "spark"
            });
        }
        setIsSendingSpark(false);
    };

    return (
        <>
            {/* Quick Create Buttons */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mt-4">
                <Button
                    variant="ghost"
                    className="fab-blur relative rounded-full w-12 h-12 md:w-auto md:h-11 p-0 md:px-5 gap-2 bg-neutral-950/90 md:bg-black/40 hover:bg-rose-500/20 [html[data-monochrome='true']_&]:bg-black/25 [html[data-monochrome='true']_&]:border-rose-500/20 border border-white/10 md:border-rose-500/20 shadow-xl transition-[transform,background-color,box-shadow,border-radius,width] duration-300 hover:scale-105 active:scale-95 group"
                    onClick={() => setIsWritingLetter(true)}
                >
                    <FileLock2 className="w-5 h-5 md:w-4 md:h-4 text-rose-100 drop-shadow-sm transition-colors" strokeWidth={2} />
                    <span className="hidden md:inline font-bold text-rose-50 text-sm tracking-tight">Send Whisper</span>
                </Button>

                <Button
                    variant="ghost"
                    className="fab-blur relative rounded-full w-12 h-12 md:w-auto md:h-11 p-0 md:px-5 gap-2 bg-neutral-950/90 md:bg-black/40 hover:bg-white/10 [html[data-monochrome='true']_&]:bg-black/25 [html[data-monochrome='true']_&]:border-white/20 border border-white/10 md:border-white/10 shadow-xl transition-[transform,background-color,box-shadow,border-radius,width] duration-300 hover:scale-105 active:scale-95 group"
                    onClick={() => setIsAddingMemory(true)}
                >
                    <ImagePlus className="w-5 h-5 md:w-4 md:h-4 text-white drop-shadow-sm transition-colors" strokeWidth={2} />
                    <span className="hidden md:inline font-bold text-white text-sm tracking-tight">Add Memory</span>
                </Button>

                <Button
                    variant="ghost"
                    className="fab-blur relative rounded-full w-12 h-12 md:w-auto md:h-11 p-0 md:px-5 gap-2 bg-neutral-950/90 md:bg-black/40 hover:bg-amber-500/20 [html[data-monochrome='true']_&]:bg-black/25 [html[data-monochrome='true']_&]:border-amber-500/20 border border-white/10 md:border-amber-500/20 shadow-xl transition-[transform,background-color,box-shadow,border-radius,width] duration-300 hover:scale-105 active:scale-95 group"
                    onClick={() => setIsSnappingPolaroid(true)}
                >
                    <Camera className="w-5 h-5 md:w-4 md:h-4 text-amber-100 drop-shadow-sm transition-colors" strokeWidth={2} />
                    <span className="hidden md:inline font-bold text-amber-50 text-sm tracking-tight">Snap Polaroid</span>
                </Button>

                <Button
                    variant="ghost"
                    className="fab-blur relative rounded-full w-12 h-12 md:w-auto md:h-11 p-0 md:px-5 gap-2 bg-neutral-950/90 md:bg-black/40 hover:bg-purple-500/20 [html[data-monochrome='true']_&]:bg-black/25 [html[data-monochrome='true']_&]:border-purple-500/20 border border-white/10 md:border-purple-500/20 shadow-xl transition-[transform,background-color,box-shadow,border-radius,width] duration-300 hover:scale-105 active:scale-95 group"
                    onClick={handleSendSpark}
                    disabled={isSendingSpark}
                >
                    <Sparkles className={`w-5 h-5 md:w-4 md:h-4 text-purple-200 drop-shadow-sm transition-transform ${isSendingSpark ? 'animate-spin' : ''}`} strokeWidth={2} />
                    <span className="hidden md:inline font-bold text-purple-50 text-sm tracking-tight">
                        {isSendingSpark ? 'Sending...' : 'Send Spark'}
                    </span>
                </Button>
            </div>

            {/* Dialogs */}
            <WriteLetterDialog
                open={isWritingLetter}
                onOpenChange={setIsWritingLetter}
                defaultWhisper={true}
            />
            <AddMemoryDialog open={isAddingMemory} onOpenChange={setIsAddingMemory} />
            <UploadPolaroidDialog open={isSnappingPolaroid} onOpenChange={setIsSnappingPolaroid} />
        </>
    );
}
