import {useState} from "react";
import PublishDialog from "./PublishDialog.tsx";
import Button from "../ui/Button.tsx";

interface Props {
  onNeedSettings: () => void;
}

export default function PublishButton({onNeedSettings}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>发布</Button>
      {open && <PublishDialog onClose={() => setOpen(false)} onNeedSettings={onNeedSettings} />}
    </>
  );
}
