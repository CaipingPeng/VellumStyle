import {useState} from "react";
import {MoreHorizontal} from "lucide-react";
import UploadButton from "../Upload/UploadButton.tsx";
import ImportButton from "../Import/ImportButton.tsx";
import ThemeMenu from "../Theme/ThemeMenu.tsx";
import PreviewModeToggle from "../Preview/PreviewModeToggle.tsx";
import PublishButton from "../Publish/PublishButton.tsx";
import CopyButton from "../Copy/CopyButton.tsx";
import IconButton from "../ui/IconButton.tsx";
import Menu, {MenuItem} from "../ui/Menu.tsx";

interface Props {
  onPickFile: (file: File) => Promise<void>;
  onPickLocal: (path: string) => Promise<void>;
  onOpenSettings: () => void;
  onNeedSettings: () => void;
}

function Separator() {
  return <div className="mx-0.5 h-5 w-px bg-border" />;
}

export default function MainToolbar({onPickFile, onPickLocal, onOpenSettings, onNeedSettings}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="hidden items-center gap-2 lg:flex">
        <UploadButton onPickFile={onPickFile} onPickLocal={onPickLocal} />
        <ImportButton />
      </div>
      <Separator />
      <div className="hidden items-center gap-2 md:flex">
        <PreviewModeToggle />
        <ThemeMenu />
      </div>
      <Separator />
      <PublishButton onNeedSettings={onNeedSettings} />
      <CopyButton />
      <Menu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        minWidth={112}
        trigger={
          <IconButton title="更多" active={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
            <MoreHorizontal size={16} />
          </IconButton>
        }
      >
        <MenuItem
          onClick={() => {
            setMoreOpen(false);
            onOpenSettings();
          }}
        >
          设置
        </MenuItem>
      </Menu>
    </div>
  );
}
