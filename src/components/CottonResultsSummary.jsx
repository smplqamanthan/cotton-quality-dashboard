import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const WEEK_BUCKETS = [
  { start: 1, end: 7, label: "1-7" },
  { start: 8, end: 14, label: "8-14" },
  { start: 15, end: 21, label: "15-21" },
  { start: 22, end: 28, label: "22-28" },
  { start: 29, end: 31, label: "29-31" },
];

const METRIC_DEFINITIONS = [
  { key: "no_of_bale", label: "No of Bales", aggregation: "sum" },
  { key: "uhml", label: "UHML", aggregation: "avg" },
  { key: "mic", label: "MIC", aggregation: "avg" },
  { key: "str", label: "Str", aggregation: "avg" },
  { key: "rd", label: "Rd", aggregation: "avg" },
  { key: "plus_b", label: "+b", aggregation: "avg" },
  { key: "sf", label: "SFI", aggregation: "avg" },
  { key: "ui", label: "UI", aggregation: "avg" },
  { key: "elong", label: "Elong", aggregation: "avg" },
  { key: "trash", label: "Trash", aggregation: "avg" },
  { key: "moist", label: "Moist (%)", aggregation: "avg" },
  { key: "min_mic", label: "Min_MIC", aggregation: "avg" },
];

const METRIC_COLUMNS = METRIC_DEFINITIONS.map(({ key, label }) => ({ key, label }));
const SUM_KEYS = METRIC_DEFINITIONS.filter((definition) => definition.aggregation === "sum").map(
  ({ key }) => key
);
const AVG_KEYS = METRIC_DEFINITIONS.filter((definition) => definition.aggregation === "avg").map(
  ({ key }) => key
);

const WEEKLY_COLUMNS = [
  { key: "period_label", label: "Week" },
  { key: "variety", label: "Variety" },
  ...METRIC_COLUMNS,
];

const MONTHLY_COLUMNS = [
  { key: "period_label", label: "Month" },
  { key: "variety", label: "Variety" },
  ...METRIC_COLUMNS,
];

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

const FILTER_FIELD_KEYS = ["lot_no", "variety", "party_name", "station"];

const defaultOptionsState = FILTER_FIELD_KEYS.reduce(
  (accumulator, key) => ({ ...accumulator, [key]: [] }),
  {}
);

const defaultDropdownSearchState = FILTER_FIELD_KEYS.reduce(
  (accumulator, key) => ({ ...accumulator, [key]: "" }),
  {}
);

const baseFilterState = FILTER_FIELD_KEYS.reduce(
  (accumulator, key) => ({ ...accumulator, [key]: [] }),
  { from_date: "", to_date: "", report_type: "Daily" }
);

const cloneFilters = (source = baseFilterState) => ({
  from_date: source?.from_date ?? "",
  to_date: source?.to_date ?? "",
  report_type: source?.report_type ?? "Daily",
  ...FILTER_FIELD_KEYS.reduce((accumulator, key) => {
    const value = source?.[key];
    accumulator[key] = Array.isArray(value) ? [...value] : [];
    return accumulator;
  }, {}),
});

const buildFiltersSummaryText = (reportType, selections = baseFilterState) => {
  const parts = [];
  if (selections.from_date) parts.push(`From: ${selections.from_date}`);
  if (selections.to_date) parts.push(`To: ${selections.to_date}`);

  const listFormatter = (label, values) => {
    if (Array.isArray(values) && values.length > 0) {
      return `${label}: ${values.join(", ")}`;
    }
    return null;
  };

  const labelMap = {
    lot_no: "Lots",
    variety: "Varieties",
    party_name: "Parties",
    station: "Stations",
  };

  FILTER_FIELD_KEYS.forEach((key) => {
    const formatted = listFormatter(labelMap[key], selections[key]);
    if (formatted) {
      parts.push(formatted);
    }
  });

  if (parts.length === 0) {
    return `Filters: None (Report: ${reportType})`;
  }

  return `Filters: ${parts.join(" | ")} (Report: ${reportType})`;
};

const defaultFilters = cloneFilters();

function CottonResultsSummary({
  dailyColumns,
  formatDate,
  setExportData,
  onExportToExcel,
  onExportToPDF,
  onExportContextChange,
}) {
  const [filters, setFilters] = useState(cloneFilters());
  const [options, setOptions] = useState({
    lot_no: [],
    variety: [],
    station: [],
    party_name: [],
  });
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tableVisible, setTableVisible] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [dropdownSearch, setDropdownSearch] = useState({});
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [hasAppliedFilters, setHasAppliedFilters] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchFilterOptions = useCallback(async (filterState = {}) => {
    const params = new URLSearchParams();
    if (filterState.from_date) params.append("from_date", filterState.from_date);
    if (filterState.to_date) params.append("to_date", filterState.to_date);

    FILTER_FIELD_KEYS.forEach((key) => {
      const value = filterState[key];
      if (Array.isArray(value) && value.length > 0) {
        params.append(key, JSON.stringify(value));
      }
    });

    const response = await fetch(`https://cotton-api-ekdn.onrender.com/api/cotton-results/filters?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Failed to load cotton result filters");
    }
    return response.json();
  }, []);

  const refreshFilterOptions = useCallback(
    async (nextFilters, force = false) => {
      if (!force && !hasAppliedFilters) {
        setOptions(defaultOptionsState);
        setOptionsError("");
        return;
      }

      const stateToUse = nextFilters ? cloneFilters(nextFilters) : cloneFilters(filters);
      setLoadingOptions(true);
      setOptionsError("");
      try {
        const optionsResponse = await fetchFilterOptions(stateToUse);
        setOptions({
          lot_no: optionsResponse.lot_options ?? [],
          variety: optionsResponse.variety_options ?? [],
          station: optionsResponse.station_options ?? [],
          party_name: optionsResponse.party_options ?? [],
        });
      } catch (err) {
        console.error("Error loading filter options:", err);
        setOptionsError("Unable to load filter options for the selected filters.");
        setOptions(defaultOptionsState);
      } finally {
        setLoadingOptions(false);
      }
    },
    [fetchFilterOptions, filters, hasAppliedFilters]
  );

  const canSubmit = useMemo(() => {
    const { from_date, to_date, lot_no, variety, party_name, station } = filters;
    return Boolean(
      from_date ||
        to_date ||
        (Array.isArray(lot_no) ? lot_no.length > 0 : lot_no) ||
        (Array.isArray(variety) ? variety.length > 0 : variety) ||
        (Array.isArray(party_name) ? party_name.length > 0 : party_name) ||
        (Array.isArray(station) ? station.length > 0 : station)
    );
  }, [filters]);

  const handleDateChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setHasAppliedFilters(false);
    setOptions(defaultOptionsState);
    setOptionsError("");
    setOpenDropdown(null);
  };

  const handleReportTypeChange = (event) => {
    const { value } = event.target;
    setFilters((prev) => ({ ...prev, report_type: value }));
    setData([]);
    setTableVisible(false);
    setExportData([]);
    setOptions(defaultOptionsState);
    setDropdownSearch(defaultDropdownSearchState);
    setOptionsError("");
    setHasAppliedFilters(false);
    setOpenDropdown(null);
  };

  const handleDropdownToggle = (name) => {
    setOpenDropdown((prev) => {
      const next = prev === name ? null : name;
      if (next) {
        setDropdownSearch((prevSearch) => ({ ...prevSearch, [next]: prevSearch[next] ?? "" }));
      }
      return next;
    });
  };

  const handleDropdownSearchChange = (name, value) => {
    setDropdownSearch((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (name, value) => {
    setFilters((prev) => {
      const current = Array.isArray(prev[name]) ? prev[name] : [];
      const exists = current.includes(value);
      const updated = exists
        ? current.filter((item) => item !== value)
        : [...current, value];
      return { ...prev, [name]: updated };
    });
  };

  const handleSelectAll = (name) => {
    setFilters((prev) => {
      const available = options[name] || [];
      const current = Array.isArray(prev[name]) ? prev[name] : [];
      const updated = current.length === available.length ? [] : [...available];
      return { ...prev, [name]: updated };
    });
  };

  const buildFilterParams = useCallback(
    (sourceFilters = filters) => {
      const params = new URLSearchParams();
      if (sourceFilters.from_date) params.append("from_date", sourceFilters.from_date);
      if (sourceFilters.to_date) params.append("to_date", sourceFilters.to_date);

      FILTER_FIELD_KEYS.forEach((key) => {
        const value = sourceFilters[key];
        if (Array.isArray(value) && value.length > 0) {
          params.append(key, JSON.stringify(value));
        }
      });

      return params;
    },
    [filters]
  );

  const computePeriodMeta = (date, reportType) => {
    if (reportType === "Weekly") {
      const day = date.getDate();
      const bucket = WEEK_BUCKETS.find(({ start, end }) => day >= start && day <= end) || WEEK_BUCKETS[0];
      const monthLabel = monthFormatter.format(date);
      const bucketStartDate = new Date(date.getFullYear(), date.getMonth(), bucket.start);
      return {
        label: `${bucket.label} ${monthLabel}`,
        sortKey: bucketStartDate.getTime() + bucket.start,
      };
    }

    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    return {
      label: monthFormatter.format(date),
      sortKey: monthStart.getTime(),
    };
  };

  const aggregateRecords = (records, reportType) => {
    const grouped = new Map();

    records.forEach((item) => {
      if (!item.lot_received_date || !item.variety) {
        return;
      }

      const date = new Date(item.lot_received_date);
      if (Number.isNaN(date.getTime())) {
        return;
      }

      const { label: periodLabel, sortKey: sortKey } = computePeriodMeta(date, reportType);
      const normalizedVariety = item.variety?.trim() || "Unspecified";
      const groupKey = `${periodLabel}__${normalizedVariety}`;
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          period_label: periodLabel,
          period_sort_key: sortKey,
          variety: normalizedVariety,
          ...Object.fromEntries(
            METRIC_DEFINITIONS.map(({ key, aggregation }) => [
              key,
              aggregation === "sum" ? 0 : { total: 0, weight: 0 },
            ])
          ),
        });
      }

      const bucket = grouped.get(groupKey);
      const baleCount = Number(item.no_of_bale) || 0;

      METRIC_DEFINITIONS.forEach(({ key, aggregation }) => {
        const value = Number(item[key]);
        if (Number.isNaN(value)) {
          return;
        }

        if (aggregation === "sum") {
          bucket[key] += value;
        } else if (aggregation === "avg") {
          bucket[key].total += value * baleCount;
          bucket[key].weight += baleCount;
        }
      });
    });

    return Array.from(grouped.values()).map((entry) => {
      const result = {
        period_label: entry.period_label,
        period_sort_key: entry.period_sort_key,
        variety: entry.variety,
        ...Object.fromEntries(SUM_KEYS.map((key) => [key, entry[key]])),
      };

      AVG_KEYS.forEach((key) => {
        const { total, weight } = entry[key];
        if (weight > 0) {
          result[key] = total / weight;
        } else {
          result[key] = null;
        }
      });

      return result;
    });
  };

  const sortAggregatedData = (records) => {
    const sorted = [...records].sort((a, b) => {
      const sortKeyA = a.period_sort_key ?? 0;
      const sortKeyB = b.period_sort_key ?? 0;
      if (sortKeyA !== sortKeyB) {
        return sortKeyA - sortKeyB;
      }
      return (a.variety || "").localeCompare(b.variety || "", undefined, {
        sensitivity: "base",
      });
    });

    return sorted.map(({ period_sort_key, ...rest }) => rest);
  };

  const formatMetricValue = (value, key) => {
    if (value === null || value === undefined || value === "") {
      return "-";
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return value;
    }

    if (SUM_KEYS.includes(key)) {
      return Number.isInteger(numericValue) ? numericValue : numericValue.toFixed(2);
    }

    return numericValue.toFixed(2);
  };

  const updateExportContext = (reportType, currentSelections = cloneFilters()) => {
    if (typeof onExportContextChange === "function") {
      const summaryText = buildFiltersSummaryText(reportType, currentSelections);
      const columnsToUse =
        reportType === "Daily" ? dailyColumns : reportType === "Weekly" ? WEEKLY_COLUMNS : MONTHLY_COLUMNS;
      onExportContextChange({ columns: columnsToUse, filtersSummary: summaryText, selections: currentSelections });
    }
  };

  const applyFilters = useCallback(async () => {
    if (!canSubmit) {
      alert("Please select at least one filter before applying.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const params = buildFilterParams();
      const response = await fetch(
        `https://cotton-api-ekdn.onrender.com/api/cotton-results?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch cotton results");
      }
      const json = await response.json();
      const activeReportType = filters.report_type;
      const currentSelections = cloneFilters(filters);

      if (activeReportType === "Daily") {
        const sorted = [...json].sort((a, b) => {
          const varietyComparison = (a.variety || "").localeCompare(b.variety || "", undefined, {
            sensitivity: "base",
          });
          if (varietyComparison !== 0) {
            return varietyComparison;
          }
          const dateA = a.lot_received_date ? new Date(a.lot_received_date).getTime() : 0;
          const dateB = b.lot_received_date ? new Date(b.lot_received_date).getTime() : 0;
          return dateA - dateB;
        });
        setData(sorted);
        setTableVisible(true);
        setExportData(sorted);
        updateExportContext("Daily", currentSelections);
      } else {
        const aggregated = aggregateRecords(json, activeReportType);
        const sortedAggregated = sortAggregatedData(aggregated);
        setData(sortedAggregated);
        setTableVisible(true);
        setExportData(sortedAggregated);
        updateExportContext(activeReportType, currentSelections);
      }

      setHasAppliedFilters(true);
      await refreshFilterOptions(filters, true);
    } catch (err) {
      console.error("Error fetching cotton results:", err);
      setError("Unable to load cotton results with the selected filters.");
      setData([]);
      setTableVisible(false);
      setExportData([]);
    } finally {
      setLoading(false);
    }
  }, [buildFilterParams, canSubmit, filters, setExportData]);

  const resetFilters = () => {
    const resetState = cloneFilters();
    setFilters(resetState);
    setData([]);
    setTableVisible(false);
    setExportData([]);
    setError("");
    setHasAppliedFilters(false);
    setOptions(defaultOptionsState);
    setOptionsError("");
    setOpenDropdown(null);
    updateExportContext("Daily", resetState);
  };

  const renderMultiSelect = (label, name) => {
    const isOpen = openDropdown === name;
    const values = options[name] || [];
    const mapOptionToLabel = (optionValue) => {
      if (name === "variety" && optionValue) {
        const varietyOption = options.variety.find((entry) => entry?.value === optionValue);
        return typeof varietyOption?.label === "string" ? varietyOption.label : optionValue;
      }

      if (optionValue && typeof optionValue === "object") {
        return optionValue.label ?? optionValue.value ?? "";
      }

      return optionValue ?? "";
    };
    const selections = Array.isArray(filters[name]) ? filters[name] : [];
    const searchTerm = dropdownSearch[name] ?? "";
    const normalizedSearch = searchTerm.toLowerCase().trim();
    const filteredValues = values
      .map((option) => (typeof option === "object" && option !== null ? option.value : option))
      .filter((optionValue) => {
        const label = mapOptionToLabel(optionValue);
        return typeof label === "string" && label.toLowerCase().includes(normalizedSearch);
      });
    const allSelected = selections.length === values.length && values.length > 0;

    const displayLabel =
      name === "variety"
        ? label.replace(/Variety/i, "Cotton Year")
        : label;

    return (
      <div className="relative" ref={isOpen ? dropdownRef : null}>
        <label className="text-sm font-semibold text-gray-600">
          {displayLabel}
        </label>
        <button
          type="button"
          onClick={() => handleDropdownToggle(name)}
          className="mt-1 flex w-full items-center justify-between rounded border border-gray-300 px-3 py-2 text-left text-sm hover:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <span className="truncate">
            {(() => {
              if (selections.length === 0) {
                return `Select ${displayLabel}`;
              }
              if (allSelected) {
                return name === "variety" ? "All cotton years selected" : `All ${label}s selected`;
              }
              const mappedSelections = selections.map((item) => mapOptionToLabel(item));
              return name === "variety"
                ? mappedSelections.join(", ")
                : `${selections.length} selected`;
            })()}
          </span>
          <svg
            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => handleSelectAll(name)}
                className="h-4 w-4"
              />
              <span className="text-sm font-semibold text-purple-700">Select All</span>
            </div>
            <div className="border-b px-3 py-2">
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => handleDropdownSearchChange(name, event.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder={`Search ${displayLabel.toLowerCase()}`}
              />
            </div>
            {values.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-500">No options</p>
            ) : filteredValues.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-500">No matches found</p>
            ) : (
              filteredValues.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-purple-50"
                >
                  <input
                    type="checkbox"
                    checked={selections.includes(option)}
                    onChange={() => handleCheckboxChange(name, option)}
                    className="h-4 w-4"
                  />
                  <span className="truncate">{mapOptionToLabel(option)}</span>
                </label>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-600" htmlFor="from_date">
              From Date
            </label>
            <input
              id="from_date"
              type="date"
              name="from_date"
              value={filters.from_date}
              onChange={handleDateChange}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-600" htmlFor="to_date">
              To Date
            </label>
            <input
              id="to_date"
              type="date"
              name="to_date"
              value={filters.to_date}
              onChange={handleDateChange}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-600" htmlFor="report_type">
              Report Type
            </label>
            <select
              id="report_type"
              name="report_type"
              value={filters.report_type}
              onChange={handleReportTypeChange}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onExportToExcel}
            className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-green-700"
            disabled={data.length === 0}
          >
            Excel
          </button>
          <button
            type="button"
            onClick={onExportToPDF}
            className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-700"
            disabled={data.length === 0}
          >
            PDF
          </button>
        </div>
      </div>

      {loadingOptions ? (
        <p className="text-sm text-purple-700">Loading filter options...</p>
      ) : optionsError ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {optionsError}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {renderMultiSelect("Lot No", "lot_no")}
          {renderMultiSelect("Variety", "variety")}
          {renderMultiSelect("Party Name", "party_name")}
          {renderMultiSelect("Station", "station")}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={applyFilters}
          className="rounded bg-purple-700 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-purple-800 disabled:bg-purple-300"
          disabled={loading || !canSubmit}
        >
          {loading ? "Applying..." : "Apply"}
        </button>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-100"
          disabled={loading}
        >
          Reset
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {tableVisible && (
        data.length === 0 ? (
          <div className="rounded border border-gray-200 bg-gray-50 px-4 py-6 text-center text-gray-500">
            No results found for the selected filters.
          </div>
        ) : filters.report_type === "Daily" ? (
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full table-auto border-collapse text-sm">
              <thead className="sticky top-0 bg-purple-700 text-left text-xs uppercase tracking-wider text-white">
                <tr>
                  {dailyColumns.map((column) => (
                    <th key={column.key} className="border border-purple-200 px-3 py-2">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={`${row.lot_no}-${row.lot_received_date}`} className="even:bg-purple-50">
                    {dailyColumns.map((column) => (
                      <td key={column.key} className="border border-purple-100 px-3 py-2 whitespace-nowrap">
                        {column.key === "lot_received_date"
                          ? formatDate(row[column.key])
                          : row[column.key] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full table-auto border-collapse text-sm">
              <thead className="sticky top-0 bg-purple-700 text-left text-xs uppercase tracking-wider text-white">
                <tr>
                  {(filters.report_type === "Weekly" ? WEEKLY_COLUMNS : MONTHLY_COLUMNS).map((column) => (
                    <th key={column.key} className="border border-purple-200 px-3 py-2">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, index) => (
                  <tr key={`${row.period_label}-${row.variety}-${index}`} className="even:bg-purple-50">
                    {(filters.report_type === "Weekly" ? WEEKLY_COLUMNS : MONTHLY_COLUMNS).map((column) => (
                      <td key={column.key} className="border border-purple-100 px-3 py-2 whitespace-nowrap">
                        {column.key === "period_label"
                          ? row[column.key]
                          : column.key === "cotton"
                          ? row[column.key] ?? "-"
                          : formatMetricValue(row[column.key], column.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

export default CottonResultsSummary;