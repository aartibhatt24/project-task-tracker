interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  if (total === 0) return null;

  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-2 py-3 text-sm">
      <p className="text-slate-500">
        Page {page} of {totalPages} &middot; {total} total
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-md border border-slate-300 px-2.5 py-1 font-medium text-slate-700 disabled:opacity-40 hover:enabled:bg-slate-50"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-md border border-slate-300 px-2.5 py-1 font-medium text-slate-700 disabled:opacity-40 hover:enabled:bg-slate-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
