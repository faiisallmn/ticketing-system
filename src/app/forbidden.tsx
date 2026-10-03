import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium tabular-nums text-danger">403</p>
      <h1 className="text-[22px] font-semibold leading-[28px]">You don&apos;t have access to this page</h1>
      <p className="max-w-md text-sm text-muted">
        Your account doesn&apos;t have permission for this area. If you think this is a mistake, contact an
        administrator.
      </p>
      <Link
        href="/"
        className="mt-2 rounded bg-accent-fill px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Back to home
      </Link>
    </main>
  );
}
