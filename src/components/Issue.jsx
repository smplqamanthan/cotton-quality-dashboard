import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";

const columns = [
  { key: "unit", label: "Unit" },
  { key: "line", label: "Line" },
  { key: "issue_date", label: "Issue Date" },
  { key: "cotton", label: "Cotton" },
  { key: "mixing_no", label: "Mixing No" },
];

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().split("T")[0];
};

const formatDisplayDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const normalizeText = (value) => (value === null || value === undefined ? "" : String(value).trim());

const parseDateValue = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const sortRowsByColumns = (rows) => {
  if (!Array.isArray(rows)) return [];
  return [...rows].sort((a, b) => {
    let result = normalizeText(a?.unit).localeCompare(normalizeText(b?.unit), undefined, {
      sensitivity: "base",
      numeric: true,
    });
    if (result !== 0) return result;

    result = normalizeText(a?.line).localeCompare(normalizeText(b?.line), undefined, {
      sensitivity: "base",
      numeric: true,
    });
    if (result !== 0) return result;

    const dateA = parseDateValue(a?.issue_date);
    const dateB = parseDateValue(b?.issue_date);
    if (dateA !== dateB) {
      if (dateA === null) return 1;
      if (dateB === null) return -1;
      return dateA - dateB;
    }

    result = normalizeText(a?.cotton).localeCompare(normalizeText(b?.cotton), undefined, {
      sensitivity: "base",
      numeric: true,
    });
    if (result !== 0) return result;

    return normalizeText(a?.mixing_no).localeCompare(normalizeText(b?.mixing_no), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
};

function Issue() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const [isCottonModalOpen, setIsCottonModalOpen] = useState(false);
  const [cottonRows, setCottonRows] = useState([]);
  const [cottonLoading, setCottonLoading] = useState(false);
  const [cottonError, setCottonError] = useState("");
  const [cottonSuccess, setCottonSuccess] = useState("");
  const [cottonSaving, setCottonSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [issueUploading, setIssueUploading] = useState(false);
  const [issueUploadError, setIssueUploadError] = useState("");
  const [issueUploadSuccess, setIssueUploadSuccess] = useState("");
  const [isIssueUpdateModalOpen, setIsIssueUpdateModalOpen] = useState(false);

  const [mixingIssues, setMixingIssues] = useState([]);
  const [mixingIssuesLoading, setMixingIssuesLoading] = useState(false);
  const [mixingIssuesError, setMixingIssuesError] = useState("");
  const [mixingIssuesSuccess, setMixingIssuesSuccess] = useState("");

  const fetchCottonVarieties = useCallback(async () => {
    setCottonRows([]);
    setCottonLoading(true);
    setCottonError("");
    setCottonSuccess("");
    try {
      const response = await fetch("https://cotton-api-ekdn.onrender.com/api/mixing-code/varieties");
      if (!response.ok) throw new Error("Failed to load variety data.");
      const data = await response.json();
      setCottonRows(
        Array.isArray(data)
          ? data
              .map((row) => ({
                variety: row?.variety ?? "",
                cotton_name: row?.cotton_name ?? "",
                cotton_year:
                  row?.cotton_year === null || row?.cotton_year === undefined || row?.cotton_year === ""
                    ? ""
                    : String(row.cotton_year),
                weight:
                  row?.weight === null || row?.weight === undefined || row?.weight === ""
                    ? ""
                    : String(row.weight),
              }))
              .filter((row) => row.variety)
          : []
      );
      if (Array.isArray(data) && data.length === 0) {
        setCottonSuccess("No varieties available to update.");
      }
    } catch (err) {
      console.error(err);
      setCottonError(err.message || "Unable to load variety data.");
    } finally {
      setCottonLoading(false);
    }
  }, []);

  const loadMissingIssues = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("https://cotton-api-ekdn.onrender.com/api/mixing-issues/missing");
      if (!response.ok) throw new Error("Failed to load mixing issues.");
      const data = await response.json();
      setRows(Array.isArray(data) ? data : []);
      setSuccess("");
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to fetch data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMissingIssues();
  }, [loadMissingIssues]);

  const handleDateChange = (index, value) => {
    setRows((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, issue_date: value || null } : row))
    );
  };

  const rowsReadyToSave = useMemo(
    () => rows.filter((row) => row.issue_date),
    [rows]
  );

  const handleSave = async () => {
    if (rowsReadyToSave.length === 0) {
      setError("Please select at least one issue date to save.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("https://cotton-api-ekdn.onrender.com/api/mixing-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: rowsReadyToSave }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save issue dates.");
      }

      setSuccess("Issue dates saved successfully.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to save issue dates.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenIssueModal = () => {
    setIssueUploadError("");
    setIssueUploadSuccess("");
    setIsIssueModalOpen(true);
  };

  const handleCloseIssueModal = () => {
    setIsIssueModalOpen(false);
    setIssueUploadError("");
    setIssueUploadSuccess("");
  };

  const handleDownloadIssueTemplate = async () => {
    setIssueUploadError("");
    setIssueUploadSuccess("");
    try {
      const response = await fetch("https://cotton-api-ekdn.onrender.com/api/mixing-issues/template");
      if (!response.ok) throw new Error("Failed to download template.");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "mixing_issue_template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setIssueUploadSuccess("Template downloaded successfully.");
    } catch (err) {
      console.error(err);
      setIssueUploadError(err.message || "Unable to download template.");
    }
  };

  const handleIssueFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIssueUploading(true);
    setIssueUploadError("");
    setIssueUploadSuccess("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("https://cotton-api-ekdn.onrender.com/api/mixing-issues/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to upload issue data.");
      }

      const data = await response.json().catch(() => ({}));
      setIssueUploadSuccess(data?.message || "Issue data uploaded successfully.");
      await loadMissingIssues();
    } catch (err) {
      console.error(err);
      setIssueUploadError(err.message || "Unable to upload issue data.");
    } finally {
      setIssueUploading(false);
      event.target.value = "";
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="text-2xl font-bold text-purple-800">Issue Update</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadMissingIssues}
            disabled={loading || saving}
            className={`px-4 py-2 rounded font-semibold shadow transition border border-purple-600 ${
              loading || saving
                ? "bg-white text-gray-400 cursor-not-allowed"
                : "bg-white text-purple-700 hover:bg-purple-600 hover:text-white"
            }`}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMixingIssuesError("");
              setMixingIssuesSuccess("");
              setIsIssueUpdateModalOpen(true);
            }}
            className="px-4 py-2 rounded font-semibold shadow transition border border-purple-600 bg-white text-purple-700 hover:bg-purple-600 hover:text-white"
          >
            Issue Update
          </button>
          <button
            type="button"
            onClick={handleOpenIssueModal}
            className="px-4 py-2 rounded font-semibold shadow transition border border-purple-600 bg-white text-purple-700 hover:bg-purple-600 hover:text-white"
          >
            Issue Upload
          </button>

          <button
            type="button"
            onClick={() => {
              setCottonSuccess("");
              setCottonError("");
              setSearchTerm("");
              setIsCottonModalOpen(true);
            }}
            disabled={cottonLoading}
            className={`px-4 py-2 rounded font-semibold shadow transition border border-purple-600 ${
              cottonLoading
                ? "bg-white text-gray-400 cursor-not-allowed"
                : "bg-white text-purple-700 hover:bg-purple-600 hover:text-white"
            }`}
          >
            {cottonLoading ? "Loading..." : "Cotton Update"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`px-4 py-2 rounded text-white font-semibold shadow transition ${
              saving ? "bg-gray-400 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"
            }`}
          >
            {saving ? "Saving..." : "Save Selected"}
          </button>
        </div>

        {isIssueUpdateModalOpen && (
          <MixingIssuesModal
            isOpen={isIssueUpdateModalOpen}
            onClose={() => {
              setIsIssueUpdateModalOpen(false);
              setMixingIssues([]);
              setMixingIssuesError("");
              setMixingIssuesSuccess("");
            }}
            onApplyFilters={async (query) => {
              setMixingIssuesLoading(true);
              setMixingIssuesError("");
              setMixingIssuesSuccess("");
              try {
                const params = new URLSearchParams();

                const appendTrimmedParam = (key, value) => {
                  const trimmed = typeof value === "string" ? value.trim() : value;
                  if (trimmed !== undefined && trimmed !== null && `${trimmed}`.trim() !== "") {
                    params.append(key, `${trimmed}`.trim());
                  }
                };

                appendTrimmedParam("unit", query.unit);
                appendTrimmedParam("line", query.line);
                appendTrimmedParam("cotton", query.cotton);
                appendTrimmedParam("mixing_no_from", query.mixingNoFrom);
                appendTrimmedParam("mixing_no_to", query.mixingNoTo);

                const response = await fetch(
                  `https://cotton-api-ekdn.onrender.com/api/mixing-issues${params.toString() ? `?${params.toString()}` : ""}`
                );
                if (!response.ok) throw new Error("Failed to load mixing issue records.");
                const data = await response.json();
                setMixingIssues(Array.isArray(data) ? data : []);
                if (Array.isArray(data) && data.length === 0) {
                  setMixingIssuesSuccess("No records found for the selected filters.");
                }
              } catch (err) {
                console.error(err);
                setMixingIssuesError(err.message || "Unable to load records.");
              } finally {
                setMixingIssuesLoading(false);
              }
            }}
            rows={mixingIssues}
            setRows={setMixingIssues}
            loading={mixingIssuesLoading}
            error={mixingIssuesError}
            success={mixingIssuesSuccess}
            setSuccess={setMixingIssuesSuccess}
            setError={setMixingIssuesError}
          />
        )}
      </div>

      {error && <p className="text-red-600 mb-3">{error}</p>}
      {success && <p className="text-green-600 mb-3">{success}</p>}

      {loading ? (
        <p className="text-purple-700 font-semibold">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-600">No missing mixing numbers found.</p>
      ) : (
        <div className="overflow-auto border border-gray-300 rounded-lg shadow-sm">
          <table className="min-w-full table-auto border-collapse">
            <thead className="bg-purple-700 text-white text-sm">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="px-3 py-2 border border-gray-300 text-left">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.mixing_no}-${row.cotton}`} className="even:bg-gray-100 text-sm">
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">
                    {row.mixing_no ?? "-"}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">
                    {row.unit ?? "-"}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">
                    {row.line ?? "-"}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">
                    {row.cotton ?? "-"}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">
                    <input
                      type="date"
                      value={formatDate(row.issue_date)}
                      onChange={(event) => handleDateChange(index, event.target.value || null)}
                      className="border border-gray-300 rounded px-2 py-1"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isIssueModalOpen && (
        <IssueUploadModal
          onClose={handleCloseIssueModal}
          onDownload={handleDownloadIssueTemplate}
          onFileChange={handleIssueFileChange}
          uploading={issueUploading}
          error={issueUploadError}
          success={issueUploadSuccess}
        />
      )}

      {isCottonModalOpen && (
        <CottonUpdateModal
          onClose={() => {
            setIsCottonModalOpen(false);
            setCottonRows([]);
            setCottonSuccess("");
            setCottonError("");
            setSearchTerm("");
          }}
          onLoad={fetchCottonVarieties}
          onSave={async () => {
            const preparedRows = cottonRows
              .map((row) => ({
                variety: row.variety?.trim() ?? "",
                cotton_name: row.cotton_name?.trim() ?? "",
                cotton_year: row.cotton_year?.toString().trim() ?? "",
                weight: row.weight?.toString().trim() ?? "",
              }))
              .filter((row) => row.variety && row.cotton_name && row.weight && row.cotton_year);

            if (preparedRows.length === 0) {
              setCottonError("Please provide cotton name, cotton year, and weight for at least one variety.");
              return;
            }

            const invalidWeight = preparedRows.find((row) => Number.isNaN(Number(row.weight)));
            if (invalidWeight) {
              setCottonError("Weight must be a valid number for every selected variety.");
              return;
            }

            setCottonSaving(true);
            setCottonError("");
            setCottonSuccess("");

            try {
              const response = await fetch("https://cotton-api-ekdn.onrender.com/api/mixing-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entries: preparedRows }),
              });

              if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data?.error || "Failed to save cotton details.");
              }

              setCottonSuccess("Cotton details saved successfully.");
              setCottonRows((prev) =>
                prev.map((row) => {
                  const updated = preparedRows.find((item) => item.variety === row.variety);
                  return updated
                    ? {
                        ...row,
                        cotton_name: updated.cotton_name,
                        cotton_year: updated.cotton_year,
                        weight: updated.weight,
                      }
                    : row;
                })
              );
              setTimeout(() => setIsCottonModalOpen(false), 1000);
            } catch (err) {
              console.error(err);
              setCottonError(err.message || "Failed to save cotton details.");
            } finally {
              setCottonSaving(false);
            }
          }}
          rows={cottonRows}
          setRows={setCottonRows}
          loading={cottonLoading}
          error={cottonError}
          success={cottonSuccess}
          saving={cottonSaving}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
        />
      )}
    </div>
  );
}

function MixingIssuesModal({
  isOpen,
  onClose,
  onApplyFilters,
  rows,
  setRows,
  loading,
  error,
  success,
  setSuccess,
  setError,
}) {
  const [unitInput, setUnitInput] = useState("");
  const [lineInput, setLineInput] = useState("");
  const [cottonInput, setCottonInput] = useState("");
  const [mixingNoFrom, setMixingNoFrom] = useState("");
  const [mixingNoTo, setMixingNoTo] = useState("");
  const [editingRowId, setEditingRowId] = useState(null);
  const [editingCotton, setEditingCotton] = useState("");
  const [editingDate, setEditingDate] = useState("");
  const [updatingRecordId, setUpdatingRecordId] = useState(null);
  const [deletingRecordId, setDeletingRecordId] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setUnitInput("");
      setLineInput("");
      setCottonInput("");
      setMixingNoFrom("");
      setMixingNoTo("");
      setEditingRowId(null);
      setEditingCotton("");
      setEditingDate("");
    }
  }, [isOpen]);

  const handleApply = async () => {
    await onApplyFilters({
      unit: unitInput.trim(),
      line: lineInput.trim(),
      cotton: cottonInput.trim(),
      mixingNoFrom,
      mixingNoTo,
    });
  };

  const handleReset = () => {
    setUnitInput("");
    setLineInput("");
    setCottonInput("");
    setMixingNoFrom("");
    setMixingNoTo("");
    setRows([]);
    setSuccess("");
    setError("");
    setEditingRowId(null);
    setEditingCotton("");
    setEditingDate("");
  };

  const handleEdit = (row) => {
    setEditingRowId(row.id);
    setEditingCotton(row.cotton ?? "");
    setEditingDate(formatDate(row.issue_date));
  };

  const handleCancelEdit = () => {
    setEditingRowId(null);
    setEditingCotton("");
    setEditingDate("");
  };

  const handleUpdate = async (rowId) => {
    if (!editingDate) {
      setError("Please select a valid issue date before saving.");
      return;
    }

    setUpdatingRecordId(rowId);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`https://cotton-api-ekdn.onrender.com/api/mixing-issues/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue_date: editingDate, cotton: editingCotton }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to update record.");
      }

      setRows((prev) =>
        prev.map((row) =>
          row.id === rowId
            ? {
                ...row,
                issue_date: editingDate,
                cotton: editingCotton,
              }
            : row
        )
      );

      setSuccess("Record updated successfully.");
      setEditingRowId(null);
      setEditingCotton("");
      setEditingDate("");
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to update record.");
    } finally {
      setUpdatingRecordId(null);
    }
  };

  const handleDelete = async (rowId) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this record?");
    if (!confirmDelete) return;

    setDeletingRecordId(rowId);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`https://cotton-api-ekdn.onrender.com/api/mixing-issues/${rowId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete record.");
      }

      setRows((prev) => prev.filter((row) => row.id !== rowId));
      setSuccess("Record deleted successfully.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to delete record.");
    } finally {
      setDeletingRecordId(null);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white rounded-lg shadow-lg w-11/12 max-w-6xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-xl font-bold text-purple-800">Mixing Issue Records</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-red-600 font-semibold hover:underline"
          >
            Close
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="flex flex-col">
              <label className="text-sm font-semibold text-gray-700 mb-1">Unit</label>
              <input
                type="text"
                value={unitInput}
                onChange={(event) => setUnitInput(event.target.value)}
                className="border border-gray-300 rounded px-3 py-2"
                placeholder="Enter unit"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-semibold text-gray-700 mb-1">Line</label>
              <input
                type="text"
                value={lineInput}
                onChange={(event) => setLineInput(event.target.value)}
                className="border border-gray-300 rounded px-3 py-2"
                placeholder="Enter line"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-semibold text-gray-700 mb-1">Cotton</label>
              <input
                type="text"
                value={cottonInput}
                onChange={(event) => setCottonInput(event.target.value)}
                className="border border-gray-300 rounded px-3 py-2"
                placeholder="Enter cotton"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-semibold text-gray-700 mb-1">Mixing No (From)</label>
              <input
                type="number"
                value={mixingNoFrom}
                onChange={(event) => setMixingNoFrom(event.target.value)}
                className="border border-gray-300 rounded px-3 py-2"
                placeholder="e.g. 100"
                min="0"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-semibold text-gray-700 mb-1">Mixing No (To)</label>
              <input
                type="number"
                value={mixingNoTo}
                onChange={(event) => setMixingNoTo(event.target.value)}
                className="border border-gray-300 rounded px-3 py-2"
                placeholder="e.g. 200"
                min="0"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-2">
            <button
              type="button"
              onClick={handleApply}
              className="rounded bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-purple-700"
              disabled={loading}
            >
              Apply
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 shadow hover:bg-gray-200"
              disabled={loading}
            >
              Reset
            </button>
          </div>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-600">
              {success}
            </div>
          )}

          <div className="mt-4 max-h-[360px] overflow-auto border border-gray-200 rounded-lg">
            <table className="min-w-full table-auto text-sm">
              <thead className="bg-purple-700 text-white">
                <tr>
                  <th className="px-3 py-2 text-left">Mixing No</th>
                  <th className="px-3 py-2 text-left">Unit</th>
                  <th className="px-3 py-2 text-left">Line</th>
                  <th className="px-3 py-2 text-left">Cotton</th>
                  <th className="px-3 py-2 text-left">Issue Date</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-3 py-4 text-center text-purple-700 font-semibold">
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-3 py-4 text-center text-gray-600">
                      No records to display.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="even:bg-gray-50">
                      <td className="px-3 py-2 border-t border-gray-200 whitespace-nowrap">{row.mixing_no ?? "-"}</td>
                      <td className="px-3 py-2 border-t border-gray-200 whitespace-nowrap">{row.unit ?? "-"}</td>
                      <td className="px-3 py-2 border-t border-gray-200 whitespace-nowrap">{row.line ?? "-"}</td>
                      <td className="px-3 py-2 border-t border-gray-200 whitespace-nowrap">
                        {editingRowId === row.id ? (
                          <input
                            type="text"
                            value={editingCotton}
                            onChange={(event) => setEditingCotton(event.target.value)}
                            className="border border-gray-300 rounded px-2 py-1"
                            placeholder="Enter cotton"
                          />
                        ) : (
                          row.cotton ?? "-"
                        )}
                      </td>
                      <td className="px-3 py-2 border-t border-gray-200 whitespace-nowrap">
                        {editingRowId === row.id ? (
                          <input
                            type="date"
                            value={editingDate}
                            onChange={(event) => setEditingDate(event.target.value)}
                            className="border border-gray-300 rounded px-2 py-1"
                          />
                        ) : (
                          formatDisplayDate(row.issue_date)
                        )}
                      </td>
                      <td className="px-3 py-2 border-t border-gray-200 whitespace-nowrap space-x-2">
                        {editingRowId === row.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUpdate(row.id)}
                              className="rounded bg-green-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-green-700"
                              disabled={updatingRecordId === row.id}
                            >
                              {updatingRecordId === row.id ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEdit}
                              className="rounded bg-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 shadow hover:bg-gray-400"
                              disabled={updatingRecordId === row.id}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEdit(row)}
                              className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-blue-700"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(row.id)}
                              className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-red-700"
                              disabled={deletingRecordId === row.id}
                            >
                              {deletingRecordId === row.id ? "Deleting..." : "Delete"}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

MixingIssuesModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  filters: PropTypes.shape({
    unit: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
    line: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
  }).isRequired,
  onLoadFilters: PropTypes.func.isRequired,
  onApplyFilters: PropTypes.func.isRequired,
  filtersLoading: PropTypes.bool.isRequired,
  rows: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      unit: PropTypes.string,
      line: PropTypes.string,
      mixing_no: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      issue_date: PropTypes.string,
      cotton: PropTypes.string,
    })
  ).isRequired,
  setRows: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string.isRequired,
  success: PropTypes.string.isRequired,
  setSuccess: PropTypes.func.isRequired,
  setError: PropTypes.func.isRequired,
};

function IssueUploadModal({ onClose, onDownload, onFileChange, uploading, error, success }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white rounded-lg shadow-lg w-11/12 md:w-2/3 max-w-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-xl font-bold text-purple-800">Mixing Issue Upload</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-red-600 font-semibold hover:underline"
            disabled={uploading}
          >
            Close
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Download the sample template, fill in the issue details, and upload it to update the
            <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-xs">mixing_issue</code> table.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onDownload}
              className="flex items-center gap-2 rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-green-700"
              disabled={uploading}
            >
              📥 Download Template
            </button>
            <label className={`flex cursor-pointer items-center gap-2 rounded px-4 py-2 text-sm font-semibold text-white shadow ${uploading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}>
              📤 Upload Filled Template
              <input type="file" accept=".xlsx,.xls" onChange={onFileChange} className="hidden" disabled={uploading} />
            </label>
            {uploading && <span className="text-sm text-gray-600">Uploading...</span>}
          </div>
         {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
        </div>
      </div>
    </div>
  );
}

IssueUploadModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onDownload: PropTypes.func.isRequired,
  onFileChange: PropTypes.func.isRequired,
  uploading: PropTypes.bool.isRequired,
  error: PropTypes.string.isRequired,
  success: PropTypes.string.isRequired,
};

function CottonUpdateModal({
  onClose,
  onLoad,
  onSave,
  rows,
  setRows,
  loading,
  error,
  success,
  saving,
  searchTerm,
  setSearchTerm,
}) {
  const [editingRowIndex, setEditingRowIndex] = useState(null);
  const [savingRowIndex, setSavingRowIndex] = useState(null);

  useEffect(() => {
    onLoad();
  }, [onLoad]);

  const filteredRows = useMemo(() => {
    if (!searchTerm) return rows;
    const lower = searchTerm.toLowerCase();
    return rows.filter((row) => row.variety?.toLowerCase().includes(lower));
  }, [rows, searchTerm]);

  const handleRowChange = (index, field, value) => {
    setRows((prev) =>
      prev.map((row, idx) =>
        idx === index
          ? {
              ...row,
              [field]: field === "weight" ? value.replace(/[^0-9.]/g, "") : value,
            }
          : row
      )
    );
  };

  const handleEditRow = (index) => {
    setEditingRowIndex(index);
  };

  const handleSaveRow = async (index) => {
    const row = rows[index];

    // Validate the row data
    if (!row.cotton_name?.trim()) {
      alert("Please enter a cotton name.");
      return;
    }

    if (!row.cotton_year?.toString().trim()) {
      alert("Please enter a cotton year.");
      return;
    }

    if (!row.weight?.toString().trim()) {
      alert("Please enter a weight.");
      return;
    }

    if (Number.isNaN(Number(row.weight))) {
      alert("Weight must be a valid number.");
      return;
    }

    setSavingRowIndex(index);

    try {
      const preparedRow = {
        variety: row.variety?.trim() ?? "",
        cotton_name: row.cotton_name?.trim() ?? "",
        cotton_year: row.cotton_year?.toString().trim() ?? "",
        weight: row.weight?.toString().trim() ?? "",
      };

      const response = await fetch("https://cotton-api-ekdn.onrender.com/api/mixing-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: [preparedRow] }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save cotton details.");
      }

      // Success - disable editing for this row
      setEditingRowIndex(null);
      alert("Cotton details saved successfully.");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to save cotton details.");
    } finally {
      setSavingRowIndex(null);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white rounded-lg shadow-lg w-11/12 md:w-3/4 max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-xl font-bold text-purple-800">Cotton Mixing Update</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-red-600 font-semibold hover:underline"
            disabled={saving}
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onLoad}
                disabled={loading || saving}
                className={`px-3 py-2 rounded font-semibold border border-purple-600 ${
                  loading || saving
                    ? "bg-white text-gray-400 cursor-not-allowed"
                    : "bg-white text-purple-700 hover:bg-purple-600 hover:text-white"
                }`}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
              {rows.length > 0 && (
                <span className="text-sm text-gray-600">
                  {rows.length} {rows.length === 1 ? "variety" : "varieties"} available
                </span>
              )}
            </div>

            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search variety"
              className="border border-gray-300 rounded px-3 py-2 w-full md:w-72"
              disabled={loading}
            />
          </div>

          {error && <p className="text-red-600">{error}</p>}
          {success && <p className="text-green-600">{success}</p>}

          <div className="border border-gray-200 rounded h-64 overflow-auto">
            {loading ? (
              <p className="p-4 text-purple-700 font-semibold">Loading...</p>
            ) : filteredRows.length === 0 ? (
              <p className="p-4 text-gray-600">No cotton records to update.</p>
            ) : (
              <table className="min-w-full table-auto text-sm">
                <thead className="bg-purple-700 text-white sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left border border-gray-200">Variety</th>
                    <th className="px-3 py-2 text-left border border-gray-200">Cotton Name</th>
                    <th className="px-3 py-2 text-left border border-gray-200">Cotton Year</th>
                    <th className="px-3 py-2 text-left border border-gray-200">Weight</th>
                    <th className="px-3 py-2 text-center border border-gray-200">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => {
                    const isEditing = editingRowIndex === index;
                    const isSaving = savingRowIndex === index;
                    
                    return (
                      <tr key={row.variety} className="even:bg-gray-100">
                        <td className="px-3 py-2 border border-gray-200 whitespace-nowrap font-medium text-purple-800">
                          {row.variety ?? "-"}
                        </td>
                        <td className="px-3 py-2 border border-gray-200">
                          <input
                            type="text"
                            value={row.cotton_name ?? ""}
                            onChange={(event) => handleRowChange(index, "cotton_name", event.target.value)}
                            className={`border rounded px-2 py-1 w-full ${
                              isEditing ? "border-gray-300 bg-white" : "border-gray-200 bg-gray-100"
                            }`}
                            placeholder="Enter cotton name"
                            disabled={!isEditing || isSaving}
                          />
                        </td>
                        <td className="px-3 py-2 border border-gray-200">
                          <input
                            type="text"
                            inputMode="text"
                            value={row.cotton_year ?? ""}
                            onChange={(event) => handleRowChange(index, "cotton_year", event.target.value)}
                            className={`border rounded px-2 py-1 w-full ${
                              isEditing ? "border-gray-300 bg-white" : "border-gray-200 bg-gray-100"
                            }`}
                            placeholder="Enter cotton year"
                            disabled={!isEditing || isSaving}
                          />
                        </td>
                        <td className="px-3 py-2 border border-gray-200">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.weight ?? ""}
                            onChange={(event) => handleRowChange(index, "weight", event.target.value)}
                            className={`border rounded px-2 py-1 w-full ${
                              isEditing ? "border-gray-300 bg-white" : "border-gray-200 bg-gray-100"
                            }`}
                            placeholder="Enter weight"
                            disabled={!isEditing || isSaving}
                          />
                        </td>
                        <td className="px-3 py-2 border border-gray-200 text-center">
                          {isEditing ? (
                            <button
                              type="button"
                              onClick={() => handleSaveRow(index)}
                              disabled={isSaving}
                              className={`px-3 py-1 rounded text-white font-semibold text-xs ${
                                isSaving
                                  ? "bg-gray-400 cursor-not-allowed"
                                  : "bg-green-600 hover:bg-green-700"
                              }`}
                            >
                              {isSaving ? "Saving..." : "Save"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleEditRow(index)}
                              disabled={editingRowIndex !== null || saving}
                              className={`px-3 py-1 rounded text-white font-semibold text-xs ${
                                editingRowIndex !== null || saving
                                  ? "bg-gray-400 cursor-not-allowed"
                                  : "bg-blue-600 hover:bg-blue-700"
                              }`}
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving || loading || rows.length === 0}
              className={`px-4 py-2 rounded text-white font-semibold shadow transition ${
                saving || loading || rows.length === 0
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-purple-600 hover:bg-purple-700"
              }`}
            >
              {saving ? "Saving..." : rows.length === 0 ? "Nothing to Save" : "Save Cotton Details"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

CottonUpdateModal.propTypes = {
  onClose: PropTypes.func.isRequired,
  onLoad: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  rows: PropTypes.arrayOf(
    PropTypes.shape({
      variety: PropTypes.string,
      cotton_name: PropTypes.string,
      weight: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    })
  ).isRequired,
  setRows: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string.isRequired,
  success: PropTypes.string.isRequired,
  saving: PropTypes.bool.isRequired,
  searchTerm: PropTypes.string.isRequired,
  setSearchTerm: PropTypes.func.isRequired,
};

export default Issue;