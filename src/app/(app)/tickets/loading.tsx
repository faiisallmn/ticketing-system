export default function TicketsLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading tickets">
      <div className="skeleton h-7 w-40" />
      <div className="skeleton h-[104px] w-full" />
      <div className="border border-line bg-surface">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex h-9 items-center gap-3 border-b border-line px-3 last:border-b-0">
            <div className="skeleton h-2 w-2 rounded-full" />
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-3 flex-1" />
            <div className="skeleton h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
