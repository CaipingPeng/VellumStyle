import {forwardRef, useImperativeHandle, useState} from "react";
import {Palette} from "lucide-react";
import ThemePickerDialog from "./ThemePickerDialog.tsx";
import Button, {type ButtonVariant} from "../ui/Button.tsx";

interface Props {
  variant?: ButtonVariant;
  showTrigger?: boolean;
}

export interface ThemeMenuHandle {
  open: () => void;
}

const ThemeMenu = forwardRef<ThemeMenuHandle, Props>(
  ({variant = "secondary", showTrigger = true}, ref) => {
    const [open, setOpen] = useState(false);
    useImperativeHandle(ref, () => ({open: () => setOpen(true)}), []);

    return (
      <>
        {showTrigger && (
          <Button variant={variant} onClick={() => setOpen(true)}>
            <Palette size={14} />
            主题
          </Button>
        )}
        {open && <ThemePickerDialog onClose={() => setOpen(false)} />}
      </>
    );
  },
);

ThemeMenu.displayName = "ThemeMenu";

export default ThemeMenu;
