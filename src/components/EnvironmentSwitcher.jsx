import React, { useState } from 'react';
import { setApiEnvironment, getCurrentEnvironment } from '../utils/api';

const EnvironmentSwitcher = () => {
  const [currentEnv, setCurrentEnv] = useState(getCurrentEnvironment());

  const handleEnvironmentChange = (environment) => {
    setApiEnvironment(environment);
    setCurrentEnv(environment);
    // Reload the page to apply the new API URL
    window.location.reload();
  };

  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-sm font-medium text-gray-700">Environment:</span>
      <div className="flex gap-1">
        <button
          onClick={() => handleEnvironmentChange('local')}
          className={`px-3 py-1 text-xs font-medium rounded ${
            currentEnv === 'local'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Local
        </button>
        <button
          onClick={() => handleEnvironmentChange('render')}
          className={`px-3 py-1 text-xs font-medium rounded ${
            currentEnv === 'render'
              ? 'bg-green-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Direct
        </button>
      </div>
    </div>
  );
};

export default EnvironmentSwitcher;