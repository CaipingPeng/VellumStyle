import {useRef, useState} from "react";
import {pickImageFile} from "../../utils/upload.ts";
import Button from "../ui/Button.tsx";

interface Props {
  onPickFile: (file: File) => Promise<void>;
  onPickLocal: (path: string) => Promise<void>;
}

export default function UploadButton({onPickFile, onPickLocal}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleClick = async () => {
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
  };

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
      <Button variant="secondary" disabled={uploading} onClick={handleClick}>
        {uploading ? "上传中…" : "上传图片"}
      </Button>
    </>
  );
}
