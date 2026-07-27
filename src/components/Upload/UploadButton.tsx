import {forwardRef, useCallback, useImperativeHandle, useRef, useState} from "react";
import {ImageUp, Library} from "lucide-react";
import {pickImageFile} from "../../utils/upload.ts";
import Button, {type ButtonVariant} from "../ui/Button.tsx";
import IconButton from "../ui/IconButton.tsx";
import Menu, {MenuItem} from "../ui/Menu.tsx";

interface Props {
  onPickFile: (file: File) => Promise<void>;
  onPickLocal: (path: string) => Promise<void>;
  variant?: ButtonVariant;
  showTrigger?: boolean;
  display?: "button" | "icon";
  onOpenMaterialLibrary?: () => void;
}

export interface UploadButtonHandle {
  pick: () => Promise<void>;
}

const UploadButton = forwardRef<UploadButtonHandle, Props>(
  ({onPickFile, onPickLocal, onOpenMaterialLibrary, variant = "secondary", showTrigger = true, display = "button"}, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [picking, setPicking] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    const pickLocalImage = useCallback(async () => {
      if (picking) return;
      setPicking(true);
      try {
        const selected = await pickImageFile();
        if (selected) {
          void onPickLocal(selected);
        }
      } catch {
        setPicking(false);
        inputRef.current?.click();
        return;
      }
      setPicking(false);
    }, [onPickLocal, picking]);

    useImperativeHandle(ref, () => ({pick: pickLocalImage}), [pickLocalImage]);

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      void onPickFile(file);
    };

    return (
      <>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif" style={{display: "none"}} onChange={handleChange} />
        {showTrigger && display === "icon" && (
          onOpenMaterialLibrary ? (
            <Menu
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              minWidth={148}
              trigger={
                <IconButton
                  title={picking ? "选择图片中…" : "插入图片"}
                  active={menuOpen}
                  disabled={picking}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <ImageUp size={16} />
                </IconButton>
              }
            >
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  void pickLocalImage();
                }}
              >
                <ImageUp size={14} />
                本地上传图片
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  onOpenMaterialLibrary();
                }}
              >
                <Library size={14} />
                从素材库选择
              </MenuItem>
            </Menu>
          ) : (
            <IconButton title={picking ? "选择图片中…" : "上传图片"} disabled={picking} onClick={() => void pickLocalImage()}>
              <ImageUp size={16} />
            </IconButton>
          )
        )}
        {showTrigger && display === "button" && (
          <Button variant={variant} disabled={picking} onClick={() => void pickLocalImage()}>
            <ImageUp size={14} />
            {picking ? "选择图片中…" : "上传图片"}
          </Button>
        )}
      </>
    );
  },
);

UploadButton.displayName = "UploadButton";

export default UploadButton;
