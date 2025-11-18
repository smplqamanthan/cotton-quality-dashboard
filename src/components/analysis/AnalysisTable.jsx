const placeholderColumns = [
  "Issue Date",
  "Unit",
  "Line",
  "Mixing No",
  "Cotton",
  "UHML",
  "STR",
  "SFI",
  "Trash",
];

const placeholderRows = [
  {
    issueDate: "2024-09-01",
    unit: "Unit A",
    line: "Line 1",
    mixingNo: "MX-101",
    cotton: "COTTON-25",
    uhml: 28.7,
    str: 30.1,
    sfi: 6.2,
    trash: 3.1,
  },
  {
    issueDate: "2024-09-02",
    unit: "Unit A",
    line: "Line 2",
    mixingNo: "MX-102",
    cotton: "COTTON-25",
    uhml: 28.9,
    str: 30.4,
    sfi: 6.1,
    trash: 3.0,
  },
  {
    issueDate: "2024-09-03",
    unit: "Unit B",
    line: "Line 3",
    mixingNo: "MX-103",
    cotton: "COTTON-26",
    uhml: 28.4,
    str: 29.8,
    sfi: 6.4,
    trash: 3.3,
  },
];

function AnalysisTable() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Detailed Mixing Results</h2>
            <p className="text-sm text-gray-500">
              Displays the tabular view of the analysis data with sticky headers and smooth scrolling.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-md border border-purple-200 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50"
            >
              Export to Excel
            </button>
            <button
              type="button"
              className="rounded-md border border-purple-200 px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50"
            >
              Export to PDF
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200">
          <div className="max-h-[420px] overflow-auto">
            <table className="min-w-full border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  {placeholderColumns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="sticky top-0 border border-gray-300 bg-gray-100 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {placeholderRows.map((row) => (
                  <tr key={row.mixingNo} className="odd:bg-white even:bg-gray-50">
                    <td className="border border-gray-200 px-4 py-3 text-sm text-gray-700">{row.issueDate}</td>
                    <td className="border border-gray-200 px-4 py-3 text-sm text-gray-700">{row.unit}</td>
                    <td className="border border-gray-200 px-4 py-3 text-sm text-gray-700">{row.line}</td>
                    <td className="border border-gray-200 px-4 py-3 text-sm text-gray-700">{row.mixingNo}</td>
                    <td className="border border-gray-200 px-4 py-3 text-sm text-gray-700">{row.cotton}</td>
                    <td className="border border-gray-200 px-4 py-3 text-sm text-gray-700">{row.uhml.toFixed(2)}</td>
                    <td className="border border-gray-200 px-4 py-3 text-sm text-gray-700">{row.str.toFixed(2)}</td>
                    <td className="border border-gray-200 px-4 py-3 text-sm text-gray-700">{row.sfi.toFixed(2)}</td>
                    <td className="border border-gray-200 px-4 py-3 text-sm text-gray-700">{row.trash.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        The dataset above is a placeholder. Once connected to the live API, the table will automatically reflect
        the filtered results, supporting large datasets with sticky headers and export options.
      </p>
    </div>
  );
}

export default AnalysisTable;