import { EditorShell } from '@/features/editor/components/editor-shell';
import { PlatformEditorHostProvider } from '@/features/editor/host/platform-editor-host';

/**
 * The editor.
 *
 * The desktop app is a single route: Tauri loads it once and everything
 * happens in place. Additional routes would add navigation the OS window does
 * not expect.
 */
export default function EditorPage() {
  return (
    <PlatformEditorHostProvider>
      <EditorShell />
    </PlatformEditorHostProvider>
  );
}
