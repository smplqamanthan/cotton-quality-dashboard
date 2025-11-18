import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiUrl } from "../utils/api";

const createDateRangeForYear = (year) => ({
  from_date: `${year}-01-01`,
  to_date: `${year}-12-31`,
});

const parameterOptions = [
  "moist",
  "mic",
  "uhml",
  "ui",
  "sf",
  "str",
  "elong",
  "rd",
  "plus_b",
  "trash",
  "mat",
  "c_grade",
  "min_mic",
  "min_mic_bale_per_lot",
];

const normalizeNumber = (value) => {
  if (value === null || value === undefined || `${value}`.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const createFilterFn = (parameter, rawThreshold) => {
  const threshold = normalizeNumber(rawThreshold);
  if (!parameter || threshold === null) {
    return () => true;
  }
  return (result) => {
    const value = normalizeNumber(result?.[parameter]);
    if (value === null) {
      return false;
    }
    return value >= threshold;
  };
};

const buildVarietyKey = (value) => {
  if (value === null || value === undefined || `${value}`.trim() === "") {
    return "Unspecified";
  }
  return `${value}`.trim();
};

function CottonResultsDashboard() {
  const [yearOptions, setYearOptions] = useState([]);
  const [selectedYear, setSelectedYear] = useState("");
  const [yearResults, setYearResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingLots, setPendingLots] = useState([]);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedParameter, setSelectedParameter] = useState("");
  const [parameterValue, setParameterValue] = useState("");

  const fetchYearResults = useCallback(async (year) => {
    if (!year) {
      setYearResults([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { from_date, to_date } = createDateRangeForYear(year);
      const params = new URLSearchParams({ from_date, to_date });
      const response = await fetch(
        `https://cotton-api-ekdn.onrender.com/api/cotton-results?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to load cotton results");
      }
      const json = await response.json();
      setYearResults(json);
    } catch (err) {
      console.error("Error fetching cotton results:", err);
      setError("Unable to load cotton results for the selected year.");
      setYearResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const deriveYearOptions = useCallback((records) => {
    const years = new Set();
    records.forEach((item) => {
      if (item?.lot_received_date) {
        const year = new Date(item.lot_received_date).getFullYear();
        if (!Number.isNaN(year)) {
          years.add(year.toString());
        }
      }
    });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, []);

  const fetchAvailableYears = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(getApiUrl(`/api/cotton-results`));
      if (!response.ok) {
        throw new Error("Failed to load cotton results for year options");
      }
      const json = await response.json();
      const derivedYears = deriveYearOptions(json);
      setYearOptions(derivedYears);
      if (derivedYears.length > 0) {
        const defaultYear = derivedYears[0];
        setSelectedYear(defaultYear);
        setYearResults(
          json.filter((item) => {
            if (!item?.lot_received_date) return false;
            const lotYear = new Date(item.lot_received_date).getFullYear();
            return !Number.isNaN(lotYear) && lotYear.toString() === defaultYear;
          })
        );
      } else {
        setSelectedYear("");
        setYearResults([]);
      }
    } catch (err) {
      console.error("Error determining year options:", err);
      setError("Unable to determine available years from cotton results.");
      setYearOptions([]);
      setSelectedYear("");
      setYearResults([]);
    } finally {
      setLoading(false);
    }
  }, [deriveYearOptions]);

  useEffect(() => {
    fetchAvailableYears();
  }, [fetchAvailableYears]);

  const fetchPendingLots = async () => {
    setPendingLoading(true);
    try {
      const response = await fetch("https://cotton-api-ekdn.onrender.com/api/pending-lots");
      if (!response.ok) {
        throw new Error("Failed to load pending lots");
      }
      const json = await response.json();
      setPendingLots(json);
      setShowPendingModal(true);
    } catch (err) {
      console.error("Error fetching pending lots:", err);
      alert("Unable to load pending lots. Please try again later.");
    } finally {
      setPendingLoading(false);
    }
  };

  const downloadSampleTemplate = async () => {
    try {
      const response = await fetch("https://cotton-api-ekdn.onrender.com/api/pending-lots/template");
      if (!response.ok) {
        throw new Error("Failed to download template");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "Sample_Lot_Results.xlsx";
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading template:", err);
      alert("Download failed. Please try again.");
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("https://cotton-api-ekdn.onrender.com/api/pending-lots/upload", {
        method: "POST",
        body: formData,
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || "Upload failed");
      }

      alert("Uploaded successfully!");
      setShowPendingModal(false);
      fetchYearResults(selectedYear);
    } catch (err) {
      console.error("Error uploading file:", err);
      alert(err.message || "Upload failed. Check console for details.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  useEffect(() => {
    fetchYearResults(selectedYear);
  }, [selectedYear, fetchYearResults]);

  const filterFn = useMemo(
    () => createFilterFn(selectedParameter, parameterValue),
    [selectedParameter, parameterValue]
  );

  const varietyStats = useMemo(() => {
    const baselineCounts = new Map();
    const matchingCounts = new Map();

    yearResults.forEach((result) => {
      const key = buildVarietyKey(result?.cotton_year);
      baselineCounts.set(key, (baselineCounts.get(key) || 0) + 1);
      if (filterFn(result)) {
        matchingCounts.set(key, (matchingCounts.get(key) || 0) + 1);
      }
    });

    return Array.from(baselineCounts.entries())
      .map(([name, total]) => {
        const matches = matchingCounts.get(name) || 0;
        const percentage = total === 0 ? 0 : (matches / total) * 100;
        return {
          name,
          total,
          matches,
          percentage,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [yearResults, filterFn]);

  const handleYearChange = (event) => {
    const year = event.target.value;
    setSelectedYear(year);
    fetchYearResults(year);
  };

  const resetParameter = () => {
    setSelectedParameter("");
    setParameterValue("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <label className="font-semibold text-sm text-gray-600" htmlFor="year-filter">
            Select Year
          </label>
          <select
            id="year-filter"
            value={selectedYear}
            onChange={handleYearChange}
            className="border border-gray-300 rounded px-3 py-2 text-sm"
          >
            {yearOptions.length === 0 && (
              <option value="" disabled>
                No data available
              </option>
            )}
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 space-y-2 rounded border border-gray-200 bg-gray-50 p-4">
       
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-1 items-center gap-2">
              <label className="text-lm font-semibold tracking-wide text-gray-500" htmlFor="parameter-select">
                Parameter
              </label>
              <select
                id="parameter-select"
                value={selectedParameter}
                onChange={(event) => setSelectedParameter(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm lg:w-48"
              >
                <option value="">All parameters</option>
                {parameterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option.replace(/_/g, " ").toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <label className="text-lm font-semibold tracking-wide text-gray-500" htmlFor="parameter-value">
                Minimum value
              </label>
              <input
                id="parameter-value"
                type="number"
                step="any"
                value={parameterValue}
                onChange={(event) => setParameterValue(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm lg:w-48"
                placeholder="Enter value"
                disabled={!selectedParameter}
              />
            </div>
            <button
              type="button"
              onClick={resetParameter}
              className="self-start rounded bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
              disabled={!selectedParameter && parameterValue === ""}
            >
              Clear
            </button>
          </div>
          {selectedParameter && parameterValue === "" && (
            <p className="text-xs text-red-600">Enter a value to apply the parameter filter.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-3 md:self-center">
          <button
            type="button"
            onClick={fetchPendingLots}
            className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-4 rounded shadow text-lm font-semibold"
            disabled={pendingLoading}
          >
            {pendingLoading ? "Loading..." : "Pending Lot Results"}
          </button>
        </div>
 <div className="flex flex-wrap gap-3 md:self-center">
 <button
  className="bg-orange-600 hover:bg-green-700 text-white px-4 py-4 rounded shadow text-lm font-semibold"
  onClick={async () => {
    try {
      const response = await fetch('https://cotton-api-ekdn.onrender.com/wake');
      if (!response.ok) {
        alert('Failed to wake backend');
        return;
      }

      // Parse JSON response (if using JSON)
      const data = await response.json();
      if (data.success) {
        alert('Server is running!');
      } else {
        alert('Server request failed');
      }
    } catch (err) {
      console.error(err);
      alert('Error contacting Server');
    }
  }}
>
  Start Server
</button>


        </div>

      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-purple-700 font-semibold">Loading year summary...</p>
      ) : varietyStats.length === 0 ? (
        <div className="rounded border border-gray-200 bg-gray-50 px-4 py-6 text-center text-gray-500">
          No cotton results available for {selectedYear}.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {varietyStats.map((card) => (
            <div
              key={card.name}
              className="rounded-lg border border-black border border-purple-100 bg-white p-5 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md"
            >
              <h3 className="text-lg font-semibold text-purple-700">
                {card.name}
              </h3>
              {selectedParameter && parameterValue !== "" ? (
                <div className="mt-3 space-y-1">
                  <p className="text-sm font-semibold text-gray-700">
                    {card.matches.toLocaleString()} lots meet criteria
                  </p>
                  <p className="text-xs text-gray-500">
                    {card.total.toLocaleString()} lots received
                  </p>
                  <p className="text-xs text-gray-500">
                    {card.percentage.toFixed(1)}% of lots meet criteria
                  </p>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-3xl font-bold text-gray-800">{card.total}</p>
                  <p className="text-xs text-gray-500">Total lots received</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}

{showPendingModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4 overflow-y-auto">
    <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-yellow-700">Pending Lots</h3>
        <button
          type="button"
          onClick={() => setShowPendingModal(false)}
          className="text-sm font-bold text-red-600"
        >
          ✕
        </button>
      </div>

      {/* Pending Lots List */}
      {pendingLots.length > 0 ? (
        <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-gray-700">
          {pendingLots.map((lot) => (
            <li key={lot.lot_no + lot.variety}>
              {lot.lot_no} {lot.variety ? `- ${lot.variety}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-gray-600">No pending lots!</p>
      )}

      {/* Always visible buttons */}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={downloadSampleTemplate}
          className="flex items-center gap-2 rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-green-700"
        >
          📥 Download Template
        </button>
        <label className="flex cursor-pointer items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700">
          📤 Upload Filled Template
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading}
          />
        </label>
        {uploading && <span className="text-sm text-gray-600">Uploading...</span>}
      </div>
    </div>
  </div>
)}


    </div>
  );
}

export default CottonResultsDashboard;