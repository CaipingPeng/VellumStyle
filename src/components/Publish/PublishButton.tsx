import {useState} from "react";
import {Send} from "lucide-react";
import PublishDialog from "./PublishDialog.tsx";
import Button from "../ui/Button.tsx";

interface Props {
  onNeedSettings: () => void;
}

export default function PublishButton({onNeedSettings}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Send size={14} />
        发布
      </Button>
      <PublishDialog open={open} onClose={() => setOpen(false)} onNeedSettings={onNeedSettings} />
    </>
  );
}
