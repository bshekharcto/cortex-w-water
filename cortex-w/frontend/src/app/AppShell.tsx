import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopHeader } from '@/components/layout/TopHeader';
import { DataFreshnessProvider } from '@/components/layout/DataFreshness';

export function AppShell() {
  const { pathname } = useLocation();
  const isCommandCenter = pathname.startsWith('/app/command-center');
  const isGis = pathname.startsWith('/app/gis');

  return (
    <DataFreshnessProvider>
      <div className={`cw-shell ${isCommandCenter ? 'cw-shell--command-center' : ''}`}>
        <Sidebar />
        <div className="cw-main-area">
          <TopHeader />
          <main
            className={`cw-page-content ${isCommandCenter ? 'cw-page-content--command-center' : ''} ${
              isGis ? 'cw-page-content--gis' : ''
            }`}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </DataFreshnessProvider>
  );
}
