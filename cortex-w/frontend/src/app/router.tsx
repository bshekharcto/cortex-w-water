import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AppShell } from './AppShell';
import { CommandCenterDarkScope } from './CommandCenterDarkScope';

// Route-level code splitting — each module is its own chunk (spec 36)
const LoginPage = lazy(() => import('@/modules/auth/pages/LoginPage').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('@/modules/dashboard/pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const CommandCenterPage = lazy(() => import('@/modules/command-center/pages/CommandCenterPage').then(m => ({ default: m.CommandCenterPage })));
const NetworkExplorerPage = lazy(() => import('@/modules/gis/network/pages/NetworkExplorerPage').then(m => ({ default: m.NetworkExplorerPage })));
const GatewayPlacementPage = lazy(() => import('@/modules/gis/gateway-placement/pages/GatewayPlacementPage').then(m => ({ default: m.GatewayPlacementPage })));
const HouseholdListPage = lazy(() => import('@/modules/consumer/households/pages/HouseholdListPage').then(m => ({ default: m.HouseholdListPage })));
const HouseholdDetailPage = lazy(() => import('@/modules/consumer/households/pages/HouseholdDetailPage').then(m => ({ default: m.HouseholdDetailPage })));
const BillingPage = lazy(() => import('@/modules/consumer/billing/pages/BillingPage').then(m => ({ default: m.BillingPage })));
const AlarmsPage = lazy(() => import('@/modules/ai-analysis/alarms/pages/AlarmsPage').then(m => ({ default: m.AlarmsPage })));
const HydraulicPage = lazy(() => import('@/modules/ai-analysis/hydraulic/pages/HydraulicPage').then(m => ({ default: m.HydraulicPage })));
const SettingsPage = lazy(() => import('@/modules/settings/general/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const IntegrationsPage = lazy(() => import('@/modules/settings/integrations/pages/IntegrationsPage').then(m => ({ default: m.IntegrationsPage })));
const UsersPage = lazy(() => import('@/modules/settings/users/pages/UsersPage').then(m => ({ default: m.UsersPage })));

function PageLoader() {
  return (
    <div className="cw-page-loader">
      <div className="cw-spinner" />
    </div>
  );
}

/**
 * Route tree from spec section 6. Deep links work because:
 * 1. nginx SPA fallback serves index.html for all paths (spec 42)
 * 2. ProtectedRoute checks sessionStorage, not Zustand, so the token
 *    survives a hard refresh (spec 6 / ProtectedRoute.tsx comment)
 * 3. Route params (:householdId etc.) are first-class URL segments,
 *    never transient state (guardrail #17).
 */
export function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            {/* GLOBAL TOOLS */}
            <Route path="/app/dashboard" element={<DashboardPage />} />
            <Route element={<CommandCenterDarkScope />}>
              <Route path="/app/command-center" element={<CommandCenterPage />} />
              <Route path="/app/command-center/gateways/:gatewayId" element={<CommandCenterPage />} />
              <Route path="/app/command-center/meters/:meterId" element={<CommandCenterPage />} />
            </Route>

            {/* GIS */}
            <Route path="/app/gis/network" element={<NetworkExplorerPage />} />
            <Route path="/app/gis/network/meters/:assetId" element={<NetworkExplorerPage />} />
            <Route path="/app/gis/gateway-placement" element={<GatewayPlacementPage />} />

            {/* CONSUMER */}
            <Route path="/app/consumer/households" element={<HouseholdListPage />} />
            <Route path="/app/consumer/households/:householdId" element={<HouseholdDetailPage />} />
            <Route path="/app/consumer/billing" element={<BillingPage />} />
            <Route path="/app/consumer/billing/:billId" element={<BillingPage />} />

            {/* AI ANALYSIS */}
            <Route path="/app/ai/alarms" element={<AlarmsPage />} />
            <Route path="/app/ai/alarms/:alarmId" element={<AlarmsPage />} />
            <Route path="/app/ai/hydraulic" element={<HydraulicPage />} />

            {/* ADMIN */}
            <Route path="/app/settings" element={<SettingsPage />} />
            <Route path="/app/settings/integrations" element={<IntegrationsPage />} />
            <Route path="/app/settings/users" element={<UsersPage />} />
            <Route path="/app/settings/general" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
