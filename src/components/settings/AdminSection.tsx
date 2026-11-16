/* =====================================================================
   SETTINGS → ADMIN
   Only drawn for accounts with the Admin right (Settings leaves it out for
   everyone else). One row that opens the People page, where rights (PRISM,
   Admin) are given and taken away and people can be deleted.
   ===================================================================== */

import { router } from 'expo-router';
import Button from '@/components/Button';
import { SettingRow, SettingsSection } from './SettingsParts';

export default function AdminSection() {
  return (
    <SettingsSection title="Admin">
      <SettingRow name="Manage people" description="Give or take away PRISM and Admin rights, or delete an account.">
        <Button label="Open" kind="secondary" onPress={() => router.push('/admin' as never)} />
      </SettingRow>
    </SettingsSection>
  );
}
