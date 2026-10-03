export default function TicketDetailLoading() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading ticket">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton h-6 w-2/3" />
      <div className="grid gap-2 border-y border-line py-3 sm:grid-cols-2">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-full" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="space-y-4">
          <div className="skeleton h-3 w-40" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-11/12" />
          <div className="skeleton h-3 w-4/5" />
        </div>
        <div className="space-y-3">
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-24 w-full" />
        </div>
      </div>
    </div>
  );
}
