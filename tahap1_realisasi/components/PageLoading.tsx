export default function PageLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-6 w-48 bg-gray-200 rounded-md" />
        <div className="h-4 w-72 bg-gray-100 rounded-md mt-2" />
      </div>
      <div className="panel h-10 bg-gray-50" />
      <div className="panel">
        <div className="h-11 bg-gray-100 border-b border-line" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 border-b border-line last:border-0 bg-white" />
        ))}
      </div>
    </div>
  );
}
