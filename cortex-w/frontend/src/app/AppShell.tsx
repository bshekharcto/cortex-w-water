import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopHeader } from '@/components/layout/TopHeader';
import { DataFreshnessProvider } from '@/components/layout/DataFreshness';
import { HeaderStatusProvider } from '@/components/layout/HeaderStatus';
import { useEffect } from 'react';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { fetchClientBrand } from '@/modules/dashboard/services/dashboardDataService';

export function AppShell() {
  const { pathname } = useLocation();
  const isCommandCenter = pathname.startsWith('/app/command-center');
  const isGis = pathname.startsWith('/app/gis');
  const setHideBilling = useAuth((s) => s.setHideBilling);
  useEffect(() => {
    fetchClientBrand().then((b) => {
      if (b) setHideBilling(b.hideBilling === true);
    });
  }, [setHideBilling]);

  return (
    <DataFreshnessProvider>
      <HeaderStatusProvider>
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
      </HeaderStatusProvider>
    </DataFreshnessProvider>
  );
}
