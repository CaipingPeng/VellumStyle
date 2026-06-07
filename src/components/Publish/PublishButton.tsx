import {useState} from "react";
import PublishDialog from "./PublishDialog.tsx";

interface Props {
  onNeedSettings: () => void;
}

export default function PublishButton({onNeedSettings}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          height: 30, padding: "0 12px", fontSize: 13,
          border: "1px solid #07c160", borderRadius: 4,
          background: "#fff", color: "#07c160", cursor: "pointer",
        }}
      >
        发布
      </button>
      {open && <PublishDialog onClose={() => setOpen(false)} onNeedSettings={onNeedSettings} />}
    </>
  );
}
