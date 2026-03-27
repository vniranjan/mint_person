import DeleteAccountSection from "./DeleteAccountSection";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Settings</h1>
        <p className="mt-1 text-sm text-stone-500">
          Manage your account preferences.
        </p>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="text-sm font-semibold text-red-900">Danger zone</h2>
        <p className="mt-1 text-sm text-red-700">
          Permanently delete your account and all associated data. This action
          cannot be undone.
        </p>
        <div className="mt-4">
          <DeleteAccountSection />
        </div>
      </div>
    </div>
  );
}
