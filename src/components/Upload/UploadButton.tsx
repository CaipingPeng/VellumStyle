import {useRef, useState} from "react";
import Button from "../ui/Button.tsx";

interface Props {
  onPick: (file: File) => Promise<void>;
}

export default function UploadButton({onPick}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await onPick(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif" style={{display: "none"}} onChange={handleChange} />
      <Button variant="secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? "上传中…" : "上传图片"}
      </Button>
    </>
  );
}
