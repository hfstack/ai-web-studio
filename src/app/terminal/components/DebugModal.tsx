'use client';

interface DebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectCommand: string;
  setProjectCommand: (command: string) => void;
  debugPort: string;
  setDebugPort: (port: string) => void;
  availableScripts: {key: string, command: string}[];
  onRunDebug: () => void;
}

export default function DebugModal({
  isOpen,
  onClose,
  projectCommand,
  setProjectCommand,
  debugPort,
  setDebugPort,
  availableScripts,
  onRunDebug
}: DebugModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Debug Configuration</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Command
            </label>
            <div className="relative">
              <select
                value={projectCommand}
                onChange={(e) => setProjectCommand(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-8 text-white"
              >
                <option value="">Select a command...</option>
                {availableScripts.map((script) => (
                  <option key={script.key} value={script.command}>
                    {script.key}: {script.command}
                  </option>
                ))}
                <option value="custom">Custom command...</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {(!availableScripts.some(script => script.command === projectCommand) || projectCommand === 'custom') && (
              <input
                type="text"
                value={projectCommand === 'custom' ? '' : projectCommand}
                onChange={(e) => setProjectCommand(e.target.value)}
                placeholder="Enter custom command..."
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 mt-2 text-white"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Port
            </label>
            <input
              type="number"
              value={debugPort}
              onChange={(e) => setDebugPort(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
              placeholder="Enter port number..."
            />
          </div>

          <div className="bg-gray-900 rounded p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-2">Preview</h3>
            <div className="text-sm text-gray-400">
              <p>Command: {projectCommand || 'No command selected'}</p>
              <p>Port: {debugPort || 'No port specified'}</p>
              {projectCommand && debugPort && (
                <p className="mt-2 text-blue-400">
                  Full command: {projectCommand} --port {debugPort}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white"
            >
              Cancel
            </button>
            <button
              onClick={onRunDebug}
              disabled={!projectCommand}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-white"
            >
              Run Debug
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}