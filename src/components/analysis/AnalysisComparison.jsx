import { useCallback, useEffect, useMemo, useState } from "react";

const BASE_FILTER_STATE = {
  from_date: "",
  to_date: "",
  report_type: "daily",
  parameter: "",
};

const REPORT_TYPE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const METRIC_CONFIG = [
  { key: "uhml", label: "UHML (mm)", decimals: 1 },
  { key: "str", label: "STR (g/tex)", decimals: 1 },
  { key: "mic", label: "MIC", decimals: 2 },
  { key: "rd", label: "Rd", decimals: 1 },
  { key: "plus_b", label: "+b", decimals: 1 },
  { key: "sf", label: "SF", decimals: 1 },
  { key: "ui", label: "UI", decimals: 1 },
  { key: "elong", label: "Elong", decimals: 1 },
  { key: "trash", label: "Trash", decimals: 1 },
  { key: "moist", label: "Moist%", decimals: 1 },
  { key: "min_mic", label: "Min MIC", decimals: 2 },
  { key: "min_mic_percent", label: "Min MIC%", decimals: 1 },
  { key: "blend_percent", label: "Blend%", decimals: 1 },
  { key: "no_of_lots", label: "No of Lots", decimals: 0 },
  { key: "total_bales", label: "Total Bales", decimals: 0 },
  { key: "bale_change_over_percent", label: "Bale Change%", decimals: 2 },
  { key: "lot_change_over_percent", label: "Lot Change%", decimals: 2 },
];

const METRIC_LOOKUP = Object.fromEntries(METRIC_CONFIG.map((metric) => [metric.key, metric]));

const getMetricKeyFromOption = (value) => METRIC_LOOKUP[value] ? value : "";

const formatIssueDate = (issueDate, reportType) => {
  if (!issueDate) return "-";
  const value = String(issueDate);

  if (reportType === "weekly") {
    const match = value.toUpperCase().match(/^(\d{4})-(\d{2})-W(\d{1,2})$/);
    if (!match) return value;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const week = Number(match[3]);
    if (Number.isNaN(month) || Number.isNaN(week)) return value;

    const totalDays = new Date(year, month, 0).getDate();
    const startDay = (week - 1) * 7 + 1;
    const endDay = Math.min(week * 7, totalDays);
    const monthLabel = new Date(year, month - 1).toLocaleString("en", { month: "short" });

    return `${startDay.toString().padStart(2, "0")}-${endDay.toString().padStart(2, "0")} ${monthLabel}`;
  }

  if (reportType === "monthly") {
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (!match) return value;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const monthLabel = new Date(year, month - 1).toLocaleString("en", { month: "short" });
    if (!monthLabel) return value;
    return `${monthLabel} ${year}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear().toString().slice(-2);
  return `${day}-${month}-${year}`;
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
};

const cloneFilters = (source = BASE_FILTER_STATE) => ({
  from_date: source.from_date ?? "",
  to_date: source.to_date ?? "",
  report_type: source.report_type ?? "daily",
  parameter: source.parameter ?? "",
});

function AnalysisComparison() {
  const [filters, setFilters] = useState(cloneFilters());
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [parameterOptions, setParameterOptions] = useState([]);
  const [tableRows, setTableRows] = useState([]);
  const [units, setUnits] = useState([]);
  const [hasApplied, setHasApplied] = useState(false);

  const hasFiltersApplied = useMemo(() => {
    if (!filters.from_date || !filters.to_date) return false;
    if (!filters.parameter) return false;
    return true;
  }, [filters.from_date, filters.to_date, filters.parameter]);

  const validateFilters = useCallback(() => {
    const errors = {};

    if (!filters.from_date || !filters.to_date) {
      errors.date = "Please select both From and To issue dates.";
    } else if (new Date(filters.from_date) > new Date(filters.to_date)) {
      errors.date = "From date cannot be later than To date.";
    }

    if (!filters.parameter) {
      errors.parameter = "Please select a parameter.";
    }

    return errors;
  }, [filters.from_date, filters.to_date, filters.parameter]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    if (name === "from_date" || name === "to_date") {
      setFieldErrors((prev) => ({ ...prev, date: "" }));
    }
  };

  const handleParameterChange = (event) => {
    const nextKey = getMetricKeyFromOption(event.target.value);
    setFilters((prev) => ({ ...prev, parameter: nextKey }));
    setFieldErrors((prev) => ({ ...prev, parameter: "" }));
  };

  const handleReportTypeChange = (event) => {
    const nextReportType = event.target.value;
    setFilters((prev) => ({ ...prev, report_type: nextReportType }));
    setTableRows([]);
    setUnits([]);
    setHasApplied(false);
    setRequestError("");
  };

  const handleReset = () => {
    setFilters(cloneFilters());
    setFieldErrors({});
    setRequestError("");
    setTableRows([]);
    setUnits([]);
    setHasApplied(false);
  };

  useEffect(() => {
    setParameterOptions(METRIC_CONFIG.map((metric) => ({ key: metric.key, label: metric.label })));
  }, []);

  const applyFilters = useCallback(async () => {
    const validation = validateFilters();
    setFieldErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }

    setLoading(true);
    setRequestError("");
    setHasApplied(true);

    try {
      const params = new URLSearchParams({
        from_date: filters.from_date,
        to_date: filters.to_date,
        report_type: filters.report_type,
        parameter: filters.parameter,
      });
      const baseUrl = process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";
      const response = await fetch(`${baseUrl}/api/cotton-mixing-summary?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const json = await response.json();
      if (!Array.isArray(json)) {
        throw new Error("Unexpected response format from summary endpoint");
      }

      const rowsByIssueDate = new Map();
      const collectedUnits = new Set();

      json.forEach((item) => {
        const issueDate = item?.issue_date;
        if (!issueDate) {
          return;
        }

        const aggregationKey = String(issueDate);
        if (!rowsByIssueDate.has(aggregationKey)) {
          rowsByIssueDate.set(aggregationKey, { issue_date: aggregationKey, values: {} });
        }

        const entry = rowsByIssueDate.get(aggregationKey);
        const unitKey = item?.unit ? String(item.unit) : null;
        if (!unitKey) {
          return;
        }

        collectedUnits.add(unitKey);

        const rawValue = item?.[filters.parameter];
        const parsedValue = parseNumber(rawValue);
        entry.values[unitKey] = parsedValue;
      });

      setUnits(Array.from(collectedUnits));
      setTableRows(Array.from(rowsByIssueDate.values()));
    } catch (error) {
      console.error("Error fetching comparison data", error);
      setRequestError("Failed to load comparison data. Please try again.");
      setTableRows([]);
      setUnits([]);
    }

    setLoading(false);
  }, [filters.from_date, filters.to_date, filters.parameter, filters.report_type, validateFilters]);

  const handleApply = () => {
    if (loading) return;
    applyFilters();
  };

  const currentMetricLabel = useMemo(() => {
    if (!filters.parameter) return "Parameter";
    return METRIC_LOOKUP[filters.parameter]?.label ?? filters.parameter;
  }, [filters.parameter]);

  const sortedUnits = useMemo(() => {
    const unitSet = new Set(units?.filter((unit) => unit !== undefined && unit !== null).map(String));
    return Array.from(unitSet).sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    });
  }, [units]);

  const renderedRows = useMemo(() => {
    if (!hasApplied || tableRows.length === 0 || sortedUnits.length === 0) return [];

    return tableRows.map((row) => {
      const issueDateLabel = formatIssueDate(row?.issue_date, filters.report_type);
      const valuesByUnit = sortedUnits.map((unit) => {
        const value = parseNumber(row?.values?.[unit]);
        if (value === null) return "-";
        const decimals = METRIC_LOOKUP[filters.parameter]?.decimals;
        return Number.isFinite(decimals) ? value.toFixed(decimals) : value;
      });
      return {
        issueDateLabel,
        valuesByUnit,
      };
    });
  }, [filters.parameter, filters.report_type, hasApplied, sortedUnits, tableRows]);

  const unitHeaders = useMemo(() => {
    if (!hasApplied || tableRows.length === 0) return [];
    return sortedUnits;
  }, [hasApplied, sortedUnits, tableRows.length]);

  const parameterSelectOptions = useMemo(() => {
    if (parameterOptions.length > 0) return parameterOptions;
    return METRIC_CONFIG.map((metric) => ({ key: metric.key, label: metric.label }));
  }, [parameterOptions]);

  const feedbackMessage = useMemo(() => {
    if (loading) return "Loading comparison data...";
    if (requestError) return requestError;
    if (hasApplied) {
      if (tableRows.length === 0 && hasFiltersApplied) {
        return "No data found for the selected filters.";
      }
      return "";
    }
    return "Select filters and click Apply to see comparison data.";
  }, [hasApplied, hasFiltersApplied, loading, requestError, tableRows.length]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-6 lg:flex-row lg:items-end">
          <div className="grid w-full gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-600" htmlFor="comparison-from-date">
                Issue Date (From)
              </label>
              <input
                id="comparison-from-date"
                type="date"
                name="from_date"
                value={filters.from_date}
                onChange={handleInputChange}
                className={`rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 ${
                  fieldErrors.date ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:border-purple-500"
                }`}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-600" htmlFor="comparison-to-date">
                Issue Date (To)
              </label>
              <input
                id="comparison-to-date"
                type="date"
                name="to_date"
                value={filters.to_date}
                onChange={handleInputChange}
                className={`rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 ${
                  fieldErrors.date ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:border-purple-500"
                }`}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-600" htmlFor="comparison-report-type">
                Report Type
              </label>
              <select
                id="comparison-report-type"
                name="report_type"
                value={filters.report_type}
                onChange={handleReportTypeChange}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
              >
                {REPORT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-600" htmlFor="comparison-parameter">
                Parameter Selection
              </label>
              <select
                id="comparison-parameter"
                name="parameter"
                value={filters.parameter}
                onChange={handleParameterChange}
                className={`rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 ${
                  fieldErrors.parameter ? "border-red-400 focus:border-red-500" : "border-gray-300 focus:border-purple-500"
                }`}
              >
                <option value="">Select Parameter</option>
                {parameterSelectOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <button
              type="button"
              onClick={handleApply}
              disabled={loading}
              className="rounded-md bg-purple-600 px-6 py-2 text-sm font-semibold text-white shadow hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-300"
            >
              {loading ? "Applying..." : "Apply"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-gray-300 px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Reset
            </button>
          </div>
        </div>

        {(fieldErrors.date || fieldErrors.parameter || requestError) && (
          <div className="flex flex-col gap-2">
            {fieldErrors.date && <p className="text-sm text-red-500">{fieldErrors.date}</p>}
            {fieldErrors.parameter && <p className="text-sm text-red-500">{fieldErrors.parameter}</p>}
            {requestError && !loading && <p className="text-sm text-red-500">{requestError}</p>}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Comparison Table</h3>
          <p className="text-sm text-gray-500">
            Displaying {currentMetricLabel} values grouped by Issue Date ({filters.report_type}).
          </p>
        </div>

        {hasApplied && renderedRows.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-gray-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Issue Date
                  </th>
                  {unitHeaders.map((unit) => (
                    <th
                      key={unit}
                      className="border border-gray-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600"
                    >
                      Unit {unit}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {renderedRows.map((row) => (
                  <tr key={row.issueDateLabel} className="odd:bg-white even:bg-gray-50">
                    <td className="border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800">
                      {row.issueDateLabel}
                    </td>
                    {row.valuesByUnit.map((value, index) => (
                      <td key={index} className="border border-gray-200 px-4 py-3 text-sm text-gray-700">
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
            {feedbackMessage}
          </div>
        )}
      </div>
    </div>
  );
}

export default AnalysisComparison;