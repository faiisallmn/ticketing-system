export default function KbLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-3" role="status" aria-label="Loading articles">
      <div className="skeleton h-7 w-56" />
      <div className="skeleton h-[68px] w-full" />
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="skeleton h-[76px] w-full" />
      ))}
    </div>
  );
}
