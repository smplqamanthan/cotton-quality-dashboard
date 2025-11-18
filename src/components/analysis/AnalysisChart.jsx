import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, ChartDataLabels);

const METRIC_CONFIG = [
  { key: "uhml", label: "UHML (mm)", color: "#7c3aed", background: "rgba(124, 58, 237, 0.15)", decimals: 1 },
  { key: "str", label: "STR (g/tex)", color: "#2563eb", background: "rgba(37, 99, 235, 0.15)", decimals: 1 },
  { key: "mic", label: "MIC", color: "#16a34a", background: "rgba(22, 163, 74, 0.12)", decimals: 2 },
  { key: "rd", label: "Rd", color: "#f97316", background: "rgba(249, 115, 22, 0.12)", decimals: 1 },
  { key: "plus_b", label: "+b", color: "#0ea5e9", background: "rgba(14, 165, 233, 0.12)", decimals: 1 },
  { key: "sf", label: "SF", color: "#ec4899", background: "rgba(236, 72, 153, 0.12)", decimals: 1 },
  { key: "ui", label: "UI", color: "#facc15", background: "rgba(250, 204, 21, 0.18)", decimals: 1 },
  { key: "elong", label: "Elong", color: "#14b8a6", background: "rgba(20, 184, 166, 0.12)", decimals: 1 },
  { key: "trash", label: "Trash", color: "#b91c1c", background: "rgba(185, 28, 28, 0.12)", decimals: 1 },
  { key: "moist", label: "Moist%", color: "#8b5cf6", background: "rgba(139, 92, 246, 0.12)", decimals: 1 },
  { key: "min_mic", label: "Min MIC", color: "#4ade80", background: "rgba(74, 222, 128, 0.18)", decimals: 2 },
  { key: "min_mic_percent", label: "Min MIC%", color: "#f472b6", background: "rgba(244, 114, 182, 0.12)", decimals: 1 },
  { key: "blend_percent", label: "Blend%", color: "#fb923c", background: "rgba(251, 146, 60, 0.12)", decimals: 1 },
  { key: "no_of_lots", label: "No of Lots", color: "#60a5fa", background: "rgba(96, 165, 250, 0.12)", decimals: 0 },
  { key: "total_bales", label: "Total Bales", color: "#f87171", background: "rgba(248, 113, 113, 0.12)", decimals: 0 },
  { key: "bale_change_over_percent", label: "Bale Change%", color: "#34d399", background: "rgba(52, 211, 153, 0.12)", decimals: 2 },
  { key: "lot_change_over_percent", label: "Lot Change%", color: "#a855f7", background: "rgba(168, 85, 247, 0.12)", decimals: 2 },
];

const DEFAULT_VISIBLE_METRICS = ["uhml", "plus_b", "mic", "rd"];
const METRIC_LOOKUP = Object.fromEntries(METRIC_CONFIG.map((metric) => [metric.key, metric]));

const DATA_LABEL_FORMATTER = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const Y_AXIS_HEADROOM_FACTOR = 0.15;

const BASE_FILTER_STATE = {
  from_date: "",
  to_date: "",
  unit: [],
  line: [],
  cotton: [],
  mixing: [],
  report_type: "daily",
};

const BASE_OPTIONS_STATE = {
  units: [],
  lines: [],
  cottons: [],
  mixings: [],
};

const cloneFilters = (source = BASE_FILTER_STATE) => ({
  from_date: source.from_date ?? "",
  to_date: source.to_date ?? "",
  unit: Array.isArray(source.unit) ? [...source.unit] : [],
  line: Array.isArray(source.line) ? [...source.line] : [],
  cotton: Array.isArray(source.cotton) ? [...source.cotton] : [],
  mixing: Array.isArray(source.mixing) ? [...source.mixing] : [],
  report_type: source.report_type ?? "daily",
});

const parseNumericValue = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return null;
  return numeric;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const getIssueDateSortTuple = (issueDate, reportType) => {
  const value = String(issueDate ?? "").toUpperCase();

  if (reportType === "daily") {
    const timestamp = new Date(value).getTime();
    return [Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp];
  }

  if (reportType === "weekly") {
    const match = value.match(/^(\d{4})-(\d{2})-W(\d{1,2})$/);
    if (!match) return [Number.POSITIVE_INFINITY];
    const year = Number(match[1]);
    const month = Number(match[2]);
    const week = Number(match[3]);
    return [
      Number.isNaN(year) ? Number.POSITIVE_INFINITY : year,
      Number.isNaN(month) ? Number.POSITIVE_INFINITY : month,
      Number.isNaN(week) ? Number.POSITIVE_INFINITY : week,
    ];
  }

  if (reportType === "monthly") {
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (!match) return [Number.POSITIVE_INFINITY];
    const year = Number(match[1]);
    const month = Number(match[2]);
    return [
      Number.isNaN(year) ? Number.POSITIVE_INFINITY : year,
      Number.isNaN(month) ? Number.POSITIVE_INFINITY : month,
    ];
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
    const monthLabel = MONTH_NAMES[month - 1] ?? "";

    return `${startDay.toString().padStart(2, "0")}-${endDay.toString().padStart(2, "0")} ${monthLabel}`;
  }

  if (reportType === "monthly") {
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (!match) return value;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const monthLabel = MONTH_NAMES[month - 1];
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

function AnalysisChart() {
  const [filters, setFilters] = useState(cloneFilters());
  const [options, setOptions] = useState(BASE_OPTIONS_STATE);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [chartRows, setChartRows] = useState([]);
  const [visibleMetrics, setVisibleMetrics] = useState(DEFAULT_VISIBLE_METRICS);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const dropdownRefs = useRef({});

  useEffect(() => {
    setOptions(BASE_OPTIONS_STATE);
  }, []);

  const fetchFilterOptions = useCallback(async (state = {}) => {
    const params = new URLSearchParams();
    if (state.from_date) params.append("from_date", state.from_date);
    if (state.to_date) params.append("to_date", state.to_date);
    if (Array.isArray(state.unit) && state.unit.length > 0) params.append("unit", JSON.stringify(state.unit));
    if (Array.isArray(state.line) && state.line.length > 0) params.append("line", JSON.stringify(state.line));
    if (Array.isArray(state.cotton) && state.cotton.length > 0) params.append("cotton", JSON.stringify(state.cotton));
    if (Array.isArray(state.mixing) && state.mixing.length > 0) params.append("mixing", JSON.stringify(state.mixing));

    const queryString = params.toString();
    const baseUrl = process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";
    const url = queryString
      ? `${baseUrl}/api/filter-options?${queryString}`
      : `${baseUrl}/api/filter-options`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Unable to load filter options (status ${response.status})`);
    }

    return response.json();
  }, []);

  const hasSelectedDateRange = useMemo(() => Boolean(filters.from_date) && Boolean(filters.to_date), [filters.from_date, filters.to_date]);

  useEffect(() => {
    if (!hasSelectedDateRange) {
      setOptions(BASE_OPTIONS_STATE);
      return;
    }

    let isMounted = true;

    const fetchOptionsForDateRange = async () => {
      setLoadingOptions(true);

      try {
        const optionResponse = await fetchFilterOptions(filters);
        if (isMounted) {
          setOptions({
            units: optionResponse?.units ?? [],
            lines: optionResponse?.lines ?? [],
            cottons: optionResponse?.cottons ?? [],
            mixings: optionResponse?.mixings ?? [],
          });
        }
      } catch (error) {
        console.error("Error fetching filter options", error);
        if (isMounted) {
          setOptions(BASE_OPTIONS_STATE);
        }
      } finally {
        if (isMounted) {
          setLoadingOptions(false);
        }
      }
    };

    fetchOptionsForDateRange();

    return () => {
      isMounted = false;
    };
  }, [filters, hasSelectedDateRange, fetchFilterOptions]);

  useEffect(() => {
    setOptions(BASE_OPTIONS_STATE);
    setRequestError("");
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!openDropdown) return;
      const currentRef = dropdownRefs.current[openDropdown];
      if (currentRef && !currentRef.contains(event.target)) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openDropdown]);

  const setDropdownRef = (name) => (element) => {
    if (element) {
      dropdownRefs.current[name] = element;
    } else {
      delete dropdownRefs.current[name];
    }
  };

  const canApply =
    Boolean(filters.from_date) &&
    Boolean(filters.to_date) &&
    filters.unit.length > 0 &&
    filters.line.length > 0 &&
    !loadingOptions;

  const validateFilters = () => {
    const errors = {};

    if (!filters.from_date || !filters.to_date) {
      errors.date = "Please choose both From and To dates.";
    } else if (new Date(filters.from_date) > new Date(filters.to_date)) {
      errors.date = "From date cannot be later than To date.";
    }

    if (filters.unit.length === 0) {
      errors.unit = "Select at least one Unit.";
    }

    if (filters.line.length === 0) {
      errors.line = "Select at least one Line.";
    }

    return errors;
  };

  const handleCheckboxChange = (name, value) => {
    setFilters((prev) => ({
      ...prev,
      [name]: prev[name].includes(value)
        ? prev[name].filter((item) => item !== value)
        : [...prev[name], value],
    }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSelectAll = (name, values) => {
    setFilters((prev) => ({
      ...prev,
      [name]: prev[name].length === values.length ? [] : [...values],
    }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    if (name === "from_date" || name === "to_date") {
      setFieldErrors((prev) => ({ ...prev, date: "" }));
    }
  };

  const handleReportTypeChange = (event) => {
    const { value } = event.target;
    setFilters((prev) => ({ ...prev, report_type: value }));
  };

  const handleMetricToggle = (key) => {
    setVisibleMetrics((prev) =>
      prev.includes(key) ? prev.filter((metric) => metric !== key) : [...prev, key]
    );
  };

  const handleMetricSelectAll = () => {
    setVisibleMetrics((prev) =>
      prev.length === METRIC_CONFIG.length ? [] : METRIC_CONFIG.map((metric) => metric.key)
    );
  };

  const handleResetFilters = () => {
    setFilters(cloneFilters());
    setFieldErrors({});
    setChartRows([]);
    setVisibleMetrics(DEFAULT_VISIBLE_METRICS);
    setRequestError("");
    setHasFetched(false);
  };

  const handleApplyFilters = async () => {
    const validation = validateFilters();
    setFieldErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }

    setLoading(true);
    setRequestError("");

    try {
      const params = new URLSearchParams({
        from_date: filters.from_date,
        to_date: filters.to_date,
        report_type: filters.report_type,
        unit: JSON.stringify(filters.unit),
        line: JSON.stringify(filters.line),
        cotton: JSON.stringify(filters.cotton),
        mixing: JSON.stringify(filters.mixing),
      });
      const baseUrl = process.env.REACT_APP_API_BASE_URL || "http://localhost:5000";
      const response = await fetch(`${baseUrl}/api/cotton-mixing-summary?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const json = await response.json();
      if (Array.isArray(json)) {
        setChartRows(json);
      } else {
        setChartRows([]);
        console.warn("Unexpected response for chart data", json);
      }
      setHasFetched(true);
    } catch (error) {
      console.error("Error fetching chart data", error);
      setRequestError("Failed to load analysis data. Please try again.");
      setChartRows([]);
      setHasFetched(false);
    }

    setLoading(false);
  };

  const chartData = useMemo(() => {
    if (chartRows.length === 0) {
      return { labels: [], datasets: [] };
    }

    const sortedRows = [...chartRows].sort((a, b) => compareIssueDates(a?.issue_date, b?.issue_date, filters.report_type));

    const aggregationMap = new Map();

    sortedRows.forEach((row) => {
      const key = row?.issue_date ?? "__NO_DATE__";
      if (!aggregationMap.has(key)) {
        aggregationMap.set(key, {
          issue_date: row?.issue_date ?? null,
          total_bales: 0,
          no_of_lots: 0,
          metricSums: {},
          metricCounts: {},
        });
      }

      const bucket = aggregationMap.get(key);
      const totalBalesValue = parseNumericValue(row?.total_bales);
      const lotCountValue = parseNumericValue(row?.no_of_lots);

      bucket.total_bales += totalBalesValue ?? 0;
      bucket.no_of_lots += lotCountValue ?? 0;

      METRIC_CONFIG.forEach((metric) => {
        const value = parseNumericValue(row?.[metric.key]);
        if (value === null) {
          return;
        }
        bucket.metricSums[metric.key] = (bucket.metricSums[metric.key] ?? 0) + value;
        bucket.metricCounts[metric.key] = (bucket.metricCounts[metric.key] ?? 0) + 1;
      });
    });

    const aggregatedRows = Array.from(aggregationMap.values())
      .sort((a, b) => compareIssueDates(a?.issue_date, b?.issue_date, filters.report_type))
      .map((bucket) => {
        const averagedMetrics = METRIC_CONFIG.reduce((acc, metric) => {
          const sum = bucket.metricSums[metric.key] ?? 0;
          const count = bucket.metricCounts[metric.key] ?? 0;
          acc[metric.key] = count > 0 ? Number((sum / count).toFixed(metric.decimals ?? 2)) : null;
          return acc;
        }, {});

        return {
          issue_date: bucket.issue_date,
          total_bales: bucket.total_bales,
          no_of_lots: bucket.no_of_lots,
          ...averagedMetrics,
        };
      });

    const labels = aggregatedRows.map((row) => formatIssueDate(row?.issue_date, filters.report_type));

    const datasets = METRIC_CONFIG.filter((metric) => visibleMetrics.includes(metric.key)).map((metric) => ({
      label: metric.label,
      data: aggregatedRows.map((row) => parseNumericValue(row?.[metric.key])),
      borderColor: metric.color,
      backgroundColor: metric.background,
      borderWidth: 2,
      tension: 0.35,
      pointRadius: 3,
      pointHoverRadius: 5,
      spanGaps: true,
      fill: false,
      metricKey: metric.key,
    }));

    return { labels, datasets };
  }, [chartRows, visibleMetrics, filters.report_type]);

  const yAxisSuggestions = useMemo(() => {
    if (!chartData.datasets || chartData.datasets.length === 0) {
      return { suggestedMin: undefined, suggestedMax: undefined };
    }

    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;

    chartData.datasets.forEach((dataset) => {
      if (!Array.isArray(dataset.data)) {
        return;
      }
      dataset.data.forEach((rawValue) => {
        if (rawValue === null || rawValue === undefined) {
          return;
        }
        const numericValue = Number(rawValue);
        if (Number.isNaN(numericValue)) {
          return;
        }
        if (numericValue < minValue) minValue = numericValue;
        if (numericValue > maxValue) maxValue = numericValue;
      });
    });

    if (minValue === Number.POSITIVE_INFINITY || maxValue === Number.NEGATIVE_INFINITY) {
      return { suggestedMin: undefined, suggestedMax: undefined };
    }

    const range = maxValue - minValue;
    const padding = (range === 0 ? Math.abs(maxValue) || 1 : range) * Y_AXIS_HEADROOM_FACTOR;

    return {
      suggestedMin: minValue - padding,
      suggestedMax: maxValue + padding,
    };
  }, [chartData]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            padding: 16,
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const metric = METRIC_LOOKUP[context.dataset.metricKey] ?? {};
              const value = context.parsed.y;
              if (value === null || value === undefined || Number.isNaN(value)) {
                return `${metric.label ?? context.dataset.label}: N/A`;
              }
              return `${metric.label ?? context.dataset.label}: ${DATA_LABEL_FORMATTER.format(Number(value))}`;
            },
          },
        },
        datalabels: {
          display: true,
          align: "top",
          anchor: "end",
          padding: { top: 4, bottom: 2, left: 6, right: 6 },
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          borderRadius: 6,
          borderWidth: 1,
          borderColor: (context) => context.dataset?.borderColor ?? "#7c3aed",
          color: (context) => context.dataset?.borderColor ?? "#1f2937",
          font: {
            size: 10,
            weight: "600",
          },
          formatter: (value) => {
            if (value === null || value === undefined || Number.isNaN(value)) {
              return "";
            }
            return DATA_LABEL_FORMATTER.format(Number(value));
          },
          clamp: true,
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 35,
            autoSkip: true,
          },
          grid: {
            display: false,
          },
        },
        y: {
          beginAtZero: false,
          ticks: {
            maxTicksLimit: 8,
          },
          grid: {
            color: "rgba(209, 213, 219, 0.3)",
          },
          suggestedMin: yAxisSuggestions.suggestedMin,
          suggestedMax: yAxisSuggestions.suggestedMax,
        },
      },
    }),
    [yAxisSuggestions]
  );

  const renderMultiSelectDropdown = (label, name, values, { required = false, containerClassName = "" } = {}) => {
    const list = Array.isArray(values) ? values : [];
    const selectedCount = filters[name].length;
    const allSelected = list.length > 0 && selectedCount === list.length;
    const isOpen = openDropdown === name;

    return (
      <div className={`relative min-w-[200px] ${containerClassName}`} ref={setDropdownRef(name)}>
        <label className="mb-1 block text-sm font-semibold text-gray-700">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
        <button
          type="button"
          onClick={() => setOpenDropdown((prev) => (prev === name ? null : name))}
          className={`flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-purple-500 ${
            fieldErrors[name] ? "border-red-500" : "border-gray-300 hover:border-purple-400"
          }`}
        >
          <span>
            {selectedCount === 0
              ? `Select ${label}`
              : allSelected
              ? `All ${label}s Selected`
              : `${selectedCount} selected`}
          </span>
          <svg
            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {isOpen && (
          <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
            {list.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No options available</div>
            ) : (
              <>
                <label className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => handleSelectAll(name, list)}
                    className="h-4 w-4"
                  />
                  Select All
                </label>
                {list.map((value) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={filters[name].includes(value)}
                      onChange={() => handleCheckboxChange(name, value)}
                      className="h-4 w-4"
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </>
            )}
          </div>
        )}
        {fieldErrors[name] && <p className="mt-1 text-xs text-red-600">{fieldErrors[name]}</p>}
      </div>
    );
  };

  const noMetricsSelected = visibleMetrics.length === 0;
  const hasChartData = chartData.labels.length > 0 && chartData.datasets.length > 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-black bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
          <div className="lg:col-span-3 xl:col-span-3">
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Issue Date From <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="from_date"
              value={filters.from_date}
              onChange={handleInputChange}
              className={`w-full rounded border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                fieldErrors.date ? "border-red-500" : "border-gray-300"
              }`}
            />
          </div>
          <div className="lg:col-span-3 xl:col-span-3">
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              Issue Date To <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="to_date"
              value={filters.to_date}
              onChange={handleInputChange}
              className={`w-full rounded border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                fieldErrors.date ? "border-red-500" : "border-gray-300"
              }`}
            />
          </div>
          <div className="lg:col-span-3 xl:col-span-3">
            <label className="mb-1 block text-sm font-semibold text-gray-700">Report Type</label>
            <select
              name="report_type"
              value={filters.report_type}
              onChange={handleReportTypeChange}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          {renderMultiSelectDropdown("Variety", "cotton", options.cottons, { containerClassName: "lg:col-span-3 xl:col-span-3" })}
          <div className="lg:col-span-12">
            {fieldErrors.date && <p className="text-xs text-red-600">{fieldErrors.date}</p>}
          </div>
        </div>

        <div className="mt-0 grid gap-4 lg:grid-cols-12">
          {renderMultiSelectDropdown("Unit", "unit", options.units, { required: true, containerClassName: "lg:col-span-3" })}
          {renderMultiSelectDropdown("Line", "line", options.lines, { required: true, containerClassName: "lg:col-span-3" })}
          {renderMultiSelectDropdown("Mixing", "mixing", options.mixings, { containerClassName: "lg:col-span-3" })}
          <div className="flex items-center gap-2 lg:col-span-3">
            <button
              type="button"
              onClick={handleApplyFilters}
              disabled={!canApply || loading}
              className={`rounded-md px-4 py-2 text-sm font-semibold text-white transition ${
                canApply && !loading ? "bg-purple-700 hover:bg-purple-800" : "bg-gray-400 cursor-not-allowed"
              }`}
            >
              {loading ? "Loading..." : "Apply"}
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Reset
            </button>
          </div>
        </div>

        {requestError && (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {requestError}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Trend Analysis</h2>
          <div className="relative flex min-w-[200px] flex-col lg:w-auto" ref={setDropdownRef("metrics")}>
            <span className="sr-only">Metric Selector</span>
            <button
              type="button"
              onClick={() => setOpenDropdown((prev) => (prev === "metrics" ? null : "metrics"))}
              className="flex w-full items-center gap-2 rounded border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <span>
                {visibleMetrics.length === 0
                  ? "No metrics selected"
                  : visibleMetrics.length === METRIC_CONFIG.length
                  ? "All metrics visible"
                  : `${visibleMetrics.length} metrics selected`}
              </span>
              <svg className={`h-4 w-4 transition-transform ${openDropdown === "metrics" ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {openDropdown === "metrics" && (
              <div className="absolute right-0 top-full z-50 mt-1 w-full max-h-72 overflow-y-auto rounded border border-gray-200 bg-white p-3 shadow-lg sm:w-72">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold text-purple-700">
                  <button type="button" onClick={handleMetricSelectAll} className="hover:text-purple-800">
                    {visibleMetrics.length === METRIC_CONFIG.length ? "Clear all" : "Select all"}
                  </button>
                  <button type="button" onClick={() => setVisibleMetrics(DEFAULT_VISIBLE_METRICS)} className="hover:text-purple-800">
                    Reset defaults
                  </button>
                </div>
                <div className="space-y-2">
                  {METRIC_CONFIG.map((metric) => (
                    <label
                      key={metric.key}
                      className="flex items-center justify-between rounded border border-transparent px-2 py-1.5 text-sm hover:border-purple-200 hover:bg-purple-50"
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: metric.color }} />
                        {metric.label}
                      </span>
                      <input
                        type="checkbox"
                        checked={visibleMetrics.includes(metric.key)}
                        onChange={() => handleMetricToggle(metric.key)}
                        className="h-4 w-4 accent-purple-600"
                      />
                    </label>
                  ))}
                </div>
                {noMetricsSelected && <p className="mt-2 text-xs text-red-600">No metrics selected.</p>}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="min-h-[500px] rounded-lg border border-black bg-white/80 p-4">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm font-semibold text-purple-700">
                Loading chart data...
              </div>
            ) : noMetricsSelected ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-purple-300 bg-purple-50/40 p-6 text-center text-sm text-purple-700">
                Select at least one metric to display its trend over time.
              </div>
            ) : hasChartData ? (
              <Line data={chartData} options={chartOptions} />
            ) : hasFetched ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
                No analysis data found for the selected filters.
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
                Apply filters to load analysis trends.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnalysisChart;