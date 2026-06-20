import { CategoriesView } from "@/components/categories/categories-view";
import { CurrencySelector } from "@/components/settings/currency-selector";
import { OfflineModeCard } from "@/components/settings/offline-mode-card";
import { ThemeSelector } from "@/components/settings/theme-selector";

export default function SettingsPage() {
  return (
    <>
      <OfflineModeCard />
      <CategoriesView />
      <CurrencySelector />
      <ThemeSelector />
    </>
  );
}
