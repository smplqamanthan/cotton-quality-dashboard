	import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx"; // Excel export
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getApiUrl } from "../utils/api";

// Maximum number of rows to display in the table (removed limit to show all data)
const DISPLAY_ROWS_LIMIT = Infinity;

const normalizeText = (value) => (value === null || value === undefined ? "" : String(value).trim());

const compareText = (a, b) =>
  normalizeText(a).localeCompare(normalizeText(b), undefined, {
    sensitivity: "base",
    numeric: true,
  });

const getIssueDateSortTuple = (issueDate, reportType) => {
  if (!issueDate) return [Number.POSITIVE_INFINITY];

  if (reportType === "daily") {
    const timestamp = new Date(issueDate).getTime();
    return [Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp];
  }

  if (reportType === "weekly") {
    const match = String(issueDate)
      .toUpperCase()
      .match(/^(\d{4})-(\d{2})-W(\d{1,2})$/);
    if (!match) return [Number.POSITIVE_INFINITY];
    const year = Number(match[1]);
    const month = Number(match[2]);
    const week = Number(match[3]);
    return [year, month, Number.isNaN(week) ? Number.POSITIVE_INFINITY : week];
  }

  if (reportType === "monthly") {
    const match = String(issueDate).match(/^(\d{4})-(\d{2})$/);
    if (!match) return [Number.POSITIVE_INFINITY];
    const year = Number(match[1]);
    const month = Number(match[2]);
    return [year, Number.isNaN(month) ? Number.POSITIVE_INFINITY : month];
  }

  return [Number.POSITIVE_INFINITY];
};

const compareIssueDates = (aDate, bDate, reportType) => {
  const tupleA = getIssueDateSortTuple(aDate, reportType);
  const tupleB = getIssueDateSortTuple(bDate, reportType);
  const length = Math.max(tupleA.length, tupleB.length);

  for (let index = 0; index < length; index += 1) {
    const valueA = tupleA[index] ?? Number.POSITIVE_INFINITY;
    const valueB = tupleB[index] ?? Number.POSITIVE_INFINITY;
    if (valueA !== valueB) {
      return valueA - valueB;
    }
  }
  return 0;
};

const getUniqueMixingOptions = (data) => {
  const uniqueValues = new Map();

  data.forEach((item) => {
    const rawValue = item?.mixing;
    const normalized = normalizeText(rawValue);
    if (normalized && !uniqueValues.has(normalized)) {
      uniqueValues.set(normalized, rawValue);
    }
  });

  const sortedValues = Array.from(uniqueValues.values());
  sortedValues.sort((a, b) => compareText(a, b));
  return sortedValues;
};

function Summary() {
  const [filters, setFilters] = useState({
    from_date: "",
    to_date: "",
    unit: [],
    line: [],
    cotton: [],
    mixing: [],
    mixing_from: "",
    mixing_to: "",
    report_type: "daily", // New filter for report type (daily, weekly, monthly)
  });

  const [options, setOptions] = useState({
    units: [],
    lines: [],
    cottons: [],
    mixings: [],
  });

  const [summaryData, setSummaryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [rangeMode, setRangeMode] = useState("date");
  const [validationError, setValidationError] = useState("");
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef = useRef(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteFilters, setDeleteFilters] = useState({
    unit: "",
    line: "",
    cotton: "",
    mixingFrom: "",
    mixingTo: "",
  });
  const [deleteStatus, setDeleteStatus] = useState({ type: "idle", message: "" });
  const [isDeleting, setIsDeleting] = useState(false);

  const [hasLoadedOptions, setHasLoadedOptions] = useState(false);

  const fetchFilterOptions = async (baseFilters) => {
    const params = new URLSearchParams();

    if (baseFilters.from_date) params.append("from_date", baseFilters.from_date);
    if (baseFilters.to_date) params.append("to_date", baseFilters.to_date);

    if (baseFilters.mixing_from) params.append("mixing_from", baseFilters.mixing_from);
    if (baseFilters.mixing_to) params.append("mixing_to", baseFilters.mixing_to);

    [
      { key: "unit", value: baseFilters.unit },
      { key: "line", value: baseFilters.line },
      { key: "cotton", value: baseFilters.cotton },
      { key: "mixing", value: baseFilters.mixing },
    ].forEach(({ key, value }) => {
      if (Array.isArray(value) && value.length > 0) {
        params.append(key, JSON.stringify(value));
      }
    });

console.debug("[Summary] Fetching mixing summary with filters:", filters);
    const response = await fetch(getApiUrl(`/api/filter-options?${params.toString()}`));

    if (!response.ok) {
      throw new Error("Failed to load filter options");
    }

    return response.json();
  };



  const tryLoadOptions = async (baseFilters) => {
    try {
      const json = await fetchFilterOptions(baseFilters);
      setOptions({
        units: json?.units ?? [],
        lines: json?.lines ?? [],
        cottons: json?.cottons ?? [],
        mixings: json?.mixings ?? [],
      });
      setHasLoadedOptions(true);
    } catch (err) {
      console.error("Error fetching options:", err);
      setOptions({ units: [], lines: [], cottons: [], mixings: [] });
      setHasLoadedOptions(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);



  const isUnitValid = filters.unit.length > 0;
  const isLineValid = filters.line.length > 0;
  const hasDateRange = Boolean(filters.from_date && filters.to_date);
  const hasMixingRange = Boolean(filters.mixing_from && filters.mixing_to);
  const rangeRequirementsMet = rangeMode === "date" ? hasDateRange : hasMixingRange;
  const canFetch = rangeRequirementsMet && isUnitValid && isLineValid;
  const normalizedValidationMessage = validationError ? validationError.toLowerCase() : "";
  const unitError = normalizedValidationMessage.includes("unit") ? validationError : "";
  const lineError = normalizedValidationMessage.includes("line") ? validationError : "";

  const validateFilters = () => {
    if (rangeMode === "date") {
      if (!filters.from_date || !filters.to_date) {
        return "Please choose both From and To issue dates.";
      }
      if (new Date(filters.from_date) > new Date(filters.to_date)) {
        return "Issue date 'From' cannot be later than 'To'.";
      }
    } else {
      if (!filters.mixing_from || !filters.mixing_to) {
        return "Please enter both Mixing No From and To.";
      }
      const fromValue = Number(filters.mixing_from);
      const toValue = Number(filters.mixing_to);
      if (Number.isNaN(fromValue) || Number.isNaN(toValue)) {
        return "Mixing numbers must be valid numbers.";
      }
      if (fromValue > toValue) {
        return "Mixing No From cannot be greater than Mixing No To.";
      }
    }

    if (!isUnitValid) return "Select at least one Unit.";
    if (!isLineValid) return "Select at least one Line.";

    return "";
  };

  // 🔹 Fetch streaming data with real-time progress updates
  const fetchStreamingData = async (endpoint) => {
    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(endpoint);
      let receivedData = false;

      eventSource.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === "progress") {
            setProgress({ current: msg.current, total: msg.total });
          } else if (msg.type === "data") {
            receivedData = true;
            eventSource.close();
            resolve(msg.data || []);
          } else if (msg.type === "error") {
            eventSource.close();
            reject(new Error(msg.error || "Unknown error from server"));
          }
        } catch (err) {
          console.error("Error parsing streaming event:", err);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        if (!receivedData) {
          reject(new Error("Failed to fetch streaming data"));
        }
      };

      setTimeout(() => {
        eventSource.close();
        if (!receivedData) {
          reject(new Error("Stream timeout"));
        }
      }, 300000); // 5 minute timeout for large datasets
    });
  };

  // 🔹 Fetch summary only when "Apply" is clicked
  const fetchData = async () => {
    if (!canFetch) {
      console.warn("[Summary] Fetch aborted. Requirements not met:", {
        filters,
        canFetch,
        rangeMode,
        rangeRequirementsMet,
        isUnitValid,
        isLineValid,
      });
      setSummaryData([]);
      const errorMessage = validateFilters();
      setValidationError(errorMessage);
      setSummaryData([]);
      return;
    }
    setValidationError("");
    setLoading(true);
    setProgress({ current: 0, total: 0 });
    try {
      const query = new URLSearchParams({
        from_date: filters.from_date,
        to_date: filters.to_date,
        unit: JSON.stringify(filters.unit),
        line: JSON.stringify(filters.line),
        cotton: JSON.stringify(filters.cotton),
        mixing: JSON.stringify(filters.mixing),
        report_type: filters.report_type,
      }).toString();

      const endpoint = getApiUrl(`/api/cotton-mixing-summary?${query}`);
      console.group("[Summary] Fetching mixing summary with streaming progress");
      console.log("URL:", endpoint);
      console.log("Filters snapshot:", filters);

      const json = await fetchStreamingData(endpoint);
      
      if (Array.isArray(json)) {
        setSummaryData(json);
        const uniqueMixings = getUniqueMixingOptions(json);
        setOptions((prev) => ({
          ...prev,
          mixings: uniqueMixings,
        }));
        if (json.length === 0 && ["weekly", "monthly"].includes(filters.report_type)) {
          console.log(
            `[Summary] No ${filters.report_type} data returned. Weekly/Monthly table not visible with current filters.`,
            {
              reportType: filters.report_type,
              filters,
            },
          );
        }
      } else {
        console.error("Backend did not return an array:", json);
        setSummaryData([]);
        setOptions((prev) => ({
          ...prev,
          mixings: [],
        }));
        if (["weekly", "monthly"].includes(filters.report_type)) {
          console.log(
            `[Summary] Unexpected backend response. Weekly/Monthly table cannot render for report type ${filters.report_type}.`,
            {
              reportType: filters.report_type,
              rawResponse: json,
            },
          );
        }
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setSummaryData([]);
      setOptions((prev) => ({
        ...prev,
        mixings: [],
      }));
      if (["weekly", "monthly"].includes(filters.report_type)) {
        console.log(
          `[Summary] Failed to load ${filters.report_type} data. Weekly/Monthly table not visible due to fetch error.`,
          {
            reportType: filters.report_type,
            filters,
            error: err?.message ?? err,
          },
        );
      }
    }
    setLoading(false);
    setProgress({ current: 0, total: 0 });
  };

// 🔹 Reset filters and clear table
const handleReset = () => {
  setFilters({
    from_date: "",
    to_date: "",
    unit: [],
    line: [],
    cotton: [],
    mixing: [],
    mixing_from: "",
    mixing_to: "",
    report_type: "daily", // Reset to daily
  });
  setOptions({ units: [], lines: [], cottons: [], mixings: [] });
  setHasLoadedOptions(false);
  setRangeMode("date");
  setValidationError("");
  setSummaryData([]); // hides the table
};


  const resetRangeValues = (mode) => ({
    from_date: mode === "date" ? filters.from_date : "",
    to_date: mode === "date" ? filters.to_date : "",
    mixing_from: mode === "mixing" ? filters.mixing_from : "",
    mixing_to: mode === "mixing" ? filters.mixing_to : "",
  });

  const computeHasRange = (modeValue, candidateFilters) => {
    if (modeValue === "date") {
      return Boolean(candidateFilters.from_date && candidateFilters.to_date);
    }

    return Boolean(candidateFilters.mixing_from && candidateFilters.mixing_to);
  };

  const handleRangeModeChange = (mode) => {
    const updatedRangeValues = resetRangeValues(mode);
    const nextFilters = {
      ...filters,
      ...updatedRangeValues,
    };

    setRangeMode(mode);
    setFilters(nextFilters);

    if (!computeHasRange(mode, nextFilters)) {
      setOptions({ units: [], lines: [], cottons: [], mixings: [] });
      setHasLoadedOptions(false);
    } else {
      loadOptionsIfPossible(nextFilters, mode);
    }

    setValidationError("");
  };

  const handleDeleteFilterChange = (event) => {
    const { name, value } = event.target;
    setDeleteFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
    setDeleteStatus({ type: "idle", message: "" });
  };

  const validateDeleteFilters = () => {
    if (!deleteFilters.unit) {
      return "Please select a Unit.";
    }
    if (!deleteFilters.line) {
      return "Please select a Line.";
    }
    if (!deleteFilters.cotton) {
      return "Please select a Cotton.";
    }
    if (deleteFilters.mixingFrom === "" || deleteFilters.mixingTo === "") {
      return "Please enter both Mixing No From and Mixing No To.";
    }

    const fromValue = Number(deleteFilters.mixingFrom);
    const toValue = Number(deleteFilters.mixingTo);

    if (Number.isNaN(fromValue) || Number.isNaN(toValue)) {
      return "Mixing number range must contain valid numbers.";
    }

    if (fromValue > toValue) {
      return "Mixing No From cannot be greater than Mixing No To.";
    }

    return "";
  };

  const handleDelete = async () => {
    const validationMessage = validateDeleteFilters();
    if (validationMessage) {
      setDeleteStatus({ type: "error", message: validationMessage });
      return;
    }

    const confirmation = window.confirm(
      `Are you sure you want to delete mixing chart entries for Unit ${deleteFilters.unit}, Line ${deleteFilters.line}, Cotton ${deleteFilters.cotton} between mixing numbers ${deleteFilters.mixingFrom} and ${deleteFilters.mixingTo}?`
    );

    if (!confirmation) {
      return;
    }

    setIsDeleting(true);
    setDeleteStatus({ type: "idle", message: "" });

    try {
      const response = await fetch(getApiUrl("/api/mixing-chart/delete"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          unit: deleteFilters.unit,
          line: deleteFilters.line,
          cotton: deleteFilters.cotton,
          mixing_from: deleteFilters.mixingFrom,
          mixing_to: deleteFilters.mixingTo,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Failed to delete mixing chart entries");
      }

      setDeleteStatus({ type: "success", message: json?.message || "Entries deleted successfully." });
      setDeleteFilters({ unit: "", line: "", cotton: "", mixingFrom: "", mixingTo: "" });
    } catch (err) {
      console.error("Error deleting mixing chart entries:", err);
      setDeleteStatus({ type: "error", message: err.message || "Failed to delete mixing chart entries." });
    } finally {
      setIsDeleting(false);
    }
  };

  const loadOptionsIfPossible = async (nextFilters, modeValue = rangeMode) => {
    if (!computeHasRange(modeValue, nextFilters)) {
      setOptions({ units: [], lines: [], cottons: [], mixings: [] });
      setHasLoadedOptions(false);
      return;
    }

    await tryLoadOptions(nextFilters);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextFilters = (() => {
      const base = { ...filters, [name]: value };

      if (rangeMode === "date") {
        return {
          ...base,
          mixing_from: "",
          mixing_to: "",
        };
      }

      return {
        ...base,
        from_date: "",
        to_date: "",
      };
    })();

    setFilters(nextFilters);
    setValidationError("");

    if (name === "report_type") {
      setSummaryData([]);
      return;
    }

    if (name === "from_date" || name === "to_date") {
      if (rangeMode === "date") {
        loadOptionsIfPossible(nextFilters);
      }
      return;
    }

    if (name === "mixing_from" || name === "mixing_to") {
      if (rangeMode === "mixing") {
        loadOptionsIfPossible(nextFilters);
      }
      return;
    }
  };

  const handleCheckboxChange = (name, value) => {
    setFilters(prev => {
      const updatedValues = prev[name].includes(value)
        ? prev[name].filter(v => v !== value)
        : [...prev[name], value];

      const nextFilters = {
        ...prev,
        [name]: updatedValues,
      };

      if (hasLoadedOptions) {
        loadOptionsIfPossible(nextFilters);
      }

      return nextFilters;
    });
    setValidationError("");
  };

  const handleSelectAll = (name, values) => {
    setFilters((prev) => {
      const updatedValues = prev[name].length === values.length ? [] : [...values];
      const nextFilters = {
        ...prev,
        [name]: updatedValues,
      };

      if (hasLoadedOptions) {
        loadOptionsIfPossible(nextFilters);
      }

      return nextFilters;
    });
    setValidationError("");
  };

  const toggleDropdown = (name) => {
    setOpenDropdown(openDropdown === name ? null : name);
  };

  // Helper function to format issue date based on report type
  const formatIssueDate = (issueDate, reportType) => {
    if (!issueDate) return "-";
    
    if (reportType === "daily") {
      return new Date(issueDate).toLocaleDateString("en-GB");
    } else if (reportType === "weekly") {
      // Format: 2024-09-W3 -> "15-21 Sep"
      const parts = issueDate.split('-');
      const year = parts[0];
      const month = parseInt(parts[1]);
      const weekNum = parseInt(issueDate.split('-W')[1]);
      
      // Calculate date range for the week
      const startDay = (weekNum - 1) * 7 + 1;
      const endDay = Math.min(weekNum * 7, new Date(year, month, 0).getDate());
      
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthName = monthNames[month - 1];
      
      return `${startDay}-${endDay} ${monthName}`;
    } else if (reportType === "monthly") {
      // Format: 2024-09 -> "Sep 2024"
      const parts = issueDate.split('-');
      const year = parts[0];
      const month = parseInt(parts[1]);
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${monthNames[month - 1]} ${year}`;
    }
    
    return "-";
  };

  const renderMultiSelectDropdown = (label, name, values, { required = false, errorMessage = "" } = {}) => {
    const valuesArray = Array.isArray(values) ? values : [];
    const selectedCount = filters[name].length;
    const allSelected = selectedCount === valuesArray.length && valuesArray.length > 0;
    const isOpen = openDropdown === name;

    return (
      <div className="relative min-w-[200px]" ref={isOpen ? dropdownRef : null}>
        <label className="block text-sm font-semibold mb-1">
          {label}
          {required && <span className="text-red-600 ml-1">*</span>}
        </label>
        <button
          type="button"
          onClick={() => toggleDropdown(name)}
          className={`w-full border p-2 rounded text-left flex items-center justify-between ${
            errorMessage ? "border-red-500" : "border-gray-300"
          } bg-white hover:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500`}
        >
          <span className="text-sm">
            {selectedCount === 0
              ? `Select ${label}`
              : allSelected
              ? `All ${label}s Selected`
              : `${selectedCount} selected`}
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto">
            {valuesArray.length === 0 ? (
              <div className="p-2 text-sm text-gray-500">No options available</div>
            ) : (
              <>
                <label className="flex items-center gap-2 p-2 hover:bg-purple-50 cursor-pointer border-b">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => handleSelectAll(name, valuesArray)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-semibold text-purple-700">Select All</span>
                </label>
                {valuesArray.map((value) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={filters[name].includes(value)}
                      onChange={() => handleCheckboxChange(name, value)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">{value}</span>
                  </label>
                ))}
              </>
            )}
          </div>
        )}
        {errorMessage && <p className="text-xs text-red-600 mt-1">{errorMessage}</p>}
      </div>
    );
  };

// 🔹 Sort summary data
const getSortedSummary = () => {
  return [...summaryData].sort((a, b) => {
    let result = compareText(a?.unit, b?.unit);
    if (result !== 0) return result;

    result = compareText(a?.line, b?.line);
    if (result !== 0) return result;

    // Prefer backend-provided sort key when available
    if (a?.issue_date_sort_key || b?.issue_date_sort_key) {
      result = compareText(a?.issue_date_sort_key, b?.issue_date_sort_key);
      if (result !== 0) return result;
    }

    result = compareIssueDates(a?.issue_date, b?.issue_date, filters.report_type);
    if (result !== 0) return result;

    result = compareText(a?.cotton, b?.cotton);
    if (result !== 0) return result;

    result = compareText(a?.mixing_no, b?.mixing_no);
    if (result !== 0) return result;

    return compareText(a?.mixing, b?.mixing);
  });
};

  // 🔽 Sort before rendering
  const sortedData = getSortedSummary();

// 🚀 Export to Excel (all columns, sorted)
const exportToExcel = () => {
  const sortedData = getSortedSummary();

  console.group("[ExportToExcel] Payload snapshot");
  console.log("Row count:", sortedData.length);
  console.table(
    sortedData.map((row, index) => ({
      index,
      issue_date: row.issue_date,
      formatted_issue_date: formatIssueDate(row.issue_date, filters.report_type),
      mixing_no: row.mixing_no,
      unit: row.unit,
      line: row.line,
      cotton: row.cotton,
      bale_change_over_percent: row.bale_change_over_percent,
      lot_change_over_percent: row.lot_change_over_percent,
    }))
  );
  console.groupEnd();

  const formattedData = sortedData.map((row) => ({
    "Issue Date": formatIssueDate(row.issue_date, filters.report_type),
    "Mixing No": row.mixing_no,
    "Mixing": row.mixing || "-",
    "Blend%": row.blend_percent || "-",
    Unit: row.unit,
    Line: row.line,
    Cotton: row.cotton,
    "No of Lots": row.no_of_lots || 0,
    "Total Bales": row.total_bales,
    "Bale Change Over%":
      row.bale_change_over_percent !== null &&
      row.bale_change_over_percent !== undefined
        ? Number(row.bale_change_over_percent).toFixed(2)
        : "-",
    "Lot Changeover%":
      row.lot_change_over_percent !== null &&
      row.lot_change_over_percent !== undefined
        ? Number(row.lot_change_over_percent).toFixed(2)
        : "-",
    MIC: row.mic,
    STR: row.str,
    UHML: row.uhml,
    Rd: row.rd,
    "+b": row.plus_b,
    SF: row.sf,
    UI: row.ui,
    Elong: row.elong,
    Trash: row.trash,
    Moist: row.moist,
    "Min MIC": row.min_mic,
    "Min MIC%":
      row.min_mic_percent !== null &&
      row.min_mic_percent !== undefined &&
      row.min_mic_percent !== ""
        ? Number(row.min_mic_percent).toFixed(1)
        : "-",
  }));

  const ws = XLSX.utils.json_to_sheet(formattedData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Summary");
  XLSX.writeFile(wb, "Cotton_Summary.xlsx");
};

// 🚀 Export to PDF (all columns, sorted)
const exportToPDF = () => {
  const sortedData = getSortedSummary();

  const tableColumn = [
    "Issue Date",
    "Mixing No",
    "Mixing",
    "Blend%",
    "Unit",
    "Line",
    "Cotton",
    "No of Lots",
    "Total Bales",
    "Bale Change Over%",
    "Lot Changeover%",
    "MIC",
    "STR",
    "UHML",
    "Rd",
    "+b",
    "SF",
    "UI",
    "Elong",
    "Trash",
    "Moist",
    "Min MIC",
    "Min MIC%",
  ];

  const tableRows = sortedData.map((row) => [
    formatIssueDate(row.issue_date, filters.report_type),
    row.mixing_no,
    row.mixing || "-",
    row.blend_percent || "-",
    row.unit,
    row.line,
    row.cotton,
    row.no_of_lots || 0,
    row.total_bales,
    row.bale_change_over_percent !== null &&
    row.bale_change_over_percent !== undefined
      ? Number(row.bale_change_over_percent).toFixed(2)
      : "-",
    row.lot_change_over_percent !== null &&
    row.lot_change_over_percent !== undefined
      ? Number(row.lot_change_over_percent).toFixed(2)
      : "-",
    row.mic,
    row.str,
    row.uhml,
    row.rd,
    row.plus_b,
    row.sf,
    row.ui,
    row.elong,
    row.trash,
    row.moist,
    row.min_mic,
    row.min_mic_percent !== null &&
    row.min_mic_percent !== undefined &&
    row.min_mic_percent !== ""
      ? Number(row.min_mic_percent).toFixed(1)
      : "-",
  ]);

  const doc = new jsPDF("l", "pt", "a3");
  doc.text("Mixing-wise Weighted Quality Summary", 40, 30);
  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 50,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [103, 58, 183] },
  });
  doc.save("Cotton_Summary.pdf");
};


  return (
    <div className="w-full">
      {/* Header + Export Buttons */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-purple-800">
          Cotton Quality Summary Report
        </h2>
        <div className="flex gap-2">
          <button
            onClick={exportToExcel}
            disabled={summaryData.length === 0}
            className={`px-4 py-2 rounded ${
              summaryData.length === 0
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            Excel
          </button>
          <button
            onClick={exportToPDF}
            disabled={summaryData.length === 0}
            className={`px-4 py-2 rounded ${
              summaryData.length === 0
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            PDF
          </button>
          <button
            type="button"
            onClick={() => window.open("https://forms.gle/pLqxW2zXSbjqW7eU6", "_blank", "noopener,noreferrer")}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
          >
            Mixing Upload
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteFilters({ unit: "", line: "", cotton: "", mixingFrom: "", mixingTo: "" });
              setDeleteStatus({ type: "idle", message: "" });
              setIsDeleteModalOpen(true);
            }}
            className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-700 text-white"
          >
            Mixing Delete
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-4 text-sm font-bold text-orange-700">
              <input
                type="radio"
                name="rangeMode"
                value="date"
                checked={rangeMode === "date"}
                onChange={() => handleRangeModeChange("date")}
              />
              <span>Filter by Issue Date</span>
            </label>
            <label className="flex items-center gap-2 text-sm font-bold text-orange-700">
              <input
                type="radio"
                name="rangeMode"
                value="mixing"
                checked={rangeMode === "mixing"}
                onChange={() => handleRangeModeChange("mixing")}
              />
              <span>Filter by Mixing No</span>
            </label>
        </div>

        <div className="flex flex-wrap gap-8">
          <input
            type="date"
            name="from_date"
            value={filters.from_date}
            onChange={handleChange}
            disabled={rangeMode !== "date"}
            className={`border p-2 rounded ${rangeMode !== "date" ? "bg-gray-100 cursor-not-allowed" : ""}`}
            placeholder="From Date"
          />
          <input
            type="date"
            name="to_date"
            value={filters.to_date}
            onChange={handleChange}
            disabled={rangeMode !== "date"}
            className={`border p-2 rounded ${rangeMode !== "date" ? "bg-gray-100 cursor-not-allowed" : ""}`}
            placeholder="To Date"
          />

          <input
            type="number"
            name="mixing_from"
            placeholder="Mixing No From"
            value={filters.mixing_from}
            onChange={handleChange}
            disabled={rangeMode !== "mixing"}
            className={`border p-2 rounded w-36 ${rangeMode !== "mixing" ? "bg-gray-100 cursor-not-allowed" : ""}`}
          />
          <input
            type="number"
            name="mixing_to"
            placeholder="Mixing No To"
            value={filters.mixing_to}
            onChange={handleChange}
            disabled={rangeMode !== "mixing"}
            className={`border p-2 rounded w-36 ${rangeMode !== "mixing" ? "bg-gray-100 cursor-not-allowed" : ""}`}
          />

          <select
            name="report_type"
            value={filters.report_type}
            onChange={handleChange}
            className="border p-2 rounded"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div className="flex items-end gap-4 flex-wrap">
          {renderMultiSelectDropdown("Unit", "unit", options.units, {
            required: true,
            errorMessage: unitError,
          })}
          {renderMultiSelectDropdown("Line", "line", options.lines, {
            required: true,
            errorMessage: lineError,
          })}
          {renderMultiSelectDropdown("Cotton", "cotton", options.cottons, {
            required: false,
          })}
          {renderMultiSelectDropdown("Mixing", "mixing", options.mixings, {
            required: false,
          })}

          <button
            onClick={fetchData}
            disabled={!canFetch}
            className={`px-6 py-2 rounded font-semibold ${
              canFetch
                ? "bg-purple-700 hover:bg-purple-800 text-white"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            Apply
          </button>

          <button
            onClick={handleReset}
            className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded font-semibold"
          >
            Reset
          </button>
        </div>

        {validationError && (
          <p className="text-sm text-red-600 font-medium mt-2">{validationError}</p>
        )}
      </div>



      {/* Table */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-xl p-6">
            <h3 className="text-lg font-bold text-purple-800 mb-4">Delete Mixing Chart Entries</h3>
            <p className="text-sm text-gray-600 mb-4">
              Choose the Unit, Line, Cotton, and Mixing number range you wish to delete from the mixing chart.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Unit</label>
                <input
                  type="text"
                  name="unit"
                  value={deleteFilters.unit}
                  onChange={handleDeleteFilterChange}
                  className="w-full border rounded p-2"
                  placeholder="Enter unit"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Line</label>
                <input
                  type="text"
                  name="line"
                  value={deleteFilters.line}
                  onChange={handleDeleteFilterChange}
                  className="w-full border rounded p-2"
                  placeholder="Enter line"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Cotton</label>
                <input
                  type="text"
                  name="cotton"
                  value={deleteFilters.cotton}
                  onChange={handleDeleteFilterChange}
                  className="w-full border rounded p-2"
                  placeholder="Enter cotton"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Mixing No From</label>
                <input
                  type="number"
                  name="mixingFrom"
                  value={deleteFilters.mixingFrom}
                  onChange={handleDeleteFilterChange}
                  className="w-full border rounded p-2"
                  placeholder="Enter starting mixing no"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Mixing No To</label>
                <input
                  type="number"
                  name="mixingTo"
                  value={deleteFilters.mixingTo}
                  onChange={handleDeleteFilterChange}
                  className="w-full border rounded p-2"
                  placeholder="Enter ending mixing no"
                />
              </div>
            </div>

            {deleteStatus.type === "error" && (
              <p className="mt-4 text-sm text-red-600">{deleteStatus.message}</p>
            )}
            {deleteStatus.type === "success" && (
              <p className="mt-4 text-sm text-green-600">{deleteStatus.message}</p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeleteStatus({ type: "idle", message: "" });
                }}
                className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400 text-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className={`px-4 py-2 rounded text-white ${
                  isDeleting ? "bg-red-300 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-4">
          <p className="text-purple-700 font-semibold">
            {progress.total > 0
              ? `Loading data ${progress.current} out of ${progress.total}`
              : "Loading..."}
          </p>
          {progress.total > 0 && (
            <div className="mt-2 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-purple-700 h-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      ) : summaryData.length > 0 ? (
        <>
          <div className="w-full max-h-[80vh] overflow-auto border border-gray-300 rounded-lg shadow-sm">
          <table className="min-w-full table-auto border-collapse text-center">
            <thead className="sticky top-0 bg-purple-700 text-white text-sm z-10">
              <tr>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Unit</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Line</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Issue Date</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Version</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Mixing No</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Mixing</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Blend%</th>
                
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">No of Lots</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Total Bales</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Bale Change%</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Lot Change%</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">UHML</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">MIC</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Str</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Rd</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">+b</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">SFI</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">UI</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Elong</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Trash</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">Moist%</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">MinMIC</th>
                <th className="px-3 py-2 border border-gray-300 whitespace-nowrap">MinMIC%</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row, idx) => (
                <tr key={`${row.mixing_no}-${row.cotton}-${row.issue_date}-${idx}`} className="even:bg-gray-100 text-sm">
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.unit}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.line}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">
                    {formatIssueDate(row.issue_date, filters.report_type)}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.cotton}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.mixing_no}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.mixing || "-"}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.blend_percent || "-"}</td>
                 
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.no_of_lots || 0}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.total_bales}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">
                    {row.bale_change_over_percent !== null && row.bale_change_over_percent !== undefined
                      ? `${Number(row.bale_change_over_percent).toFixed(2)}%`
                      : "-"}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">
                    {row.lot_change_over_percent !== null && row.lot_change_over_percent !== undefined
                      ? `${Number(row.lot_change_over_percent).toFixed(2)}%`
                      : "-"}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.uhml?.toFixed(1)}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.mic?.toFixed(2)}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.str?.toFixed(1)}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.rd?.toFixed(1)}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.plus_b?.toFixed(1)}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.sf?.toFixed(1)}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.ui?.toFixed(1)}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.elong?.toFixed(1)}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.trash?.toFixed(1)}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">{row.moist?.toFixed(1)}</td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">
                    {row.min_mic !== null && row.min_mic !== undefined && row.min_mic !== ""
                      ? Number(row.min_mic).toFixed(2)
                      : "-"}
                  </td>
                  <td className="px-3 py-2 border border-gray-200 whitespace-nowrap">
                    {row.min_mic_percent !== null &&
                    row.min_mic_percent !== undefined &&
                    row.min_mic_percent !== ""
                      ? Number(row.min_mic_percent).toFixed(1)
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

          {/* BOTTOM Notification Footer */}
          {summaryData.length > DISPLAY_ROWS_LIMIT && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#111827',
              border: '2px dashed #f59e0b',
              borderRadius: '8px',
              color: '#f9fafb',
              textAlign: 'center',
              fontSize: '14px',
              fontWeight: '700',
              letterSpacing: '0.05em',
              boxShadow: '0 8px 20px rgba(0,0,0,0.35)'
            }}>
              ⚠️ <span style={{ color: '#fbbf24', textTransform: 'uppercase' }}>Display limited:</span> Showing only the first {DISPLAY_ROWS_LIMIT} rows. Remaining {summaryData.length - DISPLAY_ROWS_LIMIT} rows are available via the Excel/PDF download buttons above.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export default Summary;
