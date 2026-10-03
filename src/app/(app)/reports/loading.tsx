export default function ReportsLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading reports">
      <div className="skeleton h-7 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="skeleton h-[104px] w-full" />
        ))}
      </div>
      <div className="skeleton h-60 w-full" />
    </div>
  );
}
