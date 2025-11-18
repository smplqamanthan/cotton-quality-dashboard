import { useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import CottonResultsDashboard from "./CottonResultsDashboard";
import CottonResultsSummary from "./CottonResultsSummary";
import LotResult from "./LotResult";

const DAILY_COLUMNS = [
  { key: "lot_no", label: "Lot No" },
  { key: "lot_received_date", label: "Date" },
  { key: "variety", label: "Variety" },
  { key: "cotton", label: "Cotton" },
  { key: "party_name", label: "Party Name" },
  { key: "station", label: "Station" },
  { key: "no_of_bale", label: "No of Bales" },
  { key: "uhml", label: "UHML" },
  { key: "mic", label: "MIC" },
  { key: "str", label: "Str" },
  { key: "rd", label: "Rd" },
  { key: "plus_b", label: "+b" },
  { key: "sf", label: "SFI" },
  { key: "ui", label: "UI" },
  { key: "elong", label: "Elong" },
  { key: "trash", label: "Trash" },
  { key: "moist", label: "Moist (%)" },
  { key: "min_mic", label: "Min_MIC" },
];

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date)) return dateStr;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
};

function CottonResults() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [exportData, setExportData] = useState([]);
  const [exportColumns, setExportColumns] = useState(DAILY_COLUMNS);
  const [filtersSummary, setFiltersSummary] = useState("Filters: None (Report: Daily)");

  const exportToExcel = () => {
    const formattedData = exportData.map((row) => {
      const newRow = {};
      exportColumns.forEach((col) => {
        newRow[col.label] =
          col.key === "lot_received_date"
            ? formatDate(row[col.key])
            : row[col.key] ?? "-";
      });
      return newRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cotton Results");
    XLSX.writeFile(workbook, "Cotton_Results.xlsx");
  };

  const exportToPDF = () => {
    const doc = new jsPDF("l", "pt", "a4");
    const tableColumn = exportColumns.map((col) => col.label);
    const tableRows = exportData.map((row) =>
      exportColumns.map((col) =>
        col.key === "lot_received_date" ? formatDate(row[col.key]) : row[col.key] ?? "-"
      )
    );

    doc.text("Cotton Results Report", 40, 30);
    doc.text(filtersSummary, 40, 48);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 62,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [103, 58, 183] },
    });

    doc.save("Cotton_Results.pdf");
  };

  const handleExportContextChange = ({ columns, filtersSummary: summaryText }) => {
    if (columns) {
      setExportColumns(columns);
    }
    if (summaryText !== undefined) {
      setFiltersSummary(summaryText);
    }
  };

  return (
    <div className="w-full">
      <div className="flex gap-4 border-b border-gray-200 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("dashboard")}
          className={`px-4 py-2 font-semibold transition-colors border-b-2 ${
            activeTab === "dashboard"
              ? "text-purple-700 border-purple-700"
              : "text-gray-500 border-transparent hover:text-purple-600"
          }`}
        >
          Dashboard
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("summary")}
          className={`px-4 py-2 font-semibold transition-colors border-b-2 ${
            activeTab === "summary"
              ? "text-purple-700 border-purple-700"
              : "text-gray-500 border-transparent hover:text-purple-600"
          }`}
        >
          Results Summary
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("lot-result")}
          className={`px-4 py-2 font-semibold transition-colors border-b-2 ${
            activeTab === "lot-result"
              ? "text-purple-700 border-purple-700"
              : "text-gray-500 border-transparent hover:text-purple-600"
          }`}
        >
          Lot Result
        </button>
      </div>

      {activeTab === "dashboard" && <CottonResultsDashboard />}
      {activeTab === "summary" && (
        <CottonResultsSummary
          dailyColumns={DAILY_COLUMNS}
          formatDate={formatDate}
          setExportData={setExportData}
          onExportToExcel={exportToExcel}
          onExportToPDF={exportToPDF}
          onExportContextChange={handleExportContextChange}
        />
      )}
      {activeTab === "lot-result" && <LotResult />}
    </div>
  );
}

export default CottonResults;
