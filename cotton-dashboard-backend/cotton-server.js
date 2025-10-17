import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import multer from "multer"; // for file uploads
import XLSX from "xlsx"; // for Excel handling

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Multer setup for memory storage
const upload = multer({ storage: multer.memoryStorage() });

const toArray = (maybeArray) => {
  if (Array.isArray(maybeArray)) return maybeArray;
  if (maybeArray === undefined || maybeArray === null) return [];
  return [maybeArray];
};

const normalizeValues = (values) =>
  Array.from(
    new Set(
      toArray(values)
        .map((item) => (item === undefined || item === null ? "" : `${item}`.trim()))
        .filter((item) => item !== "")
    )
  );

const parseFilterParam = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return normalizeValues(parsed);
  } catch (err) {
    return normalizeValues(value);
  }
};

const buildUniqueList = (rows = [], key) =>
  Array.from(
    new Set(
      rows
        .map((row) => {
          const raw = row?.[key];
          return raw === undefined || raw === null ? "" : `${raw}`.trim();
        })
        .filter((value) => value !== "")
    )
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

const enrichWithCotton = async (rows = []) => {
  if (!rows || rows.length === 0) {
    return [];
  }

  const varieties = [
    ...new Set(
      rows
        .map((row) => row.variety)
        .filter((value) => value !== undefined && value !== null && `${value}`.trim() !== "")
    ),
  ];

  let cottonLookup = {};

  if (varieties.length > 0) {
    const { data: mixingCodeData, error: mixingCodeError } = await supabase
      .from("mixing_code")
      .select("variety, cotton_name, cotton_year")
      .in("variety", varieties);

    if (mixingCodeError) {
      console.error("Error fetching mixing_code data:", mixingCodeError.message);
    } else {
      cottonLookup = (mixingCodeData || []).reduce((acc, item) => {
        if (item.variety) {
          const cottonYearValue =
            item.cotton_year === null || item.cotton_year === undefined || item.cotton_year === ""
              ? null
              : String(item.cotton_year).trim();
          acc[item.variety] = {
            cotton_name: item.cotton_name || null,
            cotton_year: cottonYearValue,
          };
        }
        return acc;
      }, {});
    }
  }

  return rows.map((row) => {
    const lookup = row.variety ? cottonLookup[row.variety] : undefined;
    return {
      ...row,
      cotton: lookup?.cotton_name ?? null,
      cotton_year: lookup?.cotton_year ?? null,
    };
  });
};

const buildFilterQuery = ({ from_date, to_date }) => {
  let query = supabase.from("lot_results").select("*");
  if (from_date) query = query.gte("lot_received_date", from_date);
  if (to_date) query = query.lte("lot_received_date", to_date);
  return query;
};

const buildOptionsQuery = ({ from_date, to_date }) => {
  let query = supabase.from("lot_results").select("lot_no, variety, station, party_name");
  if (from_date) query = query.gte("lot_received_date", from_date);
  if (to_date) query = query.lte("lot_received_date", to_date);
  return query;
};

const fetchFilteredLotResults = async ({
  lot_no,
  from_date,
  to_date,
  variety,
  station,
  party_name,
}) => {
  const lotFilters = parseFilterParam(lot_no);
  const varietyFilters = parseFilterParam(variety);
  const stationFilters = parseFilterParam(station);
  const partyNameFilters = parseFilterParam(party_name);

  let query = buildFilterQuery({ from_date, to_date });

  if (lotFilters.length > 0) {
    query = query.in("lot_no", lotFilters);
  }

  if (varietyFilters.length > 0) {
    query = query.in("variety", varietyFilters);
  }

  if (stationFilters.length > 0) {
    query = query.in("station", stationFilters);
  }

  if (partyNameFilters.length > 0) {
    query = query.in("party_name", partyNameFilters);
  }

  const { data, error } = await query.order("lot_received_date", { ascending: true });
  if (error) throw error;

  return enrichWithCotton(data || []);
};

const fetchFilterOptions = async ({ from_date, to_date, lot_no, variety, station, party_name }) => {
  const lotFilters = parseFilterParam(lot_no);
  const varietyFilters = parseFilterParam(variety);
  const stationFilters = parseFilterParam(station);
  const partyFilters = parseFilterParam(party_name);

  let query = buildOptionsQuery({ from_date, to_date });

  if (lotFilters.length > 0) {
    query = query.in("lot_no", lotFilters);
  }

  if (varietyFilters.length > 0) {
    query = query.in("variety", varietyFilters);
  }

  if (stationFilters.length > 0) {
    query = query.in("station", stationFilters);
  }

  if (partyFilters.length > 0) {
    query = query.in("party_name", partyFilters);
  }

  const { data, error } = await query;
  if (error) throw error;

  const lotOptions = buildUniqueList(data, "lot_no");
  const stationOptions = buildUniqueList(data, "station");
  const partyOptions = buildUniqueList(data, "party_name");

  const varietyValues = buildUniqueList(data, "variety");
  let varietyOptions = varietyValues.map((value) => ({ value, label: value }));

  if (varietyValues.length > 0) {
    const { data: mixingRows, error: mixingError } = await supabase
      .from("mixing_code")
      .select("variety, cotton_year")
      .in("variety", varietyValues);

    if (mixingError) {
      console.error("Error fetching cotton_year for varieties:", mixingError.message);
    } else {
      const varietyDisplayMap = (mixingRows || []).reduce((acc, row) => {
        const varietyValue = row?.variety ? `${row.variety}`.trim() : "";
        if (!varietyValue) {
          return acc;
        }
        const cottonYearRaw = row?.cotton_year;
        const cottonYearValue =
          cottonYearRaw === undefined || cottonYearRaw === null || `${cottonYearRaw}`.trim() === ""
            ? null
            : `${cottonYearRaw}`.trim();
        if (cottonYearValue) {
          acc[varietyValue] = cottonYearValue;
        }
        return acc;
      }, {});

      varietyOptions = varietyValues.map((value) => ({
        value,
        label: varietyDisplayMap[value] || value,
      }));
    }
  }

  return {
    lot_options: lotOptions,
    variety_options: varietyOptions,
    station_options: stationOptions,
    party_options: partyOptions,
  };
};

// -------------------------
// Fetch cotton results
// -------------------------
app.get("/api/cotton-results", async (req, res) => {
  try {
    const enrichedData = await fetchFilteredLotResults(req.query);
    res.json(enrichedData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

const normalizeQueryValue = (value) => {
  if (Array.isArray(value)) {
    return normalizeQueryValue(value[0]);
  }
  if (typeof value !== "string") return "";
  return value.trim().replace(/[;]+$/g, "");
};

const parseCottonMixingFilterArray = (rawValue) => {
  const normalizeSingleValue = (input) => {
    if (input === undefined || input === null) return null;
    const trimmed = `${input}`.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
    return trimmed;
  };

  const normalizeArray = (items) =>
    Array.from(
      new Set(
        (items || [])
          .map((item) => normalizeSingleValue(item))
          .filter((item) => item !== null)
      )
    );

  if (Array.isArray(rawValue)) {
    return normalizeArray(rawValue);
  }

  if (typeof rawValue === "string") {
    const trimmedRaw = rawValue.trim();
    if (!trimmedRaw) return [];
    try {
      const parsed = JSON.parse(trimmedRaw);
      if (Array.isArray(parsed)) {
        return normalizeArray(parsed);
      }
      const single = normalizeSingleValue(parsed);
      return single === null ? [] : [single];
    } catch (err) {
      const single = normalizeSingleValue(trimmedRaw);
      return single === null ? [] : [single];
    }
  }

  const single = normalizeSingleValue(rawValue);
  return single === null ? [] : [single];
};

const buildSortedOptionList = (values = []) => {
  const normalized = values
    .map((value) => {
      if (value === undefined || value === null) return "";
      return `${value}`.trim();
    })
    .filter((value) => value !== "");

  const unique = Array.from(new Set(normalized));

  return unique.sort((a, b) => {
    const numA = Number(a);
    const numB = Number(b);
    const bothNumbers = !Number.isNaN(numA) && !Number.isNaN(numB);

    if (bothNumbers) {
      return numA - numB;
    }

    return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  });
};

const normalizeMixingSignature = (value) => {
  if (value === undefined || value === null) return "";
  const raw = `${value}`.trim();
  if (!raw) return "";

  const parts = raw
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part !== "");

  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1) {
    return parts[0];
  }

  const sortedParts = [...parts].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return sortedParts.join("+");
};

const normalizeMixingSelections = (values = []) => {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => normalizeMixingSignature(value))
        .filter((value) => value !== "")
    )
  );
};

const createEmptyMixingFilterOptions = () => ({
  units: [],
  lines: [],
  cottons: [],
  mixings: [],
});

const METRIC_CONFIG = [
  { key: "uhml", label: "UHML (mm)", decimals: 1 },
  { key: "str", label: "STR (g/tex)", decimals: 1 },
  { key: "mic", label: "MIC", decimals: 2 },
  { key: "rd", label: "Rd", decimals: 1 },
  { key: "+b", label: "+b", decimals: 1 },
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

const normalizeCottonMixingFilters = (rawFilters = {}) => {
  const unit = parseCottonMixingFilterArray(rawFilters.unit);
  const line = parseCottonMixingFilterArray(rawFilters.line);
  const cotton = parseCottonMixingFilterArray(rawFilters.cotton);
  const mixingRaw = parseCottonMixingFilterArray(rawFilters.mixing);
  const mixing = normalizeMixingSelections(mixingRaw);

  return {
    unit,
    line,
    cotton,
    mixing,
  };
};

const buildOptionListFromRows = (rows = [], key, selectedValues = []) => {
  const combinedValues = [
    ...rows.map((row) => (row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined)),
    ...(selectedValues ?? []),
  ];

  return buildSortedOptionList(combinedValues);
};

const METRIC_LOOKUP = Object.fromEntries(METRIC_CONFIG.map((metric) => [metric.key, metric]));
const METRIC_PERMITTED_KEYS = new Set(METRIC_CONFIG.map((metric) => metric.key));

const PERIOD_FORMATTERS = {
  daily: (issueDate) => {
    if (!issueDate) return null;
    const date = new Date(issueDate);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().split("T")[0];
  },
  weekly: (issueDate) => {
    if (!issueDate) return null;
    const date = new Date(issueDate);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const weekNum = Math.ceil(date.getDate() / 7);
    return `${year}-${month}-W${weekNum}`;
  },
  monthly: (issueDate) => {
    if (!issueDate) return null;
    const date = new Date(issueDate);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    return `${year}-${month}`;
  },
};

const buildPeriodDescriptor = (issueDate, reportType) => {
  const formatter = PERIOD_FORMATTERS[reportType] ?? PERIOD_FORMATTERS.daily;
  const label = formatter(issueDate);

  if (!label) {
    return { label: null, sortKey: null, sortValue: null };
  }

  if (reportType === "weekly") {
    const match = label.match(/^(\d{4})-(\d{2})-W(\d{1,2})$/);
    if (!match) {
      return { label, sortKey: label, sortValue: null };
    }
    const [, year, month, weekRaw] = match;
    const normalizedWeek = weekRaw.padStart(2, "0");
    return {
      label,
      sortKey: `${year}-${month}-${normalizedWeek}`,
      sortValue: Number(`${year}${month}${normalizedWeek}`),
    };
  }

  if (reportType === "monthly") {
    const match = label.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return { label, sortKey: label, sortValue: null };
    }
    const [, year, month] = match;
    return {
      label,
      sortKey: `${year}-${month}`,
      sortValue: Number(`${year}${month}`),
    };
  }

  const timestamp = new Date(label).getTime();
  return {
    label,
    sortKey: label,
    sortValue: Number.isNaN(timestamp) ? null : timestamp,
  };
};

const isValidIsoDate = (value) => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
};

const AGGREGATION_PIPELINE = {
  daily: (item) => PERIOD_FORMATTERS.daily(item.issue_date),
  weekly: (item) => PERIOD_FORMATTERS.weekly(item.issue_date),
  monthly: (item) => PERIOD_FORMATTERS.monthly(item.issue_date),
};

const buildAggregationKey = (item, reportType) => {
  const aggregator = AGGREGATION_PIPELINE[reportType] ?? AGGREGATION_PIPELINE.daily;
  return aggregator(item);
};

const fetchAnalysisComparisonRows = async ({
  from_date,
  to_date,
  report_type,
  parameter,
}) => {
  let issueQuery = supabase
    .from("mixing_issue")
    .select("unit, line, cotton, mixing_no, issue_date");

  if (from_date) issueQuery = issueQuery.gte("issue_date", from_date);
  if (to_date) issueQuery = issueQuery.lte("issue_date", to_date);

  const { data: issueRows, error: issueError } = await issueQuery;
  if (issueError) {
    throw issueError;
  }

  if (!issueRows || issueRows.length === 0) {
    return [];
  }

  const mixingNumbers = [
    ...new Set(
      issueRows
        .map((row) => row.mixing_no)
        .filter((value) => value !== null && value !== undefined)
    ),
  ];

  if (mixingNumbers.length === 0) {
    return [];
  }

  const { data: mixingRows, error: mixingError } = await supabase
    .from("mixing_chart")
    .select("mixing_no, unit, line, cotton, lot_no")
    .in("mixing_no", mixingNumbers);

  if (mixingError) {
    throw mixingError;
  }

  if (!mixingRows || mixingRows.length === 0) {
    return [];
  }

  const lotNumbers = [
    ...new Set(
      mixingRows
        .map((row) => row.lot_no)
        .filter((value) => value !== null && value !== undefined && `${value}`.trim() !== "")
    ),
  ];

  if (lotNumbers.length === 0) {
    return [];
  }

  const { data: lotRows, error: lotError } = await supabase
    .from("lot_results")
    .select(`lot_no, ${parameter}`)
    .in("lot_no", lotNumbers);

  if (lotError) {
    throw lotError;
  }

  if (!lotRows || lotRows.length === 0) {
    return [];
  }

  const lotMetricMap = new Map();
  lotRows.forEach((row) => {
    if (!row.lot_no) return;
    const rawValue = row[parameter];
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      lotMetricMap.set(row.lot_no, null);
      return;
    }
    const numericValue = Number(rawValue);
    lotMetricMap.set(row.lot_no, Number.isFinite(numericValue) ? numericValue : null);
  });

  const issueLookup = new Map();
  const mixingFallbackLookup = new Map();

  issueRows.forEach((row) => {
    const detailedKey = `${row.mixing_no ?? ""}|${row.unit ?? ""}|${row.line ?? ""}|${row.cotton ?? ""}`;
    if (!issueLookup.has(detailedKey) && row.issue_date) {
      issueLookup.set(detailedKey, {
        unit: row.unit ?? null,
        issue_date: row.issue_date,
      });
    }

    if (row.mixing_no !== null && row.mixing_no !== undefined) {
      const fallbackKey = `${row.mixing_no}`;
      if (!mixingFallbackLookup.has(fallbackKey)) {
        mixingFallbackLookup.set(fallbackKey, []);
      }
      mixingFallbackLookup.get(fallbackKey).push(row);
    }
  });

  const parsedRows = [];

  mixingRows.forEach((mixRow) => {
    if (!mixRow.mixing_no) return;

    const lotMetricValue = lotMetricMap.get(mixRow.lot_no);
    if (lotMetricValue === undefined) {
      return;
    }

    const lookupKey = `${mixRow.mixing_no ?? ""}|${mixRow.unit ?? ""}|${mixRow.line ?? ""}|${mixRow.cotton ?? ""}`;
    let issueInfo = issueLookup.get(lookupKey);

    if (!issueInfo) {
      const fallbackList = mixingFallbackLookup.get(`${mixRow.mixing_no}`);
      if (fallbackList && fallbackList.length > 0) {
        const candidate = fallbackList.find((row) => row.issue_date);
        if (candidate) {
          issueInfo = {
            unit: candidate.unit ?? mixRow.unit ?? null,
            issue_date: candidate.issue_date,
          };
        }
      }
    }

    if (!issueInfo || !issueInfo.issue_date) {
      return;
    }

    const effectiveUnit = mixRow.unit ?? issueInfo.unit;
    if (!effectiveUnit) {
      return;
    }

    const aggregationKey = buildAggregationKey({ issue_date: issueInfo.issue_date }, report_type);
    if (!aggregationKey) {
      return;
    }

    const normalizedValue = Number.isFinite(lotMetricValue) ? lotMetricValue : null;

    parsedRows.push({
      issue_date: aggregationKey,
      unit: String(effectiveUnit),
      value: normalizedValue,
    });
  });

  return parsedRows;
};

const aggregateComparisonData = (rows, parameter) => {
  const resultMap = new Map();
  const unitSet = new Set();

  rows.forEach((row) => {
    unitSet.add(row.unit);
    if (!resultMap.has(row.issue_date)) {
      resultMap.set(row.issue_date, { issue_date: row.issue_date, values: {} });
    }
    const entry = resultMap.get(row.issue_date);
    const value = row.value;
    if (value === null) {
      entry.values[row.unit] = null;
    } else if (entry.values[row.unit] !== undefined && entry.values[row.unit] !== null) {
      entry.values[row.unit] = (entry.values[row.unit] + value) / 2;
    } else {
      entry.values[row.unit] = value;
    }
  });

  const rowsArray = Array.from(resultMap.values()).sort((a, b) => a.issue_date.localeCompare(b.issue_date));

  return {
    units: Array.from(unitSet).sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b);
    }),
    rows: rowsArray,
    parameter,
  };
};

const validateDateRange = (fromDate, toDate) => {
  if (!fromDate && !toDate) {
    return null;
  }

  if (fromDate && !isValidIsoDate(fromDate)) {
    return "from_date must be a valid ISO date";
  }

  if (toDate && !isValidIsoDate(toDate)) {
    return "to_date must be a valid ISO date";
  }

  if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
    return "from_date cannot be after to_date";
  }

  return null;
};

const validateMixingRange = (mixingFrom, mixingTo) => {
  if (!mixingFrom && !mixingTo) {
    return null;
  }

  if (mixingFrom && Number.isNaN(Number(mixingFrom))) {
    return "mixing_from must be a number";
  }

  if (mixingTo && Number.isNaN(Number(mixingTo))) {
    return "mixing_to must be a number";
  }

  if (mixingFrom && mixingTo && Number(mixingFrom) > Number(mixingTo)) {
    return "mixing_from cannot be greater than mixing_to";
  }

  return null;
};

const buildMixingRangeQuery = (query, mixingFrom, mixingTo) => {
  let nextQuery = query;
  if (mixingFrom) {
    nextQuery = nextQuery.gte("mixing_no", mixingFrom);
  }
  if (mixingTo) {
    nextQuery = nextQuery.lte("mixing_no", mixingTo);
  }
  return nextQuery;
};

const fetchCottonMixingFilterOptions = async ({ fromDate, toDate, mixingFrom, mixingTo, filters }) => {
  let issueQuery = supabase.from("mixing_issue").select("unit, line, cotton, mixing_no, issue_date");

  const numericMixingFilters = filters.mixing
    .map((value) => (value === undefined || value === null ? "" : `${value}`.trim()))
    .filter((value) => value !== "" && /^\d+$/.test(value));

  const shouldApplyMixingFilter =
    numericMixingFilters.length > 0 && numericMixingFilters.length === filters.mixing.length;

  if (fromDate) issueQuery = issueQuery.gte("issue_date", fromDate);
  if (toDate) issueQuery = issueQuery.lte("issue_date", toDate);
  issueQuery = buildMixingRangeQuery(issueQuery, mixingFrom, mixingTo);
  if (filters.unit.length > 0) issueQuery = issueQuery.in("unit", filters.unit);
  if (filters.line.length > 0) issueQuery = issueQuery.in("line", filters.line);
  if (filters.cotton.length > 0) issueQuery = issueQuery.in("cotton", filters.cotton);
  if (shouldApplyMixingFilter) issueQuery = issueQuery.in("mixing_no", numericMixingFilters);

  const { data: issueRows, error: issueError } = await issueQuery;

  if (issueError) {
    throw issueError;
  }

  if (!issueRows || issueRows.length === 0) {
    return {
      units: buildSortedOptionList(filters.unit),
      lines: buildSortedOptionList(filters.line),
      cottons: buildSortedOptionList(filters.cotton),
      mixings: buildSortedOptionList(filters.mixing),
    };
  }

  const uniqueMixingNumbers = Array.from(
    new Set(
      issueRows
        .map((row) => {
          const rawMixing = row?.mixing_no;
          return rawMixing === undefined || rawMixing === null ? "" : `${rawMixing}`.trim();
        })
        .filter((value) => value !== "")
    )
  );

  let mixingChartRows = [];
  if (uniqueMixingNumbers.length > 0) {
    let mixingQuery = supabase
      .from("mixing_chart")
      .select("mixing_no, unit, line, cotton")
      .in("mixing_no", uniqueMixingNumbers);

    if (filters.unit.length > 0) mixingQuery = mixingQuery.in("unit", filters.unit);
    if (filters.line.length > 0) mixingQuery = mixingQuery.in("line", filters.line);
    if (filters.cotton.length > 0) mixingQuery = mixingQuery.in("cotton", filters.cotton);
    if (filters.mixing.length > 0) mixingQuery = mixingQuery.in("mixing_no", filters.mixing);

    const { data: mixingRows, error: mixingError } = await mixingQuery;
    if (mixingError) {
      throw mixingError;
    }
    mixingChartRows = mixingRows || [];
  }

  const combinedRows = [...issueRows, ...mixingChartRows];

  return {
    units: buildOptionListFromRows(combinedRows, "unit", filters.unit),
    lines: buildOptionListFromRows(combinedRows, "line", filters.line),
    cottons: buildOptionListFromRows(combinedRows, "cotton", filters.cotton),
    mixings: buildOptionListFromRows(issueRows, "mixing_no", filters.mixing),
  };
};

// -------------------------
// Fetch cotton result filters
// -------------------------
app.get("/api/cotton-results/filters", async (req, res) => {
  try {
    const { from_date, to_date, lot_no, variety, station, party_name } = req.query;

    const lotFilters = parseFilterParam(lot_no);
    const varietyFilters = parseFilterParam(variety);
    const stationFilters = parseFilterParam(station);
    const partyFilters = parseFilterParam(party_name);

    // Ensure filter options remain empty until at least one filter is applied
    const noDateRange = !from_date && !to_date;
    const noAdditionalFilters =
      lotFilters.length === 0 &&
      varietyFilters.length === 0 &&
      stationFilters.length === 0 &&
      partyFilters.length === 0;

    if (noDateRange && noAdditionalFilters) {
      res.json({
        lot_options: [],
        variety_options: [],
        station_options: [],
        party_options: [],
      });
      return;
    }

    const options = await fetchFilterOptions({ from_date, to_date, lot_no, variety, station, party_name });
    res.json(options);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load cotton result filters" });
  }
});

app.get("/api/cotton-mixing-summary/filters", async (req, res) => {
  try {
    const fromDate = normalizeQueryValue(req.query.from_date);
    const toDate = normalizeQueryValue(req.query.to_date);
    const mixingFrom = normalizeQueryValue(req.query.mixing_from);
    const mixingTo = normalizeQueryValue(req.query.mixing_to);

    const filters = normalizeCottonMixingFilters({
      unit: req.query.unit,
      line: req.query.line,
      cotton: req.query.cotton,
      mixing: req.query.mixing,
    });

    const dateRangeError = validateDateRange(fromDate, toDate);
    if (dateRangeError) {
      return res.status(400).json({ error: dateRangeError });
    }

    const mixingRangeError = validateMixingRange(mixingFrom, mixingTo);
    if (mixingRangeError) {
      return res.status(400).json({ error: mixingRangeError });
    }

    const options = await fetchCottonMixingFilterOptions({
      fromDate,
      toDate,
      mixingFrom,
      mixingTo,
      filters,
    });

    res.json(options);
  } catch (error) {
    console.error("Error fetching cotton mixing filter options", error);
    res.status(500).json({ error: "Unable to load cotton mixing filter options" });
  }
});

const parseCottonVersion = (cottonVersionValue) => {
  if (!cottonVersionValue) {
    return {
      groupKey: "__NO_VERSION__",
      versionNumber: null,
      raw: null,
    };
  }

  const trimmed = String(cottonVersionValue).trim().toUpperCase();
  if (!trimmed) {
    return {
      groupKey: "__NO_VERSION__",
      versionNumber: null,
      raw: null,
    };
  }

  // Match YY_UL_VN format, e.g., 25_31_V1
  const match = trimmed.match(/^(\d{2})_(\d{2})_V(\d+)$/);
  if (match) {
    const yy = match[1];
    const ul = match[2];
    const vn = parseInt(match[3], 10);
    const versionNumber = Number.isNaN(vn) ? null : vn;
    return {
      groupKey: `${yy}_${ul}`,
      versionNumber,
      raw: trimmed,
    };
  }

  // Fallback to old format if not matching new
  const versionMatch = trimmed.match(/(.*?)(?:[\s\-_\/]*(V\d+))$/i);
  if (versionMatch && versionMatch[2]) {
    const baseRaw = versionMatch[1] ?? trimmed;
    const base = baseRaw.replace(/[\s\-_\/]+$/g, "").trim();
    const normalizedBase = base ? base : trimmed.replace(/[\s\-_\/]*(V\d+)$/i, "").trim();
    const versionLabel = versionMatch[2].toUpperCase();
    const digitsMatch = versionLabel.match(/\d+/);
    const versionNumber = digitsMatch ? parseInt(digitsMatch[0], 10) : null;

    return {
      groupKey: normalizedBase || trimmed,
      versionNumber: Number.isNaN(versionNumber) ? null : versionNumber,
      raw: trimmed,
    };
  }

  return { groupKey: trimmed, versionNumber: null, raw: trimmed };
};

// 🚀 Weighted average summary endpoint (filter by issue_date)
app.get("/api/cotton-mixing-summary", async (req, res) => {
  try {
    const { from_date, to_date, unit, line, cotton, mixing, mixing_from, mixing_to, report_type = "daily" } = req.query;
    const enableSummaryDebug = process.env.SUMMARY_DEBUG === "true";

    if (!["daily", "weekly", "monthly"].includes(report_type)) {
      return res.status(400).json({ error: "Invalid report_type. Must be 'daily', 'weekly', or 'monthly'." });
    }

    const parseArray = (value) => {
      if (!value) return [];
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch (err) {
        console.error("Failed to parse filter array", value, err.message);
        return [];
      }
    };

    const unitFilters = parseArray(unit);
    const lineFilters = parseArray(line);
    const cottonFilters = parseArray(cotton);
    const mixingFilters = parseArray(mixing);

    const sanitizeCottonCandidate = (rawValue) => {
      if (!rawValue) return "";
      return rawValue
        .replace(/[^A-Z0-9V_]+/g, "_")
        .replace(/_{2,}/g, "_")
        .replace(/^_|_$/g, "");
    };

    const createCottonLookup = (rows = []) => {
      const lookup = new Map();
      rows.forEach((row) => {
        if (!row || row.cotton === undefined || row.cotton === null) {
          return;
        }
        const trimmed = String(row.cotton).trim();
        if (!trimmed) {
          return;
        }
        lookup.set(trimmed.toUpperCase(), trimmed);
      });
      return lookup;
    };

    const normalizeCottonFilterValue = (value, lookup) => {
      if (value === undefined || value === null) {
        return "";
      }

      const trimmed = String(value).trim();
      if (!trimmed) {
        return "";
      }

      const upper = trimmed.toUpperCase();
      const candidates = [upper];

      const sanitized = sanitizeCottonCandidate(upper);
      if (sanitized && sanitized !== upper) {
        candidates.push(sanitized);
      }

      const { raw } = parseCottonVersion(trimmed);
      if (raw) {
        candidates.push(raw);
        const parsedSanitized = sanitizeCottonCandidate(raw);
        if (parsedSanitized) {
          candidates.push(parsedSanitized);
        }
      }

      for (const candidate of candidates) {
        if (!candidate) continue;
        const key = candidate.toUpperCase();
        if (lookup.has(key)) {
          return lookup.get(key);
        }
      }

      if (sanitized) {
        return sanitized;
      }

      return upper;
    };

    const buildNormalizedCottonFilters = ({ filters, lookup }) => {
      const normalized = new Set();
      filters.forEach((value) => {
        const normalizedValue = normalizeCottonFilterValue(value, lookup);
        if (normalizedValue) {
          normalized.add(String(normalizedValue).trim());
        }
      });
      return Array.from(normalized);
    };

    // 1️⃣ Fetch issue data first (for date filtering except cotton)
    let issueQuery = supabase.from("mixing_issue").select("unit, line, mixing_no, cotton, issue_date");

    if (from_date) issueQuery = issueQuery.gte("issue_date", from_date);
    if (to_date) issueQuery = issueQuery.lte("issue_date", to_date);
    issueQuery = buildMixingRangeQuery(issueQuery, mixing_from, mixing_to);
    if (unitFilters.length > 0) issueQuery = issueQuery.in("unit", unitFilters);
    if (lineFilters.length > 0) issueQuery = issueQuery.in("line", lineFilters);
    if (mixingFilters.length > 0) issueQuery = issueQuery.in("mixing_no", mixingFilters);

    const { data: rawIssueData, error: issueError } = await issueQuery;
    if (issueError) throw issueError;

    const issueCottonLookup = createCottonLookup(rawIssueData);

    const parseMixingFiltersAsStrings = (values) => {
      return [...new Set(values.map((value) => String(value).trim()).filter((value) => value !== ""))];
    };

    let issueData = rawIssueData ?? [];
    let normalizedCottonFilters = [];

    if (cottonFilters.length > 0) {
      normalizedCottonFilters = buildNormalizedCottonFilters({ filters: cottonFilters, lookup: issueCottonLookup });
      const cottonFiltersForQueries = normalizedCottonFilters.length > 0
        ? normalizedCottonFilters
        : cottonFilters
            .map((value) => (value === undefined || value === null ? "" : String(value).trim()))
            .filter((value) => value !== "");

      if (cottonFiltersForQueries.length > 0) {
        const cottonFilterSet = new Set(cottonFiltersForQueries.map((value) => value.toUpperCase()));
        issueData = issueData.filter((row) => {
          if (!row || row.cotton === undefined || row.cotton === null) {
            return false;
          }
          return cottonFilterSet.has(String(row.cotton).trim().toUpperCase());
        });
      }
    }

if (!issueData || issueData.length === 0) {
      return res.json([]); // No issues in the given date range
    }

    const effectiveCottonFilters = normalizedCottonFilters.length > 0
      ? normalizedCottonFilters
      : cottonFilters.map((value) => (value === undefined || value === null ? "" : String(value).trim())).filter(Boolean);

    // Build lookup for issue dates by mixing and cotton
    const issueDateLookup = {};
    issueData.forEach((issueRow) => {
      const unitKey = issueRow.unit ?? "__NO_UNIT__";
      const lineKey = issueRow.line ?? "__NO_LINE__";
      const cottonKey = issueRow.cotton ?? "__NO_COTTON__";
      const mixingKey = issueRow.mixing_no ?? "__NO_MIXING__";
      const lookupKey = `${unitKey}|${lineKey}|${mixingKey}|${cottonKey}`;
      if (!issueDateLookup[lookupKey]) {
        issueDateLookup[lookupKey] = issueRow.issue_date;
      }
    });

    // 2️⃣ Extract valid mixing_nos
    const validMixNos = [...new Set(issueData.map((i) => i.mixing_no).filter(Boolean))];

    // 3️⃣ Fetch corresponding mixing_chart entries
    let mixingQuery = supabase.from("mixing_chart").select("*");
    if (validMixNos.length > 0) {
      mixingQuery = mixingQuery.in("mixing_no", validMixNos);
    }
    if (unitFilters.length > 0) mixingQuery = mixingQuery.in("unit", unitFilters);
    if (lineFilters.length > 0) mixingQuery = mixingQuery.in("line", lineFilters);
    if (effectiveCottonFilters.length > 0) {
      mixingQuery = mixingQuery.in("cotton", effectiveCottonFilters);
    }

    if (from_date) {
      mixingQuery = mixingQuery.gte("issue_date", from_date);
    }
    if (to_date) {
      mixingQuery = mixingQuery.lte("issue_date", to_date);
    }

    const { data: mixingData, error: mixingError } = await mixingQuery;
    if (mixingError) throw mixingError;

    if (!mixingData || mixingData.length === 0) {
       return res.json([]); // No matching mixings found
    }

    // 4️⃣ Fetch all relevant lot results
    const lotNos = [...new Set(mixingData.map((m) => m.lot_no))];
    const { data: lotResults, error: lotError } = await supabase
      .from("lot_results")
      .select("*")
      .in("lot_no", lotNos);
    if (lotError) throw lotError;

    if ((!lotResults || lotResults.length === 0) && enableSummaryDebug && ["weekly", "monthly"].includes(report_type)) {
      console.log(
        "[Summary][Backend] No lot results found for weekly/monthly summary.",
        {
          reportType: report_type,
          lotNosCount: lotNos.length,
        },
      );
    }

    // Handle different report types
    if (report_type === "daily") {
      // Group by mixing_no + cotton combination
      const groups = {};
      for (const row of mixingData) {
        const groupKey = `${row.mixing_no}|${row.cotton}`;
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(row);
      }

      const summaryEntries = [];

      // Compute weighted averages for each mixing_no + cotton combination
      for (const rows of Object.values(groups)) {
        if (rows.length === 0) continue;

        const totalBales = rows.reduce((sum, r) => sum + Number(r.issue_bale || 0), 0);

        // Calculate number of unique lots
        const uniqueLots = [...new Set(rows.map(r => r.lot_no))];
        const noOfLots = uniqueLots.length;

        // Calculate mixing number range
        const mixingNumbersRaw = [...new Set(rows.map((r) => r.mixing_no))];
        const validNumericMixingNumbers = mixingNumbersRaw
          .map((value) => {
            const num = Number(value);
            return Number.isNaN(num) ? null : num;
          })
          .filter((value) => value !== null)
          .sort((a, b) => a - b);

        const minMixing = validNumericMixingNumbers.length > 0 ? validNumericMixingNumbers[0] : null;
        const maxMixing = validNumericMixingNumbers.length > 0 ? validNumericMixingNumbers[validNumericMixingNumbers.length - 1] : null;

        const mixingRange = (() => {
          if (minMixing === null || maxMixing === null) {
            return rows[0].mixing_no;
          }

          if (minMixing === maxMixing) {
            return `${minMixing}`;
          }

          return `${minMixing}-${maxMixing}`;
        })();

        const sortedMixingNumbers = [...mixingNumbers];
        const weighted = {
          mixing_no: mixingRange,
          minMixing,
          unit: rows[0].unit,
          line: rows[0].line,
          cotton: rows[0].cotton,
          total_bales: totalBales,
          no_of_lots: noOfLots,
          mic: 0,
          str: 0,
          uhml: 0,
          rd: 0,
          plus_b: 0,
          sf: 0,
          ui: 0,
          elong: 0,
          trash: 0,
          moist: 0,
          min_mic: null,
          min_mic_percent: null,
          issue_date: null,
          mixing: "",
          blend_percent: "",
          bale_change_over_percent: null,
          lot_change_over_percent: null,
          previous_mixing_no: null,
          mixing_start: minMixing,
          mixing_end: maxMixing,
        };

        const issueDates = rows
          .map((row) => {
            const unitKey = row.unit ?? "__NO_UNIT__";
            const lineKey = row.line ?? "__NO_LINE__";
            const cottonKey = row.cotton ?? "__NO_COTTON__";
            const mixingKey = row.mixing_no ?? "__NO_MIXING__";
            const lookupKey = `${unitKey}|${lineKey}|${mixingKey}|${cottonKey}`;
            return issueDateLookup[lookupKey] || null;
          })
          .filter(Boolean);

        if (issueDates.length > 0) {
          const sortedIssueDates = issueDates
            .map((dateStr) => ({ dateStr, time: new Date(dateStr).getTime() || 0 }))
            .sort((a, b) => a.time - b.time);
          weighted.issue_date = sortedIssueDates[0].dateStr;
        }

        const lotBalesMap = {};
        let weightedMinMicNumerator = 0;
        const minMicValues = [];
        weighted._mixingNumbers = sortedMixingNumbers;

        for (const mixRow of rows) {
          const lot = lotResults.find((l) => l.lot_no === mixRow.lot_no);
          if (!lot) continue;

          const bales = Number(mixRow.issue_bale || 0);
          const lotKey = mixRow.lot_no;

          if (lotKey) {
            lotBalesMap[lotKey] = (lotBalesMap[lotKey] || 0) + bales;
          }

          weighted.mic += (Number(lot.mic) || 0) * bales;
          weighted.str += (Number(lot.str) || 0) * bales;
          weighted.uhml += (Number(lot.uhml) || 0) * bales;
          weighted.rd += (Number(lot.rd) || 0) * bales;
          weighted.plus_b += (Number(lot.plus_b) || 0) * bales;
          weighted.sf += (Number(lot.sf) || 0) * bales;
          weighted.ui += (Number(lot.ui) || 0) * bales;
          weighted.elong += (Number(lot.elong) || 0) * bales;
          weighted.trash += (Number(lot.trash) || 0) * bales;
          weighted.moist += (Number(lot.moist) || 0) * bales;

          const lotMinMicBales = Number(lot.min_mic_bale_per_lot);
          const lotTotalBales = Number(lot.no_of_bale);
          if (
            lot.min_mic_bale_per_lot !== null &&
            lot.min_mic_bale_per_lot !== undefined &&
            lot.min_mic_bale_per_lot !== "" &&
            !isNaN(lotMinMicBales) &&
            lotTotalBales > 0
          ) {
            const lotMinMicPercent = (lotMinMicBales * 100) / lotTotalBales;
            weightedMinMicNumerator += bales * lotMinMicPercent;
          }

          if (lot.min_mic !== null && lot.min_mic !== undefined && lot.min_mic !== "") {
            const num = Number(lot.min_mic);
            if (!isNaN(num)) minMicValues.push(num);
          }
        }

        if (totalBales > 0) {
          for (const key of [
            "mic",
            "str",
            "uhml",
            "rd",
            "plus_b",
            "sf",
            "ui",
            "elong",
            "trash",
            "moist",
          ]) {
            weighted[key] = +(weighted[key] / totalBales).toFixed(2);
          }

          weighted.min_mic_percent = +(weightedMinMicNumerator / totalBales).toFixed(2);
        } else {
          weighted.min_mic_percent = 0;
        }

        if (minMicValues.length > 0) {
          weighted.min_mic = Math.min(...minMicValues).toFixed(2);
        }

        // Fetch unique varieties for this mixing_no to build mixing column and blend%
        const lotsForMixing = rows.map(r => r.lot_no);
        const varietiesForMixing = lotResults
          .filter(lot => lotsForMixing.includes(lot.lot_no))
          .map(lot => lot.variety)
          .filter(v => v);
        const uniqueVarieties = [...new Set(varietiesForMixing)];

        // Fetch cotton_name and weight from mixing_code table
        if (uniqueVarieties.length > 0) {
          const { data: mixingCodeData, error: mixingCodeError } = await supabase
            .from("mixing_code")
            .select("variety, cotton_name, weight")
            .in("variety", uniqueVarieties);

          if (!mixingCodeError && mixingCodeData && mixingCodeData.length > 0) {
            // Build a map: variety -> { cotton_name, weight }
            const varietyMap = {};
            mixingCodeData.forEach(mc => {
              if (mc.variety && mc.cotton_name) {
                varietyMap[mc.variety] = {
                  cotton_name: mc.cotton_name,
                  weight: Number(mc.weight) || 0
                };
              }
            });

            // Calculate weighted contribution for each cotton_name
            const cottonContributions = {};
            let totalWeightedSum = 0;

            for (const mixRow of rows) {
              const lot = lotResults.find((l) => l.lot_no === mixRow.lot_no);
              if (!lot || !lot.variety) continue;

              const varietyInfo = varietyMap[lot.variety];
              if (!varietyInfo) continue;

              const issueBale = Number(mixRow.issue_bale) || 0;
              const weight = varietyInfo.weight;
              const cottonName = varietyInfo.cotton_name;
              const weightedValue = issueBale * weight;

              if (!cottonContributions[cottonName]) {
                cottonContributions[cottonName] = 0;
              }
              cottonContributions[cottonName] += weightedValue;
              totalWeightedSum += weightedValue;
            }

            // Build mixing and blend_percent strings
            let cottonNames = Object.keys(cottonContributions)
              .filter((name) => cottonContributions[name] > 0)
              .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

            if (cottonNames.length === 0) {
              cottonNames = [...new Set(
                mixingCodeData
                  .map((mc) => mc.cotton_name)
                  .filter((name) => name)
              )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
            }

            const blendPercentages = cottonNames.map((cottonName) => {
              if (totalWeightedSum > 0 && cottonContributions[cottonName]) {
                const percentage = (cottonContributions[cottonName] / totalWeightedSum) * 100;
                return Math.round(percentage);
              }
              return 0;
            });

            weighted.mixing = cottonNames.join("+");
            weighted.blend_percent = blendPercentages.join("+");
          }
        }

        const { groupKey, versionNumber } = parseCottonVersion(rows[0].cotton);

        weighted._lotBalesMap = lotBalesMap;
        weighted._groupKey = groupKey ?? "__NO_GROUP__";
        weighted._versionNumber = versionNumber ?? null;

        summaryEntries.push(weighted);
      }

      // Track continuity by unit/line and parsed cotton signature
      const continuityGroups = {};
      const groupStats = {};

      summaryEntries.forEach((entry) => {
        const signature = `${entry.unit ?? "__NO_UNIT__"}|${entry.line ?? "__NO_LINE__"}|${entry._groupKey}`;
        const mixNos = Array.isArray(entry._mixingNumbers) ? entry._mixingNumbers : [];
        const maxMixNo = mixNos.length > 0 ? Math.max(...mixNos) : entry.mixing_end ?? entry.mixing_start;
        const issueTimestamp = entry.issue_date ? new Date(entry.issue_date).getTime() : null;

        if (!continuityGroups[signature]) {
          continuityGroups[signature] = [];
          groupStats[signature] = { lastVersion: null, lastTimestamp: null };
        }

        continuityGroups[signature].push({ entry, maxMixNo, issueTimestamp });
      });

      Object.entries(continuityGroups).forEach(([signature, records]) => {
        records.sort((a, b) => {
          if (a.issueTimestamp !== b.issueTimestamp) {
            if (a.issueTimestamp === null) return 1;
            if (b.issueTimestamp === null) return -1;
            return a.issueTimestamp - b.issueTimestamp;
          }

          const versionA = a.entry._versionNumber ?? Number.MAX_SAFE_INTEGER;
          const versionB = b.entry._versionNumber ?? Number.MAX_SAFE_INTEGER;
          if (versionA !== versionB) {
            return versionA - versionB;
          }

          const mixingSpanA = a.maxMixNo ?? Number.MAX_SAFE_INTEGER;
          const mixingSpanB = b.maxMixNo ?? Number.MAX_SAFE_INTEGER;
          if (mixingSpanA !== mixingSpanB) {
            return mixingSpanA - mixingSpanB;
          }

          return 0;
        });

        const stats = groupStats[signature];

        records.forEach(({ entry }, index) => {
          const hasSameGroup = stats.lastVersion !== null && stats.lastTimestamp !== null;

          if (index === 0 || !hasSameGroup) {
            entry.bale_change_over_percent = null;
            entry.lot_change_over_percent = null;
            entry.previous_mixing_no = null;
          } else {
            const previous = records[index - 1].entry;

            const previousLotMap = previous._lotBalesMap || {};
            const currentLotMap = entry._lotBalesMap || {};
            const lotSet = new Set([
              ...Object.keys(previousLotMap),
              ...Object.keys(currentLotMap),
            ]);

            let absoluteDifferenceSum = 0;
            let newLotCount = 0;
            let removedLotCount = 0;

            lotSet.forEach((lotNo) => {
              const prevBales = Number(previousLotMap[lotNo] || 0);
              const currentBales = Number(currentLotMap[lotNo] || 0);
              absoluteDifferenceSum += Math.abs(currentBales - prevBales);

              if (prevBales === 0 && currentBales > 0) newLotCount += 1;
              if (currentBales === 0 && prevBales > 0) removedLotCount += 1;
            });

            const previousTotalBales = Number(previous.total_bales) || 0;
            const previousLotCount = Number(previous.no_of_lots) || 0;

            entry.bale_change_over_percent =
              previousTotalBales > 0
                ? parseFloat(((absoluteDifferenceSum / previousTotalBales) * 100).toFixed(2))
                : null;

            entry.lot_change_over_percent =
              previousLotCount > 0
                ? parseFloat((((newLotCount + removedLotCount) / previousLotCount) * 100).toFixed(2))
                : null;

            entry.previous_mixing_no = previous.mixing_no;
          }

          stats.lastVersion = entry._versionNumber;
          stats.lastTimestamp = entry.issue_date ? new Date(entry.issue_date).getTime() : null;
        });
      });

      const summary = summaryEntries.map(({ _lotBalesMap, _groupKey, _versionNumber, _mixingNumbers, ...rest }) => rest);

      // Sort by issue_date descending
      summary.sort((a, b) => new Date(b.issue_date) - new Date(a.issue_date));

      // Apply mixing filter if provided
      let filteredSummary = summary;
      if (mixingFilters.length > 0) {
        filteredSummary = summary.filter((row) => {
          if (!row.mixing) return false;
          const mixingNames = row.mixing.split("+");
          return mixingNames.some((name) => mixingFilters.includes(name));
        });
      }

      res.json(filteredSummary);
      return;
    }




    // weekly or monthly branch
    if (report_type === "weekly" || report_type === "monthly") {
      // Group by week/month + unit + line + cotton (version)
      const groupedData = {};


      // Process each issue data entry
      for (const issue of issueData) {
        const { label: periodLabel, sortKey: periodSortKey, sortValue: periodSortValue } = buildPeriodDescriptor(
          issue.issue_date,
          report_type
        );

        if (!periodLabel) {
          continue;
        }

        const cottonValue = issue.cotton;

        if (cottonFilters.length > 0 && !cottonFilters.includes(cottonValue)) {
          continue;
        }

        const groupKey = `${periodLabel}|${issue.unit}|${issue.line}|${cottonValue}`;

        if (!groupedData[groupKey]) {
          groupedData[groupKey] = {
            unit: issue.unit,
            line: issue.line,
            cotton: cottonValue,
            mixing_nos: [],
            issue_date: periodLabel,
            issue_date_sort_key: periodSortKey,
            _issueSortValue: periodSortValue ?? null,
            _raw_issue_dates: [],
            rows: [],
          };
        } else {
          if (!groupedData[groupKey].issue_date_sort_key && periodSortKey) {
            groupedData[groupKey].issue_date_sort_key = periodSortKey;
          }
          if (
            (groupedData[groupKey]._issueSortValue === null || groupedData[groupKey]._issueSortValue === undefined) &&
            periodSortValue !== null &&
            periodSortValue !== undefined
          ) {
            groupedData[groupKey]._issueSortValue = periodSortValue;
          }
        }

        if (periodSortValue !== null && periodSortValue !== undefined) {
          groupedData[groupKey]._raw_issue_dates.push({
            raw: issue.issue_date,
            sortValue: periodSortValue,
          });
        }

        groupedData[groupKey].mixing_nos.push({ mixing_no: issue.mixing_no, cotton: cottonValue });
      }

      // For each group, find all related mixing_chart entries
      for (const [groupKey, group] of Object.entries(groupedData)) {
        // Extract mixing_no values from the array of objects
        const mixingNoValues = group.mixing_nos
          .map((item) => (item?.mixing_no === undefined || item?.mixing_no === null ? "" : `${item.mixing_no}`.trim()))
          .filter((value) => value !== "");
        
// cotton-server.js, within the weekly branch where relevantMixingData is built
  const relevantMixingData = mixingData.filter((m) => {
  const mixingValue = m?.mixing_no === undefined || m?.mixing_no === null ? "" : `${m.mixing_no}`.trim();
  const normalizedRowUnit = String(m?.unit ?? "").trim();
  const normalizedGroupUnit = String(group?.unit ?? "").trim();
  const normalizedRowLine = String(m?.line ?? "").trim();
  const normalizedGroupLine = String(group?.line ?? "").trim();
  const normalizedRowCotton = String(m?.cotton ?? "").trim().toUpperCase();
  const normalizedGroupCotton = String(group?.cotton ?? "").trim().toUpperCase();

  const matchesGroupUnit = normalizedRowUnit === normalizedGroupUnit;
  const matchesGroupLine = normalizedRowLine === normalizedGroupLine;
  const matchesGroupCotton = normalizedRowCotton === normalizedGroupCotton;

  const matchesUnitFilter =
    unitFilters.length === 0 ||
    unitFilters.some((value) => String(value ?? "").trim() === normalizedRowUnit);

  const matchesLineFilter =
    lineFilters.length === 0 ||
    lineFilters.some((value) => String(value ?? "").trim() === normalizedRowLine);

  const matchesCottonFilter =
    cottonFilters.length === 0 ||
    cottonFilters.some((value) => String(value ?? "").trim().toUpperCase() === normalizedRowCotton);

  const passes =
    mixingValue &&
    mixingNoValues.includes(mixingValue) &&
    matchesGroupUnit &&
    matchesGroupLine &&
    matchesGroupCotton &&
    matchesUnitFilter &&
    matchesLineFilter &&
    matchesCottonFilter;


  return passes;
});


        // For each mixing row, determine the period label/sort key based on its issue date
        const rowsWithPeriod = relevantMixingData.map((mixRow) => {
          const lookupKey = `${mixRow.unit ?? "__NO_UNIT__"}|${mixRow.line ?? "__NO_LINE__"}|${mixRow.mixing_no ?? "__NO_MIXING__"}|${mixRow.cotton ?? "__NO_COTTON__"}`;
          const rawIssueDate = issueDateLookup[lookupKey] ?? null;
          const { label, sortKey, sortValue } = buildPeriodDescriptor(rawIssueDate, report_type);
          return {
            ...mixRow,
            _periodLabel: label ?? group.issue_date,
            _periodSortKey: sortKey ?? group.issue_date_sort_key ?? group.issue_date,
            _periodSortValue: sortValue ?? group._issueSortValue ?? null,
          };
        });

        const normalizedRows = rowsWithPeriod.map((row) => ({
          ...row,
          _periodSortKey: row._periodSortKey,
          _periodSortValue: row._periodSortValue,
        }));

        if (!group.issue_date_sort_key && normalizedRows.length > 0) {
          const candidate = normalizedRows.find((row) => row._periodSortKey);
          if (candidate) {
            group.issue_date_sort_key = candidate._periodSortKey;
          }
        }

        if ((group._issueSortValue === null || group._issueSortValue === undefined) && normalizedRows.length > 0) {
          const candidate = normalizedRows.find((row) => row._periodSortValue !== null && row._periodSortValue !== undefined);
          if (candidate) {
            group._issueSortValue = candidate._periodSortValue;
          }
        }

        if (group._raw_issue_dates && normalizedRows.length > 0) {
          normalizedRows.forEach((row) => {
            if (row._periodSortValue !== null && row._periodSortValue !== undefined) {
              group._raw_issue_dates.push({ raw: row._periodLabel, sortValue: row._periodSortValue });
            }
          });
        }

        // Add all relevant rows to the group with period metadata
        group.rows = normalizedRows;
      }

      // Calculate weighted averages for each group
      const summaryEntriesPeriod = [];

      for (const [groupKey, group] of Object.entries(groupedData)) {

        if (!group || group.rows.length === 0) continue;

        const totalBales = group.rows.reduce((sum, r) => sum + Number(r.issue_bale || 0), 0);
        const uniqueLots = [...new Set(group.rows.map((r) => r.lot_no))];
        const noOfLots = uniqueLots.length;

        const mixingNumbersRaw = [...new Set(group.mixing_nos.map((item) => item.mixing_no))];
        const mixingNumbers = mixingNumbersRaw
          .map((value) => {
            const num = Number(value);
            return Number.isNaN(num) ? null : num;
          })
          .filter((value) => value !== null)
          .sort((a, b) => a - b);

        const minMixing = mixingNumbers.length > 0 ? mixingNumbers[0] : null;
        const maxMixing = mixingNumbers.length > 0 ? mixingNumbers[mixingNumbers.length - 1] : null;
        const mixingRange =
          minMixing === null || maxMixing === null
            ? group.mixing_nos[0]?.mixing_no ?? ""
            : minMixing === maxMixing
            ? `${minMixing}`
            : `${minMixing}-${maxMixing}`;

        const { groupKey: parsedGroupKey, versionNumber } = parseCottonVersion(group.cotton);

        const weighted = {
          mixing_no: mixingRange,
          unit: group.unit,
          line: group.line,
          cotton: group.cotton,
          total_bales: totalBales,
          no_of_lots: noOfLots,
          mic: 0,
          str: 0,
          uhml: 0,
          rd: 0,
          plus_b: 0,
          sf: 0,
          ui: 0,
          elong: 0,
          trash: 0,
          moist: 0,
          min_mic: null,
          min_mic_percent: null,
          issue_date: group.issue_date,
          issue_date_sort_key: group.issue_date_sort_key ?? null,
          _issueSortValue: group._issueSortValue ?? null,
          _raw_issue_dates: group._raw_issue_dates ?? [],
          mixing: "",
          blend_percent: "",
          bale_change_over_percent: null,
          lot_change_over_percent: null,
          previous_mixing_no: null,
          mixing_start: minMixing,
          mixing_end: maxMixing,
          _cottonSignature: parsedGroupKey ?? "__NO_GROUP__",
          _versionNumber: versionNumber ?? null,
        };

        const lotBalesMap = {};
        let weightedMinMicNumerator = 0;
        const minMicValues = [];

        for (const mixRow of group.rows) {
          const lot = lotResults.find((l) => l.lot_no === mixRow.lot_no);
          if (!lot) continue;

          const bales = Number(mixRow.issue_bale || 0);
          const lotKey = mixRow.lot_no;

          if (lotKey) {
            lotBalesMap[lotKey] = (lotBalesMap[lotKey] || 0) + bales;
          }

          weighted.mic += (Number(lot.mic) || 0) * bales;
          weighted.str += (Number(lot.str) || 0) * bales;
          weighted.uhml += (Number(lot.uhml) || 0) * bales;
          weighted.rd += (Number(lot.rd) || 0) * bales;
          weighted.plus_b += (Number(lot.plus_b) || 0) * bales;
          weighted.sf += (Number(lot.sf) || 0) * bales;
          weighted.ui += (Number(lot.ui) || 0) * bales;
          weighted.elong += (Number(lot.elong) || 0) * bales;
          weighted.trash += (Number(lot.trash) || 0) * bales;
          weighted.moist += (Number(lot.moist) || 0) * bales;

          const lotMinMicBales = Number(lot.min_mic_bale_per_lot);
          const lotTotalBales = Number(lot.no_of_bale);
          if (
            lot.min_mic_bale_per_lot !== null &&
            lot.min_mic_bale_per_lot !== undefined &&
            lot.min_mic_bale_per_lot !== "" &&
            !Number.isNaN(lotMinMicBales) &&
            lotTotalBales > 0
          ) {
            const lotMinMicPercent = (lotMinMicBales * 100) / lotTotalBales;
            weightedMinMicNumerator += bales * lotMinMicPercent;
          }

          if (lot.min_mic !== null && lot.min_mic !== undefined && lot.min_mic !== "") {
            const num = Number(lot.min_mic);
            if (!Number.isNaN(num)) minMicValues.push(num);
          }
        }

        if (totalBales > 0) {
          for (const key of [
            "mic",
            "str",
            "uhml",
            "rd",
            "plus_b",
            "sf",
            "ui",
            "elong",
            "trash",
            "moist",
          ]) {
            weighted[key] = +(weighted[key] / totalBales).toFixed(2);
          }

          weighted.min_mic_percent = +(weightedMinMicNumerator / totalBales).toFixed(2);
        } else {
          weighted.min_mic_percent = 0;
        }

        if (minMicValues.length > 0) {
          weighted.min_mic = Math.min(...minMicValues).toFixed(2);
        }

        if (weighted.issue_date_sort_key && Array.isArray(weighted._raw_issue_dates) && weighted._raw_issue_dates.length > 0) {
          const sortedRawDates = weighted._raw_issue_dates
            .map((entry) => ({ ...entry, numeric: Number(entry.sortValue) }))
            .filter((item) => Number.isFinite(item.numeric))
            .sort((a, b) => a.numeric - b.numeric);

          if (sortedRawDates.length > 0) {
            const earliest = sortedRawDates[0];
            weighted.issue_date = buildPeriodDescriptor(earliest.raw, report_type).label ?? weighted.issue_date;
          }
        }

        const lotsForMixing = group.rows.map((r) => r.lot_no);
        const varietiesForMixing = lotResults
          .filter((lot) => lotsForMixing.includes(lot.lot_no))
          .map((lot) => lot.variety)
          .filter((v) => v);
        const uniqueVarieties = [...new Set(varietiesForMixing)];

        if (uniqueVarieties.length > 0) {
          const { data: mixingCodeData, error: mixingCodeError } = await supabase
            .from("mixing_code")
            .select("variety, cotton_name, weight")
            .in("variety", uniqueVarieties);

          if (mixingCodeError) {
            throw mixingCodeError;
          }

          if (mixingCodeData && mixingCodeData.length > 0) {
            const varietyMap = {};
            mixingCodeData.forEach((mc) => {
              if (mc.variety && mc.cotton_name) {
                varietyMap[mc.variety] = {
                  cotton_name: mc.cotton_name,
                  weight: Number(mc.weight) || 0,
                };
              }
            });

            const cottonContributions = {};
            let totalWeightedSum = 0;

            for (const mixRow of group.rows) {
              const lot = lotResults.find((l) => l.lot_no === mixRow.lot_no);
              if (!lot || !lot.variety) continue;

              const varietyInfo = varietyMap[lot.variety];
              if (!varietyInfo) continue;

              const issueBale = Number(mixRow.issue_bale) || 0;
              totalWeightedSum += issueBale;

              const cottonName = varietyInfo.cotton_name;
              cottonContributions[cottonName] = (cottonContributions[cottonName] || 0) + issueBale * varietyInfo.weight;
            }

            if (totalWeightedSum > 0) {
              const normalizedContributions = Object.entries(cottonContributions)
                .map(([cottonName, value]) => ({
                  cottonName,
                  value,
                }))
                .sort((a, b) => b.value - a.value);

              const totalValue = normalizedContributions.reduce((sum, item) => sum + item.value, 0);

              const contributionStrings = normalizedContributions
                .map(({ cottonName, value }) => {
                  const percentage = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : "0.0";
                  return `${cottonName} ${percentage}%`;
                })
                .slice(0, 3);

              weighted.blend_percent = contributionStrings.join(", ");

              const mixingNames = normalizedContributions.map(({ cottonName }) => cottonName).join("+");
              weighted.mixing = normalizeMixingSignature(mixingNames);
            }
          }
        }


        weighted._lotBalesMap = lotBalesMap;
        weighted._cottonSignature = weighted._cottonSignature ?? (parsedGroupKey ?? "__NO_GROUP__");
        weighted._versionNumber = versionNumber ?? null;
        weighted._mixingNumbers = mixingNumbers;

// Compute simple average bale/lot change% across mixing_no within this period,
        // but instrument the calculation so we can see day-wise values feeding the average.
        const mixingDailyAveragesBale = [];
        const mixingDailyAveragesLot = [];
       
          const getRawIssueDateForRow = (row) => {
          const lookupKey = `${row.unit ?? "__NO_UNIT__"}|${row.line ?? "__NO_LINE__"}|${row.mixing_no ?? "__NO_MIXING__"}|${row.cotton ?? "__NO_COTTON__"}`;
          return issueDateLookup[lookupKey] ?? null;
        };

        // build per-mixing aggregates (one entry per mixing_no)
        const mixMap = {};
        for (const r of group.rows) {
          const mn = r.mixing_no ?? "";
          if (!mn) continue;
          if (!mixMap[mn]) {
            mixMap[mn] = { mixing_no: mn, totalBales: 0, lotMap: {}, unit: r.unit, line: r.line, cotton: r.cotton, issueDate: getRawIssueDateForRow(r) };
          }
          const bales = Number(r.issue_bale || 0);
          mixMap[mn].totalBales += bales;
          if (r.lot_no) {
            mixMap[mn].lotMap[r.lot_no] = (mixMap[mn].lotMap[r.lot_no] || 0) + bales;
          }
        }

        // produce sorted list by issueDate (ascending)
        const mixingList = Object.values(mixMap)
          .map((m) => ({ ...m, issueTimestamp: m.issueDate ? new Date(m.issueDate).getTime() : null }))
          .sort((a, b) => {
            if (a.issueTimestamp !== b.issueTimestamp) {
              if (a.issueTimestamp === null) return 1;
              if (b.issueTimestamp === null) return -1;
              return a.issueTimestamp - b.issueTimestamp;
            }
            // tie-breaker: numeric mixing_no if possible
            const na = Number(a.mixing_no);
            const nb = Number(b.mixing_no);
            if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
            return String(a.mixing_no).localeCompare(String(b.mixing_no));
          });

        const baleChanges = [];
        const lotChanges = [];

        for (let i = 1; i < mixingList.length; i++) {
          const prev = mixingList[i - 1];
          const curr = mixingList[i];

          const previousTotalBales = Number(prev.totalBales || 0);
          // compute lot-level absolute difference sum
          const lotSet = new Set([...Object.keys(prev.lotMap || {}), ...Object.keys(curr.lotMap || {})]);
          let absoluteDifferenceSum = 0;
          lotSet.forEach((lotNo) => {
            const prevB = Number(prev.lotMap[lotNo] || 0);
            const currB = Number(curr.lotMap[lotNo] || 0);
            absoluteDifferenceSum += Math.abs(currB - prevB);
          });

// bale % (exact daily logic): absoluteDifferenceSum / previousTotalBales * 100
          // If previousTotalBales === 0 but previous mixing exists (had rows / lots),
          // treat zero-diff as 0% and non-zero diff as 100% (all new compared to zero).
          let balePct = null;
          const prevHasRows = prev && prev.lotMap && Object.keys(prev.lotMap).length > 0;
          if (previousTotalBales > 0) {
            balePct = (absoluteDifferenceSum / previousTotalBales) * 100;
            if (Number.isFinite(balePct)) baleChanges.push(balePct);
            else balePct = null;
          } else if (prevHasRows) {
            // previous mixing exists but total bales is zero — include in average
            if (absoluteDifferenceSum === 0) {
              balePct = 0;
              baleChanges.push(0);
            } else {
              // previous was zero and current has some difference -> treat as full change
              balePct = 100;
              baleChanges.push(100);
            }
          } else {
            // previous is effectively blank (no rows) — skip the comparison
            balePct = null;
          }


         // lot change: new + removed relative to previous mixing's lot count
          const prevLotCount = Object.keys(prev.lotMap || {}).length;
          let lotPct = null;
          if (prevLotCount > 0) {
            let newLots = 0;
            let removedLots = 0;
            lotSet.forEach((lotNo) => {
              const prevHas = Boolean(prev.lotMap && Object.prototype.hasOwnProperty.call(prev.lotMap, lotNo) && prev.lotMap[lotNo] > 0);
              const currHas = Boolean(curr.lotMap && Object.prototype.hasOwnProperty.call(curr.lotMap, lotNo) && curr.lotMap[lotNo] > 0);
              if (!prevHas && currHas) newLots += 1;
              if (prevHas && !currHas) removedLots += 1;
            });
            lotPct = ((newLots + removedLots) / prevLotCount) * 100;
            if (Number.isFinite(lotPct)) lotChanges.push(lotPct);
            else lotPct = null;
          } else if (prevHasRows && Object.keys(curr.lotMap || {}).length === 0) {
            // previous had rows but no lots (edge) -> treat as 0% change
            lotPct = 0;
            lotChanges.push(0);
          } else {
            // previous had no lot info -> skip
            lotPct = null;
          }

        }

        // compute simple average across mixings (include zeros already present in arrays)
        if (baleChanges.length > 0) {
          const avg = baleChanges.reduce((s, v) => s + v, 0) / baleChanges.length;
          weighted.bale_change_over_percent = +avg.toFixed(2);
        } else {
          weighted.bale_change_over_percent = null;
        }

        if (lotChanges.length > 0) {
          const avgL = lotChanges.reduce((s, v) => s + v, 0) / lotChanges.length;
          weighted.lot_change_over_percent = +avgL.toFixed(2);
        } else {
          weighted.lot_change_over_percent = null;
        }

        // expose debug details when enabled
          weighted.previous_mixing_no = null;

        summaryEntriesPeriod.push(weighted);
       }

      const continuityGroups = {};
      const groupStats = {};

      summaryEntriesPeriod.forEach((entry) => {
        const signature = `${entry.unit ?? "__NO_UNIT__"}|${entry.line ?? "__NO_LINE__"}|${entry._cottonSignature}`;
        const mixNos = Array.isArray(entry._mixingNumbers) ? entry._mixingNumbers : [];
        const maxMixNo = mixNos.length > 0 ? Math.max(...mixNos) : entry.mixing_end ?? entry.mixing_start;
        const issueTimestamp = entry.issue_date ? new Date(entry.issue_date).getTime() : null;

        if (!continuityGroups[signature]) {
          continuityGroups[signature] = [];
          groupStats[signature] = { lastVersion: null, lastTimestamp: null };
        }

        continuityGroups[signature].push({ entry, maxMixNo, issueTimestamp });
      });

      Object.entries(continuityGroups).forEach(([signature, records]) => {
        records.sort((a, b) => {
          if (a.issueTimestamp !== b.issueTimestamp) {
            if (a.issueTimestamp === null) return 1;
            if (b.issueTimestamp === null) return -1;
            return a.issueTimestamp - b.issueTimestamp;
          }

          const versionA = a.entry._versionNumber ?? Number.MAX_SAFE_INTEGER;
          const versionB = b.entry._versionNumber ?? Number.MAX_SAFE_INTEGER;
          if (versionA !== versionB) {
            return versionA - versionB;
          }

          const mixingSpanA = a.maxMixNo ?? Number.MAX_SAFE_INTEGER;
          const mixingSpanB = b.maxMixNo ?? Number.MAX_SAFE_INTEGER;
          if (mixingSpanA !== mixingSpanB) {
            return mixingSpanA - mixingSpanB;
          }

          return 0;
        });

        const stats = groupStats[signature];

        records.forEach(({ entry }, index) => {
          const hasSameGroup = stats.lastVersion !== null && stats.lastTimestamp !== null;

          if (index === 0 || !hasSameGroup) {
            // preserve any already-computed period-level daily-averaged values
            entry.bale_change_over_percent = entry.bale_change_over_percent ?? null;
            entry.lot_change_over_percent = entry.lot_change_over_percent ?? null;
            entry.previous_mixing_no = entry.previous_mixing_no ?? null;
          } else {
            // Only compute continuity-based overwrite if no period-level value exists
            if (entry.bale_change_over_percent == null && entry.lot_change_over_percent == null) {
              const previous = records[index - 1].entry;

              const previousLotMap = previous._lotBalesMap || {};
              const currentLotMap = entry._lotBalesMap || {};
              const lotSet = new Set([
                ...Object.keys(previousLotMap),
                ...Object.keys(currentLotMap),
              ]);

              let absoluteDifferenceSum = 0;
              let newLotCount = 0;
              let removedLotCount = 0;

              lotSet.forEach((lotNo) => {
                const prevBales = Number(previousLotMap[lotNo] || 0);
                const currentBales = Number(currentLotMap[lotNo] || 0);
                absoluteDifferenceSum += Math.abs(currentBales - prevBales);

                if (prevBales === 0 && currentBales > 0) newLotCount += 1;
                if (currentBales === 0 && prevBales > 0) removedLotCount += 1;
              });

              const previousTotalBales = Number(previous.total_bales) || 0;
              const previousLotCount = Number(previous.no_of_lots) || 0;

              entry.bale_change_over_percent =
                previousTotalBales > 0
                  ? parseFloat(((absoluteDifferenceSum / previousTotalBales) * 100).toFixed(2))
                  : null;

              entry.lot_change_over_percent =
                previousLotCount > 0
                  ? parseFloat((((newLotCount + removedLotCount) / previousLotCount) * 100).toFixed(2))
                  : null;

              entry.previous_mixing_no = previous.mixing_no;
            } else {
              // keep the already-computed period-level value and still set previous_mixing_no if missing
              const previous = records[index - 1].entry;
              entry.previous_mixing_no = entry.previous_mixing_no ?? previous.mixing_no;
            }
          }

          stats.lastVersion = entry._versionNumber;
          stats.lastTimestamp = entry.issue_date ? new Date(entry.issue_date).getTime() : null;
        });
      });

      const summary = summaryEntriesPeriod.map(
        ({
          _lotBalesMap,
          _cottonSignature,
          _versionNumber,
          _mixingNumbers,
          mixing_start,
          mixing_end,
          _issueSortValue,
          ...rest
        }) => rest
      );

      summary.sort((a, b) => {
        const keyA = a.issue_date_sort_key ?? a.issue_date;
        const keyB = b.issue_date_sort_key ?? b.issue_date;
        if (keyA === keyB) {
          return 0;
        }
        if (!keyA) {
          return 1;
        }
        if (!keyB) {
          return -1;
        }
        return keyB.localeCompare(keyA);
      });

      let filteredSummary = summary;
      if (mixingFilters.length > 0) {
        filteredSummary = summary.filter((row) => {
          if (!row.mixing) return false;
          const mixingNames = row.mixing.split("+");
          return mixingNames.some((name) => mixingFilters.includes(name));
        });
      }

      res.json(filteredSummary);
    } else {
      throw new Error("Invalid report_type. Must be 'daily', 'weekly', or 'monthly'");
    }
  } catch (err) {
    console.error("Error fetching summary:", err.message);
    res.status(500).json({ error: err.message });
  }
});




// -------------------------
// Filter options for summary
// -------------------------
app.get("/api/filter-options", async (req, res) => {
  try {
    const {
      from_date,
      to_date,
      mixing_from,
      mixing_to,
      unit: unitParam,
      line: lineParam,
      cotton: cottonParam,
      mixing: mixingParam,
    } = req.query;

    const selectedFilters = normalizeCottonMixingFilters({
      unit: unitParam,
      line: lineParam,
      cotton: cottonParam,
      mixing: mixingParam,
    });

    const numericMixingFilters = selectedFilters.mixing
      .map((value) => (value === undefined || value === null ? "" : `${value}`.trim()))
      .filter((value) => value !== "" && /^\d+$/.test(value));

    const shouldFilterMixingNumbers =
      numericMixingFilters.length > 0 && numericMixingFilters.length === selectedFilters.mixing.length;

    // Step 1: collect relevant mixing numbers from mixing_issue (issue_date lives here)
    let issueQuery = supabase
      .from("mixing_issue")
      .select("mixing_no, unit, line, cotton, issue_date");

    if (from_date) {
      issueQuery = issueQuery.gte("issue_date", from_date);
    }

    if (to_date) {
      issueQuery = issueQuery.lte("issue_date", to_date);
    }

    issueQuery = buildMixingRangeQuery(issueQuery, mixing_from, mixing_to);

    if (selectedFilters.unit.length > 0) {
      issueQuery = issueQuery.in("unit", selectedFilters.unit);
    }

    if (selectedFilters.line.length > 0) {
      issueQuery = issueQuery.in("line", selectedFilters.line);
    }

    if (selectedFilters.cotton.length > 0) {
      issueQuery = issueQuery.in("cotton", selectedFilters.cotton);
    }

    if (shouldFilterMixingNumbers) {
      issueQuery = issueQuery.in("mixing_no", numericMixingFilters);
    }

    const { data: issueRows, error: issueError } = await issueQuery;
    if (issueError) throw issueError;

    if (!issueRows || issueRows.length === 0) {
      res.json(createEmptyMixingFilterOptions());
      return;
    }

    const mixingNumbers = Array.from(
      new Set(
        issueRows
          .map((row) => (row?.mixing_no === undefined || row?.mixing_no === null ? "" : `${row.mixing_no}`.trim()))
          .filter((value) => value !== "")
      )
    );

    if (mixingNumbers.length === 0) {
      res.json(createEmptyMixingFilterOptions());
      return;
    }

    // Step 2: load matching rows from mixing_chart for those mixing numbers
    let mixingQuery = supabase
      .from("mixing_chart")
      .select("mixing_no, lot_no, unit, line, cotton, issue_bale")
      .in("mixing_no", mixingNumbers);

    mixingQuery = buildMixingRangeQuery(mixingQuery, mixing_from, mixing_to);

    if (selectedFilters.unit.length > 0) {
      mixingQuery = mixingQuery.in("unit", selectedFilters.unit);
    }

    if (selectedFilters.line.length > 0) {
      mixingQuery = mixingQuery.in("line", selectedFilters.line);
    }

    if (selectedFilters.cotton.length > 0) {
      mixingQuery = mixingQuery.in("cotton", selectedFilters.cotton);
    }

    if (selectedFilters.mixing.length > 0) {
      mixingQuery = mixingQuery.in("mixing_no", selectedFilters.mixing);
    }

    const { data: chartRows, error: chartError } = await mixingQuery;
    if (chartError) throw chartError;

    const combinedRows = [...issueRows, ...(chartRows || [])];

    if (!combinedRows || combinedRows.length === 0) {
      res.json(createEmptyMixingFilterOptions());
      return;
    }

    const unitOptions = buildOptionListFromRows(combinedRows, "unit", selectedFilters.unit);
    const lineOptions = buildOptionListFromRows(combinedRows, "line", selectedFilters.line);
    const cottonOptions = buildOptionListFromRows(combinedRows, "cotton", selectedFilters.cotton);
    const mixingOptions = buildOptionListFromRows(issueRows, "mixing_no", selectedFilters.mixing);

    res.json({
      units: unitOptions,
      lines: lineOptions,
      cottons: cottonOptions,
      mixings: mixingOptions,
    });
  } catch (err) {
    console.error("Error fetching filter options:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/mixing-options", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("mixing_chart")
      .select("unit, line, cotton");

    if (error) {
      throw error;
    }

    const units = new Set();
    const lines = new Set();
    const cottons = new Set();

    (data || []).forEach((row) => {
      if (row?.unit !== undefined && row?.unit !== null && `${row.unit}`.trim() !== "") {
        units.add(`${row.unit}`.trim());
      }
      if (row?.line !== undefined && row?.line !== null && `${row.line}`.trim() !== "") {
        lines.add(`${row.line}`.trim());
      }
      if (row?.cotton !== undefined && row?.cotton !== null && `${row.cotton}`.trim() !== "") {
        cottons.add(`${row.cotton}`.trim());
      }
    });

    const sortedUnits = Array.from(units).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const sortedLines = Array.from(lines).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const sortedCottons = Array.from(cottons).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    res.json({
      units: sortedUnits,
      lines: sortedLines,
      cottons: sortedCottons,
    });
  } catch (err) {
    console.error("Error fetching mixing options:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/mixing-chart/delete", async (req, res) => {
  try {
    const { unit, line, cotton, mixing_from, mixing_to } = req.body;

    if (!unit || !line || !cotton) {
      return res.status(400).json({ error: "Unit, Line, and Cotton are required." });
    }

    if (mixing_from === undefined || mixing_to === undefined || mixing_from === null || mixing_to === null) {
      return res.status(400).json({ error: "Mixing number range is required." });
    }

    const fromNumber = Number(mixing_from);
    const toNumber = Number(mixing_to);

    if (!Number.isFinite(fromNumber) || !Number.isFinite(toNumber)) {
      return res.status(400).json({ error: "Mixing number range must be numeric." });
    }

    if (fromNumber > toNumber) {
      return res.status(400).json({ error: "Mixing number range is invalid." });
    }

    const { error: deleteError } = await supabase
      .from("mixing_chart")
      .delete()
      .eq("unit", unit)
      .eq("line", line)
      .eq("cotton", cotton)
      .gte("mixing_no", fromNumber)
      .lte("mixing_no", toNumber);

    if (deleteError) {
      throw deleteError;
    }

    res.json({ message: "Matching mixing chart entries deleted successfully." });
  } catch (err) {
    console.error("Error deleting mixing chart entries:", err.message);
    res.status(500).json({ error: err.message || "Failed to delete mixing chart entries." });
  }
});

app.get("/api/mixing-issues/missing", async (req, res) => {
  try {
    const { data: chartData, error: chartError } = await supabase
      .from("mixing_chart")
      .select("mixing_no, unit, line, cotton");
    if (chartError) throw chartError;

    const { data: issueData, error: issueError } = await supabase
      .from("mixing_issue")
      .select("mixing_no, cotton");
    if (issueError) throw issueError;

    const existingCombinations = new Set(
      (issueData || [])
        .map((item) => {
          const mixingNo = item?.mixing_no !== undefined && item?.mixing_no !== null ? String(item.mixing_no) : null;
          const cotton = item?.cotton !== undefined && item?.cotton !== null ? String(item.cotton) : null;
          return mixingNo && cotton ? `${mixingNo}|${cotton}` : null;
        })
        .filter(Boolean)
    );

    const uniqueMissing = new Map();
    (chartData || []).forEach((row) => {
      const mixingNo = row?.mixing_no !== undefined && row?.mixing_no !== null ? String(row.mixing_no) : null;
      const cotton = row?.cotton !== undefined && row?.cotton !== null ? String(row.cotton) : null;

      if (!mixingNo || !cotton) return;

      const combinationKey = `${mixingNo}|${cotton}`;

      if (existingCombinations.has(combinationKey)) return;

      if (!uniqueMissing.has(combinationKey)) {
        uniqueMissing.set(combinationKey, {
          mixing_no: row.mixing_no,
          unit: row.unit ?? "",
          line: row.line ?? "",
          cotton: row.cotton ?? "",
          issue_date: null,
        });
      }
    });

    const result = Array.from(uniqueMissing.values()).sort((a, b) => {
      const mixingCompare = String(a.mixing_no).localeCompare(String(b.mixing_no), undefined, { numeric: true, sensitivity: "base" });
      if (mixingCompare !== 0) return mixingCompare;
      return String(a.cotton).localeCompare(String(b.cotton), undefined, { sensitivity: "base" });
    });

    res.json(result);
  } catch (err) {
    console.error("Error fetching missing mixing issues:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/mixing-issues/template", async (req, res) => {
  try {
    const workbook = XLSX.utils.book_new();
    const columns = ["unit", "line", "mixing_no", "issue_date", "cotton"];
    const sampleRows = [
      {
        unit: "5",
        line: "1",
        mixing_no: "1",
        issue_date: "2024-01-31",
        cotton: "25_51_V1",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows, {
      header: columns,
      skipHeader: false,
    });

    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    for (let col = 0; col <= range.e.c; col += 1) {
      const headerCell = XLSX.utils.encode_cell({ r: 0, c: col });
      worksheet[headerCell].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "E9D5FF" } },
        alignment: { horizontal: "center" },
      };
      const columnLetter = XLSX.utils.encode_col(col);
      worksheet[`!cols`] = worksheet[`!cols`] || [];
      worksheet[`!cols`][col] = { wch: Math.max(columns[col].length + 2, 18) };
      const headerValue = columns[col];
      worksheet[headerCell].v = headerValue;
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, "Mixing_Issue_Template");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="mixing_issue_template.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err) {
    console.error("Error generating mixing issue template:", err.message);
    res.status(500).json({ error: err.message || "Unable to generate template." });
  }
});

app.post("/api/mixing-issues/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ error: "Uploaded file has no sheets." });
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Uploaded file is empty." });
    }

    const normalizeString = (value) => {
      if (value === undefined || value === null) return "";
      return `${value}`.trim();
    };

    const parseDate = (value) => {
      if (value === undefined || value === null || value === "") return null;

      if (typeof value === "number") {
        const utcDays = Math.floor(value - 25569);
        const utcValue = utcDays * 86400 * 1000;
        return new Date(utcValue).toISOString().split("T")[0];
      }

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }

      return parsed.toISOString().split("T")[0];
    };

    const preparedRows = [];
    const validationErrors = [];

    rows.forEach((row, index) => {
      const unit = normalizeString(row.unit);
      const line = normalizeString(row.line);
      const mixing_no = normalizeString(row.mixing_no);
      const cotton = normalizeString(row.cotton);
      const issue_date = parseDate(row.issue_date);

      if (!mixing_no || !cotton) {
        validationErrors.push(`Row ${index + 2}: "mixing_no" and "cotton" are required.`);
        return;
      }

      if (!issue_date) {
        validationErrors.push(`Row ${index + 2}: "issue_date" is required and must be a valid date.`);
        return;
      }

      preparedRows.push({
        mixing_no,
        cotton,
        issue_date,
        unit: unit || null,
        line: line || null,
      });
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Validation failed.",
        details: validationErrors,
      });
    }

    for (const entry of preparedRows) {
      const { error: deleteError } = await supabase
        .from("mixing_issue")
        .delete()
        .eq("mixing_no", entry.mixing_no)
        .eq("cotton", entry.cotton);

      if (deleteError) {
        console.error("Error deleting existing mixing issue entry:", deleteError.message);
        return res.status(500).json({ error: deleteError.message || "Failed to replace existing entries." });
      }
    }

    const { error: insertError } = await supabase.from("mixing_issue").insert(preparedRows);

    if (insertError) {
      console.error("Error inserting mixing issue entries:", insertError.message);
      return res.status(500).json({ error: insertError.message || "Failed to insert entries." });
    }

    res.json({
      success: true,
      message: "Mixing issue data uploaded successfully.",
      inserted: preparedRows.length,
    });
  } catch (err) {
    console.error("Error processing mixing issue upload:", err.message);
    res.status(500).json({ error: err.message || "Failed to process uploaded file." });
  }
});

app.post("/api/mixing-issues", async (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

    const payload = entries
      .filter((entry) => entry?.mixing_no && entry?.cotton && entry.issue_date)
      .map((entry) => ({
        mixing_no: entry.mixing_no,
        unit: entry.unit ?? null,
        line: entry.line ?? null,
        cotton: entry.cotton ?? null,
        issue_date: entry.issue_date,
      }));

    if (payload.length === 0) {
      return res.status(400).json({ error: "No valid entries to save." });
    }

    // Delete existing entries for each mixing_no + cotton combination
    for (const entry of payload) {
      const { error: deleteError } = await supabase
        .from("mixing_issue")
        .delete()
        .eq("mixing_no", entry.mixing_no)
        .eq("cotton", entry.cotton);

      if (deleteError) throw deleteError;
    }

    // Insert new entries
    const { error: insertError } = await supabase.from("mixing_issue").insert(payload);

    if (insertError) throw insertError;

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving mixing issues:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/mixing-issues/filters", async (req, res) => {
  try {
    const { data, error } = await supabase.from("mixing_issue").select("unit, line");

    if (error) {
      throw error;
    }

    const buildOptions = (key) =>
      buildSortedOptionList((data || []).map((row) => row?.[key] ?? null));

    res.json({
      units: buildOptions("unit"),
      lines: buildOptions("line"),
    });
  } catch (err) {
    console.error("Error fetching mixing issue filters:", err.message);
    res.status(500).json({ error: err.message || "Unable to fetch filters." });
  }
});

app.get("/api/mixing-issues", async (req, res) => {
  try {
    const { unit, line, cotton, mixing_no_from, mixing_no_to } = req.query;

    const query = supabase
      .from("mixing_issue")
      .select("id, unit, line, cotton, mixing_no, issue_date")
      .order("mixing_no", { ascending: true })
      .order("id", { ascending: true });

    const units = parseCottonMixingFilterArray(unit);
    const lines = parseCottonMixingFilterArray(line);
    const cottonValues = parseCottonMixingFilterArray(cotton);

    if (units.length > 0) {
      query.in("unit", units);
    }

    if (lines.length > 0) {
      query.in("line", lines);
    }

    if (cottonValues.length > 0) {
      query.in("cotton", cottonValues);
    }

    const mixingNoFrom = mixing_no_from === undefined ? null : Number(mixing_no_from);
    const mixingNoTo = mixing_no_to === undefined ? null : Number(mixing_no_to);

    if (!Number.isNaN(mixingNoFrom) && mixingNoFrom !== null) {
      query.gte("mixing_no", mixingNoFrom);
    }

    if (!Number.isNaN(mixingNoTo) && mixingNoTo !== null) {
      query.lte("mixing_no", mixingNoTo);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const normalizeRecord = (record) => {
      if (!record) return record;
      const normalizeValue = (value) => {
        if (value === undefined || value === null) {
          return null;
        }
        if (typeof value === "number") {
          return Number.isFinite(value) ? value : null;
        }
        const trimmed = String(value).trim();
        if (!trimmed) {
          return null;
        }
        const numeric = Number(trimmed);
        return Number.isFinite(numeric) ? numeric : trimmed;
      };

      return {
        ...record,
        unit: normalizeValue(record.unit),
        line: normalizeValue(record.line),
        cotton: normalizeValue(record.cotton),
      };
    };

    const normalizedData = Array.isArray(data) ? data.map((item) => normalizeRecord(item)) : [];

    res.json(normalizedData);
  } catch (err) {
    console.error("Error fetching mixing issues:", err.message);
    res.status(500).json({ error: err.message || "Unable to fetch mixing issues." });
  }
});

app.patch("/api/mixing-issues/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const issueDate = req.body?.issue_date;
    const cottonValue = req.body?.cotton;

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "A valid record id is required." });
    }

    if (!issueDate) {
      return res.status(400).json({ error: "issue_date is required." });
    }

    const updatedFields = { issue_date: issueDate };

    if (cottonValue !== undefined) {
      const trimmedCotton = typeof cottonValue === "string" ? cottonValue.trim() : cottonValue;
      updatedFields.cotton = trimmedCotton === "" ? null : trimmedCotton;
    }

    const { error } = await supabase
      .from("mixing_issue")
      .update(updatedFields)
      .eq("id", id);

    if (error) {
      throw error;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating mixing issue:", err.message);
    res.status(500).json({ error: err.message || "Unable to update record." });
  }
});

app.delete("/api/mixing-issues/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "A valid record id is required." });
    }

    const { error } = await supabase
      .from("mixing_issue")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting mixing issue:", err.message);
    res.status(500).json({ error: err.message || "Unable to delete record." });
  }
});

// -------------------------
// Lot result management
// -------------------------

app.get("/api/lot-results/lot-numbers", async (req, res) => {
  try {
    const searchTermRaw = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const searchTerm = searchTermRaw.replace(/%/g, "\\%").replace(/_/g, "\\_");

    let query = supabase
      .from("lot_results")
      .select("lot_no")
      .not("lot_no", "is", null);

    if (searchTerm) {
      const likePattern = `%${searchTerm}%`;
      query = query.ilike("lot_no", likePattern);
    }

    const { data, error } = await query.order("lot_no", { ascending: true }).limit(20);

    if (error) {
      throw error;
    }

    const lotNumbers = (data || [])
      .map((row) => (row?.lot_no === null || row?.lot_no === undefined ? null : `${row.lot_no}`.trim()))
      .filter((value) => value);

    res.json({ lot_numbers: Array.from(new Set(lotNumbers)) });
  } catch (err) {
    console.error("Error fetching lot numbers:", err.message);
    res.status(500).json({ error: err.message || "Unable to fetch lot numbers." });
  }
});

const LOT_RESULT_COLUMNS = [
  "lot_no",
  "lot_received_date",
  "variety",
  "cotton",
  "party_name",
  "station",
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
  "cotton_year",
  "remarks",
];

const sanitizeLotResultPayload = (payload = {}) => {
  return LOT_RESULT_COLUMNS.reduce((accumulator, column) => {
    if (Object.prototype.hasOwnProperty.call(payload, column)) {
      accumulator[column] = payload[column];
    }
    return accumulator;
  }, {});
};

app.get("/api/lot-results/lot/:lotNo", async (req, res) => {
  try {
    const lotNo = typeof req.params.lotNo === "string" ? req.params.lotNo.trim() : "";
    if (!lotNo) {
      return res.status(400).json({ error: "Lot number is required." });
    }

    const { data, error } = await supabase
      .from("lot_results")
      .select("*")
      .eq("lot_no", lotNo)
      .order("lot_received_date", { ascending: true });

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Lot not found." });
    }

    res.json({ records: data });
  } catch (err) {
    console.error("Error fetching lot result:", err.message);
    res.status(500).json({ error: err.message || "Unable to fetch lot result." });
  }
});

app.put("/api/lot-results/lot/:lotNo", async (req, res) => {
  try {
    const lotNoParam = typeof req.params.lotNo === "string" ? req.params.lotNo.trim() : "";
    if (!lotNoParam) {
      return res.status(400).json({ error: "Lot number is required." });
    }

    const updatePayload = sanitizeLotResultPayload(req.body || {});
    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: "No valid fields provided to update." });
    }

    if (!updatePayload.lot_no) {
      updatePayload.lot_no = lotNoParam;
    }

    if (`${updatePayload.lot_no}`.trim() !== lotNoParam) {
      return res.status(400).json({ error: "lot_no in payload must match path parameter and cannot be empty." });
    }

    const { error } = await supabase
      .from("lot_results")
      .update({ ...updatePayload, lot_no: lotNoParam })
      .eq("lot_no", lotNoParam);

    if (error) {
      console.error(`Error updating lot result for ${lotNoParam}:`, error.message);
      return res.status(500).json({ error: error.message || "Failed to update lot result." });
    }

    res.json({ success: true, updated: [lotNoParam] });
  } catch (err) {
    console.error("Error updating lot result:", err.message);
    res.status(500).json({ error: err.message || "Unable to update lot result." });
  }
});

app.delete("/api/lot-results/lot/:lotNo", async (req, res) => {
  try {
    const lotNo = typeof req.params.lotNo === "string" ? req.params.lotNo.trim() : "";
    if (!lotNo) {
      return res.status(400).json({ error: "Lot number is required." });
    }

    const { error } = await supabase.from("lot_results").delete().eq("lot_no", lotNo);

    if (error) {
      throw error;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting lot result:", err.message);
    res.status(500).json({ error: err.message || "Unable to delete lot result." });
  }
});

// -------------------------
// Cotton mixing code management
// -------------------------
app.get("/api/mixing-code/varieties", async (req, res) => {
  try {
    const { data: varietyRows, error: varietyError } = await supabase.from("lot_results").select("variety");
    if (varietyError) throw varietyError;

    const uniqueVarieties = Array.from(
      new Set(
        (varietyRows || [])
          .map((row) => (typeof row?.variety === "string" ? row.variety.trim() : ""))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    if (uniqueVarieties.length === 0) {
      return res.json([]);
    }

    let mixingRows = [];
    if (uniqueVarieties.length > 0) {
      const { data: existingRows, error: mixingError } = await supabase
        .from("mixing_code")
        .select("variety, cotton_name, cotton_year, weight")
        .in("variety", uniqueVarieties);

      if (mixingError) throw mixingError;
      mixingRows = existingRows || [];
    }

    const mixingMap = new Map();
    mixingRows.forEach((row) => {
      const key = typeof row?.variety === "string" ? row.variety.trim() : "";
      if (!key) return;
      mixingMap.set(key, {
        cotton_name: typeof row?.cotton_name === "string" ? row.cotton_name : "",
        cotton_year: typeof row?.cotton_year === "string" ? row.cotton_year : row?.cotton_year ?? "",
        weight: row?.weight ?? "",
      });
    });

    const response = uniqueVarieties.map((variety) => {
      const existing = mixingMap.get(variety) || {};
      const weightValue = existing.weight;
      return {
        variety,
        cotton_name: existing.cotton_name ?? "",
        cotton_year:
          existing.cotton_year === null || existing.cotton_year === undefined || existing.cotton_year === ""
            ? ""
            : String(existing.cotton_year),
        weight:
          weightValue === null || weightValue === undefined || weightValue === ""
            ? ""
            : String(weightValue),
      };
    });

    res.json(response);
  } catch (err) {
    console.error("Error fetching mixing code varieties:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/mixing-code", async (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

    const sanitized = entries
      .map((entry) => {
        const variety = typeof entry?.variety === "string" ? entry.variety.trim() : "";
        const cottonName = typeof entry?.cotton_name === "string" ? entry.cotton_name.trim() : "";
        const cottonYear =
          entry?.cotton_year === null || entry?.cotton_year === undefined
            ? ""
            : String(entry.cotton_year).trim();
        const weightValue =
          entry?.weight === null || entry?.weight === undefined
            ? NaN
            : Number.parseFloat(entry.weight);

        return {
          variety,
          cotton_name: cottonName,
          cotton_year: cottonYear,
          weight: weightValue,
        };
      })
      .filter(
        (entry) =>
          entry.variety &&
          entry.cotton_name &&
          entry.cotton_year &&
          Number.isFinite(entry.weight)
      );

    if (sanitized.length === 0) {
      return res.status(400).json({ error: "No valid entries to save." });
    }

    const { error: upsertError } = await supabase
      .from("mixing_code")
      .upsert(
        sanitized.map((entry) => ({
          variety: entry.variety,
          cotton_name: entry.cotton_name,
          cotton_year: entry.cotton_year,
          weight: entry.weight,
        })),
        { onConflict: "variety" }
      );

    if (upsertError) throw upsertError;

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving mixing code entries:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------
// Pending lots (unique)
// -------------------------
app.get("/api/pending-lots", async (req, res) => {
  try {
    const { data: mixingData } = await supabase.from("mixing_chart").select("lot_no");
    const { data: lotData } = await supabase.from("lot_results").select("lot_no");

    const existingLots = new Set(lotData.map((l) => l.lot_no));
    const pendingSet = new Set();
    mixingData.forEach((m) => {
      if (!existingLots.has(m.lot_no)) pendingSet.add(m.lot_no);
    });

    const pending = Array.from(pendingSet).map((lot_no) => ({ lot_no }));
    res.json(pending);
  } catch (err) {
    console.error("Error fetching pending lots:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------
// Download sample template
// -------------------------
app.get("/api/pending-lots/template", async (req, res) => {
  try {
    const { data: mixingData } = await supabase.from("mixing_chart").select("lot_no");
    const { data: lotData } = await supabase.from("lot_results").select("lot_no");

    const existingLots = new Set(lotData.map((l) => l.lot_no));
    const pendingLots = Array.from(new Set(mixingData.map((m) => m.lot_no).filter(l => !existingLots.has(l))));

    const columns = [
      "lot_no",
      "variety",
      "station",
      "no_of_bale",
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
      "party_name",
      "lot_received_date",
      "min_mic_bale_per_lot"
      
    ];

    const sampleData = pendingLots.map(lot_no => {
      const row = {};
      columns.forEach(col => row[col] = col === "lot_no" ? lot_no : "");
      return row;
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(wb, ws, "Sample_Lot_Results");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="Sample_Lot_Results.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------
// Upload filled template
// -------------------------
app.post("/api/pending-lots/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const workbook = XLSX.read(file.buffer);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log("📘 Upload started. Total rows:", rows.length);

    function excelDateToJSDate(serial) {
      if (!serial) return null;
      // Excel stores date serials starting from Jan 1, 1900
      const utc_days = Math.floor(serial - 25569);
      const utc_value = utc_days * 86400; // seconds
      const date_info = new Date(utc_value * 1000);
      return date_info.toISOString().split("T")[0]; // return YYYY-MM-DD
    }

    const results = [];

    for (const row of rows) {
      const preparedRow = { ...row };
      Object.keys(preparedRow).forEach((k) => {
        if (preparedRow[k] === "") preparedRow[k] = null;
      });

      // 🧠 Convert Excel date serial to proper date string
      if (preparedRow.lot_received_date && !isNaN(preparedRow.lot_received_date)) {
        preparedRow.lot_received_date = excelDateToJSDate(preparedRow.lot_received_date);
      }

      const { error } = await supabase
        .from("lot_results")
        .upsert(preparedRow, { onConflict: ["lot_no"] });

      if (error) {
        console.error(`❌ Error inserting lot ${preparedRow.lot_no}:`, error.message);
        results.push({ lot_no: preparedRow.lot_no, status: "failed", error: error.message });
      } else {
        console.log(`✅ Inserted lot ${preparedRow.lot_no}`);
        results.push({ lot_no: preparedRow.lot_no, status: "success" });
      }
    }

    console.log("✅ Upload complete.");
    res.json({ message: "Upload complete", results });
  } catch (err) {
    console.error("🔥 Upload crash:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/wake', (req, res) => {
  res.json({ success: true, message: 'Backend is awake!' });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
