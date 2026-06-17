import {forwardRef, useCallback, useImperativeHandle, useRef, useState} from "react";
import {ImageUp} from "lucide-react";
import {pickImageFile} from "../../utils/upload.ts";
import Button, {type ButtonVariant} from "../ui/Button.tsx";
import IconButton from "../ui/IconButton.tsx";

interface Props {
  onPickFile: (file: File) => Promise<void>;
  onPickLocal: (path: string) => Promise<void>;
  variant?: ButtonVariant;
  showTrigger?: boolean;
  display?: "button" | "icon";
}

export interface UploadButtonHandle {
  pick: () => Promise<void>;
}

const UploadButton = forwardRef<UploadButtonHandle, Props>(
  ({onPickFile, onPickLocal, variant = "secondary", showTrigger = true, display = "button"}, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const handleClick = useCallback(async () => {
      if (uploading) return;
      setUploading(true);
      try {
        const selected = await pickImageFile();
        if (selected) {
          await onPickLocal(selected);
        }
      } catch {
        setUploading(false);
        inputRef.current?.click();
        return;
      }
      setUploading(false);
    }, [onPickLocal, uploading]);

    useImperativeHandle(ref, () => ({pick: handleClick}), [handleClick]);

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setUploading(true);
      try {
        await onPickFile(file);
      } finally {
        setUploading(false);
      }
    };

    return (
      <>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif" style={{display: "none"}} onChange={handleChange} />
        {showTrigger && display === "icon" && (
          <IconButton title={uploading ? "上传中…" : "上传图片"} disabled={uploading} onClick={() => void handleClick()}>
            <ImageUp size={16} />
          </IconButton>
        )}
        {showTrigger && display === "button" && (
          <Button variant={variant} disabled={uploading} onClick={() => void handleClick()}>
            <ImageUp size={14} />
            {uploading ? "上传中…" : "上传图片"}
          </Button>
        )}
      </>
    );
  },
);

UploadButton.displayName = "UploadButton";

export default UploadButton;
