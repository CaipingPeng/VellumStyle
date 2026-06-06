import {useRef, useState} from "react";

interface Props {
  // 选中文件后交给父组件统一处理（上传 + 插入 + 错误提示），与粘贴走同一路径。
  onPick: (file: File) => Promise<void>;
}

// 工具栏「上传图片」按钮：触发隐藏 file input，选图后委托父组件上传。
export default function UploadButton({onPick}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选同一文件
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      await onPick(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif"
        style={{display: "none"}}
        onChange={handleChange}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        style={{
          height: 30,
          padding: "0 12px",
          fontSize: 13,
          border: "1px solid #d9d9d9",
          borderRadius: 4,
          background: uploading ? "#f5f5f5" : "#fff",
          color: uploading ? "#aaa" : "#333",
          cursor: uploading ? "default" : "pointer",
        }}
      >
        {uploading ? "上传中…" : "上传图片"}
      </button>
    </>
  );
}
