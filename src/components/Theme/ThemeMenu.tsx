import {useState} from "react";
import ThemePickerDialog from "./ThemePickerDialog.tsx";
import Button from "../ui/Button.tsx";

export default function ThemeMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>主题</Button>
      {open && <ThemePickerDialog onClose={() => setOpen(false)} />}
    </>
  );
}
