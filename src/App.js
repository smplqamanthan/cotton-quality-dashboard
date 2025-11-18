import React, { useState } from "react";
import CottonResults from "./components/CottonResults.jsx";
import Summary from "./components/Summary.jsx";
import Issue from "./components/Issue.jsx";
import Analysis from "./components/analysis/Analysis.jsx";
import EnvironmentSwitcher from "./components/EnvironmentSwitcher.jsx";

function App() {
  const [activeTab, setActiveTab] = useState("cotton");

  const tabs = [
    { id: "cotton", label: "Cotton Results" },
    { id: "issues", label: "Issue Update" },
    { id: "summary", label: "Summary Report" },
    { id: "analysis", label: "Analysis" },
  ];

  const goBack = () => {
    window.location.href = "https://sagar.smpl-qa-manthan.workers.dev/protected.html";
  };

  return (
    <div className="min-h-screen w-full p-2 bg-orange-100">
      {/* Dashboard title and Home button */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-4xl font-extrabold text-center text-red-600 flex-1">
          Cotton Quality Dashboard
        </h1>


      </div>

      {/* Environment Switcher */}
      <EnvironmentSwitcher />

      {/* Tabs */}
      <div className="flex justify-start gap-6 mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-8 py-3 font-semibold rounded-full text-white text-lg transition-transform duration-300
              ${
                activeTab === tab.id
                  ? "bg-purple-800 shadow-xl transform scale-105"
                  : "bg-purple-500 hover:bg-purple-600"
              }`}
          >
            {tab.label}
          </button>
        ))}

        <button
          onClick={goBack}
          className="px-4 py-2 bg-red-500 font-bold text-white rounded shadow hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-600"
        >
          ← Home
        </button>
      </div>

      {/* Tab content */}
      <div className="bg-white shadow-2xl rounded-xl p-8 min-h-[300px] w-full">
        {activeTab === "cotton" && <CottonResults />}
        {activeTab === "analysis" && <Analysis />}
        {activeTab === "issues" && <Issue />}
        {activeTab === "summary" && <Summary />}
      </div>
    </div>
  );
}

export default App;
