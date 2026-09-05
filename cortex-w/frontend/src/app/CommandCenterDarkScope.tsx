import { Outlet } from 'react-router-dom';
import { COMMAND_CENTER_DARK_SCOPE_CLASS } from '@/theme/cortexTheme';

/**
 * Wrapper that applies .cw-scope-dark ONLY around Command Center routes.
 * See theme/commandCenterDarkTokens.css for the design decision note.
 * All CSS variables inside this subtree resolve to the dark palette;
 * everything outside stays on the :root light tokens.
 */
export function CommandCenterDarkScope() {
  return (
    <div className={COMMAND_CENTER_DARK_SCOPE_CLASS} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Outlet />
    </div>
  );
}
