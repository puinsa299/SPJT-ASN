export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div>
        <div className="h-6 w-48 bg-gray-200 rounded-md" />
        <div className="h-4 w-72 bg-gray-100 rounded-md mt-2" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="panel p-4 h-20 bg-gray-100" />
        ))}
      </div>
      <div className="panel h-64 bg-gray-50" />
    </div>
  );
}
