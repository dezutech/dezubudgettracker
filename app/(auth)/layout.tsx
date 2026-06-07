// Auth pages use a clean centered layout — no app sidebar or bottom nav.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh justify-center bg-zinc-950 px-4 pb-8 pt-12 sm:items-start sm:pt-20">
      {children}
    </div>
  );
}
