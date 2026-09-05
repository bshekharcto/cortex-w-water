import { useParams, useNavigate } from 'react-router-dom';
import { HouseholdDetailDrawer } from '../components/HouseholdDetailDrawer';
import { HouseholdListPage } from './HouseholdListPage';

export function HouseholdDetailPage() {
  const { householdId } = useParams();
  const nav = useNavigate();

  return (
    <>
      <HouseholdListPage />
      <HouseholdDetailDrawer
        household={{
          id: Number(householdId) || 0,
          customId: householdId?.startsWith('WS/') ? householdId : (householdId ? `WS/BMC/${householdId}` : undefined),
          name: '',
          location: '',
          pinCode: '',
          status: 'Active',
          registrationDate: '',
          countryCode: '+91',
          mobile: '',
          siteId: 1,
        }}
        onClose={() => nav('/app/consumer/households')}
      />
    </>
  );
}
