import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

interface UploadProgressModalProps {
  open: boolean;
  progress: number;
  statusText?: string;
}

export default function UploadProgressModal({ open, progress, statusText }: UploadProgressModalProps) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <Dialog open={open}>
      <DialogContent className="[&>button]:hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Video upload in progress</DialogTitle>
          <DialogDescription>
            {statusText ?? "Please wait while your video is being uploaded."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Progress value={safeProgress} className="h-3" />
          <p className="text-right text-sm font-medium text-muted-foreground">{safeProgress}%</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
