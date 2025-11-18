import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL ?? "https://cotton-api-ekdn.onrender.com";

const TABLE_COLUMNS = [
  { key: "lot_no", label: "Lot Number" },
  { key: "lot_received_date", label: "Lot Received Date" },
  { key: "party_name", label: "Party Name" },
  { key: "station", label: "Station" },
  { key: "variety", label: "Variety" },
  { key: "no_of_bale", label: "No. of Bales" },
  { key: "min_mic_bale_per_lot", label: "Min MIC Bale / Lot" },
  { key: "min_mic", label: "Min MIC" },
  { key: "mat", label: "MAT" },
  { key: "c_grade", label: "C Grade" },
  { key: "moist", label: "Moist (%)" },
  { key: "mic", label: "MIC" },
  { key: "uhml", label: "UHML" },
  { key: "ui", label: "UI" },
  { key: "sf", label: "SFI" },
  { key: "str", label: "STR" },
  { key: "elong", label: "Elong" },
  { key: "rd", label: "Rd" },
  { key: "plus_b", label: "+b" },
  { key: "trash", label: "Trash" },
];

const NUMERIC_FIELDS = new Set([
  "no_of_bale",
  "uhml",
  "mic",
  "str",
  "rd",
  "plus_b",
  "sf",
  "ui",
  "elong",
  "trash",
  "moist",
  "min_mic",
  "min_mic_bale_per_lot",
]);

const DATE_FIELDS = new Set(["lot_received_date"]);

const formatDisplayValue = (key, value) => {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (DATE_FIELDS.has(key)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
    return value;
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return value.toString();
    }
    return value.toFixed(2);
  }

  return value;
};

const normalizeUpdateValue = (key, value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (NUMERIC_FIELDS.has(key)) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (DATE_FIELDS.has(key)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().split("T")[0];
  }

  return value;
};

function LotResult() {
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("info");
  const [tableData, setTableData] = useState([]);
  const [loadingLot, setLoadingLot] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);
  const [editBuffer, setEditBuffer] = useState(null);
  const [savingIndex, setSavingIndex] = useState(null);
  const [deletingIndex, setDeletingIndex] = useState(null);
  const [selectedLot, setSelectedLot] = useState("");

  useEffect(() => {
    if (!searchTerm) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      try {
        setSuggestionLoading(true);
        const params = new URLSearchParams({ search: searchTerm });
        const response = await fetch(`${API_BASE_URL}/api/lot-results/lot-numbers?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to fetch lot numbers.");
        }

        const json = await response.json();
        setSuggestions(Array.isArray(json?.lot_numbers) ? json.lot_numbers : []);
        setSuggestionsOpen(true);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Error fetching lot suggestions:", error.message);
          setSuggestions([]);
          setSuggestionsOpen(false);
        }
      } finally {
        setSuggestionLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [searchTerm]);

  const hasTableData = tableData.length > 0;

  const sortedColumns = useMemo(() => TABLE_COLUMNS, []);

  const clearStatus = () => {
    setStatusMessage("");
    setStatusType("info");
  };

  const handleInputChange = (event) => {
    setSearchTerm(event.target.value);
    setSelectedLot("");
    clearStatus();
    setFetchError("");
  };

  const handleSuggestionSelect = (lotNo) => {
    setSearchTerm(lotNo);
    setSelectedLot(lotNo);
    setSuggestionsOpen(false);
    clearStatus();
  };

  const handleApply = async () => {
    const lotToFetch = searchTerm.trim();

    if (!lotToFetch) {
      setStatusMessage("Enter a lot number to search.");
      setStatusType("warning");
      return;
    }

    try {
      setLoadingLot(true);
      clearStatus();
      setFetchError("");
      setEditingIndex(null);
      setEditBuffer(null);

      const response = await fetch(
        `${API_BASE_URL}/api/lot-results/lot/${encodeURIComponent(lotToFetch)}`
      );

      if (response.status === 404) {
        setTableData([]);
        setStatusMessage("This lot is not available.");
        setStatusType("error");
        setSelectedLot("");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to load lot data.");
      }

      const json = await response.json();
      const records = Array.isArray(json?.records) ? json.records : [];
      setTableData(records);
      setSelectedLot(lotToFetch);

      if (records.length === 0) {
        setStatusMessage("This lot is not available.");
        setStatusType("error");
      } else {
        setStatusMessage(`Showing ${records.length} record(s) for lot ${lotToFetch}.`);
        setStatusType("success");
      }
    } catch (error) {
      console.error("Error applying lot search:", error.message);
      setFetchError(error.message || "Unable to load lot data.");
      setTableData([]);
      setSelectedLot("");
    } finally {
      setLoadingLot(false);
    }
  };

  const handleReset = () => {
    setSearchTerm("");
    setSelectedLot("");
    setTableData([]);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setSuggestionLoading(false);
    setStatusMessage("");
    setStatusType("info");
    setFetchError("");
    setEditingIndex(null);
    setEditBuffer(null);
    setSavingIndex(null);
    setDeletingIndex(null);
  };

  const beginEdit = (index) => {
    setEditingIndex(index);
    setEditBuffer({ ...tableData[index] });
    clearStatus();
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditBuffer(null);
    clearStatus();
  };

  const handleEditChange = (key, value) => {
    setEditBuffer((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const saveChanges = async (index) => {
    if (editingIndex !== index || !editBuffer) {
      return;
    }

    try {
      setSavingIndex(index);
      const payload = {};

      sortedColumns.forEach(({ key }) => {
        payload[key] = normalizeUpdateValue(key, editBuffer[key]);
      });

      payload.lot_no = tableData[index].lot_no;

      const response = await fetch(
        `${API_BASE_URL}/api/lot-results/lot/${encodeURIComponent(payload.lot_no)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message = errorBody?.error || "Failed to update lot result.";
        throw new Error(message);
      }

      setTableData((previous) =>
        previous.map((row, rowIndex) => (rowIndex === index ? { ...row, ...payload } : row))
      );
      setEditingIndex(null);
      setEditBuffer(null);
      setStatusMessage("Lot result updated successfully.");
      setStatusType("success");
    } catch (error) {
      console.error("Error saving lot result:", error.message);
      setStatusMessage(error.message || "Unable to save changes.");
      setStatusType("error");
    } finally {
      setSavingIndex(null);
    }
  };

  const deleteRow = async (index) => {
    const row = tableData[index];
    if (!row?.lot_no) {
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to delete lot ${row.lot_no}? This action cannot be undone.`
    );

    if (!confirmDelete) {
      return;
    }

    try {
      setDeletingIndex(index);
      const response = await fetch(
        `${API_BASE_URL}/api/lot-results/lot/${encodeURIComponent(row.lot_no)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const message = errorBody?.error || "Failed to delete lot result.";
        throw new Error(message);
      }

      setTableData((previous) => previous.filter((_, rowIndex) => rowIndex !== index));
      setStatusMessage(`Lot ${row.lot_no} deleted successfully.`);
      setStatusType("success");

      if (tableData.length === 1) {
        setSelectedLot("");
      }
    } catch (error) {
      console.error("Error deleting lot result:", error.message);
      setStatusMessage(error.message || "Unable to delete lot result.");
      setStatusType("error");
    } finally {
      setDeletingIndex(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-lg font-semibold text-purple-700">Find Lot Result</h2>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative w-full md:w-72">
            <input
              id="lot-search"
              type="text"
              value={searchTerm}
              onChange={handleInputChange}
              onFocus={() => setSuggestionsOpen(suggestions.length > 0)}
              placeholder="Enter lot number"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-purple-600 focus:outline-none"
            />
            {suggestionLoading && (
              <p className="absolute right-3 top-9 text-xs text-gray-400">Loading...</p>
            )}
            {suggestionsOpen && suggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded border border-gray-200 bg-white shadow">
                {suggestions.map((lot) => (
                  <li
                    key={lot}
                    role="button"
                    tabIndex={0}
                    onMouseDown={() => handleSuggestionSelect(lot)}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-purple-100"
                  >
                    {lot}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <button
              type="button"
              onClick={handleApply}
              className="w-full rounded bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-purple-700 md:w-auto"
              disabled={loadingLot}
            >
              {loadingLot ? "Applying..." : "Apply"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="w-full rounded border border-purple-200 px-4 py-3 text-sm font-semibold text-purple-600 transition hover:border-purple-300 hover:bg-purple-50 md:w-auto"
              disabled={loadingLot}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`rounded border px-4 py-3 text-sm ${
            statusType === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : statusType === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : statusType === "warning"
              ? "border-yellow-200 bg-yellow-50 text-yellow-700"
              : "border-blue-200 bg-blue-50 text-blue-700"
          }`}
        >
          {statusMessage}
        </div>
      )}

      {fetchError && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </div>
      )}

      {hasTableData ? (
        <div className="space-y-6">
          {tableData.map((row, index) => {
            const isEditing = editingIndex === index;
            return (
              <div
                key={`${row.lot_no}-${index}`}
                className="rounded border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="text-sm font-semibold text-gray-700">
                    Lot Number: <span className="font-bold text-purple-700">{row.lot_no}</span>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => saveChanges(index)}
                          className="rounded bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700"
                          disabled={savingIndex === index}
                        >
                          {savingIndex === index ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded bg-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-300"
                          disabled={savingIndex === index}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => beginEdit(index)}
                          className="rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRow(index)}
                          className="rounded bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
                          disabled={deletingIndex === index}
                        >
                          {deletingIndex === index ? "Deleting..." : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {sortedColumns.map((column, columnIndex) => {
                    const value = isEditing ? editBuffer?.[column.key] ?? "" : row[column.key];
                    const isLotNumberField = column.key === "lot_no";

                    return (
                      <div key={column.key} className="grid grid-cols-1 gap-2 sm:grid-cols-[200px_minmax(0,1fr)]">
                        <div className="text-xs font-semibold uppercase text-gray-500">
                          {column.label}
                        </div>
                        <div className="text-sm text-gray-700">
                          {isEditing && !isLotNumberField ? (
                            <input
                              type={DATE_FIELDS.has(column.key) ? "date" : "text"}
                              value={value ?? ""}
                              onChange={(event) => handleEditChange(column.key, event.target.value)}
                              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-purple-600 focus:outline-none"
                            />
                          ) : (
                            <span className="break-words">
                              {formatDisplayValue(column.key, value)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : selectedLot ? (
        <div className="rounded border border-yellow-200 bg-yellow-50 px-4 py-4 text-sm text-yellow-700">
          No data available for lot {selectedLot}.
        </div>
      ) : null}
    </div>
  );
}

export default LotResult;