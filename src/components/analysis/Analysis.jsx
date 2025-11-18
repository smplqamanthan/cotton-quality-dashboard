import { useState } from "react";
import AnalysisChart from "./AnalysisChart.jsx";

import AnalysisComparison from "./AnalysisComparison.jsx";

const subTabs = [
  { id: "chart", label: "Chart" },
  { id: "comparison", label: "Comparison" },
];

function Analysis() {
  const [activeSubTab, setActiveSubTab] = useState("chart");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-6 py-2 rounded-full font-semibold transition-colors duration-200 ${
              activeSubTab === tab.id
                ? "bg-purple-800 text-white shadow-lg"
                : "bg-purple-200 text-purple-900 hover:bg-purple-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === "chart" && <AnalysisChart />}

      {activeSubTab === "comparison" && <AnalysisComparison />}
    </div>
  );
}

export default Analysis;